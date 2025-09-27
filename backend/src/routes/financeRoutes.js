// ========== src/routes/financeRoutes.js ==========
const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const { protect, hasPermission } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Customer routes
router.route('/customers')
  .get(hasPermission(['finance.view']), financeController.getCustomers)
  .post(hasPermission(['finance.create']), financeController.createCustomer);

router.route('/customers/:id')
  .get(hasPermission(['finance.view']), financeController.getCustomer)
  .put(hasPermission(['finance.edit']), financeController.updateCustomer);

router.get('/customers/:id/statement',
  hasPermission(['finance.view']),
  financeController.getCustomerStatement
);

router.get('/customers/:id/ledger',
  hasPermission(['finance.view']),
  financeController.getCustomerLedger
);

// Vendor ledger route
router.get('/vendors/:id/ledger',
  hasPermission(['finance.view']),
  financeController.getVendorLedger
);

// Invoice routes
router.route('/invoices')
  .get(hasPermission(['finance.view']), financeController.getInvoices)
  .post(hasPermission(['finance.create']), financeController.createInvoice);

router.route('/invoices/:id')
  .get(hasPermission(['finance.view']), financeController.getInvoice);

router.put('/invoices/:id/status',
  hasPermission(['finance.edit']),
  financeController.updateInvoiceStatus
);

// Payment routes
router.route('/payments')
  .get(hasPermission(['finance.view']), financeController.getPayments)
  .post(hasPermission(['finance.create']), financeController.recordPayment);

// Account routes
router.route('/accounts')
  .get(hasPermission(['finance.view']), financeController.getAccounts)
  .post(hasPermission(['finance.create']), financeController.createAccount);

// Purchase Order routes
router.route('/purchase-orders')
  .get(hasPermission(['finance.view']), financeController.getPurchaseOrders)
  .post(hasPermission(['finance.create']), financeController.createPurchaseOrder);

router.route('/purchase-orders/:id')
  .get(hasPermission(['finance.view']), financeController.getPurchaseOrder)
  .put(hasPermission(['finance.edit']), financeController.updatePurchaseOrder);

router.put('/purchase-orders/:id/status',
  hasPermission(['finance.edit']),
  financeController.updatePurchaseOrderStatus
);

// Vendor Bills routes
router.route('/vendor-bills')
  .get(hasPermission(['finance.view']), financeController.getVendorBills)
  .post(hasPermission(['finance.create']), financeController.createVendorBill);

router.route('/vendor-bills/:id')
  .get(hasPermission(['finance.view']), financeController.getVendorBill)
  .put(hasPermission(['finance.edit']), financeController.updateVendorBill);

router.put('/vendor-bills/:id/status',
  hasPermission(['finance.edit']),
  financeController.updateVendorBillStatus
);

// Vendor Payments routes
router.route('/vendor-payments')
  .get(hasPermission(['finance.view']), financeController.getVendorPayments)
  .post(hasPermission(['finance.create']), financeController.recordVendorPayment);

// Installment Plan routes
router.post('/installment-plans',
  hasPermission(['finance.create']),
  financeController.createInstallmentPlan
);

// Report routes
router.get('/reports/aging',
  hasPermission(['finance.view']),
  financeController.getAgingReport
);

module.exports = router;