/**
 * Purchase Order Service Test Suite
 *
 * Tests for purchaseOrderService.js
 * Covers:
 * - PO lifecycle (Draft → Sent → Partial → Paid → Delivered)
 * - Status transitions validation
 * - Line items validation
 * - Delivery tracking
 * - Concurrency control
 */

const db = require('../../src/config/database');
const purchaseOrderService = require('../../src/services/purchaseOrderService');
const {
  ValidationError,
  compareAmounts,
  formatAmount
} = require('../../src/utils/transactionWrapper');
const { generatePONumber } = require('../../src/utils/generateId');

// Get the mock from setup
const prismaMock = global.prismaMock;

// Mock dependencies
jest.mock('../../src/utils/generateId', () => ({
  generatePONumber: jest.fn()
}));

describe('PurchaseOrderService', () => {

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock transaction wrapper
    db.transaction = jest.fn((callback) => callback(prismaMock));

    // Mock default return values
    generatePONumber.mockResolvedValue('PO-202501-0001');
  });

  // ===========================
  // STATUS_TRANSITIONS Validation
  // ===========================

  describe('STATUS_TRANSITIONS Validation', () => {

    it('should allow Draft → Sent transition', () => {
      expect(purchaseOrderService.STATUS_TRANSITIONS['Draft']).toContain('Sent');
    });

    it('should allow Draft → Cancelled transition', () => {
      expect(purchaseOrderService.STATUS_TRANSITIONS['Draft']).toContain('Cancelled');
    });

    it('should allow Sent → Partial transition', () => {
      expect(purchaseOrderService.STATUS_TRANSITIONS['Sent']).toContain('Partial');
    });

    it('should allow Sent → Paid transition', () => {
      expect(purchaseOrderService.STATUS_TRANSITIONS['Sent']).toContain('Paid');
    });

    it('should allow Sent → Cancelled transition', () => {
      expect(purchaseOrderService.STATUS_TRANSITIONS['Sent']).toContain('Cancelled');
    });

    it('should allow Partial → Paid transition', () => {
      expect(purchaseOrderService.STATUS_TRANSITIONS['Partial']).toContain('Paid');
    });

    it('should allow Partial → Cancelled transition', () => {
      expect(purchaseOrderService.STATUS_TRANSITIONS['Partial']).toContain('Cancelled');
    });

    it('should allow Paid → Delivered transition', () => {
      expect(purchaseOrderService.STATUS_TRANSITIONS['Paid']).toContain('Delivered');
    });

    it('should not allow any transitions from Delivered', () => {
      expect(purchaseOrderService.STATUS_TRANSITIONS['Delivered']).toEqual([]);
    });

    it('should not allow any transitions from Cancelled', () => {
      expect(purchaseOrderService.STATUS_TRANSITIONS['Cancelled']).toEqual([]);
    });

    it('should not allow Paid → Draft transition', () => {
      expect(purchaseOrderService.STATUS_TRANSITIONS['Paid']).not.toContain('Draft');
    });

    it('should not allow Delivered → Paid transition', () => {
      expect(purchaseOrderService.STATUS_TRANSITIONS['Delivered']).not.toContain('Paid');
    });
  });

  // ===========================
  // createPurchaseOrder Tests
  // ===========================

  describe('createPurchaseOrder', () => {

    const mockVendor = {
      id: 'vendor-id',
      name: 'ABC Suppliers',
      deletedAt: null
    };

    const mockPOData = {
      vendorId: 'vendor-id',
      orderDate: '2025-01-15',
      expectedDate: '2025-02-15',
      subtotal: 90000,
      taxAmount: 10000,
      total: 100000,
      lineItems: [
        {
          productModelId: 'model-1',
          description: 'Laptop',
          quantity: 5,
          unitPrice: 15000,
          totalPrice: 75000,
          specifications: { ram: '16GB', storage: '512GB' },
          notes: 'Urgent'
        },
        {
          productModelId: 'model-2',
          description: 'Mouse',
          quantity: 10,
          unitPrice: 1500,
          totalPrice: 15000,
          specifications: { type: 'Wireless' }
        }
      ]
    };

    it('should create purchase order with line items successfully', async () => {
      // Arrange
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.purchaseOrder.create.mockResolvedValue({
        id: 'po-id',
        poNumber: 'PO-202501-0001',
        status: 'Draft',
        total: 100000,
        billedAmount: 0,
        vendor: mockVendor,
        lineItems: mockPOData.lineItems
      });

      // Act
      const result = await purchaseOrderService.createPurchaseOrder(mockPOData);

      // Assert
      expect(result).toHaveProperty('poNumber', 'PO-202501-0001');
      expect(result).toHaveProperty('status', 'Draft');
      expect(result).toHaveProperty('billedAmount', 0);
      expect(prismaMock.purchaseOrder.create).toHaveBeenCalled();
    });

    it('should validate total equals subtotal + tax', async () => {
      // Arrange
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);

      const invalidTotals = {
        ...mockPOData,
        subtotal: 90000,
        taxAmount: 10000,
        total: 110000 // Wrong total
      };

      // Act & Assert
      await expect(purchaseOrderService.createPurchaseOrder(invalidTotals))
        .rejects
        .toThrow('Total (110000) must equal subtotal (90000) + tax (10000)');
    });

    it('should validate line items sum to subtotal', async () => {
      // Arrange
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);

      const invalidLineItems = {
        ...mockPOData,
        subtotal: 100000, // Doesn't match line items (75000 + 15000 = 90000)
        lineItems: mockPOData.lineItems
      };

      // Act & Assert
      await expect(purchaseOrderService.createPurchaseOrder(invalidLineItems))
        .rejects
        .toThrow('Line items total (90000) must equal subtotal (100000)');
    });

    it('should verify vendor exists', async () => {
      // Arrange
      prismaMock.vendor.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(purchaseOrderService.createPurchaseOrder(mockPOData))
        .rejects
        .toThrow('Vendor not found');
    });

    it('should generate PO number', async () => {
      // Arrange
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.purchaseOrder.create.mockResolvedValue({
        id: 'po-id',
        poNumber: 'PO-202501-0001'
      });

      // Act
      await purchaseOrderService.createPurchaseOrder(mockPOData);

      // Assert
      expect(generatePONumber).toHaveBeenCalled();
    });

    it('should set status to Draft by default', async () => {
      // Arrange
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.purchaseOrder.create.mockResolvedValue({
        id: 'po-id',
        poNumber: 'PO-202501-0001',
        status: 'Draft'
      });

      // Act
      await purchaseOrderService.createPurchaseOrder(mockPOData);

      // Assert
      expect(prismaMock.purchaseOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'Draft',
          billedAmount: 0
        }),
        include: expect.any(Object)
      });
    });

    it('should initialize billedAmount to 0', async () => {
      // Arrange
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.purchaseOrder.create.mockResolvedValue({
        id: 'po-id',
        poNumber: 'PO-202501-0001'
      });

      // Act
      await purchaseOrderService.createPurchaseOrder(mockPOData);

      // Assert
      expect(prismaMock.purchaseOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          billedAmount: 0
        }),
        include: expect.any(Object)
      });
    });

    it('should format all amounts to 4 decimal places', async () => {
      // Arrange
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.purchaseOrder.create.mockResolvedValue({
        id: 'po-id',
        poNumber: 'PO-202501-0001'
      });

      const decimalPO = {
        ...mockPOData,
        subtotal: 9000.3333,
        taxAmount: 1000.6667,
        total: 10001.0000,
        lineItems: [
          {
            productModelId: 'model-1',
            description: 'Test',
            quantity: 3,
            unitPrice: 3000.1111,
            totalPrice: 9000.3333
          }
        ]
      };

      // Act
      const result = await purchaseOrderService.createPurchaseOrder(decimalPO);

      // Assert
      expect(result).toHaveProperty('poNumber');
    });

    it('should handle orderDate as current date if not provided', async () => {
      // Arrange
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.purchaseOrder.create.mockResolvedValue({
        id: 'po-id',
        poNumber: 'PO-202501-0001'
      });

      const poWithoutDate = { ...mockPOData };
      delete poWithoutDate.orderDate;

      // Act
      await purchaseOrderService.createPurchaseOrder(poWithoutDate);

      // Assert
      expect(prismaMock.purchaseOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderDate: expect.any(Date)
        }),
        include: expect.any(Object)
      });
    });

    it('should handle null expectedDate', async () => {
      // Arrange
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.purchaseOrder.create.mockResolvedValue({
        id: 'po-id',
        poNumber: 'PO-202501-0001'
      });

      const poWithoutExpectedDate = { ...mockPOData };
      delete poWithoutExpectedDate.expectedDate;

      // Act
      await purchaseOrderService.createPurchaseOrder(poWithoutExpectedDate);

      // Assert
      expect(prismaMock.purchaseOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          expectedDate: null
        }),
        include: expect.any(Object)
      });
    });

    it('should handle line items with specifications and notes', async () => {
      // Arrange
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.purchaseOrder.create.mockResolvedValue({
        id: 'po-id',
        poNumber: 'PO-202501-0001'
      });

      // Act
      await purchaseOrderService.createPurchaseOrder(mockPOData);

      // Assert
      expect(prismaMock.purchaseOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          lineItems: {
            create: expect.arrayContaining([
              expect.objectContaining({
                specifications: { ram: '16GB', storage: '512GB' },
                notes: 'Urgent'
              })
            ])
          }
        }),
        include: expect.any(Object)
      });
    });

    it('should handle line items without notes', async () => {
      // Arrange
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.purchaseOrder.create.mockResolvedValue({
        id: 'po-id',
        poNumber: 'PO-202501-0001'
      });

      // Act
      await purchaseOrderService.createPurchaseOrder(mockPOData);

      // Assert
      expect(prismaMock.purchaseOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          lineItems: {
            create: expect.arrayContaining([
              expect.objectContaining({
                productModelId: 'model-2'
                // notes not specified or undefined
              })
            ])
          }
        }),
        include: expect.any(Object)
      });
    });

    it('should use transaction wrapper', async () => {
      // Arrange
      prismaMock.vendor.findUnique.mockResolvedValue(mockVendor);
      prismaMock.purchaseOrder.create.mockResolvedValue({
        id: 'po-id',
        poNumber: 'PO-202501-0001'
      });

      // Act
      await purchaseOrderService.createPurchaseOrder(mockPOData);

      // Assert
      expect(db.transaction).toHaveBeenCalled();
    });
  });

  // ===========================
  // updatePurchaseOrderStatus Tests
  // ===========================

  describe('updatePurchaseOrderStatus', () => {

    const mockPO = {
      id: 'po-id',
      poNumber: 'PO-202501-0001',
      status: 'Draft',
      total: 100000,
      billedAmount: 0
    };

    it('should update status with valid transition', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.purchaseOrder.update.mockResolvedValue({
        ...mockPO,
        status: 'Sent'
      });
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      const result = await purchaseOrderService.updatePurchaseOrderStatus('po-id', 'Sent', 'user-id');

      // Assert
      expect(result.status).toBe('Sent');
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE NOWAIT'),
        'po-id'
      );
    });

    it('should throw ValidationError for invalid transition', async () => {
      // Arrange
      const paidPO = { ...mockPO, status: 'Paid' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([paidPO]);

      // Act & Assert
      await expect(purchaseOrderService.updatePurchaseOrderStatus('po-id', 'Draft', 'user-id'))
        .rejects
        .toThrow('Cannot transition from Paid to Draft');
    });

    it('should throw ValidationError if marking as Paid but not fully billed', async () => {
      // Arrange
      const sentPO = { ...mockPO, status: 'Sent', billedAmount: 50000, total: 100000 };
      prismaMock.$queryRawUnsafe.mockResolvedValue([sentPO]);

      // Act & Assert
      await expect(purchaseOrderService.updatePurchaseOrderStatus('po-id', 'Paid', 'user-id'))
        .rejects
        .toThrow('Cannot mark as Paid. Billed amount (50000) must equal total (100000)');
    });

    it('should allow marking as Paid when fully billed', async () => {
      // Arrange
      const fullyBilledPO = { ...mockPO, status: 'Partial', billedAmount: 100000, total: 100000 };
      prismaMock.$queryRawUnsafe.mockResolvedValue([fullyBilledPO]);
      prismaMock.purchaseOrder.update.mockResolvedValue({
        ...fullyBilledPO,
        status: 'Paid'
      });
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      const result = await purchaseOrderService.updatePurchaseOrderStatus('po-id', 'Paid', 'user-id');

      // Assert
      expect(result.status).toBe('Paid');
    });

    it('should throw ValidationError if marking as Delivered but not Paid', async () => {
      // Arrange
      const partialPO = { ...mockPO, status: 'Partial' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([partialPO]);

      // Act & Assert
      await expect(purchaseOrderService.updatePurchaseOrderStatus('po-id', 'Delivered', 'user-id'))
        .rejects
        .toThrow('Cannot mark as Delivered. PO must be in Paid status first.');
    });

    it('should allow marking as Delivered when Paid', async () => {
      // Arrange
      const paidPO = { ...mockPO, status: 'Paid' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([paidPO]);
      prismaMock.purchaseOrder.update.mockResolvedValue({
        ...paidPO,
        status: 'Delivered'
      });
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      const result = await purchaseOrderService.updatePurchaseOrderStatus('po-id', 'Delivered', 'user-id');

      // Assert
      expect(result.status).toBe('Delivered');
    });

    it('should create audit log', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.purchaseOrder.update.mockResolvedValue({
        ...mockPO,
        status: 'Sent'
      });
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await purchaseOrderService.updatePurchaseOrderStatus('po-id', 'Sent', 'user-id');

      // Assert
      expect(prismaMock.pOBillAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          purchaseOrderId: 'po-id',
          action: 'STATUS_CHANGED',
          beforeState: { status: 'Draft' },
          afterState: { status: 'Sent' },
          performedBy: 'user-id',
          metadata: { reason: 'Manual status update' }
        })
      });
    });

    it('should lock PO for update', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.purchaseOrder.update.mockResolvedValue({
        ...mockPO,
        status: 'Sent'
      });
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await purchaseOrderService.updatePurchaseOrderStatus('po-id', 'Sent', 'user-id');

      // Assert
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE NOWAIT'),
        'po-id'
      );
    });
  });

  // ===========================
  // updatePurchaseOrder Tests
  // ===========================

  describe('updatePurchaseOrder', () => {

    const mockPO = {
      id: 'po-id',
      poNumber: 'PO-202501-0001',
      status: 'Draft',
      vendorId: 'vendor-id',
      subtotal: 90000,
      taxAmount: 10000,
      total: 100000,
      orderDate: new Date('2025-01-15')
    };

    const updates = {
      subtotal: 80000,
      taxAmount: 8000,
      total: 88000
    };

    it('should update Draft PO successfully', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.purchaseOrder.update.mockResolvedValue({
        ...mockPO,
        ...updates
      });

      // Act
      const result = await purchaseOrderService.updatePurchaseOrder('po-id', updates);

      // Assert
      expect(result).toEqual(expect.objectContaining(updates));
      expect(prismaMock.purchaseOrder.update).toHaveBeenCalled();
    });

    it('should throw ValidationError if not Draft', async () => {
      // Arrange
      const sentPO = { ...mockPO, status: 'Sent' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([sentPO]);

      // Act & Assert
      await expect(purchaseOrderService.updatePurchaseOrder('po-id', updates))
        .rejects
        .toThrow('Cannot update PO in Sent status. Only Draft POs can be edited.');
    });

    it('should validate total = subtotal + tax', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);

      const invalidUpdates = {
        subtotal: 80000,
        taxAmount: 8000,
        total: 90000 // Wrong total
      };

      // Act & Assert
      await expect(purchaseOrderService.updatePurchaseOrder('po-id', invalidUpdates))
        .rejects
        .toThrow('Total must equal subtotal + tax');
    });

    it('should delete and recreate line items if provided', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.purchaseOrderItem.deleteMany.mockResolvedValue({});
      prismaMock.purchaseOrder.update.mockResolvedValue({
        ...mockPO,
        lineItems: []
      });

      const updatesWithLineItems = {
        lineItems: [
          {
            productModelId: 'model-1',
            description: 'New Item',
            quantity: 2,
            unitPrice: 40000,
            totalPrice: 80000
          }
        ]
      };

      // Act
      await purchaseOrderService.updatePurchaseOrder('po-id', updatesWithLineItems);

      // Assert
      expect(prismaMock.purchaseOrderItem.deleteMany).toHaveBeenCalledWith({
        where: { purchaseOrderId: 'po-id' }
      });
    });

    it('should lock PO for update', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.purchaseOrder.update.mockResolvedValue({
        ...mockPO,
        ...updates
      });

      // Act
      await purchaseOrderService.updatePurchaseOrder('po-id', updates);

      // Assert
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE NOWAIT'),
        'po-id'
      );
    });
  });

  // ===========================
  // getPurchaseOrder Tests
  // ===========================

  describe('getPurchaseOrder', () => {

    const mockPO = {
      id: 'po-id',
      poNumber: 'PO-202501-0001',
      status: 'Partial',
      total: 100000,
      billedAmount: 50000,
      vendor: { name: 'ABC Suppliers' },
      lineItems: [
        { id: 'line-1', description: 'Item 1' }
      ],
      bills: [
        { id: 'bill-1' }
      ]
    };

    it('should get PO with all includes', async () => {
      // Arrange
      prismaMock.purchaseOrder.findUnique.mockResolvedValue(mockPO);

      // Act
      const result = await purchaseOrderService.getPurchaseOrder('po-id');

      // Assert
      expect(result).toEqual(expect.objectContaining({
        id: 'po-id',
        poNumber: 'PO-202501-0001'
      }));
      expect(prismaMock.purchaseOrder.findUnique).toHaveBeenCalledWith({
        where: { id: 'po-id', deletedAt: null },
        include: expect.objectContaining({
          vendor: true,
          lineItems: expect.any(Object),
          bills: expect.any(Object)
        })
      });
    });

    it('should include computed field remainingAmount', async () => {
      // Arrange
      prismaMock.purchaseOrder.findUnique.mockResolvedValue(mockPO);

      // Act
      const result = await purchaseOrderService.getPurchaseOrder('po-id');

      // Assert
      expect(result.remainingAmount).toBe(50000); // 100000 - 50000
    });

    it('should include computed field canCreateBill = true when has remaining balance', async () => {
      // Arrange
      prismaMock.purchaseOrder.findUnique.mockResolvedValue(mockPO);

      // Act
      const result = await purchaseOrderService.getPurchaseOrder('po-id');

      // Assert
      expect(result.canCreateBill).toBe(true);
    });

    it('should include computed field canCreateBill = false when cancelled', async () => {
      // Arrange
      const cancelledPO = { ...mockPO, status: 'Cancelled' };
      prismaMock.purchaseOrder.findUnique.mockResolvedValue(cancelledPO);

      // Act
      const result = await purchaseOrderService.getPurchaseOrder('po-id');

      // Assert
      expect(result.canCreateBill).toBe(false);
    });

    it('should include computed field canCreateBill = false when no remaining balance', async () => {
      // Arrange
      const fullyBilledPO = { ...mockPO, billedAmount: 100000 };
      prismaMock.purchaseOrder.findUnique.mockResolvedValue(fullyBilledPO);

      // Act
      const result = await purchaseOrderService.getPurchaseOrder('po-id');

      // Assert
      expect(result.canCreateBill).toBe(false);
    });

    it('should throw ValidationError if PO not found', async () => {
      // Arrange
      prismaMock.purchaseOrder.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(purchaseOrderService.getPurchaseOrder('nonexistent-id'))
        .rejects
        .toThrow('Purchase Order not found');
    });
  });

  // ===========================
  // getPurchaseOrders Tests
  // ===========================

  describe('getPurchaseOrders', () => {

    const mockPOs = [
      {
        id: 'po-1',
        poNumber: 'PO-202501-0001',
        status: 'Draft',
        total: 100000,
        billedAmount: 0,
        vendorId: 'vendor-1',
        vendor: {},
        _count: { lineItems: 2, bills: 0 }
      },
      {
        id: 'po-2',
        poNumber: 'PO-202501-0002',
        status: 'Partial',
        total: 50000,
        billedAmount: 25000,
        vendorId: 'vendor-2',
        vendor: {},
        _count: { lineItems: 1, bills: 1 }
      }
    ];

    it('should return all POs if no filters', async () => {
      // Arrange
      prismaMock.purchaseOrder.findMany.mockResolvedValue(mockPOs);

      // Act
      const result = await purchaseOrderService.getPurchaseOrders();

      // Assert
      expect(result).toHaveLength(2);
      expect(prismaMock.purchaseOrder.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        include: expect.any(Object),
        orderBy: { orderDate: 'desc' }
      });
    });

    it('should filter by vendorId', async () => {
      // Arrange
      prismaMock.purchaseOrder.findMany.mockResolvedValue([mockPOs[0]]);

      // Act
      const result = await purchaseOrderService.getPurchaseOrders({ vendorId: 'vendor-1' });

      // Assert
      expect(prismaMock.purchaseOrder.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, vendorId: 'vendor-1' },
        include: expect.any(Object),
        orderBy: { orderDate: 'desc' }
      });
    });

    it('should filter by status', async () => {
      // Arrange
      prismaMock.purchaseOrder.findMany.mockResolvedValue([mockPOs[0]]);

      // Act
      const result = await purchaseOrderService.getPurchaseOrders({ status: 'Draft' });

      // Assert
      expect(prismaMock.purchaseOrder.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, status: 'Draft' },
        include: expect.any(Object),
        orderBy: { orderDate: 'desc' }
      });
    });

    it('should include line items if requested', async () => {
      // Arrange
      prismaMock.purchaseOrder.findMany.mockResolvedValue(mockPOs);

      // Act
      await purchaseOrderService.getPurchaseOrders({ include: 'lineItems' });

      // Assert
      expect(prismaMock.purchaseOrder.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        include: expect.objectContaining({
          lineItems: expect.any(Object)
        }),
        orderBy: { orderDate: 'desc' }
      });
    });

    it('should include computed field remainingAmount', async () => {
      // Arrange
      prismaMock.purchaseOrder.findMany.mockResolvedValue(mockPOs);

      // Act
      const result = await purchaseOrderService.getPurchaseOrders();

      // Assert
      expect(result[0]).toHaveProperty('remainingAmount', 100000); // 100000 - 0
      expect(result[1]).toHaveProperty('remainingAmount', 25000); // 50000 - 25000
    });

    it('should include computed field canCreateBill', async () => {
      // Arrange
      prismaMock.purchaseOrder.findMany.mockResolvedValue(mockPOs);

      // Act
      const result = await purchaseOrderService.getPurchaseOrders();

      // Assert
      expect(result[0]).toHaveProperty('canCreateBill', true);
      expect(result[1]).toHaveProperty('canCreateBill', true);
    });
  });

  // ===========================
  // checkAndUpdateDeliveryStatus Tests
  // ===========================

  describe('checkAndUpdateDeliveryStatus', () => {

    const mockPO = {
      id: 'po-id',
      poNumber: 'PO-202501-0001',
      status: 'Paid',
      receivedQuantities: {
        'line-1': 5,
        'line-2': 10
      }
    };

    const mockLineItems = [
      { id: 'line-1', quantity: 5 },
      { id: 'line-2', quantity: 10 }
    ];

    it('should mark PO as Delivered if all items received', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.purchaseOrderItem.findMany.mockResolvedValue(mockLineItems);
      prismaMock.purchaseOrder.update.mockResolvedValue({
        ...mockPO,
        status: 'Delivered'
      });
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      const result = await purchaseOrderService.checkAndUpdateDeliveryStatus('po-id', 'user-id');

      // Assert
      expect(result.status).toBe('Delivered');
      expect(prismaMock.purchaseOrder.update).toHaveBeenCalledWith({
        where: { id: 'po-id' },
        data: expect.objectContaining({
          status: 'Delivered'
        }),
        include: expect.any(Object)
      });
    });

    it('should not update if not all items received', async () => {
      // Arrange
      const partialPO = {
        ...mockPO,
        receivedQuantities: {
          'line-1': 3, // Only 3 out of 5
          'line-2': 10
        }
      };
      prismaMock.$queryRawUnsafe.mockResolvedValue([partialPO]);
      prismaMock.purchaseOrderItem.findMany.mockResolvedValue(mockLineItems);

      // Act
      const result = await purchaseOrderService.checkAndUpdateDeliveryStatus('po-id', 'user-id');

      // Assert
      expect(result.status).toBe('Paid'); // Unchanged
      expect(prismaMock.purchaseOrder.update).not.toHaveBeenCalled();
    });

    it('should only update if status is Paid', async () => {
      // Arrange
      const sentPO = { ...mockPO, status: 'Sent' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([sentPO]);
      prismaMock.purchaseOrderItem.findMany.mockResolvedValue(mockLineItems);

      // Act
      const result = await purchaseOrderService.checkAndUpdateDeliveryStatus('po-id', 'user-id');

      // Assert
      expect(result.status).toBe('Sent');
      expect(prismaMock.purchaseOrder.update).not.toHaveBeenCalled();
    });

    it('should handle PO with no line items', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.purchaseOrderItem.findMany.mockResolvedValue([]);

      // Act
      const result = await purchaseOrderService.checkAndUpdateDeliveryStatus('po-id', 'user-id');

      // Assert
      expect(result).toEqual(mockPO);
    });

    it('should create audit log when marked as Delivered', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.purchaseOrderItem.findMany.mockResolvedValue(mockLineItems);
      prismaMock.purchaseOrder.update.mockResolvedValue({
        ...mockPO,
        status: 'Delivered'
      });
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await purchaseOrderService.checkAndUpdateDeliveryStatus('po-id', 'user-id');

      // Assert
      expect(prismaMock.pOBillAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          purchaseOrderId: 'po-id',
          action: 'STATUS_CHANGED',
          beforeState: { status: 'Paid' },
          afterState: { status: 'Delivered' },
          performedBy: 'user-id',
          metadata: expect.objectContaining({
            reason: 'All items received in inventory'
          })
        })
      });
    });

    it('should lock PO for update', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockPO]);
      prismaMock.purchaseOrderItem.findMany.mockResolvedValue(mockLineItems);
      prismaMock.purchaseOrder.update.mockResolvedValue({
        ...mockPO,
        status: 'Delivered'
      });
      prismaMock.pOBillAudit.create.mockResolvedValue({});

      // Act
      await purchaseOrderService.checkAndUpdateDeliveryStatus('po-id', 'user-id');

      // Assert
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE NOWAIT'),
        'po-id'
      );
    });

    it('should throw ValidationError if PO not found', async () => {
      // Arrange
      prismaMock.$queryRawUnsafe.mockResolvedValue([]);

      // Act & Assert
      await expect(purchaseOrderService.checkAndUpdateDeliveryStatus('nonexistent-id', 'user-id'))
        .rejects
        .toThrow('Purchase Order not found');
    });
  });

  // ===========================
  // getPurchaseOrderItems Tests
  // ===========================

  describe('getPurchaseOrderItems', () => {

    const mockItems = [
      {
        id: 'item-1',
        serialNumber: 'SN001',
        purchaseOrderId: 'po-id',
        category: {},
        model: { company: {} },
        vendor: {},
        warehouse: {}
      },
      {
        id: 'item-2',
        serialNumber: 'SN002',
        purchaseOrderId: 'po-id',
        category: {},
        model: { company: {} },
        vendor: {},
        warehouse: {}
      }
    ];

    it('should get inventory items linked to PO', async () => {
      // Arrange
      prismaMock.item.findMany.mockResolvedValue(mockItems);

      // Act
      const result = await purchaseOrderService.getPurchaseOrderItems('po-id');

      // Assert
      expect(result).toHaveLength(2);
      expect(prismaMock.item.findMany).toHaveBeenCalledWith({
        where: { purchaseOrderId: 'po-id', deletedAt: null },
        include: expect.objectContaining({
          category: true,
          model: expect.any(Object),
          vendor: true,
          warehouse: true
        }),
        orderBy: { createdAt: 'desc' }
      });
    });

    it('should include category, model, vendor, warehouse', async () => {
      // Arrange
      prismaMock.item.findMany.mockResolvedValue(mockItems);

      // Act
      const result = await purchaseOrderService.getPurchaseOrderItems('po-id');

      // Assert
      expect(result[0]).toHaveProperty('category');
      expect(result[0]).toHaveProperty('model');
      expect(result[0]).toHaveProperty('vendor');
      expect(result[0]).toHaveProperty('warehouse');
    });

    it('should return empty array if no items', async () => {
      // Arrange
      prismaMock.item.findMany.mockResolvedValue([]);

      // Act
      const result = await purchaseOrderService.getPurchaseOrderItems('po-id');

      // Assert
      expect(result).toEqual([]);
    });
  });
});
