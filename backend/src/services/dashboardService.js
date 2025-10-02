const prisma = require('../config/database');

/**
 * Dashboard Service
 * Provides aggregated statistics and data for the main dashboard
 */

/**
 * Get comprehensive dashboard statistics
 */
const getDashboardStats = async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  // Run all queries in parallel for better performance
  const [
    inventoryStats,
    financialStats,
    customerStats,
    topProducts,
    recentInvoices,
    recentPayments,
  ] = await Promise.all([
    getInventoryStats(startOfMonth),
    getFinancialStats(startOfMonth, startOfYear),
    getCustomerStats(startOfMonth),
    getTopSellingProducts(5),
    getRecentInvoices(5),
    getRecentPayments(5),
  ]);

  return {
    inventory: inventoryStats,
    financial: financialStats,
    customers: customerStats,
    topProducts,
    recentTransactions: {
      invoices: recentInvoices,
      payments: recentPayments,
    },
  };
};

/**
 * Get inventory statistics
 */
const getInventoryStats = async (startOfMonth) => {
  // Total items count
  const totalItems = await prisma.item.count({
    where: { deletedAt: null },
  });

  // Available items count
  const availableItems = await prisma.item.count({
    where: {
      status: 'Available',
      deletedAt: null,
    },
  });

  // Items sold this month
  const soldThisMonth = await prisma.item.count({
    where: {
      status: { in: ['Sold', 'Delivered'] },
      updatedAt: { gte: startOfMonth },
      deletedAt: null,
    },
  });

  // Calculate utilization rate (sold + reserved / total)
  const reservedItems = await prisma.item.count({
    where: {
      status: 'Reserved',
      deletedAt: null,
    },
  });

  const utilizationRate = totalItems > 0
    ? (((totalItems - availableItems) / totalItems) * 100).toFixed(2)
    : '0.00';

  return {
    totalItems,
    availableItems,
    soldThisMonth,
    reservedItems,
    utilizationRate,
  };
};

/**
 * Get financial statistics
 */
const getFinancialStats = async (startOfMonth, startOfYear) => {
  // Total revenue (all time - from paid invoices)
  const totalRevenueResult = await prisma.invoice.aggregate({
    where: {
      status: { in: ['Paid', 'Partial'] },
      deletedAt: null,
    },
    _sum: {
      total: true,
    },
  });

  // Monthly revenue
  const monthlyRevenueResult = await prisma.invoice.aggregate({
    where: {
      status: { in: ['Paid', 'Partial'] },
      invoiceDate: { gte: startOfMonth },
      deletedAt: null,
    },
    _sum: {
      total: true,
    },
  });

  // Outstanding amount (pending + overdue invoices)
  const outstandingResult = await prisma.invoice.aggregate({
    where: {
      status: { in: ['Pending', 'Overdue', 'Partial'] },
      deletedAt: null,
    },
    _sum: {
      balanceDue: true,
    },
  });

  // Count overdue invoices
  const overdueCount = await prisma.invoice.count({
    where: {
      status: 'Overdue',
      deletedAt: null,
    },
  });

  return {
    totalRevenue: totalRevenueResult._sum.total || 0,
    monthlyRevenue: monthlyRevenueResult._sum.total || 0,
    outstandingAmount: outstandingResult._sum.balanceDue || 0,
    overdueInvoices: overdueCount,
  };
};

/**
 * Get customer statistics
 */
const getCustomerStats = async (startOfMonth) => {
  // Total customers
  const total = await prisma.customer.count({
    where: { deletedAt: null },
  });

  // New customers this month
  const newThisMonth = await prisma.customer.count({
    where: {
      createdAt: { gte: startOfMonth },
      deletedAt: null,
    },
  });

  // Active customers (those who made purchases this month)
  const activeThisMonth = await prisma.invoice.findMany({
    where: {
      invoiceDate: { gte: startOfMonth },
      deletedAt: null,
    },
    distinct: ['customerId'],
    select: { customerId: true },
  });

  return {
    total,
    newThisMonth,
    activeThisMonth: activeThisMonth.length,
  };
};

/**
 * Get top selling products
 */
const getTopSellingProducts = async (limit = 5) => {
  // Get sold items grouped by model
  const soldItems = await prisma.item.groupBy({
    by: ['modelId'],
    where: {
      status: { in: ['Sold', 'Delivered'] },
      deletedAt: null,
    },
    _count: {
      id: true,
    },
    orderBy: {
      _count: {
        id: 'desc',
      },
    },
    take: limit,
  });

  // Get model details for each group
  const topProducts = await Promise.all(
    soldItems.map(async (item) => {
      const model = await prisma.productModel.findUnique({
        where: { id: item.modelId },
        include: {
          category: true,
          company: true,
        },
      });

      return {
        modelId: item.modelId,
        model,
        count: item._count.id,
      };
    })
  );

  return topProducts.filter(p => p.model !== null);
};

/**
 * Get recent invoices
 */
const getRecentInvoices = async (limit = 5) => {
  const invoices = await prisma.invoice.findMany({
    where: { deletedAt: null },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });

  return invoices;
};

/**
 * Get recent payments
 */
const getRecentPayments = async (limit = 5) => {
  const payments = await prisma.customerPayment.findMany({
    where: { deletedAt: null },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
    },
    orderBy: {
      paymentDate: 'desc',
    },
    take: limit,
  });

  return payments;
};

/**
 * Get monthly revenue trend (last 6 months)
 */
const getMonthlyRevenueTrend = async (months = 6) => {
  const trends = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

    const revenue = await prisma.invoice.aggregate({
      where: {
        status: { in: ['Paid', 'Partial'] },
        invoiceDate: {
          gte: monthStart,
          lte: monthEnd,
        },
        deletedAt: null,
      },
      _sum: {
        total: true,
      },
    });

    trends.push({
      month: monthStart.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      revenue: revenue._sum.total || 0,
    });
  }

  return trends;
};

/**
 * Get inventory status breakdown
 */
const getInventoryStatusBreakdown = async () => {
  const statusCounts = await prisma.item.groupBy({
    by: ['status'],
    where: { deletedAt: null },
    _count: {
      id: true,
    },
  });

  return statusCounts.map(item => ({
    status: item.status,
    count: item._count.id,
  }));
};

module.exports = {
  getDashboardStats,
  getInventoryStats,
  getFinancialStats,
  getCustomerStats,
  getTopSellingProducts,
  getRecentInvoices,
  getRecentPayments,
  getMonthlyRevenueTrend,
  getInventoryStatusBreakdown,
};
