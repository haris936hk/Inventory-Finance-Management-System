// ========== src/services/reportService.js ==========
const db = require('../config/database');
const path = require('path');
const financialReportsService = require('./financialReportsService');

class ReportService {
  async getDashboardData() {
    try {
      console.log('Starting getDashboardData...');
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      console.log('Date calculations completed');

      // Get inventory metrics
      console.log('Starting inventory metrics...');
      const totalItems = await db.prisma.item.count({
        where: {
          deletedAt: null,
          NOT: {
            repaired: 'Returned'
          }
        }
      });
      console.log('Total items:', totalItems);

    const availableItems = await db.prisma.item.count({
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

    const soldThisMonth = await db.prisma.item.count({
      where: {
        status: 'Sold',
        outboundDate: {
          gte: startOfMonth
        }
      }
    });

    // Get financial metrics
    const totalRevenue = await db.prisma.invoice.aggregate({
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

    const monthlyRevenue = await db.prisma.invoice.aggregate({
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

    const outstandingAmount = await db.prisma.invoice.aggregate({
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
    const totalCustomers = await db.prisma.customer.count({
      where: { deletedAt: null }
    });

    const newCustomersThisMonth = await db.prisma.customer.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: startOfMonth
        }
      }
    });

    // Get top selling products
    const topProducts = await db.prisma.item.groupBy({
      by: ['modelId'],
      where: {
        status: 'Sold',
        NOT: [
          { modelId: null }
        ],
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
          const model = await db.prisma.productModel.findUnique({
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
    const recentInvoices = await db.prisma.invoice.findMany({
      where: { deletedAt: null },
      include: {
        customer: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    const recentPayments = await db.prisma.payment.findMany({
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

  async getInventoryReport(filters = {}) {
    const where = {
      deletedAt: null,
      NOT: {
        repaired: 'Returned'
      }
    };

    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    const items = await db.prisma.item.findMany({
      where,
      include: {
        category: true,
        model: {
          include: {
            company: true
          }
        },
        vendor: true
      }
    });

    // Group by category and status
    const summary = {};
    
    items.forEach(item => {
      const categoryName = item.category.name;
      const status = item.status;
      
      if (!summary[categoryName]) {
        summary[categoryName] = {};
      }
      
      if (!summary[categoryName][status]) {
        summary[categoryName][status] = {
          count: 0,
          value: 0
        };
      }
      
      summary[categoryName][status].count++;
      summary[categoryName][status].value += parseFloat(item.purchasePrice || 0);
    });

    return {
      items,
      summary,
      total: {
        count: items.length,
        value: items.reduce((sum, item) => sum + parseFloat(item.purchasePrice || 0), 0)
      }
    };
  }

  async getFinancialSummary(startDate, endDate) {
    const dateFilter = {};
    
    if (startDate) {
      dateFilter.gte = new Date(startDate);
    }
    
    if (endDate) {
      dateFilter.lte = new Date(endDate);
    }

    // Get income
    const income = await db.prisma.invoice.aggregate({
      where: {
        deletedAt: null,
        invoiceDate: dateFilter
      },
      _sum: {
        total: true,
        paidAmount: true
      }
    });

    // Get expenses (from bills)
    const expenses = await db.prisma.bill.aggregate({
      where: {
        deletedAt: null,
        billDate: dateFilter
      },
      _sum: {
        total: true,
        paidAmount: true
      }
    });

    // Get payments received
    const paymentsReceived = await db.prisma.payment.aggregate({
      where: {
        deletedAt: null,
        paymentDate: dateFilter
      },
      _sum: {
        amount: true
      }
    });

    // Get payments made
    const paymentsMade = await db.prisma.vendorPayment.aggregate({
      where: {
        deletedAt: null,
        paymentDate: dateFilter
      },
      _sum: {
        amount: true
      }
    });

    // Calculate COGS properly using financialReportsService
    const cogs = await financialReportsService.calculateCOGS(startDate, endDate);

    // Revenue (accrual basis)
    const revenue = income._sum.total || 0;

    // Operating expenses (from bills)
    const operatingExpenses = expenses._sum.total || 0;

    return {
      income: {
        invoiced: income._sum.total || 0,
        received: income._sum.paidAmount || 0,
        outstanding: (income._sum.total || 0) - (income._sum.paidAmount || 0)
      },
      expenses: {
        billed: expenses._sum.total || 0,
        paid: expenses._sum.paidAmount || 0,
        outstanding: (expenses._sum.total || 0) - (expenses._sum.paidAmount || 0)
      },
      cashFlow: {
        inflow: paymentsReceived._sum.amount || 0,
        outflow: paymentsMade._sum.amount || 0,
        net: (paymentsReceived._sum.amount || 0) - (paymentsMade._sum.amount || 0)
      },
      profitLoss: {
        grossProfit: revenue - cogs,  // Gross Profit = Revenue - COGS
        operatingExpenses: operatingExpenses,
        netProfit: revenue - cogs - operatingExpenses  // Net Profit = Gross Profit - Operating Expenses
      }
    };
  }

  async getSalesReport(startDate, endDate, groupBy = 'day') {
    const dateFilter = {};
    
    if (startDate) {
      dateFilter.gte = new Date(startDate);
    }
    
    if (endDate) {
      dateFilter.lte = new Date(endDate);
    }

    const invoices = await db.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        invoiceDate: dateFilter
      },
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
        }
      },
      orderBy: { invoiceDate: 'asc' }
    });

    // Group sales data
    const grouped = {};
    
    invoices.forEach(invoice => {
      let key;
      const date = new Date(invoice.invoiceDate);
      
      switch (groupBy) {
        case 'day':
          key = date.toISOString().split('T')[0];
          break;
        case 'week':
          const weekNumber = Math.ceil(date.getDate() / 7);
          key = `${date.getFullYear()}-W${weekNumber}`;
          break;
        case 'month':
          key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
          break;
        default:
          key = date.toISOString().split('T')[0];
      }
      
      if (!grouped[key]) {
        grouped[key] = {
          invoices: 0,
          items: 0,
          total: 0,
          customers: new Set()
        };
      }
      
      grouped[key].invoices++;
      grouped[key].items += invoice.items.length;
      grouped[key].total += parseFloat(invoice.total);
      grouped[key].customers.add(invoice.customerId);
    });

    // Convert sets to counts
    Object.keys(grouped).forEach(key => {
      grouped[key].uniqueCustomers = grouped[key].customers.size;
      delete grouped[key].customers;
    });

    return {
      period: { startDate, endDate },
      groupBy,
      data: grouped,
      totals: {
        invoices: invoices.length,
        revenue: invoices.reduce((sum, inv) => sum + parseFloat(inv.total), 0),
        averageInvoiceValue: invoices.length ? 
          (invoices.reduce((sum, inv) => sum + parseFloat(inv.total), 0) / invoices.length).toFixed(2) : 0
      }
    };
  }

  async getStockValuation() {
    const items = await db.prisma.item.findMany({
      where: {
        deletedAt: null,
        status: {
          in: ['In Store', 'In Hand', 'In Lab']
        },
        NOT: {
          repaired: 'Returned'
        }
      },
      include: {
        category: true,
        model: {
          include: {
            company: true
          }
        }
      }
    });

    // Calculate valuation by category
    const valuation = {};
    let totalCost = 0;
    let totalValue = 0;
    let totalPotentialRevenue = 0;
    let totalPotentialProfit = 0;

    items.forEach(item => {
      const categoryName = item.category.name;
      const cost = parseFloat(item.purchasePrice || 0);
      // Inventory valued at cost (not selling price) per GAAP/IFRS standards
      const value = cost;
      const potentialSellingPrice = parseFloat(item.sellingPrice || 0);
      const potentialProfit = potentialSellingPrice - cost;

      if (!valuation[categoryName]) {
        valuation[categoryName] = {
          quantity: 0,
          totalCost: 0,
          totalValue: 0,
          potentialRevenue: 0,
          potentialProfit: 0,
          items: []
        };
      }

      valuation[categoryName].quantity++;
      valuation[categoryName].totalCost += cost;
      valuation[categoryName].totalValue += value;
      valuation[categoryName].potentialRevenue += potentialSellingPrice;
      valuation[categoryName].potentialProfit += potentialProfit;
      valuation[categoryName].items.push({
        serialNumber: item.serialNumber,
        model: item.model.name,
        company: item.model.company.name,
        cost,
        value
      });

      totalCost += cost;
      totalValue += value;
      totalPotentialRevenue += potentialSellingPrice;
      totalPotentialProfit += potentialProfit;
    });

    return {
      categories: valuation,
      summary: {
        totalItems: items.length,
        totalCost,
        totalValue,  // Same as totalCost (valued at cost)
        potentialRevenue: totalPotentialRevenue,
        potentialProfit: totalPotentialProfit,
        potentialMargin: totalPotentialRevenue ? ((totalPotentialProfit / totalPotentialRevenue) * 100).toFixed(2) : 0
      }
    };
  }

  // ===================== NEW REPORTS FOR SIMPLE LEDGER SYSTEM =====================

  /**
   * Get sales revenue trends over time
   * Shows invoiced revenue (accrual) vs collected revenue (cash) with gap analysis
   */
  async getSalesTrends(startDate, endDate, groupBy = 'day') {
    const { formatAmount, addAmounts } = require('../utils/transactionWrapper');
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    // Get invoices (accrual basis - when revenue is recognized)
    const invoices = await db.prisma.invoice.findMany({
      where: {
        invoiceDate: { gte: startDateObj, lte: endDateObj },
        cancelledAt: null,  // Exclude cancelled invoices
        deletedAt: null
      },
      select: {
        id: true,
        invoiceDate: true,
        total: true,
        paidAmount: true
      }
    });

    // Get payments (cash basis - when cash is received)
    const payments = await db.prisma.payment.findMany({
      where: {
        paymentDate: { gte: startDateObj, lte: endDateObj },
        voidedAt: null,  // Exclude voided payments
        deletedAt: null
      },
      select: {
        paymentDate: true,
        amount: true
      }
    });

    // Group by time period
    const trendsMap = new Map();

    invoices.forEach(invoice => {
      const period = this.getGroupPeriod(invoice.invoiceDate, groupBy);
      if (!trendsMap.has(period)) {
        trendsMap.set(period, { period, invoiced: 0, collected: 0 });
      }
      const trend = trendsMap.get(period);
      trend.invoiced = addAmounts(trend.invoiced, invoice.total);
    });

    payments.forEach(payment => {
      const period = this.getGroupPeriod(payment.paymentDate, groupBy);
      if (!trendsMap.has(period)) {
        trendsMap.set(period, { period, invoiced: 0, collected: 0 });
      }
      const trend = trendsMap.get(period);
      trend.collected = addAmounts(trend.collected, payment.amount);
    });

    const trends = Array.from(trendsMap.values())
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(t => ({
        period: t.period,
        invoiced: formatAmount(t.invoiced),
        collected: formatAmount(t.collected),
        outstanding: formatAmount(t.invoiced - t.collected)
      }));

    // Calculate summary
    const totalInvoiced = formatAmount(
      invoices.reduce((sum, inv) => addAmounts(sum, inv.total), 0)
    );
    const totalCollected = formatAmount(
      payments.reduce((sum, pmt) => addAmounts(sum, pmt.amount), 0)
    );
    const outstanding = formatAmount(totalInvoiced - totalCollected);
    const collectionRate = totalInvoiced > 0
      ? formatAmount((totalCollected / totalInvoiced) * 100, 2)
      : 0;

    return {
      period: { startDate, endDate, groupBy },
      trends,
      summary: {
        totalInvoiced,
        totalCollected,
        outstanding,
        collectionRate
      }
    };
  }

  /**
   * Get simple cash flow summary (cash in vs cash out)
   * No fancy operating/investing/financing breakdown - just simple cash tracking
   */
  async getCashSummary(startDate, endDate, groupBy = 'month') {
    const { formatAmount, addAmounts } = require('../utils/transactionWrapper');
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    // Cash inflow (customer payments)
    const customerPayments = await db.prisma.payment.findMany({
      where: {
        paymentDate: { gte: startDateObj, lte: endDateObj },
        voidedAt: null,
        deletedAt: null
      },
      select: {
        paymentDate: true,
        amount: true,
        method: true
      }
    });

    // Cash outflow (vendor payments)
    const vendorPayments = await db.prisma.vendorPayment.findMany({
      where: {
        paymentDate: { gte: startDateObj, lte: endDateObj },
        voidedAt: null,
        deletedAt: null
      },
      select: {
        paymentDate: true,
        amount: true,
        method: true
      }
    });

    // Group by time period
    const cashFlowMap = new Map();

    customerPayments.forEach(payment => {
      const period = this.getGroupPeriod(payment.paymentDate, groupBy);
      if (!cashFlowMap.has(period)) {
        cashFlowMap.set(period, { period, inflow: 0, outflow: 0 });
      }
      const flow = cashFlowMap.get(period);
      flow.inflow = addAmounts(flow.inflow, payment.amount);
    });

    vendorPayments.forEach(payment => {
      const period = this.getGroupPeriod(payment.paymentDate, groupBy);
      if (!cashFlowMap.has(period)) {
        cashFlowMap.set(period, { period, inflow: 0, outflow: 0 });
      }
      const flow = cashFlowMap.get(period);
      flow.outflow = addAmounts(flow.outflow, payment.amount);
    });

    const cashFlow = Array.from(cashFlowMap.values())
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(cf => ({
        period: cf.period,
        inflow: formatAmount(cf.inflow),
        outflow: formatAmount(cf.outflow),
        netCashFlow: formatAmount(cf.inflow - cf.outflow)
      }));

    // Calculate summary
    const totalInflow = formatAmount(
      customerPayments.reduce((sum, pmt) => addAmounts(sum, pmt.amount), 0)
    );
    const totalOutflow = formatAmount(
      vendorPayments.reduce((sum, pmt) => addAmounts(sum, pmt.amount), 0)
    );
    const netCashFlow = formatAmount(totalInflow - totalOutflow);

    return {
      period: { startDate, endDate, groupBy },
      cashFlow,
      summary: {
        totalInflow,
        totalOutflow,
        netCashFlow
      }
    };
  }

  /**
   * Get customer analysis - top customers by revenue, distribution, etc.
   */
  async getCustomerAnalysis(startDate, endDate, topN = 10) {
    const { formatAmount, addAmounts } = require('../utils/transactionWrapper');
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    // Get all invoices grouped by customer
    const invoices = await db.prisma.invoice.findMany({
      where: {
        invoiceDate: { gte: startDateObj, lte: endDateObj },
        cancelledAt: null,
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

    // Get payments for the same period
    const payments = await db.prisma.payment.findMany({
      where: {
        paymentDate: { gte: startDateObj, lte: endDateObj },
        voidedAt: null,
        deletedAt: null
      },
      select: {
        customerId: true,
        amount: true
      }
    });

    // Group by customer
    const customerMap = new Map();

    invoices.forEach(invoice => {
      const customerId = invoice.customer.id;
      if (!customerMap.has(customerId)) {
        customerMap.set(customerId, {
          customer: invoice.customer,
          revenue: 0,
          payments: 0,
          invoiceCount: 0
        });
      }
      const data = customerMap.get(customerId);
      data.revenue = addAmounts(data.revenue, invoice.total);
      data.payments = addAmounts(data.payments, invoice.paidAmount || 0);
      data.invoiceCount++;
    });

    payments.forEach(payment => {
      if (customerMap.has(payment.customerId)) {
        // Note: payment amounts already counted in invoice.paidAmount above
        // This is just for reference if needed
      }
    });

    // Convert to array and calculate metrics
    const customerAnalysis = Array.from(customerMap.values())
      .map(c => ({
        customer: c.customer,
        revenue: formatAmount(c.revenue),
        payments: formatAmount(c.payments),
        outstanding: formatAmount(c.revenue - c.payments),
        invoiceCount: c.invoiceCount,
        collectionRate: c.revenue > 0 ? formatAmount((c.payments / c.revenue) * 100, 2) : 0
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const topCustomers = customerAnalysis.slice(0, topN);
    const totalRevenue = formatAmount(
      customerAnalysis.reduce((sum, c) => addAmounts(sum, c.revenue), 0)
    );

    return {
      period: { startDate, endDate },
      topCustomers,
      summary: {
        totalCustomers: customerAnalysis.length,
        totalRevenue,
        averageRevenuePerCustomer: customerAnalysis.length > 0
          ? formatAmount(totalRevenue / customerAnalysis.length)
          : 0
      }
    };
  }

  /**
   * Helper method to group dates by period (day/week/month)
   */
  getGroupPeriod(date, groupBy) {
    const d = new Date(date);
    switch (groupBy) {
      case 'day':
        return d.toISOString().split('T')[0];  // YYYY-MM-DD
      case 'week':
        const weekNum = Math.ceil(d.getDate() / 7);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-W${weekNum}`;
      case 'month':
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;  // YYYY-MM
      default:
        return d.toISOString().split('T')[0];
    }
  }
}

module.exports = new ReportService();