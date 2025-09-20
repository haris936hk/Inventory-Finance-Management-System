const express = require('express');
const {
  handlePurchaseOrderCompletion,
  createBillFromPurchaseOrder,
  handleSupplierInvoiceExpenseUpdate,
  handleInvoicePaymentInventoryUpdate,
  getAutomationLogs,
  getAutomationStats,
  retryFailedAutomation
} = require('../controllers/automationController');

const { protect } = require('../middleware/authMiddleware');
const { checkPermission } = require('../middleware/permissionMiddleware');

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Purchase Order Automation
router.post('/purchase-order-completion',
  checkPermission('inventory.edit'),
  handlePurchaseOrderCompletion
);

router.post('/create-bill-from-po',
  checkPermission('finance.create'),
  createBillFromPurchaseOrder
);

// Supplier Invoice Automation
router.post('/supplier-invoice-expense',
  checkPermission('finance.edit'),
  handleSupplierInvoiceExpenseUpdate
);

// Sales Invoice Automation
router.post('/invoice-payment-inventory',
  checkPermission('inventory.edit'),
  handleInvoicePaymentInventoryUpdate
);

// Automation Monitoring
router.get('/logs',
  checkPermission('reports.view'),
  getAutomationLogs
);

router.get('/stats',
  checkPermission('reports.view'),
  getAutomationStats
);

// Retry failed automations
router.post('/retry/:logId',
  checkPermission('inventory.edit'),
  retryFailedAutomation
);

module.exports = router;