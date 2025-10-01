/**
 * Purchase Order Lifecycle Management Service
 *
 * Implements strict lifecycle: Draft → Sent → Partial → Completed
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
 */
const STATUS_TRANSITIONS = {
  'Draft': ['Sent', 'Cancelled'],
  'Sent': ['Partial', 'Completed', 'Cancelled'],
  'Partial': ['Completed', 'Cancelled'],
  'Completed': [], // Terminal state
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

    // Verify total = subtotal + tax
    if (!compareAmounts(total, subtotal + taxAmount)) {
      throw new ValidationError(
        `Total (${total}) must equal subtotal (${subtotal}) + tax (${taxAmount})`
      );
    }

    // Verify line items sum to subtotal
    const lineItemsTotal = data.lineItems.reduce((sum, item) => {
      return sum + formatAmount(item.totalPrice);
    }, 0);

    if (!compareAmounts(lineItemsTotal, subtotal)) {
      throw new ValidationError(
        `Line items total (${lineItemsTotal}) must equal subtotal (${subtotal})`
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

    // Validate status transition
    const allowedTransitions = STATUS_TRANSITIONS[po.status] || [];

    if (!allowedTransitions.includes(newStatus)) {
      throw new ValidationError(
        `Cannot transition from ${po.status} to ${newStatus}. Allowed: ${allowedTransitions.join(', ')}`
      );
    }

    // Additional validations
    if (newStatus === 'Completed') {
      // Can only complete if fully billed
      if (!compareAmounts(po.billedAmount, po.total)) {
        throw new ValidationError(
          `Cannot complete PO. Billed amount (${po.billedAmount}) must equal total (${po.total})`
        );
      }
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

module.exports = {
  createPurchaseOrder,
  updatePurchaseOrder,
  updatePurchaseOrderStatus,
  getPurchaseOrder,
  STATUS_TRANSITIONS
};
