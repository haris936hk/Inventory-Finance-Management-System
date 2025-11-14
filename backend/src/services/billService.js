/**
 * Bill Management Service
 *
 * Implements strict rules:
 * - Multiple bills can be created against a PO
 * - SUM(bills) <= PO.total (enforced with locks)
 * - Only unpaid bills can be cancelled
 * - Bill status auto-updates based on payments
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
  Decimal
} = require('../utils/transactionWrapper');
const { generateBillNumber } = require('../utils/generateId');
const JournalEntryService = require('./journalEntryService');
const ValidationService = require('./validationService');

/**
 * Create a bill against a Purchase Order
 *
 * CONCURRENCY SAFETY:
 * - Uses serializable transaction and row-level locking to prevent race conditions
 * - Bill number uniqueness enforced by database constraint (@unique on billNumber)
 * - If bill number collision occurs, Prisma throws P2002 error - caller should retry
 * - Manual duplicate checks removed to prevent TOCTOU race condition
 *
 * @param {Object} data - Bill data
 * @param {string} data.purchaseOrderId - PO ID
 * @param {string} data.vendorId - Vendor ID
 * @param {Date} data.billDate - Bill date
 * @param {Date} data.dueDate - Due date
 * @param {number} data.subtotal - Subtotal
 * @param {number} data.taxAmount - Tax amount
 * @param {number} data.total - Total amount
 * @param {string} userId - User creating the bill
 * @returns {Promise<Object>} Created bill
 * @throws {Error} P2002 if bill number already exists (caller should retry with new number)
 */
async function createBill(data, userId) {
  return withTransaction(async (tx) => {
    // 1. Lock the Purchase Order (critical for concurrency)
    const po = await lockForUpdate(tx, 'PurchaseOrder', data.purchaseOrderId);

    // 2. Validate PO status
    if (po.status === 'Cancelled') {
      throw new ValidationError('Cannot create bill for cancelled Purchase Order');
    }

    if (po.status === 'Paid') {
      throw new ValidationError('Cannot create bill for fully paid Purchase Order');
    }

    if (po.status === 'Delivered') {
      throw new ValidationError('Cannot create bill for delivered Purchase Order');
    }

    if (po.status === 'Draft') {
      throw new ValidationError('Cannot create bill for Draft Purchase Order. Please send the PO first.');
    }

    // 3. Validate vendor matches PO
    if (po.vendorId !== data.vendorId) {
      throw new ValidationError('Vendor must match Purchase Order vendor');
    }

    // 4. Format and validate amounts using ValidationService
    const subtotal = formatAmount(data.subtotal);
    const taxAmount = formatAmount(data.taxAmount || 0);
    const total = formatAmount(data.total);

    // FIXED: Validate positive amounts
    if (new Decimal(subtotal).lessThanOrEqualTo(0)) {
      throw new ValidationError('Bill subtotal must be greater than zero');
    }
    if (new Decimal(total).lessThanOrEqualTo(0)) {
      throw new ValidationError('Bill total must be greater than zero');
    }
    if (new Decimal(taxAmount).lessThan(0)) {
      throw new ValidationError('Bill tax amount cannot be negative');
    }

    // Use ValidationService for total calculation validation
    ValidationService.validateTotalCalculation(subtotal, taxAmount, 0, total, 'Bill');

    // 5. CRITICAL: Check available balance (SUM(bills) <= PO.total)
    const currentBilledAmount = formatAmount(po.billedAmount);
    const newBilledAmount = formatAmount(currentBilledAmount + total);
    const poTotal = formatAmount(po.total);

    if (newBilledAmount > poTotal + 0.01) { // Allow 1 cent tolerance
      throw new InsufficientBalanceError(
        `Bill total (${total}) exceeds remaining PO balance. ` +
        `PO Total: ${poTotal}, Already Billed: ${currentBilledAmount}, Available: ${poTotal - currentBilledAmount}`,
        poTotal - currentBilledAmount,
        total
      );
    }

    // 6. Generate bill number
    // FIXED: Removed manual duplicate check - database unique constraint will enforce uniqueness
    // This prevents TOCTOU race condition where two transactions could pass the check before either commits
    // If uniqueness is violated, Prisma will throw P2002 error which can be caught and retried
    const billNumber = await generateBillNumber();

    // 7. Validate and prepare bill line items (if provided)
    let billItemsData = [];
    if (data.billItems && data.billItems.length > 0) {
      // Fetch PO line items for validation
      const poItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: data.purchaseOrderId }
      });

      // Validate each bill item
      for (const billItem of data.billItems) {
        // If purchaseOrderItemId is provided, validate it belongs to this PO
        if (billItem.purchaseOrderItemId) {
          const poItem = poItems.find(item => item.id === billItem.purchaseOrderItemId);
          if (!poItem) {
            throw new ValidationError(
              `Bill item references invalid PO line item: ${billItem.purchaseOrderItemId}`
            );
          }

          // Validate quantity doesn't exceed PO quantity
          if (billItem.quantity > poItem.quantity) {
            throw new ValidationError(
              `Bill item quantity (${billItem.quantity}) exceeds PO quantity (${poItem.quantity}) for item: ${poItem.description}`
            );
          }
        }

        // Validate line item calculations
        const itemUnitPrice = formatAmount(billItem.unitPrice);
        const itemQuantity = billItem.quantity || 1;
        const expectedLineTotal = formatAmount(itemUnitPrice * itemQuantity);
        const itemLineTotal = formatAmount(billItem.lineTotal);

        if (!compareAmounts(itemLineTotal, expectedLineTotal)) {
          throw new ValidationError(
            `Line item total mismatch. Expected: ${expectedLineTotal} (${itemQuantity} × ${itemUnitPrice}), Got: ${itemLineTotal}`
          );
        }

        billItemsData.push({
          description: billItem.description || '',
          quantity: itemQuantity,
          unitPrice: itemUnitPrice,
          lineTotal: itemLineTotal,
          taxAmount: formatAmount(billItem.taxAmount || 0),
          discountAmount: formatAmount(billItem.discountAmount || 0),
          purchaseOrderItemId: billItem.purchaseOrderItemId || null
        });
      }

      // FIXED: Validate sum of line items equals bill subtotal using Decimal for precision
      const lineItemsTotal = billItemsData.reduce(
        (sum, item) => sum.plus(new Decimal(item.lineTotal)),
        new Decimal(0)
      );
      const lineItemsTotalNumber = lineItemsTotal.toNumber();
      if (!compareAmounts(lineItemsTotalNumber, subtotal)) {
        throw new ValidationError(
          `Sum of bill line items (${lineItemsTotalNumber}) does not match bill subtotal (${subtotal})`
        );
      }
    }

    // 8. Create the bill
    const bill = await tx.bill.create({
      data: {
        billNumber,
        billDate: data.billDate || new Date(),
        dueDate: data.dueDate || null,
        status: 'Unpaid',
        subtotal,
        taxAmount,
        total,
        paidAmount: 0,
        vendorId: data.vendorId,
        purchaseOrderId: data.purchaseOrderId
      },
      include: {
        vendor: true,
        purchaseOrder: true
      }
    });

    // 9. Create bill line items (if provided)
    if (billItemsData.length > 0) {
      await tx.billItem.createMany({
        data: billItemsData.map(item => ({
          ...item,
          billId: bill.id
        }))
      });

      logger.info(`Created ${billItemsData.length} bill line items for bill ${billNumber}`);
    }

    // 10. Update PO billed amount and status
    // FIXED: Use Decimal for precise addition
    const updatedBilledAmount = formatAmount(new Decimal(po.billedAmount || 0).plus(new Decimal(total)).toNumber());
    let newPOStatus = po.status;

    // Auto-transition to Partial if first bill created
    if (po.status === 'Sent' && updatedBilledAmount > 0) {
      newPOStatus = 'Partial';
    }

    // Auto-transition to Paid if fully billed
    if (compareAmounts(updatedBilledAmount, po.total)) {
      newPOStatus = 'Paid';
    }

    await tx.purchaseOrder.update({
      where: { id: data.purchaseOrderId },
      data: {
        billedAmount: updatedBilledAmount,
        status: newPOStatus
      }
    });

    // 11. Create vendor ledger entry
    const vendor = await tx.vendor.findUnique({
      where: { id: data.vendorId }
    });

    // FIXED: Use Decimal for precise vendor balance calculation
    const newVendorBalance = formatAmount(new Decimal(vendor.currentBalance || 0).plus(new Decimal(total)).toNumber());

    await tx.vendorLedger.create({
      data: {
        vendorId: data.vendorId,
        entryDate: data.billDate || new Date(),
        description: `Bill ${billNumber}`,
        debit: total,
        credit: 0,
        balance: newVendorBalance,
        billId: bill.id
      }
    });

    // 12. Update vendor balance
    await tx.vendor.update({
      where: { id: data.vendorId },
      data: {
        currentBalance: newVendorBalance
      }
    });

    // 13. Create audit trail
    await tx.pOBillAudit.create({
      data: {
        purchaseOrderId: data.purchaseOrderId,
        action: 'BILL_CREATED',
        billId: bill.id,
        beforeState: {
          poStatus: po.status,
          billedAmount: new Decimal(po.billedAmount || 0).toNumber()
        },
        afterState: {
          poStatus: newPOStatus,
          billedAmount: updatedBilledAmount,
          billTotal: formatAmount(total)
        },
        performedBy: userId,
        metadata: {
          billNumber,
          vendorId: data.vendorId
        }
      }
    });

    // 14. Create journal entries for bill (DR: Inventory, DR: Input Tax, CR: A/P)
    // CRITICAL: Journal entry creation is MANDATORY - if it fails, entire transaction rolls back
    await JournalEntryService.createBillEntries(tx, {
      id: bill.id,
      billNumber,
      billDate: bill.billDate,
      subtotal,
      taxAmount,
      total,
      vendor: { name: vendor.name }
    });

    logger.info(`Bill created: ${billNumber}`, {
      billId: bill.id,
      poNumber: po.poNumber,
      amount: total,
      poStatus: `${po.status} → ${newPOStatus}`
    });

    return bill;
  });
}

/**
 * Cancel a bill (soft-cancel)
 * Only unpaid bills can be cancelled
 *
 * @param {string} billId - Bill ID
 * @param {string} reason - Cancellation reason
 * @param {string} userId - User performing cancellation
 * @returns {Promise<Object>} Cancelled bill
 */
async function cancelBill(billId, reason, userId) {
  return withTransaction(async (tx) => {
    // 1. Lock the bill
    const bill = await lockForUpdate(tx, 'Bill', billId);

    // 2. Validate bill can be cancelled
    if (bill.cancelledAt) {
      throw new ValidationError('Bill is already cancelled');
    }

    if (bill.status !== 'Unpaid') {
      throw new ValidationError(
        `Cannot cancel bill with status ${bill.status}. Only unpaid bills can be cancelled.`
      );
    }

    // FIXED: Use Decimal for comparison
    if (new Decimal(bill.paidAmount || 0).greaterThan(0)) {
      throw new ValidationError(
        `Cannot cancel bill with payments. Bill has ${bill.paidAmount} paid.`
      );
    }

    // 3. Lock the PO
    const po = await lockForUpdate(tx, 'PurchaseOrder', bill.purchaseOrderId);

    // 4. Soft-cancel the bill
    const cancelled = await tx.bill.update({
      where: { id: billId },
      data: {
        cancelledAt: new Date(),
        cancelReason: reason
      },
      include: {
        vendor: true,
        purchaseOrder: true
      }
    });

    // 5. Update PO billed amount
    // FIXED: Use Decimal for precise subtraction
    const newBilledAmount = formatAmount(new Decimal(po.billedAmount || 0).minus(new Decimal(bill.total)).toNumber());
    let newPOStatus = po.status;

    // Revert from Paid if needed
    // FIXED: Use Decimal for comparison
    const poTotalDec = new Decimal(po.total);
    const newBilledDec = new Decimal(newBilledAmount);
    if (po.status === 'Paid' && newBilledDec.lessThan(poTotalDec)) {
      newPOStatus = 'Partial';
    }

    // Revert from Partial if all bills cancelled
    if (po.status === 'Partial' && newBilledDec.isZero()) {
      newPOStatus = 'Sent';
    }

    await tx.purchaseOrder.update({
      where: { id: bill.purchaseOrderId },
      data: {
        billedAmount: newBilledAmount,
        status: newPOStatus
      }
    });

    // 6. Reverse vendor ledger entry
    const vendor = await tx.vendor.findUnique({
      where: { id: bill.vendorId }
    });

    // FIXED: Use Decimal for precise vendor balance calculation
    const newVendorBalance = formatAmount(new Decimal(vendor.currentBalance || 0).minus(new Decimal(bill.total)).toNumber());

    await tx.vendorLedger.create({
      data: {
        vendorId: bill.vendorId,
        entryDate: new Date(),
        description: `Bill ${bill.billNumber} cancelled: ${reason}`,
        debit: 0,
        credit: formatAmount(bill.total),
        balance: newVendorBalance,
        billId: bill.id
      }
    });

    // 7. Update vendor balance
    await tx.vendor.update({
      where: { id: bill.vendorId },
      data: {
        currentBalance: newVendorBalance
      }
    });

    // 8. Create audit trail
    await tx.pOBillAudit.create({
      data: {
        purchaseOrderId: bill.purchaseOrderId,
        action: 'BILL_CANCELLED',
        billId: bill.id,
        beforeState: {
          billStatus: bill.status,
          poStatus: po.status,
          billedAmount: formatAmount(po.billedAmount || 0)
        },
        afterState: {
          billStatus: 'Cancelled',
          poStatus: newPOStatus,
          billedAmount: newBilledAmount
        },
        performedBy: userId,
        metadata: { reason }
      }
    });

    // 9. Reverse journal entries for cancelled bill
    // CRITICAL: Journal entry reversal is MANDATORY - if it fails, entire transaction rolls back
    await JournalEntryService.reverseBillEntries(tx, {
      id: bill.id,
      billNumber: bill.billNumber,
      subtotal: bill.subtotal,
      taxAmount: bill.taxAmount,
      total: bill.total
    }, reason);

    logger.info(`Bill cancelled: ${bill.billNumber}`, {
      billId,
      reason,
      refundedToPO: formatAmount(bill.total)
    });

    return cancelled;
  });
}

/**
 * Update bill status based on payments
 * Internal helper, called by payment service
 *
 * @param {Object} tx - Transaction client
 * @param {string} billId - Bill ID
 * @returns {Promise<string>} New status
 */
async function updateBillStatus(tx, billId) {
  // FIXED: Add row-level lock to prevent race condition
  const bill = await lockForUpdate(tx, 'Bill', billId);

  if (!bill) {
    throw new ValidationError('Bill not found');
  }

  let newStatus = 'Unpaid';

  if (compareAmounts(bill.paidAmount, bill.total)) {
    newStatus = 'Paid';
  } else if (new Decimal(bill.paidAmount || 0).greaterThan(0)) {
    newStatus = 'Partial';
  }

  if (newStatus !== bill.status) {
    await tx.bill.update({
      where: { id: billId },
      data: { status: newStatus }
    });
  }

  return newStatus;
}

/**
 * Get bill with computed fields
 *
 * @param {string} billId - Bill ID
 * @returns {Promise<Object>} Bill with computed fields
 */
async function getBill(billId) {
  const bill = await db.prisma.bill.findUnique({
    where: { id: billId, deletedAt: null },
    include: {
      vendor: true,
      purchaseOrder: true,
      payments: {
        where: { deletedAt: null, voidedAt: null },
        orderBy: { paymentDate: 'desc' }
      }
    }
  });

  if (!bill) {
    throw new ValidationError('Bill not found');
  }

  // Add computed fields
  // FIXED: Use Decimal for precise remaining amount calculation
  bill.remainingAmount = formatAmount(new Decimal(bill.total).minus(new Decimal(bill.paidAmount || 0)).toNumber());
  bill.isCancelled = !!bill.cancelledAt;
  bill.canBePaid = !bill.cancelledAt && bill.remainingAmount > 0;
  // FIXED: Use Decimal for comparison
  bill.canBeCancelled = !bill.cancelledAt && bill.status === 'Unpaid' && new Decimal(bill.paidAmount || 0).isZero();

  return bill;
}

/**
 * Get all bills with filters
 *
 * PERFORMANCE OPTIMIZATION: Added pagination and SQL aggregation
 *
 * @param {Object} filters - Query filters
 * @param {string} filters.vendorId - Filter by vendor
 * @param {string} filters.status - Filter by status (comma-separated)
 * @param {string} filters.dateFrom - Filter by date from
 * @param {string} filters.dateTo - Filter by date to
 * @param {number} filters.page - Page number (default: 1)
 * @param {number} filters.limit - Items per page (default: 50)
 * @returns {Promise<Object>} Paginated bills with statistics
 */
async function getBills(filters = {}) {
  const where = { deletedAt: null, cancelledAt: null };

  if (filters.vendorId) {
    where.vendorId = filters.vendorId;
  }

  if (filters.status) {
    // Handle comma-separated status values (e.g., "Unpaid,Partial")
    const statuses = filters.status.split(',').map(s => s.trim());
    where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
  }

  if (filters.dateFrom && filters.dateTo) {
    where.billDate = {
      gte: new Date(filters.dateFrom),
      lte: new Date(filters.dateTo)
    };
  }

  // PERFORMANCE OPTIMIZATION: Add pagination
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 50;
  const skip = (page - 1) * limit;

  // PERFORMANCE OPTIMIZATION: Parallel queries for data + count + statistics
  // FIXED: Add performance monitoring
  const queryStartTime = Date.now();
  const [bills, totalCount, statistics] = await Promise.all([
    // Get paginated bills with selective field loading
    db.prisma.bill.findMany({
      where,
      select: {
        id: true,
        billNumber: true,
        billDate: true,
        dueDate: true,
        status: true,
        subtotal: true,
        taxAmount: true,
        total: true,
        paidAmount: true,
        cancelledAt: true,
        createdAt: true,
        vendor: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true
          }
        },
        purchaseOrder: {
          select: {
            id: true,
            poNumber: true,
            status: true,
            total: true
          }
        },
        _count: {
          select: {
            payments: { where: { voidedAt: null } }
          }
        }
      },
      orderBy: { billDate: 'desc' },
      skip,
      take: limit
    }),

    // Get total count for pagination
    db.prisma.bill.count({ where }),

    // Get statistics using SQL aggregation
    db.prisma.bill.groupBy({
      by: ['status'],
      where,
      _sum: {
        total: true,
        paidAmount: true
      },
      _count: true
    })
  ]);

  // Add computed fields
  const billsWithFields = bills.map(bill => {
    const remainingAmount = formatAmount(
      new Decimal(bill.total || 0).minus(new Decimal(bill.paidAmount || 0)).toNumber()
    );
    return {
      ...bill,
      remainingAmount,
      canBePaid: remainingAmount > 0
    };
  });

  // Calculate summary statistics from aggregation
  const stats = {
    totalAmount: 0,
    paidAmount: 0,
    remainingAmount: 0,
    totalBills: totalCount,
    byStatus: {}
  };

  statistics.forEach(stat => {
    const total = new Decimal(stat._sum.total || 0).toNumber();
    const paid = new Decimal(stat._sum.paidAmount || 0).toNumber();

    stats.totalAmount += total;
    stats.paidAmount += paid;
    stats.byStatus[stat.status] = {
      count: stat._count,
      total: total,
      paid: paid,
      remaining: formatAmount(total - paid)
    };
  });

  stats.remainingAmount = formatAmount(stats.totalAmount - stats.paidAmount);

  // FIXED: Log slow queries for performance optimization
  const queryTime = Date.now() - queryStartTime;
  if (queryTime > 1000) {
    logger.warn('Slow bill query detected', {
      queryTime,
      filters,
      resultCount: bills.length,
      totalCount
    });
  }

  return {
    bills: billsWithFields,
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
 * Update bill (only unpaid bills with no payments)
 *
 * @param {string} billId - Bill ID
 * @param {Object} updates - Updated data
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Updated bill
 */
async function updateBill(billId, updates, userId) {
  return withTransaction(async (tx) => {
    const bill = await lockForUpdate(tx, 'Bill', billId);

    // Can only update unpaid bills with no payments
    if (bill.status !== 'Unpaid') {
      throw new ValidationError('Can only update unpaid bills');
    }

    if (new Decimal(bill.paidAmount || 0).greaterThan(0)) {
      throw new ValidationError('Cannot update bill with payments');
    }

    const updated = await tx.bill.update({
      where: { id: billId },
      data: {
        billDate: updates.billDate || bill.billDate,
        dueDate: updates.dueDate || bill.dueDate,
        subtotal: updates.subtotal || bill.subtotal,
        taxAmount: updates.taxAmount || bill.taxAmount,
        total: updates.total || bill.total,
        updatedAt: new Date()
      },
      include: {
        vendor: true,
        purchaseOrder: true
      }
    });

    // Create audit trail
    await tx.pOBillAudit.create({
      data: {
        purchaseOrderId: bill.purchaseOrderId,
        billId,
        action: 'BILL_UPDATED',
        beforeState: {
          total: new Decimal(bill.total || 0).toNumber(),
          subtotal: new Decimal(bill.subtotal || 0).toNumber(),
          taxAmount: new Decimal(bill.taxAmount || 0).toNumber()
        },
        afterState: {
          total: new Decimal(updated.total || 0).toNumber(),
          subtotal: new Decimal(updated.subtotal || 0).toNumber(),
          taxAmount: new Decimal(updated.taxAmount || 0).toNumber()
        },
        performedBy: userId
      }
    });

    return updated;
  });
}

/**
 * Helper function: Create bill and optionally auto-create inventory items
 * RECOMMENDED WORKFLOW: Use this to ensure bills have corresponding inventory
 *
 * @param {Object} billData - Bill creation data
 * @param {Array} inventoryItems - Optional: Array of items to create in inventory
 * @param {String} userId - User performing the action
 * @returns {Promise<Object>} Created bill and inventory items
 */
async function createBillWithInventory(billData, inventoryItems, userId) {
  // Step 1: Create the bill
  const bill = await createBill(billData, userId);

  // Step 2: If inventory items provided, create them and link to PO
  if (inventoryItems && inventoryItems.length > 0) {
    try {
      const inventoryService = require('./inventoryService');

      const inventoryResults = await inventoryService.bulkCreateItemsFromPO(
        billData.purchaseOrderId,
        inventoryItems,
        userId
      );

      logger.info(`Bill ${bill.billNumber} created with ${inventoryResults.success.length} inventory items`, {
        billId: bill.id,
        successCount: inventoryResults.success.length,
        failedCount: inventoryResults.failed.length
      });

      return {
        bill,
        inventory: inventoryResults
      };
    } catch (error) {
      logger.error('Failed to create inventory items for bill', {
        billId: bill.id,
        billNumber: bill.billNumber,
        error: error.message
      });

      // Bill is still created, but inventory creation failed
      // Return bill with error info for handling by controller
      return {
        bill,
        inventory: null,
        inventoryError: error.message
      };
    }
  }

  // No inventory items provided
  return { bill, inventory: null };
}

module.exports = {
  createBill,
  createBillWithInventory, // NEW: Recommended workflow
  cancelBill,
  updateBill,
  updateBillStatus,
  getBill,
  getBills
};
