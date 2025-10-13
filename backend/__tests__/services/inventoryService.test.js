/**
 * Comprehensive Test Suite for inventoryService.js
 *
 * Coverage:
 * - Category Management: Create, Read, Update, Delete, Validation
 * - Company Management: Create, Read, Update, Delete, Validation
 * - Model Management: Create, Read, Update, Delete, Validation
 * - Item Management: Create, Read, Update, Delete, Status Updates, Serial Numbers
 * - Vendor Management: Create, Read, Update, Delete
 * - Bulk Operations: Bulk create, PO-linked bulk create
 * - Stock Calculations: Summary, availability
 * - History Tracking: Item history, movements
 * - Edge Cases: Concurrency, validation, constraints, soft deletes
 */

const inventoryService = require('../../src/services/inventoryService');
const db = require('../../src/config/database');
const { generateSerialNumber } = require('../../src/utils/generateId');

describe('InventoryService - Category Management', () => {
  describe('createCategory', () => {
    it('should create a new category successfully', async () => {
      const categoryData = {
        name: 'Electronics',
        code: 'ELEC',
        description: 'Electronic items'
      };

      prismaMock.productCategory.findFirst.mockResolvedValue(null);
      prismaMock.productCategory.create.mockResolvedValue({
        id: global.testData.categoryId,
        ...categoryData,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      });

      const result = await inventoryService.createCategory(categoryData);

      expect(result).toHaveProperty('id');
      expect(result.name).toBe(categoryData.name);
      expect(result.code).toBe(categoryData.code);
      expect(prismaMock.productCategory.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: categoryData.name },
            { code: categoryData.code }
          ]
        }
      });
      expect(prismaMock.productCategory.create).toHaveBeenCalledWith({
        data: categoryData
      });
    });

    it('should throw error if category name already exists', async () => {
      const categoryData = {
        name: 'Electronics',
        code: 'ELEC2'
      };

      prismaMock.productCategory.findFirst.mockResolvedValue({
        id: global.testData.categoryId,
        name: 'Electronics',
        code: 'ELEC'
      });

      await expect(inventoryService.createCategory(categoryData))
        .rejects
        .toThrow('Category name or code already exists');
    });

    it('should throw error if category code already exists', async () => {
      const categoryData = {
        name: 'Electronics2',
        code: 'ELEC'
      };

      prismaMock.productCategory.findFirst.mockResolvedValue({
        id: global.testData.categoryId,
        name: 'Electronics',
        code: 'ELEC'
      });

      await expect(inventoryService.createCategory(categoryData))
        .rejects
        .toThrow('Category name or code already exists');
    });

    it('should handle Prisma P2002 unique constraint error', async () => {
      const categoryData = {
        name: 'Electronics',
        code: 'ELEC'
      };

      prismaMock.productCategory.findFirst.mockResolvedValue(null);
      prismaMock.productCategory.create.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['name'] }
      });

      await expect(inventoryService.createCategory(categoryData))
        .rejects
        .toThrow('Category name or code already exists');
    });
  });

  describe('getCategories', () => {
    it('should return all non-deleted categories', async () => {
      const mockCategories = [
        { ...global.testData.category, models: [] }
      ];

      db.findMany = jest.fn().mockResolvedValue(mockCategories);

      const result = await inventoryService.getCategories();

      expect(result).toEqual(mockCategories);
      expect(db.findMany).toHaveBeenCalledWith('productCategory', {
        includeDeleted: false,
        orderBy: { name: 'asc' },
        include: {
          models: {
            where: { deletedAt: null }
          }
        }
      });
    });

    it('should return all categories including deleted when requested', async () => {
      db.findMany = jest.fn().mockResolvedValue([global.testData.category]);

      await inventoryService.getCategories(true);

      expect(db.findMany).toHaveBeenCalledWith('productCategory', {
        includeDeleted: true,
        orderBy: { name: 'asc' },
        include: {
          models: {
            where: { deletedAt: null }
          }
        }
      });
    });
  });

  describe('getCategoryById', () => {
    it('should return category with models', async () => {
      const mockCategory = {
        ...global.testData.category,
        models: [{ ...global.testData.model, company: global.testData.company }]
      };

      prismaMock.productCategory.findUnique.mockResolvedValue(mockCategory);

      const result = await inventoryService.getCategoryById(global.testData.categoryId);

      expect(result).toEqual(mockCategory);
      expect(prismaMock.productCategory.findUnique).toHaveBeenCalledWith({
        where: { id: global.testData.categoryId },
        include: {
          models: {
            include: {
              company: true
            }
          }
        }
      });
    });

    it('should return null if category not found', async () => {
      prismaMock.productCategory.findUnique.mockResolvedValue(null);

      const result = await inventoryService.getCategoryById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('updateCategory', () => {
    it('should update category successfully', async () => {
      const updateData = { name: 'Updated Electronics', description: 'Updated description' };
      const updatedCategory = {
        ...global.testData.category,
        ...updateData
      };

      prismaMock.productCategory.update.mockResolvedValue(updatedCategory);

      const result = await inventoryService.updateCategory(global.testData.categoryId, updateData);

      expect(result.name).toBe(updateData.name);
      expect(prismaMock.productCategory.update).toHaveBeenCalledWith({
        where: { id: global.testData.categoryId },
        data: updateData
      });
    });
  });

  describe('deleteCategory', () => {
    it('should soft delete category when no related models or items exist', async () => {
      prismaMock.productCategory.findUnique.mockResolvedValue({
        ...global.testData.category,
        _count: {
          models: 0,
          items: 0
        }
      });

      prismaMock.productCategory.update.mockResolvedValue({
        ...global.testData.category,
        deletedAt: new Date()
      });

      const result = await inventoryService.deleteCategory(global.testData.categoryId);

      expect(result.deletedAt).not.toBeNull();
      expect(prismaMock.productCategory.update).toHaveBeenCalledWith({
        where: { id: global.testData.categoryId },
        data: { deletedAt: expect.any(Date) }
      });
    });

    it('should throw error if category not found', async () => {
      prismaMock.productCategory.findUnique.mockResolvedValue(null);

      await expect(inventoryService.deleteCategory('non-existent-id'))
        .rejects
        .toThrow('Category not found');
    });

    it('should throw error if category has associated models', async () => {
      prismaMock.productCategory.findUnique.mockResolvedValue({
        ...global.testData.category,
        _count: {
          models: 5,
          items: 0
        }
      });

      await expect(inventoryService.deleteCategory(global.testData.categoryId))
        .rejects
        .toThrow('Cannot delete category with associated models or items');
    });

    it('should throw error if category has associated items', async () => {
      prismaMock.productCategory.findUnique.mockResolvedValue({
        ...global.testData.category,
        _count: {
          models: 0,
          items: 10
        }
      });

      await expect(inventoryService.deleteCategory(global.testData.categoryId))
        .rejects
        .toThrow('Cannot delete category with associated models or items');
    });
  });
});

describe('InventoryService - Company Management', () => {
  describe('createCompany', () => {
    it('should create a new company successfully', async () => {
      const companyData = {
        name: 'Apple Inc',
        code: 'APPL',
        email: 'contact@apple.com',
        phone: '1234567890'
      };

      prismaMock.company.findFirst.mockResolvedValue(null);
      prismaMock.company.create.mockResolvedValue({
        id: global.testData.companyId,
        ...companyData,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      });

      const result = await inventoryService.createCompany(companyData);

      expect(result).toHaveProperty('id');
      expect(result.name).toBe(companyData.name);
      expect(result.code).toBe(companyData.code);
    });

    it('should throw error if company name already exists', async () => {
      const companyData = {
        name: 'Apple Inc',
        code: 'APPL2'
      };

      prismaMock.company.findFirst.mockResolvedValue({
        id: global.testData.companyId,
        name: 'Apple Inc',
        code: 'APPL'
      });

      await expect(inventoryService.createCompany(companyData))
        .rejects
        .toThrow('Company name or code already exists');
    });
  });

  describe('getCompanies', () => {
    it('should return all companies with models', async () => {
      const mockCompanies = [
        { ...global.testData.company, models: [] }
      ];

      db.findMany = jest.fn().mockResolvedValue(mockCompanies);

      const result = await inventoryService.getCompanies();

      expect(result).toEqual(mockCompanies);
      expect(db.findMany).toHaveBeenCalledWith('company', {
        includeDeleted: false,
        orderBy: { name: 'asc' },
        include: {
          models: {
            where: { deletedAt: null }
          }
        }
      });
    });
  });

  describe('getCompanyById', () => {
    it('should return company with models', async () => {
      const mockCompany = {
        ...global.testData.company,
        models: [{ ...global.testData.model, category: global.testData.category }]
      };

      prismaMock.company.findUnique.mockResolvedValue(mockCompany);

      const result = await inventoryService.getCompanyById(global.testData.companyId);

      expect(result).toEqual(mockCompany);
    });
  });

  describe('deleteCompany', () => {
    it('should soft delete company when no models exist', async () => {
      prismaMock.company.findUnique.mockResolvedValue({
        ...global.testData.company,
        models: []
      });

      prismaMock.company.update.mockResolvedValue({
        ...global.testData.company,
        deletedAt: new Date()
      });

      const result = await inventoryService.deleteCompany(global.testData.companyId);

      expect(result.deletedAt).not.toBeNull();
    });

    it('should throw error if company has existing models', async () => {
      prismaMock.company.findUnique.mockResolvedValue({
        ...global.testData.company,
        models: [global.testData.model]
      });

      await expect(inventoryService.deleteCompany(global.testData.companyId))
        .rejects
        .toThrow('Cannot delete company with existing product models');
    });

    it('should throw error if company not found', async () => {
      prismaMock.company.findUnique.mockResolvedValue(null);

      await expect(inventoryService.deleteCompany('non-existent-id'))
        .rejects
        .toThrow('Company not found');
    });
  });
});

describe('InventoryService - Product Model Management', () => {
  describe('createModel', () => {
    it('should create a new product model successfully', async () => {
      const modelData = {
        name: 'iPhone 15 Pro',
        code: 'IP15P',
        description: 'Latest iPhone model',
        categoryId: global.testData.categoryId,
        companyId: global.testData.companyId
      };

      prismaMock.productModel.findUnique.mockResolvedValue(null);
      prismaMock.productModel.create.mockResolvedValue({
        id: global.testData.modelId,
        ...modelData,
        isActive: true,
        category: global.testData.category,
        company: global.testData.company,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      });

      const result = await inventoryService.createModel(modelData);

      expect(result).toHaveProperty('id');
      expect(result.name).toBe(modelData.name);
      expect(result.code).toBe(modelData.code);
      expect(result.category).toBeDefined();
      expect(result.company).toBeDefined();
    });

    it('should throw error if model code already exists', async () => {
      const modelData = {
        name: 'iPhone 15 Pro',
        code: 'IP15P',
        categoryId: global.testData.categoryId,
        companyId: global.testData.companyId
      };

      prismaMock.productModel.findUnique.mockResolvedValue({
        id: global.testData.modelId,
        code: 'IP15P'
      });

      await expect(inventoryService.createModel(modelData))
        .rejects
        .toThrow('Model code already exists');
    });
  });

  describe('getModels', () => {
    it('should return all models without filters', async () => {
      const mockModels = [
        {
          ...global.testData.model,
          category: global.testData.category,
          company: global.testData.company,
          items: []
        }
      ];

      prismaMock.productModel.findMany.mockResolvedValue(mockModels);

      const result = await inventoryService.getModels();

      expect(result).toEqual(mockModels);
      expect(prismaMock.productModel.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        include: {
          category: true,
          company: true,
          items: {
            where: { deletedAt: null },
            select: { id: true }
          }
        },
        orderBy: { name: 'asc' }
      });
    });

    it('should filter models by categoryId', async () => {
      prismaMock.productModel.findMany.mockResolvedValue([global.testData.model]);

      await inventoryService.getModels({ categoryId: global.testData.categoryId });

      expect(prismaMock.productModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            categoryId: global.testData.categoryId
          }
        })
      );
    });

    it('should filter models by companyId', async () => {
      prismaMock.productModel.findMany.mockResolvedValue([global.testData.model]);

      await inventoryService.getModels({ companyId: global.testData.companyId });

      expect(prismaMock.productModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            companyId: global.testData.companyId
          }
        })
      );
    });
  });

  describe('updateModel', () => {
    it('should update model successfully', async () => {
      const updateData = {
        name: 'Updated Model Name',
        description: 'Updated description'
      };

      prismaMock.productModel.findUnique
        .mockResolvedValueOnce(global.testData.model);

      prismaMock.productModel.update.mockResolvedValue({
        ...global.testData.model,
        ...updateData,
        category: global.testData.category,
        company: global.testData.company
      });

      const result = await inventoryService.updateModel(global.testData.modelId, updateData);

      expect(result.name).toBe(updateData.name);
      expect(result.description).toBe(updateData.description);
    });

    it('should throw error if model not found', async () => {
      prismaMock.productModel.findUnique.mockResolvedValue(null);

      await expect(inventoryService.updateModel('non-existent-id', { name: 'Test' }))
        .rejects
        .toThrow('Model not found');
    });

    it('should throw error if updating to existing code', async () => {
      prismaMock.productModel.findUnique
        .mockResolvedValueOnce(global.testData.model)
        .mockResolvedValueOnce({ id: 'different-id', code: 'NEWCODE' });

      await expect(inventoryService.updateModel(global.testData.modelId, { code: 'NEWCODE' }))
        .rejects
        .toThrow('Model code already exists');
    });
  });

  describe('deleteModel', () => {
    it('should soft delete model when no items exist', async () => {
      prismaMock.productModel.findUnique.mockResolvedValue({
        ...global.testData.model,
        _count: {
          items: 0
        }
      });

      prismaMock.productModel.update.mockResolvedValue({
        ...global.testData.model,
        deletedAt: new Date()
      });

      const result = await inventoryService.deleteModel(global.testData.modelId);

      expect(result.deletedAt).not.toBeNull();
    });

    it('should throw error if model has associated items', async () => {
      prismaMock.productModel.findUnique.mockResolvedValue({
        ...global.testData.model,
        _count: {
          items: 5
        }
      });

      await expect(inventoryService.deleteModel(global.testData.modelId))
        .rejects
        .toThrow('Cannot delete model with associated inventory items');
    });
  });
});

describe('InventoryService - Item Management', () => {
  describe('createItem', () => {
    it('should create a new item with generated serial number', async () => {
      const itemData = {
        modelId: global.testData.modelId,
        condition: 'New',
        status: 'In Store',
        specifications: { color: 'Black', storage: '256GB' },
        purchasePrice: 150000,
        sellingPrice: 180000,
        purchaseDate: new Date()
      };

      prismaMock.productModel.findUnique.mockResolvedValue({
        ...global.testData.model,
        category: global.testData.category
      });

      prismaMock.item.findUnique.mockResolvedValue(null);
      prismaMock.warehouse.findFirst.mockResolvedValue(global.testData.warehouse);

      const createdItem = {
        ...global.testData.item,
        serialNumber: 'ELEC-2025-0001',
        ...itemData,
        category: global.testData.category,
        model: { ...global.testData.model, company: global.testData.company }
      };

      prismaMock.item.create.mockResolvedValue(createdItem);

      const result = await inventoryService.createItem(itemData, global.testData.userId);

      expect(result).toHaveProperty('serialNumber');
      expect(result.condition).toBe(itemData.condition);
      expect(result.status).toBe(itemData.status);
      expect(generateSerialNumber).toHaveBeenCalled();
    });

    it('should create item with provided serial number', async () => {
      const itemData = {
        serialNumber: 'CUSTOM-2025-0001',
        modelId: global.testData.modelId,
        condition: 'New'
      };

      prismaMock.productModel.findUnique.mockResolvedValue({
        ...global.testData.model,
        category: global.testData.category
      });

      prismaMock.item.findUnique.mockResolvedValue(null);
      prismaMock.warehouse.findFirst.mockResolvedValue(global.testData.warehouse);
      prismaMock.item.create.mockResolvedValue({
        ...global.testData.item,
        ...itemData
      });

      const result = await inventoryService.createItem(itemData, global.testData.userId);

      expect(result.serialNumber).toBe('CUSTOM-2025-0001');
      expect(generateSerialNumber).not.toHaveBeenCalled();
    });

    it('should throw error if modelId is missing', async () => {
      const itemData = {
        condition: 'New'
      };

      await expect(inventoryService.createItem(itemData, global.testData.userId))
        .rejects
        .toThrow('Model ID and condition are required');
    });

    it('should throw error if condition is missing', async () => {
      const itemData = {
        modelId: global.testData.modelId
      };

      await expect(inventoryService.createItem(itemData, global.testData.userId))
        .rejects
        .toThrow('Model ID and condition are required');
    });

    it('should throw error if model not found', async () => {
      const itemData = {
        modelId: 'invalid-model-id',
        condition: 'New'
      };

      prismaMock.productModel.findUnique.mockResolvedValue(null);

      await expect(inventoryService.createItem(itemData, global.testData.userId))
        .rejects
        .toThrow('Invalid product model');
    });

    it('should throw error if serial number already exists', async () => {
      const itemData = {
        serialNumber: 'ELEC-2025-0001',
        modelId: global.testData.modelId,
        condition: 'New'
      };

      prismaMock.productModel.findUnique.mockResolvedValue({
        ...global.testData.model,
        category: global.testData.category
      });

      prismaMock.item.findUnique.mockResolvedValue({
        id: 'existing-item-id',
        serialNumber: 'ELEC-2025-0001'
      });

      await expect(inventoryService.createItem(itemData, global.testData.userId))
        .rejects
        .toThrow('Serial number ELEC-2025-0001 already exists');
    });

    it('should handle Prisma P2003 foreign key error', async () => {
      const itemData = {
        modelId: global.testData.modelId,
        condition: 'New'
      };

      prismaMock.productModel.findUnique.mockResolvedValue({
        ...global.testData.model,
        category: global.testData.category
      });

      prismaMock.item.findUnique.mockResolvedValue(null);
      prismaMock.warehouse.findFirst.mockResolvedValue(global.testData.warehouse);
      prismaMock.item.create.mockRejectedValue({
        code: 'P2003'
      });

      await expect(inventoryService.createItem(itemData, global.testData.userId))
        .rejects
        .toThrow('Invalid foreign key reference');
    });

    it('should handle Prisma P2002 unique constraint error', async () => {
      const itemData = {
        modelId: global.testData.modelId,
        condition: 'New'
      };

      prismaMock.productModel.findUnique.mockResolvedValue({
        ...global.testData.model,
        category: global.testData.category
      });

      prismaMock.item.findUnique.mockResolvedValue(null);
      prismaMock.warehouse.findFirst.mockResolvedValue(global.testData.warehouse);
      prismaMock.item.create.mockRejectedValue({
        code: 'P2002'
      });

      await expect(inventoryService.createItem(itemData, global.testData.userId))
        .rejects
        .toThrow('Serial number already exists');
    });
  });

  describe('getItems', () => {
    it('should return all items without filters', async () => {
      const mockItems = [
        {
          ...global.testData.item,
          category: global.testData.category,
          model: { ...global.testData.model, company: global.testData.company }
        }
      ];

      prismaMock.item.findMany.mockResolvedValue(mockItems);

      const result = await inventoryService.getItems();

      expect(result).toEqual(mockItems);
      expect(prismaMock.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null }
        })
      );
    });

    it('should filter items by serial number (case insensitive)', async () => {
      prismaMock.item.findMany.mockResolvedValue([global.testData.item]);

      await inventoryService.getItems({ serialNumber: 'elec-2025' });

      expect(prismaMock.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            serialNumber: {
              contains: 'elec-2025',
              mode: 'insensitive'
            }
          }
        })
      );
    });

    it('should filter items by status', async () => {
      prismaMock.item.findMany.mockResolvedValue([global.testData.item]);

      await inventoryService.getItems({ status: 'In Store' });

      expect(prismaMock.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            status: 'In Store'
          }
        })
      );
    });

    it('should filter items by categoryId', async () => {
      prismaMock.item.findMany.mockResolvedValue([global.testData.item]);

      await inventoryService.getItems({ categoryId: global.testData.categoryId });

      expect(prismaMock.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            categoryId: global.testData.categoryId
          }
        })
      );
    });

    it('should filter items by date range', async () => {
      const dateFrom = new Date('2025-01-01');
      const dateTo = new Date('2025-01-31');

      prismaMock.item.findMany.mockResolvedValue([global.testData.item]);

      await inventoryService.getItems({
        inboundFrom: dateFrom.toISOString(),
        inboundTo: dateTo.toISOString()
      });

      expect(prismaMock.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            inboundDate: {
              gte: dateFrom,
              lte: dateTo
            }
          })
        })
      );
    });

    it('should filter items by client phone', async () => {
      prismaMock.item.findMany.mockResolvedValue([global.testData.item]);

      await inventoryService.getItems({ clientPhone: '1234567890' });

      expect(prismaMock.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            customer: expect.objectContaining({
              phone: '1234567890'
            })
          })
        })
      );
    });
  });

  describe('getItemBySerialNumber', () => {
    it('should return item with full details', async () => {
      const mockItem = {
        ...global.testData.item,
        category: global.testData.category,
        model: { ...global.testData.model, company: global.testData.company },
        invoiceItems: [],
        handoverByUser: null,
        createdBy: { fullName: 'Admin User', username: 'admin' }
      };

      prismaMock.item.findUnique.mockResolvedValue(mockItem);

      const result = await inventoryService.getItemBySerialNumber('ELEC-2025-0001');

      expect(result).toEqual(mockItem);
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('model');
      expect(result).toHaveProperty('invoiceItems');
    });

    it('should return null if item not found', async () => {
      prismaMock.item.findUnique.mockResolvedValue(null);

      const result = await inventoryService.getItemBySerialNumber('NON-EXISTENT');

      expect(result).toBeNull();
    });
  });

  describe('updateItemStatus', () => {
    it('should update item status successfully', async () => {
      const statusData = {
        status: 'Sold',
        notes: 'Sold to customer',
        sellingPrice: 180000,
        customerId: global.testData.customerId
      };

      prismaMock.item.findUnique.mockResolvedValue(global.testData.item);

      const updatedItem = {
        ...global.testData.item,
        status: 'Sold',
        sellingPrice: 180000,
        statusHistory: [
          ...global.testData.item.statusHistory,
          {
            status: 'Sold',
            date: expect.any(Date),
            userId: global.testData.userId,
            notes: 'Sold to customer'
          }
        ]
      };

      prismaMock.item.update.mockResolvedValue(updatedItem);

      const result = await inventoryService.updateItemStatus(
        'ELEC-2025-0001',
        statusData,
        global.testData.userId
      );

      expect(result.status).toBe('Sold');
      expect(result.statusHistory).toHaveLength(2);
      expect(result.statusHistory[1].status).toBe('Sold');
    });

    it('should throw error if item not found', async () => {
      prismaMock.item.findUnique.mockResolvedValue(null);

      await expect(inventoryService.updateItemStatus('NON-EXISTENT', { status: 'Sold' }, global.testData.userId))
        .rejects
        .toThrow('Item not found');
    });

    it('should handle handover status with handover details', async () => {
      const statusData = {
        status: 'Handover',
        handoverTo: 'John Doe',
        handoverDetails: 'Delivered personally',
        customerId: global.testData.customerId
      };

      prismaMock.item.findUnique.mockResolvedValue(global.testData.item);
      prismaMock.item.update.mockResolvedValue({
        ...global.testData.item,
        status: 'Handover',
        handoverDate: expect.any(Date),
        handoverTo: 'John Doe'
      });

      const result = await inventoryService.updateItemStatus(
        'ELEC-2025-0001',
        statusData,
        global.testData.userId
      );

      expect(prismaMock.item.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'Handover',
            handoverTo: 'John Doe',
            handoverById: global.testData.userId,
            handoverDate: expect.any(Date)
          })
        })
      );
    });
  });

  describe('deleteItem', () => {
    it('should soft delete item successfully', async () => {
      prismaMock.item.findUnique.mockResolvedValue({
        ...global.testData.item,
        inventoryStatus: 'Available',
        invoiceItems: []
      });

      prismaMock.item.update.mockResolvedValue({
        ...global.testData.item,
        deletedAt: new Date()
      });

      const result = await inventoryService.deleteItem(global.testData.itemId);

      expect(result).toHaveProperty('message');
      expect(result.message).toBe('Item deleted successfully');
    });

    it('should throw error if item not found', async () => {
      prismaMock.item.findUnique.mockResolvedValue(null);

      await expect(inventoryService.deleteItem('non-existent-id'))
        .rejects
        .toThrow('Item not found');
    });

    it('should throw error if item is sold', async () => {
      prismaMock.item.findUnique.mockResolvedValue({
        ...global.testData.item,
        inventoryStatus: 'Sold',
        invoiceItems: []
      });

      await expect(inventoryService.deleteItem(global.testData.itemId))
        .rejects
        .toThrow('Cannot delete sold or delivered items');
    });

    it('should throw error if item is delivered', async () => {
      prismaMock.item.findUnique.mockResolvedValue({
        ...global.testData.item,
        inventoryStatus: 'Delivered',
        invoiceItems: []
      });

      await expect(inventoryService.deleteItem(global.testData.itemId))
        .rejects
        .toThrow('Cannot delete sold or delivered items');
    });

    it('should throw error if item is part of an invoice', async () => {
      prismaMock.item.findUnique.mockResolvedValue({
        ...global.testData.item,
        inventoryStatus: 'Available',
        invoiceItems: [{ id: 'invoice-item-id', invoiceId: 'invoice-id' }]
      });

      await expect(inventoryService.deleteItem(global.testData.itemId))
        .rejects
        .toThrow('Cannot delete item that is part of an invoice');
    });
  });

  describe('getStockSummary', () => {
    it('should return comprehensive stock summary', async () => {
      const mockItems = [
        { ...global.testData.item, status: 'In Store', sellingPrice: 100000 },
        { ...global.testData.item, id: 'item2', status: 'In Store', sellingPrice: 150000 },
        { ...global.testData.item, id: 'item3', status: 'Sold', sellingPrice: 120000 },
        { ...global.testData.item, id: 'item4', status: 'Delivered', sellingPrice: 130000 }
      ].map(item => ({
        ...item,
        category: global.testData.category,
        model: { ...global.testData.model, company: global.testData.company }
      }));

      prismaMock.item.findMany.mockResolvedValue(mockItems);

      const result = await inventoryService.getStockSummary();

      expect(result).toHaveProperty('totalItems', 4);
      expect(result).toHaveProperty('availableItems', 2);
      expect(result).toHaveProperty('statusSummary');
      expect(result).toHaveProperty('categorySummary');
      expect(result).toHaveProperty('totalValue');
      expect(result.statusSummary['In Store']).toBe(2);
      expect(result.statusSummary['Sold']).toBe(1);
      expect(result.statusSummary['Delivered']).toBe(1);
    });

    it('should calculate category-wise summary correctly', async () => {
      const mockItems = [
        { ...global.testData.item, status: 'In Store', category: { ...global.testData.category, name: 'Electronics' } },
        { ...global.testData.item, id: 'item2', status: 'Sold', category: { ...global.testData.category, name: 'Electronics' } },
        { ...global.testData.item, id: 'item3', status: 'In Store', category: { ...global.testData.category, id: 'cat2', name: 'Accessories' } }
      ].map(item => ({
        ...item,
        model: { ...global.testData.model, company: global.testData.company }
      }));

      prismaMock.item.findMany.mockResolvedValue(mockItems);

      const result = await inventoryService.getStockSummary();

      expect(result.categorySummary['Electronics']).toBeDefined();
      expect(result.categorySummary['Electronics'].total).toBe(2);
      expect(result.categorySummary['Electronics'].available).toBe(1);
      expect(result.categorySummary['Electronics'].sold).toBe(1);
      expect(result.categorySummary['Accessories']).toBeDefined();
      expect(result.categorySummary['Accessories'].total).toBe(1);
    });
  });

  describe('checkSerialNumberExists', () => {
    it('should return true if serial number exists', async () => {
      prismaMock.item.findUnique.mockResolvedValue({ id: global.testData.itemId });

      const result = await inventoryService.checkSerialNumberExists('ELEC-2025-0001');

      expect(result).toBe(true);
    });

    it('should return false if serial number does not exist', async () => {
      prismaMock.item.findUnique.mockResolvedValue(null);

      const result = await inventoryService.checkSerialNumberExists('NON-EXISTENT');

      expect(result).toBe(false);
    });

    it('should trim serial number before checking', async () => {
      prismaMock.item.findUnique.mockResolvedValue(null);

      await inventoryService.checkSerialNumberExists('  ELEC-2025-0001  ');

      expect(prismaMock.item.findUnique).toHaveBeenCalledWith({
        where: { serialNumber: 'ELEC-2025-0001' },
        select: { id: true }
      });
    });
  });
});

describe('InventoryService - Vendor Management', () => {
  describe('createVendor', () => {
    it('should create vendor successfully', async () => {
      const vendorData = {
        name: 'Tech Supplies Ltd',
        code: 'TSL',
        email: 'vendor@tech.com',
        phone: '1234567890'
      };

      prismaMock.vendor.findFirst.mockResolvedValue(null);
      prismaMock.vendor.create.mockResolvedValue({
        id: global.testData.vendorId,
        ...vendorData,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      });

      const result = await inventoryService.createVendor(vendorData);

      expect(result).toHaveProperty('id');
      expect(result.name).toBe(vendorData.name);
    });

    it('should throw error if vendor name already exists', async () => {
      prismaMock.vendor.findFirst.mockResolvedValue(global.testData.vendor);

      await expect(inventoryService.createVendor({ name: 'Tech Supplies Ltd', code: 'TSL2' }))
        .rejects
        .toThrow('Vendor name or code already exists');
    });
  });

  describe('getVendors', () => {
    it('should return all vendors with counts', async () => {
      const mockVendors = [{
        ...global.testData.vendor,
        _count: {
          items: 10,
          purchaseOrders: 5
        }
      }];

      db.findMany = jest.fn().mockResolvedValue(mockVendors);

      const result = await inventoryService.getVendors();

      expect(result).toEqual(mockVendors);
      expect(db.findMany).toHaveBeenCalledWith('vendor', expect.any(Object));
    });
  });

  describe('deleteVendor', () => {
    it('should soft delete vendor if no active purchase orders', async () => {
      prismaMock.vendor.findUnique.mockResolvedValue({
        ...global.testData.vendor,
        _count: {
          purchaseOrders: 0
        }
      });

      prismaMock.vendor.update.mockResolvedValue({
        ...global.testData.vendor,
        deletedAt: new Date()
      });

      const result = await inventoryService.deleteVendor(global.testData.vendorId);

      expect(result.deletedAt).not.toBeNull();
    });

    it('should throw error if vendor has active purchase orders', async () => {
      prismaMock.vendor.findUnique.mockResolvedValue({
        ...global.testData.vendor,
        _count: {
          purchaseOrders: 5
        }
      });

      await expect(inventoryService.deleteVendor(global.testData.vendorId))
        .rejects
        .toThrow('Cannot delete vendor with existing purchase orders');
    });
  });
});

describe('InventoryService - Bulk Operations', () => {
  describe('bulkCreateItems', () => {
    it('should create multiple items successfully', async () => {
      const itemsData = [
        { modelId: global.testData.modelId, condition: 'New', serialNumber: 'ELEC-2025-0001' },
        { modelId: global.testData.modelId, condition: 'New', serialNumber: 'ELEC-2025-0002' },
        { modelId: global.testData.modelId, condition: 'New', serialNumber: 'ELEC-2025-0003' }
      ];

      // Mock successful creation for all items
      prismaMock.productModel.findUnique.mockResolvedValue({
        ...global.testData.model,
        category: global.testData.category
      });
      prismaMock.item.findUnique.mockResolvedValue(null);
      prismaMock.warehouse.findFirst.mockResolvedValue(global.testData.warehouse);
      prismaMock.item.create.mockImplementation((params) =>
        Promise.resolve({
          ...global.testData.item,
          serialNumber: params.data.serialNumber,
          id: `item-${params.data.serialNumber}`
        })
      );

      const result = await inventoryService.bulkCreateItems(itemsData, global.testData.userId);

      expect(result.success).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
      expect(result.success[0]).toHaveProperty('serialNumber');
      expect(result.success[0]).toHaveProperty('id');
    });

    it('should handle partial failures gracefully', async () => {
      const itemsData = [
        { modelId: global.testData.modelId, condition: 'New', serialNumber: 'ELEC-2025-0001' },
        { modelId: global.testData.modelId, condition: 'New', serialNumber: 'ELEC-2025-0001' }, // Duplicate
        { modelId: global.testData.modelId, condition: 'New', serialNumber: 'ELEC-2025-0003' }
      ];

      prismaMock.productModel.findUnique.mockResolvedValue({
        ...global.testData.model,
        category: global.testData.category
      });
      prismaMock.warehouse.findFirst.mockResolvedValue(global.testData.warehouse);

      let callCount = 0;
      prismaMock.item.findUnique.mockImplementation(() => {
        callCount++;
        // Second call returns existing item (duplicate)
        if (callCount === 2) {
          return Promise.resolve({ id: 'existing-id', serialNumber: 'ELEC-2025-0001' });
        }
        return Promise.resolve(null);
      });

      prismaMock.item.create.mockImplementation((params) =>
        Promise.resolve({
          ...global.testData.item,
          serialNumber: params.data.serialNumber
        })
      );

      const result = await inventoryService.bulkCreateItems(itemsData, global.testData.userId);

      expect(result.success).toHaveLength(2);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]).toHaveProperty('error');
      expect(result.failed[0].error).toContain('already exists');
    });
  });

  describe('bulkCreateItemsFromPO', () => {
    it('should create items linked to purchase order', async () => {
      const purchaseOrderId = 'po-id-123';
      const itemsData = [
        {
          modelId: global.testData.modelId,
          condition: 'New',
          serialNumber: 'ELEC-2025-0001',
          lineItemId: 'line-item-1'
        },
        {
          modelId: global.testData.modelId,
          condition: 'New',
          serialNumber: 'ELEC-2025-0002',
          lineItemId: 'line-item-1'
        }
      ];

      const mockPO = {
        id: purchaseOrderId,
        poNumber: 'PO-2025-00001',
        status: 'Paid',
        vendorId: global.testData.vendorId,
        receivedQuantities: {},
        lineItems: [{ id: 'line-item-1', quantity: 5 }],
        vendor: global.testData.vendor
      };

      prismaMock.purchaseOrder.findUnique.mockResolvedValue(mockPO);
      prismaMock.productModel.findUnique.mockResolvedValue({
        ...global.testData.model,
        category: global.testData.category
      });
      prismaMock.item.findUnique.mockResolvedValue(null);
      prismaMock.warehouse.findFirst.mockResolvedValue(global.testData.warehouse);
      prismaMock.item.create.mockImplementation((params) =>
        Promise.resolve({
          ...global.testData.item,
          serialNumber: params.data.serialNumber,
          purchaseOrderId: params.data.purchaseOrderId
        })
      );

      prismaMock.purchaseOrder.update.mockResolvedValue({
        ...mockPO,
        receivedQuantities: { 'line-item-1': 2 }
      });

      const result = await inventoryService.bulkCreateItemsFromPO(purchaseOrderId, itemsData, global.testData.userId);

      expect(result.success).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.purchaseOrder).toBeDefined();
      expect(result.purchaseOrder.receivedQuantities['line-item-1']).toBe(2);
    });

    it('should throw error if PO not found', async () => {
      prismaMock.purchaseOrder.findUnique.mockResolvedValue(null);

      await expect(inventoryService.bulkCreateItemsFromPO('invalid-po-id', [], global.testData.userId))
        .rejects
        .toThrow('Purchase Order not found');
    });

    it('should throw error if PO status is invalid', async () => {
      const mockPO = {
        id: 'po-id',
        status: 'Cancelled',
        lineItems: [],
        vendor: global.testData.vendor
      };

      prismaMock.purchaseOrder.findUnique.mockResolvedValue(mockPO);

      await expect(inventoryService.bulkCreateItemsFromPO('po-id', [], global.testData.userId))
        .rejects
        .toThrow('Cannot receive items for PO in Cancelled status');
    });
  });
});

describe('InventoryService - Item History and Movements', () => {
  describe('getItemHistory', () => {
    it('should return status history for an item', async () => {
      const mockHistory = [
        {
          id: 'history-1',
          itemId: global.testData.itemId,
          fromStatus: 'Available',
          toStatus: 'Reserved',
          changeDate: new Date(),
          changedByUser: { id: global.testData.userId, username: 'admin', fullName: 'Admin User' }
        }
      ];

      prismaMock.item.findFirst.mockResolvedValue(global.testData.item);
      prismaMock.inventoryStatusHistory.findMany.mockResolvedValue(mockHistory);

      const result = await inventoryService.getItemHistory('ELEC-2025-0001');

      expect(result).toEqual(mockHistory);
      expect(prismaMock.inventoryStatusHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { itemId: global.testData.itemId },
          orderBy: { changeDate: 'desc' }
        })
      );
    });

    it('should throw error if item not found', async () => {
      prismaMock.item.findFirst.mockResolvedValue(null);

      await expect(inventoryService.getItemHistory('NON-EXISTENT'))
        .rejects
        .toThrow('Item not found');
    });
  });

  describe('getItemMovements', () => {
    it('should return movements for an item', async () => {
      const mockMovements = [
        {
          id: 'movement-1',
          itemId: global.testData.itemId,
          fromLocation: 'Warehouse A',
          toLocation: 'Warehouse B',
          createdAt: new Date(),
          user: { id: global.testData.userId, username: 'admin', fullName: 'Admin User' }
        }
      ];

      prismaMock.item.findFirst.mockResolvedValue(global.testData.item);
      prismaMock.inventoryMovement.findMany.mockResolvedValue(mockMovements);

      const result = await inventoryService.getItemMovements('ELEC-2025-0001');

      expect(result).toEqual(mockMovements);
      expect(prismaMock.inventoryMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { itemId: global.testData.itemId },
          orderBy: { createdAt: 'desc' }
        })
      );
    });

    it('should throw error if item not found', async () => {
      prismaMock.item.findFirst.mockResolvedValue(null);

      await expect(inventoryService.getItemMovements('NON-EXISTENT'))
        .rejects
        .toThrow('Item not found');
    });
  });
});
