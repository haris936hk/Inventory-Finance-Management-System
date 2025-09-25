// ========== src/services/backgroundCleanupService.js ==========
const cron = require('node-cron');
const logger = require('../config/logger');
const inventoryLifecycleService = require('./inventoryLifecycleService');

/**
 * Background Cleanup Service
 *
 * Handles periodic cleanup tasks for inventory management:
 * - Clean up expired temporary reservations
 * - Monitor and alert on inconsistencies
 * - Generate periodic reports
 */
class BackgroundCleanupService {
  constructor() {
    this.isRunning = false;
    this.scheduledJobs = [];
  }

  /**
   * Start all background cleanup jobs
   */
  start() {
    if (this.isRunning) {
      logger.warn('Background cleanup service is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting background cleanup service...');

    // Clean up expired reservations every 15 minutes
    const cleanupJob = cron.schedule('*/15 * * * *', async () => {
      try {
        await this.cleanupExpiredReservations();
      } catch (error) {
        logger.error('Error in cleanup job:', error);
      }
    }, { scheduled: false });

    // Run consistency checks every hour
    const consistencyJob = cron.schedule('0 * * * *', async () => {
      try {
        await this.checkConsistency();
      } catch (error) {
        logger.error('Error in consistency check:', error);
      }
    }, { scheduled: false });

    // Generate daily report at 6 AM
    const reportJob = cron.schedule('0 6 * * *', async () => {
      try {
        await this.generateDailyReport();
      } catch (error) {
        logger.error('Error in daily report generation:', error);
      }
    }, { scheduled: false });

    this.scheduledJobs = [cleanupJob, consistencyJob, reportJob];

    // Start all jobs
    this.scheduledJobs.forEach(job => job.start());

    logger.info('Background cleanup service started successfully');
  }

  /**
   * Stop all background jobs
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.scheduledJobs.forEach(job => job.destroy());
    this.scheduledJobs = [];
    this.isRunning = false;

    logger.info('Background cleanup service stopped');
  }

  /**
   * Clean up expired reservations
   */
  async cleanupExpiredReservations() {
    logger.info('Running expired reservations cleanup...');

    try {
      const result = await inventoryLifecycleService.cleanupExpiredReservations();

      if (result.cleanedCount > 0) {
        logger.info(`Cleaned up ${result.cleanedCount} expired reservations`);
      } else {
        logger.debug('No expired reservations found');
      }

      return result;
    } catch (error) {
      logger.error('Error cleaning up expired reservations:', error);
      throw error;
    }
  }

  /**
   * Check for inventory inconsistencies
   */
  async checkConsistency() {
    logger.debug('Running inventory consistency checks...');

    const db = require('../config/database');

    try {
      // Check for items reserved without proper invoice reference
      const orphanedReservations = await db.prisma.item.findMany({
        where: {
          inventoryStatus: 'Reserved',
          reservedForType: 'Invoice',
          reservedForId: { not: null },
          deletedAt: null
        },
        include: {
          invoiceItems: true
        }
      });

      const inconsistencies = orphanedReservations.filter(item =>
        item.invoiceItems.length === 0 ||
        !item.invoiceItems.some(invoiceItem =>
          invoiceItem.invoiceId === item.reservedForId
        )
      );

      if (inconsistencies.length > 0) {
        logger.warn(`Found ${inconsistencies.length} orphaned reservations:`, {
          items: inconsistencies.map(item => ({
            id: item.id,
            serialNumber: item.serialNumber,
            reservedForId: item.reservedForId
          }))
        });

        // Could automatically fix these or send alerts
        // For now, just log them
      }

      // Check for items marked as sold but not in any invoice
      const orphanedSales = await db.prisma.item.findMany({
        where: {
          inventoryStatus: 'Sold',
          invoiceItems: { none: {} },
          deletedAt: null
        },
        select: {
          id: true,
          serialNumber: true,
          outboundDate: true
        }
      });

      if (orphanedSales.length > 0) {
        logger.warn(`Found ${orphanedSales.length} items marked as sold but not in any invoice:`, {
          items: orphanedSales.map(item => ({
            id: item.id,
            serialNumber: item.serialNumber,
            outboundDate: item.outboundDate
          }))
        });
      }

      return {
        orphanedReservations: inconsistencies.length,
        orphanedSales: orphanedSales.length,
        totalInconsistencies: inconsistencies.length + orphanedSales.length
      };

    } catch (error) {
      logger.error('Error checking inventory consistency:', error);
      throw error;
    }
  }

  /**
   * Generate daily inventory report
   */
  async generateDailyReport() {
    logger.info('Generating daily inventory report...');

    const db = require('../config/database');

    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get status changes from yesterday
      const statusChanges = await db.prisma.inventoryStatusHistory.findMany({
        where: {
          changeDate: {
            gte: yesterday,
            lt: today
          }
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
          }
        }
      });

      // Aggregate by change type
      const changesByType = statusChanges.reduce((acc, change) => {
        const key = `${change.fromStatus || 'NEW'} → ${change.toStatus}`;
        if (!acc[key]) {
          acc[key] = 0;
        }
        acc[key]++;
        return acc;
      }, {});

      // Get current inventory status
      const currentStatus = await db.prisma.item.groupBy({
        by: ['inventoryStatus'],
        _count: { inventoryStatus: true },
        where: { deletedAt: null }
      });

      const report = {
        date: yesterday.toISOString().split('T')[0],
        statusChanges: {
          total: statusChanges.length,
          byType: changesByType
        },
        currentInventory: currentStatus.reduce((acc, status) => {
          acc[status.inventoryStatus] = status._count.inventoryStatus;
          return acc;
        }, {}),
        summary: {
          totalItems: currentStatus.reduce((sum, s) => sum + s._count.inventoryStatus, 0),
          availableItems: currentStatus.find(s => s.inventoryStatus === 'Available')?._count.inventoryStatus || 0,
          reservedItems: currentStatus.find(s => s.inventoryStatus === 'Reserved')?._count.inventoryStatus || 0,
          soldItems: currentStatus.find(s => s.inventoryStatus === 'Sold')?._count.inventoryStatus || 0,
          deliveredItems: currentStatus.find(s => s.inventoryStatus === 'Delivered')?._count.inventoryStatus || 0
        }
      };

      logger.info('Daily inventory report generated:', {
        statusChanges: report.statusChanges.total,
        currentInventory: report.summary
      });

      // In a real system, you might want to:
      // - Send this report via email
      // - Store it in the database
      // - Send it to a monitoring service
      // - Generate alerts for unusual patterns

      return report;

    } catch (error) {
      logger.error('Error generating daily report:', error);
      throw error;
    }
  }

  /**
   * Manual cleanup trigger (for testing/admin use)
   */
  async runCleanupNow() {
    logger.info('Running manual cleanup...');

    const results = {
      expiredReservations: await this.cleanupExpiredReservations(),
      consistencyCheck: await this.checkConsistency()
    };

    logger.info('Manual cleanup completed:', results);
    return results;
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: this.scheduledJobs.length,
      nextRun: {
        cleanup: this.scheduledJobs[0]?.nextDate()?.toDate(),
        consistency: this.scheduledJobs[1]?.nextDate()?.toDate(),
        report: this.scheduledJobs[2]?.nextDate()?.toDate()
      }
    };
  }
}

// Export singleton instance
module.exports = new BackgroundCleanupService();