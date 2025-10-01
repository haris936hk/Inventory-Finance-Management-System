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
 * @param {string} data.billId - Bill ID
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
    // 1. Lock the bill (critical for concurrency)
    const bill = await lockForUpdate(tx, 'Bill', data.billId);

    // 2. Validate bill can receive payment
    if (bill.cancelledAt) {
      throw new ValidationError('Cannot record payment for cancelled bill');
    }

    // 3. Validate vendor matches
    if (bill.vendorId !== data.vendorId) {
      throw new ValidationError('Vendor must match bill vendor');
    }

    // 4. Format and validate payment amount
    const paymentAmount = formatAmount(data.amount);

    if (paymentAmount <= 0) {
      throw new ValidationError('Payment amount must be greater than zero');
    }

    // 5. CRITICAL: Check remaining balance (SUM(payments) <= bill.total)
    const currentPaidAmount = formatAmount(bill.paidAmount);
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

    // 6. Validate payment method
    const validMethods = ['Cash', 'Bank Transfer', 'Cheque'];
    if (!validMethods.includes(data.method)) {
      throw new ValidationError(
        `Invalid payment method. Must be one of: ${validMethods.join(', ')}`
      );
    }

    // 7. Generate payment number
    const paymentNumber = await generatePaymentNumber('VPAY');

    // 8. Create the payment (immutable)
    const payment = await tx.vendorPayment.create({
      data: {
        paymentNumber,
        paymentDate: data.paymentDate || new Date(),
        amount: paymentAmount,
        method: data.method,
        reference: data.reference || null,
        notes: data.notes || null,
        vendorId: data.vendorId,
        billId: data.billId,
        createdBy: userId
      },
      include: {
        vendor: true,
        bill: {
          include: {
            purchaseOrder: true
          }
        }
      }
    });

    // 9. Update bill paid amount atomically
    const newPaidAmount = formatAmount(currentPaidAmount + paymentAmount);

    await tx.bill.update({
      where: { id: data.billId },
      data: {
        paidAmount: newPaidAmount
      }
    });

    // 10. Update bill status based on new paid amount
    const newBillStatus = await updateBillStatus(tx, data.billId);

    // 11. Update vendor balance (decrease payable)
    await tx.vendor.update({
      where: { id: data.vendorId },
      data: {
        currentBalance: {
          decrement: paymentAmount
        }
      }
    });

    // 12. Create vendor ledger entry
    const vendor = await tx.vendor.findUnique({
      where: { id: data.vendorId }
    });

    await tx.vendorLedger.create({
      data: {
        vendorId: data.vendorId,
        entryDate: data.paymentDate || new Date(),
        description: `Payment ${paymentNumber} for Bill ${bill.billNumber}`,
        debit: 0,
        credit: paymentAmount,
        balance: parseFloat(vendor.currentBalance),
        billId: data.billId
      }
    });

    // 13. Create audit trail
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
          paidAmount: newPaidAmount,
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

    logger.info(`Payment recorded: ${paymentNumber}`, {
      paymentId: payment.id,
      billNumber: bill.billNumber,
      amount: paymentAmount,
      billStatus: `${bill.status} → ${newBillStatus}`
    });

    return payment;
  });
}

/**
 * Void a payment (not deletion, just mark as voided)
 *
 * @param {string} paymentId - Payment ID
 * @param {string} reason - Void reason
 * @param {string} userId - User voiding the payment
 * @returns {Promise<Object>} Voided payment
 */
async function voidPayment(paymentId, reason, userId) {
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

    // 3. Lock the bill
    const bill = await lockForUpdate(tx, 'Bill', payment.billId);

    // 4. Void the payment (mark, don't delete)
    const voided = await tx.vendorPayment.update({
      where: { id: paymentId },
      data: {
        voidedAt: new Date(),
        voidReason: reason,
        voidedBy: userId
      },
      include: {
        vendor: true,
        bill: true
      }
    });

    // 5. Reverse bill paid amount
    const newPaidAmount = formatAmount(parseFloat(bill.paidAmount) - parseFloat(payment.amount));

    await tx.bill.update({
      where: { id: payment.billId },
      data: {
        paidAmount: newPaidAmount
      }
    });

    // 6. Update bill status
    const newBillStatus = await updateBillStatus(tx, payment.billId);

    // 7. Reverse vendor balance
    await tx.vendor.update({
      where: { id: payment.vendorId },
      data: {
        currentBalance: {
          increment: parseFloat(payment.amount)
        }
      }
    });

    // 8. Create reverse ledger entry
    const vendor = await tx.vendor.findUnique({
      where: { id: payment.vendorId }
    });

    await tx.vendorLedger.create({
      data: {
        vendorId: payment.vendorId,
        entryDate: new Date(),
        description: `Payment ${payment.paymentNumber} voided: ${reason}`,
        debit: parseFloat(payment.amount),
        credit: 0,
        balance: parseFloat(vendor.currentBalance),
        billId: payment.billId
      }
    });

    // 9. Create audit trail
    await tx.pOBillAudit.create({
      data: {
        purchaseOrderId: bill.purchaseOrderId,
        action: 'PAYMENT_VOIDED',
        billId: payment.billId,
        paymentId: payment.id,
        beforeState: {
          billStatus: bill.status,
          paidAmount: parseFloat(bill.paidAmount)
        },
        afterState: {
          billStatus: newBillStatus,
          paidAmount: newPaidAmount
        },
        performedBy: userId,
        metadata: {
          reason,
          voidedAmount: parseFloat(payment.amount)
        }
      }
    });

    logger.info(`Payment voided: ${payment.paymentNumber}`, {
      paymentId,
      reason,
      reversedAmount: parseFloat(payment.amount)
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
    effectiveAmount: p.voidedAt ? 0 : parseFloat(p.amount)
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
    effectiveAmount: p.voidedAt ? 0 : parseFloat(p.amount)
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
