/**
 * Finance Controller V2 - Refactored with lifecycle management
 */

const asyncHandler = require('express-async-handler');
const purchaseOrderService = require('../services/purchaseOrderService');
const billService = require('../services/billService');
const paymentService = require('../services/paymentService');
const {
  ValidationError,
  ConcurrencyError,
  InsufficientBalanceError
} = require('../utils/transactionWrapper');
const logger = require('../config/logger');

// ============= PURCHASE ORDERS =============

/**
 * @desc    Create purchase order
 * @route   POST /api/v2/finance/purchase-orders
 * @access  Private
 */
const createPurchaseOrder = asyncHandler(async (req, res) => {
  const purchaseOrder = await purchaseOrderService.createPurchaseOrder(req.body);

  res.status(201).json({
    success: true,
    data: purchaseOrder,
    message: `Purchase Order ${purchaseOrder.poNumber} created successfully`
  });
});

/**
 * @desc    Update purchase order (Draft only)
 * @route   PUT /api/v2/finance/purchase-orders/:id
 * @access  Private
 */
const updatePurchaseOrder = asyncHandler(async (req, res) => {
  const purchaseOrder = await purchaseOrderService.updatePurchaseOrder(
    req.params.id,
    req.body
  );

  res.json({
    success: true,
    data: purchaseOrder,
    message: 'Purchase Order updated successfully'
  });
});

/**
 * @desc    Update purchase order status
 * @route   PUT /api/v2/finance/purchase-orders/:id/status
 * @access  Private
 */
const updatePurchaseOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!status) {
    throw new ValidationError('Status is required');
  }

  const purchaseOrder = await purchaseOrderService.updatePurchaseOrderStatus(
    req.params.id,
    status,
    req.user.id
  );

  res.json({
    success: true,
    data: purchaseOrder,
    message: `Purchase Order status updated to ${status}`
  });
});

/**
 * @desc    Get purchase order with details
 * @route   GET /api/v2/finance/purchase-orders/:id
 * @access  Private
 */
const getPurchaseOrder = asyncHandler(async (req, res) => {
  const purchaseOrder = await purchaseOrderService.getPurchaseOrder(req.params.id);

  res.json({
    success: true,
    data: purchaseOrder
  });
});

// ============= BILLS =============

/**
 * @desc    Create bill against PO
 * @route   POST /api/v2/finance/bills
 * @access  Private
 */
const createBill = asyncHandler(async (req, res) => {
  const bill = await billService.createBill(req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: bill,
    message: `Bill ${bill.billNumber} created successfully`
  });
});

/**
 * @desc    Cancel bill
 * @route   POST /api/v2/finance/bills/:id/cancel
 * @access  Private
 */
const cancelBill = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  if (!reason) {
    throw new ValidationError('Cancellation reason is required');
  }

  const bill = await billService.cancelBill(req.params.id, reason, req.user.id);

  res.json({
    success: true,
    data: bill,
    message: 'Bill cancelled successfully'
  });
});

/**
 * @desc    Get bill details
 * @route   GET /api/v2/finance/bills/:id
 * @access  Private
 */
const getBill = asyncHandler(async (req, res) => {
  const bill = await billService.getBill(req.params.id);

  res.json({
    success: true,
    data: bill
  });
});

// ============= PAYMENTS =============

/**
 * @desc    Record payment
 * @route   POST /api/v2/finance/payments
 * @access  Private
 */
const recordPayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.recordPayment(req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: payment,
    message: `Payment ${payment.paymentNumber} recorded successfully`
  });
});

/**
 * @desc    Void payment
 * @route   POST /api/v2/finance/payments/:id/void
 * @access  Private
 */
const voidPayment = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  if (!reason) {
    throw new ValidationError('Void reason is required');
  }

  const payment = await paymentService.voidPayment(req.params.id, reason, req.user.id);

  res.json({
    success: true,
    data: payment,
    message: 'Payment voided successfully'
  });
});

/**
 * @desc    Get payments for bill
 * @route   GET /api/v2/finance/bills/:billId/payments
 * @access  Private
 */
const getBillPayments = asyncHandler(async (req, res) => {
  const payments = await paymentService.getPaymentsForBill(req.params.billId);

  res.json({
    success: true,
    count: payments.length,
    data: payments
  });
});

module.exports = {
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
};
