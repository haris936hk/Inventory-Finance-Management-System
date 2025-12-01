// ========== src/services/customerService.js ==========
const db = require('../config/database');
const logger = require('../config/logger');

/**
 * Customer Service
 *
 * Handles all customer-related operations including:
 * - Customer CRUD operations
 * - Duplicate phone validation
 * - Customer financial information retrieval
 */

class CustomerService {
  /**
   * Create a new customer
   * @param {Object} data - Customer data
   * @returns {Promise<Object>} Created customer
   */
  async createCustomer(data) {
    // Check for duplicate phone
    const existing = await db.prisma.customer.findUnique({
      where: { phone: data.phone }
    });

    if (existing) {
      const error = new Error('Customer with this phone number already exists');
      error.status = 400;
      throw error;
    }

    try {
      return await db.prisma.customer.create({
        data
      });
    } catch (error) {
      // Handle Prisma constraint errors
      if (error.code === 'P2002') {
        const constraintError = new Error('Customer with this phone number already exists');
        constraintError.status = 400;
        throw constraintError;
      }
      throw error;
    }
  }

  /**
   * Get all customers with optional search filter
   * @param {Object} filters - Filter options
   * @param {string} filters.search - Search term for name, phone, or company
   * @returns {Promise<Array>} List of customers
   */
  async getCustomers(filters = {}) {
    const where = { deletedAt: null };

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search, mode: 'insensitive' } },
        { company: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    const customers = await db.prisma.customer.findMany({
      where,
      include: {
        _count: {
          select: {
            invoices: true,
            payments: true
          }
        },
        ledgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: 1, // Get only the latest entry
          select: { balance: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Use ledger balance as source of truth
    const { formatAmount } = require('../utils/transactionWrapper');
    return customers.map(customer => ({
      ...customer,
      currentBalance: customer.ledgerEntries[0]?.balance
        ? formatAmount(customer.ledgerEntries[0].balance)
        : formatAmount(customer.openingBalance || 0),
      ledgerEntries: undefined // Remove from response (not needed)
    }));
  }

  /**
   * Compute balances for multiple customers efficiently
   * @param {Array<string>} customerIds - Array of customer IDs
   * @returns {Promise<Object>} Object mapping customer ID to computed balance
   */
  async computeAllCustomerBalances(customerIds) {
    const { formatAmount } = require('../utils/transactionWrapper');

    if (customerIds.length === 0) {
      return {};
    }

    // Get all customers' opening balances
    const customers = await db.prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, openingBalance: true }
    });

    // Initialize balances with opening balances
    const balances = {};
    for (const customer of customers) {
      balances[customer.id] = formatAmount(customer.openingBalance || 0);
    }

    // Get all non-cancelled invoices for these customers
    const invoices = await db.prisma.invoice.findMany({
      where: {
        customerId: { in: customerIds },
        deletedAt: null,
        cancelledAt: null  // Exclude cancelled invoices
      },
      select: { customerId: true, total: true }
    });

    // Add invoice totals to balances
    for (const invoice of invoices) {
      balances[invoice.customerId] = formatAmount(
        balances[invoice.customerId] + invoice.total
      );
    }

    // Get all non-voided payments for these customers
    const payments = await db.prisma.payment.findMany({
      where: {
        customerId: { in: customerIds },
        deletedAt: null,
        voidedAt: null  // Exclude voided payments
      },
      select: { customerId: true, amount: true }
    });

    // Subtract payment amounts from balances
    for (const payment of payments) {
      balances[payment.customerId] = formatAmount(
        balances[payment.customerId] - payment.amount
      );
    }

    return balances;
  }

  /**
   * Get customer by ID with all related data
   * @param {string} id - Customer ID
   * @returns {Promise<Object>} Customer with invoices, payments, and ledger entries
   */
  async getCustomerById(id) {
    const customer = await db.prisma.customer.findUnique({
      where: { id },
      include: {
        invoices: {
          orderBy: { invoiceDate: 'desc' }
        },
        payments: {
          orderBy: { paymentDate: 'desc' }
        },
        ledgerEntries: {
          orderBy: { entryDate: 'desc' },
          take: 20
        },
        _count: {
          select: {
            invoices: true,
            payments: true
          }
        }
      }
    });

    if (!customer) {
      return null;
    }

    // Get current balance from ledger (single source of truth)
    const currentBalance = await this.getCurrentBalance(id);

    return {
      ...customer,
      currentBalance // Override with ledger-based balance
    };
  }

  /**
   * Get current balance from ledger (SINGLE SOURCE OF TRUTH)
   * The ledger already handles all cancellations and voids via reversing entries
   * @param {string} customerId - Customer ID
   * @returns {Promise<number>} Current balance from latest ledger entry
   */
  async getCurrentBalance(customerId) {
    const { formatAmount } = require('../utils/transactionWrapper');

    // Get the most recent ledger entry - its balance IS the current balance
    const latestEntry = await db.prisma.customerLedger.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      select: { balance: true }
    });

    if (latestEntry) {
      return formatAmount(latestEntry.balance);
    }

    // If no ledger entries exist yet, return opening balance
    const customer = await db.prisma.customer.findUnique({
      where: { id: customerId },
      select: { openingBalance: true }
    });

    return formatAmount(customer?.openingBalance || 0);
  }

  /**
   * Update customer information
   * @param {string} id - Customer ID
   * @param {Object} data - Updated customer data
   * @returns {Promise<Object>} Updated customer
   */
  async updateCustomer(id, data) {
    // Check if phone is being changed
    if (data.phone) {
      const existing = await db.prisma.customer.findFirst({
        where: {
          phone: data.phone,
          id: { not: id }
        }
      });

      if (existing) {
        throw new Error('Phone number already in use');
      }
    }

    return await db.prisma.customer.update({
      where: { id },
      data
    });
  }

  /**
   * Delete customer (soft delete)
   * @param {string} id - Customer ID
   * @returns {Promise<Object>} Deleted customer
   */
  async deleteCustomer(id) {
    const customerWithRelations = await db.prisma.customer.findUnique({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: {
            invoices: { where: { deletedAt: null } }
          }
        }
      }
    });

    if (!customerWithRelations) {
      throw new Error('Customer not found');
    }

    if (customerWithRelations._count.invoices > 0) {
      throw new Error('Cannot delete customer with existing invoices. Archive it instead.');
    }

    return await db.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }
}

module.exports = new CustomerService();
