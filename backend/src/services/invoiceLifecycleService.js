// ========== src/services/invoiceLifecycleService.js ==========
const db = require('../config/database');
const logger = require('../config/logger');
const inventoryLifecycleService = require('./inventoryLifecycleService');

/**
 * Invoice Lifecycle Management Service
 *
 * Handles automatic inventory status updates based on invoice lifecycle events:
 * - Invoice Created → Reserve Items
 * - Invoice Cancelled → Release Items
 * - Invoice Fully Paid → Mark Items as Sold
 * - Invoice Delivered → Mark Items as Delivered
 */
class InvoiceLifecycleService {

  /**
   * Handle invoice creation - Reserve inventory items
   * @param {string} invoiceId - Invoice ID
   * @param {string} userId - User creating the invoice
   * @returns {Promise<Object>} Reservation result
   */
  async handleInvoiceCreated(invoiceId, userId) {
    try {
      // Get invoice with items
      const invoice = await db.prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          items: {
            include: {
              item: true
            }
          }
        }
      });

      if (!invoice) {
        throw new Error(`Invoice ${invoiceId} not found`);
      }

      const itemIds = invoice.items.map(item => item.itemId);

      if (itemIds.length === 0) {
        logger.warn(`No items found for Invoice ${invoiceId}`);
        return { reservationCount: 0 };
      }

      // Reserve all invoice items
      const result = await inventoryLifecycleService.reserveItemsForInvoice(
        itemIds,
        invoiceId,
        userId
      );

      // Update invoice to track that items are reserved
      await db.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          notes: invoice.notes ?
            `${invoice.notes}\n[System] ${result.reservationCount} items reserved automatically.` :
            `[System] ${result.reservationCount} items reserved automatically.`
        }
      });

      logger.info(`Invoice ${invoiceId} created: Reserved ${result.reservationCount} items`);
      return result;

    } catch (error) {
      logger.error(`Error handling invoice creation ${invoiceId}:`, error);
      throw error;
    }
  }

  /**
   * Handle invoice cancellation - Release reserved items
   * @param {string} invoiceId - Invoice ID
   * @param {string} userId - User cancelling the invoice
   * @returns {Promise<Object>} Release result
   */
  async handleInvoiceCancelled(invoiceId, userId) {
    try {
      // Release all reserved items for this invoice
      const result = await inventoryLifecycleService.releaseItemsForInvoiceCancellation(
        invoiceId,
        userId
      );

      // Update invoice to track that items are released
      if (result.releaseCount > 0) {
        const invoice = await db.prisma.invoice.findUnique({
          where: { id: invoiceId },
          select: { notes: true }
        });

        await db.prisma.invoice.update({
          where: { id: invoiceId },
          data: {
            notes: invoice.notes ?
              `${invoice.notes}\n[System] ${result.releaseCount} items released automatically due to cancellation.` :
              `[System] ${result.releaseCount} items released automatically due to cancellation.`
          }
        });
      }

      logger.info(`Invoice ${invoiceId} cancelled: Released ${result.releaseCount} items`);
      return result;

    } catch (error) {
      logger.error(`Error handling invoice cancellation ${invoiceId}:`, error);
      throw error;
    }
  }

  /**
   * Handle invoice fully paid - Mark items as sold
   * @param {string} invoiceId - Invoice ID
   * @param {string} userId - User processing the payment
   * @returns {Promise<Object>} Sale result
   */
  async handleInvoiceFullyPaid(invoiceId, userId) {
    try {
      // Mark all reserved items as sold
      const result = await inventoryLifecycleService.markItemsAsSoldForInvoice(
        invoiceId,
        userId
      );

      // Update invoice to track that items are sold
      if (result.saleCount > 0) {
        const invoice = await db.prisma.invoice.findUnique({
          where: { id: invoiceId },
          select: { notes: true }
        });

        await db.prisma.invoice.update({
          where: { id: invoiceId },
          data: {
            notes: invoice.notes ?
              `${invoice.notes}\n[System] ${result.saleCount} items marked as sold automatically.` :
              `[System] ${result.saleCount} items marked as sold automatically.`
          }
        });
      }

      logger.info(`Invoice ${invoiceId} fully paid: Marked ${result.saleCount} items as sold`);
      return result;

    } catch (error) {
      logger.error(`Error handling invoice payment ${invoiceId}:`, error);
      throw error;
    }
  }

  /**
   * Handle invoice delivered - Mark items as delivered
   * @param {string} invoiceId - Invoice ID
   * @param {string} userId - User processing the delivery
   * @param {Object} deliveryInfo - Delivery information
   * @returns {Promise<Object>} Delivery result
   */
  async handleInvoiceDelivered(invoiceId, userId, deliveryInfo = {}) {
    try {
      // Mark all sold items as delivered
      const result = await inventoryLifecycleService.markItemsAsDeliveredForInvoice(
        invoiceId,
        userId,
        deliveryInfo
      );

      // Update invoice to track delivery
      if (result.deliveryCount > 0) {
        const invoice = await db.prisma.invoice.findUnique({
          where: { id: invoiceId },
          select: { notes: true }
        });

        await db.prisma.invoice.update({
          where: { id: invoiceId },
          data: {
            notes: invoice.notes ?
              `${invoice.notes}\n[System] ${result.deliveryCount} items marked as delivered automatically.` :
              `[System] ${result.deliveryCount} items marked as delivered automatically.`,
            deliveryDate: new Date(),
            deliveredBy: userId
          }
        });
      }

      logger.info(`Invoice ${invoiceId} delivered: Marked ${result.deliveryCount} items as delivered`);
      return result;

    } catch (error) {
      logger.error(`Error handling invoice delivery ${invoiceId}:`, error);
      throw error;
    }
  }

  /**
   * Handle status change - Automatic inventory management
   * @param {string} invoiceId - Invoice ID
   * @param {string} oldStatus - Previous status
   * @param {string} newStatus - New status
   * @param {string} userId - User making the change
   * @returns {Promise<Object>} Result of inventory operations
   */
  async handleStatusChange(invoiceId, oldStatus, newStatus, userId) {
    logger.info(`Invoice ${invoiceId} status change: ${oldStatus} → ${newStatus}`);

    const results = {
      invoiceId,
      oldStatus,
      newStatus,
      inventoryOperations: []
    };

    try {
      // Handle specific status transitions
      switch (newStatus) {
        case 'Cancelled':
          if (oldStatus !== 'Cancelled') {
            const releaseResult = await this.handleInvoiceCancelled(invoiceId, userId);
            results.inventoryOperations.push({
              operation: 'release',
              count: releaseResult.releaseCount,
              success: true
            });
          }
          break;

        case 'Paid':
          if (oldStatus !== 'Paid' && oldStatus !== 'Delivered') {
            const saleResult = await this.handleInvoiceFullyPaid(invoiceId, userId);
            results.inventoryOperations.push({
              operation: 'markAsSold',
              count: saleResult.saleCount,
              success: true
            });
          }
          break;

        case 'Delivered':
          // First mark as paid if not already
          if (oldStatus !== 'Paid' && oldStatus !== 'Delivered') {
            const saleResult = await this.handleInvoiceFullyPaid(invoiceId, userId);
            results.inventoryOperations.push({
              operation: 'markAsSold',
              count: saleResult.saleCount,
              success: true
            });
          }
          // Then mark as delivered
          const deliveryResult = await this.handleInvoiceDelivered(invoiceId, userId);
          results.inventoryOperations.push({
            operation: 'markAsDelivered',
            count: deliveryResult.deliveryCount,
            success: true
          });
          break;

        default:
          logger.debug(`No inventory operations needed for status change to ${newStatus}`);
          break;
      }

      return results;

    } catch (error) {
      logger.error(`Error handling status change for Invoice ${invoiceId}:`, error);
      results.inventoryOperations.push({
        operation: 'statusChange',
        error: error.message,
        success: false
      });
      throw error;
    }
  }

  /**
   * Get complete invoice lifecycle status
   * @param {string} invoiceId - Invoice ID
   * @returns {Promise<Object>} Complete status information
   */
  async getInvoiceLifecycleStatus(invoiceId) {
    try {
      // Get invoice details
      const invoice = await db.prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          customer: { select: { name: true, phone: true } },
          items: {
            include: {
              item: {
                select: {
                  id: true,
                  serialNumber: true,
                  inventoryStatus: true,
                  status: true,
                  reservedAt: true
                }
              }
            }
          }
        }
      });

      if (!invoice) {
        throw new Error(`Invoice ${invoiceId} not found`);
      }

      // Get inventory status from the lifecycle service
      const inventoryStatus = await inventoryLifecycleService.getInvoiceInventoryStatus(invoiceId);

      // Get status history for all items
      const itemIds = invoice.items.map(item => item.itemId);
      const statusHistory = itemIds.length > 0 ?
        await inventoryLifecycleService.getItemStatusHistory(itemIds) : [];

      return {
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          total: invoice.total,
          paidAmount: invoice.paidAmount,
          customer: invoice.customer
        },
        inventory: inventoryStatus,
        lifecycle: {
          totalItems: inventoryStatus.totalItems,
          statusBreakdown: inventoryStatus.statusSummary,
          isInventoryConsistent: this.validateInventoryConsistency(invoice.status, inventoryStatus.statusSummary)
        },
        history: statusHistory
      };

    } catch (error) {
      logger.error(`Error getting lifecycle status for Invoice ${invoiceId}:`, error);
      throw error;
    }
  }

  /**
   * Validate inventory consistency with invoice status
   * @param {string} invoiceStatus - Current invoice status
   * @param {Object} inventoryStatusSummary - Inventory status breakdown
   * @returns {boolean} True if consistent
   */
  validateInventoryConsistency(invoiceStatus, inventoryStatusSummary) {
    switch (invoiceStatus) {
      case 'Draft':
      case 'Sent':
        // Items should be Available or Reserved
        return !inventoryStatusSummary.Sold && !inventoryStatusSummary.Delivered;

      case 'Partial':
        // Mixed states allowed
        return true;

      case 'Paid':
        // Items should be Reserved or Sold
        return !inventoryStatusSummary.Available && !inventoryStatusSummary.Delivered;

      case 'Delivered':
        // Items should be Delivered
        return inventoryStatusSummary.Delivered > 0 && !inventoryStatusSummary.Available;

      case 'Cancelled':
        // Items should be Available (released)
        return inventoryStatusSummary.Available > 0 &&
               !inventoryStatusSummary.Reserved &&
               !inventoryStatusSummary.Sold &&
               !inventoryStatusSummary.Delivered;

      default:
        return false;
    }
  }

  /**
   * Fix inventory inconsistencies for an invoice
   * @param {string} invoiceId - Invoice ID
   * @param {string} userId - User requesting the fix
   * @returns {Promise<Object>} Fix results
   */
  async fixInventoryInconsistencies(invoiceId, userId) {
    const status = await this.getInvoiceLifecycleStatus(invoiceId);

    if (status.lifecycle.isInventoryConsistent) {
      return { message: 'No inconsistencies found', fixes: [] };
    }

    const fixes = [];
    const invoiceStatus = status.invoice.status;

    // Apply fixes based on invoice status
    try {
      switch (invoiceStatus) {
        case 'Cancelled':
          const releaseResult = await this.handleInvoiceCancelled(invoiceId, userId);
          fixes.push(`Released ${releaseResult.releaseCount} items`);
          break;

        case 'Paid':
          const saleResult = await this.handleInvoiceFullyPaid(invoiceId, userId);
          fixes.push(`Marked ${saleResult.saleCount} items as sold`);
          break;

        case 'Delivered':
          const deliveryResult = await this.handleInvoiceDelivered(invoiceId, userId);
          fixes.push(`Marked ${deliveryResult.deliveryCount} items as delivered`);
          break;

        default:
          fixes.push('No automatic fixes available for current status');
          break;
      }

      logger.info(`Fixed inventory inconsistencies for Invoice ${invoiceId}: ${fixes.join(', ')}`);
      return { message: 'Inconsistencies fixed', fixes };

    } catch (error) {
      logger.error(`Error fixing inconsistencies for Invoice ${invoiceId}:`, error);
      throw error;
    }
  }
}

module.exports = new InvoiceLifecycleService();