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
const JournalEntryService = require('./journalEntryService');

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
  let wasFullyPaid = false;
  let invoiceNumber = null;
  let invoiceId = null;

  const payment = await withTransaction(async (tx) => {
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

    // 6. Check for duplicate payments (same customer, amount, within last minute)
    const oneMinuteAgo = new Date(Date.now() - 60000);
    const duplicatePayment = await tx.payment.findFirst({
      where: {
        customerId: data.customerId,
        amount: amount,
        paymentDate: {
          gte: oneMinuteAgo
        },
        voidedAt: null,
        deletedAt: null
      }
    });

    if (duplicatePayment) {
      throw new ValidationError(
        'A payment with the same amount was recorded in the last minute. ' +
        'Please verify this is not a duplicate submission.'
      );
    }

    // 7. Generate payment number
    const paymentNumber = await generatePaymentNumber();

    // 7. Create the payment
    const createdPayment = await tx.payment.create({
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
    wasFullyPaid = newStatus === 'Paid' && invoice.status !== 'Paid';
    invoiceNumber = invoice.invoiceNumber;
    invoiceId = data.invoiceId;

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

    // CRITICAL FIX: Create journal entries for payment (DR: Cash, CR: A/R)
    try {
      await JournalEntryService.createCustomerPaymentEntries(tx, {
        id: createdPayment.id,
        paymentNumber,
        paymentDate: createdPayment.paymentDate,
        amount,
        method: data.method,
        customer: { name: customer.name },
        invoice: { invoiceNumber: invoice.invoiceNumber },
        invoiceId: data.invoiceId
      });
      logger.info(`Journal entries created for payment ${paymentNumber}`);
    } catch (error) {
      logger.error('Failed to create journal entries for payment', {
        paymentId: createdPayment.id,
        paymentNumber,
        error: error.message
      });
      // This is critical - if journal entry creation fails, rollback the transaction
      throw new ValidationError(
        `Failed to create journal entries for payment: ${error.message}`
      );
    }

    // 13. PROPORTIONAL COGS RECOGNITION: Calculate and record COGS based on payment amount
    // This ensures COGS is recognized proportionally even for partial payments
    // CRITICAL: COGS journal entry creation is MANDATORY - if it fails, entire transaction rolls back
    // Get invoice items with their purchase prices
    const invoiceItems = await tx.invoiceItem.findMany({
      where: { invoiceId: data.invoiceId },
      include: {
        item: {
          select: {
            id: true,
            serialNumber: true,
            purchasePrice: true
          }
        }
      }
    });

    // Calculate total COGS (sum of all item purchase prices)
    const totalInvoiceCOGS = invoiceItems.reduce((sum, invItem) => {
      const purchasePrice = invItem.item.purchasePrice || 0;
      return sum + parseFloat(purchasePrice);
    }, 0);

    if (totalInvoiceCOGS > 0) {
      // Calculate proportional COGS for this payment
      // Formula: COGS for payment = (Payment Amount / Invoice Total) × Total COGS
      const paymentPercentage = parseFloat(amount) / parseFloat(total);
      const proportionalCOGS = formatAmount(totalInvoiceCOGS * paymentPercentage);

      // Get current COGS on invoice (accumulated from previous payments)
      const currentInvoiceCOGS = parseFloat(invoice.cogs || 0);
      const newCumulativeCOGS = formatAmount(currentInvoiceCOGS + proportionalCOGS);

      // Update invoice with new cumulative COGS
      await tx.invoice.update({
        where: { id: data.invoiceId },
        data: { cogs: newCumulativeCOGS }
      });

      // Create COGS journal entries for this payment's proportional amount
      await JournalEntryService.createCOGSEntries(tx, {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        paymentNumber: paymentNumber // Include payment reference
      }, proportionalCOGS);

      logger.info(`Proportional COGS recorded for payment ${paymentNumber}`, {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        paymentAmount: formatAmount(amount),
        invoiceTotal: formatAmount(total),
        paymentPercentage: `${(paymentPercentage * 100).toFixed(2)}%`,
        totalInvoiceCOGS: formatAmount(totalInvoiceCOGS),
        proportionalCOGS: proportionalCOGS,
        previousCOGS: formatAmount(currentInvoiceCOGS),
        newCumulativeCOGS: newCumulativeCOGS,
        itemCount: invoiceItems.length
      });
    }

    logger.info(`Payment recorded: ${paymentNumber}`, {
      paymentId: createdPayment.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: amount,
      invoiceStatus: `${invoice.status} → ${newStatus}`
    });

    return createdPayment;
  });

  // 10. AFTER transaction commits, mark items as sold if invoice is fully paid
  if (wasFullyPaid) {
    try {
      const saleResult = await inventoryLifecycleService.markItemsAsSoldForInvoice(invoiceId, userId);
      logger.info(`Invoice ${invoiceNumber} fully paid - ${saleResult.saleCount} items marked as sold`);
    } catch (error) {
      // CRITICAL: Log detailed error information for operations team
      logger.error(`CRITICAL: Failed to mark items as sold for Invoice ${invoiceNumber}`, {
        errorMessage: error.message,
        errorStack: error.stack,
        invoiceId,
        invoiceNumber,
        paymentId: payment.id,
        paymentNumber: payment.paymentNumber,
        requiresManualIntervention: true,
        actionRequired: 'Operations team must manually update item inventory status to "Sold" for this invoice',
        timestamp: new Date().toISOString()
      });
      // NOTE: Don't fail the payment - payment has been recorded successfully
      // Items can be manually marked as sold later by operations team
      // TODO: Consider adding automated alert/notification system for operations team
    }
  }

  return payment;
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

    // CRITICAL FIX: Reverse inventory status if invoice is no longer fully paid
    // When invoice was "Paid" but is now not "Paid", items should go back from "Sold" to "Reserved"
    if (invoice.status === 'Paid' && newStatus !== 'Paid') {
      try {
        // Find all items that are currently "Sold" for this invoice
        const soldItems = await tx.item.findMany({
          where: {
            reservedForType: 'Invoice',
            reservedForId: payment.invoiceId,
            inventoryStatus: 'Sold',
            deletedAt: null
          }
        });

        if (soldItems.length > 0) {
          // Reverse items from "Sold" back to "Reserved"
          await Promise.all(
            soldItems.map(item =>
              tx.item.update({
                where: { id: item.id },
                data: {
                  inventoryStatus: 'Reserved',
                  status: 'Reserved', // Also update physical status
                  outboundDate: null
                }
              })
            )
          );

          // Create status history entries
          await Promise.all(
            soldItems.map(item =>
              tx.inventoryStatusHistory.create({
                data: {
                  itemId: item.id,
                  fromStatus: 'Sold',
                  toStatus: 'Reserved',
                  changeReason: 'PAYMENT_VOIDED',
                  referenceType: 'Payment',
                  referenceId: paymentId,
                  changedBy: userId,
                  notes: `Reversed due to payment ${payment.paymentNumber} void: ${reason}`
                }
              })
            )
          );

          logger.info(`Reversed ${soldItems.length} items from Sold to Reserved for Invoice ${invoice.invoiceNumber}`, {
            invoiceId: payment.invoiceId,
            paymentId,
            itemCount: soldItems.length
          });
        }
      } catch (error) {
        logger.error('Failed to reverse inventory status during payment void', {
          invoiceId: payment.invoiceId,
          paymentId,
          error: error.message
        });
        // This is critical - if reversal fails, rollback the transaction
        throw new ValidationError(
          `Failed to reverse inventory status: ${error.message}`
        );
      }
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

    // CRITICAL FIX: Reverse journal entries for voided payment
    try {
      await JournalEntryService.reverseCustomerPaymentEntries(tx, {
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        amount: payment.amount,
        customer: payment.customer,
        invoice: payment.invoice,
        invoiceId: payment.invoiceId
      }, reason);
      logger.info(`Journal entries reversed for voided payment ${payment.paymentNumber}`);
    } catch (error) {
      logger.error('Failed to reverse journal entries for voided payment', {
        paymentId,
        paymentNumber: payment.paymentNumber,
        error: error.message
      });
      // This is critical - if journal entry reversal fails, rollback the transaction
      throw new ValidationError(
        `Failed to reverse journal entries: ${error.message}`
      );
    }

    // 10. Reverse proportional COGS for voided payment
    try {
      // Get invoice items to calculate total COGS
      const invoiceItems = await tx.invoiceItem.findMany({
        where: { invoiceId: payment.invoiceId },
        include: {
          item: {
            select: {
              id: true,
              purchasePrice: true
            }
          }
        }
      });

      const totalInvoiceCOGS = invoiceItems.reduce((sum, invItem) => {
        return sum + parseFloat(invItem.item.purchasePrice || 0);
      }, 0);

      if (totalInvoiceCOGS > 0) {
        // Calculate proportional COGS that was recognized for this payment
        const paymentPercentage = parseFloat(payment.amount) / parseFloat(invoice.total);
        const cogsToReverse = formatAmount(totalInvoiceCOGS * paymentPercentage);

        // Reduce invoice COGS by the reversed amount
        const currentInvoiceCOGS = parseFloat(invoice.cogs || 0);
        const newCOGS = formatAmount(Math.max(0, currentInvoiceCOGS - cogsToReverse));

        await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: { cogs: newCOGS }
        });

        // Reverse COGS journal entries (CR: COGS, DR: Inventory)
        if (cogsToReverse > 0) {
          await JournalEntryService.reverseCOGSEntries(tx, {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            paymentNumber: payment.paymentNumber
          }, cogsToReverse);

          logger.info(`Proportional COGS reversed for voided payment ${payment.paymentNumber}`, {
            paymentAmount: formatAmount(payment.amount),
            cogsReversed: cogsToReverse,
            previousCOGS: formatAmount(currentInvoiceCOGS),
            newCOGS: newCOGS
          });
        }
      }
    } catch (error) {
      logger.error('Failed to reverse COGS for voided payment', {
        paymentId,
        paymentNumber: payment.paymentNumber,
        error: error.message
      });
      // Continue - COGS reversal failure is not critical enough to rollback payment void
      // Can be manually corrected later
    }

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
