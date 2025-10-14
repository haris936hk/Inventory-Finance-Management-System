/**
 * Comprehensive Test Suite for inventoryLifecycleService.js
 *
 * Coverage:
 * - State Machine Transitions: Available → Reserved → Sold → Delivered
 * - Reserve Items: Validation, race conditions, locking
 * - Release Items: Invoice cancellation, status rollback
 * - Mark as Sold: Payment processing, status updates
 * - Mark as Delivered: Delivery tracking, handover details
 * - Cleanup: Expired reservations, orphaned records
 * - Status History: Audit trail, change tracking
 * - Edge Cases: Invalid transitions, missing items, concurrency
 */

const inventoryLifecycleService = require('../../src/services/inventoryLifecycleService');
const db = require('../../src/config/database');

describe('InventoryLifecycleService - State Machine Validation', () => {
  describe('validateStatusTransition', () => {
    it('should allow valid transitions', () => {
      expect(() => inventoryLifecycleService.validateStatusTransition('Available', 'Reserved')).not.toThrow();
      expect(() => inventoryLifecycleService.validateStatusTransition('Available', 'Sold')).not.toThrow();
      expect(() => inventoryLifecycleService.validateStatusTransition('Reserved', 'Available')).not.toThrow();
      expect(() => inventoryLifecycleService.validateStatusTransition('Reserved', 'Sold')).not.toThrow();
      expect(() => inventoryLifecycleService.validateStatusTransition('Sold', 'Delivered')).not.toThrow();
    });

    it('should reject invalid transitions', () => {
      expect(() => inventoryLifecycleService.validateStatusTransition('Delivered', 'Sold'))
        .toThrow('Invalid inventory status transition');
      expect(() => inventoryLifecycleService.validateStatusTransition('Delivered', 'Available'))
        .toThrow('Invalid inventory status transition');
      expect(() => inventoryLifecycleService.validateStatusTransition('Sold', 'Available'))
        .toThrow('Invalid inventory status transition');
    });

    it('should reject transition from undefined status', () => {
      expect(() => inventoryLifecycleService.validateStatusTransition(undefined, 'Reserved'))
        .toThrow('Invalid inventory status transition');
    });
  });
});

describe('InventoryLifecycleService - Reserve Items for Invoice', () => {
  beforeEach(() => {
    // Mock db.transaction to execute callback immediately with prismaMock
    // Mock both db.transaction wrapper AND db.prisma.$transaction
    db.transaction = jest.fn(async (callback) => {
      return await callback(prismaMock);
    });
    db.prisma.$transaction = jest.fn(async (callback) => {
      return await callback(prismaMock);
    });
    prismaMock.$executeRaw = jest.fn();
  });

  it('should reserve multiple items successfully', async () => {
    const itemIds = ['item-1', 'item-2', 'item-3'];
    const invoiceId = global.testData.invoiceId;
    const userId = global.testData.userId;

    const mockItems = itemIds.map((id, index) => ({
      id,
      serialNumber: `ELEC-2025-000${index + 1}`,
      inventoryStatus: 'Available',
      deletedAt: null
    }));

    prismaMock.item.findMany.mockResolvedValue(mockItems);

    // Mock update calls for each item
    prismaMock.item.update.mockImplementation(({ where }) => {
      const item = mockItems.find(i => i.id === where.id);
      return Promise.resolve({
        ...item,
        inventoryStatus: 'Reserved',
        reservedAt: new Date(),
        reservedBy: userId,
        reservedForId: invoiceId
      });
    });

    // Mock history creation
    prismaMock.inventoryStatusHistory.create.mockResolvedValue({
      id: 'history-1',
      fromStatus: 'Available',
      toStatus: 'Reserved'
    });

    const result = await inventoryLifecycleService.reserveItemsForInvoice(itemIds, invoiceId, userId);

    expect(result).toHaveProperty('reservedItems');
    expect(result).toHaveProperty('historyEntries');
    expect(result.reservationCount).toBe(3);
    expect(result.invoiceId).toBe(invoiceId);
    expect(prismaMock.item.update).toHaveBeenCalledTimes(3);
    expect(prismaMock.inventoryStatusHistory.create).toHaveBeenCalledTimes(3);
  });

  it('should throw error if no item IDs provided', async () => {
    await expect(inventoryLifecycleService.reserveItemsForInvoice([], 'invoice-id', 'user-id'))
      .rejects
      .toThrow('Item IDs are required');

    await expect(inventoryLifecycleService.reserveItemsForInvoice(null, 'invoice-id', 'user-id'))
      .rejects
      .toThrow('Item IDs are required');
  });

  it('should throw error if some items not found', async () => {
    const itemIds = ['item-1', 'item-2', 'item-3'];
    const foundItems = [
      { id: 'item-1', inventoryStatus: 'Available', deletedAt: null },
      { id: 'item-2', inventoryStatus: 'Available', deletedAt: null }
    ];

    prismaMock.item.findMany.mockResolvedValue(foundItems);

    await expect(inventoryLifecycleService.reserveItemsForInvoice(itemIds, 'invoice-id', 'user-id'))
      .rejects
      .toThrow('Items not found: item-3');
  });

  it('should throw error if item already reserved', async () => {
    const itemIds = ['item-1', 'item-2'];
    const mockItems = [
      { id: 'item-1', serialNumber: 'ELEC-2025-0001', inventoryStatus: 'Available', deletedAt: null },
      { id: 'item-2', serialNumber: 'ELEC-2025-0002', inventoryStatus: 'Reserved', reservedForId: 'other-invoice', deletedAt: null }
    ];

    prismaMock.item.findMany.mockResolvedValue(mockItems);

    await expect(inventoryLifecycleService.reserveItemsForInvoice(itemIds, 'invoice-id', 'user-id'))
      .rejects
      .toThrow('Cannot reserve items. Invalid status');
  });

  it('should throw error if item already sold', async () => {
    const itemIds = ['item-1'];
    const mockItems = [
      { id: 'item-1', serialNumber: 'ELEC-2025-0001', inventoryStatus: 'Sold', deletedAt: null }
    ];

    prismaMock.item.findMany.mockResolvedValue(mockItems);

    await expect(inventoryLifecycleService.reserveItemsForInvoice(itemIds, 'invoice-id', 'user-id'))
      .rejects
      .toThrow('Cannot reserve items. Invalid status');
  });

  it('should order items by ID to prevent deadlocks', async () => {
    const itemIds = ['item-3', 'item-1', 'item-2'];
    const mockItems = [
      { id: 'item-1', inventoryStatus: 'Available', deletedAt: null },
      { id: 'item-2', inventoryStatus: 'Available', deletedAt: null },
      { id: 'item-3', inventoryStatus: 'Available', deletedAt: null }
    ];

    prismaMock.item.findMany.mockResolvedValue(mockItems);
    prismaMock.item.update.mockResolvedValue({ ...mockItems[0], inventoryStatus: 'Reserved' });
    prismaMock.inventoryStatusHistory.create.mockResolvedValue({});

    await inventoryLifecycleService.reserveItemsForInvoice(itemIds, 'invoice-id', 'user-id');

    expect(prismaMock.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { id: 'asc' }
      })
    );
  });

  it('should set permanent reservation (no expiry) for invoices', async () => {
    const itemIds = ['item-1'];
    const mockItems = [{ id: 'item-1', inventoryStatus: 'Available', deletedAt: null }];

    prismaMock.item.findMany.mockResolvedValue(mockItems);
    prismaMock.item.update.mockResolvedValue({
      ...mockItems[0],
      inventoryStatus: 'Reserved',
      reservationExpiry: null
    });
    prismaMock.inventoryStatusHistory.create.mockResolvedValue({});

    await inventoryLifecycleService.reserveItemsForInvoice(itemIds, 'invoice-id', 'user-id');

    expect(prismaMock.item.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reservationExpiry: null
        })
      })
    );
  });
});

describe('InventoryLifecycleService - Release Items (Cancel Invoice)', () => {
  beforeEach(() => {
    // Mock both db.transaction wrapper AND db.prisma.$transaction
    db.transaction = jest.fn(async (callback) => {
      return await callback(prismaMock);
    });
    db.prisma.$transaction = jest.fn(async (callback) => {
      return await callback(prismaMock);
    });
    prismaMock.$executeRaw = jest.fn();
  });

  it('should release reserved items when invoice cancelled', async () => {
    const invoiceId = global.testData.invoiceId;
    const userId = global.testData.userId;

    const mockReservedItems = [
      { id: 'item-1', serialNumber: 'ELEC-2025-0001', inventoryStatus: 'Reserved', reservedForId: invoiceId, deletedAt: null },
      { id: 'item-2', serialNumber: 'ELEC-2025-0002', inventoryStatus: 'Reserved', reservedForId: invoiceId, deletedAt: null }
    ];

    prismaMock.item.findMany.mockResolvedValue(mockReservedItems);
    prismaMock.item.update.mockImplementation(({ where }) => {
      const item = mockReservedItems.find(i => i.id === where.id);
      return Promise.resolve({
        ...item,
        inventoryStatus: 'Available',
        reservedAt: null,
        reservedBy: null,
        reservedForId: null
      });
    });
    prismaMock.inventoryStatusHistory.create.mockResolvedValue({});

    const result = await inventoryLifecycleService.releaseItemsForInvoiceCancellation(invoiceId, userId);

    expect(result.releaseCount).toBe(2);
    expect(result.invoiceId).toBe(invoiceId);
    expect(prismaMock.item.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.inventoryStatusHistory.create).toHaveBeenCalledTimes(2);
  });

  it('should handle no reserved items gracefully', async () => {
    prismaMock.item.findMany.mockResolvedValue([]);

    const result = await inventoryLifecycleService.releaseItemsForInvoiceCancellation('invoice-id', 'user-id');

    expect(result.releaseCount).toBe(0);
    expect(result.releasedItems).toEqual([]);
  });

  it('should only release items with matching invoice ID', async () => {
    const invoiceId = 'target-invoice';

    prismaMock.item.findMany.mockResolvedValue([]);

    await inventoryLifecycleService.releaseItemsForInvoiceCancellation(invoiceId, 'user-id');

    expect(prismaMock.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reservedForId: invoiceId,
          reservedForType: 'Invoice',
          inventoryStatus: 'Reserved'
        })
      })
    );
  });

  it('should clear all reservation fields when releasing', async () => {
    const mockReservedItems = [
      {
        id: 'item-1',
        inventoryStatus: 'Reserved',
        reservedAt: new Date(),
        reservedBy: 'user-id',
        reservedForId: 'invoice-id',
        reservationExpiry: new Date(),
        deletedAt: null
      }
    ];

    prismaMock.item.findMany.mockResolvedValue(mockReservedItems);
    prismaMock.item.update.mockResolvedValue({ id: 'item-1', inventoryStatus: 'Available' });
    prismaMock.inventoryStatusHistory.create.mockResolvedValue({});

    await inventoryLifecycleService.releaseItemsForInvoiceCancellation('invoice-id', 'user-id');

    expect(prismaMock.item.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inventoryStatus: 'Available',
          reservedAt: null,
          reservedBy: null,
          reservedForType: null,
          reservedForId: null,
          reservationExpiry: null
        })
      })
    );
  });
});

describe('InventoryLifecycleService - Mark Items as Sold', () => {
  beforeEach(() => {
    // Mock both db.transaction wrapper AND db.prisma.$transaction
    db.transaction = jest.fn(async (callback) => {
      return await callback(prismaMock);
    });
    db.prisma.$transaction = jest.fn(async (callback) => {
      return await callback(prismaMock);
    });
    prismaMock.$executeRaw = jest.fn();
  });

  it('should mark reserved items as sold when invoice paid', async () => {
    const invoiceId = global.testData.invoiceId;
    const userId = global.testData.userId;

    const mockReservedItems = [
      { id: 'item-1', inventoryStatus: 'Reserved', reservedForId: invoiceId, deletedAt: null },
      { id: 'item-2', inventoryStatus: 'Reserved', reservedForId: invoiceId, deletedAt: null }
    ];

    prismaMock.item.findMany.mockResolvedValue(mockReservedItems);
    prismaMock.item.update.mockImplementation(({ where }) => {
      const item = mockReservedItems.find(i => i.id === where.id);
      return Promise.resolve({
        ...item,
        inventoryStatus: 'Sold',
        status: 'Sold',
        outboundDate: expect.any(Date)
      });
    });
    prismaMock.inventoryStatusHistory.create.mockResolvedValue({});

    const result = await inventoryLifecycleService.markItemsAsSoldForInvoice(invoiceId, userId);

    expect(result.saleCount).toBe(2);
    expect(result.invoiceId).toBe(invoiceId);
    expect(prismaMock.item.update).toHaveBeenCalledTimes(2);
  });

  it('should update both inventoryStatus and physical status to Sold', async () => {
    const mockReservedItems = [
      { id: 'item-1', inventoryStatus: 'Reserved', status: 'In Store', reservedForId: 'invoice-id', deletedAt: null }
    ];

    prismaMock.item.findMany.mockResolvedValue(mockReservedItems);
    prismaMock.item.update.mockResolvedValue({ id: 'item-1', inventoryStatus: 'Sold', status: 'Sold' });
    prismaMock.inventoryStatusHistory.create.mockResolvedValue({});

    await inventoryLifecycleService.markItemsAsSoldForInvoice('invoice-id', 'user-id');

    expect(prismaMock.item.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inventoryStatus: 'Sold',
          status: 'Sold',
          outboundDate: expect.any(Date)
        })
      })
    );
  });

  it('should handle no reserved items gracefully', async () => {
    prismaMock.item.findMany.mockResolvedValue([]);

    const result = await inventoryLifecycleService.markItemsAsSoldForInvoice('invoice-id', 'user-id');

    expect(result.saleCount).toBe(0);
    expect(result.soldItems).toEqual([]);
  });

  it('should record change history with correct reason', async () => {
    const invoiceId = 'test-invoice';
    const mockReservedItems = [
      { id: 'item-1', inventoryStatus: 'Reserved', reservedForId: invoiceId, deletedAt: null }
    ];

    prismaMock.item.findMany.mockResolvedValue(mockReservedItems);
    prismaMock.item.update.mockResolvedValue({ id: 'item-1', inventoryStatus: 'Sold' });
    prismaMock.inventoryStatusHistory.create.mockResolvedValue({});

    await inventoryLifecycleService.markItemsAsSoldForInvoice(invoiceId, 'user-id');

    expect(prismaMock.inventoryStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: 'Reserved',
          toStatus: 'Sold',
          changeReason: 'INVOICE_PAID',
          referenceType: 'Invoice',
          referenceId: invoiceId
        })
      })
    );
  });
});

describe('InventoryLifecycleService - Mark Items as Delivered', () => {
  beforeEach(() => {
    // Mock both db.transaction wrapper AND db.prisma.$transaction
    db.transaction = jest.fn(async (callback) => {
      return await callback(prismaMock);
    });
    db.prisma.$transaction = jest.fn(async (callback) => {
      return await callback(prismaMock);
    });
    prismaMock.$executeRaw = jest.fn();
  });

  it('should mark sold items as delivered', async () => {
    const invoiceId = global.testData.invoiceId;
    const userId = global.testData.userId;
    const deliveryInfo = {
      handoverTo: 'John Doe',
      handoverToPhone: '1234567890',
      handoverDetails: 'Delivered to home address'
    };

    const mockSoldItems = [
      { id: 'item-1', inventoryStatus: 'Sold', reservedForId: invoiceId, deletedAt: null },
      { id: 'item-2', inventoryStatus: 'Sold', reservedForId: invoiceId, deletedAt: null }
    ];

    prismaMock.item.findMany.mockResolvedValue(mockSoldItems);
    prismaMock.item.update.mockImplementation(({ where }) => {
      const item = mockSoldItems.find(i => i.id === where.id);
      return Promise.resolve({
        ...item,
        inventoryStatus: 'Delivered',
        status: 'Delivered',
        handoverDate: new Date(),
        handoverTo: deliveryInfo.handoverTo
      });
    });
    prismaMock.inventoryStatusHistory.create.mockResolvedValue({});

    const result = await inventoryLifecycleService.markItemsAsDeliveredForInvoice(invoiceId, userId, deliveryInfo);

    expect(result.deliveryCount).toBe(2);
    expect(result.invoiceId).toBe(invoiceId);
    expect(prismaMock.item.update).toHaveBeenCalledTimes(2);
  });

  it('should throw error if no sold items found', async () => {
    prismaMock.item.findMany.mockResolvedValue([]);

    await expect(inventoryLifecycleService.markItemsAsDeliveredForInvoice('invoice-id', 'user-id', {}))
      .rejects
      .toThrow('No sold items found for Invoice invoice-id');
  });

  it('should include delivery information in item update', async () => {
    const deliveryInfo = {
      handoverTo: 'John Doe',
      handoverToPhone: '1234567890',
      handoverToNIC: '12345-1234567-1',
      handoverDetails: 'Signature received'
    };

    const mockSoldItems = [
      { id: 'item-1', inventoryStatus: 'Sold', deletedAt: null }
    ];

    prismaMock.item.findMany.mockResolvedValue(mockSoldItems);
    prismaMock.item.update.mockResolvedValue({ id: 'item-1', inventoryStatus: 'Delivered' });
    prismaMock.inventoryStatusHistory.create.mockResolvedValue({});

    await inventoryLifecycleService.markItemsAsDeliveredForInvoice('invoice-id', 'user-id', deliveryInfo);

    expect(prismaMock.item.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inventoryStatus: 'Delivered',
          status: 'Delivered',
          handoverDate: expect.any(Date),
          handoverTo: 'John Doe',
          handoverToPhone: '1234567890',
          handoverToNIC: '12345-1234567-1',
          handoverDetails: 'Signature received'
        })
      })
    );
  });

  it('should use userId for handoverBy if not provided in deliveryInfo', async () => {
    const userId = 'user-123';
    const mockSoldItems = [{ id: 'item-1', inventoryStatus: 'Sold', deletedAt: null }];

    prismaMock.item.findMany.mockResolvedValue(mockSoldItems);
    prismaMock.item.update.mockResolvedValue({ id: 'item-1', inventoryStatus: 'Delivered' });
    prismaMock.inventoryStatusHistory.create.mockResolvedValue({});

    await inventoryLifecycleService.markItemsAsDeliveredForInvoice('invoice-id', userId, {});

    expect(prismaMock.item.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          handoverBy: userId
        })
      })
    );
  });
});

describe('InventoryLifecycleService - Cleanup Expired Reservations', () => {
  beforeEach(() => {
    // Mock both db.transaction wrapper AND db.prisma.$transaction
    db.transaction = jest.fn(async (callback) => {
      return await callback(prismaMock);
    });
    db.prisma.$transaction = jest.fn(async (callback) => {
      return await callback(prismaMock);
    });
    prismaMock.$executeRaw = jest.fn();
  });

  it('should cleanup expired reservations', async () => {
    const expiredItems = [
      {
        id: 'item-1',
        inventoryStatus: 'Reserved',
        reservationExpiry: new Date('2024-12-31'),
        deletedAt: null
      },
      {
        id: 'item-2',
        inventoryStatus: 'Reserved',
        reservationExpiry: new Date('2024-12-30'),
        deletedAt: null
      }
    ];

    prismaMock.item.findMany.mockResolvedValue(expiredItems);
    prismaMock.item.update.mockImplementation(({ where }) => {
      const item = expiredItems.find(i => i.id === where.id);
      return Promise.resolve({
        ...item,
        inventoryStatus: 'Available',
        reservationExpiry: null
      });
    });
    prismaMock.inventoryStatusHistory.create.mockResolvedValue({});

    const result = await inventoryLifecycleService.cleanupExpiredReservations();

    expect(result.cleanedCount).toBe(2);
    expect(result.expiredItems).toHaveLength(2);
    expect(prismaMock.item.update).toHaveBeenCalledTimes(2);
  });

  it('should return zero count if no expired reservations', async () => {
    prismaMock.item.findMany.mockResolvedValue([]);

    const result = await inventoryLifecycleService.cleanupExpiredReservations();

    expect(result.cleanedCount).toBe(0);
    expect(result.expiredItems).toEqual([]);
  });

  it('should only cleanup items with expiry in the past', async () => {
    prismaMock.item.findMany.mockResolvedValue([]);

    await inventoryLifecycleService.cleanupExpiredReservations();

    expect(prismaMock.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          inventoryStatus: 'Reserved',
          reservationExpiry: {
            lte: expect.any(Date)
          }
        })
      })
    );
  });

  it('should record cleanup history with system user', async () => {
    const expiredItems = [
      { id: 'item-1', inventoryStatus: 'Reserved', reservationExpiry: new Date('2024-12-31'), deletedAt: null }
    ];

    prismaMock.item.findMany.mockResolvedValue(expiredItems);
    prismaMock.item.update.mockResolvedValue({ id: 'item-1', inventoryStatus: 'Available' });
    prismaMock.inventoryStatusHistory.create.mockResolvedValue({});

    await inventoryLifecycleService.cleanupExpiredReservations();

    expect(prismaMock.inventoryStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: 'Reserved',
          toStatus: 'Available',
          changeReason: 'SYSTEM_CLEANUP',
          changedBy: 'system'
        })
      })
    );
  });
});

describe('InventoryLifecycleService - Get Invoice Inventory Status', () => {
  it('should return status report for invoice items', async () => {
    const invoiceId = global.testData.invoiceId;

    const mockItems = [
      {
        id: 'item-1',
        serialNumber: 'ELEC-2025-0001',
        inventoryStatus: 'Reserved',
        status: 'In Store',
        reservedAt: new Date(),
        category: { name: 'Electronics' },
        model: { name: 'iPhone 15 Pro', company: { name: 'Apple' } },
        statusTracking: [
          { changeDate: new Date(), fromStatus: 'Available', toStatus: 'Reserved' }
        ],
        deletedAt: null
      },
      {
        id: 'item-2',
        serialNumber: 'ELEC-2025-0002',
        inventoryStatus: 'Sold',
        status: 'Sold',
        reservedAt: new Date(),
        category: { name: 'Electronics' },
        model: { name: 'iPhone 15 Pro', company: { name: 'Apple' } },
        statusTracking: [
          { changeDate: new Date(), fromStatus: 'Reserved', toStatus: 'Sold' }
        ],
        deletedAt: null
      }
    ];

    prismaMock.item.findMany.mockResolvedValue(mockItems);

    const result = await inventoryLifecycleService.getInvoiceInventoryStatus(invoiceId);

    expect(result.invoiceId).toBe(invoiceId);
    expect(result.totalItems).toBe(2);
    expect(result.statusSummary).toEqual({
      Reserved: 1,
      Sold: 1
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toHaveProperty('serialNumber');
    expect(result.items[0]).toHaveProperty('inventoryStatus');
    expect(result.items[0]).toHaveProperty('description');
  });

  it('should handle invoice with no items', async () => {
    prismaMock.item.findMany.mockResolvedValue([]);

    const result = await inventoryLifecycleService.getInvoiceInventoryStatus('empty-invoice-id');

    expect(result.totalItems).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.statusSummary).toEqual({});
  });
});

describe('InventoryLifecycleService - Get Item Status History', () => {
  it('should return detailed status history for items', async () => {
    const itemIds = ['item-1', 'item-2'];

    const mockHistory = [
      {
        id: 'history-1',
        itemId: 'item-1',
        fromStatus: 'Available',
        toStatus: 'Reserved',
        changeDate: new Date(),
        item: {
          serialNumber: 'ELEC-2025-0001',
          category: { name: 'Electronics' },
          model: { name: 'iPhone 15 Pro', company: { name: 'Apple' } }
        },
        changedByUser: { fullName: 'Admin User' }
      },
      {
        id: 'history-2',
        itemId: 'item-1',
        fromStatus: 'Reserved',
        toStatus: 'Sold',
        changeDate: new Date(),
        item: {
          serialNumber: 'ELEC-2025-0001',
          category: { name: 'Electronics' },
          model: { name: 'iPhone 15 Pro', company: { name: 'Apple' } }
        },
        changedByUser: { fullName: 'Admin User' }
      }
    ];

    prismaMock.inventoryStatusHistory.findMany.mockResolvedValue(mockHistory);

    const result = await inventoryLifecycleService.getItemStatusHistory(itemIds);

    expect(result).toEqual(mockHistory);
    expect(prismaMock.inventoryStatusHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { itemId: { in: itemIds } },
        orderBy: [
          { itemId: 'asc' },
          { changeDate: 'desc' }
        ]
      })
    );
  });

  it('should return empty array if no history found', async () => {
    prismaMock.inventoryStatusHistory.findMany.mockResolvedValue([]);

    const result = await inventoryLifecycleService.getItemStatusHistory(['non-existent-id']);

    expect(result).toEqual([]);
  });
});

describe('InventoryLifecycleService - Edge Cases and Error Handling', () => {
  beforeEach(() => {
    // Mock both db.transaction wrapper AND db.prisma.$transaction
    db.transaction = jest.fn(async (callback) => {
      return await callback(prismaMock);
    });
    db.prisma.$transaction = jest.fn(async (callback) => {
      return await callback(prismaMock);
    });
    prismaMock.$executeRaw = jest.fn();
  });

  it('should handle concurrent reservation attempts (race condition)', async () => {
    const itemIds = ['item-1'];
    const mockItems = [
      { id: 'item-1', inventoryStatus: 'Reserved', deletedAt: null }
    ];

    prismaMock.item.findMany.mockResolvedValue(mockItems);

    await expect(inventoryLifecycleService.reserveItemsForInvoice(itemIds, 'invoice-id', 'user-id'))
      .rejects
      .toThrow('Cannot reserve items');
  });

  it('should handle database transaction failures', async () => {
    prismaMock.item.findMany.mockRejectedValue(new Error('Transaction failed'));

    await expect(inventoryLifecycleService.reserveItemsForInvoice(['item-1'], 'invoice-id', 'user-id'))
      .rejects
      .toThrow('Transaction failed');
  });

  it('should handle partial update failures gracefully', async () => {
    const itemIds = ['item-1', 'item-2'];
    const mockItems = [
      { id: 'item-1', inventoryStatus: 'Available', deletedAt: null },
      { id: 'item-2', inventoryStatus: 'Available', deletedAt: null }
    ];

    prismaMock.item.findMany.mockResolvedValue(mockItems);
    prismaMock.item.update
      .mockResolvedValueOnce({ id: 'item-1', inventoryStatus: 'Reserved' })
      .mockRejectedValueOnce(new Error('Update failed'));

    await expect(inventoryLifecycleService.reserveItemsForInvoice(itemIds, 'invoice-id', 'user-id'))
      .rejects
      .toThrow('Update failed');
  });

  it('should handle null/undefined invoice IDs', async () => {
    const mockItems = [{ id: 'item-1', inventoryStatus: 'Available', deletedAt: null }];
    prismaMock.item.findMany.mockResolvedValue(mockItems);
    prismaMock.item.update.mockResolvedValue({ id: 'item-1' });
    prismaMock.inventoryStatusHistory.create.mockResolvedValue({});

    // Should not throw
    await inventoryLifecycleService.reserveItemsForInvoice(['item-1'], null, 'user-id');
    await inventoryLifecycleService.reserveItemsForInvoice(['item-1'], undefined, 'user-id');
  });
});

describe('InventoryLifecycleService - Integration Scenarios', () => {
  beforeEach(() => {
    // Mock both db.transaction wrapper AND db.prisma.$transaction
    db.transaction = jest.fn(async (callback) => {
      return await callback(prismaMock);
    });
    db.prisma.$transaction = jest.fn(async (callback) => {
      return await callback(prismaMock);
    });
    prismaMock.$executeRaw = jest.fn();
  });

  it('should handle full lifecycle: Reserve → Sold → Delivered', async () => {
    const invoiceId = 'test-invoice';
    const itemIds = ['item-1'];
    const userId = 'user-id';

    // Step 1: Reserve
    prismaMock.item.findMany.mockResolvedValue([
      { id: 'item-1', inventoryStatus: 'Available', deletedAt: null }
    ]);
    prismaMock.item.update.mockResolvedValue({
      id: 'item-1',
      inventoryStatus: 'Reserved'
    });
    prismaMock.inventoryStatusHistory.create.mockResolvedValue({});

    const reserveResult = await inventoryLifecycleService.reserveItemsForInvoice(itemIds, invoiceId, userId);
    expect(reserveResult.reservationCount).toBe(1);

    // Step 2: Mark as Sold
    prismaMock.item.findMany.mockResolvedValue([
      { id: 'item-1', inventoryStatus: 'Reserved', reservedForId: invoiceId, deletedAt: null }
    ]);
    prismaMock.item.update.mockResolvedValue({
      id: 'item-1',
      inventoryStatus: 'Sold',
      status: 'Sold'
    });

    const soldResult = await inventoryLifecycleService.markItemsAsSoldForInvoice(invoiceId, userId);
    expect(soldResult.saleCount).toBe(1);

    // Step 3: Mark as Delivered
    prismaMock.item.findMany.mockResolvedValue([
      { id: 'item-1', inventoryStatus: 'Sold', reservedForId: invoiceId, deletedAt: null }
    ]);
    prismaMock.item.update.mockResolvedValue({
      id: 'item-1',
      inventoryStatus: 'Delivered',
      status: 'Delivered'
    });

    const deliveredResult = await inventoryLifecycleService.markItemsAsDeliveredForInvoice(invoiceId, userId, {});
    expect(deliveredResult.deliveryCount).toBe(1);
  });

  it('should handle full lifecycle: Reserve → Cancel (Release)', async () => {
    const invoiceId = 'test-invoice';
    const itemIds = ['item-1', 'item-2'];
    const userId = 'user-id';

    // Step 1: Reserve items
    prismaMock.item.findMany.mockResolvedValue([
      { id: 'item-1', inventoryStatus: 'Available', deletedAt: null },
      { id: 'item-2', inventoryStatus: 'Available', deletedAt: null }
    ]);
    prismaMock.item.update.mockResolvedValue({ id: 'item-1', inventoryStatus: 'Reserved' });
    prismaMock.inventoryStatusHistory.create.mockResolvedValue({});

    const reserveResult = await inventoryLifecycleService.reserveItemsForInvoice(itemIds, invoiceId, userId);
    expect(reserveResult.reservationCount).toBe(2);

    // Step 2: Cancel invoice and release items
    prismaMock.item.findMany.mockResolvedValue([
      { id: 'item-1', inventoryStatus: 'Reserved', reservedForId: invoiceId, deletedAt: null },
      { id: 'item-2', inventoryStatus: 'Reserved', reservedForId: invoiceId, deletedAt: null }
    ]);
    prismaMock.item.update.mockResolvedValue({ id: 'item-1', inventoryStatus: 'Available' });

    const releaseResult = await inventoryLifecycleService.releaseItemsForInvoiceCancellation(invoiceId, userId);
    expect(releaseResult.releaseCount).toBe(2);
  });
});
