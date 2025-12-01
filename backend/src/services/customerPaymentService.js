/**
 * Customer Payment Management Service (Receivables)
 *
 * Implements strict rules:
 * - Payments are immutable (use void instead of delete)
 * - SUM(payments) <= invoice.total (enforced with locks)
 * - Payment void reverses all financial impacts
 * - Auto-updates invoice status based on payments
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
  addAmounts,
  formatAmount
} = require('../utils/transactionWrapper');
const { generatePaymentNumber } = require('../utils/generateId');
const { calculateInvoiceStatus } = require('./invoiceService');
const inventoryLifecycleService = require('./inventoryLifecycleService');

/**
 * Record a customer payment
 * Supports two modes:
 * 1. Invoice-linked payment: Updates specific invoice and customer balance
 * 2. General payment: Updates only customer balance (no invoice)
 *
 * @param {Object} data - Payment data
 * @param {string} data.customerId - Customer ID
 * @param {string} [data.invoiceId] - Invoice ID (optional for general payments)
 * @param {number} data.amount - Payment amount
 * @param {string} data.method - Payment method
 * @param {Date} data.paymentDate - Payment date
 * @param {string} data.reference - Payment reference
 * @param {string} data.notes - Payment notes
 * @param {string} userId - User recording the payment
 * @returns {Promise<Object>} Created payment
 */
async function recordPayment(data, userId) {
  let wasFullyPaid = false;
  let invoiceNumber = null;
  let invoiceId = null;
  let invoice = null;

  const payment = await withTransaction(async (tx) => {
    // 1. Validate amount first (before any other operations)
    const amount = formatAmount(data.amount);

    if (amount <= 0) {
      throw new ValidationError('Payment amount must be greater than zero');
    }

    // 2. If invoiceId provided, lock and validate invoice
    if (data.invoiceId) {
      // 2a. Lock the invoice (critical for concurrency)
      invoice = await lockForUpdate(tx, 'Invoice', data.invoiceId);

      // 2b. Validate invoice status
      if (invoice.cancelledAt) {
        throw new ValidationError('Cannot record payment for cancelled invoice');
      }

      if (invoice.status === 'Cancelled') {
        throw new ValidationError('Cannot record payment for cancelled invoice');
      }

      // 2c. Validate customer matches invoice
      if (invoice.customerId !== data.customerId) {
        throw new ValidationError('Customer must match invoice customer');
      }

      // 2d. CRITICAL: Check available balance (SUM(payments) <= invoice.total)
      // CRITICAL FIX: Prisma returns DECIMAL fields as strings - must parse first!
      const currentPaid = formatAmount(invoice.paidAmount);
      const total = formatAmount(invoice.total);
      const newPaid = formatAmount(currentPaid + amount);

      if (newPaid > total + 0.01) { // Allow 1 cent tolerance
        throw new InsufficientBalanceError(
          `Payment amount (${amount}) exceeds remaining invoice balance. ` +
          `Invoice Total: ${total}, Already Paid: ${currentPaid}, Remaining: ${total - currentPaid}`,
          total - currentPaid,
          amount
        );
      }
    } else {
      // 3. For general payments, just validate customer exists
      const customer = await tx.customer.findUnique({
        where: { id: data.customerId }
      });

      if (!customer) {
        throw new ValidationError('Customer not found');
      }

      if (customer.deletedAt) {
        throw new ValidationError('Cannot record payment for deleted customer');
      }
    }

    // 4. Generate payment number
    const paymentNumber = await generatePaymentNumber();

    // 5. Create the payment
    const createdPayment = await tx.payment.create({
      data: {
        paymentNumber,
        paymentDate: data.paymentDate || new Date(),
        amount,
        method: data.method,
        reference: data.reference || null,
        notes: data.notes || null,
        customerId: data.customerId,
        invoiceId: data.invoiceId || null, // Optional for general payments
        recordedById: userId
      },
      include: {
        customer: true,
        invoice: true
      }
    });

    // 6. If invoice-linked payment, update invoice
    let newStatus = null;
    if (data.invoiceId && invoice) {
      // 6a. Update invoice paid amount
      // CRITICAL FIX: Must parse invoice.paidAmount first to prevent string concatenation!
      // Without formatAmount, "5000" + 8860 = "50008860" (string concat) instead of 13860 (addition)
      const updatedPaidAmount = formatAmount(formatAmount(invoice.paidAmount) + amount);

      await tx.invoice.update({
        where: { id: data.invoiceId },
        data: {
          paidAmount: updatedPaidAmount
        }
      });

      // 6b. Calculate and update invoice status
      const updatedInvoice = await tx.invoice.findUnique({
        where: { id: data.invoiceId }
      });

      newStatus = calculateInvoiceStatus(updatedInvoice);
      wasFullyPaid = newStatus === 'Paid' && invoice.status !== 'Paid';
      invoiceNumber = invoice.invoiceNumber;
      invoiceId = data.invoiceId;

      if (newStatus !== invoice.status) {
        await tx.invoice.update({
          where: { id: data.invoiceId },
          data: { status: newStatus }
        });
      }
    }

    // 7. Create customer ledger entry
    // Get current balance from ledger
    const latestLedger = await tx.customerLedger.findFirst({
      where: { customerId: data.customerId },
      orderBy: { createdAt: 'desc' },
      select: { balance: true }
    });

    const customer = await tx.customer.findUnique({
      where: { id: data.customerId },
      select: { openingBalance: true }
    });

    const currentBalance = latestLedger?.balance || customer?.openingBalance || 0;
    const newBalance = formatAmount(formatAmount(currentBalance) - amount);

    // Description varies based on whether it's invoice-linked or general
    const description = data.invoiceId
      ? `Payment ${paymentNumber} - Invoice ${invoiceNumber} - ${data.method}`
      : `General Payment ${paymentNumber} - ${data.method}`;

    await tx.customerLedger.create({
      data: {
        customerId: data.customerId,
        entryDate: data.paymentDate || new Date(),
        description,
        debit: 0,
        credit: amount,
        balance: newBalance,
        invoiceId: data.invoiceId || null // Optional for general payments
      }
    });

    // NOTE: currentBalance field removed - CustomerLedger is the single source of truth

    // 9. If invoice fully paid, mark items as sold
    // CRITICAL FIX: Mark items as sold INSIDE transaction (not after)
    // This ensures atomicity: payment recorded = items marked as sold
    if (wasFullyPaid && invoiceId) {
      const saleResult = await inventoryLifecycleService.markItemsAsSoldForInvoice(invoiceId, userId, tx);
      logger.info(`Invoice ${invoiceNumber} fully paid - ${saleResult.saleCount} items marked as sold (within transaction)`);
    }

    // 10. Create audit trail (only for invoice-linked payments)
    if (data.invoiceId && invoice) {
      const updatedPaidAmount = formatAmount(formatAmount(invoice.paidAmount) + amount);

      await tx.invoicePaymentAudit.create({
        data: {
          invoiceId: data.invoiceId,
          action: 'PAYMENT_RECORDED',
          paymentId: createdPayment.id,
          beforeState: {
            invoiceStatus: invoice.status,
            paidAmount: invoice.paidAmount
          },
          afterState: {
            invoiceStatus: newStatus,
            paidAmount: updatedPaidAmount,
            paymentAmount: amount
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

    // 11. Logging
    if (data.invoiceId && invoice) {
      logger.info(`Payment recorded (invoice-linked): ${paymentNumber}`, {
        paymentId: createdPayment.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: amount,
        invoiceStatus: `${invoice.status} → ${newStatus}`
      });
    } else {
      logger.info(`Payment recorded (general): ${paymentNumber}`, {
        paymentId: createdPayment.id,
        customerId: data.customerId,
        amount: amount
      });
    }

    return createdPayment;
  });

  return payment;
}

/**
 * Void a customer payment (immutable pattern)
 * Reverses all financial impacts
 * Supports both invoice-linked and general payments
 *
 * @param {string} paymentId - Payment ID
 * @param {string} userId - User performing void
 * @returns {Promise<Object>} Voided payment
 */
async function voidPayment(paymentId, userId) {
  return withTransaction(async (tx) => {
    // 1. Get the payment (no lock needed, payments are immutable)
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: true,
        customer: true
      }
    });

    if (!payment) {
      throw new ValidationError('Payment not found');
    }

    // 2. Validate payment can be voided
    if (payment.voidedAt) {
      throw new ValidationError('Payment is already voided');
    }

    if (payment.deletedAt) {
      throw new ValidationError('Cannot void deleted payment');
    }

    // 3. If invoice-linked payment, lock the invoice
    let invoice = null;
    let newStatus = null;

    if (payment.invoiceId) {
      invoice = await lockForUpdate(tx, 'Invoice', payment.invoiceId);
    }

    // 4. Void the payment (immutable - just mark as voided)
    const voided = await tx.payment.update({
      where: { id: paymentId },
      data: {
        voidedAt: new Date(),
        voidedBy: userId
      },
      include: {
        customer: true,
        invoice: true
      }
    });

    // 5. If invoice-linked, reverse invoice paid amount
    if (payment.invoiceId && invoice) {
      // 5a. Reverse invoice paid amount
      // CRITICAL FIX: Must parse both amounts first to prevent string concatenation in subtraction!
      const currentPaid = formatAmount(invoice.paidAmount);
      const paymentAmount = formatAmount(payment.amount);
      const newPaidAmount = formatAmount(currentPaid - paymentAmount);

      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          paidAmount: newPaidAmount
        }
      });

      // 5b. Recalculate invoice status
      const updatedInvoice = await tx.invoice.findUnique({
        where: { id: payment.invoiceId }
      });

      newStatus = calculateInvoiceStatus(updatedInvoice);

      if (newStatus !== invoice.status) {
        await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: { status: newStatus }
        });
      }
    }

    // 6. Reverse customer ledger entry
    // Get current balance from ledger
    const latestLedger = await tx.customerLedger.findFirst({
      where: { customerId: payment.customerId },
      orderBy: { createdAt: 'desc' },
      select: { balance: true }
    });

    const customer = await tx.customer.findUnique({
      where: { id: payment.customerId },
      select: { openingBalance: true }
    });

    const currentBalance = latestLedger?.balance || customer?.openingBalance || 0;
    const newBalance = formatAmount(formatAmount(currentBalance) + payment.amount);

    // Description varies based on whether it's invoice-linked or general
    const description = payment.invoiceId
      ? `Payment ${payment.paymentNumber} voided (Invoice ${invoice?.invoiceNumber})`
      : `General Payment ${payment.paymentNumber} voided`;

    await tx.customerLedger.create({
      data: {
        customerId: payment.customerId,
        entryDate: new Date(),
        description,
        debit: payment.amount,
        credit: 0,
        balance: newBalance,
        invoiceId: payment.invoiceId || null
      }
    });

    // NOTE: currentBalance field removed - CustomerLedger is the single source of truth

    // 8. If invoice-linked and status changed, reverse items from Sold to Reserved
    // CRITICAL FIX: Reverse items from Sold to Reserved if invoice no longer fully paid
    // This prevents inventory from being permanently locked as "Sold"
    if (payment.invoiceId && invoice && newStatus !== 'Paid' && invoice.status === 'Paid') {
      const reversalResult = await inventoryLifecycleService.reverseItemsFromSoldToReserved(
        payment.invoiceId,
        userId,
        tx
      );
      logger.info(`Payment void: Reversed ${reversalResult.reversalCount} items from Sold to Reserved for Invoice ${invoice.invoiceNumber}`);
    }

    // 9. Create audit trail (only for invoice-linked payments)
    if (payment.invoiceId && invoice) {
      const newPaidAmount = formatAmount(formatAmount(invoice.paidAmount) - formatAmount(payment.amount));

      await tx.invoicePaymentAudit.create({
        data: {
          invoiceId: payment.invoiceId,
          action: 'PAYMENT_VOIDED',
          paymentId: payment.id,
          beforeState: {
            invoiceStatus: invoice.status,
            paidAmount: invoice.paidAmount
          },
          afterState: {
            invoiceStatus: newStatus,
            paidAmount: newPaidAmount
          },
          performedBy: userId,
          metadata: {}
        }
      });
    }

    // 10. Logging
    if (payment.invoiceId && invoice) {
      logger.info(`Payment voided (invoice-linked): ${payment.paymentNumber}`, {
        paymentId,
        amount: payment.amount,
        invoiceStatus: `${invoice.status} → ${newStatus}`
      });
    } else {
      logger.info(`Payment voided (general): ${payment.paymentNumber}`, {
        paymentId,
        amount: payment.amount,
        customerId: payment.customerId
      });
    }

    return voided;
  });
}

/**
 * Get payment with details
 *
 * @param {string} paymentId - Payment ID
 * @returns {Promise<Object>} Payment details
 */
async function getPayment(paymentId) {
  const payment = await db.prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      customer: true,
      invoice: true,
      recordedBy: {
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
  payment.canBeVoided = !payment.voidedAt && !payment.deletedAt;

  return payment;
}

module.exports = {
  recordPayment,
  voidPayment,
  getPayment
};
