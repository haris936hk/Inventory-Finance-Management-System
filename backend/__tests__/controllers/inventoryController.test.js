/**
 * Comprehensive Test Suite for inventoryController.js
 *
 * Coverage:
 * - HTTP Request/Response handling
 * - Input validation and sanitization
 * - Error handling and status codes
 * - Service integration
 * - Query parameter parsing
 * - Authentication context (req.user)
 */

const inventoryController = require('../../src/controllers/inventoryController');
const inventoryService = require('../../src/services/inventoryService');

// Mock the services
jest.mock('../../src/services/inventoryService');
jest.mock('../../src/services/purchaseOrderService', () => ({
  checkAndUpdateDeliveryStatus: jest.fn()
}));

// Helper to create mock request/response objects
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

describe('InventoryController - Category Management', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCategories', () => {
    it('should return all categories with success response', async () => {
      const mockCategories = [global.testData.category];
      inventoryService.getCategories.mockResolvedValue(mockCategories);

      const req = createMockReq();
      const res = createMockRes();

      await inventoryController.getCategories(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 1,
        data: mockCategories
      });
      expect(inventoryService.getCategories).toHaveBeenCalled();
    });

    it('should handle empty category list', async () => {
      inventoryService.getCategories.mockResolvedValue([]);

      const req = createMockReq();
      const res = createMockRes();

      await inventoryController.getCategories(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 0,
        data: []
      });
    });
  });

  describe('getCategory', () => {
    it('should return category by ID', async () => {
      const mockCategory = global.testData.category;
      inventoryService.getCategoryById.mockResolvedValue(mockCategory);

      const req = createMockReq({ params: { id: global.testData.categoryId } });
      const res = createMockRes();

      await inventoryController.getCategory(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockCategory
      });
      expect(inventoryService.getCategoryById).toHaveBeenCalledWith(global.testData.categoryId);
    });

    it('should throw error if category not found', async () => {
      inventoryService.getCategoryById.mockResolvedValue(null);

      const req = createMockReq({ params: { id: 'non-existent-id' } });
      const res = createMockRes();

      // The controller uses asyncHandler, so errors are thrown
      await expect(inventoryController.getCategory(req, res))
        .rejects
        .toThrow('Category not found');
    });
  });

  describe('createCategory', () => {
    it('should create category with 201 status', async () => {
      const categoryData = {
        name: 'Electronics',
        code: 'ELEC'
      };

      const createdCategory = {
        id: global.testData.categoryId,
        ...categoryData
      };

      inventoryService.createCategory.mockResolvedValue(createdCategory);

      const req = createMockReq({ body: categoryData });
      const res = createMockRes();

      await inventoryController.createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: createdCategory
      });
      expect(inventoryService.createCategory).toHaveBeenCalledWith(categoryData);
    });
  });

  describe('updateCategory', () => {
    it('should update category successfully', async () => {
      const updateData = { name: 'Updated Electronics' };
      const updatedCategory = {
        ...global.testData.category,
        ...updateData
      };

      inventoryService.updateCategory.mockResolvedValue(updatedCategory);

      const req = createMockReq({
        params: { id: global.testData.categoryId },
        body: updateData
      });
      const res = createMockRes();

      await inventoryController.updateCategory(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: updatedCategory
      });
      expect(inventoryService.updateCategory).toHaveBeenCalledWith(
        global.testData.categoryId,
        updateData
      );
    });
  });

  describe('deleteCategory', () => {
    it('should delete category successfully', async () => {
      inventoryService.deleteCategory.mockResolvedValue({
        id: global.testData.categoryId,
        deletedAt: new Date()
      });

      const req = createMockReq({ params: { id: global.testData.categoryId } });
      const res = createMockRes();

      await inventoryController.deleteCategory(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Category deleted successfully'
      });
      expect(inventoryService.deleteCategory).toHaveBeenCalledWith(global.testData.categoryId);
    });
  });
});

describe('InventoryController - Item Management', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getItems', () => {
    it('should return items with applied filters', async () => {
      const mockItems = [global.testData.item];
      inventoryService.getItems.mockResolvedValue(mockItems);

      const req = createMockReq({
        query: {
          serialNumber: 'ELEC',
          status: 'In Store',
          categoryId: global.testData.categoryId
        }
      });
      const res = createMockRes();

      await inventoryController.getItems(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 1,
        data: mockItems
      });

      expect(inventoryService.getItems).toHaveBeenCalledWith(
        expect.objectContaining({
          serialNumber: 'ELEC',
          status: 'In Store',
          categoryId: global.testData.categoryId
        })
      );
    });

    it('should handle date range filters', async () => {
      inventoryService.getItems.mockResolvedValue([]);

      const req = createMockReq({
        query: {
          inboundFrom: '2025-01-01',
          inboundTo: '2025-01-31'
        }
      });
      const res = createMockRes();

      await inventoryController.getItems(req, res);

      expect(inventoryService.getItems).toHaveBeenCalledWith(
        expect.objectContaining({
          inboundFrom: '2025-01-01',
          inboundTo: '2025-01-31'
        })
      );
    });
  });

  describe('getItem', () => {
    it('should return item by serial number', async () => {
      const mockItem = global.testData.item;
      inventoryService.getItemBySerialNumber.mockResolvedValue(mockItem);

      const req = createMockReq({ params: { serialNumber: 'ELEC-2025-0001' } });
      const res = createMockRes();

      await inventoryController.getItem(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockItem
      });
      expect(inventoryService.getItemBySerialNumber).toHaveBeenCalledWith('ELEC-2025-0001');
    });

    it('should throw 404 if item not found', async () => {
      inventoryService.getItemBySerialNumber.mockResolvedValue(null);

      const req = createMockReq({ params: { serialNumber: 'NON-EXISTENT' } });
      const res = createMockRes();

      await expect(inventoryController.getItem(req, res))
        .rejects
        .toThrow('Item not found');
    });
  });

  describe('createItem', () => {
    it('should create item with user ID from request', async () => {
      const itemData = {
        modelId: global.testData.modelId,
        condition: 'New'
      };

      const createdItem = {
        ...global.testData.item,
        ...itemData
      };

      inventoryService.createItem.mockResolvedValue(createdItem);

      const req = createMockReq({
        body: itemData,
        user: { id: 'test-user-id' }
      });
      const res = createMockRes();

      await inventoryController.createItem(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: createdItem
      });
      expect(inventoryService.createItem).toHaveBeenCalledWith(itemData, 'test-user-id');
    });
  });

  describe('bulkCreateItems', () => {
    it('should create multiple items without PO', async () => {
      const itemsData = [
        { modelId: global.testData.modelId, condition: 'New', serialNumber: 'ELEC-2025-0001' },
        { modelId: global.testData.modelId, condition: 'New', serialNumber: 'ELEC-2025-0002' }
      ];

      const bulkResult = {
        success: [
          { serialNumber: 'ELEC-2025-0001', id: 'item-1' },
          { serialNumber: 'ELEC-2025-0002', id: 'item-2' }
        ],
        failed: []
      };

      inventoryService.bulkCreateItems.mockResolvedValue(bulkResult);

      const req = createMockReq({
        body: { items: itemsData },
        user: { id: 'user-id' }
      });
      const res = createMockRes();

      await inventoryController.bulkCreateItems(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: bulkResult
      });
      expect(inventoryService.bulkCreateItems).toHaveBeenCalledWith(itemsData, 'user-id');
    });

    it('should create items from PO and update delivery status', async () => {
      const purchaseOrderService = require('../../src/services/purchaseOrderService');
      const itemsData = [
        { modelId: global.testData.modelId, condition: 'New' }
      ];

      const bulkResult = {
        success: [{ serialNumber: 'ELEC-2025-0001', id: 'item-1' }],
        failed: [],
        purchaseOrder: { id: 'po-id', status: 'Paid' }
      };

      inventoryService.bulkCreateItemsFromPO.mockResolvedValue(bulkResult);
      purchaseOrderService.checkAndUpdateDeliveryStatus.mockResolvedValue({});

      const req = createMockReq({
        body: { items: itemsData, purchaseOrderId: 'po-id' },
        user: { id: 'user-id' }
      });
      const res = createMockRes();

      await inventoryController.bulkCreateItems(req, res);

      expect(inventoryService.bulkCreateItemsFromPO).toHaveBeenCalledWith('po-id', itemsData, 'user-id');
      expect(purchaseOrderService.checkAndUpdateDeliveryStatus).toHaveBeenCalledWith('po-id', 'user-id');
    });

    it('should throw error if items array not provided', async () => {
      const req = createMockReq({
        body: { purchaseOrderId: 'po-id' }
      });
      const res = createMockRes();

      await expect(inventoryController.bulkCreateItems(req, res))
        .rejects
        .toThrow('Items array required');
    });

    it('should throw error if items is not an array', async () => {
      const req = createMockReq({
        body: { items: 'not-an-array' }
      });
      const res = createMockRes();

      await expect(inventoryController.bulkCreateItems(req, res))
        .rejects
        .toThrow('Items array required');
    });
  });

  describe('updateItemStatus', () => {
    it('should update item status with user ID', async () => {
      const statusData = {
        status: 'Sold',
        notes: 'Sold to customer'
      };

      const updatedItem = {
        ...global.testData.item,
        status: 'Sold'
      };

      inventoryService.updateItemStatus.mockResolvedValue(updatedItem);

      const req = createMockReq({
        params: { serialNumber: 'ELEC-2025-0001' },
        body: statusData,
        user: { id: 'user-id' }
      });
      const res = createMockRes();

      await inventoryController.updateItemStatus(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: updatedItem
      });
      expect(inventoryService.updateItemStatus).toHaveBeenCalledWith(
        'ELEC-2025-0001',
        statusData,
        'user-id'
      );
    });
  });

  describe('deleteItem', () => {
    it('should delete item successfully', async () => {
      inventoryService.deleteItem.mockResolvedValue({
        message: 'Item deleted successfully'
      });

      const req = createMockReq({ params: { id: 'item-id' } });
      const res = createMockRes();

      await inventoryController.deleteItem(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Item deleted successfully'
      });
      expect(inventoryService.deleteItem).toHaveBeenCalledWith('item-id');
    });
  });

  describe('getStockSummary', () => {
    it('should return comprehensive stock summary', async () => {
      const mockSummary = {
        totalItems: 100,
        availableItems: 75,
        statusSummary: {
          'In Store': 50,
          'Sold': 25,
          'Delivered': 25
        },
        categorySummary: {
          'Electronics': { total: 50, available: 40 }
        },
        totalValue: 10000000
      };

      inventoryService.getStockSummary.mockResolvedValue(mockSummary);

      const req = createMockReq();
      const res = createMockRes();

      await inventoryController.getStockSummary(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockSummary
      });
    });
  });

  describe('checkSerialNumber', () => {
    it('should return exists:true if serial number exists', async () => {
      inventoryService.checkSerialNumberExists.mockResolvedValue(true);

      const req = createMockReq({ params: { serialNumber: 'ELEC-2025-0001' } });
      const res = createMockRes();

      await inventoryController.checkSerialNumber(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        exists: true,
        serialNumber: 'ELEC-2025-0001'
      });
    });

    it('should return exists:false if serial number does not exist', async () => {
      inventoryService.checkSerialNumberExists.mockResolvedValue(false);

      const req = createMockReq({ params: { serialNumber: 'NON-EXISTENT' } });
      const res = createMockRes();

      await inventoryController.checkSerialNumber(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        exists: false,
        serialNumber: 'NON-EXISTENT'
      });
    });
  });
});

describe('InventoryController - Vendor Management', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getVendors', () => {
    it('should return all vendors', async () => {
      const mockVendors = [global.testData.vendor];
      inventoryService.getVendors.mockResolvedValue(mockVendors);

      const req = createMockReq();
      const res = createMockRes();

      await inventoryController.getVendors(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 1,
        data: mockVendors
      });
    });
  });

  describe('getVendor', () => {
    it('should return vendor by ID', async () => {
      const mockVendor = global.testData.vendor;
      inventoryService.getVendorById.mockResolvedValue(mockVendor);

      const req = createMockReq({ params: { id: global.testData.vendorId } });
      const res = createMockRes();

      await inventoryController.getVendor(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockVendor
      });
    });

    it('should throw 404 if vendor not found', async () => {
      inventoryService.getVendorById.mockResolvedValue(null);

      const req = createMockReq({ params: { id: 'non-existent-id' } });
      const res = createMockRes();

      await expect(inventoryController.getVendor(req, res))
        .rejects
        .toThrow('Vendor not found');
    });
  });

  describe('createVendor', () => {
    it('should create vendor with 201 status', async () => {
      const vendorData = {
        name: 'Tech Supplies Ltd',
        code: 'TSL'
      };

      const createdVendor = {
        id: global.testData.vendorId,
        ...vendorData
      };

      inventoryService.createVendor.mockResolvedValue(createdVendor);

      const req = createMockReq({ body: vendorData });
      const res = createMockRes();

      await inventoryController.createVendor(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: createdVendor
      });
    });
  });
});

describe('InventoryController - Error Handling', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should propagate service errors', async () => {
    inventoryService.getCategories.mockRejectedValue(new Error('Database connection failed'));

    const req = createMockReq();
    const res = createMockRes();

    await expect(inventoryController.getCategories(req, res))
      .rejects
      .toThrow('Database connection failed');
  });

  it('should handle validation errors from service', async () => {
    const error = new Error('Category name or code already exists');
    error.status = 400;
    inventoryService.createCategory.mockRejectedValue(error);

    const req = createMockReq({ body: { name: 'Duplicate', code: 'DUP' } });
    const res = createMockRes();

    await expect(inventoryController.createCategory(req, res))
      .rejects
      .toThrow('Category name or code already exists');
  });
});
