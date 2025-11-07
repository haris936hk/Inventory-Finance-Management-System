// ========== src/routes/reportRoutes.js ==========
const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { protect, hasPermission } = require('../middleware/auth');
const { cacheControl, CACHE_DURATION } = require('../middleware/cacheControl');

// All routes require authentication
router.use(protect);

// PERFORMANCE OPTIMIZATION: Dashboard with caching (5 min client-side cache)
router.get('/dashboard',
  hasPermission(['reports.view']),
  cacheControl(CACHE_DURATION.MEDIUM), // 5 min cache for dashboard stats
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

router.get('/vendor-bills-aging',
  hasPermission(['reports.view']),
  reportController.getVendorBillsAging
);

router.get('/inventory-turnover',
  hasPermission(['reports.view']),
  reportController.getInventoryTurnover
);

router.get('/gross-profit-margin',
  hasPermission(['reports.view']),
  reportController.getGrossProfitMargin
);

// =========== DOUBLE-ENTRY ACCOUNTING REPORTS ===========
router.get('/accounting/trial-balance',
  hasPermission(['reports.view']),
  reportController.getTrialBalance
);

router.get('/accounting/balance-sheet',
  hasPermission(['reports.view']),
  reportController.getAccountingBalanceSheet
);

router.get('/accounting/profit-loss',
  hasPermission(['reports.view']),
  reportController.getAccountingProfitLoss
);

router.get('/accounting/tax-summary',
  hasPermission(['reports.view']),
  reportController.getTaxSummary
);

module.exports = router;