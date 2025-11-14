// ========== src/services/ledgerService.js ==========
const db = require('../config/database');
const logger = require('../config/logger');
const Decimal = require('decimal.js');

/**
 * Ledger Service
 *
 * Handles all ledger-related operations including:
 * - Customer ledger retrieval
 * - Vendor ledger retrieval
 * - Customer statement generation
 */

class LedgerService {
  /**
   * Get customer ledger with all financial transactions
   * REFACTORED: Now uses CustomerLedger table as single source of truth
   * @param {string} customerId - Customer ID
   * @param {Object} options - Optional filters
   * @param {Date} options.dateFrom - Filter entries from this date
   * @param {Date} options.dateTo - Filter entries to this date
   * @returns {Promise<Array>} Ledger entries with running balance
   */
  async getCustomerLedger(customerId, options = {}) {
    const customer = await db.prisma.customer.findUnique({
      where: { id: customerId }
    });

    if (!customer) {
      const error = new Error('Customer not found');
      error.status = 404;
      throw error;
    }

    // Build where clause for CustomerLedger query
    const where = { customerId };

    // Add date filters if provided
    if (options.dateFrom) {
      where.entryDate = { ...where.entryDate, gte: new Date(options.dateFrom) };
    }
    if (options.dateTo) {
      where.entryDate = { ...where.entryDate, lte: new Date(options.dateTo) };
    }

    // Fetch ledger entries from CustomerLedger table (single source of truth)
    const ledgerEntries = await db.prisma.customerLedger.findMany({
      where,
      include: {
        invoice: {
          select: {
            invoiceNumber: true,
            status: true,
            cancelledAt: true
          }
        }
      },
      orderBy: { entryDate: 'asc' }
    });

    // Convert to response format
    // FIXED: Use Decimal for precise ledger amount conversions
    return ledgerEntries.map(entry => ({
      id: entry.id,
      date: entry.entryDate,
      type: entry.description.includes('Invoice') ? 'Invoice' :
            entry.description.includes('Payment') ? 'Payment' :
            entry.description.includes('Opening Balance') ? 'Opening Balance' : 'Other',
      reference: entry.invoice?.invoiceNumber || entry.description.split(' ')[1] || '-',
      description: entry.description,
      debit: new Decimal(entry.debit || 0).toNumber(),
      credit: new Decimal(entry.credit || 0).toNumber(),
      amount: new Decimal(entry.debit || 0).minus(new Decimal(entry.credit || 0)).toNumber(), // Net amount for backward compatibility
      balance: new Decimal(entry.balance || 0).toNumber(),
      invoiceStatus: entry.invoice?.status || null,
      isCancelled: entry.invoice?.cancelledAt ? true : false
    }));
  }

  /**
   * Get vendor ledger with all financial transactions
   * REFACTORED: Now uses VendorLedger table as single source of truth
   * @param {string} vendorId - Vendor ID
   * @param {Object} options - Optional filters
   * @param {Date} options.dateFrom - Filter entries from this date
   * @param {Date} options.dateTo - Filter entries to this date
   * @returns {Promise<Array>} Ledger entries with running balance
   */
  async getVendorLedger(vendorId, options = {}) {
    const vendor = await db.prisma.vendor.findUnique({
      where: { id: vendorId }
    });

    if (!vendor) {
      const error = new Error('Vendor not found');
      error.status = 404;
      throw error;
    }

    // Build where clause for VendorLedger query
    const where = { vendorId };

    // Add date filters if provided
    if (options.dateFrom) {
      where.entryDate = { ...where.entryDate, gte: new Date(options.dateFrom) };
    }
    if (options.dateTo) {
      where.entryDate = { ...where.entryDate, lte: new Date(options.dateTo) };
    }

    // Fetch ledger entries from VendorLedger table (single source of truth)
    const ledgerEntries = await db.prisma.vendorLedger.findMany({
      where,
      include: {
        bill: {
          select: {
            billNumber: true,
            status: true,
            cancelledAt: true
          }
        }
      },
      orderBy: { entryDate: 'asc' }
    });

    // Convert to response format
    // FIXED: Use Decimal for precise ledger amount conversions
    return ledgerEntries.map(entry => ({
      id: entry.id,
      date: entry.entryDate,
      type: entry.description.includes('Bill') ? 'Bill' :
            entry.description.includes('Payment') ? 'Payment' :
            entry.description.includes('Opening Balance') ? 'Opening Balance' : 'Other',
      reference: entry.bill?.billNumber || entry.description.split(' ')[1] || '-',
      description: entry.description,
      debit: new Decimal(entry.debit || 0).toNumber(),
      credit: new Decimal(entry.credit || 0).toNumber(),
      amount: new Decimal(entry.debit || 0).minus(new Decimal(entry.credit || 0)).toNumber(), // Net amount for backward compatibility
      balance: new Decimal(entry.balance || 0).toNumber(),
      billStatus: entry.bill?.status || null,
      isCancelled: entry.bill?.cancelledAt ? true : false
    }));
  }

  /**
   * Get customer statement for a date range
   * @param {string} customerId - Customer ID
   * @param {Date} dateFrom - Start date (optional)
   * @param {Date} dateTo - End date (optional)
   * @returns {Promise<Object>} Statement with customer info, entries, and totals
   */
  async getCustomerStatement(customerId, dateFrom, dateTo) {
    // Build where clause conditionally to avoid passing undefined to Prisma
    const whereClause = {
      customerId
    };

    // Only add entryDate filter if at least one date is provided
    if (dateFrom || dateTo) {
      whereClause.entryDate = {};
      if (dateFrom) {
        whereClause.entryDate.gte = new Date(dateFrom);
      }
      if (dateTo) {
        whereClause.entryDate.lte = new Date(dateTo);
      }
    }

    const ledgerEntries = await db.prisma.customerLedger.findMany({
      where: whereClause,
      include: {
        invoice: true
      },
      orderBy: { entryDate: 'asc' }
    });

    const customer = await db.prisma.customer.findUnique({
      where: { id: customerId }
    });

    // Convert Decimals to floats for all entries
    const convertedEntries = ledgerEntries.map(entry => ({
      ...entry,
      debit: parseFloat(entry.debit),
      credit: parseFloat(entry.credit),
      balance: parseFloat(entry.balance)
    }));

    return {
      customer,
      entries: convertedEntries,
      openingBalance: parseFloat(customer.openingBalance) || 0,
      closingBalance: parseFloat(customer.currentBalance) || 0,
      totalDebits: convertedEntries.reduce((sum, e) => sum + e.debit, 0),
      totalCredits: convertedEntries.reduce((sum, e) => sum + e.credit, 0)
    };
  }
}

module.exports = new LedgerService();
