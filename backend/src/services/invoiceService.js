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
const inventoryLifecycleService = require('./inventoryLifecycleService');

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

    // Calculate discount based on type (Percentage or Fixed)
    let discountAmount = 0;
    if (data.discountType === 'Percentage') {
      discountAmount = formatAmount((subtotal * (data.discountValue || 0)) / 100);
    } else if (data.discountType === 'Fixed') {
      discountAmount = formatAmount(data.discountValue || 0);
    }

    // FIX: Validate total is non-negative
    if (total < 0) {
      throw new ValidationError('Invoice total cannot be negative');
    }

    // Verify total = subtotal - discount + tax
    const taxableAmount = formatAmount(subtotal - discountAmount);
    const expectedTotal = formatAmount(taxableAmount + taxAmount);
    if (!compareAmounts(total, expectedTotal, 0.01)) {
      throw new ValidationError(
        `Total (${total}) calculation mismatch. Expected: ${expectedTotal} ` +
        `(Subtotal: ${subtotal}, Discount: ${discountAmount}, Tax: ${taxAmount})`
      );
    }

    // FIX: Lock customer to prevent race conditions on credit limit check
    const customer = await lockForUpdate(tx, 'Customer', data.customerId);

    if (!customer || customer.deletedAt) {
      throw new ValidationError('Customer not found');
    }

    // Check credit limit (if applicable)
    if (customer.creditLimit > 0) {
      const newBalance = formatAmount(customer.currentBalance + total);
      if (newBalance > customer.creditLimit) {
        throw new ValidationError(
          `Invoice total (${total}) would exceed customer credit limit. ` +
          `Current: ${customer.currentBalance}, Limit: ${customer.creditLimit}, ` +
          `New Balance: ${newBalance}`
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

        total,
        paidAmount: 0,

        // Terms
        terms: data.terms || null,
        notes: data.notes || null,

        customerId: data.customerId,
        createdById: userId,

        items: {
          create: data.items.map(item => ({
            itemId: item.itemId,
            quantity: item.quantity || 1,
            unitPrice: formatAmount(item.unitPrice),
            total: formatAmount(item.unitPrice * (item.quantity || 1)),
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

    // Reserve items and set customer reference
    const itemIds = data.items.map(item => item.itemId);

    // Call lifecycle service to reserve items (updates inventoryStatus to 'Reserved')
    // CRITICAL: Pass tx to avoid nested transaction deadlock
    await inventoryLifecycleService.reserveItemsForInvoice(itemIds, invoice.id, userId, tx);

    // CRITICAL FIX: Clean up temporary ItemReservation records
    // Now that items are permanently reserved via Item.reservedFor* fields,
    // delete any temporary session-based reservations to prevent confusion
    await tx.itemReservation.deleteMany({
      where: { itemId: { in: itemIds } }
    });

    // Set customer reference on items for direct lookup in inventory list
    await tx.item.updateMany({
      where: { id: { in: itemIds } },
      data: { customerId: data.customerId }
    });

    // CRITICAL FIX: Re-fetch customer to get FRESH balance (not stale from line 116)
    // This prevents incorrect ledger balance under concurrent invoice/payment operations
    const freshCustomer = await tx.customer.findUnique({
      where: { id: data.customerId }
    });

    const newCustomerBalance = formatAmount(formatAmount(freshCustomer.currentBalance) + total);

    await tx.customerLedger.create({
      data: {
        customerId: data.customerId,
        entryDate: data.invoiceDate || new Date(),
        description: `Invoice ${invoiceNumber}`,
        debit: total,
        credit: 0,
        balance: newCustomerBalance,
        invoiceId: invoice.id
      }
    });

    // Update customer balance
    await tx.customer.update({
      where: { id: data.customerId },
      data: {
        currentBalance: newCustomerBalance
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

    // FIX: Release old reserved items before deleting invoice items
    if (updates.items) {
      // Get old items that are currently reserved for this invoice
      const oldInvoiceItems = await tx.invoiceItem.findMany({
        where: { invoiceId },
        include: { item: true }
      });

      // Release each old item back to Available
      for (const invoiceItem of oldInvoiceItems) {
        const item = invoiceItem.item;
        if (item.inventoryStatus === 'Reserved' && item.reservedForId === invoiceId) {
          await tx.item.update({
            where: { id: item.id },
            data: {
              inventoryStatus: 'Available',
              reservedAt: null,
              reservedBy: null,
              reservedForType: null,
              reservedForId: null,
              customerId: null
            }
          });

          // Create status history
          await tx.inventoryStatusHistory.create({
            data: {
              itemId: item.id,
              fromStatus: 'Reserved',
              toStatus: 'Available',
              changeReason: 'MANUAL',
              referenceType: 'Invoice',
              referenceId: invoiceId,
              changedBy: userId,
              notes: `Released due to invoice items update`
            }
          });
        }
      }

      // Now delete the old invoice items
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

    // CRITICAL FIX: Reserve new items for the invoice
    // Without this, items remain Available and can be sold twice
    if (updates.items && updates.items.length > 0) {
      const newItemIds = updates.items.map(item => item.itemId);
      await inventoryLifecycleService.reserveItemsForInvoice(
        newItemIds,
        invoiceId,
        userId,
        tx
      );

      // CRITICAL FIX: Clean up temporary ItemReservation records for new items
      await tx.itemReservation.deleteMany({
        where: { itemId: { in: newItemIds } }
      });

      logger.info(`Reserved ${newItemIds.length} new items for invoice ${updated.invoiceNumber} during update`);
    }

    // CRITICAL FIX: Adjust customer ledger if total changed
    // Without this, customer balance becomes permanently incorrect
    if (updates.total !== undefined) {
      const oldTotal = formatAmount(invoice.total);
      const newTotal = formatAmount(updates.total);
      const difference = formatAmount(newTotal - oldTotal);

      if (!compareAmounts(oldTotal, newTotal)) {
        // Fetch fresh customer balance
        const customer = await tx.customer.findUnique({
          where: { id: invoice.customerId }
        });

        const newCustomerBalance = formatAmount(formatAmount(customer.currentBalance) + difference);

        // Create ledger adjustment entry
        await tx.customerLedger.create({
          data: {
            customerId: invoice.customerId,
            entryDate: new Date(),
            description: `Invoice ${invoice.invoiceNumber} amount adjustment (${oldTotal} → ${newTotal})`,
            debit: difference > 0 ? difference : 0,
            credit: difference < 0 ? Math.abs(difference) : 0,
            balance: newCustomerBalance,
            invoiceId: invoice.id
          }
        });

        // Update customer balance
        await tx.customer.update({
          where: { id: invoice.customerId },
          data: { currentBalance: newCustomerBalance }
        });

        logger.info(`Adjusted customer balance for invoice ${invoice.invoiceNumber}: ${oldTotal} → ${newTotal} (diff: ${difference})`);
      }
    }

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

    // BUSINESS RULE: Only Draft invoices can be cancelled
    // Sent/Partial/Paid/Overdue invoices have already been sent to customers
    if (invoice.status !== 'Draft') {
      throw new ValidationError(
        `Only Draft invoices can be cancelled. Current status: ${invoice.status}`
      );
    }

    // Additional safety check (should always be 0 for Draft invoices)
    if (invoice.paidAmount > 0) {
      throw new ValidationError(
        `Cannot cancel invoice with payments. Invoice has ${invoice.paidAmount} paid. Please void payments first.`
      );
    }

    // Automatically release reserved items for Draft invoices
    // Get all invoice items
    const invoiceItems = await tx.invoiceItem.findMany({
      where: { invoiceId: invoiceId },
      include: { item: true }
    });

    // Release each reserved item back to Available status
    for (const invoiceItem of invoiceItems) {
      const item = invoiceItem.item;

      // Only release if the item is currently Reserved for this invoice
      if (item.inventoryStatus === 'Reserved' && item.reservedForId === invoiceId) {
        await tx.item.update({
          where: { id: item.id },
          data: {
            inventoryStatus: 'Available',
            reservedAt: null,
            reservedBy: null,
            reservedForType: null,
            reservedForId: null,
            customerId: null
          }
        });

        // Create status history entry
        await tx.inventoryStatusHistory.create({
          data: {
            itemId: item.id,
            fromStatus: 'Reserved',
            toStatus: 'Available',
            changeReason: 'INVOICE_CANCELLED',
            referenceType: 'Invoice',
            referenceId: invoiceId,
            changedBy: userId,
            notes: `Released from cancelled Invoice ${invoice.invoiceNumber}`
          }
        });
      }
    }

    // Delete any item reservations for this invoice
    await tx.itemReservation.deleteMany({
      where: {
        referenceType: 'Invoice',
        referenceId: invoiceId
      }
    });

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

    // CRITICAL FIX: Always reverse customer ledger entry (unconditional)
    // Since invoices now create ledger entries on creation, we must always reverse
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
          item: {
            include: {
              category: true,
              model: {
                include: {
                  company: true
                }
              }
            }
          }
        }
      },
      payments: {
        where: { deletedAt: null, voidedAt: null },
        include: {
          recordedBy: {
            select: {
              fullName: true
            }
          }
        },
        orderBy: { paymentDate: 'desc' }
      },
      createdBy: {
        select: {
          fullName: true
        }
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
 * Get all invoices with filters
 *
 * @param {Object} filters - Query filters
 * @param {string} filters.status - Filter by status (comma-separated)
 * @param {string} filters.customerId - Filter by customer
 * @param {string} filters.dateFrom - Filter by date from
 * @param {string} filters.dateTo - Filter by date to
 * @param {boolean} filters.includeCancelled - Include cancelled invoices (default: false)
 * @returns {Promise<Array>} Invoices
 */
async function getInvoices(filters = {}) {
  const where = { deletedAt: null };

  // CRITICAL FIX: Exclude cancelled invoices by default
  // Cancelled Draft invoices have been reversed and should not appear in normal queries
  if (!filters.includeCancelled) {
    where.cancelledAt = null;
  }

  if (filters.status) {
    // Handle multiple status values separated by comma
    const statuses = Array.isArray(filters.status)
      ? filters.status
      : filters.status.split(',').map(s => s.trim());

    if (statuses.length === 1) {
      where.status = statuses[0];
    } else {
      where.status = { in: statuses };
    }
  }

  if (filters.customerId) {
    where.customerId = filters.customerId;
  }

  if (filters.dateFrom || filters.dateTo) {
    where.invoiceDate = {};
    if (filters.dateFrom) {
      where.invoiceDate.gte = new Date(filters.dateFrom);
    }
    if (filters.dateTo) {
      where.invoiceDate.lte = new Date(filters.dateTo);
    }
  }

  return await db.prisma.invoice.findMany({
    where,
    include: {
      customer: true,
      _count: {
        select: {
          items: true,
          payments: true
        }
      }
    },
    orderBy: { invoiceDate: 'desc' }
  });
}

/**
 * Auto-update overdue invoices (batch job)
 * Should be run daily via cron
 *
 * FIX: Uses PostgreSQL advisory lock to prevent concurrent execution
 * @returns {Promise<number>} Number of invoices updated
 */
async function updateOverdueInvoices() {
  const LOCK_ID = 1001; // Unique ID for this batch job

  // FIX: Try to acquire PostgreSQL advisory lock (non-blocking)
  const lockAcquired = await db.prisma.$queryRaw`SELECT pg_try_advisory_lock(${LOCK_ID}) as locked`;

  if (!lockAcquired[0].locked) {
    logger.warn('updateOverdueInvoices: Another instance is already running. Skipping.');
    return 0;
  }

  try {
    const now = new Date();

    // FIX: Prisma doesn't support field-to-field comparison in WHERE clause
    // Fetch all candidates and filter in-memory
    const candidateInvoices = await db.prisma.invoice.findMany({
      where: {
        status: { in: ['Sent', 'Partial'] },
        dueDate: { lt: now },
        cancelledAt: null,
        deletedAt: null
      }
    });

    // Filter to only invoices where paidAmount < total
    const overdueInvoices = candidateInvoices.filter(
      invoice => invoice.paidAmount < invoice.total
    );

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
  } finally {
    // FIX: Always release the advisory lock
    await db.prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_ID})`;
  }
}

module.exports = {
  createInvoice,
  updateInvoice,
  updateInvoiceStatus,
  cancelInvoice,
  getInvoice,
  getInvoices,
  calculateInvoiceStatus,
  updateOverdueInvoices,
  STATUS_TRANSITIONS
};
