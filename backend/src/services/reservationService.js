// ========== src/services/reservationService.js ==========
const db = require('../config/database');
const logger = require('../config/logger');
const { v4: uuidv4 } = require('uuid');

class ReservationService {
  /**
   * Create a reservation session and reserve items
   */
  async reserveItems(itemIds, userId, reason = 'INVOICE_CREATION', expiryMinutes = 30) {
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + (expiryMinutes * 60 * 1000));

    return await db.transaction(async (prisma) => {
      // Check if any items are already reserved or not available
      const existingReservations = await prisma.itemReservation.findMany({
        where: {
          itemId: { in: itemIds },
          expiresAt: { gt: new Date() }
        }
      });

      if (existingReservations.length > 0) {
        const reservedItemIds = existingReservations.map(r => r.itemId);
        throw new Error(`Items already reserved: ${reservedItemIds.join(', ')}`);
      }

      // Check items availability and status
      const items = await prisma.item.findMany({
        where: {
          id: { in: itemIds },
          status: 'In Store',
          deletedAt: null
        },
        include: {
          model: {
            include: {
              company: true
            }
          },
          category: true
        }
      });

      if (items.length !== itemIds.length) {
        const foundIds = items.map(i => i.id);
        const missingIds = itemIds.filter(id => !foundIds.includes(id));
        throw new Error(`Items not available for reservation: ${missingIds.join(', ')}`);
      }

      // Create reservations
      const reservations = await Promise.all(
        itemIds.map(itemId =>
          prisma.itemReservation.create({
            data: {
              itemId,
              sessionId,
              reservedBy: userId,
              reason,
              expiresAt
            }
          })
        )
      );

      logger.info(`Reserved ${itemIds.length} items for user ${userId}, session ${sessionId}`);

      return {
        sessionId,
        reservations,
        items,
        expiresAt
      };
    });
  }

  /**
   * Get grouped available items for selection
   */
  async getGroupedAvailableItems(filters = {}) {
    const where = {
      status: 'In Store',
      deletedAt: null
    };

    // Apply filters
    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }
    if (filters.modelId) {
      where.modelId = filters.modelId;
    }
    if (filters.condition) {
      where.condition = filters.condition;
    }

    // Get all available items
    const items = await db.prisma.item.findMany({
      where,
      include: {
        model: {
          include: {
            company: true
          }
        },
        category: true,
        reservations: {
          where: {
            expiresAt: { gt: new Date() }
          }
        }
      }
    });

    // Filter out currently reserved items
    const availableItems = items.filter(item => item.reservations.length === 0);

    // Group by model + specifications + condition
    const groupedItems = {};

    for (const item of availableItems) {
      const groupKey = `${item.modelId}_${item.condition}_${JSON.stringify(item.specifications || {})}`;

      if (!groupedItems[groupKey]) {
        groupedItems[groupKey] = {
          modelId: item.modelId,
          model: item.model,
          category: item.category,
          condition: item.condition,
          specifications: item.specifications,
          availableCount: 0,
          items: [],
          samplePrice: item.sellingPrice || item.purchasePrice || 0
        };
      }

      groupedItems[groupKey].availableCount++;
      groupedItems[groupKey].items.push({
        id: item.id,
        serialNumber: item.serialNumber,
        purchasePrice: item.purchasePrice,
        sellingPrice: item.sellingPrice,
        inboundDate: item.inboundDate
      });
    }

    return Object.values(groupedItems);
  }

  /**
   * Auto-assign items based on user preference
   */
  async autoAssignItems(groupKey, quantity, assignmentPreference = 'FIFO', userId) {
    const groupedItems = await this.getGroupedAvailableItems();
    const group = groupedItems.find(g =>
      `${g.modelId}_${g.condition}_${JSON.stringify(g.specifications || {})}` === groupKey
    );

    if (!group) {
      throw new Error('Item group not found');
    }

    if (group.availableCount < quantity) {
      throw new Error(`Only ${group.availableCount} items available, requested ${quantity}`);
    }

    let sortedItems = [...group.items];

    // Apply sorting based on preference
    switch (assignmentPreference) {
      case 'FIFO':
        sortedItems.sort((a, b) => new Date(a.inboundDate) - new Date(b.inboundDate));
        break;
      case 'LIFO':
        sortedItems.sort((a, b) => new Date(b.inboundDate) - new Date(a.inboundDate));
        break;
      case 'HIGHEST_COST':
        sortedItems.sort((a, b) => (b.purchasePrice || 0) - (a.purchasePrice || 0));
        break;
      case 'LOWEST_COST':
        sortedItems.sort((a, b) => (a.purchasePrice || 0) - (b.purchasePrice || 0));
        break;
      default:
        // Keep current order
        break;
    }

    // Select the required quantity
    const selectedItems = sortedItems.slice(0, quantity);
    const selectedItemIds = selectedItems.map(item => item.id);

    // Reserve the selected items
    const reservation = await this.reserveItems(selectedItemIds, userId);

    return {
      ...reservation,
      group,
      selectedItems,
      assignmentPreference
    };
  }

  /**
   * Get reservations by session ID
   */
  async getReservationsBySession(sessionId) {
    const reservations = await db.prisma.itemReservation.findMany({
      where: { sessionId },
      include: {
        item: {
          include: {
            model: {
              include: {
                company: true
              }
            },
            category: true
          }
        },
        user: {
          select: {
            fullName: true
          }
        }
      }
    });

    return reservations;
  }

  /**
   * Release reservations by session ID
   */
  async releaseReservations(sessionId, userId = null) {
    const where = { sessionId };
    if (userId) {
      where.reservedBy = userId;
    }

    const result = await db.prisma.itemReservation.deleteMany({ where });

    logger.info(`Released ${result.count} reservations for session ${sessionId}`);
    return result;
  }

  /**
   * Clean up expired reservations
   */
  async cleanupExpiredReservations() {
    const result = await db.prisma.itemReservation.deleteMany({
      where: {
        expiresAt: { lt: new Date() }
      }
    });

    if (result.count > 0) {
      logger.info(`Cleaned up ${result.count} expired reservations`);
    }

    return result;
  }

  /**
   * Extend reservation expiry
   */
  async extendReservation(sessionId, additionalMinutes = 30) {
    const newExpiryTime = new Date(Date.now() + (additionalMinutes * 60 * 1000));

    const result = await db.prisma.itemReservation.updateMany({
      where: { sessionId },
      data: { expiresAt: newExpiryTime }
    });

    logger.info(`Extended reservation ${sessionId} by ${additionalMinutes} minutes`);
    return { sessionId, newExpiryTime, updatedCount: result.count };
  }
}

module.exports = new ReservationService();