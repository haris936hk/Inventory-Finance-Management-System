// ========== src/services/inventoryLifecycleService.js ==========
const db = require('../config/database');
const logger = require('../config/logger');

/**
 * Comprehensive Inventory Lifecycle Management Service
 *
 * Handles the complete inventory state machine:
 * Available → Reserved → Sold/Delivered (or back to Available if cancelled)
 *
 * Provides race condition protection and audit trail
 */
class InventoryLifecycleService {

  /**
   * Inventory State Machine
   *
   * Valid state transitions:
   * Available → Reserved (when invoice created)
   * Reserved → Available (when invoice cancelled)
   * Reserved → Sold (when invoice fully paid)
   * Sold → Delivered (when physically delivered)
   *
   * Invalid transitions will throw errors
   */
  static VALID_TRANSITIONS = {
    'Available': ['Reserved', 'Sold'], // Direct sale possible
    'Reserved': ['Available', 'Sold'],
    'Sold': ['Delivered'],
    'Delivered': [], // Terminal state
    'Under Repair': ['Available', 'Returned'], // Can be repaired or returned
    'Returned': [] // Terminal state - cannot be changed
  };

  static CHANGE_REASONS = {
    INVOICE_CREATED: 'INVOICE_CREATED',
    INVOICE_CANCELLED: 'INVOICE_CANCELLED',
    INVOICE_PAID: 'INVOICE_PAID',
    INVOICE_DELIVERED: 'INVOICE_DELIVERED',
    MANUAL: 'MANUAL',
    SYSTEM_CLEANUP: 'SYSTEM_CLEANUP',
    REPAIR_COMPLETED: 'REPAIR_COMPLETED',
    ITEM_RETURNED: 'ITEM_RETURNED'
  };

  /**
   * Reserve items for an invoice (Available → Reserved)
   * @param {string[]} itemIds - Array of item IDs to reserve
   * @param {string} invoiceId - Invoice ID
   * @param {string} userId - User making the reservation
   * @param {Object} tx - Optional transaction object (for use within existing transaction)
   * @returns {Promise<Object>} Reservation result
   */
  async reserveItemsForInvoice(itemIds, invoiceId, userId, tx = null) {
    if (!itemIds || itemIds.length === 0) {
      throw new Error('Item IDs are required');
    }

    // CRITICAL FIX: Support both standalone and within-transaction usage
    const executeOperation = async (prisma) => {
      // CRITICAL FIX: Acquire row-level locks to prevent race conditions
      // Lock items in sorted order to prevent deadlocks
      const sortedItemIds = [...itemIds].sort();

      for (const itemId of sortedItemIds) {
        await prisma.$queryRaw`SELECT * FROM "Item" WHERE id = ${itemId} FOR UPDATE NOWAIT`;
      }

      // Now fetch the locked items
      const items = await prisma.item.findMany({
        where: {
          id: { in: itemIds },
          deletedAt: null
        },
        orderBy: { id: 'asc' }
      });

      // Validate all items exist
      if (items.length !== itemIds.length) {
        const foundIds = items.map(item => item.id);
        const missingIds = itemIds.filter(id => !foundIds.includes(id));
        throw new Error(`Items not found: ${missingIds.join(', ')}`);
      }

      // Check inventory status and validate transitions
      const invalidItems = [];
      const reservationData = [];

      for (const item of items) {
        if (item.inventoryStatus !== 'Available') {
          invalidItems.push({
            id: item.id,
            serialNumber: item.serialNumber,
            currentStatus: item.inventoryStatus
          });
          continue;
        }

        reservationData.push({
          itemId: item.id,
          fromStatus: item.inventoryStatus,
          toStatus: 'Reserved'
        });
      }

      if (invalidItems.length > 0) {
        throw new Error(`Cannot reserve items. Invalid status: ${JSON.stringify(invalidItems)}`);
      }

      // Update all items to Reserved status atomically
      const updatePromises = items.map(item =>
        prisma.item.update({
          where: { id: item.id },
          data: {
            inventoryStatus: 'Reserved'
          }
        })
      );

      const updatedItems = await Promise.all(updatePromises);

      // Record status change history
      const historyPromises = reservationData.map(data =>
        prisma.inventoryStatusHistory.create({
          data: {
            itemId: data.itemId,
            fromStatus: data.fromStatus,
            toStatus: data.toStatus,
            changeReason: InventoryLifecycleService.CHANGE_REASONS.INVOICE_CREATED,
            referenceType: 'Invoice',
            referenceId: invoiceId,
            changedBy: userId,
            notes: `Reserved for Invoice ${invoiceId}`
          }
        })
      );

      const historyEntries = await Promise.all(historyPromises);

      logger.info(`Reserved ${items.length} items for Invoice ${invoiceId} by user ${userId}`);

      return {
        reservedItems: updatedItems,
        historyEntries,
        reservationCount: items.length,
        invoiceId
      };
    };

    // If transaction provided, use it; otherwise create new transaction
    if (tx) {
      return await executeOperation(tx);
    } else {
      return await db.transaction(executeOperation);
    }
  }

  /**
   * Cancel invoice and release reserved items (Reserved → Available)
   * @param {string} invoiceId - Invoice ID
   * @param {string} userId - User cancelling the invoice
   * @param {Object} tx - Optional transaction object (for use within existing transaction)
   * @returns {Promise<Object>} Release result
   */
  async releaseItemsForInvoiceCancellation(invoiceId, userId, tx = null) {
    // CRITICAL FIX: Support both standalone and within-transaction usage
    const executeOperation = async (prisma) => {
      // Fetch item IDs from InvoiceItem relationship
      const invoiceItems = await prisma.invoiceItem.findMany({
        where: { invoiceId },
        select: { itemId: true },
        orderBy: { itemId: 'asc' }
      });

      if (invoiceItems.length === 0) {
        logger.warn(`No items found for Invoice ${invoiceId}`);
        return {
          releasedItems: [],
          releaseCount: 0,
          invoiceId
        };
      }

      const itemIds = invoiceItems.map(ii => ii.itemId);

      // Lock items in sorted order to prevent deadlocks
      const sortedItemIds = [...itemIds].sort();
      for (const itemId of sortedItemIds) {
        await prisma.$queryRaw`SELECT * FROM "Item" WHERE id = ${itemId} FOR UPDATE NOWAIT`;
      }

      // Now fetch the locked items with full data
      const reservedItems = await prisma.item.findMany({
        where: {
          id: { in: sortedItemIds },
          inventoryStatus: 'Reserved',
          deletedAt: null
        },
        orderBy: { id: 'asc' }
      });

      // Update all items back to Available status
      const updatePromises = reservedItems.map(item =>
        prisma.item.update({
          where: { id: item.id },
          data: {
            inventoryStatus: 'Available'
          }
        })
      );

      const releasedItems = await Promise.all(updatePromises);

      // Record status change history
      const historyPromises = reservedItems.map(item =>
        prisma.inventoryStatusHistory.create({
          data: {
            itemId: item.id,
            fromStatus: 'Reserved',
            toStatus: 'Available',
            changeReason: InventoryLifecycleService.CHANGE_REASONS.INVOICE_CANCELLED,
            referenceType: 'Invoice',
            referenceId: invoiceId,
            changedBy: userId,
            notes: `Released due to Invoice ${invoiceId} cancellation`
          }
        })
      );

      const historyEntries = await Promise.all(historyPromises);

      logger.info(`Released ${reservedItems.length} items from cancelled Invoice ${invoiceId} by user ${userId}`);

      return {
        releasedItems,
        historyEntries,
        releaseCount: reservedItems.length,
        invoiceId
      };
    };

    // If transaction provided, use it; otherwise create new transaction
    if (tx) {
      return await executeOperation(tx);
    } else {
      return await db.transaction(executeOperation);
    }
  }

  /**
   * Mark items as sold when invoice is fully paid (Reserved → Sold)
   * @param {string} invoiceId - Invoice ID
   * @param {string} userId - User processing the payment
   * @param {Object} tx - Optional transaction object (for use within existing transaction)
   * @returns {Promise<Object>} Sale result
   */
  async markItemsAsSoldForInvoice(invoiceId, userId, tx = null) {
    // CRITICAL FIX: Support both standalone and within-transaction usage
    const executeOperation = async (prisma) => {
      // Fetch item IDs from InvoiceItem relationship
      const invoiceItems = await prisma.invoiceItem.findMany({
        where: { invoiceId },
        select: { itemId: true },
        orderBy: { itemId: 'asc' }
      });

      if (invoiceItems.length === 0) {
        logger.warn(`No items found for Invoice ${invoiceId}`);
        return {
          soldItems: [],
          saleCount: 0,
          invoiceId
        };
      }

      const itemIds = invoiceItems.map(ii => ii.itemId);

      // Lock items in sorted order to prevent deadlocks
      const sortedItemIds = [...itemIds].sort();
      for (const itemId of sortedItemIds) {
        await prisma.$queryRaw`SELECT * FROM "Item" WHERE id = ${itemId} FOR UPDATE NOWAIT`;
      }

      // Now fetch the locked items with full data (only Reserved items)
      const reservedItems = await prisma.item.findMany({
        where: {
          id: { in: sortedItemIds },
          inventoryStatus: 'Reserved',
          deletedAt: null
        },
        orderBy: { id: 'asc' }
      });

      // Update all items to Sold status
      // CRITICAL: Keep physical status unchanged (should remain 'In Store' or current status)
      const updatePromises = reservedItems.map(item =>
        prisma.item.update({
          where: { id: item.id },
          data: {
            inventoryStatus: 'Sold',
            // Physical status remains unchanged (In Store, In Lab, or Handover)
            outboundDate: new Date()
          }
        })
      );

      const soldItems = await Promise.all(updatePromises);

      // Record status change history
      const historyPromises = reservedItems.map(item =>
        prisma.inventoryStatusHistory.create({
          data: {
            itemId: item.id,
            fromStatus: 'Reserved',
            toStatus: 'Sold',
            changeReason: InventoryLifecycleService.CHANGE_REASONS.INVOICE_PAID,
            referenceType: 'Invoice',
            referenceId: invoiceId,
            changedBy: userId,
            notes: `Sold via Invoice ${invoiceId} payment`
          }
        })
      );

      const historyEntries = await Promise.all(historyPromises);

      logger.info(`Marked ${reservedItems.length} items as sold for Invoice ${invoiceId} by user ${userId}`);

      return {
        soldItems,
        historyEntries,
        saleCount: reservedItems.length,
        invoiceId
      };
    };

    // If transaction provided, use it; otherwise create new transaction
    if (tx) {
      return await executeOperation(tx);
    } else {
      return await db.transaction(executeOperation);
    }
  }

  /**
   * Reverse items from Sold back to Reserved (when payment voided)
   * CRITICAL FIX: Prevents inventory permanently locked as "Sold"
   * @param {string} invoiceId - Invoice ID
   * @param {string} userId - User voiding the payment
   * @param {Object} tx - Optional transaction object (for use within existing transaction)
   * @returns {Promise<Object>} Reversal result
   */
  async reverseItemsFromSoldToReserved(invoiceId, userId, tx = null) {
    // Support both standalone and within-transaction usage
    const executeOperation = async (prisma) => {
      // Fetch item IDs from InvoiceItem relationship
      const invoiceItems = await prisma.invoiceItem.findMany({
        where: { invoiceId },
        select: { itemId: true }
      });

      if (invoiceItems.length === 0) {
        logger.warn(`No items found for Invoice ${invoiceId}`);
        return {
          reversedItems: [],
          reversalCount: 0,
          invoiceId
        };
      }

      const itemIds = invoiceItems.map(ii => ii.itemId);

      // Find all items sold for this invoice
      const soldItems = await prisma.item.findMany({
        where: {
          id: { in: itemIds },
          inventoryStatus: 'Sold',
          deletedAt: null
        },
        orderBy: { id: 'asc' }
      });

      // Reverse items back to Reserved status
      const updatePromises = soldItems.map(item =>
        prisma.item.update({
          where: { id: item.id },
          data: {
            inventoryStatus: 'Reserved',
            status: 'In Store', // Reset physical status back
            outboundDate: null  // Clear outbound date
          }
        })
      );

      const reversedItems = await Promise.all(updatePromises);

      // Record status change history
      const historyPromises = soldItems.map(item =>
        prisma.inventoryStatusHistory.create({
          data: {
            itemId: item.id,
            fromStatus: 'Sold',
            toStatus: 'Reserved',
            changeReason: 'PAYMENT_VOIDED',
            referenceType: 'Invoice',
            referenceId: invoiceId,
            changedBy: userId,
            notes: `Reversed from Sold to Reserved due to payment void for Invoice ${invoiceId}`
          }
        })
      );

      const historyEntries = await Promise.all(historyPromises);

      logger.info(`Reversed ${soldItems.length} items from Sold to Reserved for Invoice ${invoiceId} by user ${userId}`);

      return {
        reversedItems,
        historyEntries,
        reversalCount: soldItems.length,
        invoiceId
      };
    };

    // If transaction provided, use it; otherwise create new transaction
    if (tx) {
      return await executeOperation(tx);
    } else {
      return await db.transaction(executeOperation);
    }
  }

  /**
   * Mark items as delivered (Sold → Delivered)
   * @param {string} invoiceId - Invoice ID
   * @param {string} userId - User processing the delivery
   * @param {Object} deliveryInfo - Delivery information
   * @param {Object} tx - Optional transaction object (for use within existing transaction)
   * @returns {Promise<Object}> Delivery result
   */
  async markItemsAsDeliveredForInvoice(invoiceId, userId, deliveryInfo = {}, tx = null) {
    // CRITICAL FIX: Support both standalone and within-transaction usage
    const executeOperation = async (prisma) => {
      // Fetch item IDs from InvoiceItem relationship
      const invoiceItems = await prisma.invoiceItem.findMany({
        where: { invoiceId },
        select: { itemId: true },
        orderBy: { itemId: 'asc' }
      });

      if (invoiceItems.length === 0) {
        throw new Error(`No items found for Invoice ${invoiceId}`);
      }

      const itemIds = invoiceItems.map(ii => ii.itemId);

      // Lock items in sorted order to prevent deadlocks
      const sortedItemIds = [...itemIds].sort();
      for (const itemId of sortedItemIds) {
        await prisma.$queryRaw`SELECT * FROM "Item" WHERE id = ${itemId} FOR UPDATE NOWAIT`;
      }

      // Now fetch the locked items with full data (only Sold items)
      const soldItems = await prisma.item.findMany({
        where: {
          id: { in: sortedItemIds },
          inventoryStatus: 'Sold',
          deletedAt: null
        },
        orderBy: { id: 'asc' }
      });

      // Update all items to Delivered status
      // CRITICAL: Physical status must be 'Handover' (not 'Delivered')
      const updatePromises = soldItems.map(item =>
        prisma.item.update({
          where: { id: item.id },
          data: {
            inventoryStatus: 'Delivered',
            status: 'Handover', // Physical status: Handover (valid: In Store, In Lab, Handover)
            handoverDate: new Date(),
            handoverBy: deliveryInfo.handoverBy || userId,
            handoverTo: deliveryInfo.handoverTo,
            handoverToNIC: deliveryInfo.handoverToNIC,
            handoverToPhone: deliveryInfo.handoverToPhone,
            handoverDetails: deliveryInfo.handoverDetails
          }
        })
      );

      const deliveredItems = await Promise.all(updatePromises);

      // Record status change history
      const historyPromises = soldItems.map(item =>
        prisma.inventoryStatusHistory.create({
          data: {
            itemId: item.id,
            fromStatus: 'Sold',
            toStatus: 'Delivered',
            changeReason: InventoryLifecycleService.CHANGE_REASONS.INVOICE_DELIVERED,
            referenceType: 'Invoice',
            referenceId: invoiceId,
            changedBy: userId,
            notes: `Delivered for Invoice ${invoiceId}${deliveryInfo.handoverTo ? ' to ' + deliveryInfo.handoverTo : ''}`
          }
        })
      );

      const historyEntries = await Promise.all(historyPromises);

      logger.info(`Marked ${soldItems.length} items as delivered for Invoice ${invoiceId} by user ${userId}`);

      return {
        deliveredItems,
        historyEntries,
        deliveryCount: soldItems.length,
        invoiceId
      };
    };

    // If transaction provided, use it; otherwise create new transaction
    if (tx) {
      return await executeOperation(tx);
    } else {
      return await db.transaction(executeOperation);
    }
  }

  /**
   * Get inventory status report for an invoice
   * @param {string} invoiceId - Invoice ID
   * @returns {Promise<Object>} Status report
   */
  async getInvoiceInventoryStatus(invoiceId) {
    // Fetch item IDs from InvoiceItem relationship
    const invoiceItems = await db.prisma.invoiceItem.findMany({
      where: { invoiceId },
      select: { itemId: true }
    });

    if (invoiceItems.length === 0) {
      return {
        invoiceId,
        totalItems: 0,
        statusSummary: {},
        items: []
      };
    }

    const itemIds = invoiceItems.map(ii => ii.itemId);

    const items = await db.prisma.item.findMany({
      where: {
        id: { in: itemIds },
        deletedAt: null
      },
      include: {
        statusTracking: {
          where: { referenceId: invoiceId },
          orderBy: { changeDate: 'desc' }
        },
        category: true,
        model: {
          include: { company: true }
        }
      }
    });

    const statusSummary = items.reduce((summary, item) => {
      const status = item.inventoryStatus;
      if (!summary[status]) {
        summary[status] = 0;
      }
      summary[status]++;
      return summary;
    }, {});

    return {
      invoiceId,
      totalItems: items.length,
      statusSummary,
      items: items.map(item => ({
        id: item.id,
        serialNumber: item.serialNumber,
        inventoryStatus: item.inventoryStatus,
        status: item.status,
        description: `${item.category.name} - ${item.model.company.name} ${item.model.name}`,
        lastStatusChange: item.statusTracking[0]?.changeDate || item.updatedAt
      }))
    };
  }

  /**
   * Cleanup orphaned reserved items (no longer needed with simplified reservation)
   * Reserved items are always tied to invoices via InvoiceItem relationship
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupOrphanedReservations() {
    return await db.transaction(async (prisma) => {
      // Find reserved items that don't have a corresponding InvoiceItem entry
      const allReservedItems = await prisma.item.findMany({
        where: {
          inventoryStatus: 'Reserved',
          deletedAt: null
        },
        select: { id: true }
      });

      if (allReservedItems.length === 0) {
        return { cleanedCount: 0, orphanedItems: [] };
      }

      const reservedItemIds = allReservedItems.map(i => i.id);

      // Find which ones have invoice items
      const itemsWithInvoices = await prisma.invoiceItem.findMany({
        where: { itemId: { in: reservedItemIds } },
        select: { itemId: true },
        distinct: ['itemId']
      });

      const itemsWithInvoiceIds = new Set(itemsWithInvoices.map(ii => ii.itemId));

      // Orphaned items are those without invoice items
      const orphanedItemIds = reservedItemIds.filter(id => !itemsWithInvoiceIds.has(id));

      if (orphanedItemIds.length === 0) {
        return { cleanedCount: 0, orphanedItems: [] };
      }

      // Update orphaned items back to Available
      await prisma.item.updateMany({
        where: { id: { in: orphanedItemIds } },
        data: { inventoryStatus: 'Available' }
      });

      // Record cleanup history
      const historyPromises = orphanedItemIds.map(itemId =>
        prisma.inventoryStatusHistory.create({
          data: {
            itemId,
            fromStatus: 'Reserved',
            toStatus: 'Available',
            changeReason: InventoryLifecycleService.CHANGE_REASONS.SYSTEM_CLEANUP,
            changedBy: 'system',
            notes: `Orphaned reservation cleanup (no invoice link)`
          }
        })
      );

      await Promise.all(historyPromises);

      logger.info(`Cleaned up ${orphanedItemIds.length} orphaned reservations`);

      return {
        cleanedCount: orphanedItemIds.length,
        orphanedItems: orphanedItemIds
      };
    });
  }

  /**
   * Validate state transition
   * @param {string} fromStatus - Current status
   * @param {string} toStatus - Target status
   * @throws {Error} If transition is invalid
   */
  validateStatusTransition(fromStatus, toStatus) {
    // Check terminal states first
    if (fromStatus === 'Returned' || fromStatus === 'Delivered') {
      throw new Error(`Cannot change status from ${fromStatus} (terminal state)`);
    }

    const validNextStates = InventoryLifecycleService.VALID_TRANSITIONS[fromStatus];
    if (!validNextStates || !validNextStates.includes(toStatus)) {
      throw new Error(`Invalid inventory status transition: ${fromStatus} → ${toStatus}`);
    }
  }

  /**
   * Mark item as repaired (Under Repair → Available)
   * Used when a used item has been successfully repaired and is ready for sale
   * @param {string} itemId - Item ID
   * @param {string} userId - User performing the action
   * @param {Object} tx - Optional transaction object
   * @returns {Promise<Object>} Updated item
   */
  async markItemAsRepaired(itemId, userId, tx = null) {
    const executeOperation = async (prisma) => {
      // Lock the item to prevent concurrent updates
      await prisma.$queryRaw`SELECT * FROM "Item" WHERE id = ${itemId} FOR UPDATE NOWAIT`;

      const item = await prisma.item.findUnique({
        where: { id: itemId, deletedAt: null }
      });

      if (!item) {
        throw new Error('Item not found');
      }

      // Validate transition
      this.validateStatusTransition(item.inventoryStatus, 'Available');

      // Update item to Available status
      const updatedItem = await prisma.item.update({
        where: { id: itemId },
        data: {
          inventoryStatus: 'Available',
          status: 'In Store',
          repaired: 'Yes'
        },
        include: {
          category: true,
          model: {
            include: {
              company: true
            }
          },
          vendor: true,
          customer: true
        }
      });

      // Create audit trail
      await prisma.inventoryStatusHistory.create({
        data: {
          itemId: itemId,
          fromStatus: item.inventoryStatus,
          toStatus: 'Available',
          changeReason: InventoryLifecycleService.CHANGE_REASONS.REPAIR_COMPLETED,
          changedBy: userId,
          notes: `Item repaired and ready for sale`
        }
      });

      logger.info(`Item ${item.serialNumber} marked as repaired by user ${userId}`);

      return { item: updatedItem };
    };

    if (tx) {
      return await executeOperation(tx);
    } else {
      return await db.transaction(executeOperation);
    }
  }

  /**
   * Mark item as returned (Under Repair → Returned)
   * Used when a used item cannot be repaired - TERMINAL STATE
   * @param {string} itemId - Item ID
   * @param {string} userId - User performing the action
   * @param {Object} tx - Optional transaction object
   * @returns {Promise<Object>} Updated item
   */
  async markItemAsReturned(itemId, userId, tx = null) {
    const executeOperation = async (prisma) => {
      // Lock the item to prevent concurrent updates
      await prisma.$queryRaw`SELECT * FROM "Item" WHERE id = ${itemId} FOR UPDATE NOWAIT`;

      const item = await prisma.item.findUnique({
        where: { id: itemId, deletedAt: null }
      });

      if (!item) {
        throw new Error('Item not found');
      }

      // Validate transition
      this.validateStatusTransition(item.inventoryStatus, 'Returned');

      // Update item to Returned status (terminal state)
      // CRITICAL: Physical status stays 'In Lab' (valid: In Store, In Lab, Handover)
      const updatedItem = await prisma.item.update({
        where: { id: itemId },
        data: {
          inventoryStatus: 'Returned',
          // Physical status remains 'In Lab' (item stays in lab as returned)
          repaired: 'Returned'
        },
        include: {
          category: true,
          model: {
            include: {
              company: true
            }
          },
          vendor: true,
          customer: true
        }
      });

      // Create audit trail
      await prisma.inventoryStatusHistory.create({
        data: {
          itemId: itemId,
          fromStatus: item.inventoryStatus,
          toStatus: 'Returned',
          changeReason: InventoryLifecycleService.CHANGE_REASONS.ITEM_RETURNED,
          changedBy: userId,
          notes: `Item returned - cannot be repaired (terminal state)`
        }
      });

      logger.info(`Item ${item.serialNumber} marked as returned (terminal) by user ${userId}`);

      return { item: updatedItem };
    };

    if (tx) {
      return await executeOperation(tx);
    } else {
      return await db.transaction(executeOperation);
    }
  }

  /**
   * Get detailed status history for items
   * @param {string[]} itemIds - Item IDs
   * @returns {Promise<Object[]>} Status history
   */
  async getItemStatusHistory(itemIds) {
    return await db.prisma.inventoryStatusHistory.findMany({
      where: {
        itemId: { in: itemIds }
      },
      include: {
        item: {
          select: {
            serialNumber: true,
            category: { select: { name: true } },
            model: {
              select: {
                name: true,
                company: { select: { name: true } }
              }
            }
          }
        },
        changedByUser: {
          select: { fullName: true }
        }
      },
      orderBy: [
        { itemId: 'asc' },
        { changeDate: 'desc' }
      ]
    });
  }
}

module.exports = new InventoryLifecycleService();