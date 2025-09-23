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
    // Validate required fields
    if (!invoiceData.customerId || !invoiceData.items || !Array.isArray(invoiceData.items) || invoiceData.items.length === 0) {
      const error = new Error('Customer ID and items array are required');
      error.status = 400;
      throw error;
    }

    // Validate customer exists
    const customer = await db.prisma.customer.findUnique({
      where: { id: invoiceData.customerId }
    });

    if (!customer) {
      const error = new Error('Customer not found');
      error.status = 400;
      throw error;
    }

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
          const error = new Error(`Item ${item.itemId} not found`);
          error.status = 400;
          throw error;
        }

        if (inventoryItem.status !== 'In Store' && inventoryItem.status !== 'In Hand') {
          const error = new Error(`Item ${inventoryItem.serialNumber} is not available (Status: ${inventoryItem.status})`);
          error.status = 400;
          throw error;
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
    // Validate required fields
    if (!paymentData.customerId || !paymentData.amount) {
      const error = new Error('Customer ID and amount are required');
      error.status = 400;
      throw error;
    }

    return await db.transaction(async (prisma) => {
      // Generate payment number
      const paymentNumber = await generatePaymentNumber();

      // Get customer
      const customer = await prisma.customer.findUnique({
        where: { id: paymentData.customerId }
      });

      if (!customer) {
        const error = new Error('Customer not found');
        error.status = 400;
        throw error;
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

  /**
   * Installment Plans
   */
  async createInstallmentPlan(planData, userId) {
    const { customerId, invoiceId, totalAmount, numberOfInstallments, installmentAmount, startDate, frequency } = planData;

    // Validate customer and invoice
    const customer = await db.prisma.customer.findUnique({
      where: { id: customerId }
    });

    if (!customer) {
      const error = new Error('Customer not found');
      error.status = 400;
      throw error;
    }

    if (invoiceId) {
      const invoice = await db.prisma.invoice.findUnique({
        where: { id: invoiceId }
      });

      if (!invoice) {
        const error = new Error('Invoice not found');
        error.status = 400;
        throw error;
      }
    }

    // Create installment plan
    const installmentPlan = await db.prisma.installmentPlan.create({
      data: {
        customerId,
        invoiceId,
        totalAmount,
        numberOfInstallments,
        installmentAmount,
        startDate: new Date(startDate),
        frequency,
        status: 'Active',
        createdById: userId
      }
    });

    // Create individual installments
    const installments = [];
    for (let i = 1; i <= numberOfInstallments; i++) {
      let dueDate = new Date(startDate);

      if (frequency === 'Monthly') {
        dueDate.setMonth(dueDate.getMonth() + (i - 1));
      } else if (frequency === 'Weekly') {
        dueDate.setDate(dueDate.getDate() + (i - 1) * 7);
      }

      const installment = await db.prisma.installment.create({
        data: {
          installmentPlanId: installmentPlan.id,
          installmentNumber: i,
          amount: installmentAmount,
          dueDate,
          status: 'Pending'
        }
      });

      installments.push(installment);
    }

    return {
      ...installmentPlan,
      installments
    };
  }

  /**
   * Customer Ledger
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

    // Get invoices
    const invoices = await db.prisma.invoice.findMany({
      where: {
        customerId,
        deletedAt: null
      },
      orderBy: { createdAt: 'asc' }
    });

    for (const invoice of invoices) {
      ledgerEntries.push({
        date: invoice.createdAt,
        type: 'Invoice',
        reference: invoice.invoiceNumber,
        description: `Invoice ${invoice.invoiceNumber}`,
        amount: invoice.totalAmount,
        balance: 0 // Will be calculated below
      });
    }

    // Get payments
    const payments = await db.prisma.payment.findMany({
      where: {
        customerId,
        deletedAt: null
      },
      orderBy: { paymentDate: 'asc' }
    });

    for (const payment of payments) {
      ledgerEntries.push({
        date: payment.paymentDate,
        type: 'Payment',
        reference: payment.paymentNumber,
        description: `Payment ${payment.paymentMethod}`,
        amount: -payment.amount, // Negative for payments
        balance: 0 // Will be calculated below
      });
    }

    // Sort by date and calculate running balance
    ledgerEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

    let runningBalance = customer.openingBalance || 0;

    // Add opening balance entry if it exists
    if (customer.openingBalance && customer.openingBalance !== 0) {
      ledgerEntries.unshift({
        date: customer.createdAt,
        type: 'Opening Balance',
        reference: 'OB',
        description: 'Opening Balance',
        amount: customer.openingBalance,
        balance: customer.openingBalance
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
}

module.exports = new FinanceService();