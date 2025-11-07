/**
 * Scheduler Service
 * Manages background jobs and scheduled tasks for the application
 */

const cron = require('node-cron');
const logger = require('../config/logger');
const invoiceService = require('./invoiceService');
const inventoryLifecycleService = require('./inventoryLifecycleService');
const ValidationService = require('./validationService');
const db = require('../config/database');

class SchedulerService {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * Initialize and start all scheduled jobs
   */
  start() {
    if (this.isRunning) {
      logger.warn('Scheduler is already running');
      return;
    }

    logger.info('Starting background scheduler service...');

    // Job 1: Update overdue invoices - Runs daily at midnight (12:00 AM)
    const overdueInvoiceJob = cron.schedule('0 0 * * *', async () => {
      try {
        logger.info('Running scheduled job: Update overdue invoices');
        const result = await invoiceService.updateOverdueInvoices();
        logger.info(`Overdue invoice update completed: ${result.updated} invoices marked as overdue`);
      } catch (error) {
        logger.error('Error in overdue invoice update job:', {
          error: error.message,
          stack: error.stack
        });
      }
    }, {
      scheduled: false,
      timezone: 'Asia/Karachi' // Pakistan timezone
    });

    // Job 2: Cleanup expired reservations - Runs every hour
    const reservationCleanupJob = cron.schedule('0 * * * *', async () => {
      try {
        logger.info('Running scheduled job: Cleanup expired reservations');
        const result = await inventoryLifecycleService.cleanupExpiredReservations();
        logger.info(`Reservation cleanup completed: ${result.released} items released, ${result.deleted} reservations deleted`);
      } catch (error) {
        logger.error('Error in reservation cleanup job:', {
          error: error.message,
          stack: error.stack
        });
      }
    }, {
      scheduled: false,
      timezone: 'Asia/Karachi'
    });

    // Job 3: Cleanup expired reservations - Also run every 30 minutes for faster cleanup
    const frequentReservationCleanupJob = cron.schedule('*/30 * * * *', async () => {
      try {
        logger.info('Running scheduled job: Frequent reservation cleanup');
        const result = await inventoryLifecycleService.cleanupExpiredReservations();
        if (result.released > 0 || result.deleted > 0) {
          logger.info(`Frequent cleanup: ${result.released} items released, ${result.deleted} reservations deleted`);
        }
      } catch (error) {
        logger.error('Error in frequent reservation cleanup job:', {
          error: error.message,
          stack: error.stack
        });
      }
    }, {
      scheduled: false,
      timezone: 'Asia/Karachi'
    });

    // Job 4: Ledger reconciliation - Runs daily at 2 AM
    const ledgerReconciliationJob = cron.schedule('0 2 * * *', async () => {
      try {
        logger.info('Running scheduled job: Ledger Reconciliation');

        const reconciliationResults = {
          customers: { checked: 0, mismatched: 0, errors: [] },
          vendors: { checked: 0, mismatched: 0, errors: [] }
        };

        // Reconcile all customers
        const customers = await db.prisma.customer.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true }
        });

        for (const customer of customers) {
          try {
            const result = await ValidationService.reconcileCustomerBalance(customer.id);
            reconciliationResults.customers.checked++;

            if (!result.isReconciled) {
              reconciliationResults.customers.mismatched++;
              logger.warn('Customer ledger mismatch detected', {
                customerId: customer.id,
                customerName: customer.name,
                customerBalance: result.customerBalance,
                ledgerBalance: result.ledgerBalance,
                difference: result.difference
              });

              reconciliationResults.customers.errors.push({
                customerId: customer.id,
                customerName: customer.name,
                difference: result.difference
              });
            }
          } catch (error) {
            logger.error('Error reconciling customer ledger', {
              customerId: customer.id,
              customerName: customer.name,
              error: error.message
            });
          }
        }

        // Reconcile all vendors
        const vendors = await db.prisma.vendor.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true }
        });

        for (const vendor of vendors) {
          try {
            const result = await ValidationService.reconcileVendorBalance(vendor.id);
            reconciliationResults.vendors.checked++;

            if (!result.isReconciled) {
              reconciliationResults.vendors.mismatched++;
              logger.warn('Vendor ledger mismatch detected', {
                vendorId: vendor.id,
                vendorName: vendor.name,
                vendorBalance: result.vendorBalance,
                ledgerBalance: result.ledgerBalance,
                difference: result.difference
              });

              reconciliationResults.vendors.errors.push({
                vendorId: vendor.id,
                vendorName: vendor.name,
                difference: result.difference
              });
            }
          } catch (error) {
            logger.error('Error reconciling vendor ledger', {
              vendorId: vendor.id,
              vendorName: vendor.name,
              error: error.message
            });
          }
        }

        // Log summary
        logger.info('Ledger reconciliation completed', {
          customers: {
            checked: reconciliationResults.customers.checked,
            mismatched: reconciliationResults.customers.mismatched
          },
          vendors: {
            checked: reconciliationResults.vendors.checked,
            mismatched: reconciliationResults.vendors.mismatched
          }
        });

        // Alert if mismatches found
        if (reconciliationResults.customers.mismatched > 0 || reconciliationResults.vendors.mismatched > 0) {
          logger.error('CRITICAL: Ledger discrepancies detected - manual intervention required', {
            customerMismatches: reconciliationResults.customers.errors,
            vendorMismatches: reconciliationResults.vendors.errors
          });
        }

        return reconciliationResults;
      } catch (error) {
        logger.error('Error in ledger reconciliation job:', {
          error: error.message,
          stack: error.stack
        });
      }
    }, {
      scheduled: false,
      timezone: 'Asia/Karachi'
    });

    // Store jobs for later management
    this.jobs = [
      { name: 'Overdue Invoice Update', job: overdueInvoiceJob, schedule: 'Daily at midnight' },
      { name: 'Reservation Cleanup (Hourly)', job: reservationCleanupJob, schedule: 'Every hour' },
      { name: 'Reservation Cleanup (Frequent)', job: frequentReservationCleanupJob, schedule: 'Every 30 minutes' },
      { name: 'Ledger Reconciliation', job: ledgerReconciliationJob, schedule: 'Daily at 2 AM' }
    ];

    // Start all jobs
    this.jobs.forEach(({ name, job, schedule }) => {
      job.start();
      logger.info(`✓ Scheduled job started: ${name} - ${schedule}`);
    });

    this.isRunning = true;
    logger.info(`✓ Scheduler service started successfully with ${this.jobs.length} jobs`);
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Scheduler is not running');
      return;
    }

    logger.info('Stopping scheduler service...');

    this.jobs.forEach(({ name, job }) => {
      job.stop();
      logger.info(`✓ Stopped job: ${name}`);
    });

    this.isRunning = false;
    logger.info('✓ Scheduler service stopped');
  }

  /**
   * Get status of all scheduled jobs
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobs: this.jobs.map(({ name, schedule }) => ({
        name,
        schedule,
        status: this.isRunning ? 'Running' : 'Stopped'
      }))
    };
  }

  /**
   * Manually trigger a specific job for testing
   */
  async triggerJob(jobName) {
    logger.info(`Manually triggering job: ${jobName}`);

    try {
      switch (jobName) {
        case 'overdueInvoices':
          const invoiceResult = await invoiceService.updateOverdueInvoices();
          logger.info(`Manual trigger completed: ${invoiceResult.updated} invoices marked as overdue`);
          return invoiceResult;

        case 'reservationCleanup':
          const reservationResult = await inventoryLifecycleService.cleanupExpiredReservations();
          logger.info(`Manual trigger completed: ${reservationResult.released} items released, ${reservationResult.deleted} reservations deleted`);
          return reservationResult;

        case 'ledgerReconciliation':
          const reconciliationResults = {
            customers: { checked: 0, mismatched: 0, errors: [] },
            vendors: { checked: 0, mismatched: 0, errors: [] }
          };

          // Reconcile all customers
          const customers = await db.prisma.customer.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true }
          });

          for (const customer of customers) {
            try {
              const result = await ValidationService.reconcileCustomerBalance(customer.id);
              reconciliationResults.customers.checked++;

              if (!result.isReconciled) {
                reconciliationResults.customers.mismatched++;
                reconciliationResults.customers.errors.push({
                  customerId: customer.id,
                  customerName: customer.name,
                  difference: result.difference
                });
              }
            } catch (error) {
              logger.error('Error reconciling customer ledger', {
                customerId: customer.id,
                error: error.message
              });
            }
          }

          // Reconcile all vendors
          const vendors = await db.prisma.vendor.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true }
          });

          for (const vendor of vendors) {
            try {
              const result = await ValidationService.reconcileVendorBalance(vendor.id);
              reconciliationResults.vendors.checked++;

              if (!result.isReconciled) {
                reconciliationResults.vendors.mismatched++;
                reconciliationResults.vendors.errors.push({
                  vendorId: vendor.id,
                  vendorName: vendor.name,
                  difference: result.difference
                });
              }
            } catch (error) {
              logger.error('Error reconciling vendor ledger', {
                vendorId: vendor.id,
                error: error.message
              });
            }
          }

          logger.info('Manual ledger reconciliation completed', reconciliationResults);
          return reconciliationResults;

        default:
          throw new Error(`Unknown job: ${jobName}`);
      }
    } catch (error) {
      logger.error(`Error in manual job trigger (${jobName}):`, {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

// Create singleton instance
const schedulerService = new SchedulerService();

module.exports = schedulerService;
