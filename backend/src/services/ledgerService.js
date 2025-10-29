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

    // Get all financial transactions for this customer
    const ledgerEntries = [];

    // Get invoices (exclude cancelled ones)
    const invoices = await db.prisma.invoice.findMany({
      where: {
        customerId,
        deletedAt: null,
        cancelledAt: null  // Exclude cancelled invoices
      },
      orderBy: { createdAt: 'asc' }
    });

    for (const invoice of invoices) {
      ledgerEntries.push({
        id: `invoice-${invoice.id}`,
        date: invoice.createdAt,
        type: 'Invoice',
        reference: invoice.invoiceNumber,
        description: `Invoice ${invoice.invoiceNumber}`,
        amount: parseFloat(invoice.total),
        balance: 0 // Will be calculated below
      });
    }

    // Get payments (exclude voided ones)
    const payments = await db.prisma.payment.findMany({
      where: {
        customerId,
        deletedAt: null,
        voidedAt: null  // Exclude voided payments
      },
      orderBy: { paymentDate: 'asc' }
    });

    for (const payment of payments) {
      ledgerEntries.push({
        id: `payment-${payment.id}`,
        date: payment.paymentDate,
        type: 'Payment',
        reference: payment.paymentNumber,
        description: `Payment ${payment.method}`,
        amount: -parseFloat(payment.amount), // Negative for payments
        balance: 0 // Will be calculated below
      });
    }

    // Sort by date and calculate running balance
    ledgerEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

    let runningBalance = parseFloat(customer.openingBalance) || 0;

    // Add opening balance entry if it exists
    if (customer.openingBalance && customer.openingBalance !== 0) {
      ledgerEntries.unshift({
        id: 'opening-balance',
        date: customer.createdAt,
        type: 'Opening Balance',
        reference: 'OB',
        description: 'Opening Balance',
        amount: parseFloat(customer.openingBalance),
        balance: parseFloat(customer.openingBalance)
      });
    }

    // Calculate running balance for each entry
    for (const entry of ledgerEntries) {
      if (entry.type !== 'Opening Balance') {
        runningBalance += entry.amount;
      }
      entry.balance = runningBalance;
    }

    return ledgerEntries;
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

    // Get all financial transactions for this vendor
    const ledgerEntries = [];

    // Get vendor bills (not POs - bills represent the actual financial obligation)
    const bills = await db.prisma.bill.findMany({
      where: {
        vendorId,
        deletedAt: null
      },
      orderBy: { createdAt: 'asc' }
    });

    for (const bill of bills) {
      ledgerEntries.push({
        date: bill.createdAt,
        type: 'Bill',
        reference: bill.billNumber,
        description: `Bill ${bill.billNumber}`,
        amount: parseFloat(bill.total),
        balance: 0 // Will be calculated below
      });
    }

    // Get vendor payments
    const payments = await db.prisma.vendorPayment.findMany({
      where: {
        vendorId,
        deletedAt: null
      },
      orderBy: { paymentDate: 'asc' }
    });

    for (const payment of payments) {
      ledgerEntries.push({
        date: payment.paymentDate,
        type: 'Payment',
        reference: payment.paymentNumber,
        description: `Payment ${payment.method}`,
        amount: -parseFloat(payment.amount), // Negative for payments (reduces what we owe)
        balance: 0 // Will be calculated below
      });
    }

    // Sort by date and calculate running balance
    ledgerEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

    let runningBalance = parseFloat(vendor.openingBalance) || 0;

    // Add opening balance entry if it exists
    if (vendor.openingBalance && vendor.openingBalance !== 0) {
      ledgerEntries.unshift({
        date: vendor.createdAt,
        type: 'Opening Balance',
        reference: 'OB',
        description: 'Opening Balance',
        amount: parseFloat(vendor.openingBalance),
        balance: parseFloat(vendor.openingBalance)
      });
    }

    // Calculate running balance for each entry
    for (const entry of ledgerEntries) {
      if (entry.type !== 'Opening Balance') {
        runningBalance += entry.amount;
      }
      entry.balance = runningBalance;
    }

    return ledgerEntries;
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
