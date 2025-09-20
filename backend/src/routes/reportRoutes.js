// ========== src/routes/reportRoutes.js ==========
const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { protect, hasPermission } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Dashboard
router.get('/dashboard',
  hasPermission(['reports.view']),
  reportController.getDashboard
);

// Inventory Reports
router.get('/inventory',
  hasPermission(['reports.view']),
  reportController.getInventoryReport
);

router.get('/stock-valuation',
  hasPermission(['reports.view']),
  reportController.getStockValuation
);

// Financial Reports
router.get('/financial-summary',
  hasPermission(['reports.view']),
  reportController.getFinancialSummary
);

router.get('/sales',
  hasPermission(['reports.view']),
  reportController.getSalesReport
);

// =========== COMPREHENSIVE FINANCIAL REPORTS ===========
router.get('/profit-loss',
  hasPermission(['reports.view']),
  reportController.getProfitLossStatement
);

router.get('/balance-sheet',
  hasPermission(['reports.view']),
  reportController.getBalanceSheet
);

router.get('/cash-flow',
  hasPermission(['reports.view']),
  reportController.getCashFlowStatement
);

router.get('/accounts-receivable-aging',
  hasPermission(['reports.view']),
  reportController.getAccountsReceivableAging
);

router.get('/gst',
  hasPermission(['reports.view']),
  reportController.getGSTReport
);

router.get('/financial-dashboard',
  hasPermission(['reports.view']),
  reportController.getFinancialDashboard
);

// Export
router.post('/export',
  hasPermission(['reports.export']),
  reportController.exportReport
);

module.exports = router;