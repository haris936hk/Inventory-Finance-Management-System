/**
 * Business Rule Validation Service
 *
 * Centralized validation logic for all business rules
 */

const db = require('../config/database');
const {
  ValidationError,
  compareAmounts,
  formatAmount
} = require('../utils/transactionWrapper');

/**
 * Validate PO can have bills created
 *
 * @param {Object} po - Purchase Order
 * @throws {ValidationError} If validation fails
 */
function validatePOCanCreateBill(po) {
  if (!po) {
    throw new ValidationError('Purchase Order not found');
  }

  if (po.deletedAt) {
    throw new ValidationError('Purchase Order is deleted');
  }

  if (po.status === 'Cancelled') {
    throw new ValidationError('Cannot create bill for cancelled Purchase Order');
  }

  if (po.status === 'Draft') {
    throw new ValidationError(
      'Cannot create bill for Draft Purchase Order. Status must be "Sent" or higher.'
    );
  }

  if (po.status === 'Completed') {
    throw new ValidationError('Purchase Order is already completed');
  }

  const remainingAmount = formatAmount(parseFloat(po.total) - parseFloat(po.billedAmount));

  if (remainingAmount <= 0) {
    throw new ValidationError(
      `Purchase Order is fully billed. Total: ${po.total}, Billed: ${po.billedAmount}`
    );
  }
}

/**
 * Validate bill amount does not exceed PO remaining balance
 *
 * @param {Object} po - Purchase Order
 * @param {number} billAmount - Proposed bill amount
 * @throws {ValidationError} If validation fails
 */
function validateBillAmount(po, billAmount) {
  const poTotal = formatAmount(po.total);
  const currentBilled = formatAmount(po.billedAmount);
  const remaining = formatAmount(poTotal - currentBilled);
  const billAmountFormatted = formatAmount(billAmount);

  if (billAmountFormatted > remaining + 0.01) { // 1 cent tolerance
    throw new ValidationError(
      `Bill amount (${billAmountFormatted}) exceeds remaining PO balance (${remaining}). ` +
      `PO Total: ${poTotal}, Already Billed: ${currentBilled}`
    );
  }

  if (billAmountFormatted <= 0) {
    throw new ValidationError('Bill amount must be greater than zero');
  }
}

/**
 * Validate bill can be cancelled
 *
 * @param {Object} bill - Bill
 * @throws {ValidationError} If validation fails
 */
function validateBillCanBeCancelled(bill) {
  if (!bill) {
    throw new ValidationError('Bill not found');
  }

  if (bill.cancelledAt) {
    throw new ValidationError('Bill is already cancelled');
  }

  if (bill.status !== 'Unpaid') {
    throw new ValidationError(
      `Cannot cancel bill with status "${bill.status}". Only unpaid bills can be cancelled.`
    );
  }

  if (parseFloat(bill.paidAmount) > 0) {
    throw new ValidationError(
      `Cannot cancel bill with payments. Paid amount: ${bill.paidAmount}`
    );
  }
}

/**
 * Validate payment amount does not exceed bill remaining balance
 *
 * @param {Object} bill - Bill
 * @param {number} paymentAmount - Proposed payment amount
 * @throws {ValidationError} If validation fails
 */
function validatePaymentAmount(bill, paymentAmount) {
  const billTotal = formatAmount(bill.total);
  const currentPaid = formatAmount(bill.paidAmount);
  const remaining = formatAmount(billTotal - currentPaid);
  const paymentFormatted = formatAmount(paymentAmount);

  if (paymentFormatted > remaining + 0.01) { // 1 cent tolerance
    throw new ValidationError(
      `Payment amount (${paymentFormatted}) exceeds remaining bill balance (${remaining}). ` +
      `Bill Total: ${billTotal}, Already Paid: ${currentPaid}`
    );
  }

  if (paymentFormatted <= 0) {
    throw new ValidationError('Payment amount must be greater than zero');
  }
}

/**
 * Validate bill can receive payments
 *
 * @param {Object} bill - Bill
 * @throws {ValidationError} If validation fails
 */
function validateBillCanReceivePayment(bill) {
  if (!bill) {
    throw new ValidationError('Bill not found');
  }

  if (bill.cancelledAt) {
    throw new ValidationError('Cannot record payment for cancelled bill');
  }

  if (bill.deletedAt) {
    throw new ValidationError('Cannot record payment for deleted bill');
  }

  if (bill.status === 'Paid') {
    throw new ValidationError('Bill is already fully paid');
  }

  const remaining = formatAmount(parseFloat(bill.total) - parseFloat(bill.paidAmount));

  if (remaining <= 0) {
    throw new ValidationError('Bill has no remaining balance');
  }
}

/**
 * Validate PO status transition
 *
 * @param {string} currentStatus - Current status
 * @param {string} newStatus - New status
 * @throws {ValidationError} If transition is invalid
 */
function validatePOStatusTransition(currentStatus, newStatus) {
  const validTransitions = {
    'Draft': ['Sent', 'Cancelled'],
    'Sent': ['Partial', 'Completed', 'Cancelled'],
    'Partial': ['Completed', 'Cancelled'],
    'Completed': [],
    'Cancelled': []
  };

  const allowed = validTransitions[currentStatus] || [];

  if (!allowed.includes(newStatus)) {
    throw new ValidationError(
      `Invalid status transition from "${currentStatus}" to "${newStatus}". ` +
      `Allowed transitions: ${allowed.join(', ') || 'none'}`
    );
  }
}

/**
 * Validate financial amounts are consistent
 *
 * @param {Object} amounts - { subtotal, taxAmount, total }
 * @throws {ValidationError} If amounts are inconsistent
 */
function validateFinancialAmounts(amounts) {
  const subtotal = formatAmount(amounts.subtotal);
  const taxAmount = formatAmount(amounts.taxAmount || 0);
  const total = formatAmount(amounts.total);
  const computed = formatAmount(subtotal + taxAmount);

  if (!compareAmounts(total, computed)) {
    throw new ValidationError(
      `Total (${total}) must equal subtotal (${subtotal}) + tax (${taxAmount}). ` +
      `Computed: ${computed}`
    );
  }

  if (subtotal < 0 || taxAmount < 0 || total < 0) {
    throw new ValidationError('Amounts cannot be negative');
  }
}

/**
 * Validate line items sum to subtotal
 *
 * @param {Array} lineItems - Array of line items
 * @param {number} subtotal - Expected subtotal
 * @throws {ValidationError} If line items don't sum to subtotal
 */
function validateLineItems(lineItems, subtotal) {
  if (!lineItems || lineItems.length === 0) {
    throw new ValidationError('At least one line item is required');
  }

  const lineItemsTotal = lineItems.reduce((sum, item) => {
    const itemTotal = formatAmount(item.totalPrice);

    // Validate item total = quantity * unit price
    const computed = formatAmount(item.quantity * item.unitPrice);

    if (!compareAmounts(itemTotal, computed)) {
      throw new ValidationError(
        `Line item "${item.description}" total (${itemTotal}) does not match ` +
        `quantity (${item.quantity}) × unit price (${item.unitPrice}) = ${computed}`
      );
    }

    return sum + itemTotal;
  }, 0);

  const subtotalFormatted = formatAmount(subtotal);

  if (!compareAmounts(lineItemsTotal, subtotalFormatted)) {
    throw new ValidationError(
      `Line items total (${lineItemsTotal}) does not match subtotal (${subtotalFormatted})`
    );
  }
}

module.exports = {
  validatePOCanCreateBill,
  validateBillAmount,
  validateBillCanBeCancelled,
  validatePaymentAmount,
  validateBillCanReceivePayment,
  validatePOStatusTransition,
  validateFinancialAmounts,
  validateLineItems
};
