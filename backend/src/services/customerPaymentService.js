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

/**
 * Record a customer payment against an invoice
 *
 * @param {Object} data - Payment data
 * @param {string} data.customerId - Customer ID
 * @param {string} data.invoiceId - Invoice ID
 * @param {number} data.amount - Payment amount
 * @param {string} data.method - Payment method
 * @param {Date} data.paymentDate - Payment date
 * @param {string} data.reference - Payment reference
 * @param {string} data.notes - Payment notes
 * @param {string} userId - User recording the payment
 * @returns {Promise<Object>} Created payment
 */
async function recordPayment(data, userId) {
  return withTransaction(async (tx) => {
    // 1. Lock the invoice (critical for concurrency)
    const invoice = await lockForUpdate(tx, 'Invoice', data.invoiceId);

    // 2. Validate invoice status
    if (invoice.cancelledAt) {
      throw new ValidationError('Cannot record payment for cancelled invoice');
    }

    if (invoice.status === 'Cancelled') {
      throw new ValidationError('Cannot record payment for cancelled invoice');
    }

    // 3. Validate customer matches invoice
    if (invoice.customerId !== data.customerId) {
      throw new ValidationError('Customer must match invoice customer');
    }

    // 4. Format and validate amount
    const amount = formatAmount(data.amount);

    if (amount <= 0) {
      throw new ValidationError('Payment amount must be greater than zero');
    }

    // 5. CRITICAL: Check available balance (SUM(payments) <= invoice.total)
    const currentPaid = formatAmount(invoice.paidAmount);
    const newPaid = formatAmount(currentPaid + amount);
    const total = formatAmount(invoice.total);

    if (newPaid > total + 0.01) { // Allow 1 cent tolerance
      throw new InsufficientBalanceError(
        `Payment amount (${amount}) exceeds remaining invoice balance. ` +
        `Invoice Total: ${total}, Already Paid: ${currentPaid}, Remaining: ${total - currentPaid}`,
        total - currentPaid,
        amount
      );
    }

    // 6. Generate payment number
    const paymentNumber = await generatePaymentNumber();

    // 7. Create the payment
    const payment = await tx.payment.create({
      data: {
        paymentNumber,
        paymentDate: data.paymentDate || new Date(),
        amount,
        method: data.method,
        reference: data.reference || null,
        notes: data.notes || null,
        customerId: data.customerId,
        invoiceId: data.invoiceId,
        recordedById: userId
      },
      include: {
        customer: true,
        invoice: true
      }
    });

    // 8. Update invoice paid amount
    const updatedPaidAmount = formatAmount(invoice.paidAmount + amount);

    await tx.invoice.update({
      where: { id: data.invoiceId },
      data: {
        paidAmount: updatedPaidAmount
      }
    });

    // 9. Calculate and update invoice status
    const updatedInvoice = await tx.invoice.findUnique({
      where: { id: data.invoiceId }
    });

    const newStatus = calculateInvoiceStatus(updatedInvoice);

    if (newStatus !== invoice.status) {
      await tx.invoice.update({
        where: { id: data.invoiceId },
        data: { status: newStatus }
      });
    }

    // 10. Create customer ledger entry
    const customer = await tx.customer.findUnique({
      where: { id: data.customerId }
    });

    const newBalance = formatAmount(customer.currentBalance - amount);

    await tx.customerLedger.create({
      data: {
        customerId: data.customerId,
        entryDate: data.paymentDate || new Date(),
        description: `Payment ${paymentNumber} - ${data.method}`,
        debit: 0,
        credit: amount,
        balance: newBalance,
        invoiceId: data.invoiceId
      }
    });

    // 11. Update customer balance
    await tx.customer.update({
      where: { id: data.customerId },
      data: {
        currentBalance: newBalance
      }
    });

    // 12. Create audit trail
    await tx.invoicePaymentAudit.create({
      data: {
        invoiceId: data.invoiceId,
        action: 'PAYMENT_RECORDED',
        paymentId: payment.id,
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

    logger.info(`Payment recorded: ${paymentNumber}`, {
      paymentId: payment.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: amount,
      invoiceStatus: `${invoice.status} → ${newStatus}`
    });

    return payment;
  });
}

/**
 * Void a customer payment (immutable pattern)
 * Reverses all financial impacts
 *
 * @param {string} paymentId - Payment ID
 * @param {string} reason - Void reason
 * @param {string} userId - User performing void
 * @returns {Promise<Object>} Voided payment
 */
async function voidPayment(paymentId, reason, userId) {
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

    // 3. Lock the invoice
    const invoice = await lockForUpdate(tx, 'Invoice', payment.invoiceId);

    // 4. Void the payment (immutable - just mark as voided)
    const voided = await tx.payment.update({
      where: { id: paymentId },
      data: {
        voidedAt: new Date(),
        voidReason: reason,
        voidedBy: userId
      },
      include: {
        customer: true,
        invoice: true
      }
    });

    // 5. Reverse invoice paid amount
    const newPaidAmount = formatAmount(invoice.paidAmount - payment.amount);

    await tx.invoice.update({
      where: { id: payment.invoiceId },
      data: {
        paidAmount: newPaidAmount
      }
    });

    // 6. Recalculate invoice status
    const updatedInvoice = await tx.invoice.findUnique({
      where: { id: payment.invoiceId }
    });

    const newStatus = calculateInvoiceStatus(updatedInvoice);

    if (newStatus !== invoice.status) {
      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: newStatus }
      });
    }

    // 7. Reverse customer ledger entry
    const customer = await tx.customer.findUnique({
      where: { id: payment.customerId }
    });

    const newBalance = formatAmount(customer.currentBalance + payment.amount);

    await tx.customerLedger.create({
      data: {
        customerId: payment.customerId,
        entryDate: new Date(),
        description: `Payment ${payment.paymentNumber} voided: ${reason}`,
        debit: payment.amount,
        credit: 0,
        balance: newBalance,
        invoiceId: payment.invoiceId
      }
    });

    // 8. Update customer balance
    await tx.customer.update({
      where: { id: payment.customerId },
      data: {
        currentBalance: newBalance
      }
    });

    // 9. Create audit trail
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
          paidAmount: newPaidAmount,
          voidReason: reason
        },
        performedBy: userId,
        metadata: { reason }
      }
    });

    logger.info(`Payment voided: ${payment.paymentNumber}`, {
      paymentId,
      reason,
      amount: payment.amount,
      invoiceStatus: `${invoice.status} → ${newStatus}`
    });

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
