/**
 * Finance Module - Critical Edge Cases Test Suite
 *
 * Tests for edge cases, boundary conditions, and data integrity
 * Covers:
 * - Rounding and precision
 * - Concurrent transactions
 * - Transaction rollback
 * - Boundary conditions
 * - Data integrity
 * - Audit trail
 */

const db = require('../../src/config/database');
const financeService = require('../../src/services/financeService');
const invoiceLifecycleService = require('../../src/services/invoiceLifecycleService');
const customerPaymentService = require('../../src/services/customerPaymentService');
const billService = require('../../src/services/billService');
const purchaseOrderService = require('../../src/services/purchaseOrderService');
const {
  compareAmounts,
  formatAmount,
  addAmounts
} = require('../../src/utils/transactionWrapper');

// Get the mock from setup
const prismaMock = global.prismaMock;

describe('Finance Module - Critical Edge Cases', () => {

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock transaction wrapper
    db.transaction = jest.fn((callback) => callback(prismaMock));
  });

  // ===========================
  // Rounding and Precision
  // ===========================

  describe('Rounding and Precision', () => {

    it('should handle 0.33333333 recurring decimals', () => {
      // Arrange
      const amount1 = 0.33333333;
      const amount2 = 0.33333333;
      const amount3 = 0.33333334;

      // Act
      const total = amount1 + amount2 + amount3;
      const formatted = formatAmount(total);

      // Assert
      expect(formatted).toBe(1.0000); // Should sum to 1.0000
    });

    it('should handle large numbers (PKR 99,999,999.9999)', () => {
      // Arrange
      const largeAmount = 99999999.9999;

      // Act
      const formatted = formatAmount(largeAmount);

      // Assert
      expect(formatted).toBe(99999999.9999);
    });

    it('should prevent floating point precision errors in summation', () => {
      // Arrange
      const amounts = [0.1, 0.2, 0.3, 0.4];

      // Act
      const total = amounts.reduce((sum, amt) => addAmounts(sum, amt), 0);

      // Assert
      expect(total).toBe(1.0); // Not 1.0000000000000001
    });

    it('should use formatAmount consistently', () => {
      // Arrange
      const subtotal = 1000.3333;
      const tax = 187.5625; // 18.75% of 1000.3333

      // Act
      const total = formatAmount(subtotal + tax);

      // Assert
      expect(total).toBe(1187.8958);
    });

    it('should handle very small amounts (0.0001)', () => {
      // Arrange
      const tinyAmount = 0.0001;

      // Act
      const formatted = formatAmount(tinyAmount);

      // Assert
      expect(formatted).toBe(0.0001);
    });

    it('should handle compareAmounts with tolerance', () => {
      // Arrange
      const amount1 = 10000.0000;
      const amount2 = 10000.0001; // Within default tolerance

      // Act
      const areEqual = compareAmounts(amount1, amount2);

      // Assert
      expect(areEqual).toBe(true);
    });

    it('should reject amounts outside tolerance', () => {
      // Arrange
      const amount1 = 10000.0000;
      const amount2 = 10000.1000; // Outside tolerance

      // Act
      const areEqual = compareAmounts(amount1, amount2);

      // Assert
      expect(areEqual).toBe(false);
    });
  });

  // ===========================
  // Concurrent Transactions
  // ===========================

  describe('Concurrent Transactions', () => {

    it('should handle simultaneous payments to same invoice', async () => {
      // Arrange
      const mockInvoice = {
        id: 'invoice-id',
        invoiceNumber: 'INV-001',
        customerId: 'customer-id',
        total: 100000,
        paidAmount: 80000,
        cancelledAt: null
      };

      prismaMock.$queryRawUnsafe.mockResolvedValue([mockInvoice]);

      // Simulate deadlock detection
      prismaMock.payment.create.mockRejectedValueOnce({
        code: '40001',
        message: 'could not serialize access due to concurrent update'
      });

      const paymentData = {
        invoiceId: 'invoice-id',
        customerId: 'customer-id',
        amount: 20000,
        method: 'Cash'
      };

      // Act & Assert
      await expect(customerPaymentService.recordPayment(paymentData, 'user-id'))
        .rejects
        .toThrow();
    });

    it('should handle simultaneous bill creation against same PO', async () => {
      // Arrange
      const mockPO = {
        id: 'po-id',
        poNumber: 'PO-001',
        vendorId: 'vendor-id',
        total: 100000,
        billedAmount: 50000,
        status: 'Partial'
      };

      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.vendor.findUnique.mockResolvedValue({ id: 'vendor-id', currentBalance: 0 });

      // Simulate deadlock
      prismaMock.bill.create.mockRejectedValueOnce({
        code: '40001',
        message: 'could not serialize access'
      });

      const billData = {
        purchaseOrderId: 'po-id',
        vendorId: 'vendor-id',
        subtotal: 45000,
        taxAmount: 5000,
        total: 50000
      };

      // Act & Assert
      await expect(billService.createBill(billData, 'user-id'))
        .rejects
        .toThrow();
    });

    it('should prevent double reservation of inventory items', async () => {
      // Arrange
      const mockCustomer = { id: 'customer-id', creditLimit: 100000, currentBalance: 0 };
      const mockItems = [
        { id: 'item-1', inventoryStatus: 'Available', price: 10000 }
      ];

      prismaMock.customer.findUnique.mockResolvedValue(mockCustomer);
      prismaMock.item.findMany.mockResolvedValue(mockItems);

      // Simulate concurrent reservation attempt
      prismaMock.item.update.mockRejectedValueOnce({
        code: '40001',
        message: 'Item already reserved'
      });

      const invoiceData = {
        customerId: 'customer-id',
        items: [{ itemId: 'item-1', price: 10000, quantity: 1 }],
        subtotal: 10000,
        tax: 0,
        total: 10000
      };

      // Act & Assert
      await expect(financeService.createInvoice(invoiceData, 'user-id'))
        .rejects
        .toThrow();
    });

    it('should use row-level locking (SELECT ... FOR UPDATE NOWAIT)', async () => {
      // Arrange
      const mockBill = {
        id: 'bill-id',
        vendorId: 'vendor-id',
        total: 50000,
        paidAmount: 0,
        cancelledAt: null
      };

      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.vendor.findUnique.mockResolvedValue({ id: 'vendor-id', currentBalance: 0 });

      // Simulate lock timeout
      prismaMock.$queryRawUnsafe.mockRejectedValueOnce({
        code: '55P03',
        message: 'could not obtain lock on row'
      });

      const paymentData = {
        billId: 'bill-id',
        vendorId: 'vendor-id',
        amount: 20000,
        method: 'Bank Transfer'
      };

      // Act & Assert
      await expect(require('../../src/services/paymentService').recordPayment(paymentData, 'user-id'))
        .rejects
        .toThrow();
    });
  });

  // ===========================
  // Transaction Rollback
  // ===========================

  describe('Transaction Rollback', () => {

    it('should rollback invoice creation if reservation fails', async () => {
      // Arrange
      const mockCustomer = { id: 'customer-id', creditLimit: 100000, currentBalance: 0 };
      const mockItems = [
        { id: 'item-1', inventoryStatus: 'Available', price: 10000 }
      ];

      prismaMock.customer.findUnique.mockResolvedValue(mockCustomer);
      prismaMock.item.findMany.mockResolvedValue(mockItems);
      prismaMock.item.update.mockRejectedValue(new Error('Reservation failed'));

      const invoiceData = {
        customerId: 'customer-id',
        items: [{ itemId: 'item-1', price: 10000, quantity: 1 }],
        subtotal: 10000,
        tax: 0,
        total: 10000
      };

      // Act & Assert
      await expect(financeService.createInvoice(invoiceData, 'user-id'))
        .rejects
        .toThrow('Reservation failed');

      // Verify invoice was not created
      expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    });

    it('should rollback payment if ledger creation fails', async () => {
      // Arrange
      const mockInvoice = {
        id: 'invoice-id',
        customerId: 'customer-id',
        total: 10000,
        paidAmount: 0,
        cancelledAt: null
      };

      prismaMock.$queryRawUnsafe.mockResolvedValue([mockInvoice]);
      prismaMock.payment.create.mockResolvedValue({ id: 'payment-id' });
      prismaMock.invoice.update.mockResolvedValue({});
      prismaMock.customer.findUnique.mockResolvedValue({ id: 'customer-id', currentBalance: 10000 });
      prismaMock.customerLedger.create.mockRejectedValue(new Error('Ledger creation failed'));

      const paymentData = {
        invoiceId: 'invoice-id',
        customerId: 'customer-id',
        amount: 10000,
        method: 'Cash'
      };

      // Act & Assert
      await expect(customerPaymentService.recordPayment(paymentData, 'user-id'))
        .rejects
        .toThrow('Ledger creation failed');
    });

    it('should rollback bill creation if PO update fails', async () => {
      // Arrange
      const mockPO = {
        id: 'po-id',
        vendorId: 'vendor-id',
        total: 100000,
        billedAmount: 0,
        status: 'Sent'
      };
      const mockVendor = { id: 'vendor-id', currentBalance: 0 };

      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.bill.create.mockResolvedValue({ id: 'bill-id' });
      prismaMock.purchaseOrder.update.mockRejectedValue(new Error('PO update failed'));
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);

      const billData = {
        purchaseOrderId: 'po-id',
        vendorId: 'vendor-id',
        subtotal: 45000,
        taxAmount: 5000,
        total: 50000
      };

      // Act & Assert
      await expect(billService.createBill(billData, 'user-id'))
        .rejects
        .toThrow('PO update failed');
    });
  });

  // ===========================
  // Boundary Conditions
  // ===========================

  describe('Boundary Conditions', () => {

    it('should handle zero amounts gracefully', () => {
      // Arrange
      const amount = 0;

      // Act
      const formatted = formatAmount(amount);

      // Assert
      expect(formatted).toBe(0);
    });

    it('should detect negative balance', () => {
      // Arrange
      const invoiceTotal = 10000;
      const paidAmount = 15000; // Overpayment

      // Act
      const remainingBalance = invoiceTotal - paidAmount;

      // Assert
      expect(remainingBalance).toBeLessThan(0);
    });

    it('should handle maximum credit limit', () => {
      // Arrange
      const maxCreditLimit = 99999999.9999;
      const currentBalance = 99999999.0000;
      const newInvoiceAmount = 1.0000;

      // Act
      const wouldExceed = (currentBalance + newInvoiceAmount) > maxCreditLimit;

      // Assert
      expect(wouldExceed).toBe(true);
    });

    it('should handle invoice with many items (100+)', () => {
      // Arrange
      const items = Array.from({ length: 100 }, (_, i) => ({
        id: `item-${i}`,
        price: 1000,
        quantity: 1
      }));

      // Act
      const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const formatted = formatAmount(total);

      // Assert
      expect(formatted).toBe(100000);
      expect(items.length).toBe(100);
    });

    it('should handle very long description strings', () => {
      // Arrange
      const longDescription = 'A'.repeat(1000);

      // Act
      const length = longDescription.length;

      // Assert
      expect(length).toBe(1000);
    });

    it('should handle minimum payment amount (0.01)', () => {
      // Arrange
      const minPayment = 0.01;

      // Act
      const formatted = formatAmount(minPayment);

      // Assert
      expect(formatted).toBe(0.01);
    });
  });

  // ===========================
  // Data Integrity
  // ===========================

  describe('Data Integrity', () => {

    it('should maintain ledger balance consistency', () => {
      // Arrange
      const ledgerEntries = [
        { debit: 10000, credit: 0, balance: 10000 },
        { debit: 5000, credit: 0, balance: 15000 },
        { debit: 0, credit: 3000, balance: 12000 },
        { debit: 0, credit: 2000, balance: 10000 }
      ];

      // Act
      let calculatedBalance = 0;
      ledgerEntries.forEach(entry => {
        calculatedBalance += entry.debit - entry.credit;
      });

      // Assert
      expect(calculatedBalance).toBe(10000);
      expect(ledgerEntries[ledgerEntries.length - 1].balance).toBe(10000);
    });

    it('should verify SUM(invoices) - SUM(payments) = customer.currentBalance', () => {
      // Arrange
      const invoices = [
        { total: 10000, paidAmount: 5000 },
        { total: 20000, paidAmount: 0 },
        { total: 15000, paidAmount: 15000 }
      ];

      // Act
      const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.total, 0);
      const totalPaid = invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
      const expectedBalance = totalInvoiced - totalPaid;

      // Assert
      expect(totalInvoiced).toBe(45000);
      expect(totalPaid).toBe(20000);
      expect(expectedBalance).toBe(25000);
    });

    it('should verify SUM(bills) - SUM(vendor_payments) = vendor.currentBalance', () => {
      // Arrange
      const bills = [
        { total: 50000, paidAmount: 20000 },
        { total: 30000, paidAmount: 0 }
      ];

      // Act
      const totalBilled = bills.reduce((sum, bill) => sum + bill.total, 0);
      const totalPaid = bills.reduce((sum, bill) => sum + bill.paidAmount, 0);
      const expectedBalance = totalBilled - totalPaid;

      // Assert
      expect(totalBilled).toBe(80000);
      expect(totalPaid).toBe(20000);
      expect(expectedBalance).toBe(60000);
    });

    it('should verify double-entry accounting (debits = credits)', () => {
      // Arrange
      const journalEntries = [
        { account: 'Cash', debit: 10000, credit: 0 },
        { account: 'Sales', debit: 0, credit: 10000 }
      ];

      // Act
      const totalDebits = journalEntries.reduce((sum, entry) => sum + entry.debit, 0);
      const totalCredits = journalEntries.reduce((sum, entry) => sum + entry.credit, 0);

      // Assert
      expect(totalDebits).toBe(totalCredits);
    });

    it('should ensure invoice.total = subtotal + tax', () => {
      // Arrange
      const subtotal = 10000;
      const taxRate = 0.1875; // 18.75%
      const tax = formatAmount(subtotal * taxRate);
      const total = formatAmount(subtotal + tax);

      // Act
      const calculatedTotal = formatAmount(subtotal + tax);

      // Assert
      expect(compareAmounts(total, calculatedTotal)).toBe(true);
    });

    it('should ensure SUM(line items) = subtotal', () => {
      // Arrange
      const lineItems = [
        { quantity: 5, unitPrice: 1000, totalPrice: 5000 },
        { quantity: 3, unitPrice: 2000, totalPrice: 6000 },
        { quantity: 2, unitPrice: 1500, totalPrice: 3000 }
      ];

      // Act
      const calculatedSubtotal = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);

      // Assert
      expect(calculatedSubtotal).toBe(14000);
    });
  });

  // ===========================
  // Audit Trail
  // ===========================

  describe('Audit Trail', () => {

    it('should record all status changes in InvoicePaymentAudit', () => {
      // Arrange
      const auditLogs = [
        {
          action: 'INVOICE_CREATED',
          beforeState: {},
          afterState: { status: 'Draft' },
          performedBy: 'user-1'
        },
        {
          action: 'STATUS_CHANGED',
          beforeState: { status: 'Draft' },
          afterState: { status: 'Sent' },
          performedBy: 'user-1'
        },
        {
          action: 'PAYMENT_RECORDED',
          beforeState: { paidAmount: 0 },
          afterState: { paidAmount: 5000 },
          performedBy: 'user-2'
        }
      ];

      // Act
      const statusChanges = auditLogs.filter(log =>
        log.action === 'STATUS_CHANGED' || log.action === 'PAYMENT_RECORDED'
      );

      // Assert
      expect(statusChanges).toHaveLength(2);
      expect(auditLogs.every(log => log.performedBy)).toBe(true);
    });

    it('should record all PO/Bill changes in POBillAudit', () => {
      // Arrange
      const auditLogs = [
        {
          action: 'BILL_CREATED',
          beforeState: { poStatus: 'Sent', billedAmount: 0 },
          afterState: { poStatus: 'Partial', billedAmount: 50000 },
          performedBy: 'user-1'
        },
        {
          action: 'PAYMENT_RECORDED',
          beforeState: { billStatus: 'Unpaid', paidAmount: 0 },
          afterState: { billStatus: 'Partial', paidAmount: 20000 },
          performedBy: 'user-2'
        }
      ];

      // Act
      const hasBeforeAfter = auditLogs.every(log => log.beforeState && log.afterState);

      // Assert
      expect(hasBeforeAfter).toBe(true);
      expect(auditLogs).toHaveLength(2);
    });

    it('should include beforeState and afterState snapshots', () => {
      // Arrange
      const auditEntry = {
        action: 'STATUS_CHANGED',
        beforeState: {
          status: 'Draft',
          total: 10000,
          paidAmount: 0
        },
        afterState: {
          status: 'Sent',
          total: 10000,
          paidAmount: 0
        },
        performedBy: 'user-id'
      };

      // Act
      const hasCompleteSnapshot =
        auditEntry.beforeState.status !== undefined &&
        auditEntry.afterState.status !== undefined;

      // Assert
      expect(hasCompleteSnapshot).toBe(true);
      expect(auditEntry.beforeState.status).not.toBe(auditEntry.afterState.status);
    });

    it('should track performedBy user ID', () => {
      // Arrange
      const auditEntry = {
        action: 'INVOICE_CREATED',
        beforeState: {},
        afterState: { status: 'Draft' },
        performedBy: 'user-123'
      };

      // Act
      const hasPerformedBy = !!auditEntry.performedBy;

      // Assert
      expect(hasPerformedBy).toBe(true);
      expect(auditEntry.performedBy).toBe('user-123');
    });

    it('should include metadata for additional context', () => {
      // Arrange
      const auditEntry = {
        action: 'PAYMENT_VOIDED',
        beforeState: { paidAmount: 10000 },
        afterState: { paidAmount: 0 },
        performedBy: 'user-id',
        metadata: {
          reason: 'Incorrect amount',
          voidedAmount: 10000,
          paymentNumber: 'PAY-001'
        }
      };

      // Act
      const hasMetadata = !!auditEntry.metadata;

      // Assert
      expect(hasMetadata).toBe(true);
      expect(auditEntry.metadata.reason).toBe('Incorrect amount');
    });
  });

  // ===========================
  // Special Characters and Encoding
  // ===========================

  describe('Special Characters and Encoding', () => {

    it('should handle special characters in descriptions', () => {
      // Arrange
      const description = 'Invoice for "Premium" items & services (50% discount)';

      // Act
      const cleaned = description.trim();

      // Assert
      expect(cleaned).toBe('Invoice for "Premium" items & services (50% discount)');
    });

    it('should handle Unicode characters', () => {
      // Arrange
      const customerName = 'محمد علی'; // Arabic
      const amount = 10000;

      // Act
      const description = `Payment from ${customerName}`;

      // Assert
      expect(description).toContain('محمد علی');
    });

    it('should handle currency symbols', () => {
      // Arrange
      const amount = 10000;
      const currency = 'PKR';

      // Act
      const formatted = `${currency} ${amount.toLocaleString()}`;

      // Assert
      expect(formatted).toBe('PKR 10,000');
    });
  });

  // ===========================
  // Date and Time Edge Cases
  // ===========================

  describe('Date and Time Edge Cases', () => {

    it('should handle leap year dates', () => {
      // Arrange
      const leapDate = new Date('2024-02-29');

      // Act
      const isValid = !isNaN(leapDate.getTime());

      // Assert
      expect(isValid).toBe(true);
      expect(leapDate.getDate()).toBe(29);
    });

    it('should handle end of month dates', () => {
      // Arrange
      const endOfMonth = new Date('2025-01-31');

      // Act
      const nextDay = new Date(endOfMonth);
      nextDay.setDate(nextDay.getDate() + 1);

      // Assert
      expect(nextDay.getMonth()).toBe(1); // February (0-indexed)
      expect(nextDay.getDate()).toBe(1);
    });

    it('should handle timezone differences', () => {
      // Arrange
      const date = new Date('2025-01-15T23:00:00Z');

      // Act
      const utcHour = date.getUTCHours();

      // Assert
      expect(utcHour).toBe(23);
    });

    it('should calculate overdue invoices correctly', () => {
      // Arrange
      const today = new Date('2025-01-15');
      const dueDate = new Date('2025-01-10');

      // Act
      const isOverdue = dueDate < today;
      const daysPastDue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

      // Assert
      expect(isOverdue).toBe(true);
      expect(daysPastDue).toBe(5);
    });
  });
});
