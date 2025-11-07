/**
 * Input Sanitization Middleware
 * Prevents XSS attacks and validates common input patterns
 *
 * Uses express-validator for input sanitization and validation
 */

const { body, param, query, validationResult } = require('express-validator');
const logger = require('../config/logger');

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    logger.warn('Input validation failed', {
      ip: req.ip,
      user: req.user?.id,
      path: req.path,
      method: req.method,
      errors: errors.array()
    });

    return res.status(400).json({
      success: false,
      message: 'Input validation failed',
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg,
        value: err.value
      }))
    });
  }

  next();
};

/**
 * Common sanitization rules
 */

// Sanitize text input (trim, escape HTML)
const sanitizeText = () => body('*').trim().escape();

// Sanitize email
const sanitizeEmail = (field) => body(field).trim().normalizeEmail();

// Sanitize number
const sanitizeNumber = (field) => body(field).toFloat();

// Sanitize boolean
const sanitizeBoolean = (field) => body(field).toBoolean();

// Sanitize date (ISO 8601)
const sanitizeDate = (field) => body(field).isISO8601().toDate();

/**
 * Validation Rules for Common Entities
 */

/**
 * Customer validation and sanitization
 */
const validateCustomer = [
  body('name')
    .trim()
    .notEmpty().withMessage('Customer name is required')
    .isLength({ min: 2, max: 200 }).withMessage('Name must be 2-200 characters')
    .escape(),

  body('email')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail().withMessage('Invalid email address')
    .normalizeEmail(),

  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^[0-9+\-\s()]+$/).withMessage('Invalid phone number format')
    .isLength({ min: 10, max: 20 }).withMessage('Phone must be 10-20 characters'),

  body('address')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 }).withMessage('Address must be less than 500 characters')
    .escape(),

  body('nic')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 20 }).withMessage('NIC must be less than 20 characters')
    .escape(),

  body('company')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 200 }).withMessage('Company name must be less than 200 characters')
    .escape(),

  body('gstinNumber')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 }).withMessage('GSTIN must be less than 50 characters')
    .escape(),

  body('creditLimit')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Credit limit must be non-negative')
    .toFloat(),

  body('openingBalance')
    .optional({ checkFalsy: true })
    .isFloat().withMessage('Opening balance must be a number')
    .toFloat(),

  handleValidationErrors
];

/**
 * Invoice validation and sanitization
 */
const validateInvoice = [
  body('customerId')
    .trim()
    .notEmpty().withMessage('Customer ID is required')
    .isUUID().withMessage('Invalid customer ID'),

  body('invoiceDate')
    .notEmpty().withMessage('Invoice date is required')
    .isISO8601().withMessage('Invalid invoice date format')
    .toDate(),

  body('dueDate')
    .notEmpty().withMessage('Due date is required')
    .isISO8601().withMessage('Invalid due date format')
    .toDate(),

  body('subtotal')
    .notEmpty().withMessage('Subtotal is required')
    .isFloat({ min: 0.01 }).withMessage('Subtotal must be positive')
    .toFloat(),

  body('taxAmount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Tax amount must be non-negative')
    .toFloat(),

  body('total')
    .notEmpty().withMessage('Total is required')
    .isFloat({ min: 0.01 }).withMessage('Total must be positive')
    .toFloat(),

  body('discountType')
    .optional({ checkFalsy: true })
    .trim()
    .isIn(['Percentage', 'Fixed']).withMessage('Invalid discount type')
    .escape(),

  body('discountValue')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Discount value must be non-negative')
    .toFloat(),

  body('taxRate')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 100 }).withMessage('Tax rate must be 0-100%')
    .toFloat(),

  body('notes')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 }).withMessage('Notes must be less than 1000 characters')
    .escape(),

  handleValidationErrors
];

/**
 * Payment validation and sanitization
 */
const validatePayment = [
  body('invoiceId')
    .optional({ checkFalsy: true })
    .trim()
    .isUUID().withMessage('Invalid invoice ID'),

  body('billId')
    .optional({ checkFalsy: true })
    .trim()
    .isUUID().withMessage('Invalid bill ID'),

  body('amount')
    .notEmpty().withMessage('Payment amount is required')
    .isFloat({ min: 0.01 }).withMessage('Amount must be positive')
    .toFloat(),

  body('method')
    .trim()
    .notEmpty().withMessage('Payment method is required')
    .isIn(['Cash', 'Check', 'Bank Transfer', 'Credit Card', 'Online']).withMessage('Invalid payment method')
    .escape(),

  body('paymentDate')
    .notEmpty().withMessage('Payment date is required')
    .isISO8601().withMessage('Invalid payment date format')
    .toDate(),

  body('reference')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Reference must be less than 100 characters')
    .escape(),

  body('notes')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 }).withMessage('Notes must be less than 500 characters')
    .escape(),

  handleValidationErrors
];

/**
 * Bill validation and sanitization
 */
const validateBill = [
  body('purchaseOrderId')
    .trim()
    .notEmpty().withMessage('Purchase Order ID is required')
    .isUUID().withMessage('Invalid purchase order ID'),

  body('vendorId')
    .trim()
    .notEmpty().withMessage('Vendor ID is required')
    .isUUID().withMessage('Invalid vendor ID'),

  body('billDate')
    .notEmpty().withMessage('Bill date is required')
    .isISO8601().withMessage('Invalid bill date format')
    .toDate(),

  body('dueDate')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('Invalid due date format')
    .toDate(),

  body('subtotal')
    .notEmpty().withMessage('Subtotal is required')
    .isFloat({ min: 0.01 }).withMessage('Subtotal must be positive')
    .toFloat(),

  body('taxAmount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Tax amount must be non-negative')
    .toFloat(),

  body('total')
    .notEmpty().withMessage('Total is required')
    .isFloat({ min: 0.01 }).withMessage('Total must be positive')
    .toFloat(),

  handleValidationErrors
];

/**
 * Purchase Order validation and sanitization
 */
const validatePurchaseOrder = [
  body('vendorId')
    .trim()
    .notEmpty().withMessage('Vendor ID is required')
    .isUUID().withMessage('Invalid vendor ID'),

  body('orderDate')
    .notEmpty().withMessage('Order date is required')
    .isISO8601().withMessage('Invalid order date format')
    .toDate(),

  body('expectedDeliveryDate')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('Invalid delivery date format')
    .toDate(),

  body('subtotal')
    .notEmpty().withMessage('Subtotal is required')
    .isFloat({ min: 0.01 }).withMessage('Subtotal must be positive')
    .toFloat(),

  body('taxAmount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Tax amount must be non-negative')
    .toFloat(),

  body('total')
    .notEmpty().withMessage('Total is required')
    .isFloat({ min: 0.01 }).withMessage('Total must be positive')
    .toFloat(),

  body('notes')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 }).withMessage('Notes must be less than 1000 characters')
    .escape(),

  handleValidationErrors
];

/**
 * Cancellation/Void reason validation
 */
const validateCancellationReason = [
  body('reason')
    .trim()
    .notEmpty().withMessage('Cancellation/void reason is required')
    .isLength({ min: 5, max: 500 }).withMessage('Reason must be 5-500 characters')
    .escape(),

  handleValidationErrors
];

/**
 * UUID parameter validation
 */
const validateUUIDParam = (paramName = 'id') => [
  param(paramName)
    .trim()
    .isUUID().withMessage(`Invalid ${paramName}`),

  handleValidationErrors
];

/**
 * Pagination query validation
 */
const validatePagination = [
  query('page')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 }).withMessage('Page must be a positive integer')
    .toInt(),

  query('limit')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100')
    .toInt(),

  query('search')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Search query must be less than 100 characters')
    .escape(),

  handleValidationErrors
];

/**
 * General text sanitization for notes/descriptions
 */
const sanitizeTextFields = [
  body('notes')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 }).withMessage('Notes must be less than 1000 characters')
    .escape(),

  body('description')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters')
    .escape(),

  body('reason')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 }).withMessage('Reason must be less than 500 characters')
    .escape(),

  handleValidationErrors
];

module.exports = {
  // Validation functions
  validateCustomer,
  validateInvoice,
  validatePayment,
  validateBill,
  validatePurchaseOrder,
  validateCancellationReason,
  validateUUIDParam,
  validatePagination,
  sanitizeTextFields,

  // Individual sanitizers (for custom use)
  sanitizeText,
  sanitizeEmail,
  sanitizeNumber,
  sanitizeBoolean,
  sanitizeDate,

  // Error handler
  handleValidationErrors
};
