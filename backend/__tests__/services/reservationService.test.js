/**
 * Comprehensive Test Suite for reservationService.js
 *
 * Coverage:
 * - Reserve Items: Session management, expiry handling
 * - Grouped Available Items: Filtering, grouping by specs
 * - Auto-Assignment: FIFO, LIFO, cost-based strategies
 * - Session Management: Get, release, extend reservations
 * - Cleanup: Expired reservations
 * - Edge Cases: Concurrent reservations, validation, availability checks
 */

const reservationService = require('../../src/services/reservationService');
const db = require('../../src/config/database');

describe('ReservationService - Reserve Items', () => {
  beforeEach(() => {
    db.transaction = jest.fn((callback) => callback(prismaMock));
  });

  it('should reserve items with session ID and expiry', async () => {
    const itemIds = ['item-1', 'item-2'];
    const userId = 'user-id';
    const expiryMinutes = 30;

    prismaMock.itemReservation.findMany.mockResolvedValue([]);

    const mockItems = [
      {
        id: 'item-1',
        serialNumber: 'ELEC-2025-0001',
        status: 'In Store',
        deletedAt: null,
        model: { company: { name: 'Apple' } },
        category: { name: 'Electronics' }
      },
      {
        id: 'item-2',
        serialNumber: 'ELEC-2025-0002',
        status: 'In Store',
        deletedAt: null,
        model: { company: { name: 'Apple' } },
        category: { name: 'Electronics' }
      }
    ];

    prismaMock.item.findMany.mockResolvedValue(mockItems);

    prismaMock.itemReservation.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'reservation-id',
        ...data
      })
    );

    const result = await reservationService.reserveItems(itemIds, userId);

    expect(result).toHaveProperty('sessionId', 'test-session-id-12345');
    expect(result).toHaveProperty('reservations');
    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('expiresAt');
    expect(result.reservations).toHaveLength(2);
    expect(prismaMock.itemReservation.create).toHaveBeenCalledTimes(2);
  });

  it('should use default expiry of 30 minutes', async () => {
    const itemIds = ['item-1'];
    const userId = 'user-id';

    prismaMock.itemReservation.findMany.mockResolvedValue([]);
    prismaMock.item.findMany.mockResolvedValue([
      {
        id: 'item-1',
        status: 'In Store',
        deletedAt: null,
        model: { company: {} },
        category: {}
      }
    ]);
    prismaMock.itemReservation.create.mockResolvedValue({
      id: 'reservation-id',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    const result = await reservationService.reserveItems(itemIds, userId);

    const expectedExpiry = new Date(Date.now() + 30 * 60 * 1000);
    const actualExpiry = new Date(result.expiresAt);

    // Allow 1 second tolerance for test execution time
    expect(Math.abs(actualExpiry - expectedExpiry)).toBeLessThan(1000);
  });

  it('should allow custom expiry minutes', async () => {
    const itemIds = ['item-1'];
    const userId = 'user-id';
    const expiryMinutes = 60;

    prismaMock.itemReservation.findMany.mockResolvedValue([]);
    prismaMock.item.findMany.mockResolvedValue([
      {
        id: 'item-1',
        status: 'In Store',
        deletedAt: null,
        model: { company: {} },
        category: {}
      }
    ]);
    prismaMock.itemReservation.create.mockResolvedValue({
      id: 'reservation-id',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    const result = await reservationService.reserveItems(itemIds, userId, 'INVOICE_CREATION', expiryMinutes);

    const expectedExpiry = new Date(Date.now() + 60 * 60 * 1000);
    const actualExpiry = new Date(result.expiresAt);

    expect(Math.abs(actualExpiry - expectedExpiry)).toBeLessThan(1000);
  });

  it('should throw error if items already reserved', async () => {
    const itemIds = ['item-1', 'item-2'];

    prismaMock.itemReservation.findMany.mockResolvedValue([
      {
        id: 'existing-reservation',
        itemId: 'item-1',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      }
    ]);

    await expect(reservationService.reserveItems(itemIds, 'user-id'))
      .rejects
      .toThrow('Items already reserved: item-1');
  });

  it('should throw error if items not available', async () => {
    const itemIds = ['item-1', 'item-2', 'item-3'];

    prismaMock.itemReservation.findMany.mockResolvedValue([]);
    prismaMock.item.findMany.mockResolvedValue([
      {
        id: 'item-1',
        status: 'In Store',
        deletedAt: null,
        model: { company: {} },
        category: {}
      }
      // item-2 and item-3 not found
    ]);

    await expect(reservationService.reserveItems(itemIds, 'user-id'))
      .rejects
      .toThrow('Items not available for reservation: item-2, item-3');
  });

  it('should only reserve items with status "In Store"', async () => {
    const itemIds = ['item-1', 'item-2'];

    prismaMock.itemReservation.findMany.mockResolvedValue([]);
    prismaMock.item.findMany.mockResolvedValue([
      {
        id: 'item-1',
        status: 'In Store',
        deletedAt: null,
        model: { company: {} },
        category: {}
      }
      // item-2 has different status or deleted
    ]);

    await expect(reservationService.reserveItems(itemIds, 'user-id'))
      .rejects
      .toThrow('Items not available for reservation: item-2');
  });

  it('should ignore expired existing reservations', async () => {
    const itemIds = ['item-1'];

    // The service queries with expiresAt: { gt: new Date() }
    // So for expired reservations, it should return empty array
    prismaMock.itemReservation.findMany.mockResolvedValue([]);

    prismaMock.item.findMany.mockResolvedValue([
      {
        id: 'item-1',
        status: 'In Store',
        deletedAt: null,
        model: { company: {} },
        category: {}
      }
    ]);

    prismaMock.itemReservation.create.mockResolvedValue({
      id: 'new-reservation',
      itemId: 'item-1'
    });

    // Should succeed because existing reservation is expired (filtered out by query)
    const result = await reservationService.reserveItems(itemIds, 'user-id');

    expect(result.sessionId).toBe('test-session-id-12345');
  });

  it('should include reason in reservation', async () => {
    const itemIds = ['item-1'];
    const reason = 'INVOICE_CREATION';

    prismaMock.itemReservation.findMany.mockResolvedValue([]);
    prismaMock.item.findMany.mockResolvedValue([
      {
        id: 'item-1',
        status: 'In Store',
        deletedAt: null,
        model: { company: {} },
        category: {}
      }
    ]);
    prismaMock.itemReservation.create.mockResolvedValue({
      id: 'reservation-id',
      reason: reason
    });

    await reservationService.reserveItems(itemIds, 'user-id', reason);

    expect(prismaMock.itemReservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: reason
        })
      })
    );
  });
});

describe('ReservationService - Get Grouped Available Items', () => {
  it('should return items grouped by model, condition, and specifications', async () => {
    const mockItems = [
      {
        id: 'item-1',
        modelId: 'model-1',
        condition: 'New',
        specifications: { color: 'Black', storage: '256GB' },
        sellingPrice: 180000,
        serialNumber: 'ELEC-2025-0001',
        purchasePrice: 150000,
        inboundDate: new Date('2025-01-01'),
        model: { name: 'iPhone 15 Pro', company: { name: 'Apple' } },
        category: { name: 'Electronics' },
        reservations: []
      },
      {
        id: 'item-2',
        modelId: 'model-1',
        condition: 'New',
        specifications: { color: 'Black', storage: '256GB' },
        sellingPrice: 180000,
        serialNumber: 'ELEC-2025-0002',
        purchasePrice: 150000,
        inboundDate: new Date('2025-01-02'),
        model: { name: 'iPhone 15 Pro', company: { name: 'Apple' } },
        category: { name: 'Electronics' },
        reservations: []
      },
      {
        id: 'item-3',
        modelId: 'model-1',
        condition: 'New',
        specifications: { color: 'White', storage: '256GB' },
        sellingPrice: 180000,
        serialNumber: 'ELEC-2025-0003',
        purchasePrice: 150000,
        inboundDate: new Date('2025-01-03'),
        model: { name: 'iPhone 15 Pro', company: { name: 'Apple' } },
        category: { name: 'Electronics' },
        reservations: []
      }
    ];

    prismaMock.item.findMany.mockResolvedValue(mockItems);

    const result = await reservationService.getGroupedAvailableItems();

    expect(result).toHaveLength(2); // Two different groups (different specs)
    expect(result[0]).toHaveProperty('modelId');
    expect(result[0]).toHaveProperty('model');
    expect(result[0]).toHaveProperty('category');
    expect(result[0]).toHaveProperty('condition');
    expect(result[0]).toHaveProperty('availableCount');
    expect(result[0]).toHaveProperty('items');
    expect(result[0].availableCount).toBe(2); // Black 256GB
    expect(result[1].availableCount).toBe(1); // White 256GB
  });

  it('should filter items by categoryId', async () => {
    const categoryId = global.testData.categoryId;

    prismaMock.item.findMany.mockResolvedValue([]);

    await reservationService.getGroupedAvailableItems({ categoryId });

    expect(prismaMock.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categoryId: categoryId
        })
      })
    );
  });

  it('should filter items by modelId', async () => {
    const modelId = global.testData.modelId;

    prismaMock.item.findMany.mockResolvedValue([]);

    await reservationService.getGroupedAvailableItems({ modelId });

    expect(prismaMock.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          modelId: modelId
        })
      })
    );
  });

  it('should filter items by condition', async () => {
    const condition = 'New';

    prismaMock.item.findMany.mockResolvedValue([]);

    await reservationService.getGroupedAvailableItems({ condition });

    expect(prismaMock.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          condition: condition
        })
      })
    );
  });

  it('should only return items with inventoryStatus "Available"', async () => {
    prismaMock.item.findMany.mockResolvedValue([]);

    await reservationService.getGroupedAvailableItems();

    expect(prismaMock.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'In Store',
          inventoryStatus: 'Available',
          deletedAt: null
        })
      })
    );
  });

  it('should exclude items with active reservations', async () => {
    const mockItems = [
      {
        id: 'item-1',
        modelId: 'model-1',
        condition: 'New',
        specifications: { color: 'Black' },
        sellingPrice: 180000,
        model: { name: 'iPhone', company: { name: 'Apple' } },
        category: { name: 'Electronics' },
        reservations: [] // No active reservations
      },
      {
        id: 'item-2',
        modelId: 'model-1',
        condition: 'New',
        specifications: { color: 'Black' },
        sellingPrice: 180000,
        model: { name: 'iPhone', company: { name: 'Apple' } },
        category: { name: 'Electronics' },
        reservations: [{ expiresAt: new Date(Date.now() + 60000) }] // Has active reservation
      }
    ];

    prismaMock.item.findMany.mockResolvedValue(mockItems);

    const result = await reservationService.getGroupedAvailableItems();

    // Should only group item-1, not item-2
    expect(result[0].availableCount).toBe(1);
    expect(result[0].items).toHaveLength(1);
    expect(result[0].items[0].id).toBe('item-1');
  });

  it('should use selling price or fallback to purchase price', async () => {
    const mockItems = [
      {
        id: 'item-1',
        modelId: 'model-1',
        condition: 'New',
        specifications: {},
        sellingPrice: 180000,
        purchasePrice: 150000,
        model: { company: {} },
        category: {},
        reservations: []
      },
      {
        id: 'item-2',
        modelId: 'model-1',
        condition: 'New',
        specifications: {},
        sellingPrice: null,
        purchasePrice: 160000,
        model: { company: {} },
        category: {},
        reservations: []
      }
    ];

    prismaMock.item.findMany.mockResolvedValue(mockItems);

    const result = await reservationService.getGroupedAvailableItems();

    expect(result[0].samplePrice).toBe(180000); // Uses first item's selling price
  });
});

describe('ReservationService - Auto-Assign Items', () => {
  const setupMockGroupedItems = () => {
    const mockItems = [
      {
        id: 'item-1',
        modelId: 'model-1',
        condition: 'New',
        specifications: { color: 'Black', storage: '256GB' },
        serialNumber: 'ELEC-2025-0001',
        purchasePrice: 150000,
        sellingPrice: 180000,
        inboundDate: new Date('2025-01-01'),
        model: { name: 'iPhone 15 Pro', company: { name: 'Apple' } },
        category: { name: 'Electronics' },
        reservations: []
      },
      {
        id: 'item-2',
        modelId: 'model-1',
        condition: 'New',
        specifications: { color: 'Black', storage: '256GB' },
        serialNumber: 'ELEC-2025-0002',
        purchasePrice: 160000,
        sellingPrice: 180000,
        inboundDate: new Date('2025-01-05'),
        model: { name: 'iPhone 15 Pro', company: { name: 'Apple' } },
        category: { name: 'Electronics' },
        reservations: []
      },
      {
        id: 'item-3',
        modelId: 'model-1',
        condition: 'New',
        specifications: { color: 'Black', storage: '256GB' },
        serialNumber: 'ELEC-2025-0003',
        purchasePrice: 155000,
        sellingPrice: 180000,
        inboundDate: new Date('2025-01-03'),
        model: { name: 'iPhone 15 Pro', company: { name: 'Apple' } },
        category: { name: 'Electronics' },
        reservations: []
      }
    ];
    return mockItems;
  };

  beforeEach(() => {
    db.transaction = jest.fn((callback) => callback(prismaMock));
  });

  it('should auto-assign items using FIFO strategy', async () => {
    const mockItems = setupMockGroupedItems();

    // Smart mock that returns different results based on query
    prismaMock.item.findMany.mockImplementation(({ where }) => {
      // If querying by specific IDs (for reserveItems), filter to those IDs
      if (where && where.id && where.id.in) {
        const requestedIds = where.id.in;
        return Promise.resolve(mockItems.filter(item => requestedIds.includes(item.id)));
      }
      // Otherwise return all items (for getGroupedAvailableItems)
      return Promise.resolve(mockItems);
    });

    prismaMock.itemReservation.findMany.mockResolvedValue([]);
    prismaMock.itemReservation.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'reservation-id', ...data })
    );

    const groupKey = 'model-1_New_{"color":"Black","storage":"256GB"}';
    const result = await reservationService.autoAssignItems(groupKey, 2, 'FIFO', 'user-id');

    expect(result.selectedItems).toHaveLength(2);
    // FIFO should select oldest items first: item-1 (2025-01-01) and item-3 (2025-01-03)
    expect(result.selectedItems[0].id).toBe('item-1');
    expect(result.selectedItems[1].id).toBe('item-3');
  });

  it('should auto-assign items using LIFO strategy', async () => {
    const mockItems = setupMockGroupedItems();

    prismaMock.item.findMany.mockImplementation(({ where }) => {
      if (where && where.id && where.id.in) {
        const requestedIds = where.id.in;
        return Promise.resolve(mockItems.filter(item => requestedIds.includes(item.id)));
      }
      return Promise.resolve(mockItems);
    });

    prismaMock.itemReservation.findMany.mockResolvedValue([]);
    prismaMock.itemReservation.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'reservation-id', ...data })
    );

    const groupKey = 'model-1_New_{"color":"Black","storage":"256GB"}';
    const result = await reservationService.autoAssignItems(groupKey, 2, 'LIFO', 'user-id');

    expect(result.selectedItems).toHaveLength(2);
    // LIFO should select newest items first: item-2 (2025-01-05) and item-3 (2025-01-03)
    expect(result.selectedItems[0].id).toBe('item-2');
    expect(result.selectedItems[1].id).toBe('item-3');
  });

  it('should auto-assign items using HIGHEST_COST strategy', async () => {
    const mockItems = setupMockGroupedItems();

    prismaMock.item.findMany.mockImplementation(({ where }) => {
      if (where && where.id && where.id.in) {
        const requestedIds = where.id.in;
        return Promise.resolve(mockItems.filter(item => requestedIds.includes(item.id)));
      }
      return Promise.resolve(mockItems);
    });

    prismaMock.itemReservation.findMany.mockResolvedValue([]);
    prismaMock.itemReservation.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'reservation-id', ...data })
    );

    const groupKey = 'model-1_New_{"color":"Black","storage":"256GB"}';
    const result = await reservationService.autoAssignItems(groupKey, 2, 'HIGHEST_COST', 'user-id');

    expect(result.selectedItems).toHaveLength(2);
    // HIGHEST_COST should select: item-2 (160000) and item-3 (155000)
    expect(result.selectedItems[0].id).toBe('item-2');
    expect(result.selectedItems[1].id).toBe('item-3');
  });

  it('should auto-assign items using LOWEST_COST strategy', async () => {
    const mockItems = setupMockGroupedItems();

    prismaMock.item.findMany.mockImplementation(({ where }) => {
      if (where && where.id && where.id.in) {
        const requestedIds = where.id.in;
        return Promise.resolve(mockItems.filter(item => requestedIds.includes(item.id)));
      }
      return Promise.resolve(mockItems);
    });

    prismaMock.itemReservation.findMany.mockResolvedValue([]);
    prismaMock.itemReservation.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'reservation-id', ...data })
    );

    const groupKey = 'model-1_New_{"color":"Black","storage":"256GB"}';
    const result = await reservationService.autoAssignItems(groupKey, 2, 'LOWEST_COST', 'user-id');

    expect(result.selectedItems).toHaveLength(2);
    // LOWEST_COST should select: item-1 (150000) and item-3 (155000)
    expect(result.selectedItems[0].id).toBe('item-1');
    expect(result.selectedItems[1].id).toBe('item-3');
  });

  it('should throw error if group not found', async () => {
    prismaMock.item.findMany.mockResolvedValue([]);

    await expect(reservationService.autoAssignItems('non-existent-group', 2, 'FIFO', 'user-id'))
      .rejects
      .toThrow('Item group not found');
  });

  it('should throw error if insufficient quantity available', async () => {
    const mockItems = setupMockGroupedItems();
    prismaMock.item.findMany.mockResolvedValue(mockItems);

    const groupKey = 'model-1_New_{"color":"Black","storage":"256GB"}';

    await expect(reservationService.autoAssignItems(groupKey, 10, 'FIFO', 'user-id'))
      .rejects
      .toThrow('Only 3 items available, requested 10');
  });

  it('should return reservation details after successful assignment', async () => {
    const mockItems = setupMockGroupedItems();

    prismaMock.item.findMany.mockImplementation(({ where }) => {
      if (where && where.id && where.id.in) {
        const requestedIds = where.id.in;
        return Promise.resolve(mockItems.filter(item => requestedIds.includes(item.id)));
      }
      return Promise.resolve(mockItems);
    });

    prismaMock.itemReservation.findMany.mockResolvedValue([]);
    prismaMock.itemReservation.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'reservation-id', ...data })
    );

    const groupKey = 'model-1_New_{"color":"Black","storage":"256GB"}';
    const result = await reservationService.autoAssignItems(groupKey, 2, 'FIFO', 'user-id');

    expect(result).toHaveProperty('sessionId');
    expect(result).toHaveProperty('reservations');
    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('group');
    expect(result).toHaveProperty('selectedItems');
    expect(result).toHaveProperty('assignmentPreference', 'FIFO');
  });
});

describe('ReservationService - Get Reservations by Session', () => {
  it('should return all reservations for a session', async () => {
    const sessionId = 'test-session-id';

    const mockReservations = [
      {
        id: 'reservation-1',
        sessionId: sessionId,
        itemId: 'item-1',
        expiresAt: new Date(),
        item: {
          id: 'item-1',
          serialNumber: 'ELEC-2025-0001',
          model: { name: 'iPhone 15 Pro', company: { name: 'Apple' } },
          category: { name: 'Electronics' }
        },
        user: { fullName: 'John Doe' }
      },
      {
        id: 'reservation-2',
        sessionId: sessionId,
        itemId: 'item-2',
        expiresAt: new Date(),
        item: {
          id: 'item-2',
          serialNumber: 'ELEC-2025-0002',
          model: { name: 'iPhone 15 Pro', company: { name: 'Apple' } },
          category: { name: 'Electronics' }
        },
        user: { fullName: 'John Doe' }
      }
    ];

    prismaMock.itemReservation.findMany.mockResolvedValue(mockReservations);

    const result = await reservationService.getReservationsBySession(sessionId);

    expect(result).toEqual(mockReservations);
    expect(result).toHaveLength(2);
    expect(prismaMock.itemReservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId }
      })
    );
  });

  it('should return empty array if no reservations found', async () => {
    prismaMock.itemReservation.findMany.mockResolvedValue([]);

    const result = await reservationService.getReservationsBySession('non-existent-session');

    expect(result).toEqual([]);
  });
});

describe('ReservationService - Release Reservations', () => {
  it('should release all reservations for a session', async () => {
    const sessionId = 'test-session-id';

    prismaMock.itemReservation.deleteMany.mockResolvedValue({ count: 5 });

    const result = await reservationService.releaseReservations(sessionId);

    expect(result).toHaveProperty('count', 5);
    expect(prismaMock.itemReservation.deleteMany).toHaveBeenCalledWith({
      where: { sessionId }
    });
  });

  it('should release reservations for specific user in session', async () => {
    const sessionId = 'test-session-id';
    const userId = 'user-id';

    prismaMock.itemReservation.deleteMany.mockResolvedValue({ count: 3 });

    await reservationService.releaseReservations(sessionId, userId);

    expect(prismaMock.itemReservation.deleteMany).toHaveBeenCalledWith({
      where: {
        sessionId,
        reservedBy: userId
      }
    });
  });

  it('should return count of released reservations', async () => {
    prismaMock.itemReservation.deleteMany.mockResolvedValue({ count: 10 });

    const result = await reservationService.releaseReservations('session-id');

    expect(result.count).toBe(10);
  });
});

describe('ReservationService - Cleanup Expired Reservations', () => {
  it('should delete expired reservations', async () => {
    prismaMock.itemReservation.deleteMany.mockResolvedValue({ count: 7 });

    const result = await reservationService.cleanupExpiredReservations();

    expect(result).toHaveProperty('count', 7);
    expect(prismaMock.itemReservation.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          expiresAt: { lt: expect.any(Date) }
        }
      })
    );
  });

  it('should return zero count if no expired reservations', async () => {
    prismaMock.itemReservation.deleteMany.mockResolvedValue({ count: 0 });

    const result = await reservationService.cleanupExpiredReservations();

    expect(result.count).toBe(0);
  });

  it('should only delete reservations with expiry in past', async () => {
    prismaMock.itemReservation.deleteMany.mockResolvedValue({ count: 5 });

    await reservationService.cleanupExpiredReservations();

    const callArg = prismaMock.itemReservation.deleteMany.mock.calls[0][0];
    const expiryCondition = callArg.where.expiresAt.lt;

    // The expiry condition should be less than current time
    expect(expiryCondition.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe('ReservationService - Extend Reservation', () => {
  it('should extend reservation expiry by default 30 minutes', async () => {
    const sessionId = 'test-session-id';

    prismaMock.itemReservation.updateMany.mockResolvedValue({ count: 3 });

    const result = await reservationService.extendReservation(sessionId);

    expect(result).toHaveProperty('sessionId', sessionId);
    expect(result).toHaveProperty('newExpiryTime');
    expect(result).toHaveProperty('updatedCount', 3);

    const expectedExpiry = new Date(Date.now() + 30 * 60 * 1000);
    const actualExpiry = new Date(result.newExpiryTime);

    expect(Math.abs(actualExpiry - expectedExpiry)).toBeLessThan(1000);
  });

  it('should extend reservation by custom minutes', async () => {
    const sessionId = 'test-session-id';
    const additionalMinutes = 60;

    prismaMock.itemReservation.updateMany.mockResolvedValue({ count: 2 });

    const result = await reservationService.extendReservation(sessionId, additionalMinutes);

    const expectedExpiry = new Date(Date.now() + 60 * 60 * 1000);
    const actualExpiry = new Date(result.newExpiryTime);

    expect(Math.abs(actualExpiry - expectedExpiry)).toBeLessThan(1000);
    expect(result.updatedCount).toBe(2);
  });

  it('should update all reservations in session', async () => {
    const sessionId = 'test-session-id';

    prismaMock.itemReservation.updateMany.mockResolvedValue({ count: 5 });

    await reservationService.extendReservation(sessionId, 45);

    expect(prismaMock.itemReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId },
        data: { expiresAt: expect.any(Date) }
      })
    );
  });
});

describe('ReservationService - Edge Cases and Error Handling', () => {
  beforeEach(() => {
    db.transaction = jest.fn((callback) => callback(prismaMock));
  });

  it('should handle concurrent reservation attempts', async () => {
    const itemIds = ['item-1'];

    // First call: no existing reservations
    prismaMock.itemReservation.findMany.mockResolvedValueOnce([]);

    // But item is reserved when we try to create
    prismaMock.item.findMany.mockResolvedValue([]);

    await expect(reservationService.reserveItems(itemIds, 'user-id'))
      .rejects
      .toThrow('Items not available for reservation');
  });

  it('should handle database errors gracefully', async () => {
    const itemIds = ['item-1'];

    prismaMock.itemReservation.findMany.mockRejectedValue(new Error('Database connection failed'));

    await expect(reservationService.reserveItems(itemIds, 'user-id'))
      .rejects
      .toThrow('Database connection failed');
  });

  it('should handle empty item IDs array', async () => {
    db.transaction = jest.fn((callback) => callback(prismaMock));

    prismaMock.itemReservation.findMany.mockResolvedValue([]);
    prismaMock.item.findMany.mockResolvedValue([]);
    prismaMock.itemReservation.create.mockResolvedValue({ id: 'reservation-id' });

    const result = await reservationService.reserveItems([], 'user-id');

    expect(result.reservations).toHaveLength(0);
  });

  it('should handle items with null specifications', async () => {
    const mockItems = [
      {
        id: 'item-1',
        modelId: 'model-1',
        condition: 'New',
        specifications: null,
        model: { company: {} },
        category: {},
        reservations: []
      },
      {
        id: 'item-2',
        modelId: 'model-1',
        condition: 'New',
        specifications: null,
        model: { company: {} },
        category: {},
        reservations: []
      }
    ];

    prismaMock.item.findMany.mockResolvedValue(mockItems);

    const result = await reservationService.getGroupedAvailableItems();

    expect(result).toHaveLength(1); // Should group together
    expect(result[0].availableCount).toBe(2);
  });

  it('should handle transaction rollback on failure', async () => {
    const itemIds = ['item-1'];

    prismaMock.itemReservation.findMany.mockResolvedValue([]);
    prismaMock.item.findMany.mockResolvedValue([
      {
        id: 'item-1',
        status: 'In Store',
        deletedAt: null,
        model: { company: {} },
        category: {}
      }
    ]);

    // First reservation succeeds, second fails
    prismaMock.itemReservation.create.mockRejectedValue(new Error('Create failed'));

    db.transaction = jest.fn((callback) => {
      return callback(prismaMock).catch(err => {
        // Simulate transaction rollback
        throw err;
      });
    });

    await expect(reservationService.reserveItems(itemIds, 'user-id'))
      .rejects
      .toThrow('Create failed');
  });
});

describe('ReservationService - Performance and Scalability', () => {
  it('should handle large number of items efficiently', async () => {
    const itemIds = Array.from({ length: 100 }, (_, i) => `item-${i + 1}`);

    db.transaction = jest.fn((callback) => callback(prismaMock));

    prismaMock.itemReservation.findMany.mockResolvedValue([]);
    prismaMock.item.findMany.mockResolvedValue(
      itemIds.map((id, index) => ({
        id,
        serialNumber: `ELEC-2025-${String(index + 1).padStart(4, '0')}`,
        status: 'In Store',
        deletedAt: null,
        model: { company: {} },
        category: {}
      }))
    );

    prismaMock.itemReservation.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'reservation-id', ...data })
    );

    const result = await reservationService.reserveItems(itemIds, 'user-id');

    expect(result.reservations).toHaveLength(100);
    expect(prismaMock.itemReservation.create).toHaveBeenCalledTimes(100);
  });

  it('should efficiently group large number of similar items', async () => {
    const mockItems = Array.from({ length: 500 }, (_, i) => ({
      id: `item-${i + 1}`,
      modelId: 'model-1',
      condition: 'New',
      specifications: { color: i % 5 === 0 ? 'Black' : 'White', storage: '256GB' },
      model: { company: {} },
      category: {},
      reservations: []
    }));

    prismaMock.item.findMany.mockResolvedValue(mockItems);

    const result = await reservationService.getGroupedAvailableItems();

    expect(result).toHaveLength(2); // Black and White
    const blackGroup = result.find(g => g.specifications.color === 'Black');
    const whiteGroup = result.find(g => g.specifications.color === 'White');

    expect(blackGroup.availableCount).toBe(100); // Every 5th item
    expect(whiteGroup.availableCount).toBe(400);
  });
});
