/**
 * Bill Service Test Suite
 *
 * Tests for billService.js
 * Covers:
 * - Bill creation against PO with validation
 * - Bill cancellation (unpaid only)
 * - PO relationship and balance enforcement
 * - Bill status auto-calculation
 * - Concurrency control
 */

const db = require('../../src/config/database');
const billService = require('../../src/services/billService');
const {
  ValidationError,
  InsufficientBalanceError,
  compareAmounts,
  formatAmount
} = require('../../src/utils/transactionWrapper');
const { generateBillNumber } = require('../../src/utils/generateId');

// Get the mock from setup
const prismaMock = global.prismaMock;

// Mock dependencies
jest.mock('../../src/utils/generateId', () => ({
  generateBillNumber: jest.fn()
}));

describe('BillService', () => {

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock transaction wrapper
    db.transaction = jest.fn((callback) => callback(prismaMock));

    // Mock default return values
    generateBillNumber.mockResolvedValue('BILL-202501-0001');
  });

  // ===========================
  // createBill Tests
  // ===========================

  describe('createBill', () => {

    const mockPO = {
      id: 'po-id',
      poNumber: 'PO-202501-0001',
      vendorId: 'vendor-id',
      total: 100000,
      billedAmount: 0,
      status: 'Sent',
      cancelledAt: null
    };

    const mockVendor = {
      id: 'vendor-id',
      vendorName: 'ABC Suppliers',
      currentBalance: 0
    };

    const mockBillData = {
      purchaseOrderId: 'po-id',
      vendorId: 'vendor-id',
      billDate: '2025-01-15',
      dueDate: '2025-02-15',
      subtotal: 45000,
      taxAmount: 5000,
      total: 50000
    };

    it('should create bill against PO successfully', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.bill.create.mockResolvedValue({
        id: 'bill-id',
        billNumber: 'BILL-202501-0001',
        total: 50000,
        vendor: mockVendor,
        purchaseOrder: mockPO
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      const result = await billService.createBill(mockBillData, 'user-id');

      // Assert
      expect(result).toHaveProperty('billNumber', 'BILL-202501-0001');
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE NOWAIT'),
        'po-id'
      );
      expect(prismaMock.bill.create).toHaveBeenCalled();
    });

    it('should lock PO with lockForUpdate for concurrency control', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.bill.create.mockResolvedValue({
        id: 'bill-id',
        billNumber: 'BILL-202501-0001'
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.createBill(mockBillData, 'user-id');

      // Assert
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM "PurchaseOrder" WHERE id = $1 FOR UPDATE NOWAIT'),
        'po-id'
      );
    });

    it('should throw ValidationError if PO is cancelled', async () => {
      // Arrange
      const cancelledPO = { ...mockPO, status: 'Cancelled' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([cancelledPO]);

      // Act & Assert
      await expect(billService.createBill(mockBillData, 'user-id'))
        .rejects
        .toThrow('Cannot create bill for cancelled Purchase Order');
    });

    it('should throw ValidationError if PO is Paid', async () => {
      // Arrange
      const paidPO = { ...mockPO, status: 'Paid' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([paidPO]);

      // Act & Assert
      await expect(billService.createBill(mockBillData, 'user-id'))
        .rejects
        .toThrow('Cannot create bill for fully paid Purchase Order');
    });

    it('should throw ValidationError if PO is Delivered', async () => {
      // Arrange
      const deliveredPO = { ...mockPO, status: 'Delivered' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([deliveredPO]);

      // Act & Assert
      await expect(billService.createBill(mockBillData, 'user-id'))
        .rejects
        .toThrow('Cannot create bill for delivered Purchase Order');
    });

    it('should throw ValidationError if PO is Draft', async () => {
      // Arrange
      const draftPO = { ...mockPO, status: 'Draft' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([draftPO]);

      // Act & Assert
      await expect(billService.createBill(mockBillData, 'user-id'))
        .rejects
        .toThrow('Cannot create bill for Draft Purchase Order. Please send the PO first.');
    });

    it('should throw ValidationError if vendor does not match PO', async () => {
      // Arrange
      const wrongVendorPO = { ...mockPO, vendorId: 'different-vendor-id' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([wrongVendorPO]);

      // Act & Assert
      await expect(billService.createBill(mockBillData, 'user-id'))
        .rejects
        .toThrow('Vendor must match Purchase Order vendor');
    });

    it('should validate total equals subtotal + tax', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);

      const invalidTotals = {
        ...mockBillData,
        subtotal: 45000,
        taxAmount: 5000,
        total: 55000 // Wrong total
      };

      // Act & Assert
      await expect(billService.createBill(invalidTotals, 'user-id'))
        .rejects
        .toThrow('Bill total (55000) must equal subtotal (45000) + tax (5000)');
    });

    it('should check SUM(bills) <= PO.total', async () => {
      // Arrange
      const partiallyBilledPO = { ...mockPO, billedAmount: 60000 };
      prismaMock.$queryRawUnsafe.mockResolvedValue([partiallyBilledPO]);

      const excessBill = { ...mockBillData, total: 50000 }; // 60000 + 50000 > 100000

      // Act & Assert
      await expect(billService.createBill(excessBill, 'user-id'))
        .rejects
        .toThrow(InsufficientBalanceError);
    });

    it('should throw InsufficientBalanceError if bill exceeds PO balance', async () => {
      // Arrange
      const nearlyFullPO = { ...mockPO, billedAmount: 95000 };
      prismaMock.$queryRawUnsafe.mockResolvedValue([nearlyFullPO]);

      const excessBill = { ...mockBillData, total: 10000 }; // 95000 + 10000 > 100000

      // Act & Assert
      await expect(billService.createBill(excessBill, 'user-id'))
        .rejects
        .toThrow(InsufficientBalanceError);
    });

    it('should allow bill within 1 cent tolerance for rounding', async () => {
      // Arrange
      const nearlyFullPO = { ...mockPO, billedAmount: 99999.99 };
      prismaMock.$queryRawUnsafe.mockResolvedValue([nearlyFullPO]);
      prismaMock.bill.create.mockResolvedValue({
        id: 'bill-id',
        billNumber: 'BILL-202501-0001',
        total: 0.02
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      const tinyBill = {
        ...mockBillData,
        subtotal: 0.02,
        taxAmount: 0,
        total: 0.02
      };

      // Act
      const result = await billService.createBill(tinyBill, 'user-id');

      // Assert
      expect(result).toHaveProperty('billNumber');
    });

    it('should generate bill number', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.bill.create.mockResolvedValue({
        id: 'bill-id',
        billNumber: 'BILL-202501-0001'
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.createBill(mockBillData, 'user-id');

      // Assert
      expect(generateBillNumber).toHaveBeenCalled();
    });

    it('should create bill with status Unpaid', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.bill.create.mockResolvedValue({
        id: 'bill-id',
        billNumber: 'BILL-202501-0001',
        status: 'Unpaid'
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.createBill(mockBillData, 'user-id');

      // Assert
      expect(prismaMock.bill.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'Unpaid',
          paidAmount: 0
        }),
        include: expect.any(Object)
      });
    });

    it('should update PO billed amount atomically', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.bill.create.mockResolvedValue({
        id: 'bill-id',
        billNumber: 'BILL-202501-0001',
        total: 50000
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.createBill(mockBillData, 'user-id');

      // Assert
      expect(prismaMock.purchaseOrder.update).toHaveBeenCalledWith({
        where: { id: 'po-id' },
        data: expect.objectContaining({
          billedAmount: 50000 // 0 + 50000
        })
      });
    });

    it('should update PO status from Sent to Partial on first bill', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]); // status: 'Sent', billedAmount: 0
      prismaMock.bill.create.mockResolvedValue({
        id: 'bill-id',
        billNumber: 'BILL-202501-0001',
        total: 50000
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.createBill(mockBillData, 'user-id');

      // Assert
      expect(prismaMock.purchaseOrder.update).toHaveBeenCalledWith({
        where: { id: 'po-id' },
        data: expect.objectContaining({
          status: 'Partial'
        })
      });
    });

    it('should update PO status to Paid when fully billed', async () => {
      // Arrange
      const partialPO = { ...mockPO, billedAmount: 50000, status: 'Partial' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([partialPO]);
      prismaMock.bill.create.mockResolvedValue({
        id: 'bill-id',
        billNumber: 'BILL-202501-0001',
        total: 50000 // 50000 + 50000 = 100000 (fully billed)
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.createBill(mockBillData, 'user-id');

      // Assert
      expect(prismaMock.purchaseOrder.update).toHaveBeenCalledWith({
        where: { id: 'po-id' },
        data: expect.objectContaining({
          status: 'Paid'
        })
      });
    });

    it('should create vendor ledger entry', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.bill.create.mockResolvedValue({
        id: 'bill-id',
        billNumber: 'BILL-202501-0001',
        total: 50000
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.createBill(mockBillData, 'user-id');

      // Assert
      expect(prismaMock.vendorLedger.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          vendorId: 'vendor-id',
          description: 'Bill BILL-202501-0001',
          debit: 50000,
          credit: 0,
          balance: 50000,
          billId: 'bill-id'
        })
      });
    });

    it('should update vendor balance', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.bill.create.mockResolvedValue({
        id: 'bill-id',
        billNumber: 'BILL-202501-0001',
        total: 50000
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.createBill(mockBillData, 'user-id');

      // Assert
      expect(prismaMock.vendor.update).toHaveBeenCalledWith({
        where: { id: 'vendor-id' },
        data: {
          currentBalance: 50000 // 0 + 50000
        }
      });
    });

    it('should create audit trail', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.bill.create.mockResolvedValue({
        id: 'bill-id',
        billNumber: 'BILL-202501-0001',
        total: 50000
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.createBill(mockBillData, 'user-id');

      // Assert
      expect(prismaMock.pOBillAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          purchaseOrderId: 'po-id',
          action: 'BILL_CREATED',
          billId: 'bill-id',
          beforeState: {
            poStatus: 'Sent',
            billedAmount: 0
          },
          afterState: expect.objectContaining({
            poStatus: 'Partial',
            billedAmount: 50000,
            billTotal: 50000
          }),
          performedBy: 'user-id',
          metadata: expect.objectContaining({
            billNumber: 'BILL-202501-0001',
            vendorId: 'vendor-id'
          })
        })
      });
    });

    it('should handle bill with current date if billDate not provided', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.bill.create.mockResolvedValue({
        id: 'bill-id',
        billNumber: 'BILL-202501-0001'
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      const billWithoutDate = { ...mockBillData };
      delete billWithoutDate.billDate;

      // Act
      await billService.createBill(billWithoutDate, 'user-id');

      // Assert
      expect(prismaMock.bill.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          billDate: expect.any(Date)
        }),
        include: expect.any(Object)
      });
    });

    it('should handle null dueDate', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.bill.create.mockResolvedValue({
        id: 'bill-id',
        billNumber: 'BILL-202501-0001'
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      const billWithoutDueDate = { ...mockBillData };
      delete billWithoutDueDate.dueDate;

      // Act
      await billService.createBill(billWithoutDueDate, 'user-id');

      // Assert
      expect(prismaMock.bill.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dueDate: null
        }),
        include: expect.any(Object)
      });
    });

    it('should handle decimal precision correctly (4 decimal places)', async () => {
      // Arrange
      const decimalPO = { ...mockPO, total: 10000.3333 };
      prismaMock.$queryRawUnsafe.mockResolvedValue([decimalPO]);
      prismaMock.bill.create.mockResolvedValue({
        id: 'bill-id',
        billNumber: 'BILL-202501-0001',
        total: 3333.1111
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      const decimalBill = {
        ...mockBillData,
        subtotal: 3000.1111,
        taxAmount: 333.0000,
        total: 3333.1111
      };

      // Act
      const result = await billService.createBill(decimalBill, 'user-id');

      // Assert
      expect(result).toHaveProperty('billNumber');
    });

    it('should use transaction wrapper', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.bill.create.mockResolvedValue({
        id: 'bill-id',
        billNumber: 'BILL-202501-0001'
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.createBill(mockBillData, 'user-id');

      // Assert
      expect(db.transaction).toHaveBeenCalled();
    });
  });

  // ===========================
  // cancelBill Tests
  // ===========================

  describe('cancelBill', () => {

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

    const mockPO = {
      id: 'po-id',
      poNumber: 'PO-202501-0001',
      total: 100000,
      billedAmount: 50000,
      status: 'Partial'
    };

    const mockVendor = {
      id: 'vendor-id',
      currentBalance: 50000
    };

    it('should cancel unpaid bill successfully', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([mockBill]) // Lock bill
        .mockResolvedValueOnce([mockPO]);  // Lock PO
      prismaMock.bill.update.mockResolvedValue({
        ...mockBill,
        cancelledAt: new Date(),
        cancelReason: 'Incorrect amount'
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      const result = await billService.cancelBill('bill-id', 'Incorrect amount', 'user-id');

      // Assert
      expect(result).toHaveProperty('cancelledAt');
      expect(result).toHaveProperty('cancelReason', 'Incorrect amount');
    });

    it('should throw ValidationError if bill already cancelled', async () => {
      // Arrange
      const cancelledBill = { ...mockBill, cancelledAt: new Date() };
      prismaMock.$queryRawUnsafe.mockResolvedValue([cancelledBill]);

      // Act & Assert
      await expect(billService.cancelBill('bill-id', 'Reason', 'user-id'))
        .rejects
        .toThrow('Bill is already cancelled');
    });

    it('should throw ValidationError if bill status is not Unpaid', async () => {
      // Arrange
      const partialBill = { ...mockBill, status: 'Partial' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([partialBill]);

      // Act & Assert
      await expect(billService.cancelBill('bill-id', 'Reason', 'user-id'))
        .rejects
        .toThrow('Cannot cancel bill with status Partial. Only unpaid bills can be cancelled.');
    });

    it('should throw ValidationError if bill has payments', async () => {
      // Arrange
      const billWithPayments = { ...mockBill, paidAmount: 10000 };
      prismaMock.$queryRawUnsafe.mockResolvedValue([billWithPayments]);

      // Act & Assert
      await expect(billService.cancelBill('bill-id', 'Reason', 'user-id'))
        .rejects
        .toThrow('Cannot cancel bill with payments. Bill has 10000 paid.');
    });

    it('should lock bill and PO for update', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([mockBill])
        .mockResolvedValueOnce([mockPO]);
      prismaMock.bill.update.mockResolvedValue({
        ...mockBill,
        cancelledAt: new Date()
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.cancelBill('bill-id', 'Incorrect amount', 'user-id');

      // Assert
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE NOWAIT'),
        'bill-id'
      );
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE NOWAIT'),
        'po-id'
      );
    });

    it('should soft-cancel bill (set cancelledAt and cancelReason)', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([mockBill])
        .mockResolvedValueOnce([mockPO]);
      prismaMock.bill.update.mockResolvedValue({
        ...mockBill,
        cancelledAt: new Date(),
        cancelReason: 'Incorrect amount'
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.cancelBill('bill-id', 'Incorrect amount', 'user-id');

      // Assert
      expect(prismaMock.bill.update).toHaveBeenCalledWith({
        where: { id: 'bill-id' },
        data: {
          cancelledAt: expect.any(Date),
          cancelReason: 'Incorrect amount'
        },
        include: expect.any(Object)
      });
    });

    it('should reverse PO billed amount', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([mockBill])
        .mockResolvedValueOnce([mockPO]);
      prismaMock.bill.update.mockResolvedValue({
        ...mockBill,
        cancelledAt: new Date()
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.cancelBill('bill-id', 'Incorrect amount', 'user-id');

      // Assert
      expect(prismaMock.purchaseOrder.update).toHaveBeenCalledWith({
        where: { id: 'po-id' },
        data: expect.objectContaining({
          billedAmount: 0 // 50000 - 50000
        })
      });
    });

    it('should revert PO status from Paid to Partial when not fully billed', async () => {
      // Arrange
      const paidPO = { ...mockPO, status: 'Paid', billedAmount: 100000 };
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([mockBill])
        .mockResolvedValueOnce([paidPO]);
      prismaMock.bill.update.mockResolvedValue({
        ...mockBill,
        cancelledAt: new Date()
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.cancelBill('bill-id', 'Incorrect amount', 'user-id');

      // Assert
      expect(prismaMock.purchaseOrder.update).toHaveBeenCalledWith({
        where: { id: 'po-id' },
        data: expect.objectContaining({
          status: 'Partial'
        })
      });
    });

    it('should revert PO status from Partial to Sent when all bills cancelled', async () => {
      // Arrange
      const partialPO = { ...mockPO, status: 'Partial', billedAmount: 50000 };
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([mockBill])
        .mockResolvedValueOnce([partialPO]);
      prismaMock.bill.update.mockResolvedValue({
        ...mockBill,
        cancelledAt: new Date()
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.cancelBill('bill-id', 'Incorrect amount', 'user-id');

      // Assert
      expect(prismaMock.purchaseOrder.update).toHaveBeenCalledWith({
        where: { id: 'po-id' },
        data: expect.objectContaining({
          status: 'Sent' // billedAmount becomes 0
        })
      });
    });

    it('should create reverse vendor ledger entry', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([mockBill])
        .mockResolvedValueOnce([mockPO]);
      prismaMock.bill.update.mockResolvedValue({
        ...mockBill,
        cancelledAt: new Date()
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.cancelBill('bill-id', 'Incorrect amount', 'user-id');

      // Assert
      expect(prismaMock.vendorLedger.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          vendorId: 'vendor-id',
          description: expect.stringContaining('cancelled'),
          debit: 0,
          credit: 50000,
          balance: 0,
          billId: 'bill-id'
        })
      });
    });

    it('should reverse vendor balance', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([mockBill])
        .mockResolvedValueOnce([mockPO]);
      prismaMock.bill.update.mockResolvedValue({
        ...mockBill,
        cancelledAt: new Date()
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.cancelBill('bill-id', 'Incorrect amount', 'user-id');

      // Assert
      expect(prismaMock.vendor.update).toHaveBeenCalledWith({
        where: { id: 'vendor-id' },
        data: {
          currentBalance: 0 // 50000 - 50000
        }
      });
    });

    it('should create audit trail for cancellation', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe
        .mockResolvedValueOnce([mockBill])
        .mockResolvedValueOnce([mockPO]);
      prismaMock.bill.update.mockResolvedValue({
        ...mockBill,
        cancelledAt: new Date()
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.cancelBill('bill-id', 'Incorrect amount', 'user-id');

      // Assert
      expect(prismaMock.pOBillAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          purchaseOrderId: 'po-id',
          action: 'BILL_CANCELLED',
          billId: 'bill-id',
          beforeState: {
            billStatus: 'Unpaid',
            poStatus: 'Partial',
            billedAmount: 50000
          },
          afterState: expect.objectContaining({
            billStatus: 'Cancelled',
            billedAmount: 0
          }),
          performedBy: 'user-id',
          metadata: { reason: 'Incorrect amount' }
        })
      });
    });
  });

  // ===========================
  // updateBillStatus Tests
  // ===========================

  describe('updateBillStatus (internal)', () => {

    it('should calculate status as Unpaid if paidAmount = 0', async () => {
      // Arrange
      const unpaidBill = {
        id: 'bill-id',
        total: 50000,
        paidAmount: 0,
        status: 'Unpaid'
      };
      prismaMock.bill.findUnique.mockResolvedValue(unpaidBill);
      prismaMock.bill.update.mockResolvedValue({});

      // Act
      const result = await billService.updateBillStatus(prismaMock, 'bill-id');

      // Assert
      expect(result).toBe('Unpaid');
    });

    it('should calculate status as Partial if 0 < paidAmount < total', async () => {
      // Arrange
      const partialBill = {
        id: 'bill-id',
        total: 50000,
        paidAmount: 20000,
        status: 'Unpaid'
      };
      prismaMock.bill.findUnique.mockResolvedValue(partialBill);
      prismaMock.bill.update.mockResolvedValue({});

      // Act
      const result = await billService.updateBillStatus(prismaMock, 'bill-id');

      // Assert
      expect(result).toBe('Partial');
      expect(prismaMock.bill.update).toHaveBeenCalledWith({
        where: { id: 'bill-id' },
        data: { status: 'Partial' }
      });
    });

    it('should calculate status as Paid if paidAmount = total', async () => {
      // Arrange
      const paidBill = {
        id: 'bill-id',
        total: 50000,
        paidAmount: 50000,
        status: 'Partial'
      };
      prismaMock.bill.findUnique.mockResolvedValue(paidBill);
      prismaMock.bill.update.mockResolvedValue({});

      // Act
      const result = await billService.updateBillStatus(prismaMock, 'bill-id');

      // Assert
      expect(result).toBe('Paid');
      expect(prismaMock.bill.update).toHaveBeenCalledWith({
        where: { id: 'bill-id' },
        data: { status: 'Paid' }
      });
    });

    it('should use compareAmounts for equality check', async () => {
      // Arrange
      const nearlyPaidBill = {
        id: 'bill-id',
        total: 50000.0000,
        paidAmount: 50000.0001, // Within tolerance
        status: 'Partial'
      };
      prismaMock.bill.findUnique.mockResolvedValue(nearlyPaidBill);
      prismaMock.bill.update.mockResolvedValue({});

      // Act
      const result = await billService.updateBillStatus(prismaMock, 'bill-id');

      // Assert
      expect(result).toBe('Paid');
    });

    it('should not update if status has not changed', async () => {
      // Arrange
      const unchangedBill = {
        id: 'bill-id',
        total: 50000,
        paidAmount: 0,
        status: 'Unpaid'
      };
      prismaMock.bill.findUnique.mockResolvedValue(unchangedBill);

      // Act
      const result = await billService.updateBillStatus(prismaMock, 'bill-id');

      // Assert
      expect(result).toBe('Unpaid');
      expect(prismaMock.bill.update).not.toHaveBeenCalled();
    });

    it('should throw ValidationError if bill not found', async () => {
      // Arrange
      prismaMock.bill.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(billService.updateBillStatus(prismaMock, 'nonexistent-id'))
        .rejects
        .toThrow('Bill not found');
    });
  });

  // ===========================
  // getBill Tests
  // ===========================

  describe('getBill', () => {

    const mockBill = {
      id: 'bill-id',
      billNumber: 'BILL-202501-0001',
      total: 50000,
      paidAmount: 20000,
      cancelledAt: null,
      vendor: { vendorName: 'ABC Suppliers' },
      purchaseOrder: { poNumber: 'PO-202501-0001' },
      payments: [
        { id: 'payment-1', amount: 20000 }
      ]
    };

    it('should get bill with all includes', async () => {
      // Arrange
      prismaMock.bill.findUnique.mockResolvedValue(mockBill);

      // Act
      const result = await billService.getBill('bill-id');

      // Assert
      expect(result).toEqual(expect.objectContaining({
        id: 'bill-id',
        billNumber: 'BILL-202501-0001'
      }));
      expect(prismaMock.bill.findUnique).toHaveBeenCalledWith({
        where: { id: 'bill-id', deletedAt: null },
        include: expect.objectContaining({
          vendor: true,
          purchaseOrder: true,
          payments: expect.any(Object)
        })
      });
    });

    it('should include computed field remainingAmount', async () => {
      // Arrange
      prismaMock.bill.findUnique.mockResolvedValue(mockBill);

      // Act
      const result = await billService.getBill('bill-id');

      // Assert
      expect(result.remainingAmount).toBe(30000); // 50000 - 20000
    });

    it('should include computed field isCancelled = false when not cancelled', async () => {
      // Arrange
      prismaMock.bill.findUnique.mockResolvedValue(mockBill);

      // Act
      const result = await billService.getBill('bill-id');

      // Assert
      expect(result.isCancelled).toBe(false);
    });

    it('should include computed field isCancelled = true when cancelled', async () => {
      // Arrange
      const cancelledBill = { ...mockBill, cancelledAt: new Date() };
      prismaMock.bill.findUnique.mockResolvedValue(cancelledBill);

      // Act
      const result = await billService.getBill('bill-id');

      // Assert
      expect(result.isCancelled).toBe(true);
    });

    it('should include computed field canBePaid = true when not cancelled and has remaining balance', async () => {
      // Arrange
      prismaMock.bill.findUnique.mockResolvedValue(mockBill);

      // Act
      const result = await billService.getBill('bill-id');

      // Assert
      expect(result.canBePaid).toBe(true);
    });

    it('should include computed field canBePaid = false when cancelled', async () => {
      // Arrange
      const cancelledBill = { ...mockBill, cancelledAt: new Date() };
      prismaMock.bill.findUnique.mockResolvedValue(cancelledBill);

      // Act
      const result = await billService.getBill('bill-id');

      // Assert
      expect(result.canBePaid).toBe(false);
    });

    it('should include computed field canBeCancelled = true when unpaid and no payments', async () => {
      // Arrange
      const unpaidBill = { ...mockBill, paidAmount: 0, status: 'Unpaid' };
      prismaMock.bill.findUnique.mockResolvedValue(unpaidBill);

      // Act
      const result = await billService.getBill('bill-id');

      // Assert
      expect(result.canBeCancelled).toBe(true);
    });

    it('should include computed field canBeCancelled = false when has payments', async () => {
      // Arrange
      prismaMock.bill.findUnique.mockResolvedValue(mockBill); // paidAmount: 20000

      // Act
      const result = await billService.getBill('bill-id');

      // Assert
      expect(result.canBeCancelled).toBe(false);
    });

    it('should throw ValidationError if bill not found', async () => {
      // Arrange
      prismaMock.bill.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(billService.getBill('nonexistent-id'))
        .rejects
        .toThrow('Bill not found');
    });
  });

  // ===========================
  // getBills Tests
  // ===========================

  describe('getBills', () => {

    const mockBills = [
      {
        id: 'bill-1',
        billNumber: 'BILL-202501-0001',
        total: 50000,
        paidAmount: 0,
        status: 'Unpaid',
        vendorId: 'vendor-1',
        billDate: new Date('2025-01-15'),
        vendor: {},
        purchaseOrder: {},
        _count: { payments: 0 }
      },
      {
        id: 'bill-2',
        billNumber: 'BILL-202501-0002',
        total: 30000,
        paidAmount: 15000,
        status: 'Partial',
        vendorId: 'vendor-2',
        billDate: new Date('2025-01-16'),
        vendor: {},
        purchaseOrder: {},
        _count: { payments: 1 }
      }
    ];

    it('should return all bills if no filters', async () => {
      // Arrange
      prismaMock.bill.findMany.mockResolvedValue(mockBills);

      // Act
      const result = await billService.getBills();

      // Assert
      expect(result).toHaveLength(2);
      expect(prismaMock.bill.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, cancelledAt: null },
        include: expect.any(Object),
        orderBy: { billDate: 'desc' }
      });
    });

    it('should filter by vendorId', async () => {
      // Arrange
      prismaMock.bill.findMany.mockResolvedValue([mockBills[0]]);

      // Act
      const result = await billService.getBills({ vendorId: 'vendor-1' });

      // Assert
      expect(prismaMock.bill.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, cancelledAt: null, vendorId: 'vendor-1' },
        include: expect.any(Object),
        orderBy: { billDate: 'desc' }
      });
    });

    it('should filter by single status', async () => {
      // Arrange
      prismaMock.bill.findMany.mockResolvedValue([mockBills[0]]);

      // Act
      const result = await billService.getBills({ status: 'Unpaid' });

      // Assert
      expect(prismaMock.bill.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, cancelledAt: null, status: 'Unpaid' },
        include: expect.any(Object),
        orderBy: { billDate: 'desc' }
      });
    });

    it('should filter by comma-separated statuses', async () => {
      // Arrange
      prismaMock.bill.findMany.mockResolvedValue(mockBills);

      // Act
      const result = await billService.getBills({ status: 'Unpaid,Partial' });

      // Assert
      expect(prismaMock.bill.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, cancelledAt: null, status: { in: ['Unpaid', 'Partial'] } },
        include: expect.any(Object),
        orderBy: { billDate: 'desc' }
      });
    });

    it('should filter by date range', async () => {
      // Arrange
      prismaMock.bill.findMany.mockResolvedValue(mockBills);

      // Act
      const result = await billService.getBills({
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31'
      });

      // Assert
      expect(prismaMock.bill.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          cancelledAt: null,
          billDate: {
            gte: new Date('2025-01-01'),
            lte: new Date('2025-01-31')
          }
        },
        include: expect.any(Object),
        orderBy: { billDate: 'desc' }
      });
    });

    it('should exclude cancelled and deleted bills', async () => {
      // Arrange
      prismaMock.bill.findMany.mockResolvedValue(mockBills);

      // Act
      await billService.getBills();

      // Assert
      expect(prismaMock.bill.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, cancelledAt: null },
        include: expect.any(Object),
        orderBy: { billDate: 'desc' }
      });
    });

    it('should include computed field remainingAmount', async () => {
      // Arrange
      prismaMock.bill.findMany.mockResolvedValue(mockBills);

      // Act
      const result = await billService.getBills();

      // Assert
      expect(result[0]).toHaveProperty('remainingAmount', 50000); // 50000 - 0
      expect(result[1]).toHaveProperty('remainingAmount', 15000); // 30000 - 15000
    });

    it('should include computed field canBePaid', async () => {
      // Arrange
      prismaMock.bill.findMany.mockResolvedValue(mockBills);

      // Act
      const result = await billService.getBills();

      // Assert
      expect(result[0]).toHaveProperty('canBePaid', true);
      expect(result[1]).toHaveProperty('canBePaid', true);
    });
  });

  // ===========================
  // updateBill Tests
  // ===========================

  describe('updateBill', () => {

    const mockBill = {
      id: 'bill-id',
      billNumber: 'BILL-202501-0001',
      purchaseOrderId: 'po-id',
      total: 50000,
      subtotal: 45000,
      taxAmount: 5000,
      paidAmount: 0,
      status: 'Unpaid',
      billDate: new Date('2025-01-15'),
      dueDate: new Date('2025-02-15')
    };

    const updates = {
      subtotal: 40000,
      taxAmount: 4000,
      total: 44000
    };

    it('should update unpaid bill with no payments', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.bill.update.mockResolvedValue({
        ...mockBill,
        ...updates
      });
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      const result = await billService.updateBill('bill-id', updates, 'user-id');

      // Assert
      expect(result).toEqual(expect.objectContaining(updates));
      expect(prismaMock.bill.update).toHaveBeenCalled();
    });

    it('should throw ValidationError if status is not Unpaid', async () => {
      // Arrange
      const partialBill = { ...mockBill, status: 'Partial' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([partialBill]);

      // Act & Assert
      await expect(billService.updateBill('bill-id', updates, 'user-id'))
        .rejects
        .toThrow('Can only update unpaid bills');
    });

    it('should throw ValidationError if bill has payments', async () => {
      // Arrange
      const billWithPayments = { ...mockBill, paidAmount: 10000 };
      prismaMock.$queryRawUnsafe.mockResolvedValue([billWithPayments]);

      // Act & Assert
      await expect(billService.updateBill('bill-id', updates, 'user-id'))
        .rejects
        .toThrow('Cannot update bill with payments');
    });

    it('should create audit trail', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockBill]);
      prismaMock.bill.update.mockResolvedValue({
        ...mockBill,
        ...updates
      });
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.updateBill('bill-id', updates, 'user-id');

      // Assert
      expect(prismaMock.pOBillAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          purchaseOrderId: 'po-id',
          billId: 'bill-id',
          action: 'BILL_UPDATED',
          beforeState: {
            total: 50000,
            subtotal: 45000,
            taxAmount: 5000
          },
          afterState: {
            total: 44000,
            subtotal: 40000,
            taxAmount: 4000
          },
          performedBy: 'user-id'
        })
      });
    });
  });

  // ===========================
  // Concurrency Tests
  // ===========================

  describe('Concurrency and Race Conditions', () => {

    const mockPO = {
      id: 'po-id',
      poNumber: 'PO-202501-0001',
      vendorId: 'vendor-id',
      total: 100000,
      billedAmount: 0,
      status: 'Sent'
    };

    const mockVendor = {
      id: 'vendor-id',
      currentBalance: 0
    };

    const mockBillData = {
      purchaseOrderId: 'po-id',
      vendorId: 'vendor-id',
      subtotal: 45000,
      taxAmount: 5000,
      total: 50000
    };

    it('should handle concurrent bill creation against same PO', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.bill.create.mockResolvedValue({
        id: 'bill-id',
        billNumber: 'BILL-202501-0001'
      });
      prismaMock.purchaseOrder.update.mockResolvedValue({});
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.vendorLedger.create.mockResolvedValue({});
      prismaMock.vendor.update.mockResolvedValue({});
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await billService.createBill(mockBillData, 'user-id');

      // Assert
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE NOWAIT'),
        'po-id'
      );
    });

    it('should prevent exceeding PO total with locking', async () => {
      // Arrange
      const nearlyFullPO = { ...mockPO, billedAmount: 95000 };
      prismaMock.$queryRawUnsafe.mockResolvedValue([nearlyFullPO]);

      const excessBill = { ...mockBillData, total: 10000 };

      // Act & Assert
      await expect(billService.createBill(excessBill, 'user-id'))
        .rejects
        .toThrow(InsufficientBalanceError);
    });
  });
});
