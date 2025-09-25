// ========== src/controllers/inventoryLifecycleController.js ==========
const asyncHandler = require('express-async-handler');
const inventoryLifecycleService = require('../services/inventoryLifecycleService');
const invoiceLifecycleService = require('../services/invoiceLifecycleService');

// ============= INVENTORY LIFECYCLE MANAGEMENT =============

// @desc    Reserve specific items for an invoice
// @route   POST /api/inventory/lifecycle/reserve
// @access  Private
const reserveItemsForInvoice = asyncHandler(async (req, res) => {
  const { itemIds, invoiceId } = req.body;

  if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
    res.status(400);
    throw new Error('Item IDs array is required');
  }

  if (!invoiceId) {
    res.status(400);
    throw new Error('Invoice ID is required');
  }

  const result = await inventoryLifecycleService.reserveItemsForInvoice(
    itemIds,
    invoiceId,
    req.user.id
  );

  res.status(200).json({
    success: true,
    data: result
  });
});

// @desc    Release reserved items (cancel invoice)
// @route   POST /api/inventory/lifecycle/release
// @access  Private
const releaseItemsForInvoice = asyncHandler(async (req, res) => {
  const { invoiceId } = req.body;

  if (!invoiceId) {
    res.status(400);
    throw new Error('Invoice ID is required');
  }

  const result = await inventoryLifecycleService.releaseItemsForInvoiceCancellation(
    invoiceId,
    req.user.id
  );

  res.json({
    success: true,
    data: result
  });
});

// @desc    Mark items as sold (invoice paid)
// @route   POST /api/inventory/lifecycle/mark-sold
// @access  Private
const markItemsAsSold = asyncHandler(async (req, res) => {
  const { invoiceId } = req.body;

  if (!invoiceId) {
    res.status(400);
    throw new Error('Invoice ID is required');
  }

  const result = await inventoryLifecycleService.markItemsAsSoldForInvoice(
    invoiceId,
    req.user.id
  );

  res.json({
    success: true,
    data: result
  });
});

// @desc    Mark items as delivered
// @route   POST /api/inventory/lifecycle/mark-delivered
// @access  Private
const markItemsAsDelivered = asyncHandler(async (req, res) => {
  const { invoiceId, deliveryInfo } = req.body;

  if (!invoiceId) {
    res.status(400);
    throw new Error('Invoice ID is required');
  }

  const result = await inventoryLifecycleService.markItemsAsDeliveredForInvoice(
    invoiceId,
    req.user.id,
    deliveryInfo
  );

  res.json({
    success: true,
    data: result
  });
});

// ============= INVOICE LIFECYCLE MANAGEMENT =============

// @desc    Get complete invoice lifecycle status
// @route   GET /api/inventory/lifecycle/invoice/:invoiceId/status
// @access  Private
const getInvoiceLifecycleStatus = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;

  const status = await invoiceLifecycleService.getInvoiceLifecycleStatus(invoiceId);

  res.json({
    success: true,
    data: status
  });
});

// @desc    Force invoice lifecycle status change
// @route   POST /api/inventory/lifecycle/invoice/:invoiceId/transition
// @access  Private
const forceInvoiceStatusTransition = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;
  const { fromStatus, toStatus } = req.body;

  if (!fromStatus || !toStatus) {
    res.status(400);
    throw new Error('Both fromStatus and toStatus are required');
  }

  const result = await invoiceLifecycleService.handleStatusChange(
    invoiceId,
    fromStatus,
    toStatus,
    req.user.id
  );

  res.json({
    success: true,
    data: result
  });
});

// @desc    Fix inventory inconsistencies for an invoice
// @route   POST /api/inventory/lifecycle/invoice/:invoiceId/fix-inconsistencies
// @access  Private
const fixInventoryInconsistencies = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;

  const result = await invoiceLifecycleService.fixInventoryInconsistencies(
    invoiceId,
    req.user.id
  );

  res.json({
    success: true,
    data: result
  });
});

// ============= INVENTORY STATUS MANAGEMENT =============

// @desc    Get inventory status for specific items
// @route   GET /api/inventory/lifecycle/items/status
// @access  Private
const getItemsStatus = asyncHandler(async (req, res) => {
  const { itemIds } = req.query;

  if (!itemIds) {
    res.status(400);
    throw new Error('Item IDs are required');
  }

  const itemIdArray = Array.isArray(itemIds) ? itemIds : itemIds.split(',');

  const result = await inventoryLifecycleService.getInvoiceInventoryStatus(itemIdArray);

  res.json({
    success: true,
    data: result
  });
});

// @desc    Get status history for items
// @route   GET /api/inventory/lifecycle/items/history
// @access  Private
const getItemStatusHistory = asyncHandler(async (req, res) => {
  const { itemIds } = req.query;

  if (!itemIds) {
    res.status(400);
    throw new Error('Item IDs are required');
  }

  const itemIdArray = Array.isArray(itemIds) ? itemIds : itemIds.split(',');

  const history = await inventoryLifecycleService.getItemStatusHistory(itemIdArray);

  res.json({
    success: true,
    count: history.length,
    data: history
  });
});

// ============= MAINTENANCE & CLEANUP =============

// @desc    Cleanup expired temporary reservations
// @route   DELETE /api/inventory/lifecycle/cleanup-expired
// @access  Private (Admin)
const cleanupExpiredReservations = asyncHandler(async (req, res) => {
  const result = await inventoryLifecycleService.cleanupExpiredReservations();

  res.json({
    success: true,
    message: `Cleaned up ${result.cleanedCount} expired reservations`,
    data: result
  });
});

// @desc    Get inventory lifecycle dashboard data
// @route   GET /api/inventory/lifecycle/dashboard
// @access  Private
const getLifecycleDashboard = asyncHandler(async (req, res) => {
  const db = require('../config/database');

  // Get aggregated inventory status statistics
  const statusStats = await db.prisma.item.groupBy({
    by: ['inventoryStatus'],
    _count: {
      inventoryStatus: true
    },
    where: {
      deletedAt: null
    }
  });

  // Get recent status changes
  const recentChanges = await db.prisma.inventoryStatusHistory.findMany({
    take: 50,
    orderBy: { changeDate: 'desc' },
    include: {
      item: {
        select: {
          serialNumber: true,
          category: { select: { name: true } },
          model: {
            select: {
              name: true,
              company: { select: { name: true } }
            }
          }
        }
      },
      changedByUser: {
        select: { fullName: true }
      }
    }
  });

  // Get items with pending reservations
  const pendingReservations = await db.prisma.item.findMany({
    where: {
      inventoryStatus: 'Reserved',
      deletedAt: null
    },
    select: {
      id: true,
      serialNumber: true,
      reservedAt: true,
      reservedForType: true,
      reservedForId: true,
      category: { select: { name: true } },
      model: {
        select: {
          name: true,
          company: { select: { name: true } }
        }
      }
    },
    orderBy: { reservedAt: 'desc' },
    take: 20
  });

  // Get inconsistency alerts (reserved items without expiry older than 24 hours)
  const inconsistencyAlerts = await db.prisma.item.findMany({
    where: {
      inventoryStatus: 'Reserved',
      reservationExpiry: null,
      reservedAt: {
        lte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
      },
      deletedAt: null
    },
    select: {
      id: true,
      serialNumber: true,
      reservedAt: true,
      reservedForType: true,
      reservedForId: true,
      category: { select: { name: true } },
      model: {
        select: {
          name: true,
          company: { select: { name: true } }
        }
      }
    }
  });

  const dashboard = {
    statusStatistics: statusStats.reduce((acc, stat) => {
      acc[stat.inventoryStatus] = stat._count.inventoryStatus;
      return acc;
    }, {}),
    recentChanges: recentChanges.slice(0, 10),
    pendingReservations: pendingReservations,
    inconsistencyAlerts: inconsistencyAlerts,
    summary: {
      totalItems: statusStats.reduce((sum, stat) => sum + stat._count.inventoryStatus, 0),
      reservedItems: statusStats.find(s => s.inventoryStatus === 'Reserved')?._count.inventoryStatus || 0,
      soldItems: statusStats.find(s => s.inventoryStatus === 'Sold')?._count.inventoryStatus || 0,
      deliveredItems: statusStats.find(s => s.inventoryStatus === 'Delivered')?._count.inventoryStatus || 0,
      inconsistencyCount: inconsistencyAlerts.length
    }
  };

  res.json({
    success: true,
    data: dashboard
  });
});

module.exports = {
  // Inventory operations
  reserveItemsForInvoice,
  releaseItemsForInvoice,
  markItemsAsSold,
  markItemsAsDelivered,

  // Invoice lifecycle
  getInvoiceLifecycleStatus,
  forceInvoiceStatusTransition,
  fixInventoryInconsistencies,

  // Status tracking
  getItemsStatus,
  getItemStatusHistory,

  // Maintenance
  cleanupExpiredReservations,
  getLifecycleDashboard
};