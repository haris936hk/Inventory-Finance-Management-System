/**
 * Bill Management Service
 *
 * Implements strict rules:
 * - Multiple bills can be created against a PO
 * - SUM(bills) <= PO.total (enforced with locks)
 * - Only unpaid bills can be cancelled
 * - Bill status auto-updates based on payments
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
  addAmounts,
  formatAmount
} = require('../utils/transactionWrapper');
const { generateBillNumber } = require('../utils/generateId');

/**
 * Create a bill against a Purchase Order
 *
 * @param {Object} data - Bill data
 * @param {string} data.purchaseOrderId - PO ID
 * @param {string} data.vendorId - Vendor ID
 * @param {Date} data.billDate - Bill date
 * @param {Date} data.dueDate - Due date
 * @param {number} data.subtotal - Subtotal
 * @param {number} data.taxAmount - Tax amount
 * @param {number} data.total - Total amount
 * @param {string} userId - User creating the bill
 * @returns {Promise<Object>} Created bill
 */
async function createBill(data, userId) {
  return withTransaction(async (tx) => {
    // 1. Lock the Purchase Order (critical for concurrency)
    const po = await lockForUpdate(tx, 'PurchaseOrder', data.purchaseOrderId);

    // 2. Validate PO status
    if (po.status === 'Cancelled') {
      throw new ValidationError('Cannot create bill for cancelled Purchase Order');
    }

    if (po.status === 'Completed') {
      throw new ValidationError('Cannot create bill for completed Purchase Order');
    }

    if (po.status === 'Draft') {
      throw new ValidationError('Cannot create bill for Draft Purchase Order. Please send the PO first.');
    }

    // 3. Validate vendor matches PO
    if (po.vendorId !== data.vendorId) {
      throw new ValidationError('Vendor must match Purchase Order vendor');
    }

    // 4. Format and validate amounts
    const subtotal = formatAmount(data.subtotal);
    const taxAmount = formatAmount(data.taxAmount || 0);
    const total = formatAmount(data.total);

    if (!compareAmounts(total, subtotal + taxAmount)) {
      throw new ValidationError(
        `Bill total (${total}) must equal subtotal (${subtotal}) + tax (${taxAmount})`
      );
    }

    // 5. CRITICAL: Check available balance (SUM(bills) <= PO.total)
    const currentBilledAmount = formatAmount(po.billedAmount);
    const newBilledAmount = formatAmount(currentBilledAmount + total);
    const poTotal = formatAmount(po.total);

    if (newBilledAmount > poTotal + 0.01) { // Allow 1 cent tolerance
      throw new InsufficientBalanceError(
        `Bill total (${total}) exceeds remaining PO balance. ` +
        `PO Total: ${poTotal}, Already Billed: ${currentBilledAmount}, Available: ${poTotal - currentBilledAmount}`,
        poTotal - currentBilledAmount,
        total
      );
    }

    // 6. Generate bill number
    const billNumber = await generateBillNumber();

    // 7. Create the bill
    const bill = await tx.bill.create({
      data: {
        billNumber,
        billDate: data.billDate || new Date(),
        dueDate: data.dueDate || null,
        status: 'Unpaid',
        subtotal,
        taxAmount,
        total,
        paidAmount: 0,
        vendorId: data.vendorId,
        purchaseOrderId: data.purchaseOrderId
      },
      include: {
        vendor: true,
        purchaseOrder: true
      }
    });

    // 8. Update PO billed amount and status
    const updatedBilledAmount = formatAmount(parseFloat(po.billedAmount) + total);
    let newPOStatus = po.status;

    // Auto-transition to Partial if first bill created
    if (po.status === 'Sent' && updatedBilledAmount > 0) {
      newPOStatus = 'Partial';
    }

    // Auto-transition to Completed if fully billed
    if (compareAmounts(updatedBilledAmount, po.total)) {
      newPOStatus = 'Completed';
    }

    await tx.purchaseOrder.update({
      where: { id: data.purchaseOrderId },
      data: {
        billedAmount: updatedBilledAmount,
        status: newPOStatus
      }
    });

    // 9. Create vendor ledger entry
    const vendor = await tx.vendor.findUnique({
      where: { id: data.vendorId }
    });

    const newVendorBalance = formatAmount(parseFloat(vendor.currentBalance) + total);

    await tx.vendorLedger.create({
      data: {
        vendorId: data.vendorId,
        entryDate: data.billDate || new Date(),
        description: `Bill ${billNumber}`,
        debit: total,
        credit: 0,
        balance: newVendorBalance,
        billId: bill.id
      }
    });

    // 10. Update vendor balance
    await tx.vendor.update({
      where: { id: data.vendorId },
      data: {
        currentBalance: newVendorBalance
      }
    });

    // 11. Create audit trail
    await tx.pOBillAudit.create({
      data: {
        purchaseOrderId: data.purchaseOrderId,
        action: 'BILL_CREATED',
        billId: bill.id,
        beforeState: {
          poStatus: po.status,
          billedAmount: parseFloat(po.billedAmount)
        },
        afterState: {
          poStatus: newPOStatus,
          billedAmount: updatedBilledAmount,
          billTotal: total
        },
        performedBy: userId,
        metadata: {
          billNumber,
          vendorId: data.vendorId
        }
      }
    });

    logger.info(`Bill created: ${billNumber}`, {
      billId: bill.id,
      poNumber: po.poNumber,
      amount: total,
      poStatus: `${po.status} → ${newPOStatus}`
    });

    return bill;
  });
}

/**
 * Cancel a bill (soft-cancel)
 * Only unpaid bills can be cancelled
 *
 * @param {string} billId - Bill ID
 * @param {string} reason - Cancellation reason
 * @param {string} userId - User performing cancellation
 * @returns {Promise<Object>} Cancelled bill
 */
async function cancelBill(billId, reason, userId) {
  return withTransaction(async (tx) => {
    // 1. Lock the bill
    const bill = await lockForUpdate(tx, 'Bill', billId);

    // 2. Validate bill can be cancelled
    if (bill.cancelledAt) {
      throw new ValidationError('Bill is already cancelled');
    }

    if (bill.status !== 'Unpaid') {
      throw new ValidationError(
        `Cannot cancel bill with status ${bill.status}. Only unpaid bills can be cancelled.`
      );
    }

    if (parseFloat(bill.paidAmount) > 0) {
      throw new ValidationError(
        `Cannot cancel bill with payments. Bill has ${bill.paidAmount} paid.`
      );
    }

    // 3. Lock the PO
    const po = await lockForUpdate(tx, 'PurchaseOrder', bill.purchaseOrderId);

    // 4. Soft-cancel the bill
    const cancelled = await tx.bill.update({
      where: { id: billId },
      data: {
        cancelledAt: new Date(),
        cancelReason: reason
      },
      include: {
        vendor: true,
        purchaseOrder: true
      }
    });

    // 5. Update PO billed amount
    const newBilledAmount = formatAmount(parseFloat(po.billedAmount) - parseFloat(bill.total));
    let newPOStatus = po.status;

    // Revert from Completed if needed
    if (po.status === 'Completed' && newBilledAmount < parseFloat(po.total)) {
      newPOStatus = 'Partial';
    }

    // Revert from Partial if all bills cancelled
    if (po.status === 'Partial' && newBilledAmount === 0) {
      newPOStatus = 'Sent';
    }

    await tx.purchaseOrder.update({
      where: { id: bill.purchaseOrderId },
      data: {
        billedAmount: newBilledAmount,
        status: newPOStatus
      }
    });

    // 6. Reverse vendor ledger entry
    const vendor = await tx.vendor.findUnique({
      where: { id: bill.vendorId }
    });

    const newVendorBalance = formatAmount(parseFloat(vendor.currentBalance) - parseFloat(bill.total));

    await tx.vendorLedger.create({
      data: {
        vendorId: bill.vendorId,
        entryDate: new Date(),
        description: `Bill ${bill.billNumber} cancelled: ${reason}`,
        debit: 0,
        credit: parseFloat(bill.total),
        balance: newVendorBalance,
        billId: bill.id
      }
    });

    // 7. Update vendor balance
    await tx.vendor.update({
      where: { id: bill.vendorId },
      data: {
        currentBalance: newVendorBalance
      }
    });

    // 8. Create audit trail
    await tx.pOBillAudit.create({
      data: {
        purchaseOrderId: bill.purchaseOrderId,
        action: 'BILL_CANCELLED',
        billId: bill.id,
        beforeState: {
          billStatus: bill.status,
          poStatus: po.status,
          billedAmount: parseFloat(po.billedAmount)
        },
        afterState: {
          billStatus: 'Cancelled',
          poStatus: newPOStatus,
          billedAmount: newBilledAmount
        },
        performedBy: userId,
        metadata: { reason }
      }
    });

    logger.info(`Bill cancelled: ${bill.billNumber}`, {
      billId,
      reason,
      refundedToPO: parseFloat(bill.total)
    });

    return cancelled;
  });
}

/**
 * Update bill status based on payments
 * Internal helper, called by payment service
 *
 * @param {Object} tx - Transaction client
 * @param {string} billId - Bill ID
 * @returns {Promise<string>} New status
 */
async function updateBillStatus(tx, billId) {
  const bill = await tx.bill.findUnique({
    where: { id: billId }
  });

  if (!bill) {
    throw new ValidationError('Bill not found');
  }

  let newStatus = 'Unpaid';

  if (compareAmounts(bill.paidAmount, bill.total)) {
    newStatus = 'Paid';
  } else if (parseFloat(bill.paidAmount) > 0) {
    newStatus = 'Partial';
  }

  if (newStatus !== bill.status) {
    await tx.bill.update({
      where: { id: billId },
      data: { status: newStatus }
    });
  }

  return newStatus;
}

/**
 * Get bill with computed fields
 *
 * @param {string} billId - Bill ID
 * @returns {Promise<Object>} Bill with computed fields
 */
async function getBill(billId) {
  const bill = await db.prisma.bill.findUnique({
    where: { id: billId, deletedAt: null },
    include: {
      vendor: true,
      purchaseOrder: true,
      payments: {
        where: { deletedAt: null, voidedAt: null },
        orderBy: { paymentDate: 'desc' }
      }
    }
  });

  if (!bill) {
    throw new ValidationError('Bill not found');
  }

  // Add computed fields
  bill.remainingAmount = formatAmount(parseFloat(bill.total) - parseFloat(bill.paidAmount));
  bill.isCancelled = !!bill.cancelledAt;
  bill.canBePaid = !bill.cancelledAt && bill.remainingAmount > 0;
  bill.canBeCancelled = !bill.cancelledAt && bill.status === 'Unpaid' && parseFloat(bill.paidAmount) === 0;

  return bill;
}

module.exports = {
  createBill,
  cancelBill,
  updateBillStatus,
  getBill
};
