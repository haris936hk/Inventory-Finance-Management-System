// ========== src/routes/financeRoutes.js ==========
const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const { protect, hasPermission } = require('../middleware/auth');
const {
  paymentRateLimiter,
  creationRateLimiter,
  updateRateLimiter,
  readRateLimiter
} = require('../middleware/rateLimiters');
const {
  validateCustomer,
  validateInvoice,
  validatePayment,
  validateBill,
  validatePurchaseOrder,
  validateCancellationReason,
  validateUUIDParam,
  validatePagination
} = require('../middleware/sanitization');

// All routes require authentication
router.use(protect);

// Customer routes
router.route('/customers')
  .get(readRateLimiter, validatePagination, hasPermission(['finance.view']), financeController.getCustomers)
  .post(creationRateLimiter, validateCustomer, hasPermission(['finance.create']), financeController.createCustomer);

router.route('/customers/:id')
  .get(readRateLimiter, validateUUIDParam('id'), hasPermission(['finance.view']), financeController.getCustomer)
  .put(updateRateLimiter, validateUUIDParam('id'), validateCustomer, hasPermission(['finance.edit']), financeController.updateCustomer);

router.get('/customers/:id/statement',
  readRateLimiter,
  hasPermission(['finance.view']),
  financeController.getCustomerStatement
);

router.get('/customers/:id/ledger',
  readRateLimiter,
  hasPermission(['finance.view']),
  financeController.getCustomerLedger
);

// Vendor ledger route
router.get('/vendors/:id/ledger',
  readRateLimiter,
  hasPermission(['finance.view']),
  financeController.getVendorLedger
);

// Invoice routes
router.route('/invoices')
  .get(readRateLimiter, validatePagination, hasPermission(['finance.view']), financeController.getInvoices)
  .post(creationRateLimiter, validateInvoice, hasPermission(['finance.create']), financeController.createInvoice);

router.route('/invoices/:id')
  .get(readRateLimiter, validateUUIDParam('id'), hasPermission(['finance.view']), financeController.getInvoice);

router.put('/invoices/:id/status',
  updateRateLimiter,
  validateUUIDParam('id'),
  hasPermission(['finance.edit']),
  financeController.updateInvoiceStatus
);

// Cancel invoice (new endpoint)
router.post('/invoices/:id/cancel',
  updateRateLimiter,
  validateUUIDParam('id'),
  validateCancellationReason,
  hasPermission(['finance.edit']),
  financeController.cancelInvoice
);

// Generate invoice PDF
router.get('/invoices/:id/pdf',
  readRateLimiter,
  validateUUIDParam('id'),
  hasPermission(['finance.view']),
  financeController.generateInvoicePDF
);

// Payment routes (STRICT RATE LIMITING + VALIDATION)
router.route('/payments')
  .get(readRateLimiter, validatePagination, hasPermission(['finance.view']), financeController.getPayments)
  .post(paymentRateLimiter, validatePayment, hasPermission(['finance.create']), financeController.recordPayment);

// Void customer payment (STRICT RATE LIMITING + VALIDATION)
router.post('/payments/:id/void',
  paymentRateLimiter,
  validateUUIDParam('id'),
  validateCancellationReason,
  hasPermission(['finance.edit']),
  financeController.voidCustomerPayment
);

// Chart of Accounts routes (read-only for reporting)
router.route('/accounts')
  .get(readRateLimiter, validatePagination, hasPermission(['finance.view']), financeController.getAccounts);

router.route('/accounts/:id')
  .get(readRateLimiter, validateUUIDParam('id'), hasPermission(['finance.view']), financeController.getAccount);

// Journal Entry routes (read-only for audit/reporting)
router.route('/journal-entries')
  .get(readRateLimiter, validatePagination, hasPermission(['finance.view']), financeController.getJournalEntries);

// Financial Reports routes
router.get('/reports/trial-balance',
  readRateLimiter,
  hasPermission(['finance.view']),
  financeController.getTrialBalance
);

router.get('/reports/balance-sheet',
  readRateLimiter,
  hasPermission(['finance.view']),
  financeController.getBalanceSheet
);

router.get('/reports/profit-loss',
  readRateLimiter,
  hasPermission(['finance.view']),
  financeController.getProfitLoss
);

// Purchase Order routes
router.route('/purchase-orders')
  .get(readRateLimiter, validatePagination, hasPermission(['finance.view']), financeController.getPurchaseOrders)
  .post(creationRateLimiter, validatePurchaseOrder, hasPermission(['finance.create']), financeController.createPurchaseOrder);

router.route('/purchase-orders/:id')
  .get(readRateLimiter, validateUUIDParam('id'), hasPermission(['finance.view']), financeController.getPurchaseOrder)
  .put(updateRateLimiter, validateUUIDParam('id'), validatePurchaseOrder, hasPermission(['finance.edit']), financeController.updatePurchaseOrder);

router.put('/purchase-orders/:id/status',
  updateRateLimiter,
  validateUUIDParam('id'),
  hasPermission(['finance.edit']),
  financeController.updatePurchaseOrderStatus
);

router.get('/purchase-orders/:id/items',
  readRateLimiter,
  validateUUIDParam('id'),
  hasPermission(['finance.view']),
  financeController.getPurchaseOrderItems
);

// Generate purchase order PDF
router.get('/purchase-orders/:id/pdf',
  readRateLimiter,
  validateUUIDParam('id'),
  hasPermission(['finance.view']),
  financeController.generatePurchaseOrderPDF
);

// Vendor Bills routes
router.route('/vendor-bills')
  .get(readRateLimiter, validatePagination, hasPermission(['finance.view']), financeController.getVendorBills)
  .post(creationRateLimiter, validateBill, hasPermission(['finance.create']), financeController.createVendorBill);

router.route('/vendor-bills/:id')
  .get(readRateLimiter, validateUUIDParam('id'), hasPermission(['finance.view']), financeController.getVendorBill)
  .put(updateRateLimiter, validateUUIDParam('id'), validateBill, hasPermission(['finance.edit']), financeController.updateVendorBill);

// Cancel bill (new endpoint)
router.post('/vendor-bills/:id/cancel',
  updateRateLimiter,
  validateUUIDParam('id'),
  validateCancellationReason,
  hasPermission(['finance.edit']),
  financeController.cancelVendorBill
);

// Get bill payments (new endpoint)
router.get('/vendor-bills/:billId/payments',
  readRateLimiter,
  validateUUIDParam('billId'),
  hasPermission(['finance.view']),
  financeController.getBillPayments
);

// Status update (kept for backward compatibility, but deprecated)
router.put('/vendor-bills/:id/status',
  updateRateLimiter,
  validateUUIDParam('id'),
  hasPermission(['finance.edit']),
  financeController.updateVendorBillStatus
);

// Generate vendor bill PDF
router.get('/vendor-bills/:id/pdf',
  readRateLimiter,
  validateUUIDParam('id'),
  hasPermission(['finance.view']),
  financeController.generateVendorBillPDF
);

// Vendor Payments routes (STRICT RATE LIMITING + VALIDATION)
router.route('/vendor-payments')
  .get(readRateLimiter, validatePagination, hasPermission(['finance.view']), financeController.getVendorPayments)
  .post(paymentRateLimiter, validatePayment, hasPermission(['finance.create']), financeController.recordVendorPayment);

// Void vendor payment (STRICT RATE LIMITING + VALIDATION)
router.post('/vendor-payments/:id/void',
  paymentRateLimiter,
  validateUUIDParam('id'),
  validateCancellationReason,
  hasPermission(['finance.edit']),
  financeController.voidVendorPayment);

// Report routes
router.get('/reports/aging',
  readRateLimiter,
  hasPermission(['finance.view']),
  financeController.getAgingReport
);

module.exports = router;