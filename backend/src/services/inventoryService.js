// ========== src/services/inventoryService.js ==========
const db = require('../config/database');
const cache = require('../config/simpleCache');
const logger = require('../config/logger');
const { generateSerialNumber } = require('../utils/generateId');
const { withTransaction, formatAmount } = require('../utils/transactionWrapper');
const JournalEntryService = require('./journalEntryService');

class InventoryService {
  /**
   * Product Category Management
   */
  async createCategory(data) {
    const existing = await db.prisma.productCategory.findFirst({
      where: {
        OR: [
          { name: data.name },
          { code: data.code }
        ]
      }
    });

    if (existing) {
      const error = new Error('Category name or code already exists');
      error.status = 400;
      throw error;
    }

    try {
      const category = await db.prisma.productCategory.create({
        data
      });

      // Invalidate cache after mutation
      await cache.delPattern(cache.config.KEYS.CATEGORIES + '*');

      return category;
    } catch (error) {
      // Handle Prisma constraint errors
      if (error.code === 'P2002') {
        const constraintError = new Error('Category name or code already exists');
        constraintError.status = 400;
        throw constraintError;
      }
      throw error;
    }
  }

  async getCategories(includeDeleted = false) {
    // PERFORMANCE OPTIMIZATION: Cache dropdown data for 15 minutes
    const cacheKey = cache.config.KEYS.CATEGORIES + `all:${includeDeleted}`;

    return await cache.wrap(
      cacheKey,
      async () => {
        // Include models for list display
        return await db.findMany('productCategory', {
          includeDeleted,
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            isActive: true,
            models: {
              select: {
                id: true
              }
            }
          }
        });
      },
      cache.config.TTL.DROPDOWN
    );
  }

  async getCategoryById(id) {
    return await db.prisma.productCategory.findUnique({
      where: { id },
      include: {
        models: {
          include: {
            company: true
          }
        }
      }
    });
  }

  async updateCategory(id, data) {
    const category = await db.prisma.productCategory.update({
      where: { id },
      data
    });

    // Invalidate cache after mutation
    await cache.delPattern(cache.config.KEYS.CATEGORIES + '*');

    return category;
  }

  async deleteCategory(id) {
    // Check if category exists
    const existing = await db.prisma.productCategory.findUnique({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: {
            models: {
              where: { deletedAt: null }
            },
            items: true  // Items don't have deletedAt (hard delete model)
          }
        }
      }
    });

    if (!existing) {
      const error = new Error('Category not found');
      error.status = 404;
      throw error;
    }

    // Check if category has associated active models or items
    if (existing._count.models > 0 || existing._count.items > 0) {
      const error = new Error('Cannot delete category with associated models or items');
      error.status = 400;
      throw error;
    }

    // Soft delete
    const category = await db.prisma.productCategory.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    // Invalidate cache after mutation
    await cache.delPattern(cache.config.KEYS.CATEGORIES + '*');

    return category;
  }

  /**
   * Company/Make Management
   */
  async createCompany(data) {
    const existing = await db.prisma.company.findFirst({
      where: {
        OR: [
          { name: data.name },
          { code: data.code }
        ]
      }
    });

    if (existing) {
      const error = new Error('Company name or code already exists');
      error.status = 400;
      throw error;
    }

    const company = await db.prisma.company.create({
      data
    });

    // Invalidate cache after mutation
    await cache.delPattern(cache.config.KEYS.COMPANIES + '*');

    return company;
  }

  async getCompanies(includeDeleted = false) {
    // PERFORMANCE OPTIMIZATION: Cache dropdown data for 15 minutes
    const cacheKey = cache.config.KEYS.COMPANIES + `all:${includeDeleted}`;

    return await cache.wrap(
      cacheKey,
      async () => {
        // Include models for list display
        return await db.findMany('company', {
          includeDeleted,
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            isActive: true,
            models: {
              select: {
                id: true
              }
            }
          }
        });
      },
      cache.config.TTL.DROPDOWN
    );
  }

  async getCompanyById(id) {
    return await db.prisma.company.findUnique({
      where: { id },
      include: {
        models: {
          include: {
            category: true
          }
        }
      }
    });
  }

  async updateCompany(id, data) {
    const company = await db.prisma.company.update({
      where: { id },
      data
    });

    // Invalidate cache after mutation
    await cache.delPattern(cache.config.KEYS.COMPANIES + '*');

    return company;
  }

  async deleteCompany(id) {
    // Check if company exists and has any related active models
    const companyWithRelations = await db.prisma.company.findUnique({
      where: { id, deletedAt: null },
      include: {
        models: {
          where: { deletedAt: null }
        }
      }
    });

    if (!companyWithRelations) {
      const error = new Error('Company not found');
      error.status = 404;
      throw error;
    }

    if (companyWithRelations.models && companyWithRelations.models.length > 0) {
      const error = new Error('Cannot delete company with existing product models. Please delete or reassign the models first.');
      error.status = 400;
      throw error;
    }

    // Soft delete
    const company = await db.prisma.company.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    // Invalidate cache after mutation
    await cache.delPattern(cache.config.KEYS.COMPANIES + '*');

    return company;
  }

  /**
   * Product Model Management
   */
  async createModel(data) {
    const existing = await db.prisma.productModel.findUnique({
      where: { code: data.code }
    });

    if (existing) {
      const error = new Error('Model code already exists');
      error.status = 400;
      throw error;
    }

    const model = await db.prisma.productModel.create({
      data: {
        name: data.name,
        code: data.code,
        description: data.description,
        categoryId: data.categoryId,
        companyId: data.companyId
      },
      include: {
        category: true,
        company: true
      }
    });

    // Invalidate cache after mutation
    await cache.delPattern(cache.config.KEYS.MODELS + '*');

    return model;
  }

  async getModels(filters = {}) {
    // PERFORMANCE OPTIMIZATION: Cache dropdown data for 15 minutes
    const filterKey = `${filters.categoryId || 'all'}:${filters.companyId || 'all'}`;
    const cacheKey = cache.config.KEYS.MODELS + filterKey;

    return await cache.wrap(
      cacheKey,
      async () => {
        const where = { deletedAt: null };

        if (filters.categoryId) {
          where.categoryId = filters.categoryId;
        }

        if (filters.companyId) {
          where.companyId = filters.companyId;
        }

        // Include items for list display
        return await db.prisma.productModel.findMany({
          where,
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            isActive: true,
            categoryId: true,
            companyId: true,
            category: {
              select: { id: true, name: true, code: true }
            },
            company: {
              select: { id: true, name: true, code: true }
            },
            items: {
              select: {
                id: true
              }
            }
          },
          orderBy: { name: 'asc' }
        });
      },
      cache.config.TTL.DROPDOWN
    );
  }

  async updateModel(id, data) {
    // Check if model exists
    const existing = await db.prisma.productModel.findUnique({
      where: { id, deletedAt: null }
    });

    if (!existing) {
      const error = new Error('Model not found');
      error.status = 404;
      throw error;
    }

    // Check if code is being changed and if it conflicts
    if (data.code && data.code !== existing.code) {
      const codeExists = await db.prisma.productModel.findUnique({
        where: { code: data.code, deletedAt: null }
      });

      if (codeExists) {
        const error = new Error('Model code already exists');
        error.status = 400;
        throw error;
      }
    }

    const model = await db.prisma.productModel.update({
      where: { id },
      data: {
        name: data.name,
        code: data.code,
        description: data.description,
        categoryId: data.categoryId,
        companyId: data.companyId,
        isActive: data.isActive
      },
      include: {
        category: true,
        company: true
      }
    });

    // Invalidate cache after mutation
    await cache.delPattern(cache.config.KEYS.MODELS + '*');

    return model;
  }

  async deleteModel(id) {
    // Check if model exists
    const existing = await db.prisma.productModel.findUnique({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: { items: true }
        }
      }
    });

    if (!existing) {
      const error = new Error('Model not found');
      error.status = 404;
      throw error;
    }

    // Check if model has associated items
    if (existing._count.items > 0) {
      const error = new Error('Cannot delete model with associated inventory items');
      error.status = 400;
      throw error;
    }

    // Soft delete
    const model = await db.prisma.productModel.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    // Invalidate cache after mutation
    await cache.delPattern(cache.config.KEYS.MODELS + '*');

    return model;
  }

  /**
   * Item Management (Core Inventory)
   */
  async createItem(itemData, userId) {
    // Validate required fields
    if (!itemData.modelId || !itemData.condition) {
      const error = new Error('Model ID and condition are required');
      error.status = 400;
      throw error;
    }

    // Validate model exists first
    const model = await db.prisma.productModel.findUnique({
      where: { id: itemData.modelId },
      include: { category: true }
    });

    if (!model) {
      const error = new Error('Invalid product model');
      error.status = 400;
      throw error;
    }

    // Generate serial number if not provided
    if (!itemData.serialNumber) {
      const year = new Date().getFullYear();
      itemData.serialNumber = await generateSerialNumber(model.category.code, year);
    }

    // Validate serial number uniqueness
    const existing = await db.prisma.item.findUnique({
      where: {
        serialNumber: itemData.serialNumber
      }
    });

    if (existing) {
      const error = new Error(`Serial number ${itemData.serialNumber} already exists`);
      error.status = 400;
      throw error;
    }

    // Automatically determine status based on condition
    const condition = itemData.condition || 'New';
    const autoStatus = condition === 'Used' ? 'In Lab' : 'In Store';

    // Set repaired status for "In Lab" items
    const repairedStatus = autoStatus === 'In Lab' ? 'No' : null;

    // Set inventory status: Used items in lab get "Under Repair", new items get "Available"
    const inventoryStatus = autoStatus === 'In Lab' ? 'Under Repair' : 'Available';

    // Create item with initial status
    try {
      const item = await db.prisma.item.create({
        data: {
          serialNumber: itemData.serialNumber,
          condition: condition,
          status: autoStatus,
          repaired: repairedStatus,
          inventoryStatus: inventoryStatus,
          statusHistory: [{
            status: autoStatus,
            date: new Date(),
            userId,
            notes: 'Initial entry'
          }],
          specifications: itemData.specifications,
          purchasePrice: itemData.purchasePrice,
          sellingPrice: itemData.sellingPrice,
          purchaseDate: itemData.purchaseDate,
          inboundDate: itemData.inboundDate || new Date(),
          categoryId: model.category.id,
          modelId: itemData.modelId,
          vendorId: itemData.vendorId,
          purchaseOrderId: itemData.purchaseOrderId,
          createdById: userId
        },
        include: {
          category: true,
          model: {
            include: {
              company: true
            }
          },
          vendor: true
        }
      });

      logger.info(`Item created: ${item.serialNumber}`);
      return item;
    } catch (error) {
      // Handle Prisma constraint errors
      if (error.code === 'P2003') {
        const constraintError = new Error('Invalid foreign key reference');
        constraintError.status = 400;
        throw constraintError;
      }
      if (error.code === 'P2002') {
        const constraintError = new Error('Serial number already exists');
        constraintError.status = 400;
        throw constraintError;
      }
      throw error;
    }
  }

  async deleteItem(id) {
    // Find item by ID
    const item = await db.prisma.item.findUnique({
      where: { id },
      include: {
        invoiceItems: true
      }
    });

    if (!item) {
      const error = new Error('Item not found');
      error.status = 404;
      throw error;
    }

    // Check if item is sold or has invoice items
    if (item.inventoryStatus === 'Sold' || item.inventoryStatus === 'Delivered') {
      const error = new Error('Cannot delete sold or delivered items');
      error.status = 400;
      throw error;
    }

    if (item.invoiceItems && item.invoiceItems.length > 0) {
      const error = new Error('Cannot delete item that is part of an invoice');
      error.status = 400;
      throw error;
    }

    // Hard delete the item and its related records
    // Delete related records first (to avoid foreign key constraints)
    await db.prisma.$transaction(async (prisma) => {
      // Delete item reservations
      await prisma.itemReservation.deleteMany({
        where: { itemId: id }
      });

      // Delete inventory movements
      await prisma.inventoryMovement.deleteMany({
        where: { itemId: id }
      });

      // Delete inventory status history
      await prisma.inventoryStatusHistory.deleteMany({
        where: { itemId: id }
      });

      // Finally delete the item
      await prisma.item.delete({
        where: { id }
      });
    });

    logger.info(`Item hard deleted: ${item.serialNumber}`);
    return { message: 'Item deleted successfully' };
  }

  async getItems(filters = {}) {
    const where = {};
    const andConditions = [];

    // Filter for invoice-available items only
    if (filters.availableForInvoice) {
      andConditions.push({
        OR: [
          { status: 'In Store' },
          { status: 'In Lab', repaired: 'Yes' }
        ]
      });
    }

    // Apply AND conditions if any exist
    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    // Apply filters
    if (filters.serialNumber) {
      where.serialNumber = {
        contains: filters.serialNumber,
        mode: 'insensitive'
      };
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    if (filters.modelId) {
      where.modelId = filters.modelId;
    }

    if (filters.vendorId) {
      where.vendorId = filters.vendorId;
    }

    // Date range filters
    if (filters.inboundFrom || filters.inboundTo) {
      where.inboundDate = {};
      if (filters.inboundFrom) {
        where.inboundDate.gte = new Date(filters.inboundFrom);
      }
      if (filters.inboundTo) {
        where.inboundDate.lte = new Date(filters.inboundTo);
      }
    }

    // Customer filters
    if (filters.clientPhone || filters.clientName) {
      where.customer = {};
      if (filters.clientPhone) {
        where.customer.phone = filters.clientPhone;
      }
      if (filters.clientName) {
        where.customer.name = {
          contains: filters.clientName,
          mode: 'insensitive'
        };
      }
    }

    // PERFORMANCE OPTIMIZATION: Add pagination support
    const page = filters.page ? parseInt(filters.page) : 1;
    const limit = filters.limit ? parseInt(filters.limit) : 100; // Default 100 items per page
    const skip = (page - 1) * limit;

    // Run queries in parallel for better performance
    const [items, totalCount] = await Promise.all([
      db.prisma.item.findMany({
        where,
        // OPTIMIZED: Use selective field loading instead of full includes
        // Removed redundant model.category (already have item.category)
        // Removed invoiceItems from list view (only needed in detail view)
        select: {
          id: true,
          serialNumber: true,
          condition: true,
          inventoryStatus: true,
          status: true,
          repaired: true,
          purchasePrice: true,
          sellingPrice: true,
          inboundDate: true,
          outboundDate: true,
          handoverTo: true,
          handoverToPhone: true,
          handoverDate: true,
          createdAt: true,
          updatedAt: true,
          // Related data with selective fields
          category: {
            select: { id: true, name: true, code: true }
          },
          model: {
            select: {
              id: true,
              name: true,
              code: true,
              company: {
                select: { id: true, name: true, code: true }
              }
            }
          },
          vendor: {
            select: { id: true, name: true, code: true }
          },
          customer: {
            select: { id: true, name: true, phone: true, company: true }
          },
          // Minimal invoiceItems for frontend fallback (reserved items)
          invoiceItems: {
            select: {
              invoice: {
                select: {
                  customer: {
                    select: { id: true, name: true, phone: true, company: true }
                  }
                }
              }
            },
            take: 1,
            orderBy: { createdAt: 'desc' }
          },
          handoverByUser: {
            select: { id: true, fullName: true }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: limit,
      }),
      // Get total count for pagination
      db.prisma.item.count({ where }),
    ]);

    // Return paginated response
    return {
      items,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: skip + items.length < totalCount,
      },
    };
  }

  async getItemBySerialNumber(serialNumber) {
    return await db.prisma.item.findUnique({
      where: { serialNumber },
      include: {
        category: true,
        model: {
          include: {
            company: true,
            category: true
          }
        },
        vendor: true,
        customer: true,
        invoiceItems: {
          include: {
            invoice: {
              include: {
                customer: true
              }
            }
          }
        },
        handoverByUser: true,
        createdBy: {
          select: {
            fullName: true,
            username: true
          }
        }
      }
    });
  }

  async updateItemStatus(serialNumber, statusData, userId) {
    const item = await db.prisma.item.findUnique({
      where: { serialNumber },
      include: {
        invoiceItems: {
          include: {
            invoice: true
          }
        }
      }
    });

    if (!item) {
      throw new Error('Item not found');
    }

    // Validate: Only allow "Handover" (items cannot move between In Store/In Lab)
    if (statusData.status !== 'Handover') {
      throw new Error('Only "Handover" status is allowed. Items cannot move between "In Store" and "In Lab".');
    }

    // Validate handover fields when status is Handover
    if (statusData.status === 'Handover') {
      if (!statusData.handoverTo || !statusData.handoverToNIC || !statusData.handoverToPhone) {
        throw new Error('Handover requires: handoverTo, handoverToNIC, and handoverToPhone');
      }
    }

    // Build status history entry
    const historyEntry = {
      status: statusData.status,
      date: new Date(),
      userId,
      notes: statusData.notes || ''
    };

    // Update data
    const updateData = {
      status: statusData.status,
      statusHistory: [...(item.statusHistory || []), historyEntry]
    };

    // Handle Handover status
    if (statusData.status === 'Handover') {
      updateData.outboundDate = new Date();
      updateData.handoverDate = new Date();
      updateData.handoverTo = statusData.handoverTo;
      updateData.handoverToNIC = statusData.handoverToNIC;
      updateData.handoverToPhone = statusData.handoverToPhone;
      updateData.handoverById = userId;
      updateData.handoverDetails = statusData.handoverDetails || null;

      // Automatically update business status to Delivered
      updateData.inventoryStatus = 'Delivered';

      // Find related invoice and update to Delivered
      const invoiceItem = item.invoiceItems && item.invoiceItems.length > 0
        ? item.invoiceItems[0]
        : null;

      if (invoiceItem && invoiceItem.invoice) {
        await db.prisma.invoice.update({
          where: { id: invoiceItem.invoice.id },
          data: { status: 'Delivered' }
        });

        logger.info(`Invoice ${invoiceItem.invoice.invoiceNumber} automatically marked as Delivered due to item handover`);
      }

      // Create inventory movement record
      await db.prisma.inventoryMovement.create({
        data: {
          itemId: item.id,
          movementType: 'HANDOVER',
          fromStatus: item.status,
          toStatus: 'Handover',
          userId: userId,
          notes: statusData.handoverDetails || `Handover to ${statusData.handoverTo}`,
          reference: invoiceItem?.invoice?.invoiceNumber || null
        }
      });
    }

    const updatedItem = await db.prisma.item.update({
      where: { serialNumber },
      data: updateData,
      include: {
        category: true,
        model: {
          include: {
            company: true
          }
        },
        vendor: true,
        customer: true,
        handoverByUser: true
      }
    });

    logger.info(`Item ${serialNumber} status updated to ${statusData.status}`);
    return updatedItem;
  }

  /**
   * Update repaired status for "In Lab" items
   */
  async updateRepairedStatus(serialNumber, repairedStatus, userId) {
    const item = await db.prisma.item.findUnique({
      where: { serialNumber }
    });

    if (!item) {
      throw new Error('Item not found');
    }

    // Validate: Item must be "In Lab"
    if (item.status !== 'In Lab') {
      throw new Error('Only items in "In Lab" status can have their repaired status updated');
    }

    // Validate: Only allow "Yes" and "Returned"
    const allowedStatuses = ['Yes', 'Returned'];
    if (!allowedStatuses.includes(repairedStatus)) {
      throw new Error('Invalid repaired status. Only "Yes" and "Returned" are allowed.');
    }

    // Validate transitions: No→Yes, No→Returned, Yes→Returned
    const currentRepaired = item.repaired || 'No';
    const validTransitions = {
      'No': ['Yes', 'Returned'],
      'Yes': ['Returned'],
      'Returned': [] // Cannot change from Returned
    };

    if (!validTransitions[currentRepaired].includes(repairedStatus)) {
      throw new Error(`Cannot change repaired status from "${currentRepaired}" to "${repairedStatus}"`);
    }

    // Determine new inventory status based on repaired status change
    let newInventoryStatus = item.inventoryStatus;
    if (repairedStatus === 'Yes') {
      // Item is now repaired and ready to sell
      newInventoryStatus = 'Available';
    }
    // Note: If repairedStatus is 'Returned', keep inventoryStatus as "Under Repair" (item is defective)

    // Build status history entry
    const historyEntry = {
      status: item.status,
      repaired: repairedStatus,
      date: new Date(),
      userId,
      notes: `Repaired status changed from "${currentRepaired}" to "${repairedStatus}"`
    };

    // Update item
    const updatedItem = await db.prisma.item.update({
      where: { serialNumber },
      data: {
        repaired: repairedStatus,
        inventoryStatus: newInventoryStatus,
        statusHistory: [...(item.statusHistory || []), historyEntry]
      },
      include: {
        category: true,
        model: {
          include: {
            company: true
          }
        },
        vendor: true,
        customer: true
      }
    });

    logger.info(`Item ${serialNumber} repaired status updated to ${repairedStatus}`);
    return updatedItem;
  }

  /**
   * Stock calculations - OPTIMIZED with groupBy aggregation
   */
  async getStockSummary() {
    // Run all aggregations in parallel for better performance
    const [
      totalItems,
      availableItems,
      statusGroups,
      categoryGroups,
      totalValueResult,
    ] = await Promise.all([
      // Total items count
      db.prisma.item.count(),
      // Available items count
      db.prisma.item.count({
        where: {
          status: { in: ['In Store', 'In Hand', 'In Lab'] }
        }
      }),
      // Group by status
      db.prisma.item.groupBy({
        by: ['status'],
        _count: { id: true }
      }),
      // Group by category and inventory status
      db.prisma.item.groupBy({
        by: ['categoryId', 'inventoryStatus'],
        _count: { id: true }
      }),
      // Calculate total value
      db.prisma.item.aggregate({
        _sum: {
          sellingPrice: true,
          purchasePrice: true,
        }
      }),
    ]);

    // Transform status groups to object
    const statusSummary = Object.fromEntries(
      statusGroups.map(group => [group.status, group._count.id])
    );

    // Fetch category names for the groups we have
    const categoryIds = [...new Set(categoryGroups.map(g => g.categoryId))];
    const categories = await db.prisma.productCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true }
    });
    const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

    // Transform category groups to nested object
    const categorySummary = {};
    categoryGroups.forEach(group => {
      const categoryName = categoryMap[group.categoryId] || 'Unknown';
      if (!categorySummary[categoryName]) {
        categorySummary[categoryName] = {
          total: 0,
          available: 0,
          sold: 0,
          delivered: 0
        };
      }

      categorySummary[categoryName].total += group._count.id;

      if (group.inventoryStatus === 'Available') {
        categorySummary[categoryName].available += group._count.id;
      } else if (group.inventoryStatus === 'Sold') {
        categorySummary[categoryName].sold += group._count.id;
      } else if (group.inventoryStatus === 'Delivered') {
        categorySummary[categoryName].delivered += group._count.id;
      }
    });

    // Calculate total value (sum of selling or purchase prices)
    const totalValue = parseFloat(totalValueResult._sum.sellingPrice || 0) +
                       parseFloat(totalValueResult._sum.purchasePrice || 0);

    return {
      totalItems,
      availableItems,
      statusSummary,
      categorySummary,
      totalValue
    };
  }

  /**
   * Vendor Management
   */
  async createVendor(data) {
    const existing = await db.prisma.vendor.findFirst({
      where: {
        OR: [
          { name: data.name },
          { code: data.code }
        ]
      }
    });

    if (existing) {
      throw new Error('Vendor name or code already exists');
    }

    // Use transaction to create vendor + opening balance ledger entry atomically
    const vendor = await withTransaction(async (tx) => {
      // Create vendor
      const newVendor = await tx.vendor.create({
        data
      });

      // Create opening balance ledger entry if opening balance exists
      if (data.openingBalance && parseFloat(data.openingBalance) !== 0) {
        const openingBalanceAmount = formatAmount(parseFloat(data.openingBalance));

        await tx.vendorLedger.create({
          data: {
            vendorId: newVendor.id,
            entryDate: new Date(),
            description: 'Opening Balance',
            debit: openingBalanceAmount > 0 ? openingBalanceAmount : 0,
            credit: openingBalanceAmount < 0 ? Math.abs(openingBalanceAmount) : 0,
            balance: openingBalanceAmount
          }
        });

        logger.info(`Opening balance ledger entry created for vendor: ${newVendor.name}`, {
          vendorId: newVendor.id,
          openingBalance: openingBalanceAmount
        });

        // Create journal entries for opening balance (DR: Opening Balance Equity, CR: A/P)
        try {
          await JournalEntryService.createVendorOpeningBalanceEntries(tx, {
            vendorId: newVendor.id,
            vendorName: newVendor.name,
            amount: openingBalanceAmount,
            entryDate: new Date()
          });
        } catch (error) {
          logger.error('Failed to create opening balance journal entries for vendor', {
            vendorId: newVendor.id,
            vendorName: newVendor.name,
            error: error.message
          });
          // Don't fail vendor creation if journal entries fail - can be fixed manually
        }
      }

      return newVendor;
    });

    // Invalidate cache after mutation
    await cache.delPattern(cache.config.KEYS.VENDORS + '*');

    return vendor;
  }

  async getVendors(includeDeleted = false) {
    // PERFORMANCE OPTIMIZATION: Cache dropdown data for 15 minutes
    const cacheKey = cache.config.KEYS.VENDORS + `all:${includeDeleted}`;

    return await cache.wrap(
      cacheKey,
      async () => {
        // OPTIMIZED: Removed _count include for better performance on dropdown endpoints
        // Only return fields needed for dropdowns/lists
        return await db.findMany('vendor', {
          includeDeleted,
          select: {
            id: true,
            name: true,
            code: true,
            contactPerson: true,
            email: true,
            phone: true,
            address: true,
            taxNumber: true,
            paymentTerms: true,
            openingBalance: true,
            currentBalance: true
          },
          orderBy: { name: 'asc' }
        });
      },
      cache.config.TTL.DROPDOWN
    );
  }

  async getVendorById(id) {
    return await db.prisma.vendor.findUnique({
      where: { id },
      include: {
        items: {
          take: 10,
          orderBy: { createdAt: 'desc' }
        },
        purchaseOrders: {
          orderBy: { orderDate: 'desc' }
        },
        bills: {
          orderBy: { billDate: 'desc' }
        },
        payments: {
          orderBy: { paymentDate: 'desc' }
        },
        _count: {
          select: {
            items: true,
            purchaseOrders: true,
            bills: true,
            payments: true
          }
        }
      }
    });
  }

  async updateVendor(id, data) {
    return await db.prisma.vendor.update({
      where: { id },
      data
    });
  }

  async deleteVendor(id) {
    const vendorWithRelations = await db.prisma.vendor.findUnique({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: {
            purchaseOrders: { where: { deletedAt: null } }
          }
        }
      }
    });

    if (!vendorWithRelations) {
      throw new Error('Vendor not found');
    }

    if (vendorWithRelations._count.purchaseOrders > 0) {
      throw new Error('Cannot delete vendor with existing purchase orders. Archive it instead.');
    }

    return await db.prisma.vendor.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  /**
   * Bulk operations
   */
  async bulkCreateItems(itemsData, userId) {
    const results = {
      success: [],
      failed: []
    };

    // PERFORMANCE OPTIMIZATION: Process items in parallel instead of sequentially
    // This reduces total time from N*T to T (where T is average create time)
    const promises = itemsData.map(async (itemData) => {
      try {
        const item = await this.createItem(itemData, userId);
        return {
          success: true,
          serialNumber: item.serialNumber,
          id: item.id
        };
      } catch (error) {
        return {
          success: false,
          serialNumber: itemData.serialNumber,
          error: error.message
        };
      }
    });

    // Wait for all items to be processed
    const processedResults = await Promise.all(promises);

    // Separate success and failed results
    processedResults.forEach(result => {
      if (result.success) {
        results.success.push({
          serialNumber: result.serialNumber,
          id: result.id
        });
      } else {
        results.failed.push({
          serialNumber: result.serialNumber,
          error: result.error
        });
      }
    });

    return results;
  }

  /**
   * Bulk create items from Purchase Order
   * Validates PO, creates items linked to PO, and tracks received quantities
   */
  async bulkCreateItemsFromPO(purchaseOrderId, itemsData, userId) {
    const results = {
      success: [],
      failed: [],
      purchaseOrder: null
    };

    try {
      // Fetch the PO with line items
      const po = await db.prisma.purchaseOrder.findUnique({
        where: { id: purchaseOrderId, deletedAt: null },
        include: {
          lineItems: true,
          vendor: true
        }
      });

      if (!po) {
        throw new Error('Purchase Order not found');
      }

      // Validate PO status - can only receive items for Paid or Partial POs
      if (!['Paid', 'Partial', 'Sent'].includes(po.status)) {
        throw new Error(`Cannot receive items for PO in ${po.status} status. PO must be Paid, Partial, or Sent.`);
      }

      // Initialize receivedQuantities if not exists
      const receivedQuantities = po.receivedQuantities || {};

      // Group items by line item to track quantities
      const itemsByLineItem = {};

      // Create each item
      for (const itemData of itemsData) {
        try {
          // Link item to PO
          const itemWithPO = {
            ...itemData,
            purchaseOrderId: purchaseOrderId,
            vendorId: po.vendorId
          };

          const item = await this.createItem(itemWithPO, userId);

          results.success.push({
            serialNumber: item.serialNumber,
            id: item.id
          });

          // Track received quantities per line item
          if (itemData.lineItemId) {
            if (!itemsByLineItem[itemData.lineItemId]) {
              itemsByLineItem[itemData.lineItemId] = 0;
            }
            itemsByLineItem[itemData.lineItemId]++;
          }

        } catch (error) {
          results.failed.push({
            serialNumber: itemData.serialNumber,
            error: error.message
          });
        }
      }

      // Update received quantities in PO
      for (const [lineItemId, count] of Object.entries(itemsByLineItem)) {
        receivedQuantities[lineItemId] = (receivedQuantities[lineItemId] || 0) + count;
      }

      // Update PO with new received quantities
      const updatedPO = await db.prisma.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: {
          receivedQuantities
        },
        include: {
          lineItems: true,
          vendor: true
        }
      });

      results.purchaseOrder = updatedPO;

      // Auto-update PO delivery status based on received quantities
      try {
        const purchaseOrderService = require('./purchaseOrderService');
        const deliveryResult = await purchaseOrderService.checkAndUpdateDeliveryStatus(purchaseOrderId);

        if (deliveryResult.statusChanged) {
          logger.info(`PO status auto-updated after item receipt: ${deliveryResult.previousStatus} → ${deliveryResult.newStatus}`, {
            poId: purchaseOrderId,
            poNumber: po.poNumber
          });
          results.purchaseOrder = deliveryResult.purchaseOrder;
        }
      } catch (error) {
        logger.error('Failed to auto-update PO delivery status', {
          poId: purchaseOrderId,
          error: error.message
        });
        // Continue - PO status can be manually updated later
      }

      logger.info(`Bulk created ${results.success.length} items from PO ${po.poNumber}`, {
        poId: purchaseOrderId,
        successCount: results.success.length,
        failedCount: results.failed.length
      });

    } catch (error) {
      logger.error('Bulk create from PO failed:', error);
      throw error;
    }

    return results;
  }

  /**
   * Get item status history
   */
  async getItemHistory(serialNumber) {
    const item = await db.prisma.item.findUnique({
      where: {
        serialNumber
      }
    });

    if (!item) {
      const error = new Error('Item not found');
      error.status = 404;
      throw error;
    }

    return await db.prisma.inventoryStatusHistory.findMany({
      where: {
        itemId: item.id
      },
      include: {
        changedByUser: {
          select: {
            id: true,
            username: true,
            fullName: true
          }
        }
      },
      orderBy: {
        changeDate: 'desc'
      }
    });
  }

  /**
   * Get item movements
   */
  async getItemMovements(serialNumber) {
    const item = await db.prisma.item.findUnique({
      where: {
        serialNumber
      }
    });

    if (!item) {
      const error = new Error('Item not found');
      error.status = 404;
      throw error;
    }

    return await db.prisma.inventoryMovement.findMany({
      where: {
        itemId: item.id
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  /**
   * Check if a serial number already exists
   * @param {string} serialNumber - Serial number to check
   * @returns {Promise<boolean>} - True if exists, false otherwise
   */
  async checkSerialNumberExists(serialNumber) {
    const item = await db.prisma.item.findUnique({
      where: { serialNumber: serialNumber.trim() },
      select: { id: true }
    });

    return !!item;
  }
}

module.exports = new InventoryService();