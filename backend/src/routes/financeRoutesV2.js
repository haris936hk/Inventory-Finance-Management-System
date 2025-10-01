/**
 * Finance Routes V2 - Refactored API with lifecycle management
 */

const express = require('express');
const router = express.Router();
const {
  createPurchaseOrder,
  updatePurchaseOrder,
  updatePurchaseOrderStatus,
  getPurchaseOrder,
  createBill,
  cancelBill,
  getBill,
  recordPayment,
  voidPayment,
  getBillPayments
} = require('../controllers/financeControllerV2');
const { protect, authorize } = require('../middleware/auth');

// ============= PURCHASE ORDERS =============

/**
 * @route   POST /api/v2/finance/purchase-orders
 * @desc    Create a new purchase order
 * @access  Private (requires finance.create permission)
 */
router.post('/purchase-orders', protect, authorize('finance.create'), createPurchaseOrder);

/**
 * @route   GET /api/v2/finance/purchase-orders/:id
 * @desc    Get purchase order details
 * @access  Private (requires finance.view permission)
 */
router.get('/purchase-orders/:id', protect, authorize('finance.view'), getPurchaseOrder);

/**
 * @route   PUT /api/v2/finance/purchase-orders/:id
 * @desc    Update purchase order (Draft only)
 * @access  Private (requires finance.edit permission)
 */
router.put('/purchase-orders/:id', protect, authorize('finance.edit'), updatePurchaseOrder);

/**
 * @route   PUT /api/v2/finance/purchase-orders/:id/status
 * @desc    Update purchase order status
 * @access  Private (requires finance.edit permission)
 */
router.put('/purchase-orders/:id/status', protect, authorize('finance.edit'), updatePurchaseOrderStatus);

// ============= BILLS =============

/**
 * @route   POST /api/v2/finance/bills
 * @desc    Create a bill against a purchase order
 * @access  Private (requires finance.create permission)
 */
router.post('/bills', protect, authorize('finance.create'), createBill);

/**
 * @route   GET /api/v2/finance/bills/:id
 * @desc    Get bill details
 * @access  Private (requires finance.view permission)
 */
router.get('/bills/:id', protect, authorize('finance.view'), getBill);

/**
 * @route   POST /api/v2/finance/bills/:id/cancel
 * @desc    Cancel a bill (soft-cancel)
 * @access  Private (requires finance.edit permission)
 */
router.post('/bills/:id/cancel', protect, authorize('finance.edit'), cancelBill);

/**
 * @route   GET /api/v2/finance/bills/:billId/payments
 * @desc    Get all payments for a bill
 * @access  Private (requires finance.view permission)
 */
router.get('/bills/:billId/payments', protect, authorize('finance.view'), getBillPayments);

// ============= PAYMENTS =============

/**
 * @route   POST /api/v2/finance/payments
 * @desc    Record a vendor payment
 * @access  Private (requires finance.create permission)
 */
router.post('/payments', protect, authorize('finance.create'), recordPayment);

/**
 * @route   POST /api/v2/finance/payments/:id/void
 * @desc    Void a payment (mark as voided, don't delete)
 * @access  Private (requires finance.edit permission)
 */
router.post('/payments/:id/void', protect, authorize('finance.edit'), voidPayment);

module.exports = router;
