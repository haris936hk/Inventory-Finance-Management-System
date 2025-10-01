# Purchase Order Billing System - Refactoring Plan (Part 2)

## 3.3 Payment Service (Immutable Payments)

**File:** `backend/src/services/paymentService.js`

```javascript
/**
 * Vendor Payment Management Service
 *
 * Implements strict rules:
 * - Payments are immutable (created, never modified)
 * - SUM(payments) <= bill.total (enforced with locks)
 * - Payments update bill.paidAmount atomically
 * - Voiding instead of deletion
 */

const db = require('../config/database');
const logger = require('../config/logger');
const {
  withTransaction,
  lockForUpdate,
  ValidationError,
  ConcurrencyError,
  InsufficientBalanceError,
  compareAmounts,
  formatAmount
} = require('../utils/transactionWrapper');
const { generatePaymentNumber } = require('../utils/generateId');
const { updateBillStatus } = require('./billService');

/**
 * Record a vendor payment
 *
 * @param {Object} data - Payment data
 * @param {string} data.billId - Bill ID
 * @param {string} data.vendorId - Vendor ID
 * @param {Date} data.paymentDate - Payment date
 * @param {number} data.amount - Payment amount
 * @param {string} data.method - Payment method (Cash, Bank Transfer, Cheque)
 * @param {string} data.reference - Payment reference
 * @param {string} data.notes - Notes
 * @param {string} userId - User recording the payment
 * @returns {Promise<Object>} Created payment
 */
async function recordPayment(data, userId) {
  return withTransaction(async (tx) => {
    // 1. Lock the bill (critical for concurrency)
    const bill = await lockForUpdate(tx, 'Bill', data.billId);

    // 2. Validate bill can receive payment
    if (bill.cancelledAt) {
      throw new ValidationError('Cannot record payment for cancelled bill');
    }

    // 3. Validate vendor matches
    if (bill.vendorId !== data.vendorId) {
      throw new ValidationError('Vendor must match bill vendor');
    }

    // 4. Format and validate payment amount
    const paymentAmount = formatAmount(data.amount);

    if (paymentAmount <= 0) {
      throw new ValidationError('Payment amount must be greater than zero');
    }

    // 5. CRITICAL: Check remaining balance (SUM(payments) <= bill.total)
    const currentPaidAmount = formatAmount(bill.paidAmount);
    const billTotal = formatAmount(bill.total);
    const remainingBalance = formatAmount(billTotal - currentPaidAmount);

    if (paymentAmount > remainingBalance + 0.01) { // Allow 1 cent tolerance
      throw new InsufficientBalanceError(
        `Payment amount (${paymentAmount}) exceeds remaining bill balance. ` +
        `Bill Total: ${billTotal}, Already Paid: ${currentPaidAmount}, Remaining: ${remainingBalance}`,
        remainingBalance,
        paymentAmount
      );
    }

    // 6. Validate payment method
    const validMethods = ['Cash', 'Bank Transfer', 'Cheque'];
    if (!validMethods.includes(data.method)) {
      throw new ValidationError(
        `Invalid payment method. Must be one of: ${validMethods.join(', ')}`
      );
    }

    // 7. Generate payment number
    const paymentNumber = await generatePaymentNumber('VPAY');

    // 8. Create the payment (immutable)
    const payment = await tx.vendorPayment.create({
      data: {
        paymentNumber,
        paymentDate: data.paymentDate || new Date(),
        amount: paymentAmount,
        method: data.method,
        reference: data.reference || null,
        notes: data.notes || null,
        vendorId: data.vendorId,
        billId: data.billId,
        createdBy: userId
      },
      include: {
        vendor: true,
        bill: {
          include: {
            purchaseOrder: true
          }
        }
      }
    });

    // 9. Update bill paid amount atomically
    const newPaidAmount = formatAmount(currentPaidAmount + paymentAmount);

    await tx.bill.update({
      where: { id: data.billId },
      data: {
        paidAmount: newPaidAmount
      }
    });

    // 10. Update bill status based on new paid amount
    const newBillStatus = await updateBillStatus(tx, data.billId);

    // 11. Update vendor balance (decrease payable)
    await tx.vendor.update({
      where: { id: data.vendorId },
      data: {
        currentBalance: {
          decrement: paymentAmount
        }
      }
    });

    // 12. Create vendor ledger entry
    const vendor = await tx.vendor.findUnique({
      where: { id: data.vendorId }
    });

    await tx.vendorLedger.create({
      data: {
        vendorId: data.vendorId,
        entryDate: data.paymentDate || new Date(),
        description: `Payment ${paymentNumber} for Bill ${bill.billNumber}`,
        debit: 0,
        credit: paymentAmount,
        balance: vendor.currentBalance,
        billId: data.billId
      }
    });

    // 13. Create audit trail
    await tx.pOBillAudit.create({
      data: {
        purchaseOrderId: bill.purchaseOrderId,
        action: 'PAYMENT_RECORDED',
        billId: data.billId,
        paymentId: payment.id,
        beforeState: {
          billStatus: bill.status,
          paidAmount: currentPaidAmount
        },
        afterState: {
          billStatus: newBillStatus,
          paidAmount: newPaidAmount,
          paymentAmount: paymentAmount
        },
        performedBy: userId,
        metadata: {
          paymentNumber,
          method: data.method,
          reference: data.reference
        }
      }
    });

    logger.info(`Payment recorded: ${paymentNumber}`, {
      paymentId: payment.id,
      billNumber: bill.billNumber,
      amount: paymentAmount,
      billStatus: `${bill.status} → ${newBillStatus}`
    });

    return payment;
  });
}

/**
 * Void a payment (not deletion, just mark as voided)
 *
 * @param {string} paymentId - Payment ID
 * @param {string} reason - Void reason
 * @param {string} userId - User voiding the payment
 * @returns {Promise<Object>} Voided payment
 */
async function voidPayment(paymentId, reason, userId) {
  return withTransaction(async (tx) => {
    // 1. Get the payment
    const payment = await tx.vendorPayment.findUnique({
      where: { id: paymentId, deletedAt: null },
      include: {
        bill: {
          include: {
            purchaseOrder: true
          }
        }
      }
    });

    if (!payment) {
      throw new ValidationError('Payment not found');
    }

    // 2. Validate payment can be voided
    if (payment.voidedAt) {
      throw new ValidationError('Payment is already voided');
    }

    // 3. Lock the bill
    const bill = await lockForUpdate(tx, 'Bill', payment.billId);

    // 4. Void the payment (mark, don't delete)
    const voided = await tx.vendorPayment.update({
      where: { id: paymentId },
      data: {
        voidedAt: new Date(),
        voidReason: reason,
        voidedBy: userId
      },
      include: {
        vendor: true,
        bill: true
      }
    });

    // 5. Reverse bill paid amount
    const newPaidAmount = formatAmount(bill.paidAmount - payment.amount);

    await tx.bill.update({
      where: { id: payment.billId },
      data: {
        paidAmount: newPaidAmount
      }
    });

    // 6. Update bill status
    const newBillStatus = await updateBillStatus(tx, payment.billId);

    // 7. Reverse vendor balance
    await tx.vendor.update({
      where: { id: payment.vendorId },
      data: {
        currentBalance: {
          increment: payment.amount
        }
      }
    });

    // 8. Create reverse ledger entry
    const vendor = await tx.vendor.findUnique({
      where: { id: payment.vendorId }
    });

    await tx.vendorLedger.create({
      data: {
        vendorId: payment.vendorId,
        entryDate: new Date(),
        description: `Payment ${payment.paymentNumber} voided: ${reason}`,
        debit: payment.amount,
        credit: 0,
        balance: vendor.currentBalance,
        billId: payment.billId
      }
    });

    // 9. Create audit trail
    await tx.pOBillAudit.create({
      data: {
        purchaseOrderId: bill.purchaseOrderId,
        action: 'PAYMENT_VOIDED',
        billId: payment.billId,
        paymentId: payment.id,
        beforeState: {
          billStatus: bill.status,
          paidAmount: bill.paidAmount
        },
        afterState: {
          billStatus: newBillStatus,
          paidAmount: newPaidAmount
        },
        performedBy: userId,
        metadata: {
          reason,
          voidedAmount: payment.amount
        }
      }
    });

    logger.info(`Payment voided: ${payment.paymentNumber}`, {
      paymentId,
      reason,
      reversedAmount: payment.amount
    });

    return voided;
  });
}

/**
 * Get payment details
 *
 * @param {string} paymentId - Payment ID
 * @returns {Promise<Object>} Payment
 */
async function getPayment(paymentId) {
  const payment = await db.prisma.vendorPayment.findUnique({
    where: { id: paymentId, deletedAt: null },
    include: {
      vendor: true,
      bill: {
        include: {
          purchaseOrder: true
        }
      },
      createdByUser: {
        select: {
          id: true,
          fullName: true,
          email: true
        }
      }
    }
  });

  if (!payment) {
    throw new ValidationError('Payment not found');
  }

  // Add computed fields
  payment.isVoided = !!payment.voidedAt;
  payment.canBeVoided = !payment.voidedAt;

  return payment;
}

/**
 * Get all payments for a bill
 *
 * @param {string} billId - Bill ID
 * @returns {Promise<Array>} Payments
 */
async function getPaymentsForBill(billId) {
  const payments = await db.prisma.vendorPayment.findMany({
    where: {
      billId,
      deletedAt: null
    },
    include: {
      vendor: true,
      createdByUser: {
        select: {
          fullName: true
        }
      }
    },
    orderBy: {
      paymentDate: 'desc'
    }
  });

  return payments.map(p => ({
    ...p,
    isVoided: !!p.voidedAt,
    effectiveAmount: p.voidedAt ? 0 : p.amount
  }));
}

module.exports = {
  recordPayment,
  voidPayment,
  getPayment,
  getPaymentsForBill
};
```

---

## 4. VALIDATION LAYER

**File:** `backend/src/services/validationService.js`

```javascript
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

  const remainingAmount = formatAmount(po.total - po.billedAmount);

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

  if (bill.paidAmount > 0) {
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

  const remaining = formatAmount(bill.total - bill.paidAmount);

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
```

---

## 5. CONTROLLER UPDATES

**File:** `backend/src/controllers/financeControllerV2.js` (Refactored)

```javascript
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
```

---

## 6. TESTING STRATEGY

### 6.1 Unit Test Example

**File:** `backend/tests/services/billService.test.js`

```javascript
/**
 * Bill Service Unit Tests
 */

const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const billService = require('../../src/services/billService');
const db = require('../../src/config/database');

describe('Bill Service - Concurrency Control', () => {
  let testPO;
  let testVendor;
  let testUser;

  beforeEach(async () => {
    // Create test data
    testVendor = await db.prisma.vendor.create({
      data: {
        name: 'Test Vendor',
        code: 'TEST001',
        currentBalance: 0
      }
    });

    testUser = await db.prisma.user.create({
      data: {
        username: 'testuser',
        password: 'hashed',
        fullName: 'Test User',
        role: { connect: { name: 'Admin' } }
      }
    });

    testPO = await db.prisma.purchaseOrder.create({
      data: {
        poNumber: 'PO-TEST-001',
        orderDate: new Date(),
        status: 'Sent',
        subtotal: 10000.00,
        taxAmount: 1000.00,
        total: 11000.00,
        billedAmount: 0,
        vendorId: testVendor.id
      }
    });
  });

  afterEach(async () => {
    // Cleanup
    await db.prisma.bill.deleteMany();
    await db.prisma.purchaseOrder.deleteMany();
    await db.prisma.vendor.deleteMany();
    await db.prisma.user.deleteMany();
  });

  it('should prevent creating bill exceeding PO total', async () => {
    // Try to create bill for more than PO total
    const billData = {
      purchaseOrderId: testPO.id,
      vendorId: testVendor.id,
      billDate: new Date(),
      subtotal: 12000.00,
      taxAmount: 1200.00,
      total: 13200.00 // Exceeds PO total of 11000
    };

    await expect(
      billService.createBill(billData, testUser.id)
    ).rejects.toThrow('exceeds remaining PO balance');
  });

  it('should prevent creating multiple bills exceeding PO total', async () => {
    // Create first bill
    await billService.createBill({
      purchaseOrderId: testPO.id,
      vendorId: testVendor.id,
      billDate: new Date(),
      subtotal: 6000.00,
      taxAmount: 600.00,
      total: 6600.00
    }, testUser.id);

    // Try to create second bill that would exceed total
    await expect(
      billService.createBill({
        purchaseOrderId: testPO.id,
        vendorId: testVendor.id,
        billDate: new Date(),
        subtotal: 5000.00,
        taxAmount: 500.00,
        total: 5500.00 // 6600 + 5500 = 12100 > 11000
      }, testUser.id)
    ).rejects.toThrow('exceeds remaining PO balance');
  });

  it('should handle concurrent bill creation correctly', async () => {
    // Simulate concurrent bill creation
    const bill1Promise = billService.createBill({
      purchaseOrderId: testPO.id,
      vendorId: testVendor.id,
      billDate: new Date(),
      subtotal: 6000.00,
      taxAmount: 600.00,
      total: 6600.00
    }, testUser.id);

    const bill2Promise = billService.createBill({
      purchaseOrderId: testPO.id,
      vendorId: testVendor.id,
      billDate: new Date(),
      subtotal: 5000.00,
      taxAmount: 500.00,
      total: 5500.00
    }, testUser.id);

    // One should succeed, one should fail
    const results = await Promise.allSettled([bill1Promise, bill2Promise]);

    const succeeded = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);
    expect(failed[0].reason.message).toContain('exceeds remaining PO balance');
  });

  it('should allow creating multiple bills within PO total', async () => {
    // Create first bill
    const bill1 = await billService.createBill({
      purchaseOrderId: testPO.id,
      vendorId: testVendor.id,
      billDate: new Date(),
      subtotal: 4000.00,
      taxAmount: 400.00,
      total: 4400.00
    }, testUser.id);

    expect(bill1.billNumber).toBeTruthy();

    // Create second bill (should succeed)
    const bill2 = await billService.createBill({
      purchaseOrderId: testPO.id,
      vendorId: testVendor.id,
      billDate: new Date(),
      subtotal: 6000.00,
      taxAmount: 600.00,
      total: 6600.00 // 4400 + 6600 = 11000 = PO total
    }, testUser.id);

    expect(bill2.billNumber).toBeTruthy();

    // Verify PO is fully billed
    const updatedPO = await db.prisma.purchaseOrder.findUnique({
      where: { id: testPO.id }
    });

    expect(parseFloat(updatedPO.billedAmount)).toBe(11000.00);
    expect(updatedPO.status).toBe('Completed');
  });

  it('should only allow cancelling unpaid bills', async () => {
    // Create and pay a bill
    const bill = await billService.createBill({
      purchaseOrderId: testPO.id,
      vendorId: testVendor.id,
      billDate: new Date(),
      subtotal: 5000.00,
      taxAmount: 500.00,
      total: 5500.00
    }, testUser.id);

    // Make partial payment
    await db.prisma.bill.update({
      where: { id: bill.id },
      data: {
        paidAmount: 1000.00,
        status: 'Partial'
      }
    });

    // Try to cancel (should fail)
    await expect(
      billService.cancelBill(bill.id, 'Test cancellation', testUser.id)
    ).rejects.toThrow('Only unpaid bills can be cancelled');
  });
});
```

This comprehensive plan provides a complete refactoring strategy. Would you like me to create additional documentation files for migration steps or add more test examples?
