const InventoryService = require('../src/services/inventoryService');

// Mock the generateId utility
jest.mock('../src/utils/generateId', () => ({
  generateSerialNumber: jest.fn(() => 'TEST-12345')
}));

describe('InventoryService', () => {
  let inventoryService;

  beforeEach(() => {
    inventoryService = new InventoryService();
  });

  describe('Category Management', () => {
    describe('createCategory', () => {
      it('should create a new category successfully', async () => {
        const categoryData = {
          name: 'Test Category',
          code: 'TC',
          description: 'Test description'
        };

        mockPrisma.productCategory.findFirst.mockResolvedValue(null);
        mockPrisma.productCategory.create.mockResolvedValue({
          id: '123',
          ...categoryData,
          createdAt: new Date(),
          updatedAt: new Date()
        });

        const result = await inventoryService.createCategory(categoryData);

        expect(mockPrisma.productCategory.findFirst).toHaveBeenCalledWith({
          where: {
            OR: [
              { name: 'Test Category' },
              { code: 'TC' }
            ]
          }
        });
        expect(mockPrisma.productCategory.create).toHaveBeenCalledWith({
          data: categoryData
        });
        expect(result.name).toBe('Test Category');
      });

      it('should throw error when category name already exists', async () => {
        const categoryData = {
          name: 'Existing Category',
          code: 'EC'
        };

        mockPrisma.productCategory.findFirst.mockResolvedValue({
          id: '123',
          name: 'Existing Category'
        });

        await expect(inventoryService.createCategory(categoryData))
          .rejects.toThrow('Category name or code already exists');

        expect(mockPrisma.productCategory.create).not.toHaveBeenCalled();
      });

      it('should throw error when category code already exists', async () => {
        const categoryData = {
          name: 'New Category',
          code: 'EC'
        };

        mockPrisma.productCategory.findFirst.mockResolvedValue({
          id: '123',
          code: 'EC'
        });

        await expect(inventoryService.createCategory(categoryData))
          .rejects.toThrow('Category name or code already exists');

        expect(mockPrisma.productCategory.create).not.toHaveBeenCalled();
      });
    });

    describe('getCategories', () => {
      it('should return all active categories by default', async () => {
        const mockCategories = [
          { id: '1', name: 'Category 1', code: 'C1' },
          { id: '2', name: 'Category 2', code: 'C2' }
        ];

        const mockDb = require('../src/config/database');
        mockDb.findMany.mockResolvedValue(mockCategories);

        const result = await inventoryService.getCategories();

        expect(mockDb.findMany).toHaveBeenCalledWith('productCategory', {
          includeDeleted: false,
          orderBy: { name: 'asc' }
        });
        expect(result).toEqual(mockCategories);
      });

      it('should include deleted categories when requested', async () => {
        const mockCategories = [
          { id: '1', name: 'Category 1', code: 'C1', deletedAt: null },
          { id: '2', name: 'Category 2', code: 'C2', deletedAt: new Date() }
        ];

        const mockDb = require('../src/config/database');
        mockDb.findMany.mockResolvedValue(mockCategories);

        const result = await inventoryService.getCategories(true);

        expect(mockDb.findMany).toHaveBeenCalledWith('productCategory', {
          includeDeleted: true,
          orderBy: { name: 'asc' }
        });
        expect(result).toEqual(mockCategories);
      });
    });

    describe('getCategoryById', () => {
      it('should return category with models and companies', async () => {
        const mockCategory = {
          id: '123',
          name: 'Test Category',
          code: 'TC',
          models: [
            {
              id: '456',
              name: 'Model 1',
              company: {
                id: '789',
                name: 'Company 1'
              }
            }
          ]
        };

        mockPrisma.productCategory.findUnique.mockResolvedValue(mockCategory);

        const result = await inventoryService.getCategoryById('123');

        expect(mockPrisma.productCategory.findUnique).toHaveBeenCalledWith({
          where: { id: '123' },
          include: {
            models: {
              include: {
                company: true
              }
            }
          }
        });
        expect(result).toEqual(mockCategory);
      });

      it('should return null for non-existent category', async () => {
        mockPrisma.productCategory.findUnique.mockResolvedValue(null);

        const result = await inventoryService.getCategoryById('nonexistent');

        expect(result).toBeNull();
      });
    });
  });

  describe('Company Management', () => {
    describe('createCompany', () => {
      it('should create a new company successfully', async () => {
        const companyData = {
          name: 'Test Company',
          code: 'TC',
          email: 'test@company.com',
          phone: '1234567890'
        };

        mockPrisma.company.findFirst.mockResolvedValue(null);
        mockPrisma.company.create.mockResolvedValue({
          id: '123',
          ...companyData,
          createdAt: new Date(),
          updatedAt: new Date()
        });

        const result = await inventoryService.createCompany(companyData);

        expect(mockPrisma.company.findFirst).toHaveBeenCalledWith({
          where: {
            OR: [
              { name: 'Test Company' },
              { code: 'TC' }
            ]
          }
        });
        expect(mockPrisma.company.create).toHaveBeenCalledWith({
          data: companyData
        });
        expect(result.name).toBe('Test Company');
      });
    });
  });

  describe('Item Management', () => {
    describe('createItem', () => {
      it('should create a new item with generated serial number', async () => {
        const itemData = {
          categoryId: 'cat-123',
          modelId: 'model-123',
          condition: 'New',
          status: 'In Store',
          specifications: { voltage: '48V' },
          createdById: 'user-123'
        };

        mockPrisma.item.findUnique.mockResolvedValue(null);
        mockPrisma.item.create.mockResolvedValue({
          id: 'item-123',
          serialNumber: 'TEST-12345',
          ...itemData,
          inboundDate: new Date(),
          createdAt: new Date()
        });

        const result = await inventoryService.createItem(itemData);

        expect(mockPrisma.item.findUnique).toHaveBeenCalledWith({
          where: { serialNumber: 'TEST-12345' }
        });
        expect(mockPrisma.item.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            ...itemData,
            serialNumber: 'TEST-12345',
            inboundDate: expect.any(Date),
            statusHistory: expect.any(Array)
          })
        });
        expect(result.serialNumber).toBe('TEST-12345');
      });

      it('should throw error when serial number already exists', async () => {
        const itemData = {
          categoryId: 'cat-123',
          modelId: 'model-123',
          createdById: 'user-123'
        };

        mockPrisma.item.findUnique.mockResolvedValue({
          id: 'existing-item',
          serialNumber: 'TEST-12345'
        });

        await expect(inventoryService.createItem(itemData))
          .rejects.toThrow('Serial number already exists');

        expect(mockPrisma.item.create).not.toHaveBeenCalled();
      });
    });

    describe('updateItemStatus', () => {
      it('should update item status and add to history', async () => {
        const existingItem = {
          id: 'item-123',
          serialNumber: 'TEST-12345',
          status: 'In Store',
          statusHistory: []
        };

        const updateData = {
          status: 'In Hand',
          notes: 'Moved to technician',
          userId: 'user-123'
        };

        mockPrisma.item.findUnique.mockResolvedValue(existingItem);
        mockPrisma.item.update.mockResolvedValue({
          ...existingItem,
          status: 'In Hand',
          statusHistory: [
            {
              status: 'In Hand',
              date: expect.any(Date),
              userId: 'user-123',
              notes: 'Moved to technician'
            }
          ]
        });

        const result = await inventoryService.updateItemStatus('TEST-12345', updateData);

        expect(mockPrisma.item.findUnique).toHaveBeenCalledWith({
          where: { serialNumber: 'TEST-12345' }
        });
        expect(mockPrisma.item.update).toHaveBeenCalledWith({
          where: { serialNumber: 'TEST-12345' },
          data: {
            status: 'In Hand',
            statusHistory: expect.arrayContaining([
              expect.objectContaining({
                status: 'In Hand',
                userId: 'user-123',
                notes: 'Moved to technician'
              })
            ])
          }
        });
        expect(result.status).toBe('In Hand');
      });

      it('should throw error for non-existent item', async () => {
        mockPrisma.item.findUnique.mockResolvedValue(null);

        const updateData = {
          status: 'In Hand',
          userId: 'user-123'
        };

        await expect(inventoryService.updateItemStatus('NONEXISTENT', updateData))
          .rejects.toThrow('Item not found');

        expect(mockPrisma.item.update).not.toHaveBeenCalled();
      });
    });
  });

  describe('Stock Summary', () => {
    describe('getStockSummary', () => {
      it('should return stock summary by status and category', async () => {
        const mockSummary = [
          {
            status: 'In Store',
            category: { name: 'Battery', code: 'BAT' },
            _count: { id: 10 }
          },
          {
            status: 'Sold',
            category: { name: 'Battery', code: 'BAT' },
            _count: { id: 5 }
          }
        ];

        mockPrisma.item.groupBy.mockResolvedValue(mockSummary);

        const result = await inventoryService.getStockSummary();

        expect(mockPrisma.item.groupBy).toHaveBeenCalledWith({
          by: ['status', 'categoryId'],
          _count: { id: true },
          where: { deletedAt: null },
          include: {
            category: {
              select: {
                name: true,
                code: true
              }
            }
          }
        });
        expect(result).toEqual(mockSummary);
      });
    });
  });

  describe('Bulk Operations', () => {
    describe('bulkCreateItems', () => {
      it('should create multiple items in a transaction', async () => {
        const itemsData = [
          {
            categoryId: 'cat-123',
            modelId: 'model-123',
            condition: 'New',
            status: 'In Store',
            createdById: 'user-123'
          },
          {
            categoryId: 'cat-123',
            modelId: 'model-456',
            condition: 'New',
            status: 'In Store',
            createdById: 'user-123'
          }
        ];

        const mockCreatedItems = itemsData.map((item, index) => ({
          id: `item-${index}`,
          serialNumber: `TEST-${index}`,
          ...item,
          inboundDate: new Date(),
          createdAt: new Date()
        }));

        mockPrisma.$transaction.mockResolvedValue(mockCreatedItems);

        const result = await inventoryService.bulkCreateItems(itemsData);

        expect(mockPrisma.$transaction).toHaveBeenCalled();
        expect(result).toHaveLength(2);
      });

      it('should validate all items before creating any', async () => {
        const itemsData = [
          {
            categoryId: 'cat-123',
            modelId: 'model-123',
            createdById: 'user-123'
          },
          {
            // Missing required fields
            categoryId: 'cat-123'
          }
        ];

        await expect(inventoryService.bulkCreateItems(itemsData))
          .rejects.toThrow('Invalid item data');

        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      });
    });
  });

  describe('Search and Filter', () => {
    describe('searchItems', () => {
      it('should search items by serial number', async () => {
        const mockItems = [
          {
            id: 'item-123',
            serialNumber: 'TEST-12345',
            status: 'In Store'
          }
        ];

        mockPrisma.item.findMany.mockResolvedValue(mockItems);

        const result = await inventoryService.searchItems({
          serialNumber: 'TEST-12345'
        });

        expect(mockPrisma.item.findMany).toHaveBeenCalledWith({
          where: {
            AND: [
              { deletedAt: null },
              { serialNumber: { contains: 'TEST-12345', mode: 'insensitive' } }
            ]
          },
          include: expect.any(Object),
          orderBy: { createdAt: 'desc' }
        });
        expect(result).toEqual(mockItems);
      });

      it('should search items by status', async () => {
        const mockItems = [
          {
            id: 'item-123',
            serialNumber: 'TEST-12345',
            status: 'In Store'
          },
          {
            id: 'item-456',
            serialNumber: 'TEST-67890',
            status: 'In Store'
          }
        ];

        mockPrisma.item.findMany.mockResolvedValue(mockItems);

        const result = await inventoryService.searchItems({
          status: 'In Store'
        });

        expect(mockPrisma.item.findMany).toHaveBeenCalledWith({
          where: {
            AND: [
              { deletedAt: null },
              { status: 'In Store' }
            ]
          },
          include: expect.any(Object),
          orderBy: { createdAt: 'desc' }
        });
        expect(result).toEqual(mockItems);
      });

      it('should search items by category', async () => {
        const mockItems = [
          {
            id: 'item-123',
            serialNumber: 'TEST-12345',
            categoryId: 'cat-123'
          }
        ];

        mockPrisma.item.findMany.mockResolvedValue(mockItems);

        const result = await inventoryService.searchItems({
          categoryId: 'cat-123'
        });

        expect(mockPrisma.item.findMany).toHaveBeenCalledWith({
          where: {
            AND: [
              { deletedAt: null },
              { categoryId: 'cat-123' }
            ]
          },
          include: expect.any(Object),
          orderBy: { createdAt: 'desc' }
        });
        expect(result).toEqual(mockItems);
      });
    });
  });
});