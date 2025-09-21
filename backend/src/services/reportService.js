// ========== src/services/reportService.js ==========
const db = require('../config/database');
const ExcelJS = require('exceljs');
const supabaseStorage = require('../config/supabase');
const path = require('path');

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
        where: { deletedAt: null }
      });
      console.log('Total items:', totalItems);

    const availableItems = await db.prisma.item.count({
      where: {
        deletedAt: null,
        status: {
          in: ['In Store', 'In Hand', 'In Lab']
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
        modelId: {
          not: null
        },
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
    const where = { deletedAt: null };

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
        vendor: true,
        warehouse: true
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
        grossProfit: (income._sum.total || 0) - (expenses._sum.total || 0),
        netProfit: (income._sum.paidAmount || 0) - (expenses._sum.paidAmount || 0)
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

    items.forEach(item => {
      const categoryName = item.category.name;
      const cost = parseFloat(item.purchasePrice || 0);
      const value = parseFloat(item.sellingPrice || item.purchasePrice || 0);
      
      if (!valuation[categoryName]) {
        valuation[categoryName] = {
          quantity: 0,
          totalCost: 0,
          totalValue: 0,
          items: []
        };
      }
      
      valuation[categoryName].quantity++;
      valuation[categoryName].totalCost += cost;
      valuation[categoryName].totalValue += value;
      valuation[categoryName].items.push({
        serialNumber: item.serialNumber,
        model: item.model.name,
        company: item.model.company.name,
        cost,
        value
      });
      
      totalCost += cost;
      totalValue += value;
    });

    return {
      categories: valuation,
      summary: {
        totalItems: items.length,
        totalCost,
        totalValue,
        potentialProfit: totalValue - totalCost,
        profitMargin: totalCost ? ((totalValue - totalCost) / totalCost * 100).toFixed(2) : 0
      }
    };
  }

  async exportToExcel(reportType, filters = {}) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    let data;
    
    switch (reportType) {
      case 'inventory':
        data = await this.getInventoryReport(filters);
        this.formatInventoryExcel(worksheet, data);
        break;
      case 'financial':
        data = await this.getFinancialSummary(filters.startDate, filters.endDate);
        this.formatFinancialExcel(worksheet, data);
        break;
      case 'sales':
        data = await this.getSalesReport(filters.startDate, filters.endDate, filters.groupBy);
        this.formatSalesExcel(worksheet, data);
        break;
      case 'valuation':
        data = await this.getStockValuation();
        this.formatValuationExcel(worksheet, data);
        break;
      default:
        throw new Error('Invalid report type');
    }

    // Generate filename
    const filename = `${reportType}_report_${Date.now()}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();

    // Upload to Supabase
    const file = await supabaseStorage.upload(
      supabaseStorage.buckets.exports,
      filename,
      buffer,
      { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    );

    const url = await supabaseStorage.createSignedUrl(
      supabaseStorage.buckets.exports,
      filename,
      3600 // 1 hour expiry
    );

    return { filename, url };
  }

  formatInventoryExcel(worksheet, data) {
    // Add headers
    worksheet.columns = [
      { header: 'Serial Number', key: 'serialNumber', width: 20 },
      { header: 'Category', key: 'category', width: 15 },
      { header: 'Company', key: 'company', width: 15 },
      { header: 'Model', key: 'model', width: 20 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Purchase Price', key: 'purchasePrice', width: 15 },
      { header: 'Inbound Date', key: 'inboundDate', width: 15 }
    ];

    // Add data
    data.items.forEach(item => {
      worksheet.addRow({
        serialNumber: item.serialNumber,
        category: item.category.name,
        company: item.model.company.name,
        model: item.model.name,
        status: item.status,
        purchasePrice: item.purchasePrice,
        inboundDate: item.inboundDate
      });
    });

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
  }

  formatFinancialExcel(worksheet, data) {
    // Add summary data
    worksheet.addRow(['Financial Summary Report']);
    worksheet.addRow([]);
    worksheet.addRow(['Income']);
    worksheet.addRow(['Invoiced', data.income.invoiced]);
    worksheet.addRow(['Received', data.income.received]);
    worksheet.addRow(['Outstanding', data.income.outstanding]);
    worksheet.addRow([]);
    worksheet.addRow(['Expenses']);
    worksheet.addRow(['Billed', data.expenses.billed]);
    worksheet.addRow(['Paid', data.expenses.paid]);
    worksheet.addRow(['Outstanding', data.expenses.outstanding]);
    worksheet.addRow([]);
    worksheet.addRow(['Profit/Loss']);
    worksheet.addRow(['Gross Profit', data.profitLoss.grossProfit]);
    worksheet.addRow(['Net Profit', data.profitLoss.netProfit]);
  }

  formatSalesExcel(worksheet, data) {
    // Add headers
    worksheet.columns = [
      { header: 'Period', key: 'period', width: 15 },
      { header: 'Invoices', key: 'invoices', width: 12 },
      { header: 'Items', key: 'items', width: 12 },
      { header: 'Total Revenue', key: 'total', width: 15 },
      { header: 'Unique Customers', key: 'customers', width: 18 }
    ];

    // Add data
    Object.entries(data.data).forEach(([period, metrics]) => {
      worksheet.addRow({
        period,
        invoices: metrics.invoices,
        items: metrics.items,
        total: metrics.total,
        customers: metrics.uniqueCustomers
      });
    });
  }

  formatValuationExcel(worksheet, data) {
    // Add headers
    worksheet.columns = [
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Quantity', key: 'quantity', width: 12 },
      { header: 'Total Cost', key: 'cost', width: 15 },
      { header: 'Total Value', key: 'value', width: 15 },
      { header: 'Potential Profit', key: 'profit', width: 15 }
    ];

    // Add data
    Object.entries(data.categories).forEach(([category, metrics]) => {
      worksheet.addRow({
        category,
        quantity: metrics.quantity,
        cost: metrics.totalCost,
        value: metrics.totalValue,
        profit: metrics.totalValue - metrics.totalCost
      });
    });

    // Add totals
    worksheet.addRow([]);
    worksheet.addRow({
      category: 'TOTAL',
      quantity: data.summary.totalItems,
      cost: data.summary.totalCost,
      value: data.summary.totalValue,
      profit: data.summary.potentialProfit
    });
  }
}

module.exports = new ReportService();