/**
 * Purchase Order Lifecycle Management Service
 *
 * Implements strict lifecycle: Draft → Sent → Partial → Paid → Delivered
 * with proper concurrency controls and data integrity
 *
 * ========== PURCHASE ORDER LIFECYCLE ==========
 *
 * Expected Flow (User Requirements):
 * 1. PO Created (Draft) → No inventory, no vendor balance change
 * 2. PO Sent to Vendor → Still no inventory/balance change
 * 3. Bill Received from Vendor → Vendor balance INCREASES (payable recorded)
 * 4. Items Physically Received → Inventory added incrementally (partial deliveries supported)
 * 5. Payment Made to Vendor → Vendor balance DECREASES
 *
 * Key Business Rules:
 * - Bills must be created BEFORE items can be received (vendor balance increases first)
 * - Multiple bills can be created against one PO (partial billing)
 * - SUM(bills.total) <= PO.total (enforced with locks)
 * - Partial deliveries supported (items received in multiple shipments)
 * - PO can only be cancelled in Draft/Sent status (before bills/items)
 * - Cannot cancel bill if items have been received in inventory
 * - Bill amounts cannot be updated (cancel + new bill for corrections)
 *
 * Status Transitions:
 * - Draft → Sent: PO sent to vendor for processing
 * - Sent → Partial: First bill created (SUM(bills) < PO.total)
 * - Sent → Paid: Fully billed in single bill (SUM(bills) = PO.total)
 * - Partial → Paid: Remaining bills created (SUM(bills) = PO.total)
 * - Paid → Delivered: All items received (receivedQuantities = ordered quantities)
 * - Draft/Sent → Cancelled: Only if no bills and no items received
 *
 * Data Integrity Enforcements:
 * - Bills: Lock PO before creating bill, validate SUM(bills) <= PO.total
 * - Payments: Lock bill, validate SUM(payments) <= bill.total, check PO not cancelled
 * - Inventory Receipt: Lock PO, validate bill exists, validate received <= ordered
 * - Vendor Ledger: Updated atomically with bill creation/cancellation
 * - All operations use DECIMAL(18,4) precision with formatAmount()
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
const { generatePONumber } = require('../utils/generateId');

/**
 * Valid PO status transitions
 * Draft → Sent → Partial (partial bills) → Paid (fully billed) → Delivered (items received in inventory)
 *
 * CRITICAL: PO can only be cancelled from Draft/Sent states (before bills are created)
 * Once bills exist (Partial status), cancellation is prohibited to maintain data integrity
 */
const STATUS_TRANSITIONS = {
  'Draft': ['Sent', 'Cancelled'],
  'Sent': ['Partial', 'Paid', 'Cancelled'],
  'Partial': ['Paid'],  // FIX: Cannot cancel once bills exist (was: ['Paid', 'Cancelled'])
  'Paid': ['Delivered'], // Can only deliver after fully paid
  'Delivered': [], // Terminal state
  'Cancelled': [] // Terminal state
};

/**
 * Create a new Purchase Order
 *
 * @param {Object} data - PO data
 * @param {string} data.vendorId - Vendor ID
 * @param {Date} data.orderDate - Order date
 * @param {Date} data.expectedDate - Expected delivery date
 * @param {Array} data.lineItems - Array of line items
 * @param {number} data.subtotal - Subtotal amount
 * @param {number} data.taxAmount - Tax amount
 * @param {number} data.total - Total amount
 * @returns {Promise<Object>} Created PO
 */
async function createPurchaseOrder(data) {
  return withTransaction(async (tx) => {
    // Validate amounts
    const subtotal = formatAmount(data.subtotal);
    const taxAmount = formatAmount(data.taxAmount || 0);
    const total = formatAmount(data.total);

    // Verify line items sum to subtotal (check this first)
    const lineItemsTotal = data.lineItems.reduce((sum, item) => {
      return sum + formatAmount(item.totalPrice);
    }, 0);

    if (!compareAmounts(lineItemsTotal, subtotal)) {
      throw new ValidationError(
        `Line items total (${lineItemsTotal}) must equal subtotal (${subtotal})`
      );
    }

    // Verify total = subtotal + tax
    if (!compareAmounts(total, subtotal + taxAmount)) {
      throw new ValidationError(
        `Total (${total}) must equal subtotal (${subtotal}) + tax (${taxAmount})`
      );
    }

    // Verify vendor exists
    const vendor = await tx.vendor.findUnique({
      where: { id: data.vendorId, deletedAt: null }
    });

    if (!vendor) {
      throw new ValidationError('Vendor not found');
    }

    // Generate PO number
    const poNumber = await generatePONumber();

    // Create PO with line items
    const purchaseOrder = await tx.purchaseOrder.create({
      data: {
        poNumber,
        orderDate: data.orderDate || new Date(),
        expectedDate: data.expectedDate || null,
        status: 'Draft', // Always start as Draft
        subtotal,
        taxAmount,
        total,
        billedAmount: 0, // Initialize to 0
        vendorId: data.vendorId,
        lineItems: {
          create: data.lineItems.map(item => ({
            productModelId: item.productModelId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: formatAmount(item.unitPrice),
            totalPrice: formatAmount(item.totalPrice),
            specifications: item.specifications || {},
            notes: item.notes
          }))
        }
      },
      include: {
        vendor: true,
        lineItems: {
          include: {
            productModel: {
              include: {
                category: true,
                company: true
              }
            }
          }
        }
      }
    });

    logger.info(`PO created: ${poNumber}`, {
      poId: purchaseOrder.id,
      vendor: vendor.name,
      total: total
    });

    return purchaseOrder;
  });
}

/**
 * Update Purchase Order Status
 *
 * @param {string} poId - PO ID
 * @param {string} newStatus - New status
 * @param {string} userId - User performing the action
 * @returns {Promise<Object>} Updated PO
 */
async function updatePurchaseOrderStatus(poId, newStatus, userId) {
  return withTransaction(async (tx) => {
    // Lock the PO row
    const po = await lockForUpdate(tx, 'PurchaseOrder', poId);

    // Specific status validations (check these first for clearer error messages)
    if (newStatus === 'Paid') {
      // Can only mark as Paid if fully billed
      if (!compareAmounts(po.billedAmount, po.total)) {
        throw new ValidationError(
          `Cannot mark as Paid. Billed amount (${po.billedAmount}) must equal total (${po.total})`
        );
      }
    }

    if (newStatus === 'Delivered') {
      // Can only mark as Delivered if status is Paid
      if (po.status !== 'Paid') {
        throw new ValidationError(
          `Cannot mark as Delivered. PO must be in Paid status first.`
        );
      }
    }

    // Validate status transition
    const allowedTransitions = STATUS_TRANSITIONS[po.status] || [];

    if (!allowedTransitions.includes(newStatus)) {
      throw new ValidationError(
        `Cannot transition from ${po.status} to ${newStatus}. Allowed: ${allowedTransitions.join(', ')}`
      );
    }

    // Update status
    const updated = await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: newStatus,
        updatedAt: new Date()
      },
      include: {
        vendor: true
      }
    });

    // Create audit log
    await tx.pOBillAudit.create({
      data: {
        purchaseOrderId: poId,
        action: 'STATUS_CHANGED',
        beforeState: { status: po.status },
        afterState: { status: newStatus },
        performedBy: userId,
        metadata: { reason: 'Manual status update' }
      }
    });

    logger.info(`PO status updated: ${po.poNumber}`, {
      poId,
      oldStatus: po.status,
      newStatus
    });

    return updated;
  });
}

/**
 * Update Purchase Order (Draft only)
 *
 * @param {string} poId - PO ID
 * @param {Object} updates - Updated data
 * @returns {Promise<Object>} Updated PO
 */
async function updatePurchaseOrder(poId, updates) {
  return withTransaction(async (tx) => {
    // Lock the PO
    const po = await lockForUpdate(tx, 'PurchaseOrder', poId);

    // Can only update Draft POs
    if (po.status !== 'Draft') {
      throw new ValidationError(
        `Cannot update PO in ${po.status} status. Only Draft POs can be edited.`
      );
    }

    // Validate amounts if provided
    if (updates.total !== undefined) {
      const subtotal = formatAmount(updates.subtotal || po.subtotal);
      const taxAmount = formatAmount(updates.taxAmount || po.taxAmount);
      const total = formatAmount(updates.total);

      if (!compareAmounts(total, subtotal + taxAmount)) {
        throw new ValidationError('Total must equal subtotal + tax');
      }
    }

    // Delete existing line items if new ones provided
    if (updates.lineItems) {
      await tx.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: poId }
      });
    }

    // Update PO
    const updated = await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        orderDate: updates.orderDate || po.orderDate,
        expectedDate: updates.expectedDate,
        vendorId: updates.vendorId || po.vendorId,
        subtotal: updates.subtotal ? formatAmount(updates.subtotal) : undefined,
        taxAmount: updates.taxAmount ? formatAmount(updates.taxAmount) : undefined,
        total: updates.total ? formatAmount(updates.total) : undefined,
        lineItems: updates.lineItems ? {
          create: updates.lineItems.map(item => ({
            productModelId: item.productModelId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: formatAmount(item.unitPrice),
            totalPrice: formatAmount(item.totalPrice),
            specifications: item.specifications || {},
            notes: item.notes
          }))
        } : undefined
      },
      include: {
        vendor: true,
        lineItems: {
          include: {
            productModel: {
              include: {
                category: true,
                company: true
              }
            }
          }
        }
      }
    });

    return updated;
  });
}

/**
 * Cancel a Purchase Order
 * Can only cancel POs in Draft or Sent status (before bills/items received)
 *
 * @param {string} poId - PO ID
 * @param {string} reason - Cancellation reason
 * @param {string} userId - User performing cancellation
 * @returns {Promise<Object>} Cancelled PO
 */
async function cancelPurchaseOrder(poId, reason, userId) {
  return withTransaction(async (tx) => {
    // 1. Lock the PO
    const po = await lockForUpdate(tx, 'PurchaseOrder', poId);

    // 2. Validate PO can be cancelled (only Draft/Sent status)
    if (!['Draft', 'Sent'].includes(po.status)) {
      throw new ValidationError(
        `Cannot cancel PO in ${po.status} status. Only Draft or Sent POs can be cancelled.`
      );
    }

    // 3. Check for existing bills (even cancelled ones indicate history)
    const billCount = await tx.bill.count({
      where: {
        purchaseOrderId: poId,
        deletedAt: null,
        cancelledAt: null
      }
    });

    if (billCount > 0) {
      throw new ValidationError(
        `Cannot cancel PO with existing bills. ${billCount} active bill(s) found. Please cancel bills first.`
      );
    }

    // 4. Check for received items in inventory
    const itemCount = await tx.item.count({
      where: {
        purchaseOrderId: poId,
        deletedAt: null
      }
    });

    if (itemCount > 0) {
      throw new ValidationError(
        `Cannot cancel PO with received items. ${itemCount} item(s) found in inventory for this PO.`
      );
    }

    // 5. Mark PO as cancelled
    const cancelled = await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: 'Cancelled',
        cancelledAt: new Date(),
        cancelReason: reason
      },
      include: {
        vendor: true,
        lineItems: true
      }
    });

    // 6. Create audit trail
    await tx.pOBillAudit.create({
      data: {
        purchaseOrderId: poId,
        action: 'PO_CANCELLED',
        beforeState: {
          status: po.status
        },
        afterState: {
          status: 'Cancelled',
          cancelReason: reason
        },
        performedBy: userId,
        metadata: {
          reason,
          poNumber: po.poNumber
        }
      }
    });

    logger.info(`PO cancelled: ${po.poNumber}`, {
      poId,
      reason,
      previousStatus: po.status
    });

    return cancelled;
  });
}

/**
 * Get Purchase Order with computed fields
 *
 * @param {string} poId - PO ID
 * @returns {Promise<Object>} PO with computed fields
 */
async function getPurchaseOrder(poId) {
  const po = await db.prisma.purchaseOrder.findUnique({
    where: { id: poId, deletedAt: null },
    include: {
      vendor: true,
      lineItems: {
        include: {
          productModel: {
            include: {
              category: true,
              company: true
            }
          }
        }
      },
      bills: {
        where: {
          deletedAt: null,
          cancelledAt: null
        },
        include: {
          _count: {
            select: { payments: true }
          }
        }
      }
    }
  });

  if (!po) {
    throw new ValidationError('Purchase Order not found');
  }

  // Add computed fields (FIX: Use formatAmount for precision)
  po.remainingAmount = formatAmount(po.total - po.billedAmount);
  po.canCreateBill = po.status !== 'Cancelled' &&
                     po.status !== 'Completed' &&
                     po.remainingAmount > 0;

  return po;
}

/**
 * Get all purchase orders with filters
 *
 * @param {Object} filters - Query filters
 * @param {string} filters.vendorId - Filter by vendor
 * @param {string} filters.status - Filter by status
 * @param {string} filters.include - Include related data
 * @returns {Promise<Array>} Purchase orders
 */
async function getPurchaseOrders(filters = {}) {
  const where = { deletedAt: null };

  if (filters.vendorId) {
    where.vendorId = filters.vendorId;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  // Build include object
  const include = {
    vendor: true,
    _count: {
      select: {
        lineItems: true,
        bills: true
      }
    }
  };

  // Include line items if requested
  if (filters.include === 'lineItems') {
    include.lineItems = {
      include: {
        productModel: {
          include: {
            category: true,
            company: true
          }
        }
      }
    };
  }

  const purchaseOrders = await db.prisma.purchaseOrder.findMany({
    where,
    include,
    orderBy: { orderDate: 'desc' }
  });

  // Add computed fields (FIX: Use formatAmount for precision)
  return purchaseOrders.map(po => {
    const remainingAmount = formatAmount(po.total - po.billedAmount);
    return {
      ...po,
      remainingAmount,
      canCreateBill: po.status !== 'Cancelled' &&
                     po.status !== 'Completed' &&
                     remainingAmount > 0
    };
  });
}

/**
 * Check if PO is fully delivered and update status accordingly
 *
 * @param {string} poId - Purchase Order ID
 * @param {string} userId - User ID performing the check
 * @returns {Promise<Object>} Updated PO or current PO if no change needed
 */
async function checkAndUpdateDeliveryStatus(poId, userId) {
  return withTransaction(async (tx) => {
    // Lock and fetch PO with line items
    const po = await lockForUpdate(tx, 'PurchaseOrder', poId);

    if (!po) {
      throw new ValidationError('Purchase Order not found');
    }

    // Fetch line items
    const lineItems = await tx.purchaseOrderItem.findMany({
      where: { purchaseOrderId: poId }
    });

    if (lineItems.length === 0) {
      logger.info(`PO ${po.poNumber} has no line items`);
      return po;
    }

    // Check if all line items are fully received
    const receivedQuantities = po.receivedQuantities || {};
    let allItemsReceived = true;

    for (const lineItem of lineItems) {
      const receivedQty = receivedQuantities[lineItem.id] || 0;
      if (receivedQty < lineItem.quantity) {
        allItemsReceived = false;
        break;
      }
    }

    // If all items received and PO is in Paid status, update to Delivered
    if (allItemsReceived && po.status === 'Paid') {
      const updated = await tx.purchaseOrder.update({
        where: { id: poId },
        data: {
          status: 'Delivered',
          updatedAt: new Date()
        },
        include: {
          vendor: true,
          lineItems: true
        }
      });

      // Create audit log
      await tx.pOBillAudit.create({
        data: {
          purchaseOrderId: poId,
          action: 'STATUS_CHANGED',
          beforeState: { status: po.status },
          afterState: { status: 'Delivered' },
          performedBy: userId,
          metadata: {
            reason: 'All items received in inventory',
            receivedQuantities
          }
        }
      });

      logger.info(`PO ${po.poNumber} marked as Delivered`, {
        poId,
        totalLineItems: lineItems.length,
        receivedQuantities
      });

      return updated;
    }

    return po;
  });
}

/**
 * Get items linked to a Purchase Order
 *
 * @param {string} poId - Purchase Order ID
 * @returns {Promise<Array>} Items linked to this PO
 */
async function getPurchaseOrderItems(poId) {
  const items = await db.prisma.item.findMany({
    where: {
      purchaseOrderId: poId,
      deletedAt: null
    },
    include: {
      category: true,
      model: {
        include: {
          company: true
        }
      },
      vendor: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  return items;
}

module.exports = {
  createPurchaseOrder,
  updatePurchaseOrder,
  updatePurchaseOrderStatus,
  cancelPurchaseOrder,  // NEW: Dedicated cancellation function with validations
  getPurchaseOrder,
  getPurchaseOrders,
  checkAndUpdateDeliveryStatus,
  getPurchaseOrderItems,
  STATUS_TRANSITIONS
};
