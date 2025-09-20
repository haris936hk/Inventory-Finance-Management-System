const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class FinancialReportsService {

  // ===================== PROFIT & LOSS STATEMENT =====================
  async generateProfitLossStatement(startDate, endDate) {
    try {
      // Income from Sales (Invoices)
      const sales = await prisma.invoice.aggregate({
        where: {
          invoiceDate: {
            gte: new Date(startDate),
            lte: new Date(endDate)
          },
          status: {
            in: ['Paid', 'Partial']
          },
          deletedAt: null
        },
        _sum: {
          total: true,
          taxAmount: true
        }
      });

      // Cost of Goods Sold (from sold items)
      const cogs = await prisma.invoiceItem.aggregate({
        where: {
          invoice: {
            invoiceDate: {
              gte: new Date(startDate),
              lte: new Date(endDate)
            },
            status: {
              in: ['Paid', 'Partial']
            },
            deletedAt: null
          }
        },
        _sum: {
          total: true
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
          grossRevenue: parseFloat(grossRevenue),
          costOfGoodsSold: parseFloat(costOfGoodsSold),
          grossProfit: parseFloat(grossProfit),
          grossProfitMargin: grossRevenue > 0 ? (grossProfit / grossRevenue * 100) : 0,
          operatingExpenses: parseFloat(operatingExpenses),
          netIncome: parseFloat(netIncome),
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
    const soldItems = await prisma.invoiceItem.findMany({
      where: {
        invoice: {
          invoiceDate: {
            gte: new Date(startDate),
            lte: new Date(endDate)
          },
          status: {
            in: ['Paid', 'Partial']
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

    return soldItems.reduce((total, invoiceItem) => {
      const costPerUnit = invoiceItem.item.purchasePrice || 0;
      return total + (costPerUnit * invoiceItem.quantity);
    }, 0);
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
          in: ['Paid', 'Partial']
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
      by: ['vendor'],
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
        }
      };
    } catch (error) {
      throw new Error(`Failed to generate balance sheet: ${error.message}`);
    }
  }

  async calculateAssets(asOfDate) {
    // Cash (would come from cash accounts in real implementation)
    const cash = 50000; // Placeholder - implement actual cash calculation

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

    // Inventory Value (current stock)
    const inventory = await prisma.item.aggregate({
      where: {
        status: { in: ['In Store', 'In Hand'] },
        deletedAt: null
      },
      _sum: {
        purchasePrice: true
      }
    });

    const inventoryValue = inventory._sum.purchasePrice || 0;

    // Fixed Assets (placeholder)
    const fixedAssets = 100000; // Implement fixed asset tracking

    return {
      cash: parseFloat(cash),
      accountsReceivable: parseFloat(accountsReceivable),
      inventory: parseFloat(inventoryValue),
      fixedAssets: parseFloat(fixedAssets),
      current: parseFloat(cash + accountsReceivable + inventoryValue),
      nonCurrent: parseFloat(fixedAssets)
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
      accountsPayable: parseFloat(accountsPayable),
      shortTermDebt: 0, // Implement if needed
      longTermDebt: 0, // Implement if needed
      current: parseFloat(accountsPayable),
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

    return {
      retainedEarnings: 0, // Implement retained earnings calculation
      currentYearEarnings: currentYearPL.summary.netIncome,
      total: currentYearPL.summary.netIncome
    };
  }

  // ===================== CASH FLOW STATEMENT =====================
  async generateCashFlowStatement(startDate, endDate) {
    try {
      const operatingCashFlow = await this.calculateOperatingCashFlow(startDate, endDate);
      const investingCashFlow = await this.calculateInvestingCashFlow(startDate, endDate);
      const financingCashFlow = await this.calculateFinancingCashFlow(startDate, endDate);

      const netCashFlow = operatingCashFlow.net + investingCashFlow.net + financingCashFlow.net;

      return {
        period: { startDate, endDate },
        operatingActivities: operatingCashFlow,
        investingActivities: investingCashFlow,
        financingActivities: financingCashFlow,
        netCashFlow: parseFloat(netCashFlow),
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
      receipts: parseFloat(cashReceipts),
      payments: parseFloat(cashPayments),
      net: parseFloat(cashReceipts - cashPayments)
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
        const balanceAmount = parseFloat(invoice.total) - parseFloat(invoice.paidAmount);

        const invoiceData = {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customer: invoice.customer,
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          totalAmount: parseFloat(invoice.total),
          paidAmount: parseFloat(invoice.paidAmount),
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
      const balanceAmount = parseFloat(invoice.total) - parseFloat(invoice.paidAmount);

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
    if (invoices.length === 0) return 0;

    const totalDays = invoices.reduce((sum, invoice) => {
      const days = Math.floor((asOfDate - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24));
      return sum + Math.max(0, days);
    }, 0);

    return Math.round(totalDays / invoices.length);
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
    const salesSummary = sales.reduce((acc, sale) => {
      acc.totalSales += parseFloat(sale.total);
      acc.cgstCollected += parseFloat(sale.cgstAmount);
      acc.sgstCollected += parseFloat(sale.sgstAmount);
      acc.igstCollected += parseFloat(sale.igstAmount);
      return acc;
    }, { totalSales: 0, cgstCollected: 0, sgstCollected: 0, igstCollected: 0 });

    const purchaseSummary = purchases.reduce((acc, purchase) => {
      acc.totalPurchases += parseFloat(purchase.total);
      // Add GST calculations for purchases if tracking GST on bills
      return acc;
    }, { totalPurchases: 0, cgstPaid: 0, sgstPaid: 0, igstPaid: 0 });

    return {
      sales: salesSummary,
      purchases: purchaseSummary,
      netGST: {
        cgst: salesSummary.cgstCollected - purchaseSummary.cgstPaid,
        sgst: salesSummary.sgstCollected - purchaseSummary.sgstPaid,
        igst: salesSummary.igstCollected - purchaseSummary.igstPaid
      }
    };
  }
}

module.exports = new FinancialReportsService();