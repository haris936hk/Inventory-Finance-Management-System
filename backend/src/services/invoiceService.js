/**
 * Invoice Lifecycle Management Service (Receivables)
 *
 * Implements strict lifecycle: Draft → Sent → Partial → Paid → Overdue → Cancelled
 * with proper concurrency controls and data integrity
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
const { generateInvoiceNumber } = require('../utils/generateId');

/**
 * Valid Invoice status transitions
 */
const STATUS_TRANSITIONS = {
  'Draft': ['Sent', 'Cancelled'],
  'Sent': ['Partial', 'Paid', 'Overdue', 'Cancelled'],
  'Partial': ['Paid', 'Overdue', 'Cancelled'],
  'Paid': [], // Terminal state
  'Overdue': ['Partial', 'Paid', 'Cancelled'], // Can still receive payments
  'Cancelled': [] // Terminal state
};

/**
 * Calculate current invoice status based on payments and due date
 *
 * @param {Object} invoice - Invoice record
 * @returns {string} Calculated status
 */
function calculateInvoiceStatus(invoice) {
  // If cancelled, always return Cancelled
  if (invoice.cancelledAt) {
    return 'Cancelled';
  }

  const total = formatAmount(invoice.total);
  const paid = formatAmount(invoice.paidAmount || 0);
  const now = new Date();
  const dueDate = new Date(invoice.dueDate);

  // Check if fully paid
  if (compareAmounts(paid, total)) {
    return 'Paid';
  }

  // Check if overdue (past due date and not fully paid)
  if (dueDate < now && paid < total) {
    return 'Overdue';
  }

  // Check if partially paid
  if (paid > 0 && paid < total) {
    return 'Partial';
  }

  // Otherwise keep current status (Draft or Sent)
  return invoice.status === 'Draft' ? 'Draft' : 'Sent';
}

/**
 * Create a new Invoice
 *
 * @param {Object} data - Invoice data
 * @param {string} data.customerId - Customer ID
 * @param {Date} data.invoiceDate - Invoice date
 * @param {Date} data.dueDate - Payment due date
 * @param {Array} data.items - Array of invoice items
 * @param {number} data.subtotal - Subtotal amount
 * @param {number} data.taxAmount - Tax amount
 * @param {number} data.total - Total amount
 * @param {string} userId - User creating the invoice
 * @returns {Promise<Object>} Created invoice
 */
async function createInvoice(data, userId) {
  return withTransaction(async (tx) => {
    // Validate amounts
    const subtotal = formatAmount(data.subtotal);
    const taxAmount = formatAmount(data.taxAmount || 0);
    const total = formatAmount(data.total);

    // Verify total = subtotal + tax (allow discount logic)
    const expectedTotal = formatAmount(subtotal + taxAmount - (data.discountValue || 0));
    if (!compareAmounts(total, expectedTotal, 0.01)) {
      throw new ValidationError(
        `Total (${total}) calculation mismatch. Expected: ${expectedTotal}`
      );
    }

    // Verify customer exists
    const customer = await tx.customer.findUnique({
      where: { id: data.customerId, deletedAt: null }
    });

    if (!customer) {
      throw new ValidationError('Customer not found');
    }

    // Check credit limit (if applicable)
    if (customer.creditLimit > 0) {
      const newBalance = formatAmount(customer.currentBalance + total);
      if (newBalance > customer.creditLimit) {
        throw new ValidationError(
          `Invoice total (${total}) would exceed customer credit limit. ` +
          `Current: ${customer.currentBalance}, Limit: ${customer.creditLimit}`
        );
      }
    }

    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber();

    // Create invoice with items
    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        invoiceDate: data.invoiceDate || new Date(),
        dueDate: data.dueDate,
        status: 'Draft', // Always start as Draft

        // Financial
        subtotal,
        discountType: data.discountType || null,
        discountValue: formatAmount(data.discountValue || 0),

        // Tax
        taxType: data.taxType || 'GST',
        taxRate: data.taxRate || 0,
        taxAmount,
        cgstRate: data.cgstRate || 0,
        cgstAmount: formatAmount(data.cgstAmount || 0),
        sgstRate: data.sgstRate || 0,
        sgstAmount: formatAmount(data.sgstAmount || 0),
        igstRate: data.igstRate || 0,
        igstAmount: formatAmount(data.igstAmount || 0),

        total,
        paidAmount: 0,

        // Tax compliance
        placeOfSupply: data.placeOfSupply || null,
        hsn: data.hsn || null,
        gstinNumber: data.gstinNumber || customer.gstinNumber || null,

        // Terms
        terms: data.terms || null,
        notes: data.notes || null,

        // Installment
        hasInstallment: data.hasInstallment || false,

        customerId: data.customerId,
        createdById: userId,

        items: {
          create: data.items.map(item => ({
            itemId: item.itemId,
            quantity: item.quantity,
            unitPrice: formatAmount(item.unitPrice),
            total: formatAmount(item.total),
            description: item.description || null
          }))
        }
      },
      include: {
        customer: true,
        items: {
          include: {
            item: true
          }
        }
      }
    });

    // Create audit log
    await tx.invoicePaymentAudit.create({
      data: {
        invoiceId: invoice.id,
        action: 'INVOICE_CREATED',
        beforeState: null,
        afterState: {
          status: 'Draft',
          total: total,
          paidAmount: 0
        },
        performedBy: userId,
        metadata: {
          invoiceNumber,
          customerId: data.customerId
        }
      }
    });

    logger.info(`Invoice created: ${invoiceNumber}`, {
      invoiceId: invoice.id,
      customer: customer.name,
      total: total
    });

    return invoice;
  });
}

/**
 * Update Invoice Status
 *
 * @param {string} invoiceId - Invoice ID
 * @param {string} newStatus - New status
 * @param {string} userId - User performing the action
 * @returns {Promise<Object>} Updated invoice
 */
async function updateInvoiceStatus(invoiceId, newStatus, userId) {
  return withTransaction(async (tx) => {
    // Lock the invoice row
    const invoice = await lockForUpdate(tx, 'Invoice', invoiceId);

    // Check if cancelled
    if (invoice.cancelledAt) {
      throw new ValidationError('Cannot update status of cancelled invoice');
    }

    // Validate status transition
    const allowedTransitions = STATUS_TRANSITIONS[invoice.status] || [];

    if (!allowedTransitions.includes(newStatus)) {
      throw new ValidationError(
        `Cannot transition from ${invoice.status} to ${newStatus}. Allowed: ${allowedTransitions.join(', ')}`
      );
    }

    // Additional validations
    if (newStatus === 'Paid') {
      // Can only mark as Paid if fully paid
      if (!compareAmounts(invoice.paidAmount, invoice.total)) {
        throw new ValidationError(
          `Cannot mark as Paid. Paid amount (${invoice.paidAmount}) must equal total (${invoice.total})`
        );
      }
    }

    // Update status
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: newStatus,
        updatedAt: new Date()
      },
      include: {
        customer: true
      }
    });

    // Create audit log
    await tx.invoicePaymentAudit.create({
      data: {
        invoiceId,
        action: 'STATUS_CHANGED',
        beforeState: { status: invoice.status },
        afterState: { status: newStatus },
        performedBy: userId,
        metadata: { reason: 'Manual status update' }
      }
    });

    logger.info(`Invoice status updated: ${invoice.invoiceNumber}`, {
      invoiceId,
      oldStatus: invoice.status,
      newStatus
    });

    return updated;
  });
}

/**
 * Update Invoice (Draft only)
 *
 * @param {string} invoiceId - Invoice ID
 * @param {Object} updates - Updated data
 * @param {string} userId - User performing update
 * @returns {Promise<Object>} Updated invoice
 */
async function updateInvoice(invoiceId, updates, userId) {
  return withTransaction(async (tx) => {
    // Lock the invoice
    const invoice = await lockForUpdate(tx, 'Invoice', invoiceId);

    // Check if cancelled
    if (invoice.cancelledAt) {
      throw new ValidationError('Cannot update cancelled invoice');
    }

    // Can only update Draft invoices
    if (invoice.status !== 'Draft') {
      throw new ValidationError(
        `Cannot update invoice in ${invoice.status} status. Only Draft invoices can be edited.`
      );
    }

    // Validate amounts if provided
    if (updates.total !== undefined) {
      const subtotal = formatAmount(updates.subtotal || invoice.subtotal);
      const taxAmount = formatAmount(updates.taxAmount || invoice.taxAmount);
      const total = formatAmount(updates.total);

      if (!compareAmounts(total, subtotal + taxAmount, 0.01)) {
        throw new ValidationError('Total must equal subtotal + tax');
      }
    }

    // Delete existing items if new ones provided
    if (updates.items) {
      await tx.invoiceItem.deleteMany({
        where: { invoiceId }
      });
    }

    // Update invoice
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        invoiceDate: updates.invoiceDate || invoice.invoiceDate,
        dueDate: updates.dueDate || invoice.dueDate,
        customerId: updates.customerId || invoice.customerId,

        subtotal: updates.subtotal ? formatAmount(updates.subtotal) : undefined,
        discountType: updates.discountType,
        discountValue: updates.discountValue ? formatAmount(updates.discountValue) : undefined,

        taxAmount: updates.taxAmount ? formatAmount(updates.taxAmount) : undefined,
        cgstAmount: updates.cgstAmount ? formatAmount(updates.cgstAmount) : undefined,
        sgstAmount: updates.sgstAmount ? formatAmount(updates.sgstAmount) : undefined,
        igstAmount: updates.igstAmount ? formatAmount(updates.igstAmount) : undefined,

        total: updates.total ? formatAmount(updates.total) : undefined,

        placeOfSupply: updates.placeOfSupply,
        hsn: updates.hsn,
        gstinNumber: updates.gstinNumber,
        terms: updates.terms,
        notes: updates.notes,

        items: updates.items ? {
          create: updates.items.map(item => ({
            itemId: item.itemId,
            quantity: item.quantity,
            unitPrice: formatAmount(item.unitPrice),
            total: formatAmount(item.total),
            description: item.description
          }))
        } : undefined
      },
      include: {
        customer: true,
        items: {
          include: {
            item: true
          }
        }
      }
    });

    return updated;
  });
}

/**
 * Cancel an Invoice (soft-cancel)
 * Only Draft invoices can be cancelled
 *
 * @param {string} invoiceId - Invoice ID
 * @param {string} reason - Cancellation reason
 * @param {string} userId - User performing cancellation
 * @returns {Promise<Object>} Cancelled invoice
 */
async function cancelInvoice(invoiceId, reason, userId) {
  return withTransaction(async (tx) => {
    // Lock the invoice
    const invoice = await lockForUpdate(tx, 'Invoice', invoiceId);

    // Validate invoice can be cancelled
    if (invoice.cancelledAt) {
      throw new ValidationError('Invoice is already cancelled');
    }

    // CRITICAL: Only Draft invoices can be cancelled
    if (invoice.status !== 'Draft') {
      throw new ValidationError(
        `Cannot cancel invoice with status ${invoice.status}. Only Draft invoices can be cancelled.`
      );
    }

    if (invoice.paidAmount > 0) {
      throw new ValidationError(
        `Cannot cancel invoice with payments. Invoice has ${invoice.paidAmount} paid.`
      );
    }

    // Check if any items are linked (prevent cancelling invoices with inventory impact)
    const linkedItems = await tx.item.count({
      where: {
        invoices: {
          some: {
            invoiceId: invoiceId
          }
        }
      }
    });

    if (linkedItems > 0) {
      throw new ValidationError(
        `Cannot cancel invoice with ${linkedItems} linked inventory items. ` +
        `Remove item associations first.`
      );
    }

    // Soft-cancel the invoice
    const cancelled = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'Cancelled',
        cancelledAt: new Date(),
        cancelReason: reason,
        cancelledBy: userId
      },
      include: {
        customer: true
      }
    });

    // Reverse customer ledger entry if it exists
    const ledgerEntries = await tx.customerLedger.findMany({
      where: { invoiceId: invoiceId }
    });

    if (ledgerEntries.length > 0) {
      const customer = await tx.customer.findUnique({
        where: { id: invoice.customerId }
      });

      const newBalance = formatAmount(customer.currentBalance - invoice.total);

      await tx.customerLedger.create({
        data: {
          customerId: invoice.customerId,
          entryDate: new Date(),
          description: `Invoice ${invoice.invoiceNumber} cancelled: ${reason}`,
          debit: 0,
          credit: invoice.total,
          balance: newBalance,
          invoiceId: invoice.id
        }
      });

      // Update customer balance
      await tx.customer.update({
        where: { id: invoice.customerId },
        data: {
          currentBalance: newBalance
        }
      });
    }

    // Create audit trail
    await tx.invoicePaymentAudit.create({
      data: {
        invoiceId: invoice.id,
        action: 'INVOICE_CANCELLED',
        beforeState: {
          status: invoice.status,
          total: invoice.total,
          paidAmount: invoice.paidAmount
        },
        afterState: {
          status: 'Cancelled',
          cancelReason: reason
        },
        performedBy: userId,
        metadata: { reason }
      }
    });

    logger.info(`Invoice cancelled: ${invoice.invoiceNumber}`, {
      invoiceId,
      reason,
      total: invoice.total
    });

    return cancelled;
  });
}

/**
 * Get Invoice with computed fields
 *
 * @param {string} invoiceId - Invoice ID
 * @returns {Promise<Object>} Invoice with computed fields
 */
async function getInvoice(invoiceId) {
  const invoice = await db.prisma.invoice.findUnique({
    where: { id: invoiceId, deletedAt: null },
    include: {
      customer: true,
      items: {
        include: {
          item: true
        }
      },
      payments: {
        where: { deletedAt: null, voidedAt: null },
        orderBy: { paymentDate: 'desc' }
      }
    }
  });

  if (!invoice) {
    throw new ValidationError('Invoice not found');
  }

  // Calculate actual status based on payments and due date
  const calculatedStatus = calculateInvoiceStatus(invoice);

  // Add computed fields
  invoice.calculatedStatus = calculatedStatus;
  invoice.remainingAmount = formatAmount(invoice.total - invoice.paidAmount);
  invoice.isCancelled = !!invoice.cancelledAt;
  invoice.isOverdue = calculatedStatus === 'Overdue';
  invoice.canReceivePayment = !invoice.cancelledAt &&
                               invoice.status !== 'Cancelled' &&
                               invoice.remainingAmount > 0;
  invoice.canBeCancelled = !invoice.cancelledAt &&
                            invoice.status === 'Draft' &&
                            invoice.paidAmount === 0;

  return invoice;
}

/**
 * Auto-update overdue invoices (batch job)
 * Should be run daily via cron
 *
 * @returns {Promise<number>} Number of invoices updated
 */
async function updateOverdueInvoices() {
  const now = new Date();

  const overdueInvoices = await db.prisma.invoice.findMany({
    where: {
      status: { in: ['Sent', 'Partial'] },
      dueDate: { lt: now },
      cancelledAt: null,
      deletedAt: null,
      paidAmount: { lt: db.prisma.invoice.fields.total }
    }
  });

  let updated = 0;

  for (const invoice of overdueInvoices) {
    try {
      await db.prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'Overdue' }
      });
      updated++;
    } catch (error) {
      logger.error(`Failed to mark invoice ${invoice.invoiceNumber} as overdue`, error);
    }
  }

  logger.info(`Marked ${updated} invoices as overdue`);
  return updated;
}

module.exports = {
  createInvoice,
  updateInvoice,
  updateInvoiceStatus,
  cancelInvoice,
  getInvoice,
  calculateInvoiceStatus,
  updateOverdueInvoices,
  STATUS_TRANSITIONS
};
