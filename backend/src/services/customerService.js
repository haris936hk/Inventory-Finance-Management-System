// ========== src/services/customerService.js ==========
const db = require('../config/database');
const logger = require('../config/logger');
const { withTransaction, formatAmount } = require('../utils/transactionWrapper');
const JournalEntryService = require('./journalEntryService');

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
      // Use transaction to create customer + opening balance ledger entry atomically
      return await withTransaction(async (tx) => {
        // Create customer
        const customer = await tx.customer.create({
          data
        });

        // Create opening balance ledger entry if opening balance exists
        if (data.openingBalance && parseFloat(data.openingBalance) !== 0) {
          const openingBalanceAmount = formatAmount(parseFloat(data.openingBalance));

          await tx.customerLedger.create({
            data: {
              customerId: customer.id,
              entryDate: new Date(),
              description: 'Opening Balance',
              debit: openingBalanceAmount > 0 ? openingBalanceAmount : 0,
              credit: openingBalanceAmount < 0 ? Math.abs(openingBalanceAmount) : 0,
              balance: openingBalanceAmount
            }
          });

          logger.info(`Opening balance ledger entry created for customer: ${customer.name}`, {
            customerId: customer.id,
            openingBalance: openingBalanceAmount
          });

          // Create journal entries for opening balance (DR: A/R, CR: Opening Balance Equity)
          try {
            await JournalEntryService.createCustomerOpeningBalanceEntries(tx, {
              customerId: customer.id,
              customerName: customer.name,
              amount: openingBalanceAmount,
              entryDate: new Date()
            });
          } catch (error) {
            logger.error('Failed to create opening balance journal entries for customer', {
              customerId: customer.id,
              customerName: customer.name,
              error: error.message
            });
            // Don't fail customer creation if journal entries fail - can be fixed manually
          }
        }

        return customer;
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
   *
   * PERFORMANCE OPTIMIZATION: Added pagination and parallel queries
   *
   * @param {Object} filters - Filter options
   * @param {string} filters.search - Search term for name, phone, or company
   * @param {number} filters.page - Page number (default: 1)
   * @param {number} filters.limit - Items per page (default: 50)
   * @returns {Promise<Object>} Paginated customers with statistics
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

    // PERFORMANCE OPTIMIZATION: Add pagination
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 50;
    const skip = (page - 1) * limit;

    // PERFORMANCE OPTIMIZATION: Parallel queries for data + count + balance statistics
    const [customers, totalCount, balanceStats] = await Promise.all([
      // Get paginated customers
      db.prisma.customer.findMany({
        where,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          company: true,
          address: true,
          currentBalance: true,
          creditLimit: true,
          createdAt: true,
          _count: {
            select: {
              invoices: true,
              payments: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),

      // Get total count for pagination
      db.prisma.customer.count({ where }),

      // Get aggregate balance statistics
      db.prisma.customer.aggregate({
        where,
        _sum: {
          currentBalance: true
        },
        _count: true
      })
    ]);

    return {
      customers,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      },
      statistics: {
        totalCustomers: balanceStats._count,
        totalOutstanding: parseFloat(balanceStats._sum.currentBalance || 0)
      }
    };
  }

  /**
   * Get customer by ID with all related data
   *
   * PERFORMANCE OPTIMIZATION: Limited related data to recent records with selective loading
   *
   * @param {string} id - Customer ID
   * @param {Object} options - Query options
   * @param {number} options.invoicesLimit - Max invoices to fetch (default: 10)
   * @param {number} options.paymentsLimit - Max payments to fetch (default: 10)
   * @param {number} options.ledgerLimit - Max ledger entries to fetch (default: 20)
   * @returns {Promise<Object>} Customer with invoices, payments, and ledger entries
   */
  async getCustomerById(id, options = {}) {
    const invoicesLimit = options.invoicesLimit || 10;
    const paymentsLimit = options.paymentsLimit || 10;
    const ledgerLimit = options.ledgerLimit || 20;

    return await db.prisma.customer.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        company: true,
        address: true,
        nic: true,
        gstinNumber: true,
        creditLimit: true,
        openingBalance: true,
        currentBalance: true,
        createdAt: true,
        updatedAt: true,
        // PERFORMANCE OPTIMIZATION: Limit and select only necessary invoice fields
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            dueDate: true,
            status: true,
            total: true,
            paidAmount: true,
            cancelledAt: true,
            _count: {
              select: {
                items: true
              }
            }
          },
          orderBy: { invoiceDate: 'desc' },
          take: invoicesLimit
        },
        // PERFORMANCE OPTIMIZATION: Limit and select only necessary payment fields
        payments: {
          select: {
            id: true,
            paymentNumber: true,
            paymentDate: true,
            amount: true,
            method: true,
            reference: true,
            voidedAt: true,
            invoice: {
              select: {
                id: true,
                invoiceNumber: true
              }
            }
          },
          orderBy: { paymentDate: 'desc' },
          take: paymentsLimit
        },
        // PERFORMANCE OPTIMIZATION: Limit ledger entries
        ledgerEntries: {
          select: {
            id: true,
            entryDate: true,
            description: true,
            debit: true,
            credit: true,
            balance: true
          },
          orderBy: { entryDate: 'desc' },
          take: ledgerLimit
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
