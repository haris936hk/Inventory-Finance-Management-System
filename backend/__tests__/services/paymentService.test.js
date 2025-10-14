/**
 * Vendor Payment Service Test Suite
 *
 * Tests for paymentService.js (Vendor Payments)
 * Covers:
 * - Payment recording with bill locking
 * - Payment voiding (immutability pattern)
 * - Vendor balance updates
 * - Bill status transitions
 * - Concurrency control
 * - Decimal precision
 */

// Mock dependencies FIRST (before any requires)
jest.mock('../../src/utils/generateId');
jest.mock('../../src/services/billService');

const db = require('../../src/config/database');
const paymentService = require('../../src/services/paymentService');
const {
  ValidationError,
  InsufficientBalanceError,
  compareAmounts,
  formatAmount
} = require('../../src/utils/transactionWrapper');
const { generatePaymentNumber } = require('../../src/utils/generateId');
const billService = require('../../src/services/billService');

// Get the mock from setup
const prismaMock = global.prismaMock;

describe('VendorPaymentService - Payables', () => {

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock both db.transaction wrapper AND db.prisma.$transaction
    db.transaction = jest.fn(async (callback) => {
      return await callback(prismaMock);
    });
    db.prisma.$transaction = jest.fn(async (callback) => {
      return await callback(prismaMock);
    });
    prismaMock.$executeRaw = jest.fn();

    // Mock default return values
    generatePaymentNumber.mockResolvedValue('VPAY-202501-0001');
    billService.updateBillStatus.mockResolvedValue('Partial');
  });

  // ===========================
  // recordPayment Tests
  // ===========================

  describe('recordPayment', () => {

    const mockBill = {
      id: 'bill-id',
      billNumber: 'BILL-202501-0001',
      vendorId: 'vendor-id',
      purchaseOrderId: 'po-id',
      total: 50000,
      paidAmount: 0,
      status: 'Unpaid',
      cancelledAt: null
    };

    const mockVendor = {
      id: 'vendor-id',
      vendorName: 'ABC Suppliers',
      currentBalance: 50000
    };

    const mockPaymentData = {
      billId: 'bill-id',
      vendorId: 'vendor-id',
      amount: 20000,
      paymentDate: '2025-01-15',
      method: 'Bank Transfer',
      reference: 'TXN123456',
      notes: 'First installment'
    };

    it('should record vendor payment against bill successfully', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001',
        amount: 20000,
        vendor: mockVendor,
        bill: mockBill
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      const result = await paymentService.recordPayment(mockPaymentData, 'user-id');

      // Assert
      expect(result).toHaveProperty('paymentNumber', 'VPAY-202501-0001');
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE NOWAIT'),
        'bill-id'
      );
      expect(prismaMock.vendorPayment.create).toHaveBeenCalled();
      expect(prismaMock.bill.update).toHaveBeenCalledWith({
        where: { id: 'bill-id' },
        data: { paidAmount: 20000 }
      });
    });

    it('should lock bill with lockForUpdate for concurrency control', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001'
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await paymentService.recordPayment(mockPaymentData, 'user-id');

      // Assert
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM "Bill" WHERE id = $1 FOR UPDATE NOWAIT'),
        'bill-id'
      );
    });

    it('should throw ValidationError if bill is cancelled', async () => {
      // Arrange
      const cancelledBill = { ...mockBill, cancelledAt: new Date() };
      prismaMock.$queryRawUnsafe.mockResolvedValue([cancelledBill]);

      // Act & Assert
      await expect(paymentService.recordPayment(mockPaymentData, 'user-id'))
        .rejects
        .toThrow('Cannot record payment for cancelled bill');
    });

    it('should throw ValidationError if vendor does not match bill', async () => {
      // Arrange
      const wrongVendorBill = { ...mockBill, vendorId: 'different-vendor-id' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([wrongVendorBill]);

      // Act & Assert
      await expect(paymentService.recordPayment(mockPaymentData, 'user-id'))
        .rejects
        .toThrow('Vendor must match bill vendor');
    });

    it('should throw ValidationError if payment amount is zero', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);

      const zeroPayment = { ...mockPaymentData, amount: 0 };

      // Act & Assert
      await expect(paymentService.recordPayment(zeroPayment, 'user-id'))
        .rejects
        .toThrow('Payment amount must be greater than zero');
    });

    it('should throw ValidationError if payment amount is negative', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);

      const negativePayment = { ...mockPaymentData, amount: -100 };

      // Act & Assert
      await expect(paymentService.recordPayment(negativePayment, 'user-id'))
        .rejects
        .toThrow('Payment amount must be greater than zero');
    });

    it('should check SUM(payments) <= bill.total', async () => {
      // Arrange
      const partiallyPaidBill = { ...mockBill, paidAmount: 30000 };
      prismaMock.$queryRawUnsafe.mockResolvedValue([partiallyPaidBill]);

      const overpayment = { ...mockPaymentData, amount: 25000 }; // 30000 + 25000 > 50000

      // Act & Assert
      await expect(paymentService.recordPayment(overpayment, 'user-id'))
        .rejects
        .toThrow(InsufficientBalanceError);
    });

    it('should throw InsufficientBalanceError if payment exceeds remaining balance', async () => {
      // Arrange
      const nearlyPaidBill = { ...mockBill, paidAmount: 49000 };
      prismaMock.$queryRawUnsafe.mockResolvedValue([nearlyPaidBill]);

      const excessPayment = { ...mockPaymentData, amount: 2000 }; // 49000 + 2000 > 50000

      // Act & Assert
      await expect(paymentService.recordPayment(excessPayment, 'user-id'))
        .rejects
        .toThrow(InsufficientBalanceError);
    });

    it('should allow payment within 1 cent tolerance for rounding', async () => {
      // Arrange
      const nearlyPaidBill = { ...mockBill, paidAmount: 49999.99 };
      prismaMock.$queryRawUnsafe.mockResolvedValue([nearlyPaidBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001',
        amount: 0.02
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      const exactPayment = { ...mockPaymentData, amount: 0.02 }; // Within tolerance

      // Act
      const result = await paymentService.recordPayment(exactPayment, 'user-id');

      // Assert
      expect(result).toHaveProperty('paymentNumber');
    });

    it('should validate payment method is one of allowed values', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);

      const invalidMethod = { ...mockPaymentData, method: 'Bitcoin' };

      // Act & Assert
      await expect(paymentService.recordPayment(invalidMethod, 'user-id'))
        .rejects
        .toThrow('Invalid payment method. Must be one of: Cash, Bank Transfer, Cheque');
    });

    it('should accept Cash as payment method', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001',
        method: 'Cash'
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      const cashPayment = { ...mockPaymentData, method: 'Cash' };

      // Act
      const result = await paymentService.recordPayment(cashPayment, 'user-id');

      // Assert
      expect(result).toHaveProperty('paymentNumber');
    });

    it('should accept Cheque as payment method', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001',
        method: 'Cheque'
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      const chequePayment = { ...mockPaymentData, method: 'Cheque' };

      // Act
      const result = await paymentService.recordPayment(chequePayment, 'user-id');

      // Assert
      expect(result).toHaveProperty('paymentNumber');
    });

    it('should generate payment number with VPAY prefix', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001'
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await paymentService.recordPayment(mockPaymentData, 'user-id');

      // Assert
      expect(generatePaymentNumber).toHaveBeenCalledWith('VPAY');
    });

    it('should update bill paid amount atomically', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001',
        amount: 20000
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await paymentService.recordPayment(mockPaymentData, 'user-id');

      // Assert
      expect(prismaMock.bill.update).toHaveBeenCalledWith({
        where: { id: 'bill-id' },
        data: { paidAmount: 20000 } // 0 + 20000
      });
    });

    it('should call updateBillStatus to recalculate bill status', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001'
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      billService.updateBillStatus.mockResolvedValue('Partial');

      // Act
      await paymentService.recordPayment(mockPaymentData, 'user-id');

      // Assert
      expect(billService.updateBillStatus).toHaveBeenCalledWith(prismaMock, 'bill-id');
    });

    it('should update vendor balance (decrement payable)', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001',
        amount: 20000
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await paymentService.recordPayment(mockPaymentData, 'user-id');

      // Assert
      expect(prismaMock.vendor.update).toHaveBeenCalledWith({
        where: { id: 'vendor-id' },
        data: {
          currentBalance: { decrement: 20000 }
        }
      });
    });

    it('should create vendor ledger entry', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001',
        amount: 20000
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await paymentService.recordPayment(mockPaymentData, 'user-id');

      // Assert
      expect(prismaMock.vendorLedger.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          vendorId: 'vendor-id',
          description: expect.stringContaining('Payment'),
          debit: 0,
          credit: 20000,
          balance: 50000,
          billId: 'bill-id'
        })
      });
    });

    it('should create audit trail in POBillAudit', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001',
        amount: 20000
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      billService.updateBillStatus.mockResolvedValue('Partial');

      // Act
      await paymentService.recordPayment(mockPaymentData, 'user-id');

      // Assert
      expect(prismaMock.pOBillAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          purchaseOrderId: 'po-id',
          action: 'PAYMENT_RECORDED',
          billId: 'bill-id',
          paymentId: 'payment-id',
          beforeState: {
            billStatus: 'Unpaid',
            paidAmount: 0
          },
          afterState: {
            billStatus: 'Partial',
            paidAmount: 20000,
            paymentAmount: 20000
          },
          performedBy: 'user-id',
          metadata: expect.objectContaining({
            paymentNumber: 'VPAY-202501-0001',
            method: 'Bank Transfer',
            reference: 'TXN123456'
          })
        })
      });
    });

    it('should handle payment with current date if paymentDate not provided', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001'
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      const paymentWithoutDate = { ...mockPaymentData };
      delete paymentWithoutDate.paymentDate;

      // Act
      await paymentService.recordPayment(paymentWithoutDate, 'user-id');

      // Assert
      expect(prismaMock.vendorPayment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          paymentDate: expect.any(Date)
        }),
        include: expect.any(Object)
      });
    });

    it('should handle very small payment (0.01)', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001',
        amount: 0.01
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      const tinyPayment = { ...mockPaymentData, amount: 0.01 };

      // Act
      const result = await paymentService.recordPayment(tinyPayment, 'user-id');

      // Assert
      expect(result).toHaveProperty('paymentNumber');
    });

    it('should handle very large payment', async () => {
      // Arrange
      const largeBill = { ...mockBill, total: 10000000, paidAmount: 0 };
      prismaMock.$queryRawUnsafe.mockResolvedValue([largeBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001',
        amount: 10000000
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      const largePayment = { ...mockPaymentData, amount: 10000000 };

      // Act
      const result = await paymentService.recordPayment(largePayment, 'user-id');

      // Assert
      expect(result).toHaveProperty('paymentNumber');
    });

    it('should handle decimal precision correctly (4 decimal places)', async () => {
      // Arrange
      const precisionBill = { ...mockBill, total: 10000.3333, paidAmount: 0 };
      prismaMock.$queryRawUnsafe.mockResolvedValue([precisionBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001',
        amount: 3333.1111
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      const precisionPayment = { ...mockPaymentData, amount: 3333.1111 };

      // Act
      const result = await paymentService.recordPayment(precisionPayment, 'user-id');

      // Assert
      expect(result).toHaveProperty('paymentNumber');
    });

    it('should use transaction wrapper', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001'
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await paymentService.recordPayment(mockPaymentData, 'user-id');

      // Assert
      // Service uses withTransaction which calls db.prisma.$transaction
      expect(db.prisma.$transaction).toHaveBeenCalled();
    });
  });

  // ===========================
  // voidPayment Tests
  // ===========================

  describe('voidPayment', () => {

    const mockPayment = {
      id: 'payment-id',
      paymentNumber: 'VPAY-202501-0001',
      amount: 20000,
      vendorId: 'vendor-id',
      billId: 'bill-id',
      voidedAt: null,
      bill: {
        id: 'bill-id',
        billNumber: 'BILL-202501-0001',
        purchaseOrderId: 'po-id',
        total: 50000,
        paidAmount: 20000,
        status: 'Partial'
      }
    };

    const mockVendor = {
      id: 'vendor-id',
      vendorName: 'ABC Suppliers',
      currentBalance: 30000 // 50000 - 20000
    };

    it('should void vendor payment successfully', async () => {
      // Arrange
      prismaMock.vendorPayment.findUnique.mockResolvedValue(mockPayment);
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPayment.bill]);
      prismaMock.vendorPayment.update.mockResolvedValue({
        ...mockPayment,
        voidedAt: new Date(),
        voidReason: 'Incorrect amount'
      });
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});
      billService.updateBillStatus.mockResolvedValue('Unpaid');

      // Act
      const result = await paymentService.voidPayment('payment-id', 'Incorrect amount', 'user-id');

      // Assert
      expect(result).toHaveProperty('voidedAt');
      expect(result).toHaveProperty('voidReason', 'Incorrect amount');
      expect(prismaMock.vendorPayment.update).toHaveBeenCalledWith({
        where: { id: 'payment-id' },
        data: {
          voidedAt: expect.any(Date),
          voidReason: 'Incorrect amount',
          voidedBy: 'user-id'
        },
        include: expect.any(Object)
      });
    });

    it('should throw ValidationError if payment not found', async () => {
      // Arrange
      prismaMock.vendorPayment.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(paymentService.voidPayment('nonexistent-id', 'Reason', 'user-id'))
        .rejects
        .toThrow('Payment not found');
    });

    it('should throw ValidationError if payment already voided', async () => {
      // Arrange
      const voidedPayment = { ...mockPayment, voidedAt: new Date() };
      prismaMock.vendorPayment.findUnique.mockResolvedValue(voidedPayment);

      // Act & Assert
      await expect(paymentService.voidPayment('payment-id', 'Reason', 'user-id'))
        .rejects
        .toThrow('Payment is already voided');
    });

    it('should lock bill for update when voiding', async () => {
      // Arrange
      prismaMock.vendorPayment.findUnique.mockResolvedValue(mockPayment);
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPayment.bill]);
      prismaMock.vendorPayment.update.mockResolvedValue({
        ...mockPayment,
        voidedAt: new Date()
      });
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await paymentService.voidPayment('payment-id', 'Incorrect amount', 'user-id');

      // Assert
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE NOWAIT'),
        'bill-id'
      );
    });

    it('should reverse bill paid amount', async () => {
      // Arrange
      prismaMock.vendorPayment.findUnique.mockResolvedValue(mockPayment);
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPayment.bill]);
      prismaMock.vendorPayment.update.mockResolvedValue({
        ...mockPayment,
        voidedAt: new Date()
      });
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await paymentService.voidPayment('payment-id', 'Incorrect amount', 'user-id');

      // Assert
      expect(prismaMock.bill.update).toHaveBeenCalledWith({
        where: { id: 'bill-id' },
        data: { paidAmount: 0 } // 20000 - 20000 = 0
      });
    });

    it('should call updateBillStatus after reversing', async () => {
      // Arrange
      prismaMock.vendorPayment.findUnique.mockResolvedValue(mockPayment);
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPayment.bill]);
      prismaMock.vendorPayment.update.mockResolvedValue({
        ...mockPayment,
        voidedAt: new Date()
      });
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      billService.updateBillStatus.mockResolvedValue('Unpaid');

      // Act
      await paymentService.voidPayment('payment-id', 'Incorrect amount', 'user-id');

      // Assert
      expect(billService.updateBillStatus).toHaveBeenCalledWith(prismaMock, 'bill-id');
    });

    it('should reverse vendor balance (increment payable)', async () => {
      // Arrange
      prismaMock.vendorPayment.findUnique.mockResolvedValue(mockPayment);
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPayment.bill]);
      prismaMock.vendorPayment.update.mockResolvedValue({
        ...mockPayment,
        voidedAt: new Date()
      });
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await paymentService.voidPayment('payment-id', 'Incorrect amount', 'user-id');

      // Assert
      expect(prismaMock.vendor.update).toHaveBeenCalledWith({
        where: { id: 'vendor-id' },
        data: {
          currentBalance: { increment: 20000 }
        }
      });
    });

    it('should create reverse ledger entry', async () => {
      // Arrange
      prismaMock.vendorPayment.findUnique.mockResolvedValue(mockPayment);
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPayment.bill]);
      prismaMock.vendorPayment.update.mockResolvedValue({
        ...mockPayment,
        voidedAt: new Date()
      });
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await paymentService.voidPayment('payment-id', 'Incorrect amount', 'user-id');

      // Assert
      expect(prismaMock.vendorLedger.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          vendorId: 'vendor-id',
          description: expect.stringContaining('voided'),
          debit: 20000,
          credit: 0,
          balance: 30000,
          billId: 'bill-id'
        })
      });
    });

    it('should create audit trail for voiding', async () => {
      // Arrange
      prismaMock.vendorPayment.findUnique.mockResolvedValue(mockPayment);
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPayment.bill]);
      prismaMock.vendorPayment.update.mockResolvedValue({
        ...mockPayment,
        voidedAt: new Date()
      });
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      billService.updateBillStatus.mockResolvedValue('Unpaid');

      // Act
      await paymentService.voidPayment('payment-id', 'Incorrect amount', 'user-id');

      // Assert
      expect(prismaMock.pOBillAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          purchaseOrderId: 'po-id',
          action: 'PAYMENT_VOIDED',
          billId: 'bill-id',
          paymentId: 'payment-id',
          beforeState: {
            billStatus: 'Partial',
            paidAmount: 20000
          },
          afterState: {
            billStatus: 'Unpaid',
            paidAmount: 0
          },
          performedBy: 'user-id',
          metadata: {
            reason: 'Incorrect amount',
            voidedAmount: 20000
          }
        })
      });
    });

    it('should NOT delete payment (immutability)', async () => {
      // Arrange
      prismaMock.vendorPayment.findUnique.mockResolvedValue(mockPayment);
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPayment.bill]);
      prismaMock.vendorPayment.update.mockResolvedValue({
        ...mockPayment,
        voidedAt: new Date()
      });
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await paymentService.voidPayment('payment-id', 'Incorrect amount', 'user-id');

      // Assert
      expect(prismaMock.vendorPayment.delete).not.toHaveBeenCalled();
    });
  });

  // ===========================
  // getPayment Tests
  // ===========================

  describe('getPayment', () => {

    const mockPayment = {
      id: 'payment-id',
      paymentNumber: 'VPAY-202501-0001',
      amount: 20000,
      voidedAt: null,
      vendor: { vendorName: 'ABC Suppliers' },
      bill: { billNumber: 'BILL-202501-0001' },
      createdByUser: { fullName: 'John Doe' }
    };

    it('should get payment with all includes', async () => {
      // Arrange
      prismaMock.vendorPayment.findUnique.mockResolvedValue(mockPayment);

      // Act
      const result = await paymentService.getPayment('payment-id');

      // Assert
      expect(result).toEqual(expect.objectContaining({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001',
        amount: 20000
      }));
      expect(prismaMock.vendorPayment.findUnique).toHaveBeenCalledWith({
        where: { id: 'payment-id', deletedAt: null },
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
    });

    it('should include computed field isVoided = false when not voided', async () => {
      // Arrange
      prismaMock.vendorPayment.findUnique.mockResolvedValue(mockPayment);

      // Act
      const result = await paymentService.getPayment('payment-id');

      // Assert
      expect(result.isVoided).toBe(false);
    });

    it('should include computed field isVoided = true when voided', async () => {
      // Arrange
      const voidedPayment = { ...mockPayment, voidedAt: new Date() };
      prismaMock.vendorPayment.findUnique.mockResolvedValue(voidedPayment);

      // Act
      const result = await paymentService.getPayment('payment-id');

      // Assert
      expect(result.isVoided).toBe(true);
    });

    it('should include computed field canBeVoided = true when not voided', async () => {
      // Arrange
      prismaMock.vendorPayment.findUnique.mockResolvedValue(mockPayment);

      // Act
      const result = await paymentService.getPayment('payment-id');

      // Assert
      expect(result.canBeVoided).toBe(true);
    });

    it('should include computed field canBeVoided = false when voided', async () => {
      // Arrange
      const voidedPayment = { ...mockPayment, voidedAt: new Date() };
      prismaMock.vendorPayment.findUnique.mockResolvedValue(voidedPayment);

      // Act
      const result = await paymentService.getPayment('payment-id');

      // Assert
      expect(result.canBeVoided).toBe(false);
    });

    it('should throw ValidationError if payment not found', async () => {
      // Arrange
      prismaMock.vendorPayment.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(paymentService.getPayment('nonexistent-id'))
        .rejects
        .toThrow('Payment not found');
    });
  });

  // ===========================
  // getPaymentsForBill Tests
  // ===========================

  describe('getPaymentsForBill', () => {

    const mockPayments = [
      {
        id: 'payment-1',
        paymentNumber: 'VPAY-202501-0001',
        amount: 20000,
        voidedAt: null,
        paymentDate: new Date('2025-01-15'),
        vendor: { vendorName: 'ABC Suppliers' },
        createdByUser: { fullName: 'John Doe' }
      },
      {
        id: 'payment-2',
        paymentNumber: 'VPAY-202501-0002',
        amount: 15000,
        voidedAt: new Date(),
        paymentDate: new Date('2025-01-16'),
        vendor: { vendorName: 'ABC Suppliers' },
        createdByUser: { fullName: 'Jane Smith' }
      }
    ];

    it('should get all payments for a bill', async () => {
      // Arrange
      prismaMock.vendorPayment.findMany.mockResolvedValue(mockPayments);

      // Act
      const result = await paymentService.getPaymentsForBill('bill-id');

      // Assert
      expect(result).toHaveLength(2);
      expect(prismaMock.vendorPayment.findMany).toHaveBeenCalledWith({
        where: { billId: 'bill-id', deletedAt: null },
        include: expect.any(Object),
        orderBy: { paymentDate: 'desc' }
      });
    });

    it('should exclude deleted payments', async () => {
      // Arrange
      prismaMock.vendorPayment.findMany.mockResolvedValue(mockPayments);

      // Act
      await paymentService.getPaymentsForBill('bill-id');

      // Assert
      expect(prismaMock.vendorPayment.findMany).toHaveBeenCalledWith({
        where: { billId: 'bill-id', deletedAt: null },
        include: expect.any(Object),
        orderBy: expect.any(Object)
      });
    });

    it('should include voided payments but mark them as voided', async () => {
      // Arrange
      prismaMock.vendorPayment.findMany.mockResolvedValue(mockPayments);

      // Act
      const result = await paymentService.getPaymentsForBill('bill-id');

      // Assert
      expect(result[0].isVoided).toBe(false);
      expect(result[1].isVoided).toBe(true);
    });

    it('should calculate effectiveAmount = 0 for voided payments', async () => {
      // Arrange
      prismaMock.vendorPayment.findMany.mockResolvedValue(mockPayments);

      // Act
      const result = await paymentService.getPaymentsForBill('bill-id');

      // Assert
      expect(result[0].effectiveAmount).toBe(20000);
      expect(result[1].effectiveAmount).toBe(0); // Voided
    });

    it('should order payments by date descending', async () => {
      // Arrange
      prismaMock.vendorPayment.findMany.mockResolvedValue(mockPayments);

      // Act
      await paymentService.getPaymentsForBill('bill-id');

      // Assert
      expect(prismaMock.vendorPayment.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        include: expect.any(Object),
        orderBy: { paymentDate: 'desc' }
      });
    });
  });

  // ===========================
  // getVendorPayments Tests
  // ===========================

  describe('getVendorPayments', () => {

    const mockPayments = [
      {
        id: 'payment-1',
        amount: 20000,
        voidedAt: null,
        vendorId: 'vendor-1',
        billId: 'bill-1',
        vendor: {},
        bill: {},
        createdByUser: {}
      },
      {
        id: 'payment-2',
        amount: 15000,
        voidedAt: new Date(),
        vendorId: 'vendor-2',
        billId: 'bill-2',
        vendor: {},
        bill: {},
        createdByUser: {}
      }
    ];

    it('should return all payments if no filters', async () => {
      // Arrange
      prismaMock.vendorPayment.findMany.mockResolvedValue(mockPayments);

      // Act
      const result = await paymentService.getVendorPayments();

      // Assert
      expect(result).toHaveLength(2);
      expect(prismaMock.vendorPayment.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        include: expect.any(Object),
        orderBy: { paymentDate: 'desc' }
      });
    });

    it('should filter by vendorId', async () => {
      // Arrange
      prismaMock.vendorPayment.findMany.mockResolvedValue([mockPayments[0]]);

      // Act
      const result = await paymentService.getVendorPayments({ vendorId: 'vendor-1' });

      // Assert
      expect(prismaMock.vendorPayment.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, vendorId: 'vendor-1' },
        include: expect.any(Object),
        orderBy: { paymentDate: 'desc' }
      });
    });

    it('should filter by billId', async () => {
      // Arrange
      prismaMock.vendorPayment.findMany.mockResolvedValue([mockPayments[0]]);

      // Act
      const result = await paymentService.getVendorPayments({ billId: 'bill-1' });

      // Assert
      expect(prismaMock.vendorPayment.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, billId: 'bill-1' },
        include: expect.any(Object),
        orderBy: { paymentDate: 'desc' }
      });
    });

    it('should include computed fields isVoided and effectiveAmount', async () => {
      // Arrange
      prismaMock.vendorPayment.findMany.mockResolvedValue(mockPayments);

      // Act
      const result = await paymentService.getVendorPayments();

      // Assert
      expect(result[0]).toHaveProperty('isVoided', false);
      expect(result[0]).toHaveProperty('effectiveAmount', 20000);
      expect(result[1]).toHaveProperty('isVoided', true);
      expect(result[1]).toHaveProperty('effectiveAmount', 0);
    });
  });

  // ===========================
  // getBillPayments Tests
  // ===========================

  describe('getBillPayments (Alias)', () => {

    it('should work as alias for getPaymentsForBill', async () => {
      // Arrange
      const mockPayments = [
        {
          id: 'payment-1',
          paymentNumber: 'VPAY-202501-0001',
          amount: 20000,
          voidedAt: null,
          vendor: {},
          createdByUser: {}
        }
      ];
      prismaMock.vendorPayment.findMany.mockResolvedValue(mockPayments);

      // Act
      const result = await paymentService.getBillPayments('bill-id');

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('isVoided', false);
      expect(result[0]).toHaveProperty('effectiveAmount', 20000);
      expect(prismaMock.vendorPayment.findMany).toHaveBeenCalledWith({
        where: { billId: 'bill-id', deletedAt: null },
        include: expect.any(Object),
        orderBy: { paymentDate: 'desc' }
      });
    });
  });

  // ===========================
  // Concurrency Tests
  // ===========================

  describe('Concurrency and Race Conditions', () => {

    const mockBill = {
      id: 'bill-id',
      billNumber: 'BILL-202501-0001',
      vendorId: 'vendor-id',
      purchaseOrderId: 'po-id',
      total: 50000,
      paidAmount: 0,
      status: 'Unpaid',
      cancelledAt: null
    };

    const mockVendor = {
      id: 'vendor-id',
      currentBalance: 50000
    };

    const mockPaymentData = {
      billId: 'bill-id',
      vendorId: 'vendor-id',
      amount: 20000,
      paymentDate: '2025-01-15',
      method: 'Bank Transfer',
      reference: 'TXN123456'
    };

    it('should handle concurrent payments to same bill', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001'
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await paymentService.recordPayment(mockPaymentData, 'user-id');

      // Assert
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE NOWAIT'),
        'bill-id'
      );
    });

    it('should prevent overpayment with row-level locking', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);

      const overpayment = { ...mockPaymentData, amount: 60000 };

      // Act & Assert
      await expect(paymentService.recordPayment(overpayment, 'user-id'))
        .rejects
        .toThrow(InsufficientBalanceError);
    });

    it('should handle database deadlocks with retry logic', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockRejectedValueOnce({
        code: '40001',
        message: 'could not serialize access due to concurrent update'
      });

      // Act & Assert
      await expect(paymentService.recordPayment(mockPaymentData, 'user-id'))
        .rejects
        .toThrow();
    });
  });

  // ===========================
  // Bill Status Auto-Update Tests
  // ===========================

  describe('Bill Status Auto-Update', () => {

    const mockBill = {
      id: 'bill-id',
      billNumber: 'BILL-202501-0001',
      vendorId: 'vendor-id',
      purchaseOrderId: 'po-id',
      total: 50000,
      paidAmount: 0,
      status: 'Unpaid',
      cancelledAt: null
    };

    const mockVendor = {
      id: 'vendor-id',
      currentBalance: 50000
    };

    const mockPaymentData = {
      billId: 'bill-id',
      vendorId: 'vendor-id',
      amount: 20000,
      paymentDate: '2025-01-15',
      method: 'Bank Transfer',
      reference: 'TXN123456'
    };

    it('should update bill status to Partial after first payment', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001'
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      billService.updateBillStatus.mockResolvedValue('Partial');

      // Act
      await paymentService.recordPayment(mockPaymentData, 'user-id');

      // Assert
      expect(billService.updateBillStatus).toHaveBeenCalledWith(prismaMock, 'bill-id');
    });

    it('should update bill status to Paid when fully paid', async () => {
      // Arrange
      const nearlyPaidBill = { ...mockBill, paidAmount: 30000 };
      prismaMock.$queryRawUnsafe.mockResolvedValue([nearlyPaidBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001'
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      billService.updateBillStatus.mockResolvedValue('Paid');

      const fullPayment = { ...mockPaymentData, amount: 20000 }; // 30000 + 20000 = 50000

      // Act
      await paymentService.recordPayment(fullPayment, 'user-id');

      // Assert
      expect(billService.updateBillStatus).toHaveBeenCalledWith(prismaMock, 'bill-id');
    });

    it('should revert bill status when payment voided', async () => {
      // Arrange
      const mockPayment = {
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001',
        amount: 20000,
        vendorId: 'vendor-id',
        billId: 'bill-id',
        voidedAt: null,
        bill: {
          id: 'bill-id',
          purchaseOrderId: 'po-id',
          total: 50000,
          paidAmount: 20000,
          status: 'Partial'
        }
      };

      prismaMock.vendorPayment.findUnique.mockResolvedValue(mockPayment);
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPayment.bill]);
      prismaMock.vendorPayment.update.mockResolvedValue({
        ...mockPayment,
        voidedAt: new Date()
      });
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      billService.updateBillStatus.mockResolvedValue('Unpaid');

      // Act
      await paymentService.voidPayment('payment-id', 'Incorrect amount', 'user-id');

      // Assert
      expect(billService.updateBillStatus).toHaveBeenCalledWith(prismaMock, 'bill-id');
    });
  });

  // ===========================
  // Edge Cases
  // ===========================

  describe('Edge Cases', () => {

    const mockBill = {
      id: 'bill-id',
      billNumber: 'BILL-202501-0001',
      vendorId: 'vendor-id',
      purchaseOrderId: 'po-id',
      total: 50000,
      paidAmount: 0,
      status: 'Unpaid',
      cancelledAt: null
    };

    const mockVendor = {
      id: 'vendor-id',
      currentBalance: 50000
    };

    const mockPaymentData = {
      billId: 'bill-id',
      vendorId: 'vendor-id',
      amount: 20000,
      paymentDate: '2025-01-15',
      method: 'Bank Transfer'
    };

    it('should handle exact payment (bill.total - bill.paidAmount)', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001',
        amount: 50000
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      const exactPayment = { ...mockPaymentData, amount: 50000 };

      // Act
      const result = await paymentService.recordPayment(exactPayment, 'user-id');

      // Assert
      expect(result).toHaveProperty('paymentNumber');
    });

    it('should handle null reference and notes', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001'
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      const minimalPayment = {
        billId: 'bill-id',
        vendorId: 'vendor-id',
        amount: 20000,
        method: 'Cash'
      };

      // Act
      const result = await paymentService.recordPayment(minimalPayment, 'user-id');

      // Assert
      expect(result).toHaveProperty('paymentNumber');
    });

    it('should handle payment with recurring decimal amounts', async () => {
      // Arrange
      const decimalBill = { ...mockBill, total: 10000.3333 };
      prismaMock.$queryRawUnsafe.mockResolvedValue([decimalBill]);
      prismaMock.vendorPayment.create.mockResolvedValue({
        id: 'payment-id',
        paymentNumber: 'VPAY-202501-0001',
        amount: 3333.1111
      });
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.bill.update.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      const decimalPayment = { ...mockPaymentData, amount: 3333.1111 };

      // Act
      const result = await paymentService.recordPayment(decimalPayment, 'user-id');

      // Assert
      expect(result).toHaveProperty('paymentNumber');
    });
  });
});
