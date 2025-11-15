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
  acquireAdvisoryLock,
  ValidationError,
  ConcurrencyError,
  InsufficientBalanceError,
  compareAmounts,
  addAmounts,
  formatAmount
} = require('../utils/transactionWrapper');
const { generateInvoiceNumber } = require('../utils/generateId');
const JournalEntryService = require('./journalEntryService');
const InventoryLifecycleService = require('./inventoryLifecycleService');
const ValidationService = require('./validationService');

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

  // FIXED: Check if overdue (past due date and not fully paid) using Decimal comparison
  if (dueDate < now && new Decimal(paid).lessThan(total)) {
    return 'Overdue';
  }

  // FIXED: Check if partially paid using Decimal comparison
  if (new Decimal(paid).greaterThan(0) && new Decimal(paid).lessThan(total)) {
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
    // Validate amounts using ValidationService
    const subtotal = formatAmount(data.subtotal);
    const taxAmount = formatAmount(data.taxAmount || 0);
    const discount = formatAmount(data.discountValue || 0);
    const total = formatAmount(data.total);

    // Use ValidationService for total calculation validation
    ValidationService.validateTotalCalculation(subtotal, taxAmount, discount, total, 'Invoice');

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

    // CRITICAL FIX: Validate item availability before creating invoice
    const itemIds = data.items.map(item => item.itemId);

    // Check that all items exist and are available
    const items = await tx.item.findMany({
      where: {
        id: { in: itemIds }
      },
      select: {
        id: true,
        serialNumber: true,
        inventoryStatus: true,
        reservedForId: true,
        reservedForType: true,
        purchasePrice: true
      }
    });

    // Validate all items were found
    if (items.length !== itemIds.length) {
      const foundIds = items.map(item => item.id);
      const missingIds = itemIds.filter(id => !foundIds.includes(id));
      throw new ValidationError(
        `Some items not found: ${missingIds.join(', ')}`
      );
    }

    // Validate all items are available for reservation
    const unavailableItems = items.filter(item => item.inventoryStatus !== 'Available');
    if (unavailableItems.length > 0) {
      const unavailableDetails = unavailableItems.map(item => ({
        serialNumber: item.serialNumber,
        status: item.inventoryStatus,
        reservedFor: item.reservedForType && item.reservedForId
          ? `${item.reservedForType} ${item.reservedForId}`
          : null
      }));
      throw new ValidationError(
        `Cannot create invoice. Some items are not available: ${JSON.stringify(unavailableDetails)}`
      );
    }

    // CRITICAL FIX: Validate all items have purchase price for COGS calculation
    // FIXED: Use Decimal for precise comparison
    const itemsWithoutPrice = items.filter(item =>
      !item.purchasePrice || new Decimal(item.purchasePrice || 0).lessThanOrEqualTo(0)
    );
    if (itemsWithoutPrice.length > 0) {
      const itemsDetails = itemsWithoutPrice.map(item => ({
        serialNumber: item.serialNumber,
        purchasePrice: item.purchasePrice || 0
      }));
      throw new ValidationError(
        `Cannot create invoice. Some items are missing purchase price (required for COGS calculation): ${JSON.stringify(itemsDetails)}`
      );
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

    // Update customer balance (invoice increases what customer owes)
    const newBalance = formatAmount(customer.currentBalance + total);

    await tx.customer.update({
      where: { id: data.customerId },
      data: {
        currentBalance: newBalance
      }
    });

    // Create customer ledger entry
    await tx.customerLedger.create({
      data: {
        customerId: data.customerId,
        entryDate: data.invoiceDate || new Date(),
        description: `Invoice ${invoiceNumber}`,
        debit: total,
        credit: 0,
        balance: newBalance,
        invoiceId: invoice.id
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

    // Create journal entries for invoice (DR: A/R, CR: Sales Revenue, CR: Sales Tax)
    // CRITICAL: Journal entry creation is MANDATORY - if it fails, entire transaction rolls back
    await JournalEntryService.createInvoiceEntries(tx, {
      id: invoice.id,
      invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      total,
      subtotal,
      taxAmount,
      customer: { name: customer.name }
    });

    // CRITICAL FIX: Reserve items for this invoice (within same transaction)
    try {
      await InventoryLifecycleService.reserveItemsForInvoice(
        itemIds,
        invoice.id,
        userId,
        tx // Pass transaction to ensure atomic operation
      );
      logger.info(`Reserved ${itemIds.length} items for invoice ${invoiceNumber}`);
    } catch (error) {
      logger.error('Failed to reserve items for invoice - rolling back', {
        invoiceId: invoice.id,
        error: error.message
      });
      // This is critical - if reservation fails, the transaction will rollback
      throw new ValidationError(
        `Failed to reserve items for invoice: ${error.message}`
      );
    }

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

    // Validate invoice status allows cancellation
    if (invoice.status === 'Paid') {
      throw new ValidationError(
        'Cannot cancel fully paid invoice. Please void payments first or contact accounting.'
      );
    }

    if (invoice.status === 'Partial' || invoice.status === 'Overdue') {
      const paidAmount = formatAmount(invoice.paidAmount);
      throw new ValidationError(
        `Cannot cancel invoice with status ${invoice.status}. ` +
        `Invoice has ${paidAmount} in payments. ` +
        `Please void all payments first, then cancel the invoice.`
      );
    }

    // Additional safety check for any payments
    if (invoice.paidAmount > 0) {
      throw new ValidationError(
        `Cannot cancel invoice with payments. Invoice has ${formatAmount(invoice.paidAmount)} paid. ` +
        `Please void all payments first.`
      );
    }

    // Allow Draft or Sent invoices to be cancelled
    if (!['Draft', 'Sent'].includes(invoice.status)) {
      throw new ValidationError(
        `Cannot cancel invoice with status ${invoice.status}. ` +
        `Only Draft or Sent invoices can be cancelled.`
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
            reservedForId: null
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

    // Reverse journal entries for cancelled invoice
    // CRITICAL: Journal entry reversal is MANDATORY - if it fails, entire transaction rolls back
    await JournalEntryService.reverseInvoiceEntries(tx, {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      total: invoice.total,
      subtotal: invoice.subtotal,
      taxAmount: invoice.taxAmount
    }, reason);

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
 * Get all invoices with filters (OPTIMIZED with pagination)
 *
 * @param {Object} filters - Query filters
 * @param {string} filters.status - Filter by status (comma-separated)
 * @param {string} filters.customerId - Filter by customer
 * @param {string} filters.dateFrom - Filter by date from
 * @param {string} filters.dateTo - Filter by date to
 * @param {number} filters.page - Page number (default: 1)
 * @param {number} filters.limit - Items per page (default: 50)
 * @returns {Promise<Object>} Paginated invoices with metadata
 */
async function getInvoices(filters = {}) {
  const where = { deletedAt: null };

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

  // PERFORMANCE OPTIMIZATION: Add pagination
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 50;
  const skip = (page - 1) * limit;

  // PERFORMANCE OPTIMIZATION: Parallel queries for data + count + statistics
  // FIXED: Add performance monitoring
  const queryStartTime = Date.now();
  const [invoices, totalCount, statistics] = await Promise.all([
    // Get paginated invoices with selective field loading
    db.prisma.invoice.findMany({
      where,
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        status: true,
        subtotal: true,
        taxAmount: true,
        total: true,
        paidAmount: true,
        cancelledAt: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            company: true
          }
        },
        _count: {
          select: {
            items: true,
            payments: true
          }
        }
      },
      orderBy: { invoiceDate: 'desc' },
      skip,
      take: limit
    }),

    // Get total count for pagination
    db.prisma.invoice.count({ where }),

    // Get statistics using SQL aggregation (instead of JS calculations)
    db.prisma.invoice.groupBy({
      by: ['status'],
      where,
      _sum: {
        total: true,
        paidAmount: true
      },
      _count: true
    })
  ]);

  // Calculate summary statistics from aggregation
  const stats = {
    totalAmount: 0,
    paidAmount: 0,
    pendingAmount: 0,
    totalInvoices: totalCount,
    byStatus: {}
  };

  statistics.forEach(stat => {
    const total = parseFloat(stat._sum.total || 0);
    const paid = parseFloat(stat._sum.paidAmount || 0);

    stats.totalAmount += total;
    stats.paidAmount += paid;
    stats.byStatus[stat.status] = {
      count: stat._count,
      total: total,
      paid: paid
    };
  });

  stats.pendingAmount = stats.totalAmount - stats.paidAmount;

  // FIXED: Log slow queries for performance optimization
  const queryTime = Date.now() - queryStartTime;
  if (queryTime > 1000) {
    logger.warn('Slow invoice query detected', {
      queryTime,
      filters,
      resultCount: invoices.length,
      totalCount
    });
  }

  return {
    invoices,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit)
    },
    statistics: stats
  };
}

/**
 * Auto-update overdue invoices (batch job)
 * FIXED: Uses advisory lock to prevent concurrent execution across multiple Electron instances
 * FIXED: Uses atomic UPDATE query instead of loop to prevent race conditions
 * Should be run daily via cron
 *
 * @returns {Promise<Object>} Update result with count and skipped flag
 */
async function updateOverdueInvoices() {
  return withTransaction(async (tx) => {
    // FIXED: Acquire advisory lock to prevent concurrent execution
    // This is critical for Electron desktop app where multiple instances may run the same scheduler
    const lockKey = 'overdue_invoice_update_job';
    const locked = await acquireAdvisoryLock(tx, lockKey);

    if (!locked) {
      logger.info('Another instance is already running overdue invoice update job - skipping');
      return { updated: 0, skipped: true };
    }

    const now = new Date();

    // FIXED: Use Prisma's $queryRaw for safe parameterized query with field comparison
    // This approach prevents SQL injection while supporting paidAmount < total comparison
    const invoicesToUpdate = await tx.$queryRaw`
      SELECT id, "invoiceNumber"
      FROM "Invoice"
      WHERE status IN ('Sent', 'Partial')
        AND "dueDate" < ${now}
        AND "cancelledAt" IS NULL
        AND "deletedAt" IS NULL
        AND "paidAmount" < total
    `;

    const updated = invoicesToUpdate.length;

    // FIXED: Use atomic updateMany for efficiency
    if (updated > 0) {
      await tx.invoice.updateMany({
        where: {
          id: { in: invoicesToUpdate.map(inv => inv.id) }
        },
        data: {
          status: 'Overdue',
          updatedAt: now
        }
      });
    }

    const updatedInvoices = invoicesToUpdate;

    logger.info(`Marked ${updated} invoices as overdue`, {
      invoiceNumbers: updatedInvoices.map(inv => inv.invoiceNumber).slice(0, 10) // Log first 10
    });

    return { updated, skipped: false };
  });
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
