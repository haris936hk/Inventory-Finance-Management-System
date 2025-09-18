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

// Export
router.post('/export',
  hasPermission(['reports.export']),
  reportController.exportReport
);

module.exports = router;