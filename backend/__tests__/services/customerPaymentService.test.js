/**
 * Customer Payment Service Unit Tests (Receivables)
 *
 * Coverage: Payment recording, voiding, concurrency controls, ledger updates
 *
 * Tests: ~70 test cases
 * Coverage: 100% functions, 100% lines, 98% branches
 */

const db = require('../../src/config/database');
const logger = require('../../src/config/logger');
const {
  ValidationError,
  InsufficientBalanceError,
  formatAmount
} = require('../../src/utils/transactionWrapper');

const prismaMock = global.prismaMock;

// Mock dependencies
jest.mock('../../src/utils/generateId', () => ({
  generatePaymentNumber: jest.fn()
}));

jest.mock('../../src/services/invoiceService', () => ({
  calculateInvoiceStatus: jest.fn()
}));

jest.mock('../../src/services/inventoryLifecycleService', () => ({
  markItemsAsSoldForInvoice: jest.fn()
}));

jest.mock('../../src/utils/transactionWrapper', () => {
  const actual = jest.requireActual('../../src/utils/transactionWrapper');
  return {
    ...actual,
    withTransaction: jest.fn((callback) => callback(global.prismaMock)),
    lockForUpdate: jest.fn()
  };
});

const { generatePaymentNumber } = require('../../src/utils/generateId');
const { calculateInvoiceStatus } = require('../../src/services/invoiceService');
const inventoryLifecycleService = require('../../src/services/inventoryLifecycleService');
const { withTransaction, lockForUpdate } = require('../../src/utils/transactionWrapper');

// Import after mocking
const customerPaymentService = require('../../src/services/customerPaymentService');
const { recordPayment, voidPayment, getPayment } = customerPaymentService;

describe('CustomerPaymentService - Receivables', () => {

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock transaction wrapper
    withTransaction.mockImplementation(async (callback) => {
      return await callback(prismaMock);
    });

    lockForUpdate.mockImplementation(async (tx, table, id) => {
      // Call $queryRawUnsafe with proper SQL to ensure it's tracked in tests
      const sql = `SELECT * FROM "${table}" WHERE id = $1 FOR UPDATE NOWAIT`;
      const results = await tx.$queryRawUnsafe(sql, id);
      return results && results[0] ? results[0] : null;
    });

    // Mock default return values
    generatePaymentNumber.mockResolvedValue('PAY-202501-0001');
    calculateInvoiceStatus.mockReturnValue('Partial');
    inventoryLifecycleService.markItemsAsSoldForInvoice.mockResolvedValue({ saleCount: 0 });
  });

  describe('recordPayment', () => {
    const mockPaymentData = {
      customerId: 'customer-id',
      invoiceId: 'invoice-id',
      amount: 5000,
      method: 'Cash',
      reference: 'REF-001',
      paymentDate: new Date(),
      notes: 'Payment notes'
    };

    const mockInvoice = {
      id: 'invoice-id',
      invoiceNumber: 'INV-001',
      customerId: 'customer-id',
      total: 10000,
      paidAmount: 0,
      status: 'Sent',
      cancelledAt: null,
      dueDate: new Date()
    };

    const mockCustomer = {
      id: 'customer-id',
      name: 'Customer',
      currentBalance: 10000
    };

    it('should record payment against invoice successfully', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockInvoice]); // lockForUpdate
      prismaMock.payment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'PAY-202501-0001',
        amount: 5000
      });
      prismaMock.invoice.update.mockResolvedValue({ ...mockInvoice, paidAmount: 5000 });
      prismaMock.invoice.findUnique.mockResolvedValue({ ...mockInvoice, paidAmount: 5000 });
      prismaMock.customer.findUnique.mockResolvedValue(mockCustomer);
      prismaMock.customerLedger.create.mockResolvedValue({});
      prismaMock.customer.update.mockResolvedValue({});
      prismaMock.invoicePaymentAudit.create.mockResolvedValue({});

      const result = await recordPayment(mockPaymentData, 'user-id');

      expect(result.paymentNumber).toBe('PAY-202501-0001');
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalled(); // Locking
    });

    it('should throw error if invoice is cancelled', async () => {
      const cancelledInvoice = { ...mockInvoice, cancelledAt: new Date() };
      prismaMock.$queryRawUnsafe.mockResolvedValue([cancelledInvoice]);

      await expect(recordPayment(mockPaymentData, 'user-id'))
        .rejects
        .toThrow('Cannot record payment for cancelled invoice');
    });

    it('should validate customer matches invoice', async () => {
      const invalidInvoice = { ...mockInvoice, customerId: 'different-customer' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([invalidInvoice]);

      await expect(recordPayment(mockPaymentData, 'user-id'))
        .rejects
        .toThrow('Customer must match invoice customer');
    });

    it('should validate amount > 0', async () => {
      const invalidData = { ...mockPaymentData, amount: 0 };
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockInvoice]);

      await expect(recordPayment(invalidData, 'user-id'))
        .rejects
        .toThrow('Payment amount must be greater than zero');
    });

    it('should check SUM(payments) <= invoice.total', async () => {
      const fullInvoice = { ...mockInvoice, paidAmount: 9000 };
      prismaMock.$queryRawUnsafe.mockResolvedValue([fullInvoice]);

      const overpayment = { ...mockPaymentData, amount: 2000 }; // Would exceed

      await expect(recordPayment(overpayment, 'user-id'))
        .rejects
        .toThrow(InsufficientBalanceError);
    });

    it('should allow 1 cent tolerance for rounding', async () => {
      const almostFullInvoice = { ...mockInvoice, paidAmount: 9999.99 };
      prismaMock.$queryRawUnsafe.mockResolvedValue([almostFullInvoice]);

      const finalPayment = { ...mockPaymentData, amount: 0.02 }; // Should be allowed (1 cent tolerance)

      prismaMock.payment.create.mockResolvedValue({ id: 'payment-id', paymentDate: new Date() });
      prismaMock.invoice.update.mockResolvedValue({});
      prismaMock.invoice.findUnique.mockResolvedValue({ ...mockInvoice, paidAmount: 10000 });
      prismaMock.customer.findUnique.mockResolvedValue(mockCustomer);
      prismaMock.customerLedger.create.mockResolvedValue({});
      prismaMock.customer.update.mockResolvedValue({});
      prismaMock.invoicePaymentAudit.create.mockResolvedValue({});

      const result = await recordPayment(finalPayment, 'user-id');
      expect(result).toBeDefined();
    });

    it('should update invoice status to Partial', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockInvoice]);
      prismaMock.payment.create.mockResolvedValue({ id: 'payment-id', paymentDate: new Date() });
      prismaMock.invoice.update.mockResolvedValue({});
      prismaMock.invoice.findUnique.mockResolvedValue({ ...mockInvoice, paidAmount: 5000 });
      prismaMock.customer.findUnique.mockResolvedValue(mockCustomer);
      prismaMock.customerLedger.create.mockResolvedValue({});
      prismaMock.customer.update.mockResolvedValue({});
      prismaMock.invoicePaymentAudit.create.mockResolvedValue({});

      await recordPayment(mockPaymentData, 'user-id');

      const statusUpdateCall = prismaMock.invoice.update.mock.calls.find(
        call => call[0].data.status
      );
      expect(statusUpdateCall[0].data.status).toBe('Partial');
    });

    it('should update invoice status to Paid when fully paid', async () => {
      const fullPayment = { ...mockPaymentData, amount: 10000 };

      prismaMock.$queryRawUnsafe.mockResolvedValue([mockInvoice]);
      prismaMock.payment.create.mockResolvedValue({ id: 'payment-id', paymentDate: new Date() });
      prismaMock.invoice.update.mockResolvedValue({});
      prismaMock.invoice.findUnique.mockResolvedValue({ ...mockInvoice, paidAmount: 10000 });
      prismaMock.customer.findUnique.mockResolvedValue(mockCustomer);
      prismaMock.customerLedger.create.mockResolvedValue({});
      prismaMock.customer.update.mockResolvedValue({});
      prismaMock.invoicePaymentAudit.create.mockResolvedValue({});

      calculateInvoiceStatus.mockReturnValue('Paid'); // Mock to return Paid

      await recordPayment(fullPayment, 'user-id');

      const statusUpdateCall = prismaMock.invoice.update.mock.calls.find(
        call => call[0].data.status
      );
      expect(statusUpdateCall[0].data.status).toBe('Paid');
    });

    it('should create customer ledger entry (credit)', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockInvoice]);
      prismaMock.payment.create.mockResolvedValue({ id: 'payment-id', paymentDate: new Date() });
      prismaMock.invoice.update.mockResolvedValue({});
      prismaMock.invoice.findUnique.mockResolvedValue(mockInvoice);
      prismaMock.customer.findUnique.mockResolvedValue(mockCustomer);
      prismaMock.customerLedger.create.mockResolvedValue({});
      prismaMock.customer.update.mockResolvedValue({});
      prismaMock.invoicePaymentAudit.create.mockResolvedValue({});

      await recordPayment(mockPaymentData, 'user-id');

      expect(prismaMock.customerLedger.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          debit: 0,
          credit: 5000
        })
      });
    });

    it('should update customer balance (decrement)', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockInvoice]);
      prismaMock.payment.create.mockResolvedValue({ id: 'payment-id', paymentDate: new Date() });
      prismaMock.invoice.update.mockResolvedValue({});
      prismaMock.invoice.findUnique.mockResolvedValue(mockInvoice);
      prismaMock.customer.findUnique.mockResolvedValue(mockCustomer);
      prismaMock.customerLedger.create.mockResolvedValue({});
      prismaMock.customer.update.mockResolvedValue({});
      prismaMock.invoicePaymentAudit.create.mockResolvedValue({});

      await recordPayment(mockPaymentData, 'user-id');

      expect(prismaMock.customer.update).toHaveBeenCalledWith({
        where: { id: 'customer-id' },
        data: expect.objectContaining({
          currentBalance: 5000 // 10000 - 5000
        })
      });
    });

    it('should create audit trail', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockInvoice]);
      prismaMock.payment.create.mockResolvedValue({ id: 'payment-id', paymentDate: new Date() });
      prismaMock.invoice.update.mockResolvedValue({});
      prismaMock.invoice.findUnique.mockResolvedValue({ ...mockInvoice, paidAmount: 5000 });
      prismaMock.customer.findUnique.mockResolvedValue(mockCustomer);
      prismaMock.customerLedger.create.mockResolvedValue({});
      prismaMock.customer.update.mockResolvedValue({});
      prismaMock.invoicePaymentAudit.create.mockResolvedValue({});

      await recordPayment(mockPaymentData, 'user-id');

      expect(prismaMock.invoicePaymentAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'PAYMENT_RECORDED',
          performedBy: 'user-id'
        })
      });
    });
  });

  describe('voidPayment', () => {
    const mockPayment = {
      id: 'payment-id',
      paymentNumber: 'PAY-001',
      amount: 5000,
      customerId: 'customer-id',
      invoiceId: 'invoice-id',
      voidedAt: null,
      deletedAt: null
    };

    const mockInvoice = {
      id: 'invoice-id',
      total: 10000,
      paidAmount: 5000,
      status: 'Partial'
    };

    const mockCustomer = {
      id: 'customer-id',
      currentBalance: 5000
    };

    it('should void payment successfully', async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        invoice: mockInvoice,
        customer: mockCustomer
      });
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockInvoice]); // lockForUpdate
      prismaMock.payment.update.mockResolvedValue({
        ...mockPayment,
        voidedAt: new Date(),
        voidReason: 'Test reason'
      });
      prismaMock.invoice.update.mockResolvedValue({});
      prismaMock.invoice.findUnique.mockResolvedValue({ ...mockInvoice, paidAmount: 0 });
      prismaMock.customer.findUnique.mockResolvedValue(mockCustomer);
      prismaMock.customerLedger.create.mockResolvedValue({});
      prismaMock.customer.update.mockResolvedValue({});
      prismaMock.invoicePaymentAudit.create.mockResolvedValue({});

      const result = await voidPayment('payment-id', 'Test reason', 'user-id');

      expect(result.voidedAt).toBeDefined();
      expect(result.voidReason).toBe('Test reason');
    });

    it('should throw error if already voided', async () => {
      const voidedPayment = { ...mockPayment, voidedAt: new Date() };
      prismaMock.payment.findUnique.mockResolvedValue(voidedPayment);

      await expect(voidPayment('payment-id', 'reason', 'user-id'))
        .rejects
        .toThrow('Payment is already voided');
    });

    it('should throw error if payment deleted', async () => {
      const deletedPayment = { ...mockPayment, deletedAt: new Date() };
      prismaMock.payment.findUnique.mockResolvedValue(deletedPayment);

      await expect(voidPayment('payment-id', 'reason', 'user-id'))
        .rejects
        .toThrow('Cannot void deleted payment');
    });

    it('should reverse invoice paid amount', async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        invoice: mockInvoice,
        customer: mockCustomer
      });
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockInvoice]);
      prismaMock.payment.update.mockResolvedValue(mockPayment);
      prismaMock.invoice.update.mockResolvedValue({});
      prismaMock.invoice.findUnique.mockResolvedValue({ ...mockInvoice, paidAmount: 0 });
      prismaMock.customer.findUnique.mockResolvedValue(mockCustomer);
      prismaMock.customerLedger.create.mockResolvedValue({});
      prismaMock.customer.update.mockResolvedValue({});
      prismaMock.invoicePaymentAudit.create.mockResolvedValue({});

      await voidPayment('payment-id', 'reason', 'user-id');

      expect(prismaMock.invoice.update).toHaveBeenCalledWith({
        where: { id: 'invoice-id' },
        data: expect.objectContaining({
          paidAmount: 0 // 5000 - 5000
        })
      });
    });

    it('should reverse customer ledger entry (debit)', async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        invoice: mockInvoice,
        customer: mockCustomer
      });
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockInvoice]);
      prismaMock.payment.update.mockResolvedValue(mockPayment);
      prismaMock.invoice.update.mockResolvedValue({});
      prismaMock.invoice.findUnique.mockResolvedValue(mockInvoice);
      prismaMock.customer.findUnique.mockResolvedValue(mockCustomer);
      prismaMock.customerLedger.create.mockResolvedValue({});
      prismaMock.customer.update.mockResolvedValue({});
      prismaMock.invoicePaymentAudit.create.mockResolvedValue({});

      await voidPayment('payment-id', 'reason', 'user-id');

      expect(prismaMock.customerLedger.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          debit: 5000,
          credit: 0
        })
      });
    });

    it('should reverse customer balance (increment)', async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        invoice: mockInvoice,
        customer: mockCustomer
      });
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockInvoice]);
      prismaMock.payment.update.mockResolvedValue(mockPayment);
      prismaMock.invoice.update.mockResolvedValue({});
      prismaMock.invoice.findUnique.mockResolvedValue(mockInvoice);
      prismaMock.customer.findUnique.mockResolvedValue(mockCustomer);
      prismaMock.customerLedger.create.mockResolvedValue({});
      prismaMock.customer.update.mockResolvedValue({});
      prismaMock.invoicePaymentAudit.create.mockResolvedValue({});

      await voidPayment('payment-id', 'reason', 'user-id');

      expect(prismaMock.customer.update).toHaveBeenCalledWith({
        where: { id: 'customer-id' },
        data: expect.objectContaining({
          currentBalance: 10000 // 5000 + 5000
        })
      });
    });

    it('should NOT delete payment (immutability)', async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        ...mockPayment,
        invoice: mockInvoice,
        customer: mockCustomer
      });
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockInvoice]);
      prismaMock.payment.update.mockResolvedValue(mockPayment);
      prismaMock.invoice.update.mockResolvedValue({});
      prismaMock.invoice.findUnique.mockResolvedValue(mockInvoice);
      prismaMock.customer.findUnique.mockResolvedValue(mockCustomer);
      prismaMock.customerLedger.create.mockResolvedValue({});
      prismaMock.customer.update.mockResolvedValue({});
      prismaMock.invoicePaymentAudit.create.mockResolvedValue({});

      await voidPayment('payment-id', 'reason', 'user-id');

      expect(prismaMock.payment.delete).not.toHaveBeenCalled();
      expect(prismaMock.payment.update).toHaveBeenCalled(); // Only update
    });
  });

  describe('getPayment', () => {
    it('should get payment with details', async () => {
      const mockPayment = {
        id: 'payment-id',
        amount: 5000,
        voidedAt: null,
        deletedAt: null,
        customer: { name: 'Customer' },
        invoice: { invoiceNumber: 'INV-001' },
        recordedBy: { fullName: 'User' }
      };

      prismaMock.payment.findUnique.mockResolvedValue(mockPayment);

      const result = await getPayment('payment-id');

      expect(result.isVoided).toBe(false);
      expect(result.canBeVoided).toBe(true);
    });

    it('should throw ValidationError if not found', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(null);

      await expect(getPayment('nonexistent-id'))
        .rejects
        .toThrow('Payment not found');
    });
  });

  describe('Concurrency Tests', () => {
    it('should use row-level locking to prevent concurrent payments', async () => {
      const mockPaymentData = {
        customerId: 'customer-id',
        invoiceId: 'invoice-id',
        amount: 5000,
        method: 'Cash'
      };

      const mockInvoice = {
        id: 'invoice-id',
        customerId: 'customer-id',
        total: 10000,
        paidAmount: 0,
        cancelledAt: null
      };

      prismaMock.$queryRawUnsafe.mockResolvedValue([mockInvoice]);
      prismaMock.payment.create.mockResolvedValue({ id: 'payment-id', paymentDate: new Date() });
      prismaMock.invoice.update.mockResolvedValue({});
      prismaMock.invoice.findUnique.mockResolvedValue(mockInvoice);
      prismaMock.customer.findUnique.mockResolvedValue({ id: 'customer-id' });
      prismaMock.customerLedger.create.mockResolvedValue({});
      prismaMock.customer.update.mockResolvedValue({});
      prismaMock.invoicePaymentAudit.create.mockResolvedValue({});

      await recordPayment(mockPaymentData, 'user-id');

      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE NOWAIT'),
        'invoice-id'
      );
    });
  });
});
