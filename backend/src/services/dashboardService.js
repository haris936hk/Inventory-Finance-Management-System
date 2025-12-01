const db = require('../config/database');
const { formatAmount } = require('../utils/transactionWrapper');

// Get prisma client from database wrapper
const prisma = db.prisma;

/**
 * Dashboard Service
 * Provides aggregated statistics and data for the main dashboard
 *
 * REVAMPED: 2025-01-21
 * - Fixed all Prisma query errors (balanceDue, invalid statuses)
 * - Added proper cancelledAt/voidedAt filters
 * - Revenue now based on actual payments, not invoices
 * - Added Purchase Order metrics
 * - Simplified to essential metrics only
 */

/**
 * Get comprehensive dashboard statistics
 */
const getDashboardStats = async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Run all queries in parallel for better performance
  const [
    inventoryStats,
    financialStats,
    customerStats,
    purchaseOrderStats,
    payablesStats,
    recentInvoices,
    recentPurchaseOrders,
  ] = await Promise.all([
    getInventoryStats(startOfMonth),
    getFinancialStats(startOfMonth),
    getCustomerStats(startOfMonth),
    getPurchaseOrderStats(startOfMonth),
    getPayablesStats(startOfMonth),
    getRecentInvoices(5),
    getRecentPurchaseOrders(5),
  ]);

  return {
    inventory: inventoryStats,
    financial: financialStats,
    customers: customerStats,
    purchaseOrders: purchaseOrderStats,
    payables: payablesStats,
    recentTransactions: {
      invoices: recentInvoices,
      purchaseOrders: recentPurchaseOrders,
    },
  };
};

/**
 * Get inventory statistics
 * FIXED: Now uses inventoryStatus (availability) instead of status (physical location)
 */
const getInventoryStats = async (startOfMonth) => {
  // Total items in stock (physical location)
  const totalItems = await prisma.item.count({
    where: {
      status: 'In Store',
      deletedAt: null,
    },
  });

  // Available items (inventory availability status)
  const availableItems = await prisma.item.count({
    where: {
      inventoryStatus: 'Available',
      deletedAt: null,
    },
  });

  // Reserved items (pending sale)
  const reservedItems = await prisma.item.count({
    where: {
      inventoryStatus: 'Reserved',
      deletedAt: null,
    },
  });

  // Items sold this month (based on outbound date)
  const soldThisMonth = await prisma.item.count({
    where: {
      inventoryStatus: { in: ['Sold', 'Delivered'] },
      outboundDate: { gte: startOfMonth },
      deletedAt: null,
    },
  });

  // Calculate utilization rate (non-available / total in stock)
  const utilizationRate = totalItems > 0
    ? formatAmount(((totalItems - availableItems) / totalItems) * 100, 2)
    : 0;

  return {
    totalItems,
    availableItems,
    reservedItems,
    soldThisMonth,
    utilizationRate,
  };
};

/**
 * Get financial statistics
 * FIXED:
 * - Revenue now calculated from actual payments (Payment model)
 * - Outstanding calculated from invoice.total - invoice.paidAmount
 * - Removed invalid 'Pending' status
 * - Added cancelledAt and voidedAt filters
 */
const getFinancialStats = async (startOfMonth) => {
  // Total revenue (all time) - sum of actual payments received
  const totalRevenueResult = await prisma.payment.aggregate({
    where: {
      voidedAt: null,
      deletedAt: null,
    },
    _sum: {
      amount: true,
    },
  });

  // Monthly revenue - payments received this month
  const monthlyRevenueResult = await prisma.payment.aggregate({
    where: {
      paymentDate: { gte: startOfMonth },
      voidedAt: null,
      deletedAt: null,
    },
    _sum: {
      amount: true,
    },
  });

  // Outstanding amount - calculate total - paidAmount for unpaid invoices
  const unpaidInvoices = await prisma.invoice.findMany({
    where: {
      status: { in: ['Sent', 'Partial', 'Overdue'] },
      cancelledAt: null,
      deletedAt: null,
    },
    select: {
      total: true,
      paidAmount: true,
    },
  });

  const outstandingAmount = unpaidInvoices.reduce((sum, invoice) => {
    return formatAmount(sum + (invoice.total - invoice.paidAmount));
  }, 0);

  // Count of unpaid invoices (Sent, Partial, Overdue)
  const unpaidCount = unpaidInvoices.length;

  // Count overdue invoices
  const overdueCount = await prisma.invoice.count({
    where: {
      status: 'Overdue',
      cancelledAt: null,
      deletedAt: null,
    },
  });

  return {
    totalRevenue: totalRevenueResult._sum.amount || 0,
    monthlyRevenue: monthlyRevenueResult._sum.amount || 0,
    outstandingAmount,
    unpaidInvoices: unpaidCount,
    overdueInvoices: overdueCount,
  };
};

/**
 * Get customer statistics
 * FIXED: Active customers now uses groupBy instead of problematic distinct
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
  // FIXED: Use groupBy instead of distinct
  const activeCustomersData = await prisma.invoice.groupBy({
    by: ['customerId'],
    where: {
      invoiceDate: { gte: startOfMonth },
      cancelledAt: null,
      deletedAt: null,
    },
  });

  return {
    total,
    newThisMonth,
    activeThisMonth: activeCustomersData.length,
  };
};

/**
 * Get Purchase Order statistics
 * NEW: Added to support PO metrics on dashboard
 */
const getPurchaseOrderStats = async (startOfMonth) => {
  // Active POs (Sent, Partial, Paid statuses)
  const activePOs = await prisma.purchaseOrder.count({
    where: {
      status: { in: ['Sent', 'Partial', 'Paid'] },
      deletedAt: null,
    },
  });

  // Total PO value this month
  const monthlyPOValueResult = await prisma.purchaseOrder.aggregate({
    where: {
      orderDate: { gte: startOfMonth },
      status: { notIn: ['Cancelled'] },
      deletedAt: null,
    },
    _sum: {
      total: true,
    },
  });

  // Pending bills count (POs in Sent status with no bills created yet)
  const pendingBills = await prisma.purchaseOrder.count({
    where: {
      status: 'Sent',
      billedAmount: 0,
      deletedAt: null,
    },
  });

  return {
    activePOs,
    monthlyPOValue: monthlyPOValueResult._sum.total || 0,
    pendingBills,
  };
};

/**
 * Get payables statistics (amounts owed to vendors)
 * NEW: Added to support Outstanding Payables on dashboard
 * Similar to getFinancialStats but for Bills instead of Invoices
 */
const getPayablesStats = async (startOfMonth) => {
  // Outstanding payables - calculate total - paidAmount for unpaid bills
  const unpaidBills = await prisma.bill.findMany({
    where: {
      status: { in: ['Unpaid', 'Partial'] },
      cancelledAt: null,
      deletedAt: null,
    },
    select: {
      total: true,
      paidAmount: true,
      dueDate: true,
    },
  });

  const outstandingPayables = unpaidBills.reduce((sum, bill) => {
    return formatAmount(sum + (bill.total - bill.paidAmount));
  }, 0);

  // Count of unpaid bills (Unpaid, Partial)
  const unpaidCount = unpaidBills.length;

  // Count overdue bills (past due date and still unpaid)
  const now = new Date();
  const overdueCount = unpaidBills.filter(bill =>
    bill.dueDate && new Date(bill.dueDate) < now
  ).length;

  return {
    outstandingPayables,
    unpaidBills: unpaidCount,
    overdueBills: overdueCount,
  };
};

/**
 * Get recent invoices
 * FIXED: Added cancelledAt filter to exclude cancelled invoices
 */
const getRecentInvoices = async (limit = 5) => {
  const invoices = await prisma.invoice.findMany({
    where: {
      cancelledAt: null,
      deletedAt: null,
    },
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
 * Get recent purchase orders
 * NEW: Added to show recent PO activity on dashboard
 */
const getRecentPurchaseOrders = async (limit = 5) => {
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      deletedAt: null,
      // Note: We show all POs including cancelled ones for visibility
    },
    include: {
      vendor: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });

  return purchaseOrders;
};

// ===== LEGACY FUNCTIONS (kept for backward compatibility, not used in main dashboard) =====

/**
 * Get top selling products
 * LEGACY: Not used in revamped dashboard
 */
const getTopSellingProducts = async (limit = 5) => {
  // Get sold items grouped by model
  const soldItems = await prisma.item.groupBy({
    by: ['modelId'],
    where: {
      inventoryStatus: { in: ['Sold', 'Delivered'] },
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
 * Get monthly revenue trend
 * LEGACY: Not used in revamped dashboard (removed charts)
 */
const getMonthlyRevenueTrend = async (months = 6) => {
  const trends = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

    // FIXED: Use Payment model instead of Invoice for accurate revenue
    const revenue = await prisma.payment.aggregate({
      where: {
        paymentDate: {
          gte: monthStart,
          lte: monthEnd,
        },
        voidedAt: null,
        deletedAt: null,
      },
      _sum: {
        amount: true,
      },
    });

    trends.push({
      month: monthStart.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      revenue: revenue._sum.amount || 0,
    });
  }

  return trends;
};

/**
 * Get inventory status breakdown
 * LEGACY: Not used in revamped dashboard
 */
const getInventoryStatusBreakdown = async () => {
  // FIXED: Use inventoryStatus instead of status
  const statusCounts = await prisma.item.groupBy({
    by: ['inventoryStatus'],
    where: { deletedAt: null },
    _count: {
      id: true,
    },
  });

  return statusCounts.map(item => ({
    status: item.inventoryStatus,
    count: item._count.id,
  }));
};

/**
 * Get recent payments (customer payments)
 * LEGACY: Not used in revamped dashboard (replaced with Recent POs)
 * FIXED: Added voidedAt filter
 */
const getRecentPayments = async (limit = 5) => {
  const payments = await prisma.payment.findMany({
    where: {
      voidedAt: null,
      deletedAt: null,
    },
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

module.exports = {
  getDashboardStats,
  getInventoryStats,
  getFinancialStats,
  getCustomerStats,
  getPurchaseOrderStats,
  getPayablesStats,
  getRecentInvoices,
  getRecentPurchaseOrders,
  // Legacy functions (backward compatibility)
  getTopSellingProducts,
  getRecentPayments,
  getMonthlyRevenueTrend,
  getInventoryStatusBreakdown,
};
