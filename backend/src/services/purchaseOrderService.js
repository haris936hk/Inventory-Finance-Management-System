/**
 * Purchase Order Lifecycle Management Service
 *
 * Implements strict lifecycle: Draft → Sent → Partial → Paid → Delivered
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
const { generatePONumber } = require('../utils/generateId');

/**
 * Valid PO status transitions
 * Draft → Sent → Partial (partial bills) → Paid (fully billed) → Delivered (items received in inventory)
 */
const STATUS_TRANSITIONS = {
  'Draft': ['Sent', 'Cancelled'],
  'Sent': ['Partial', 'Paid', 'Cancelled'],
  'Partial': ['Paid', 'Cancelled'],
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

  // Add computed fields
  po.remainingAmount = formatAmount(parseFloat(po.total) - parseFloat(po.billedAmount));
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

  // Add computed fields
  return purchaseOrders.map(po => ({
    ...po,
    remainingAmount: formatAmount(parseFloat(po.total) - parseFloat(po.billedAmount)),
    canCreateBill: po.status !== 'Cancelled' &&
                   po.status !== 'Completed' &&
                   formatAmount(parseFloat(po.total) - parseFloat(po.billedAmount)) > 0
  }));
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
  getPurchaseOrder,
  getPurchaseOrders,
  checkAndUpdateDeliveryStatus,
  getPurchaseOrderItems,
  STATUS_TRANSITIONS
};
