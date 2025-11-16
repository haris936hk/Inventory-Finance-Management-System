// ========== src/services/ledgerService.js ==========
const db = require('../config/database');
const logger = require('../config/logger');

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
   * @param {string} customerId - Customer ID
   * @returns {Promise<Array>} Ledger entries with running balance
   */
  async getCustomerLedger(customerId) {
    const customer = await db.prisma.customer.findUnique({
      where: { id: customerId }
    });

    if (!customer) {
      const error = new Error('Customer not found');
      error.status = 404;
      throw error;
    }

    // Get all ledger entries from CustomerLedger table (single source of truth)
    const ledgerEntries = await db.prisma.customerLedger.findMany({
      where: { customerId },
      include: {
        invoice: {
          select: {
            invoiceNumber: true,
            status: true
          }
        }
      },
      orderBy: { entryDate: 'asc' }
    });

    // Add opening balance entry if it exists
    const entries = [];
    if (customer.openingBalance && customer.openingBalance !== 0) {
      entries.push({
        id: 'opening-balance',
        date: customer.createdAt,
        type: 'Opening Balance',
        reference: 'OB',
        description: 'Opening Balance',
        debit: parseFloat(customer.openingBalance),
        credit: 0,
        balance: parseFloat(customer.openingBalance)
      });
    }

    // Convert ledger entries to display format
    for (const entry of ledgerEntries) {
      entries.push({
        id: entry.id,
        date: entry.entryDate,
        type: entry.debit > 0 ? 'Invoice' : 'Payment',
        reference: entry.invoice?.invoiceNumber || entry.description.split(' ')[1],
        description: entry.description,
        debit: parseFloat(entry.debit),
        credit: parseFloat(entry.credit),
        balance: parseFloat(entry.balance)
      });
    }

    return entries;
  }

  /**
   * Get vendor ledger with all financial transactions
   * @param {string} vendorId - Vendor ID
   * @returns {Promise<Array>} Ledger entries with running balance
   */
  async getVendorLedger(vendorId) {
    const vendor = await db.prisma.vendor.findUnique({
      where: { id: vendorId }
    });

    if (!vendor) {
      const error = new Error('Vendor not found');
      error.status = 404;
      throw error;
    }

    // Get all ledger entries from VendorLedger table (single source of truth)
    const ledgerEntries = await db.prisma.vendorLedger.findMany({
      where: { vendorId },
      include: {
        bill: {
          select: {
            billNumber: true,
            status: true
          }
        }
      },
      orderBy: { entryDate: 'asc' }
    });

    // Add opening balance entry if it exists
    const entries = [];
    if (vendor.openingBalance && vendor.openingBalance !== 0) {
      entries.push({
        id: 'opening-balance',
        date: vendor.createdAt,
        type: 'Opening Balance',
        reference: 'OB',
        description: 'Opening Balance',
        debit: parseFloat(vendor.openingBalance),
        credit: 0,
        balance: parseFloat(vendor.openingBalance)
      });
    }

    // Convert ledger entries to display format
    for (const entry of ledgerEntries) {
      entries.push({
        id: entry.id,
        date: entry.entryDate,
        type: entry.debit > 0 ? 'Bill' : 'Payment',
        reference: entry.bill?.billNumber || entry.description.split(' ')[1],
        description: entry.description,
        debit: parseFloat(entry.debit),
        credit: parseFloat(entry.credit),
        balance: parseFloat(entry.balance)
      });
    }

    return entries;
  }

  /**
   * Get customer statement for a date range
   * @param {string} customerId - Customer ID
   * @param {Date} dateFrom - Start date (optional)
   * @param {Date} dateTo - End date (optional)
   * @returns {Promise<Object>} Statement with customer info, entries, and totals
   */
  async getCustomerStatement(customerId, dateFrom, dateTo) {
    const ledgerEntries = await db.prisma.customerLedger.findMany({
      where: {
        customerId,
        entryDate: {
          gte: dateFrom ? new Date(dateFrom) : undefined,
          lte: dateTo ? new Date(dateTo) : undefined
        }
      },
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
