/**
 * Comprehensive Test Suite for inventoryLifecycleController.js
 *
 * Coverage:
 * - Lifecycle operation endpoints
 * - Input validation
 * - Error responses
 * - Service integration
 */

const inventoryLifecycleController = require('../../src/controllers/inventoryLifecycleController');
const inventoryLifecycleService = require('../../src/services/inventoryLifecycleService');
const invoiceLifecycleService = require('../../src/services/invoiceLifecycleService');

// Mock the services
jest.mock('../../src/services/inventoryLifecycleService');
jest.mock('../../src/services/invoiceLifecycleService');
jest.mock('../../src/config/database', () => ({
  prisma: global.prismaMock
}));

// Helper functions
const createMockReq = (overrides = {}) => ({
  params: {},
  query: {},
  body: {},
  user: { id: global.testData.userId, role: 'Admin' },
  ...overrides
});

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('InventoryLifecycleController - Reserve Items', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should reserve items for invoice successfully', async () => {
    const mockResult = {
      reservedItems: [{ id: 'item-1' }, { id: 'item-2' }],
      reservationCount: 2,
      invoiceId: 'invoice-id'
    };

    inventoryLifecycleService.reserveItemsForInvoice.mockResolvedValue(mockResult);

    const req = createMockReq({
      body: {
        itemIds: ['item-1', 'item-2'],
        invoiceId: 'invoice-id'
      },
      user: { id: 'user-id' }
    });
    const res = createMockRes();

    await inventoryLifecycleController.reserveItemsForInvoice(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockResult
    });
    expect(inventoryLifecycleService.reserveItemsForInvoice).toHaveBeenCalledWith(
      ['item-1', 'item-2'],
      'invoice-id',
      'user-id'
    );
  });

  it('should throw error if itemIds not provided', async () => {
    const req = createMockReq({
      body: { invoiceId: 'invoice-id' }
    });
    const res = createMockRes();

    await expect(inventoryLifecycleController.reserveItemsForInvoice(req, res))
      .rejects
      .toThrow('Item IDs array is required');
  });

  it('should throw error if itemIds is empty array', async () => {
    const req = createMockReq({
      body: { itemIds: [], invoiceId: 'invoice-id' }
    });
    const res = createMockRes();

    await expect(inventoryLifecycleController.reserveItemsForInvoice(req, res))
      .rejects
      .toThrow('Item IDs array is required');
  });

  it('should throw error if invoiceId not provided', async () => {
    const req = createMockReq({
      body: { itemIds: ['item-1'] }
    });
    const res = createMockRes();

    await expect(inventoryLifecycleController.reserveItemsForInvoice(req, res))
      .rejects
      .toThrow('Invoice ID is required');
  });
});

describe('InventoryLifecycleController - Release Items', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should release items for cancelled invoice', async () => {
    const mockResult = {
      releasedItems: [{ id: 'item-1' }],
      releaseCount: 1,
      invoiceId: 'invoice-id'
    };

    inventoryLifecycleService.releaseItemsForInvoiceCancellation.mockResolvedValue(mockResult);

    const req = createMockReq({
      body: { invoiceId: 'invoice-id' },
      user: { id: 'user-id' }
    });
    const res = createMockRes();

    await inventoryLifecycleController.releaseItemsForInvoice(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockResult
    });
    expect(inventoryLifecycleService.releaseItemsForInvoiceCancellation).toHaveBeenCalledWith(
      'invoice-id',
      'user-id'
    );
  });

  it('should throw error if invoiceId not provided', async () => {
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await expect(inventoryLifecycleController.releaseItemsForInvoice(req, res))
      .rejects
      .toThrow('Invoice ID is required');
  });
});

describe('InventoryLifecycleController - Mark Items as Sold', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should mark items as sold when invoice paid', async () => {
    const mockResult = {
      soldItems: [{ id: 'item-1', inventoryStatus: 'Sold' }],
      saleCount: 1,
      invoiceId: 'invoice-id'
    };

    inventoryLifecycleService.markItemsAsSoldForInvoice.mockResolvedValue(mockResult);

    const req = createMockReq({
      body: { invoiceId: 'invoice-id' },
      user: { id: 'user-id' }
    });
    const res = createMockRes();

    await inventoryLifecycleController.markItemsAsSold(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockResult
    });
    expect(inventoryLifecycleService.markItemsAsSoldForInvoice).toHaveBeenCalledWith(
      'invoice-id',
      'user-id'
    );
  });

  it('should throw error if invoiceId not provided', async () => {
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await expect(inventoryLifecycleController.markItemsAsSold(req, res))
      .rejects
      .toThrow('Invoice ID is required');
  });
});

describe('InventoryLifecycleController - Mark Items as Delivered', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should mark items as delivered with delivery info', async () => {
    const deliveryInfo = {
      handoverTo: 'John Doe',
      handoverToPhone: '1234567890'
    };

    const mockResult = {
      deliveredItems: [{ id: 'item-1', inventoryStatus: 'Delivered' }],
      deliveryCount: 1,
      invoiceId: 'invoice-id'
    };

    inventoryLifecycleService.markItemsAsDeliveredForInvoice.mockResolvedValue(mockResult);

    const req = createMockReq({
      body: {
        invoiceId: 'invoice-id',
        deliveryInfo
      },
      user: { id: 'user-id' }
    });
    const res = createMockRes();

    await inventoryLifecycleController.markItemsAsDelivered(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockResult
    });
    expect(inventoryLifecycleService.markItemsAsDeliveredForInvoice).toHaveBeenCalledWith(
      'invoice-id',
      'user-id',
      deliveryInfo
    );
  });

  it('should handle delivery without deliveryInfo', async () => {
    const mockResult = {
      deliveredItems: [{ id: 'item-1' }],
      deliveryCount: 1,
      invoiceId: 'invoice-id'
    };

    inventoryLifecycleService.markItemsAsDeliveredForInvoice.mockResolvedValue(mockResult);

    const req = createMockReq({
      body: { invoiceId: 'invoice-id' },
      user: { id: 'user-id' }
    });
    const res = createMockRes();

    await inventoryLifecycleController.markItemsAsDelivered(req, res);

    expect(inventoryLifecycleService.markItemsAsDeliveredForInvoice).toHaveBeenCalledWith(
      'invoice-id',
      'user-id',
      undefined
    );
  });
});

describe('InventoryLifecycleController - Invoice Lifecycle Status', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return invoice lifecycle status', async () => {
    const mockStatus = {
      invoiceId: 'invoice-id',
      currentStatus: 'Paid',
      items: [
        { id: 'item-1', inventoryStatus: 'Sold' }
      ]
    };

    invoiceLifecycleService.getInvoiceLifecycleStatus.mockResolvedValue(mockStatus);

    const req = createMockReq({
      params: { invoiceId: 'invoice-id' }
    });
    const res = createMockRes();

    await inventoryLifecycleController.getInvoiceLifecycleStatus(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockStatus
    });
    expect(invoiceLifecycleService.getInvoiceLifecycleStatus).toHaveBeenCalledWith('invoice-id');
  });
});

describe('InventoryLifecycleController - Cleanup Expired Reservations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should cleanup expired reservations', async () => {
    const mockResult = {
      cleanedCount: 5,
      expiredItems: []
    };

    inventoryLifecycleService.cleanupExpiredReservations.mockResolvedValue(mockResult);

    const req = createMockReq();
    const res = createMockRes();

    await inventoryLifecycleController.cleanupExpiredReservations(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Cleaned up 5 expired reservations',
      data: mockResult
    });
  });
});

describe('InventoryLifecycleController - Lifecycle Dashboard', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return lifecycle dashboard data', async () => {
    const mockDashboard = {
      statusStatistics: {
        Available: 100,
        Reserved: 20,
        Sold: 50,
        Delivered: 30
      },
      recentChanges: [],
      pendingReservations: [],
      inconsistencyAlerts: [],
      summary: {
        totalItems: 200,
        reservedItems: 20,
        soldItems: 50,
        deliveredItems: 30,
        inconsistencyCount: 0
      }
    };

    prismaMock.item.groupBy.mockResolvedValue([
      { inventoryStatus: 'Available', _count: { inventoryStatus: 100 } },
      { inventoryStatus: 'Reserved', _count: { inventoryStatus: 20 } },
      { inventoryStatus: 'Sold', _count: { inventoryStatus: 50 } },
      { inventoryStatus: 'Delivered', _count: { inventoryStatus: 30 } }
    ]);

    prismaMock.inventoryStatusHistory.findMany.mockResolvedValue([]);
    prismaMock.item.findMany.mockResolvedValue([]);

    const req = createMockReq();
    const res = createMockRes();

    await inventoryLifecycleController.getLifecycleDashboard(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        statusStatistics: expect.any(Object),
        summary: expect.objectContaining({
          totalItems: expect.any(Number)
        })
      })
    });
  });
});

describe('InventoryLifecycleController - Error Handling', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should propagate service errors', async () => {
    inventoryLifecycleService.reserveItemsForInvoice.mockRejectedValue(
      new Error('Items already reserved')
    );

    const req = createMockReq({
      body: { itemIds: ['item-1'], invoiceId: 'invoice-id' }
    });
    const res = createMockRes();

    await expect(inventoryLifecycleController.reserveItemsForInvoice(req, res))
      .rejects
      .toThrow('Items already reserved');
  });

  it('should handle validation errors with proper status codes', async () => {
    const error = new Error('Invalid transition');
    error.status = 400;

    inventoryLifecycleService.markItemsAsSoldForInvoice.mockRejectedValue(error);

    const req = createMockReq({
      body: { invoiceId: 'invoice-id' }
    });
    const res = createMockRes();

    await expect(inventoryLifecycleController.markItemsAsSold(req, res))
      .rejects
      .toThrow('Invalid transition');
  });
});
