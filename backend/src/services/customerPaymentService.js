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
  formatAmount,
  multiplyAmounts,
  divideAmounts,
  subtractAmounts,
  Decimal
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

    // FIXED: Validate payment date (no future dates, reasonable minimum for data integrity)
    const paymentDate = data.paymentDate ? new Date(data.paymentDate) : new Date();
    const now = new Date();
    const minDate = new Date('1970-01-01'); // Unix epoch - allows historical data migration

    if (paymentDate > now) {
      throw new ValidationError('Payment date cannot be in the future');
    }

    if (paymentDate < minDate) {
      throw new ValidationError('Payment date cannot be before 1970-01-01 (invalid date)');
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

    // 6. FIXED: Improved duplicate payment detection (acts as idempotency check)
    // - Extended to 5-minute window (was 60 seconds)
    // - Check invoice + customer + method combination
    // - Allow near-amount matching (within 50 cents) to catch typos
    //
    // NOTE: For true idempotency, add 'idempotencyKey' field to Payment model:
    //   idempotencyKey String? @unique
    //   @@index([idempotencyKey])
    // Then check: WHERE idempotencyKey = data.idempotencyKey AND voidedAt IS NULL
    // This provides exact duplicate prevention for network retries
    const fiveMinutesAgo = new Date(Date.now() - 300000); // 5 minutes
    const amountDec = new Decimal(amount);
    const lowerBound = amountDec.minus(0.50).toNumber(); // 50 cents below
    const upperBound = amountDec.plus(0.50).toNumber(); // 50 cents above

    const duplicatePayment = await tx.payment.findFirst({
      where: {
        customerId: data.customerId,
        invoiceId: data.invoiceId, // FIXED: Check same invoice
        method: data.method,        // FIXED: Check same payment method
        amount: {
          gte: lowerBound,          // FIXED: Near-amount matching
          lte: upperBound
        },
        paymentDate: {
          gte: fiveMinutesAgo       // FIXED: 5-minute window
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

    // FIXED: Validate all items have purchase prices (critical for COGS calculation)
    const itemsWithoutPurchasePrice = invoiceItems.filter(invItem =>
      invItem.item.purchasePrice === null || invItem.item.purchasePrice === undefined
    );

    if (itemsWithoutPurchasePrice.length > 0) {
      const serialNumbers = itemsWithoutPurchasePrice.map(item => item.item.serialNumber).join(', ');
      throw new ValidationError(
        `Cannot record payment: ${itemsWithoutPurchasePrice.length} items are missing purchase prices. ` +
        `Items: ${serialNumbers}. Please update item purchase prices before recording payment.`
      );
    }

    // FIXED: Calculate total COGS using Decimal.js for precision
    const totalInvoiceCOGS = invoiceItems.reduce((sum, invItem) => {
      const purchasePrice = invItem.item.purchasePrice; // Now guaranteed to be non-null
      return sum.plus(new Decimal(purchasePrice));
    }, new Decimal(0));

    if (totalInvoiceCOGS.greaterThan(0)) {
      // FIXED: Calculate proportional COGS for this payment using Decimal
      // Formula: COGS for payment = (Payment Amount / Invoice Total) × Total COGS
      const paymentPercentage = divideAmounts(amount, total); // Returns precise division
      const proportionalCOGS = multiplyAmounts(totalInvoiceCOGS.toNumber(), paymentPercentage);

      // FIXED: Get current COGS on invoice using Decimal (accumulated from previous payments)
      const currentInvoiceCOGS = new Decimal(invoice.cogs || 0);
      const newCumulativeCOGS = formatAmount(
        currentInvoiceCOGS.plus(new Decimal(proportionalCOGS)).toNumber()
      );

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
        totalInvoiceCOGS: formatAmount(totalInvoiceCOGS.toNumber()),
        proportionalCOGS: proportionalCOGS,
        previousCOGS: formatAmount(currentInvoiceCOGS),
        newCumulativeCOGS: newCumulativeCOGS,
        itemCount: invoiceItems.length
      });
    } else {
      logger.warn(`No COGS to recognize for payment ${paymentNumber} - all items have zero purchase price`);
    }

    // 14. CRITICAL FIX: Mark items as sold INSIDE transaction if invoice is fully paid
    // This ensures atomic payment + inventory status update (no race condition)
    if (wasFullyPaid) {
      const saleResult = await inventoryLifecycleService.markItemsAsSoldForInvoice(invoiceId, userId, tx);
      logger.info(`Invoice ${invoiceNumber} fully paid - ${saleResult.saleCount} items marked as sold`);
    }

    logger.info(`Payment recorded: ${paymentNumber}`, {
      paymentId: createdPayment.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: amount,
      invoiceStatus: `${invoice.status} → ${newStatus}`
    });

    return createdPayment;
  });

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

    // 10. FIXED: Reverse proportional COGS for voided payment (CRITICAL - must succeed or rollback)
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

      // FIXED: Use Decimal.js for precision
      const totalInvoiceCOGS = invoiceItems.reduce((sum, invItem) => {
        return sum.plus(new Decimal(invItem.item.purchasePrice || 0));
      }, new Decimal(0));

      if (totalInvoiceCOGS.greaterThan(0)) {
        // FIXED: Calculate proportional COGS using Decimal
        const paymentPercentage = divideAmounts(payment.amount, invoice.total);
        const cogsToReverse = multiplyAmounts(totalInvoiceCOGS.toNumber(), paymentPercentage);

        // FIXED: Reduce invoice COGS by the reversed amount with validation
        const currentInvoiceCOGS = new Decimal(invoice.cogs || 0);
        const calculatedCOGS = currentInvoiceCOGS.minus(new Decimal(cogsToReverse));

        // FIXED: Validate COGS wouldn't go negative (indicates data corruption)
        if (calculatedCOGS.lessThan(-0.01)) {
          logger.error('COGS reversal would result in negative COGS - possible data corruption', {
            invoiceId: payment.invoiceId,
            invoiceNumber: invoice.invoiceNumber,
            paymentNumber: payment.paymentNumber,
            currentCOGS: currentInvoiceCOGS.toNumber(),
            reversing: cogsToReverse,
            calculated: calculatedCOGS.toNumber()
          });
          throw new ValidationError(
            `Cannot reverse COGS for payment ${payment.paymentNumber}: ` +
            `would result in negative invoice COGS (${calculatedCOGS.toFixed(4)}). ` +
            `Current: ${currentInvoiceCOGS.toFixed(4)}, Reversing: ${cogsToReverse.toFixed(4)}. ` +
            `This indicates data corruption - please contact support.`
          );
        }

        const newCOGS = formatAmount(Math.max(0, calculatedCOGS.toNumber()));

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
      // FIXED: This IS critical - rollback the entire void operation
      // Data integrity requires that payment void and COGS reversal happen atomically
      throw new ValidationError(
        `Failed to reverse COGS for voided payment: ${error.message}. ` +
        `Payment void has been rolled back to maintain data integrity. Please contact support.`
      );
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
