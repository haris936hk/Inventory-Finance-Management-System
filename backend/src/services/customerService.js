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

    return await db.prisma.customer.findMany({
      where,
      include: {
        _count: {
          select: {
            invoices: true,
            payments: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Get customer by ID with all related data
   * @param {string} id - Customer ID
   * @returns {Promise<Object>} Customer with invoices, payments, and ledger entries
   */
  async getCustomerById(id) {
    return await db.prisma.customer.findUnique({
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
}

module.exports = new CustomerService();
