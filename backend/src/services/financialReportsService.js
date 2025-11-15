const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { Decimal } = require('../utils/transactionWrapper');

// FIXED: Extract magic numbers to constants
const DAYS_IN_YEAR = 365;

class FinancialReportsService {

  // ===================== PROFIT & LOSS STATEMENT =====================
  async generateProfitLossStatement(startDate, endDate) {
    try {
      // Income from Sales (Invoices)
      // Calculate revenue (accrual basis: includes all finalized invoices)
      const sales = await prisma.invoice.aggregate({
        where: {
          invoiceDate: {
            gte: new Date(startDate),
            lte: new Date(endDate)
          },
          status: {
            in: ['Sent', 'Paid', 'Partial']  // Include all finalized invoices
          },
          deletedAt: null
        },
        _sum: {
          total: true,
          taxAmount: true
        }
      });

      // Operating Expenses (from Bills/Vendor Payments)
      const expenses = await prisma.bill.aggregate({
        where: {
          billDate: {
            gte: new Date(startDate),
            lte: new Date(endDate)
          },
          deletedAt: null
        },
        _sum: {
          total: true
        }
      });

      // Calculate derived values
      const grossRevenue = sales._sum.total || 0;
      const costOfGoodsSold = await this.calculateCOGS(startDate, endDate);
      const grossProfit = grossRevenue - costOfGoodsSold;
      const operatingExpenses = expenses._sum.total || 0;
      const netIncome = grossProfit - operatingExpenses;

      // Get detailed breakdown
      const revenueBreakdown = await this.getRevenueBreakdown(startDate, endDate);
      const expenseBreakdown = await this.getExpenseBreakdown(startDate, endDate);

      return {
        period: { startDate, endDate },
        summary: {
          grossRevenue: new Decimal(grossRevenue || 0).toNumber(),
          costOfGoodsSold: new Decimal(costOfGoodsSold || 0).toNumber(),
          grossProfit: new Decimal(grossProfit || 0).toNumber(),
          grossProfitMargin: grossRevenue > 0 ? (grossProfit / grossRevenue * 100) : 0,
          operatingExpenses: new Decimal(operatingExpenses || 0).toNumber(),
          netIncome: new Decimal(netIncome || 0).toNumber(),
          netProfitMargin: grossRevenue > 0 ? (netIncome / grossRevenue * 100) : 0
        },
        details: {
          revenue: revenueBreakdown,
          expenses: expenseBreakdown
        }
      };
    } catch (error) {
      throw new Error(`Failed to generate P&L statement: ${error.message}`);
    }
  }

  async calculateCOGS(startDate, endDate) {
    // Get sold items and their purchase prices
    // Uses accrual basis: includes all finalized invoices regardless of payment status
    const soldItems = await prisma.invoiceItem.findMany({
      where: {
        invoice: {
          invoiceDate: {
            gte: new Date(startDate),
            lte: new Date(endDate)
          },
          status: {
            in: ['Sent', 'Paid', 'Partial']  // Include all finalized invoices
          },
          deletedAt: null
        }
      },
      include: {
        item: {
          select: {
            purchasePrice: true
          }
        }
      }
    });

    // FIXED: Use Decimal.js for precise COGS calculation
    const totalCOGS = soldItems.reduce((total, invoiceItem) => {
      const costPerUnit = new Decimal(invoiceItem.item.purchasePrice || 0);
      const quantity = new Decimal(invoiceItem.quantity);
      return total.plus(costPerUnit.times(quantity));
    }, new Decimal(0));

    return totalCOGS.toNumber();
  }

  async getRevenueBreakdown(startDate, endDate) {
    return await prisma.invoice.groupBy({
      by: ['taxType'],
      where: {
        invoiceDate: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        },
        status: {
          in: ['Sent', 'Paid', 'Partial']  // Match main revenue query filter
        },
        deletedAt: null
      },
      _sum: {
        subtotal: true,
        taxAmount: true,
        total: true
      },
      _count: {
        id: true
      }
    });
  }

  async getExpenseBreakdown(startDate, endDate) {
    return await prisma.bill.groupBy({
      by: ['vendorId'],
      where: {
        billDate: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        },
        deletedAt: null
      },
      _sum: {
        total: true
      },
      _count: {
        id: true
      }
    });
  }

  // ===================== BALANCE SHEET =====================
  async generateBalanceSheet(asOfDate) {
    try {
      const asOf = new Date(asOfDate);

      // ASSETS
      const assets = await this.calculateAssets(asOf);

      // LIABILITIES
      const liabilities = await this.calculateLiabilities(asOf);

      // EQUITY
      const equity = await this.calculateEquity(asOf);

      const totalAssets = assets.current + assets.nonCurrent;
      const totalLiabilities = liabilities.current + liabilities.nonCurrent;
      const totalEquity = equity.total;

      // Balance check
      const balanceCheck = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;

      // Get cash breakdown for transparency
      const openingBalance = await this.getOpeningCashBalance();
      const customerPayments = await prisma.payment.aggregate({
        where: {
          paymentDate: { lte: asOf },
          deletedAt: null,
          voidedAt: null
        },
        _sum: { amount: true }
      });
      const vendorPayments = await prisma.vendorPayment.aggregate({
        where: {
          paymentDate: { lte: asOf },
          deletedAt: null,
          voidedAt: null
        },
        _sum: { amount: true }
      });

      return {
        asOfDate: asOf,
        assets: {
          current: {
            cash: assets.cash,
            accountsReceivable: assets.accountsReceivable,
            inventory: assets.inventory,
            total: assets.current
          },
          nonCurrent: {
            fixedAssets: assets.fixedAssets,
            total: assets.nonCurrent
          },
          total: totalAssets
        },
        liabilities: {
          current: {
            accountsPayable: liabilities.accountsPayable,
            shortTermDebt: liabilities.shortTermDebt,
            total: liabilities.current
          },
          nonCurrent: {
            longTermDebt: liabilities.longTermDebt,
            total: liabilities.nonCurrent
          },
          total: totalLiabilities
        },
        equity: {
          retainedEarnings: equity.retainedEarnings,
          currentYearEarnings: equity.currentYearEarnings,
          total: totalEquity
        },
        totals: {
          assets: totalAssets,
          liabilitiesAndEquity: totalLiabilities + totalEquity,
          balanced: balanceCheck
        },
        cashBreakdown: {
          openingBalance: new Decimal(openingBalance || 0).toNumber(),
          customerPayments: new Decimal(customerPayments._sum.amount || 0).toNumber(),
          vendorPayments: new Decimal(vendorPayments._sum.amount || 0).toNumber(),
          currentCash: assets.cash
        }
      };
    } catch (error) {
      throw new Error(`Failed to generate balance sheet: ${error.message}`);
    }
  }

  async getOpeningCashBalance() {
    try {
      const settingsService = require('./settingsService');
      const financeSettings = await settingsService.getSettingsByKey('finance');
      return new Decimal(financeSettings?.openingCashBalance || 0).toNumber();
    } catch (error) {
      // Default to 0 if settings not found or error occurs
      return 0;
    }
  }

  async calculateCashBalance(asOfDate) {
    // Get opening cash balance from settings
    const openingBalance = await this.getOpeningCashBalance();

    // Get all customer payments received (cash inflow)
    const customerPayments = await prisma.payment.aggregate({
      where: {
        paymentDate: { lte: new Date(asOfDate) },
        deletedAt: null,
        voidedAt: null  // Exclude voided payments
      },
      _sum: {
        amount: true
      }
    });

    // Get all vendor payments made (cash outflow)
    const vendorPayments = await prisma.vendorPayment.aggregate({
      where: {
        paymentDate: { lte: new Date(asOfDate) },
        deletedAt: null,
        voidedAt: null  // Exclude voided payments
      },
      _sum: {
        amount: true
      }
    });

    // Calculate net cash balance
    // Formula: Opening Balance + Cash Inflows - Cash Outflows
    const cashBalance =
      openingBalance +
      (customerPayments._sum.amount || 0) -
      (vendorPayments._sum.amount || 0);

    return cashBalance;
  }

  async calculateAssets(asOfDate) {
    // Cash - calculate from actual transactions
    const cash = await this.calculateCashBalance(asOfDate);

    // Accounts Receivable (unpaid invoices)
    const receivables = await prisma.invoice.aggregate({
      where: {
        invoiceDate: { lte: asOfDate },
        status: { in: ['Sent', 'Partial'] },
        deletedAt: null
      },
      _sum: {
        total: true,
        paidAmount: true
      }
    });

    const accountsReceivable = (receivables._sum.total || 0) - (receivables._sum.paidAmount || 0);

    // Inventory Value (current stock - all unsold items)
    const inventory = await prisma.item.aggregate({
      where: {
        status: { in: ['In Store', 'In Hand', 'In Lab'] },  // Include all owned inventory
        deletedAt: null
      },
      _sum: {
        purchasePrice: true
      },
      _count: {
        id: true
      }
    });

    const inventoryValue = inventory._sum.purchasePrice || 0;
    const inventoryCount = inventory._count.id || 0;

    console.log(`Inventory Calculation: ${inventoryCount} items, Total Value: PKR ${inventoryValue.toLocaleString()}`);

    // Fixed Assets (not yet implemented)
    // TODO: Implement fixed asset tracking system with:
    // - Asset purchases and disposals
    // - Depreciation calculation
    // - Net book value reporting
    const fixedAssets = 0;

    return {
      cash: new Decimal(cash || 0).toNumber(),
      accountsReceivable: new Decimal(accountsReceivable || 0).toNumber(),
      inventory: new Decimal(inventoryValue || 0).toNumber(),
      fixedAssets: new Decimal(fixedAssets || 0).toNumber(),
      current: new Decimal(cash + accountsReceivable + inventoryValue || 0).toNumber(),
      nonCurrent: new Decimal(fixedAssets || 0).toNumber()
    };
  }

  async calculateLiabilities(asOfDate) {
    // Accounts Payable (unpaid bills)
    const payables = await prisma.bill.aggregate({
      where: {
        billDate: { lte: asOfDate },
        status: { in: ['Unpaid', 'Partial'] },
        deletedAt: null
      },
      _sum: {
        total: true,
        paidAmount: true
      }
    });

    const accountsPayable = (payables._sum.total || 0) - (payables._sum.paidAmount || 0);

    return {
      accountsPayable: new Decimal(accountsPayable || 0).toNumber(),
      shortTermDebt: 0, // Implement if needed
      longTermDebt: 0, // Implement if needed
      current: new Decimal(accountsPayable || 0).toNumber(),
      nonCurrent: 0
    };
  }

  async calculateEquity(asOfDate) {
    // Get net income for current year
    const currentYear = asOfDate.getFullYear();
    const yearStart = new Date(currentYear, 0, 1);

    const currentYearPL = await this.generateProfitLossStatement(
      yearStart.toISOString().split('T')[0],
      asOfDate.toISOString().split('T')[0]
    );

    // Retained earnings calculation
    // TODO: Implement accounting period closing process to track retained earnings
    // For now, set to 0 until year-end closing functionality is implemented
    // Future implementation should:
    // - Create AccountingPeriod model in schema
    // - Store opening retained earnings for each fiscal year
    // - Accumulate prior years' net income
    const retainedEarnings = 0;

    return {
      retainedEarnings: retainedEarnings,
      currentYearEarnings: currentYearPL.summary.netIncome,
      total: retainedEarnings + currentYearPL.summary.netIncome  // Total Equity = Retained + Current
    };
  }

  // ===================== CASH FLOW STATEMENT =====================
  async generateCashFlowStatement(startDate, endDate) {
    try {
      // Calculate opening and closing balances
      const startDateObj = new Date(startDate);
      const previousDay = new Date(startDateObj);
      previousDay.setDate(previousDay.getDate() - 1);

      const openingBalance = await this.calculateCashBalance(previousDay.toISOString());
      const closingBalance = await this.calculateCashBalance(endDate);

      const operatingCashFlow = await this.calculateOperatingCashFlow(startDate, endDate);
      const investingCashFlow = await this.calculateInvestingCashFlow(startDate, endDate);
      const financingCashFlow = await this.calculateFinancingCashFlow(startDate, endDate);

      const netCashFlow = operatingCashFlow.net + investingCashFlow.net + financingCashFlow.net;

      return {
        period: { startDate, endDate },
        operating: operatingCashFlow,
        investing: investingCashFlow,
        financing: financingCashFlow,
        netChange: new Decimal(netCashFlow || 0).toNumber(),
        openingBalance: new Decimal(openingBalance || 0).toNumber(),
        closingBalance: new Decimal(closingBalance || 0).toNumber(),
        summary: {
          cashFromOperations: operatingCashFlow.net,
          cashFromInvesting: investingCashFlow.net,
          cashFromFinancing: financingCashFlow.net,
          netIncrease: netCashFlow
        }
      };
    } catch (error) {
      throw new Error(`Failed to generate cash flow statement: ${error.message}`);
    }
  }

  async calculateOperatingCashFlow(startDate, endDate) {
    // Cash receipts from customers
    const receipts = await prisma.payment.aggregate({
      where: {
        paymentDate: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        },
        deletedAt: null
      },
      _sum: { amount: true }
    });

    // Cash payments to suppliers
    const payments = await prisma.vendorPayment.aggregate({
      where: {
        paymentDate: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        },
        deletedAt: null
      },
      _sum: { amount: true }
    });

    const cashReceipts = receipts._sum.amount || 0;
    const cashPayments = payments._sum.amount || 0;

    return {
      receipts: new Decimal(cashReceipts || 0).toNumber(),
      payments: new Decimal(cashPayments || 0).toNumber(),
      net: new Decimal(cashReceipts - cashPayments || 0).toNumber()
    };
  }

  async calculateInvestingCashFlow(startDate, endDate) {
    // Placeholder for investing activities
    return {
      assetPurchases: 0,
      assetSales: 0,
      net: 0
    };
  }

  async calculateFinancingCashFlow(startDate, endDate) {
    // Placeholder for financing activities
    return {
      borrowings: 0,
      repayments: 0,
      net: 0
    };
  }

  // ===================== ACCOUNTS RECEIVABLE AGING =====================
  async generateAccountsReceivableAging(asOfDate = new Date()) {
    try {
      const unpaidInvoices = await prisma.invoice.findMany({
        where: {
          status: { in: ['Sent', 'Partial'] },
          deletedAt: null
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              company: true
            }
          }
        }
      });

      const agingBuckets = {
        current: [], // 0-30 days
        days31to60: [], // 31-60 days
        days61to90: [], // 61-90 days
        over90: [] // Over 90 days
      };

      const summary = {
        current: 0,
        days31to60: 0,
        days61to90: 0,
        over90: 0,
        total: 0
      };

      unpaidInvoices.forEach(invoice => {
        const daysOverdue = Math.floor((asOfDate - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24));
        const balanceAmount = new Decimal(invoice.total || 0).minus(new Decimal(invoice.paidAmount || 0)).toNumber();

        const invoiceData = {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customer: invoice.customer,
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          totalAmount: new Decimal(invoice.total || 0).toNumber(),
          paidAmount: new Decimal(invoice.paidAmount || 0).toNumber(),
          balanceAmount,
          daysOverdue,
          status: invoice.status
        };

        if (daysOverdue <= 0) {
          agingBuckets.current.push(invoiceData);
          summary.current += balanceAmount;
        } else if (daysOverdue <= 30) {
          agingBuckets.current.push(invoiceData);
          summary.current += balanceAmount;
        } else if (daysOverdue <= 60) {
          agingBuckets.days31to60.push(invoiceData);
          summary.days31to60 += balanceAmount;
        } else if (daysOverdue <= 90) {
          agingBuckets.days61to90.push(invoiceData);
          summary.days61to90 += balanceAmount;
        } else {
          agingBuckets.over90.push(invoiceData);
          summary.over90 += balanceAmount;
        }
      });

      summary.total = summary.current + summary.days31to60 + summary.days61to90 + summary.over90;

      // Customer-wise summary
      const customerSummary = await this.getCustomerWiseAging(unpaidInvoices, asOfDate);

      return {
        asOfDate,
        summary,
        buckets: agingBuckets,
        customerSummary,
        statistics: {
          totalCustomersWithDues: customerSummary.length,
          averageDaysOverdue: this.calculateAverageDaysOverdue(unpaidInvoices, asOfDate),
          overduePercentage: summary.total > 0 ? ((summary.days31to60 + summary.days61to90 + summary.over90) / summary.total * 100) : 0
        }
      };
    } catch (error) {
      throw new Error(`Failed to generate AR aging report: ${error.message}`);
    }
  }

  getCustomerWiseAging(invoices, asOfDate) {
    const customerMap = new Map();

    invoices.forEach(invoice => {
      const customerId = invoice.customer.id;
      if (!customerMap.has(customerId)) {
        customerMap.set(customerId, {
          customer: invoice.customer,
          invoices: [],
          totalDue: 0,
          current: 0,
          days31to60: 0,
          days61to90: 0,
          over90: 0
        });
      }

      const customerData = customerMap.get(customerId);
      const daysOverdue = Math.floor((asOfDate - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24));
      const balanceAmount = new Decimal(invoice.total || 0).minus(new Decimal(invoice.paidAmount || 0)).toNumber();

      customerData.invoices.push(invoice);
      customerData.totalDue += balanceAmount;

      if (daysOverdue <= 30) {
        customerData.current += balanceAmount;
      } else if (daysOverdue <= 60) {
        customerData.days31to60 += balanceAmount;
      } else if (daysOverdue <= 90) {
        customerData.days61to90 += balanceAmount;
      } else {
        customerData.over90 += balanceAmount;
      }
    });

    return Array.from(customerMap.values()).sort((a, b) => b.totalDue - a.totalDue);
  }

  calculateAverageDaysOverdue(invoices, asOfDate) {
    // FIXED: Enhanced division-by-zero protection with explicit checks
    if (!invoices || invoices.length === 0) return 0;

    const totalDays = invoices.reduce((sum, invoice) => {
      const days = Math.floor((asOfDate - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24));
      return sum + Math.max(0, days);
    }, 0);

    // Additional safety: check for zero or NaN
    if (totalDays === 0 || isNaN(totalDays)) return 0;
    return Math.round(totalDays / invoices.length);
  }

  // ===================== ACCOUNTS PAYABLE AGING (Vendor Bills) =====================
  async generateVendorBillsAging(asOfDate = new Date()) {
    try {
      const unpaidBills = await prisma.bill.findMany({
        where: {
          status: { in: ['Unpaid', 'Partial'] },
          deletedAt: null,
          cancelledAt: null
        },
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true
            }
          }
        }
      });

      const agingBuckets = {
        current: [], // 0-30 days
        days31to60: [], // 31-60 days
        days61to90: [], // 61-90 days
        over90: [] // > 90 days
      };

      const summary = {
        current: 0,
        days31to60: 0,
        days61to90: 0,
        over90: 0,
        total: 0
      };

      unpaidBills.forEach(bill => {
        const daysOverdue = Math.floor((asOfDate - new Date(bill.dueDate || bill.billDate)) / (1000 * 60 * 60 * 24));
        const balanceAmount = new Decimal(bill.total || 0).minus(new Decimal(bill.paidAmount || 0)).toNumber();

        const billData = {
          id: bill.id,
          billNumber: bill.billNumber,
          billDate: bill.billDate,
          dueDate: bill.dueDate,
          vendor: bill.vendor,
          total: new Decimal(bill.total || 0).toNumber(),
          paidAmount: new Decimal(bill.paidAmount || 0).toNumber(),
          balance: balanceAmount,
          daysOverdue: Math.max(0, daysOverdue),
          status: bill.status
        };

        // Categorize into aging buckets
        if (daysOverdue <= 0 || daysOverdue <= 30) {
          agingBuckets.current.push(billData);
          summary.current += balanceAmount;
        } else if (daysOverdue <= 60) {
          agingBuckets.days31to60.push(billData);
          summary.days31to60 += balanceAmount;
        } else if (daysOverdue <= 90) {
          agingBuckets.days61to90.push(billData);
          summary.days61to90 += balanceAmount;
        } else {
          agingBuckets.over90.push(billData);
          summary.over90 += balanceAmount;
        }
      });

      summary.total = summary.current + summary.days31to60 + summary.days61to90 + summary.over90;

      // Vendor-wise summary
      const vendorSummary = await this.getVendorWiseAging(unpaidBills, asOfDate);

      return {
        asOfDate,
        summary,
        buckets: agingBuckets,
        vendorSummary,
        statistics: {
          totalVendorsWithDues: vendorSummary.length,
          averageDaysOverdue: this.calculateAverageBillDaysOverdue(unpaidBills, asOfDate),
          overduePercentage: summary.total > 0 ? ((summary.days31to60 + summary.days61to90 + summary.over90) / summary.total * 100) : 0
        }
      };
    } catch (error) {
      throw new Error(`Failed to generate vendor bills aging report: ${error.message}`);
    }
  }

  getVendorWiseAging(bills, asOfDate) {
    const vendorMap = new Map();

    bills.forEach(bill => {
      const vendorId = bill.vendor.id;
      if (!vendorMap.has(vendorId)) {
        vendorMap.set(vendorId, {
          vendor: bill.vendor,
          bills: [],
          totalDue: 0,
          current: 0,
          days31to60: 0,
          days61to90: 0,
          over90: 0
        });
      }

      const vendorData = vendorMap.get(vendorId);
      const daysOverdue = Math.floor((asOfDate - new Date(bill.dueDate || bill.billDate)) / (1000 * 60 * 60 * 24));
      const balanceAmount = new Decimal(bill.total || 0).minus(new Decimal(bill.paidAmount || 0)).toNumber();

      vendorData.bills.push(bill);
      vendorData.totalDue += balanceAmount;

      if (daysOverdue <= 0 || daysOverdue <= 30) {
        vendorData.current += balanceAmount;
      } else if (daysOverdue <= 60) {
        vendorData.days31to60 += balanceAmount;
      } else if (daysOverdue <= 90) {
        vendorData.days61to90 += balanceAmount;
      } else {
        vendorData.over90 += balanceAmount;
      }
    });

    return Array.from(vendorMap.values());
  }

  calculateAverageBillDaysOverdue(bills, asOfDate) {
    // FIXED: Enhanced division-by-zero protection with explicit checks
    if (!bills || bills.length === 0) return 0;

    const totalDays = bills.reduce((sum, bill) => {
      const days = Math.floor((asOfDate - new Date(bill.dueDate || bill.billDate)) / (1000 * 60 * 60 * 24));
      return sum + Math.max(0, days);
    }, 0);

    // Additional safety: check for zero or NaN
    if (totalDays === 0 || isNaN(totalDays)) return 0;
    return Math.round(totalDays / bills.length);
  }


  // ===================== GST REPORTS =====================
  async generateGSTReport(year, month) {
    try {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      // Sales data for GSTR1
      const sales = await prisma.invoice.findMany({
        where: {
          invoiceDate: {
            gte: startDate,
            lte: endDate
          },
          status: { in: ['Paid', 'Partial', 'Sent'] },
          deletedAt: null
        },
        include: {
          customer: {
            select: {
              name: true,
              gstinNumber: true,
              state: true,
              businessType: true
            }
          }
        }
      });

      // Purchases data for GSTR2
      const purchases = await prisma.bill.findMany({
        where: {
          billDate: {
            gte: startDate,
            lte: endDate
          },
          deletedAt: null
        },
        include: {
          vendor: {
            select: {
              name: true,
              taxNumber: true
            }
          }
        }
      });

      const gstSummary = this.calculateGSTSummary(sales, purchases);

      return {
        period: { year, month, startDate, endDate },
        sales: {
          b2b: sales.filter(s => s.customer.businessType === 'B2B'),
          b2c: sales.filter(s => s.customer.businessType === 'B2C'),
          export: sales.filter(s => s.customer.businessType === 'Export')
        },
        purchases: purchases,
        summary: gstSummary
      };
    } catch (error) {
      throw new Error(`Failed to generate GST report: ${error.message}`);
    }
  }

  calculateGSTSummary(sales, purchases) {
    // Sales tax - we have detailed CGST/SGST/IGST breakdown
    const salesSummary = sales.reduce((acc, sale) => {
      acc.totalSales += new Decimal(sale.total || 0).toNumber();
      acc.cgstCollected += new Decimal(sale.cgstAmount || 0).toNumber();
      acc.sgstCollected += new Decimal(sale.sgstAmount || 0).toNumber();
      acc.igstCollected += new Decimal(sale.igstAmount || 0).toNumber();
      return acc;
    }, { totalSales: 0, cgstCollected: 0, sgstCollected: 0, igstCollected: 0 });

    // Calculate total sales tax
    const totalSalesTax = salesSummary.cgstCollected + salesSummary.sgstCollected + salesSummary.igstCollected;

    // Purchase tax - Bills only have taxAmount (no CGST/SGST/IGST breakdown)
    // We show total tax paid without assuming the breakdown
    const purchaseSummary = purchases.reduce((acc, purchase) => {
      acc.totalPurchases += new Decimal(purchase.total || 0).toNumber();
      acc.totalTaxPaid += new Decimal(purchase.taxAmount || 0).toNumber();
      return acc;
    }, { totalPurchases: 0, totalTaxPaid: 0 });

    // Net tax position
    const netTaxPayable = totalSalesTax - purchaseSummary.totalTaxPaid;

    return {
      sales: {
        ...salesSummary,
        totalTax: totalSalesTax
      },
      purchases: {
        totalPurchases: purchaseSummary.totalPurchases,
        totalTaxPaid: purchaseSummary.totalTaxPaid,
        // Note: Individual CGST/SGST/IGST not tracked for purchases in current schema
        note: "Purchase tax breakdown not available - only total tax tracked"
      },
      netTax: {
        salesTax: totalSalesTax,
        purchaseTax: purchaseSummary.totalTaxPaid,
        netPayable: netTaxPayable,
        // Sales tax breakdown (for reference)
        salesCGST: salesSummary.cgstCollected,
        salesSGST: salesSummary.sgstCollected,
        salesIGST: salesSummary.igstCollected
      }
    };
  }

  // ===================== INVENTORY TURNOVER REPORT =====================
  async generateInventoryTurnoverReport(startDate, endDate) {
    try {
      // Calculate COGS for the period
      const cogs = await this.calculateCOGS(startDate, endDate);

      // Calculate average inventory value
      const beginningInventory = await this.getInventoryValueAsOf(startDate);
      const endingInventory = await this.getInventoryValueAsOf(endDate);
      const averageInventory = (beginningInventory + endingInventory) / 2;

      // Calculate inventory turnover ratio
      const inventoryTurnoverRatio = averageInventory > 0 ? cogs / averageInventory : 0;

      // Calculate days sales in inventory
      const daysSalesInInventory = inventoryTurnoverRatio > 0 ? DAYS_IN_YEAR / inventoryTurnoverRatio : 0;

      // Get category-wise turnover
      const categoryTurnover = await this.getCategoryWiseTurnover(startDate, endDate);

      return {
        period: { startDate, endDate },
        summary: {
          costOfGoodsSold: new Decimal(cogs || 0).toNumber(),
          beginningInventory: new Decimal(beginningInventory || 0).toNumber(),
          endingInventory: new Decimal(endingInventory || 0).toNumber(),
          averageInventory: new Decimal(averageInventory || 0).toNumber(),
          inventoryTurnoverRatio: new Decimal(inventoryTurnoverRatio || 0).toDecimalPlaces(2).toNumber(),
          daysSalesInInventory: new Decimal(daysSalesInInventory || 0).toDecimalPlaces(0).toNumber()
        },
        categoryBreakdown: categoryTurnover
      };
    } catch (error) {
      throw new Error(`Failed to generate inventory turnover report: ${error.message}`);
    }
  }

  async getInventoryValueAsOf(date) {
    // Get all items that were in inventory at the specified date
    // Logic: Items that existed (inboundDate <= date) and were NOT sold yet (outboundDate > date OR null)
    const targetDate = new Date(date);

    const inventory = await prisma.item.aggregate({
      where: {
        inboundDate: { lte: targetDate },
        deletedAt: null,
        OR: [
          { outboundDate: null },
          { outboundDate: { gt: targetDate } }
        ]
      },
      _sum: {
        purchasePrice: true
      }
    });

    return inventory._sum.purchasePrice || 0;
  }

  async getCategoryWiseTurnover(startDate, endDate) {
    // Get sold items grouped by itemId
    const soldItemsByCategory = await prisma.invoiceItem.groupBy({
      by: ['itemId'],
      where: {
        invoice: {
          invoiceDate: {
            gte: new Date(startDate),
            lte: new Date(endDate)
          },
          status: { in: ['Sent', 'Paid', 'Partial'] },
          deletedAt: null
        }
      },
      _sum: {
        quantity: true
      }
    });

    // Get item details with categories
    const itemsWithCategories = await prisma.item.findMany({
      where: {
        id: { in: soldItemsByCategory.map(si => si.itemId) }
      },
      include: {
        category: true
      }
    });

    // Group by category
    const categoryMap = new Map();
    itemsWithCategories.forEach(item => {
      const categoryName = item.category.name;
      const soldQty = soldItemsByCategory.find(si => si.itemId === item.id)?._sum.quantity || 0;
      const cost = new Decimal(item.purchasePrice || 0).times(soldQty).toNumber();

      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, {
          category: categoryName,
          unitsSold: 0,
          cogs: 0
        });
      }

      const categoryData = categoryMap.get(categoryName);
      categoryData.unitsSold += soldQty;
      categoryData.cogs += cost;
    });

    return Array.from(categoryMap.values());
  }

  // ===================== GROSS PROFIT MARGIN REPORT =====================
  async generateGrossProfitMarginReport(startDate, endDate) {
    try {
      // Get overall revenue and COGS
      const revenue = await prisma.invoice.aggregate({
        where: {
          invoiceDate: {
            gte: new Date(startDate),
            lte: new Date(endDate)
          },
          status: { in: ['Sent', 'Paid', 'Partial'] },
          deletedAt: null
        },
        _sum: {
          total: true
        }
      });

      const cogs = await this.calculateCOGS(startDate, endDate);
      const grossRevenue = revenue._sum.total || 0;
      const grossProfit = grossRevenue - cogs;
      const grossProfitMargin = grossRevenue > 0 ? (grossProfit / grossRevenue * 100) : 0;

      // Get category-wise margins
      const categoryMargins = await this.getCategoryWiseMargins(startDate, endDate);

      // Get product-wise margins (top performers)
      const productMargins = await this.getProductWiseMargins(startDate, endDate);

      return {
        period: { startDate, endDate },
        summary: {
          grossRevenue: new Decimal(grossRevenue || 0).toNumber(),
          costOfGoodsSold: new Decimal(cogs || 0).toNumber(),
          grossProfit: new Decimal(grossProfit || 0).toNumber(),
          grossProfitMargin: new Decimal(grossProfitMargin || 0).toDecimalPlaces(2).toNumber()
        },
        categoryBreakdown: categoryMargins,
        topProducts: productMargins.slice(0, 10) // Top 10 products
      };
    } catch (error) {
      throw new Error(`Failed to generate gross profit margin report: ${error.message}`);
    }
  }

  async getCategoryWiseMargins(startDate, endDate) {
    // Get all invoices with items in the period
    const invoices = await prisma.invoice.findMany({
      where: {
        invoiceDate: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        },
        status: { in: ['Sent', 'Paid', 'Partial'] },
        deletedAt: null
      },
      include: {
        items: {
          include: {
            item: {
              include: {
                category: true
              }
            }
          }
        }
      }
    });

    // Group by category
    const categoryMap = new Map();

    invoices.forEach(invoice => {
      invoice.items.forEach(invoiceItem => {
        const category = invoiceItem.item.category.name;
        const revenue = new Decimal(invoiceItem.unitPrice || 0).times(invoiceItem.quantity).toNumber();
        const cost = new Decimal(invoiceItem.item.purchasePrice || 0).times(invoiceItem.quantity).toNumber();
        const profit = revenue - cost;

        if (!categoryMap.has(category)) {
          categoryMap.set(category, {
            category,
            revenue: 0,
            cost: 0,
            profit: 0,
            margin: 0,
            unitsSold: 0
          });
        }

        const categoryData = categoryMap.get(category);
        categoryData.revenue += revenue;
        categoryData.cost += cost;
        categoryData.profit += profit;
        categoryData.unitsSold += invoiceItem.quantity;
      });
    });

    // Calculate margins
    categoryMap.forEach((data, category) => {
      data.margin = data.revenue > 0 ? (data.profit / data.revenue * 100) : 0;
      data.margin = new Decimal(data.margin || 0).toDecimalPlaces(2).toNumber();
    });

    return Array.from(categoryMap.values()).sort((a, b) => b.margin - a.margin);
  }

  async getProductWiseMargins(startDate, endDate) {
    // Get all invoice items with product details
    const invoiceItems = await prisma.invoiceItem.findMany({
      where: {
        invoice: {
          invoiceDate: {
            gte: new Date(startDate),
            lte: new Date(endDate)
          },
          status: { in: ['Sent', 'Paid', 'Partial'] },
          deletedAt: null
        }
      },
      include: {
        item: {
          include: {
            model: {
              include: {
                company: true
              }
            }
          }
        }
      }
    });

    // Group by product model
    const productMap = new Map();

    invoiceItems.forEach(invoiceItem => {
      const productId = invoiceItem.item.modelId;
      const productName = `${invoiceItem.item.model.company.name} ${invoiceItem.item.model.name}`;
      const revenue = new Decimal(invoiceItem.unitPrice || 0).times(invoiceItem.quantity).toNumber();
      const cost = new Decimal(invoiceItem.item.purchasePrice || 0).times(invoiceItem.quantity).toNumber();
      const profit = revenue - cost;

      if (!productMap.has(productId)) {
        productMap.set(productId, {
          product: productName,
          revenue: 0,
          cost: 0,
          profit: 0,
          margin: 0,
          unitsSold: 0
        });
      }

      const productData = productMap.get(productId);
      productData.revenue += revenue;
      productData.cost += cost;
      productData.profit += profit;
      productData.unitsSold += invoiceItem.quantity;
    });

    // Calculate margins
    productMap.forEach((data) => {
      data.margin = data.revenue > 0 ? (data.profit / data.revenue * 100) : 0;
      data.margin = new Decimal(data.margin || 0).toDecimalPlaces(2).toNumber();
    });

    return Array.from(productMap.values()).sort((a, b) => b.margin - a.margin);
  }

  // ===================== DASHBOARD =====================
  /**
   * Get Dashboard Data
   * Provides overview metrics for inventory, financial, customers, and sales
   * @returns {Promise<Object>} Dashboard metrics
   */
  async getDashboardData() {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      // Get inventory metrics
      const totalItems = await prisma.item.count({
        where: {
          deletedAt: null,
          NOT: {
            repaired: 'Returned'
          }
        }
      });

      const availableItems = await prisma.item.count({
        where: {
          deletedAt: null,
          status: {
            in: ['In Store', 'In Hand', 'In Lab']
          },
          NOT: {
            repaired: 'Returned'
          }
        }
      });

      const soldThisMonth = await prisma.item.count({
        where: {
          inventoryStatus: 'Sold',
          outboundDate: {
            gte: startOfMonth
          }
        }
      });

      // Get financial metrics
      const totalRevenue = await prisma.invoice.aggregate({
        where: {
          deletedAt: null,
          status: {
            in: ['Paid', 'Partial']
          }
        },
        _sum: {
          paidAmount: true
        }
      });

      const monthlyRevenue = await prisma.invoice.aggregate({
        where: {
          deletedAt: null,
          invoiceDate: {
            gte: startOfMonth
          }
        },
        _sum: {
          total: true
        }
      });

      const outstandingAmount = await prisma.invoice.aggregate({
        where: {
          deletedAt: null,
          status: {
            in: ['Sent', 'Partial', 'Overdue']
          }
        },
        _sum: {
          total: true,
          paidAmount: true
        }
      });

      const outstanding = (outstandingAmount._sum.total || 0) - (outstandingAmount._sum.paidAmount || 0);

      // Get customer metrics
      const totalCustomers = await prisma.customer.count({
        where: { deletedAt: null }
      });

      const newCustomersThisMonth = await prisma.customer.count({
        where: {
          deletedAt: null,
          createdAt: {
            gte: startOfMonth
          }
        }
      });

      // Get top selling products
      const topProducts = await prisma.item.groupBy({
        by: ['modelId'],
        where: {
          inventoryStatus: 'Sold',
          outboundDate: {
            gte: startOfMonth
          }
        },
        _count: {
          id: true
        },
        orderBy: {
          _count: {
            id: 'desc'
          }
        },
        take: 5
      });

      // Fetch model details for top products
      const topProductDetails = await Promise.all(
        topProducts.map(async (product) => {
          try {
            const model = await prisma.productModel.findUnique({
              where: { id: product.modelId },
              include: {
                company: true,
                category: true
              }
            });
            return {
              model,
              count: product._count.id
            };
          } catch (error) {
            console.error('Error fetching model details:', error);
            return {
              model: null,
              count: product._count.id
            };
          }
        })
      );

      // Get recent transactions
      const recentInvoices = await prisma.invoice.findMany({
        where: { deletedAt: null },
        include: {
          customer: true
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      const recentPayments = await prisma.payment.findMany({
        where: { deletedAt: null },
        include: {
          customer: true
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      return {
        inventory: {
          totalItems,
          availableItems,
          soldThisMonth,
          utilizationRate: totalItems > 0 ? ((totalItems - availableItems) / totalItems * 100).toFixed(2) : 0
        },
        financial: {
          totalRevenue: totalRevenue._sum.paidAmount || 0,
          monthlyRevenue: monthlyRevenue._sum.total || 0,
          outstandingAmount: outstanding,
          averageInvoiceValue: (monthlyRevenue._sum.total && soldThisMonth > 0) ?
            (monthlyRevenue._sum.total / soldThisMonth).toFixed(2) : 0
        },
        customers: {
          total: totalCustomers,
          newThisMonth: newCustomersThisMonth
        },
        topProducts: topProductDetails,
        recentTransactions: {
          invoices: recentInvoices,
          payments: recentPayments
        }
      };
    } catch (error) {
      console.error('Error in getDashboardData:', error);
      // Return default dashboard data in case of error
      return {
        inventory: {
          totalItems: 0,
          availableItems: 0,
          soldThisMonth: 0,
          utilizationRate: 0
        },
        financial: {
          totalRevenue: 0,
          monthlyRevenue: 0,
          outstandingAmount: 0,
          averageInvoiceValue: 0
        },
        customers: {
          total: 0,
          newThisMonth: 0
        },
        topProducts: [],
        recentTransactions: {
          invoices: [],
          payments: []
        }
      };
    }
  }

  // ===================== CHART OF ACCOUNTS & JOURNAL ENTRIES =====================

  /**
   * Get Chart of Accounts with filtering
   * @param {Object} filters - Filter options (type, search, page, limit)
   * @returns {Promise<Object>} Accounts with pagination
   */
  async getAccounts(filters = {}) {
    const { type, search, page = 1, limit = 100 } = filters;
    const skip = (page - 1) * limit;

    const whereClause = {
      deletedAt: null
    };

    if (type) {
      whereClause.type = type;
    }

    if (search) {
      whereClause.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where: whereClause,
        orderBy: [{ code: 'asc' }],
        skip,
        take: limit
      }),
      prisma.account.count({ where: whereClause })
    ]);

    // Convert Decimal fields to floats
    const convertedAccounts = accounts.map(account => ({
      ...account,
      openingBalance: new Decimal(account.openingBalance || 0).toNumber(),
      currentBalance: new Decimal(account.currentBalance || 0).toNumber()
    }));

    return {
      accounts: convertedAccounts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get single account by ID
   * @param {string} id - Account ID
   * @returns {Promise<Object>} Account details
   */
  async getAccountById(id) {
    const account = await prisma.account.findUnique({
      where: { id, deletedAt: null }
    });

    if (!account) {
      return null;
    }

    return {
      ...account,
      openingBalance: new Decimal(account.openingBalance || 0).toNumber(),
      currentBalance: new Decimal(account.currentBalance || 0).toNumber()
    };
  }

  /**
   * Get Journal Entries with filtering
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Journal entries with pagination
   */
  async getJournalEntries(filters = {}) {
    const { accountId, sourceType, sourceId, dateFrom, dateTo, page = 1, limit = 100 } = filters;
    const skip = (page - 1) * limit;

    const whereClause = {
      deletedAt: null
    };

    if (accountId) {
      whereClause.accountId = accountId;
    }

    if (sourceType) {
      whereClause.sourceType = sourceType;
    }

    if (sourceId) {
      whereClause.sourceId = sourceId;
    }

    if (dateFrom || dateTo) {
      whereClause.entryDate = {};
      if (dateFrom) {
        whereClause.entryDate.gte = new Date(dateFrom);
      }
      if (dateTo) {
        whereClause.entryDate.lte = new Date(dateTo);
      }
    }

    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where: whereClause,
        include: {
          account: {
            select: {
              code: true,
              name: true,
              type: true
            }
          }
        },
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit
      }),
      prisma.journalEntry.count({ where: whereClause })
    ]);

    // Convert Decimal fields to floats
    const convertedEntries = entries.map(entry => ({
      ...entry,
      debit: new Decimal(entry.debit || 0).toNumber(),
      credit: new Decimal(entry.credit || 0).toNumber()
    }));

    return {
      entries: convertedEntries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Generate Trial Balance report
   * @param {Date} asOfDate - As of date
   * @returns {Promise<Object>} Trial balance
   */
  async generateTrialBalance(asOfDate = new Date()) {
    const accounts = await prisma.account.findMany({
      where: { deletedAt: null },
      orderBy: [{ code: 'asc' }]
    });

    const accountBalances = accounts.map(account => {
      const balance = new Decimal(account.currentBalance || 0).toNumber();
      const debitBalance = ['Asset', 'Expense'].includes(account.type) && balance > 0 ? balance : 0;
      const creditBalance = ['Liability', 'Income', 'Equity'].includes(account.type) && balance > 0 ? balance : 0;

      return {
        code: account.code,
        name: account.name,
        type: account.type,
        debit: debitBalance,
        credit: creditBalance
      };
    });

    const totalDebit = accountBalances.reduce((sum, acc) => sum + acc.debit, 0);
    const totalCredit = accountBalances.reduce((sum, acc) => sum + acc.credit, 0);
    const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

    return {
      asOfDate,
      accounts: accountBalances,
      totals: {
        debit: totalDebit,
        credit: totalCredit,
        balanced
      }
    };
  }

  /**
   * Wrapper for Profit & Loss (for API consistency)
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Object>} P&L report
   */
  async generateProfitAndLoss(startDate, endDate) {
    return await this.generateProfitLossStatement(startDate, endDate);
  }
}

module.exports = new FinancialReportsService();