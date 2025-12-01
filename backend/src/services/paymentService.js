/**
 * Vendor Payment Management Service
 *
 * Implements strict rules:
 * - Payments are immutable (created, never modified)
 * - SUM(payments) <= bill.total (enforced with locks)
 * - Payments update bill.paidAmount atomically
 * - Voiding instead of deletion
 */

const db = require('../config/database');
const logger = require('../config/logger');
const {
  withTransaction,
  lockForUpdate,
  ValidationError,
  ConcurrencyError,
  InsufficientBalanceError,
  compareAmounts,
  formatAmount
} = require('../utils/transactionWrapper');
const { generatePaymentNumber } = require('../utils/generateId');
const { updateBillStatus } = require('./billService');

/**
 * Record a vendor payment
 *
 * @param {Object} data - Payment data
 * @param {string} [data.billId] - Bill ID (optional - for general payments)
 * @param {string} data.vendorId - Vendor ID
 * @param {Date} data.paymentDate - Payment date
 * @param {number} data.amount - Payment amount
 * @param {string} data.method - Payment method (Cash, Bank Transfer, Cheque)
 * @param {string} data.reference - Payment reference
 * @param {string} data.notes - Notes
 * @param {string} userId - User recording the payment
 * @returns {Promise<Object>} Created payment
 */
async function recordPayment(data, userId) {
  return withTransaction(async (tx) => {
    // 1. Format and validate payment amount first (before any bill checks)
    const paymentAmount = formatAmount(data.amount);

    if (paymentAmount <= 0) {
      throw new ValidationError('Payment amount must be greater than zero');
    }

    // 2. Validate payment method
    const validMethods = ['Cash', 'Bank Transfer', 'Cheque'];
    if (!validMethods.includes(data.method)) {
      throw new ValidationError(
        `Invalid payment method. Must be one of: ${validMethods.join(', ')}`
      );
    }

    // 3. Verify vendor exists
    const vendor = await tx.vendor.findUnique({
      where: { id: data.vendorId, deletedAt: null }
    });

    if (!vendor) {
      throw new ValidationError('Vendor not found');
    }

    let bill = null;
    let po = null;
    let currentPaidAmount = 0;
    let newBillStatus = null;

    // 4. If billId is provided, validate and lock the bill
    if (data.billId) {
      // Lock the bill (critical for concurrency)
      bill = await lockForUpdate(tx, 'Bill', data.billId);

      // Validate bill can receive payment
      if (bill.cancelledAt) {
        throw new ValidationError('Cannot record payment for cancelled bill');
      }

      // Validate vendor matches
      if (bill.vendorId !== data.vendorId) {
        throw new ValidationError('Vendor must match bill vendor');
      }

      // Validate bill's PO is not cancelled
      po = await tx.purchaseOrder.findUnique({
        where: { id: bill.purchaseOrderId }
      });

      if (!po) {
        throw new ValidationError('Purchase Order not found');
      }

      if (po.status === 'Cancelled') {
        throw new ValidationError(
          'Cannot record payment for bill from cancelled Purchase Order'
        );
      }

      // Check remaining balance (SUM(payments) <= bill.total)
      currentPaidAmount = formatAmount(bill.paidAmount);
      const billTotal = formatAmount(bill.total);
      const remainingBalance = formatAmount(billTotal - currentPaidAmount);

      if (paymentAmount > remainingBalance + 0.01) { // Allow 1 cent tolerance
        throw new InsufficientBalanceError(
          `Payment amount (${paymentAmount}) exceeds remaining bill balance. ` +
          `Bill Total: ${billTotal}, Already Paid: ${currentPaidAmount}, Remaining: ${remainingBalance}`,
          remainingBalance,
          paymentAmount
        );
      }
    }

    // 5. Generate payment number
    const paymentNumber = await generatePaymentNumber('VPAY');

    // 6. Create the payment (immutable)
    const payment = await tx.vendorPayment.create({
      data: {
        paymentNumber,
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
        amount: paymentAmount,
        method: data.method,
        reference: data.reference || null,
        notes: data.notes || null,
        vendorId: data.vendorId,
        billId: data.billId || null,
        createdBy: userId
      },
      include: {
        vendor: true,
        bill: data.billId ? {
          include: {
            purchaseOrder: true
          }
        } : false
      }
    });

    // 7. If bill-specific payment, update bill paid amount and status
    if (data.billId && bill) {
      const newPaidAmount = formatAmount(currentPaidAmount + paymentAmount);

      await tx.bill.update({
        where: { id: data.billId },
        data: {
          paidAmount: newPaidAmount
        }
      });

      // Update bill status based on new paid amount
      newBillStatus = await updateBillStatus(tx, data.billId);
    }

    // 8. Create vendor ledger entry
    // Get current balance from ledger
    const latestLedger = await tx.vendorLedger.findFirst({
      where: { vendorId: data.vendorId },
      orderBy: { createdAt: 'desc' },
      select: { balance: true }
    });

    const currentVendorBalance = latestLedger?.balance || vendor?.openingBalance || 0;
    const newVendorBalance = formatAmount(formatAmount(currentVendorBalance) - paymentAmount);

    const ledgerDescription = data.billId && bill
      ? `Payment ${paymentNumber} for Bill ${bill.billNumber}`
      : `General Payment ${paymentNumber}`;

    await tx.vendorLedger.create({
      data: {
        vendorId: data.vendorId,
        entryDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
        description: ledgerDescription,
        debit: 0,
        credit: paymentAmount,
        balance: newVendorBalance,
        billId: data.billId || null
      }
    });

    // 10. Create audit trail (only if bill-specific payment)
    if (data.billId && bill && po) {
      await tx.pOBillAudit.create({
        data: {
          purchaseOrderId: bill.purchaseOrderId,
          action: 'PAYMENT_RECORDED',
          billId: data.billId,
          paymentId: payment.id,
          beforeState: {
            billStatus: bill.status,
            paidAmount: currentPaidAmount
          },
          afterState: {
            billStatus: newBillStatus,
            paidAmount: formatAmount(currentPaidAmount + paymentAmount),
            paymentAmount: paymentAmount
          },
          performedBy: userId,
          metadata: {
            paymentNumber,
            method: data.method,
            reference: data.reference
          }
        }
      });
    }

    logger.info(`Payment recorded: ${paymentNumber}`, {
      paymentId: payment.id,
      billNumber: bill?.billNumber || 'General Payment',
      amount: paymentAmount,
      billStatus: bill ? `${bill.status} → ${newBillStatus}` : 'N/A'
    });

    return payment;
  });
}

/**
 * Void a payment (not deletion, just mark as voided)
 *
 * @param {string} paymentId - Payment ID
 * @param {string} userId - User voiding the payment
 * @returns {Promise<Object>} Voided payment
 */
async function voidPayment(paymentId, userId) {
  return withTransaction(async (tx) => {
    // 1. Get the payment
    const payment = await tx.vendorPayment.findUnique({
      where: { id: paymentId, deletedAt: null },
      include: {
        bill: {
          include: {
            purchaseOrder: true
          }
        }
      }
    });

    if (!payment) {
      throw new ValidationError('Payment not found');
    }

    // 2. Validate payment can be voided
    if (payment.voidedAt) {
      throw new ValidationError('Payment is already voided');
    }

    let bill = null;
    let newBillStatus = null;

    // 3. If payment is linked to a bill, lock and update it
    if (payment.billId) {
      bill = await lockForUpdate(tx, 'Bill', payment.billId);

      // Reverse bill paid amount
      const newPaidAmount = formatAmount(formatAmount(bill.paidAmount) - formatAmount(payment.amount));

      await tx.bill.update({
        where: { id: payment.billId },
        data: {
          paidAmount: newPaidAmount
        }
      });

      // Update bill status
      newBillStatus = await updateBillStatus(tx, payment.billId);
    }

    // 4. Void the payment (mark, don't delete)
    const voided = await tx.vendorPayment.update({
      where: { id: paymentId },
      data: {
        voidedAt: new Date(),
        voidedBy: userId
      },
      include: {
        vendor: true,
        bill: payment.billId ? true : false
      }
    });

    // 5. Get current balance from ledger
    const latestLedger = await tx.vendorLedger.findFirst({
      where: { vendorId: payment.vendorId },
      orderBy: { createdAt: 'desc' },
      select: { balance: true }
    });

    const vendor = await tx.vendor.findUnique({
      where: { id: payment.vendorId },
      select: { openingBalance: true }
    });

    const currentVendorBalance = latestLedger?.balance || vendor?.openingBalance || 0;
    const paymentAmountFormatted = formatAmount(payment.amount);
    const newVendorBalance = formatAmount(formatAmount(currentVendorBalance) + paymentAmountFormatted);

    // NOTE: currentBalance field removed - VendorLedger is the single source of truth

    // 6. Create reverse ledger entry
    const ledgerDescription = payment.billId && bill
      ? `Payment ${payment.paymentNumber} voided`
      : `General Payment ${payment.paymentNumber} voided`;

    await tx.vendorLedger.create({
      data: {
        vendorId: payment.vendorId,
        entryDate: new Date(),
        description: ledgerDescription,
        debit: paymentAmountFormatted,
        credit: 0,
        balance: newVendorBalance,
        billId: payment.billId || null
      }
    });

    // 8. Create audit trail (only if bill-specific payment)
    if (payment.billId && bill) {
      await tx.pOBillAudit.create({
        data: {
          purchaseOrderId: bill.purchaseOrderId,
          action: 'PAYMENT_VOIDED',
          billId: payment.billId,
          paymentId: payment.id,
          beforeState: {
            billStatus: bill.status,
            paidAmount: formatAmount(bill.paidAmount)
          },
          afterState: {
            billStatus: newBillStatus,
            paidAmount: formatAmount(formatAmount(bill.paidAmount) - paymentAmountFormatted)
          },
          performedBy: userId,
          metadata: {
            voidedAmount: paymentAmountFormatted
          }
        }
      });
    }

    logger.info(`Payment voided: ${payment.paymentNumber}`, {
      paymentId,
      reversedAmount: paymentAmountFormatted,
      billNumber: bill?.billNumber || 'General Payment'
    });

    return voided;
  });
}

/**
 * Get payment details
 *
 * @param {string} paymentId - Payment ID
 * @returns {Promise<Object>} Payment
 */
async function getPayment(paymentId) {
  const payment = await db.prisma.vendorPayment.findUnique({
    where: { id: paymentId, deletedAt: null },
    include: {
      vendor: true,
      bill: {
        include: {
          purchaseOrder: true
        }
      },
      createdByUser: {
        select: {
          id: true,
          fullName: true,
          email: true
        }
      }
    }
  });

  if (!payment) {
    throw new ValidationError('Payment not found');
  }

  // Add computed fields
  payment.isVoided = !!payment.voidedAt;
  payment.canBeVoided = !payment.voidedAt;

  return payment;
}

/**
 * Get all payments for a bill
 *
 * @param {string} billId - Bill ID
 * @returns {Promise<Array>} Payments
 */
async function getPaymentsForBill(billId) {
  const payments = await db.prisma.vendorPayment.findMany({
    where: {
      billId,
      deletedAt: null
    },
    include: {
      vendor: true,
      createdByUser: {
        select: {
          fullName: true
        }
      }
    },
    orderBy: {
      paymentDate: 'desc'
    }
  });

  return payments.map(p => ({
    ...p,
    isVoided: !!p.voidedAt,
    effectiveAmount: p.voidedAt ? 0 : formatAmount(p.amount)
  }));
}

/**
 * Get all vendor payments with filters
 *
 * @param {Object} filters - Query filters
 * @param {string} filters.vendorId - Filter by vendor
 * @param {string} filters.billId - Filter by bill
 * @returns {Promise<Array>} Payments
 */
async function getVendorPayments(filters = {}) {
  const where = { deletedAt: null };

  if (filters.vendorId) {
    where.vendorId = filters.vendorId;
  }

  if (filters.billId) {
    where.billId = filters.billId;
  }

  const payments = await db.prisma.vendorPayment.findMany({
    where,
    include: {
      vendor: true,
      bill: true,
      createdByUser: {
        select: {
          fullName: true
        }
      }
    },
    orderBy: { paymentDate: 'desc' }
  });

  return payments.map(p => ({
    ...p,
    isVoided: !!p.voidedAt,
    effectiveAmount: p.voidedAt ? 0 : formatAmount(p.amount)
  }));
}

/**
 * Alias for getPaymentsForBill
 */
async function getBillPayments(billId) {
  return getPaymentsForBill(billId);
}

module.exports = {
  recordPayment,
  voidPayment,
  getPayment,
  getPaymentsForBill,
  getBillPayments,
  getVendorPayments
};
