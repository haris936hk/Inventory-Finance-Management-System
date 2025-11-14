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
  formatAmount,
  Decimal
} = require('../utils/transactionWrapper');
const { generatePaymentNumber } = require('../utils/generateId');
const { updateBillStatus } = require('./billService');
const JournalEntryService = require('./journalEntryService');

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

    // 7. FIXED: Improved duplicate payment detection (5-min window, bill+vendor+method check)
    const fiveMinutesAgo = new Date(Date.now() - 300000); // 5 minutes
    const amountDec = new Decimal(paymentAmount);
    const lowerBound = amountDec.minus(0.50).toNumber(); // 50 cents below
    const upperBound = amountDec.plus(0.50).toNumber(); // 50 cents above

    const duplicatePayment = await tx.vendorPayment.findFirst({
      where: {
        vendorId: data.vendorId,
        billId: data.billId,      // FIXED: Check same bill
        method: data.method,       // FIXED: Check same payment method
        amount: {
          gte: lowerBound,         // FIXED: Near-amount matching
          lte: upperBound
        },
        paymentDate: {
          gte: fiveMinutesAgo      // FIXED: 5-minute window
        },
        voidedAt: null,
        deletedAt: null
      }
    });

    if (duplicatePayment) {
      throw new ValidationError(
        `A similar payment was recorded recently (${duplicatePayment.paymentNumber}). ` +
        `Amount: ${duplicatePayment.amount}, Method: ${duplicatePayment.method}, ` +
        `Time: ${duplicatePayment.paymentDate.toISOString()}. ` +
        `If this is a new payment, please wait 5 minutes or use a different payment method.`
      );
    }

    // 8. Generate payment number
    const paymentNumber = await generatePaymentNumber('VPAY');

    // 8. Create the payment (immutable)
    const payment = await tx.vendorPayment.create({
      data: {
        paymentNumber,
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
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

    // 11. Get vendor balance BEFORE update to calculate new balance
    const vendor = await tx.vendor.findUnique({
      where: { id: data.vendorId }
    });

    // 12. Calculate new vendor balance (decrease payable)
    const newVendorBalance = formatAmount(
      new Decimal(vendor.currentBalance || 0).minus(new Decimal(paymentAmount)).toNumber()
    );

    // 13. Update vendor balance
    await tx.vendor.update({
      where: { id: data.vendorId },
      data: {
        currentBalance: newVendorBalance
      }
    });

    // 14. Create vendor ledger entry with CALCULATED balance
    await tx.vendorLedger.create({
      data: {
        vendorId: data.vendorId,
        entryDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
        description: `Payment ${paymentNumber} for Bill ${bill.billNumber}`,
        debit: 0,
        credit: paymentAmount,
        balance: newVendorBalance,
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

    // CRITICAL FIX: Create journal entries for vendor payment (DR: A/P, CR: Cash)
    try {
      await JournalEntryService.createVendorPaymentEntries(tx, {
        id: payment.id,
        paymentNumber,
        paymentDate: payment.paymentDate,
        amount: paymentAmount,
        method: data.method,
        vendor: { name: vendor.name },
        billId: data.billId
      });
      logger.info(`Journal entries created for vendor payment ${paymentNumber}`);
    } catch (error) {
      logger.error('Failed to create journal entries for vendor payment', {
        paymentId: payment.id,
        paymentNumber,
        error: error.message
      });
      // This is critical - if journal entry creation fails, rollback the transaction
      throw new ValidationError(
        `Failed to create journal entries for vendor payment: ${error.message}`
      );
    }

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
    const newPaidAmount = formatAmount(
      new Decimal(bill.paidAmount || 0).minus(new Decimal(payment.amount || 0)).toNumber()
    );

    await tx.bill.update({
      where: { id: payment.billId },
      data: {
        paidAmount: newPaidAmount
      }
    });

    // 6. Update bill status
    const newBillStatus = await updateBillStatus(tx, payment.billId);

    // 7. Get vendor balance BEFORE update to calculate new balance
    const vendor = await tx.vendor.findUnique({
      where: { id: payment.vendorId }
    });

    // 8. Calculate new vendor balance (increase payable - voiding payment means we owe again)
    const newVendorBalance = formatAmount(
      new Decimal(vendor.currentBalance || 0).plus(new Decimal(payment.amount || 0)).toNumber()
    );

    // 9. Reverse vendor balance
    await tx.vendor.update({
      where: { id: payment.vendorId },
      data: {
        currentBalance: newVendorBalance
      }
    });

    // 10. Create reverse ledger entry with CALCULATED balance
    await tx.vendorLedger.create({
      data: {
        vendorId: payment.vendorId,
        entryDate: new Date(),
        description: `Payment ${payment.paymentNumber} voided: ${reason}`,
        debit: new Decimal(payment.amount || 0).toNumber(),
        credit: 0,
        balance: newVendorBalance,
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
          paidAmount: new Decimal(bill.paidAmount || 0).toNumber()
        },
        afterState: {
          billStatus: newBillStatus,
          paidAmount: newPaidAmount
        },
        performedBy: userId,
        metadata: {
          reason,
          voidedAmount: new Decimal(payment.amount || 0).toNumber()
        }
      }
    });

    // CRITICAL FIX: Reverse journal entries for voided vendor payment
    try {
      await JournalEntryService.reverseVendorPaymentEntries(tx, {
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        amount: new Decimal(payment.amount || 0).toNumber(),
        vendor: voided.vendor,
        billId: payment.billId
      }, reason);
      logger.info(`Journal entries reversed for voided vendor payment ${payment.paymentNumber}`);
    } catch (error) {
      logger.error('Failed to reverse journal entries for voided vendor payment', {
        paymentId,
        paymentNumber: payment.paymentNumber,
        error: error.message
      });
      // This is critical - if journal entry reversal fails, rollback the transaction
      throw new ValidationError(
        `Failed to reverse journal entries: ${error.message}`
      );
    }

    logger.info(`Payment voided: ${payment.paymentNumber}`, {
      paymentId,
      reason,
      reversedAmount: new Decimal(payment.amount || 0).toNumber()
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
    effectiveAmount: p.voidedAt ? 0 : new Decimal(p.amount || 0).toNumber()
  }));
}

/**
 * Get all vendor payments with filters
 *
 * PERFORMANCE OPTIMIZATION: Added pagination and SQL aggregation
 *
 * @param {Object} filters - Query filters
 * @param {string} filters.vendorId - Filter by vendor
 * @param {string} filters.billId - Filter by bill
 * @param {number} filters.page - Page number (default: 1)
 * @param {number} filters.limit - Items per page (default: 50)
 * @returns {Promise<Object>} Paginated payments with statistics
 */
async function getVendorPayments(filters = {}) {
  const where = { deletedAt: null };

  if (filters.vendorId) {
    where.vendorId = filters.vendorId;
  }

  if (filters.billId) {
    where.billId = filters.billId;
  }

  // PERFORMANCE OPTIMIZATION: Add pagination
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 50;
  const skip = (page - 1) * limit;

  // PERFORMANCE OPTIMIZATION: Parallel queries for data + count + statistics
  const [payments, totalCount, statistics] = await Promise.all([
    // Get paginated vendor payments with selective field loading
    db.prisma.vendorPayment.findMany({
      where,
      select: {
        id: true,
        paymentNumber: true,
        paymentDate: true,
        amount: true,
        method: true,
        reference: true,
        notes: true,
        voidedAt: true,
        voidReason: true,
        createdAt: true,
        vendor: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true
          }
        },
        bill: {
          select: {
            id: true,
            billNumber: true,
            total: true,
            status: true
          }
        },
        createdByUser: {
          select: {
            id: true,
            fullName: true
          }
        }
      },
      orderBy: { paymentDate: 'desc' },
      skip,
      take: limit
    }),

    // Get total count for pagination
    db.prisma.vendorPayment.count({ where }),

    // Get statistics using SQL aggregation
    db.prisma.vendorPayment.aggregate({
      where,
      _sum: {
        amount: true
      },
      _count: true
    })
  ]);

  // Add computed fields
  const paymentsWithFields = payments.map(p => ({
    ...p,
    isVoided: !!p.voidedAt,
    effectiveAmount: p.voidedAt ? 0 : new Decimal(p.amount || 0).toNumber()
  }));

  // Calculate effective total (excluding voided payments)
  const effectiveTotal = paymentsWithFields.reduce((sum, p) => sum + p.effectiveAmount, 0);

  return {
    payments: paymentsWithFields,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit)
    },
    statistics: {
      totalPayments: statistics._count,
      totalAmount: new Decimal(statistics._sum.amount || 0).toNumber(),
      effectiveAmount: effectiveTotal
    }
  };
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
