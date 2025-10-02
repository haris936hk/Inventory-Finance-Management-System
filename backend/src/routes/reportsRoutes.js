const express = require('express');
const {
  getProfitLossStatement,
  getBalanceSheet,
  getCashFlowStatement,
  getAccountsReceivableAging,
  getGSTReport,
  getFinancialSummary,
  exportReport
} = require('../controllers/reportsController');

const {
  getDashboardStats,
  getRevenueTrend,
  getInventoryStatusBreakdown
} = require('../controllers/dashboardController');

const { protect } = require('../middleware/authMiddleware');
const { checkPermission } = require('../middleware/permissionMiddleware');

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Dashboard Routes
router.get('/dashboard', getDashboardStats);
router.get('/dashboard/revenue-trend', getRevenueTrend);
router.get('/dashboard/inventory-status', getInventoryStatusBreakdown);

// Financial Reports
router.get('/profit-loss', checkPermission('reports.view'), getProfitLossStatement);
router.get('/balance-sheet', checkPermission('reports.view'), getBalanceSheet);
router.get('/cash-flow', checkPermission('reports.view'), getCashFlowStatement);
router.get('/accounts-receivable-aging', checkPermission('reports.view'), getAccountsReceivableAging);
router.get('/gst', checkPermission('reports.view'), getGSTReport);
router.get('/financial-summary', checkPermission('reports.view'), getFinancialSummary);

// Export functionality
router.post('/export', checkPermission('reports.export'), exportReport);

module.exports = router;