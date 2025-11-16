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
    'Delivered': [] // Terminal state
  };

  static CHANGE_REASONS = {
    INVOICE_CREATED: 'INVOICE_CREATED',
    INVOICE_CANCELLED: 'INVOICE_CANCELLED',
    INVOICE_PAID: 'INVOICE_PAID',
    INVOICE_DELIVERED: 'INVOICE_DELIVERED',
    MANUAL: 'MANUAL',
    SYSTEM_CLEANUP: 'SYSTEM_CLEANUP'
  };

  /**
   * Reserve items for an invoice (Available → Reserved)
   * @param {string[]} itemIds - Array of item IDs to reserve
   * @param {string} invoiceId - Invoice ID
   * @param {string} userId - User making the reservation
   * @param {Object} tx - Optional transaction object (if called within existing transaction)
   * @returns {Promise<Object>} Reservation result
   */
  async reserveItemsForInvoice(itemIds, invoiceId, userId, tx = null) {
    if (!itemIds || itemIds.length === 0) {
      throw new Error('Item IDs are required');
    }

    // Execute within provided transaction or create a new one
    const execute = async (prisma) => {
      // CRITICAL FIX: Use SELECT FOR UPDATE to lock items and prevent race conditions
      // FIXED: Add error context for lock failures
      // Lock items in consistent order (by ID) to prevent deadlocks
      try {
        await prisma.$executeRaw`
          SELECT * FROM "Item"
          WHERE id = ANY(${itemIds}::uuid[])
          AND "deletedAt" IS NULL
          ORDER BY id ASC
          FOR UPDATE
        `;
      } catch (error) {
        logger.error('Failed to lock items for reservation', {
          itemIds,
          invoiceId,
          userId,
          errorCode: error.code,
          errorMessage: error.message
        });
        throw new ValidationError(
          `Failed to lock inventory items for reservation: ${error.message}. ` +
          `This may indicate a deadlock or invalid item IDs. Please try again.`
        );
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
            currentStatus: item.inventoryStatus,
            reservedForId: item.reservedForId
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
            inventoryStatus: 'Reserved',
            reservedAt: new Date(),
            reservedBy: userId,
            reservedForType: 'Invoice',
            reservedForId: invoiceId,
            reservationExpiry: null // Permanent reservation for invoices
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
    return tx ? await execute(tx) : await db.transaction(execute);
  }

  /**
   * Cancel invoice and release reserved items (Reserved → Available)
   * @param {string} invoiceId - Invoice ID
   * @param {string} userId - User cancelling the invoice
   * @returns {Promise<Object>} Release result
   */
  async releaseItemsForInvoiceCancellation(invoiceId, userId) {
    return await db.transaction(async (prisma) => {
      // Find all items reserved for this invoice
      const reservedItems = await prisma.item.findMany({
        where: {
          reservedForType: 'Invoice',
          reservedForId: invoiceId,
          inventoryStatus: 'Reserved',
          deletedAt: null
        },
        orderBy: { id: 'asc' }
      });

      // FIXED: Enhanced empty result handling with diagnostic information
      if (reservedItems.length === 0) {
        // Check if invoice exists and get its status for better diagnostics
        const invoice = await prisma.invoice.findUnique({
          where: { id: invoiceId },
          select: { invoiceNumber: true, status: true }
        });

        logger.warn(`No reserved items found for Invoice ${invoiceId}`, {
          invoiceNumber: invoice?.invoiceNumber,
          invoiceStatus: invoice?.status,
          invoiceExists: !!invoice,
          possibleReasons: [
            'Items may have already been released',
            'Items may have been confirmed (sold)',
            'Invoice may not have had any items reserved',
            'Items may have been manually modified'
          ]
        });

        return {
          releasedItems: [],
          releaseCount: 0,
          invoiceId
        };
      }

      // Update all items back to Available status
      const updatePromises = reservedItems.map(item =>
        prisma.item.update({
          where: { id: item.id },
          data: {
            inventoryStatus: 'Available',
            reservedAt: null,
            reservedBy: null,
            reservedForType: null,
            reservedForId: null,
            reservationExpiry: null
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
    });
  }

  /**
   * Mark items as sold when invoice is fully paid (Reserved → Sold)
   * @param {string} invoiceId - Invoice ID
   * @param {string} userId - User processing the payment
   * @param {Object} tx - Optional Prisma transaction client (if null, creates new transaction)
   * @returns {Promise<Object>} Sale result
   */
  async markItemsAsSoldForInvoice(invoiceId, userId, tx = null) {
    const executeFn = async (prisma) => {
      // Find all items reserved for this invoice
      const reservedItems = await prisma.item.findMany({
        where: {
          reservedForType: 'Invoice',
          reservedForId: invoiceId,
          inventoryStatus: 'Reserved',
          deletedAt: null
        },
        orderBy: { id: 'asc' }
      });

      // FIXED: Enhanced empty result handling with diagnostic information
      if (reservedItems.length === 0) {
        // Check if invoice exists and get its status for better diagnostics
        const invoice = await prisma.invoice.findUnique({
          where: { id: invoiceId },
          select: { invoiceNumber: true, status: true }
        });

        logger.warn(`No reserved items found for confirmation (Invoice ${invoiceId})`, {
          invoiceNumber: invoice?.invoiceNumber,
          invoiceStatus: invoice?.status,
          invoiceExists: !!invoice,
          possibleReasons: [
            'Items may have already been confirmed (sold)',
            'Items may have been released back to Available',
            'Invoice may not have had any items reserved',
            'Items may have been manually modified'
          ]
        });

        return {
          soldItems: [],
          saleCount: 0,
          invoiceId
        };
      }

      // Update all items to Sold status
      const updatePromises = reservedItems.map(item =>
        prisma.item.update({
          where: { id: item.id },
          data: {
            inventoryStatus: 'Sold',
            status: 'Sold', // Also update physical status
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
      return await executeFn(tx);
    } else {
      return await db.transaction(executeFn);
    }
  }

  /**
   * Mark items as delivered (Sold → Delivered)
   * @param {string} invoiceId - Invoice ID
   * @param {string} userId - User processing the delivery
   * @param {Object} deliveryInfo - Delivery information
   * @returns {Promise<Object>} Delivery result
   */
  async markItemsAsDeliveredForInvoice(invoiceId, userId, deliveryInfo = {}) {
    return await db.transaction(async (prisma) => {
      // Find all items sold for this invoice
      const soldItems = await prisma.item.findMany({
        where: {
          reservedForType: 'Invoice',
          reservedForId: invoiceId,
          inventoryStatus: 'Sold',
          deletedAt: null
        },
        orderBy: { id: 'asc' }
      });

      // FIXED: Enhanced error message with diagnostic information
      if (soldItems.length === 0) {
        // Check invoice status for better error message
        const invoice = await prisma.invoice.findUnique({
          where: { id: invoiceId },
          select: { invoiceNumber: true, status: true }
        });

        logger.error(`No sold items found for Invoice ${invoiceId} during void operation`, {
          invoiceNumber: invoice?.invoiceNumber,
          invoiceStatus: invoice?.status,
          invoiceExists: !!invoice
        });

        throw new Error(
          `No sold items found for Invoice ${invoice?.invoiceNumber || invoiceId}. ` +
          `This invoice may have already been voided, or items were never marked as sold. ` +
          `Invoice status: ${invoice?.status || 'UNKNOWN'}`
        );
      }

      // Update all items to Delivered status
      const updatePromises = soldItems.map(item =>
        prisma.item.update({
          where: { id: item.id },
          data: {
            inventoryStatus: 'Delivered',
            status: 'Delivered',
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
    });
  }

  /**
   * Get inventory status report for an invoice
   * @param {string} invoiceId - Invoice ID
   * @returns {Promise<Object>} Status report
   */
  async getInvoiceInventoryStatus(invoiceId) {
    const items = await db.prisma.item.findMany({
      where: {
        reservedForType: 'Invoice',
        reservedForId: invoiceId,
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
        reservedAt: item.reservedAt,
        lastStatusChange: item.statusTracking[0]?.changeDate || item.updatedAt
      }))
    };
  }

  /**
   * Cleanup expired temporary reservations
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupExpiredReservations() {
    return await db.transaction(async (prisma) => {
      const expiredItems = await prisma.item.findMany({
        where: {
          inventoryStatus: 'Reserved',
          reservationExpiry: {
            lte: new Date()
          },
          deletedAt: null
        }
      });

      if (expiredItems.length === 0) {
        return { cleanedCount: 0, expiredItems: [] };
      }

      // Update expired items back to Available
      const updatePromises = expiredItems.map(item =>
        prisma.item.update({
          where: { id: item.id },
          data: {
            inventoryStatus: 'Available',
            reservedAt: null,
            reservedBy: null,
            reservedForType: null,
            reservedForId: null,
            reservationExpiry: null
          }
        })
      );

      const cleanedItems = await Promise.all(updatePromises);

      // Record cleanup history
      const historyPromises = expiredItems.map(item =>
        prisma.inventoryStatusHistory.create({
          data: {
            itemId: item.id,
            fromStatus: 'Reserved',
            toStatus: 'Available',
            changeReason: InventoryLifecycleService.CHANGE_REASONS.SYSTEM_CLEANUP,
            changedBy: 'system',
            notes: `Expired reservation cleanup`
          }
        })
      );

      await Promise.all(historyPromises);

      logger.info(`Cleaned up ${expiredItems.length} expired reservations`);

      return {
        cleanedCount: expiredItems.length,
        expiredItems: cleanedItems
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
    const validNextStates = InventoryLifecycleService.VALID_TRANSITIONS[fromStatus];
    if (!validNextStates || !validNextStates.includes(toStatus)) {
      throw new Error(`Invalid inventory status transition: ${fromStatus} → ${toStatus}`);
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