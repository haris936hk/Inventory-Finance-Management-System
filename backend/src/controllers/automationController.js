const asyncHandler = require('express-async-handler');
const automationService = require('../services/automationService');

// @desc    Handle Purchase Order Completion Automation
// @route   POST /api/automation/purchase-order-completion
// @access  Private
const handlePurchaseOrderCompletion = asyncHandler(async (req, res) => {
  const { purchaseOrderId } = req.body;
  const userId = req.user.id;

  if (!purchaseOrderId) {
    res.status(400);
    throw new Error('Purchase Order ID is required');
  }

  const result = await automationService.handlePurchaseOrderCompletion(purchaseOrderId, userId);

  res.json({
    success: true,
    message: result.message,
    data: result
  });
});

// @desc    Create Bill from Purchase Order
// @route   POST /api/automation/create-bill-from-po
// @access  Private
const createBillFromPurchaseOrder = asyncHandler(async (req, res) => {
  const { purchaseOrderId, billDetails } = req.body;
  const userId = req.user.id;

  if (!purchaseOrderId) {
    res.status(400);
    throw new Error('Purchase Order ID is required');
  }

  const result = await automationService.createBillFromPurchaseOrder(purchaseOrderId, billDetails, userId);

  res.status(201).json({
    success: true,
    message: result.message,
    data: result
  });
});

// @desc    Handle Supplier Invoice Expense Update
// @route   POST /api/automation/supplier-invoice-expense
// @access  Private
const handleSupplierInvoiceExpenseUpdate = asyncHandler(async (req, res) => {
  const { billId } = req.body;
  const userId = req.user.id;

  if (!billId) {
    res.status(400);
    throw new Error('Bill ID is required');
  }

  const result = await automationService.handleSupplierInvoiceExpenseUpdate(billId, userId);

  res.json({
    success: true,
    message: result.message,
    data: result
  });
});

// @desc    Handle Invoice Payment Inventory Update
// @route   POST /api/automation/invoice-payment-inventory
// @access  Private
const handleInvoicePaymentInventoryUpdate = asyncHandler(async (req, res) => {
  const { invoiceId } = req.body;
  const userId = req.user.id;

  if (!invoiceId) {
    res.status(400);
    throw new Error('Invoice ID is required');
  }

  const result = await automationService.handleInvoicePaymentInventoryUpdate(invoiceId, userId);

  res.json({
    success: true,
    message: result.message,
    data: result
  });
});

// @desc    Get Automation Logs
// @route   GET /api/automation/logs
// @access  Private
const getAutomationLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, action, status } = req.query;

  const filters = {};
  if (action) filters.action = action;
  if (status) filters.status = status;

  const logs = await prisma.automationLog.findMany({
    where: filters,
    orderBy: { executedAt: 'desc' },
    skip: (page - 1) * limit,
    take: parseInt(limit),
    include: {
      _count: true
    }
  });

  const total = await prisma.automationLog.count({ where: filters });

  res.json({
    success: true,
    data: {
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// @desc    Get Automation Statistics
// @route   GET /api/automation/stats
// @access  Private
const getAutomationStats = asyncHandler(async (req, res) => {
  const { period = '30days' } = req.query;

  let startDate;
  if (period === '7days') {
    startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === '30days') {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  } else if (period === '90days') {
    startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  }

  const stats = await prisma.automationLog.groupBy({
    by: ['action', 'status'],
    where: {
      executedAt: {
        gte: startDate
      }
    },
    _count: {
      id: true
    }
  });

  // Calculate success rates
  const actionStats = {};
  stats.forEach(stat => {
    if (!actionStats[stat.action]) {
      actionStats[stat.action] = { total: 0, success: 0, failed: 0 };
    }
    actionStats[stat.action].total += stat._count.id;
    if (stat.status === 'Success') {
      actionStats[stat.action].success += stat._count.id;
    } else if (stat.status === 'Failed') {
      actionStats[stat.action].failed += stat._count.id;
    }
  });

  // Add success rates
  Object.keys(actionStats).forEach(action => {
    const stat = actionStats[action];
    stat.successRate = stat.total > 0 ? (stat.success / stat.total * 100) : 0;
  });

  res.json({
    success: true,
    data: {
      period,
      actionStats,
      summary: {
        totalAutomations: stats.reduce((sum, s) => sum + s._count.id, 0),
        totalSuccess: stats.filter(s => s.status === 'Success').reduce((sum, s) => sum + s._count.id, 0),
        totalFailed: stats.filter(s => s.status === 'Failed').reduce((sum, s) => sum + s._count.id, 0)
      }
    }
  });
});

// @desc    Retry Failed Automation
// @route   POST /api/automation/retry/:logId
// @access  Private
const retryFailedAutomation = asyncHandler(async (req, res) => {
  const { logId } = req.params;
  const userId = req.user.id;

  const log = await prisma.automationLog.findUnique({
    where: { id: logId }
  });

  if (!log) {
    res.status(404);
    throw new Error('Automation log not found');
  }

  if (log.status !== 'Failed') {
    res.status(400);
    throw new Error('Can only retry failed automations');
  }

  let result;

  // Retry based on the original action
  switch (log.action) {
    case 'PURCHASE_INVENTORY_UPDATE':
      result = await automationService.handlePurchaseOrderCompletion(log.sourceId, userId);
      break;
    case 'BILL_EXPENSE_UPDATE':
      result = await automationService.handleSupplierInvoiceExpenseUpdate(log.sourceId, userId);
      break;
    case 'INVOICE_INVENTORY_UPDATE':
      result = await automationService.handleInvoicePaymentInventoryUpdate(log.sourceId, userId);
      break;
    default:
      res.status(400);
      throw new Error('Unknown automation action');
  }

  res.json({
    success: true,
    message: 'Automation retried successfully',
    data: result
  });
});

module.exports = {
  handlePurchaseOrderCompletion,
  createBillFromPurchaseOrder,
  handleSupplierInvoiceExpenseUpdate,
  handleInvoicePaymentInventoryUpdate,
  getAutomationLogs,
  getAutomationStats,
  retryFailedAutomation
};