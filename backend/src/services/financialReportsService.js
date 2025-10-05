const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
          openingBalance: parseFloat(openingBalance),
          customerPayments: parseFloat(customerPayments._sum.amount || 0),
          vendorPayments: parseFloat(vendorPayments._sum.amount || 0),
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
      return parseFloat(financeSettings?.openingCashBalance || 0);
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
        netChange: parseFloat(netCashFlow),
        openingBalance: parseFloat(openingBalance),
        closingBalance: parseFloat(closingBalance),
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
        const balanceAmount = parseFloat(bill.total) - parseFloat(bill.paidAmount || 0);

        const billData = {
          id: bill.id,
          billNumber: bill.billNumber,
          billDate: bill.billDate,
          dueDate: bill.dueDate,
          vendor: bill.vendor,
          total: parseFloat(bill.total),
          paidAmount: parseFloat(bill.paidAmount || 0),
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
      const balanceAmount = parseFloat(bill.total) - parseFloat(bill.paidAmount || 0);

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
    if (bills.length === 0) return 0;

    const totalDays = bills.reduce((sum, bill) => {
      const days = Math.floor((asOfDate - new Date(bill.dueDate || bill.billDate)) / (1000 * 60 * 60 * 24));
      return sum + Math.max(0, days);
    }, 0);

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
      acc.totalSales += parseFloat(sale.total || 0);
      acc.cgstCollected += parseFloat(sale.cgstAmount || 0);
      acc.sgstCollected += parseFloat(sale.sgstAmount || 0);
      acc.igstCollected += parseFloat(sale.igstAmount || 0);
      return acc;
    }, { totalSales: 0, cgstCollected: 0, sgstCollected: 0, igstCollected: 0 });

    // Calculate total sales tax
    const totalSalesTax = salesSummary.cgstCollected + salesSummary.sgstCollected + salesSummary.igstCollected;

    // Purchase tax - Bills only have taxAmount (no CGST/SGST/IGST breakdown)
    // We show total tax paid without assuming the breakdown
    const purchaseSummary = purchases.reduce((acc, purchase) => {
      acc.totalPurchases += parseFloat(purchase.total || 0);
      acc.totalTaxPaid += parseFloat(purchase.taxAmount || 0);
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
}

module.exports = new FinancialReportsService();