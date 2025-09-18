// ========== src/services/financeService.js ==========
const db = require('../config/database');
const logger = require('../config/logger');
const { 
  generateInvoiceNumber, 
  generatePONumber, 
  generatePaymentNumber 
} = require('../utils/generateId');

class FinanceService {
  /**
   * Customer Management
   */
  async createCustomer(data) {
    // Check for duplicate phone
    const existing = await db.prisma.customer.findUnique({
      where: { phone: data.phone }
    });

    if (existing) {
      throw new Error('Customer with this phone number already exists');
    }

    return await db.prisma.customer.create({
      data
    });
  }

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

  async getCustomerById(id) {
    return await db.prisma.customer.findUnique({
      where: { id },
      include: {
        invoices: {
          orderBy: { invoiceDate: 'desc' },
          take: 10
        },
        payments: {
          orderBy: { paymentDate: 'desc' },
          take: 10
        },
        ledgerEntries: {
          orderBy: { entryDate: 'desc' },
          take: 20
        }
      }
    });
  }

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
   * Invoice Management
   */
  async createInvoice(invoiceData, userId) {
    return await db.transaction(async (prisma) => {
      // Generate invoice number
      const invoiceNumber = await generateInvoiceNumber();

      // Calculate totals
      let subtotal = 0;
      const itemsToUpdate = [];

      // Validate items and calculate subtotal
      for (const item of invoiceData.items) {
        const inventoryItem = await prisma.item.findUnique({
          where: { id: item.itemId }
        });

        if (!inventoryItem) {
          throw new Error(`Item ${item.itemId} not found`);
        }

        if (inventoryItem.status !== 'In Store' && inventoryItem.status !== 'In Hand') {
          throw new Error(`Item ${inventoryItem.serialNumber} is not available (Status: ${inventoryItem.status})`);
        }

        const lineTotal = item.quantity * item.unitPrice;
        subtotal += lineTotal;

        itemsToUpdate.push({
          item: inventoryItem,
          newStatus: 'Sold',
          sellingPrice: item.unitPrice
        });
      }

      // Calculate discount
      let discountAmount = 0;
      if (invoiceData.discountType === 'Percentage') {
        discountAmount = (subtotal * invoiceData.discountValue) / 100;
      } else if (invoiceData.discountType === 'Fixed') {
        discountAmount = invoiceData.discountValue;
      }

      // Calculate tax
      const taxableAmount = subtotal - discountAmount;
      const taxAmount = (taxableAmount * invoiceData.taxRate) / 100;
      const total = taxableAmount + taxAmount;

      // Check customer credit limit
      const customer = await prisma.customer.findUnique({
        where: { id: invoiceData.customerId }
      });

      if (customer.creditLimit > 0) {
        const newBalance = parseFloat(customer.currentBalance) + total;
        if (newBalance > customer.creditLimit) {
          throw new Error(`Invoice exceeds customer credit limit (Limit: ${customer.creditLimit}, Current: ${customer.currentBalance})`);
        }
      }

      // Create invoice
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber,
          invoiceDate: invoiceData.invoiceDate || new Date(),
          dueDate: invoiceData.dueDate,
          status: invoiceData.status || 'Draft',
          subtotal,
          discountType: invoiceData.discountType,
          discountValue: invoiceData.discountValue || 0,
          taxRate: invoiceData.taxRate || 0,
          taxAmount,
          total,
          paidAmount: 0,
          terms: invoiceData.terms,
          notes: invoiceData.notes,
          customerId: invoiceData.customerId,
          createdById: userId,
          items: {
            create: invoiceData.items.map(item => ({
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.quantity * item.unitPrice,
              description: item.description,
              itemId: item.itemId
            }))
          }
        },
        include: {
          customer: true,
          items: {
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
              }
            }
          }
        }
      });

      // Update item statuses
      for (const update of itemsToUpdate) {
        await prisma.item.update({
          where: { id: update.item.id },
          data: {
            status: 'Sold',
            sellingPrice: update.sellingPrice,
            outboundDate: new Date(),
            statusHistory: [
              ...(update.item.statusHistory || []),
              {
                status: 'Sold',
                date: new Date(),
                userId,
                notes: `Sold via Invoice ${invoiceNumber}`
              }
            ]
          }
        });
      }

      // Create customer ledger entry
      await prisma.customerLedger.create({
        data: {
          entryDate: invoice.invoiceDate,
          description: `Invoice ${invoiceNumber}`,
          debit: total,
          credit: 0,
          balance: parseFloat(customer.currentBalance) + total,
          customerId: customer.id,
          invoiceId: invoice.id
        }
      });

      // Update customer balance
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          currentBalance: {
            increment: total
          }
        }
      });

      // Create journal entries for accounting
      // Debit: Accounts Receivable, Credit: Sales Revenue
      const arAccount = await prisma.account.findFirst({
        where: { name: 'Accounts Receivable' }
      });

      const salesAccount = await prisma.account.findFirst({
        where: { name: 'Sales Revenue' }
      });

      if (arAccount && salesAccount) {
        // Debit AR
        await prisma.journalEntry.create({
          data: {
            entryDate: invoice.invoiceDate,
            reference: `INV-${invoiceNumber}`,
            description: `Invoice to ${customer.name}`,
            accountId: arAccount.id,
            debit: total,
            credit: 0,
            sourceType: 'Invoice',
            sourceId: invoice.id
          }
        });

        // Credit Sales
        await prisma.journalEntry.create({
          data: {
            entryDate: invoice.invoiceDate,
            reference: `INV-${invoiceNumber}`,
            description: `Sales revenue from ${customer.name}`,
            accountId: salesAccount.id,
            debit: 0,
            credit: total,
            sourceType: 'Invoice',
            sourceId: invoice.id
          }
        });
      }

      logger.info(`Invoice created: ${invoiceNumber}`);
      return invoice;
    });
  }

  async getInvoices(filters = {}) {
    const where = { deletedAt: null };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.customerId) {
      where.customerId = filters.customerId;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.invoiceDate = {};
      if (filters.dateFrom) {
        where.invoiceDate.gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        where.invoiceDate.lte = new Date(filters.dateTo);
      }
    }

    return await db.prisma.invoice.findMany({
      where,
      include: {
        customer: true,
        _count: {
          select: {
            items: true,
            payments: true
          }
        }
      },
      orderBy: { invoiceDate: 'desc' }
    });
  }

  async getInvoiceById(id) {
    return await db.prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        items: {
          include: {
            item: {
              include: {
                category: true,
                model: {
                  include: {
                    company: true
                  }
                }
              }
            }
          }
        },
        payments: {
          include: {
            recordedBy: {
              select: {
                fullName: true
              }
            }
          }
        },
        installmentPlan: {
          include: {
            installments: {
              orderBy: { installmentNumber: 'asc' }
            }
          }
        },
        createdBy: {
          select: {
            fullName: true
          }
        }
      }
    });
  }

  async updateInvoiceStatus(id, status, userId) {
    const invoice = await db.prisma.invoice.findUnique({
      where: { id }
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // Check if status transition is valid
    const validTransitions = {
      'Draft': ['Sent', 'Cancelled'],
      'Sent': ['Partial', 'Paid', 'Overdue', 'Cancelled'],
      'Partial': ['Paid', 'Overdue'],
      'Overdue': ['Partial', 'Paid'],
      'Paid': [],
      'Cancelled': []
    };

    if (!validTransitions[invoice.status].includes(status)) {
      throw new Error(`Cannot change status from ${invoice.status} to ${status}`);
    }

    return await db.prisma.invoice.update({
      where: { id },
      data: { 
        status,
        voidReason: status === 'Cancelled' ? 'Cancelled by user' : null
      }
    });
  }

  /**
   * Payment Management
   */
  async recordPayment(paymentData, userId) {
    return await db.transaction(async (prisma) => {
      // Generate payment number
      const paymentNumber = await generatePaymentNumber();

      // Get customer
      const customer = await prisma.customer.findUnique({
        where: { id: paymentData.customerId }
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      // Create payment
      const payment = await prisma.payment.create({
        data: {
          paymentNumber,
          paymentDate: paymentData.paymentDate || new Date(),
          amount: paymentData.amount,
          method: paymentData.method,
          reference: paymentData.reference,
          notes: paymentData.notes,
          customerId: paymentData.customerId,
          invoiceId: paymentData.invoiceId,
          installmentId: paymentData.installmentId,
          recordedById: userId
        }
      });

      // Update invoice if specified
      if (paymentData.invoiceId) {
        const invoice = await prisma.invoice.findUnique({
          where: { id: paymentData.invoiceId }
        });

        const newPaidAmount = parseFloat(invoice.paidAmount) + paymentData.amount;
        let newStatus = invoice.status;

        if (newPaidAmount >= invoice.total) {
          newStatus = 'Paid';
        } else if (newPaidAmount > 0) {
          newStatus = 'Partial';
        }

        await prisma.invoice.update({
          where: { id: paymentData.invoiceId },
          data: {
            paidAmount: newPaidAmount,
            status: newStatus
          }
        });
      }

      // Create customer ledger entry
      await prisma.customerLedger.create({
        data: {
          entryDate: payment.paymentDate,
          description: `Payment ${paymentNumber}`,
          debit: 0,
          credit: paymentData.amount,
          balance: parseFloat(customer.currentBalance) - paymentData.amount,
          customerId: customer.id
        }
      });

      // Update customer balance
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          currentBalance: {
            decrement: paymentData.amount
          }
        }
      });

      // Create journal entries
      const cashAccount = await prisma.account.findFirst({
        where: { name: 'Cash' }
      });

      const arAccount = await prisma.account.findFirst({
        where: { name: 'Accounts Receivable' }
      });

      if (cashAccount && arAccount) {
        // Debit Cash
        await prisma.journalEntry.create({
          data: {
            entryDate: payment.paymentDate,
            reference: `PAY-${paymentNumber}`,
            description: `Payment from ${customer.name}`,
            accountId: cashAccount.id,
            debit: paymentData.amount,
            credit: 0,
            sourceType: 'Payment',
            sourceId: payment.id
          }
        });

        // Credit AR
        await prisma.journalEntry.create({
          data: {
            entryDate: payment.paymentDate,
            reference: `PAY-${paymentNumber}`,
            description: `Payment received from ${customer.name}`,
            accountId: arAccount.id,
            debit: 0,
            credit: paymentData.amount,
            sourceType: 'Payment',
            sourceId: payment.id
          }
        });
      }

      logger.info(`Payment recorded: ${paymentNumber}`);
      return payment;
    });
  }

  /**
   * Chart of Accounts
   */
  async getAccounts() {
    return await db.prisma.account.findMany({
      where: { deletedAt: null },
      include: {
        parent: true,
        children: true
      },
      orderBy: { code: 'asc' }
    });
  }

  async createAccount(data) {
    const existing = await db.prisma.account.findUnique({
      where: { code: data.code }
    });

    if (existing) {
      throw new Error('Account code already exists');
    }

    return await db.prisma.account.create({
      data,
      include: {
        parent: true
      }
    });
  }

  /**
   * Reports
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

    return {
      customer,
      entries: ledgerEntries,
      openingBalance: customer.openingBalance,
      closingBalance: customer.currentBalance,
      totalDebits: ledgerEntries.reduce((sum, e) => sum + parseFloat(e.debit), 0),
      totalCredits: ledgerEntries.reduce((sum, e) => sum + parseFloat(e.credit), 0)
    };
  }

  async getAgingReport() {
    const invoices = await db.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        status: {
          in: ['Sent', 'Partial', 'Overdue']
        }
      },
      include: {
        customer: true
      }
    });

    const now = new Date();
    const aging = {
      current: [],
      days30: [],
      days60: [],
      days90: [],
      over90: []
    };

    for (const invoice of invoices) {
      const daysOverdue = Math.floor((now - invoice.dueDate) / (1000 * 60 * 60 * 24));
      const outstanding = parseFloat(invoice.total) - parseFloat(invoice.paidAmount);

      const entry = {
        invoice,
        outstanding,
        daysOverdue
      };

      if (daysOverdue <= 0) {
        aging.current.push(entry);
      } else if (daysOverdue <= 30) {
        aging.days30.push(entry);
      } else if (daysOverdue <= 60) {
        aging.days60.push(entry);
      } else if (daysOverdue <= 90) {
        aging.days90.push(entry);
      } else {
        aging.over90.push(entry);
      }
    }

    return aging;
  }
}

module.exports = new FinanceService();