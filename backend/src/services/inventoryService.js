// ========== src/services/inventoryService.js ==========
const db = require('../config/database');
const logger = require('../config/logger');
const { generateSerialNumber } = require('../utils/generateId');
const { formatAmount } = require('../utils/transactionWrapper');  // CRITICAL FIX: Import formatAmount to prevent runtime error

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
      return await db.prisma.productCategory.create({
        data
      });
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
    return await db.findMany('productCategory', {
      includeDeleted,
      orderBy: { name: 'asc' },
      include: {
        models: {
          where: { deletedAt: null }
        }
      }
    });
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
    return await db.prisma.productCategory.update({
      where: { id },
      data
    });
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
            items: {
              where: { deletedAt: null }
            }
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
    return await db.prisma.productCategory.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
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

    return await db.prisma.company.create({
      data
    });
  }

  async getCompanies(includeDeleted = false) {
    return await db.findMany('company', {
      includeDeleted,
      orderBy: { name: 'asc' },
      include: {
        models: {
          where: { deletedAt: null }
        }
      }
    });
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
    return await db.prisma.company.update({
      where: { id },
      data
    });
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
    return await db.prisma.company.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
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

    return await db.prisma.productModel.create({
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
  }

  async getModels(filters = {}) {
    const where = { deletedAt: null };

    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    if (filters.companyId) {
      where.companyId = filters.companyId;
    }

    return await db.prisma.productModel.findMany({
      where,
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

    return await db.prisma.productModel.update({
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
    return await db.prisma.productModel.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
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

    // Validate serial number uniqueness using centralized method
    const exists = await this.checkSerialNumberExists(itemData.serialNumber);
    if (exists) {
      const error = new Error(`Serial number ${itemData.serialNumber} already exists`);
      error.status = 400;
      throw error;
    }

    // Automatically determine status based on condition
    const condition = itemData.condition || 'New';
    const autoStatus = condition === 'Used' ? 'In Lab' : 'In Store';

    // Set repaired status and inventory status based on condition
    // Valid inventoryStatus values: Available, Reserved, Sold, Delivered, Under Repair, Returned
    const repairedStatus = autoStatus === 'In Lab' ? 'No' : null;
    const inventoryStatus = condition === 'Used' ? 'Under Repair' : 'Available';

    // Create item with initial status
    try {
      const item = await db.prisma.item.create({
        data: {
          serialNumber: itemData.serialNumber,
          condition: condition,
          status: autoStatus,
          inventoryStatus: inventoryStatus,
          repaired: repairedStatus,
          // FIX: Deprecated statusHistory JSON field - use InventoryStatusHistory table instead
          // statusHistory will be removed in future migration
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

    // CRITICAL: Only allow deletion in default/initial state (to fix user mistakes during creation)
    // NEW items: Available + In Store (default state)
    // USED items: Under Repair + In Lab + repaired=No (default state)
    const isNewItemDefaultState = item.inventoryStatus === 'Available' && item.status === 'In Store';
    const isUsedItemDefaultState = item.inventoryStatus === 'Under Repair' &&
                                   item.status === 'In Lab' &&
                                   item.repaired === 'No';

    if (!isNewItemDefaultState && !isUsedItemDefaultState) {
      const error = new Error('Cannot delete item. Items can only be deleted in their initial state (NEW: Available+In Store, USED: Under Repair+In Lab+repaired=No)');
      error.status = 400;
      throw error;
    }

    if (item.invoiceItems && item.invoiceItems.length > 0) {
      const error = new Error('Cannot delete item that is part of an invoice');
      error.status = 400;
      throw error;
    }

    // Hard delete the item and related audit records in a transaction
    await db.transaction(async (prisma) => {
      // Delete related audit records first to avoid foreign key constraints
      await prisma.inventoryMovement.deleteMany({
        where: { itemId: id }
      });

      await prisma.inventoryStatusHistory.deleteMany({
        where: { itemId: id }
      });

      await prisma.itemReservation.deleteMany({
        where: { itemId: id }
      });

      // Now hard delete the item
      await prisma.item.delete({
        where: { id }
      });
    });

    logger.info(`Item hard deleted: ${item.serialNumber}`);
    return { message: 'Item deleted successfully' };
  }

  async getItems(filters = {}) {
    const where = { deletedAt: null };

    // CRITICAL FIX: Filter for invoice-available items only
    // Must check BOTH physical status AND inventoryStatus to prevent showing Reserved/Sold items
    // CRITICAL: Also exclude items with repaired='No' (items under repair cannot be sold)
    if (filters.availableForInvoice) {
      where.AND = [
        {
          OR: [
            { status: 'In Store' },
            { status: 'In Lab', repaired: 'Yes' }
          ]
        },
        { inventoryStatus: 'Available' },  // FIX: Only show Available items (not Reserved/Sold)
        {
          NOT: {
            repaired: 'No'  // CRITICAL: Block items under repair from invoice selection
          }
        }
      ];
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

    return await db.prisma.item.findMany({
      where,
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
        handoverByUser: {
          select: {
            fullName: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
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
    // FIX: Wrap entire operation in transaction for atomicity
    return await db.transaction(async (prisma) => {
      const item = await prisma.item.findUnique({
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

      // CRITICAL: Only allow "Handover" status changes
      // Physical status transitions are automatic:
      // - NEW items: Always "In Store"
      // - USED items: "In Lab" -> "In Store" (automatic when repaired = "Yes")
      if (statusData.status !== 'Handover') {
        throw new Error('Manual physical status changes not allowed. Only "Handover" for delivery is permitted. Physical status changes automatically based on item condition and repair status.');
      }

      // Validate handover fields when status is Handover
      if (statusData.status === 'Handover') {
        if (!statusData.handoverTo || !statusData.handoverToNIC || !statusData.handoverToPhone) {
          throw new Error('Handover requires: handoverTo, handoverToNIC, and handoverToPhone');
        }
      }

      // Update data
      const updateData = {
        status: statusData.status
        // FIX: Removed statusHistory JSON field - use InventoryStatusHistory table instead
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
          await prisma.invoice.update({
            where: { id: invoiceItem.invoice.id },
            data: { status: 'Delivered' }
          });

          logger.info(`Invoice ${invoiceItem.invoice.invoiceNumber} automatically marked as Delivered due to item handover`);
        }

        // FIX: Create InventoryStatusHistory record for audit trail
        await prisma.inventoryStatusHistory.create({
          data: {
            itemId: item.id,
            fromStatus: item.inventoryStatus,
            toStatus: 'Delivered',
            changeReason: 'MANUAL',
            referenceType: invoiceItem?.invoice ? 'Invoice' : null,
            referenceId: invoiceItem?.invoice?.id || null,
            changedBy: userId,
            notes: statusData.notes || `Handover to ${statusData.handoverTo}`
          }
        });

        // Create inventory movement record
        await prisma.inventoryMovement.create({
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

      const updatedItem = await prisma.item.update({
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
    });
  }

  /**
   * Update repaired status for "In Lab" items
   * Delegates to inventory lifecycle service for proper state machine management
   */
  async updateRepairedStatus(serialNumber, repairedStatus, userId) {
    return await db.transaction(async (prisma) => {
      // Lock item to prevent concurrent updates
      await prisma.$queryRaw`SELECT * FROM "Item" WHERE "serialNumber" = ${serialNumber} FOR UPDATE NOWAIT`;

      const item = await prisma.item.findUnique({
        where: { serialNumber, deletedAt: null }
      });

      if (!item) {
        throw new Error('Item not found');
      }

      // Validate: Item must be "In Lab" and "Under Repair"
      if (item.status !== 'In Lab' || item.inventoryStatus !== 'Under Repair') {
        throw new Error('Only items in "In Lab" with "Under Repair" status can have their repaired status updated');
      }

      // Validate: Item must not be reserved (shouldn't happen with Under Repair status, but check anyway)
      if (item.inventoryStatus === 'Reserved') {
        throw new Error('Cannot update repaired status of reserved items');
      }

      // Validate: Only allow "Yes" and "Returned"
      const allowedStatuses = ['Yes', 'Returned'];
      if (!allowedStatuses.includes(repairedStatus)) {
        throw new Error('Invalid repaired status. Only "Yes" and "Returned" are allowed.');
      }

      // Delegate to lifecycle service for proper state machine transitions
      const inventoryLifecycleService = require('./inventoryLifecycleService');

      if (repairedStatus === 'Yes') {
        const result = await inventoryLifecycleService.markItemAsRepaired(item.id, userId, prisma);
        return result.item;
      } else if (repairedStatus === 'Returned') {
        const result = await inventoryLifecycleService.markItemAsReturned(item.id, userId, prisma);
        return result.item;
      }
    });
  }

  /**
   * Stock calculations
   */
  async getStockSummary() {
    const items = await db.prisma.item.findMany({
      where: {
        deletedAt: null
      },
      include: {
        category: true,
        model: {
          include: {
            company: true
          }
        }
      }
    });

    // Group by status
    const statusSummary = items.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});

    // Group by category
    const categorySummary = items.reduce((acc, item) => {
      const key = item.category.name;
      if (!acc[key]) {
        acc[key] = {
          total: 0,
          available: 0,
          sold: 0,
          delivered: 0
        };
      }
      acc[key].total++;

      // FIX: Use inventoryStatus instead of status for accurate counts
      if (item.inventoryStatus === 'Available') {
        acc[key].available++;
      } else if (item.inventoryStatus === 'Sold') {
        acc[key].sold++;
      } else if (item.inventoryStatus === 'Delivered') {
        acc[key].delivered++;
      }

      return acc;
    }, {});

    // Calculate total value
    const totalValue = items.reduce((sum, item) => {
      const price = item.sellingPrice || item.purchasePrice || 0;
      return sum + formatAmount(price);
    }, 0);

    return {
      totalItems: items.length,
      // FIX: Count by inventoryStatus, not physical status
      availableItems: items.filter(i => i.inventoryStatus === 'Available').length,
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

    return await db.prisma.vendor.create({
      data
    });
  }

  async getVendors(includeDeleted = false) {
    const vendors = await db.findMany('vendor', {
      includeDeleted,
      include: {
        _count: {
          select: {
            items: true,
            purchaseOrders: true
          }
        },
        ledgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: 1, // Get only the latest entry
          select: { balance: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Use ledger balance as source of truth
    const { formatAmount } = require('../utils/transactionWrapper');
    return vendors.map(vendor => ({
      ...vendor,
      currentBalance: vendor.ledgerEntries[0]?.balance
        ? formatAmount(vendor.ledgerEntries[0].balance)
        : formatAmount(vendor.openingBalance || 0),
      ledgerEntries: undefined // Remove from response (not needed)
    }));
  }

  async getVendorById(id) {
    const vendor = await db.prisma.vendor.findUnique({
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

    if (!vendor) {
      return null;
    }

    // Get current balance from ledger (single source of truth)
    const currentBalance = await this.getVendorCurrentBalance(id);

    return {
      ...vendor,
      currentBalance // Override with ledger-based balance
    };
  }

  /**
   * Get vendor current balance from ledger (SINGLE SOURCE OF TRUTH)
   * The ledger already handles all cancellations and voids via reversing entries
   * @param {string} vendorId - Vendor ID
   * @returns {Promise<number>} Current balance from latest ledger entry
   */
  async getVendorCurrentBalance(vendorId) {
    const { formatAmount } = require('../utils/transactionWrapper');

    // Get the most recent ledger entry - its balance IS the current balance
    const latestEntry = await db.prisma.vendorLedger.findFirst({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
      select: { balance: true }
    });

    if (latestEntry) {
      return formatAmount(latestEntry.balance);
    }

    // If no ledger entries exist yet, return opening balance
    const vendor = await db.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { openingBalance: true }
    });

    return formatAmount(vendor?.openingBalance || 0);
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
    // CRITICAL FIX: Create items directly with prisma.item.create() to avoid nested transactions
    // Wrap in transaction for atomicity (all or nothing)
    return await db.transaction(async (prisma) => {
      const results = {
        success: [],
        failed: []
      };

      for (const itemData of itemsData) {
        try {
          // Validate required fields
          if (!itemData.modelId || !itemData.condition) {
            throw new Error('Model ID and condition are required');
          }

          // Validate model exists first
          const model = await prisma.productModel.findUnique({
            where: { id: itemData.modelId },
            include: { category: true }
          });

          if (!model) {
            throw new Error('Invalid product model');
          }

          // Generate serial number if not provided
          let serialNumber = itemData.serialNumber;
          if (!serialNumber) {
            const year = new Date().getFullYear();
            serialNumber = await generateSerialNumber(model.category.code, year);
          }

          // Validate serial number uniqueness using centralized method
          const exists = await this.checkSerialNumberExists(serialNumber, prisma);
          if (exists) {
            throw new Error(`Serial number ${serialNumber} already exists`);
          }

          // Automatically determine status based on condition
          const condition = itemData.condition || 'New';
          const autoStatus = condition === 'Used' ? 'In Lab' : 'In Store';
          const repairedStatus = autoStatus === 'In Lab' ? 'No' : null;
          const inventoryStatus = condition === 'Used' ? 'Under Repair' : 'Available';

          // Create item directly in transaction
          const item = await prisma.item.create({
            data: {
              serialNumber: serialNumber,
              condition: condition,
              status: autoStatus,
              inventoryStatus: inventoryStatus,
              repaired: repairedStatus,
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
            }
          });

          results.success.push({
            serialNumber: item.serialNumber,
            id: item.id
          });

          logger.info(`Item created in bulk: ${item.serialNumber}`);
        } catch (error) {
          results.failed.push({
            serialNumber: itemData.serialNumber || 'N/A',
            error: error.message
          });
        }
      }

      return results;
    });
  }

  /**
   * Bulk create items from Purchase Order
   * Validates PO, creates items linked to PO, and tracks received quantities
   */
  async bulkCreateItemsFromPO(purchaseOrderId, itemsData, userId) {
    // CRITICAL FIX: Wrap entire operation in single transaction for atomicity
    // This ensures all items are created + PO updated together (all or nothing)
    return await db.transaction(async (prisma) => {
      const results = {
        success: [],
        failed: [],
        purchaseOrder: null
      };

      // 1. CRITICAL FIX: Acquire row-level lock on PO to prevent race conditions on receivedQuantities
      // Multiple users receiving items simultaneously could corrupt receivedQuantities
      await prisma.$queryRaw`SELECT * FROM "PurchaseOrder" WHERE id = ${purchaseOrderId} FOR UPDATE NOWAIT`;

      // Now fetch the locked PO
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: purchaseOrderId, deletedAt: null },
        include: {
          lineItems: true,
          vendor: true
        }
      });

      if (!po) {
        throw new Error('Purchase Order not found');
      }

      // 2. CRITICAL FIX: Only allow receipt after bills created (Paid or Partial status)
      // Per user requirements: Vendor balance increases when bill created, THEN items received
      if (!['Paid', 'Partial'].includes(po.status)) {
        throw new Error(
          `Cannot receive items for PO in ${po.status} status. ` +
          `At least one bill must be created first (PO must be Paid or Partial).`
        );
      }

      // 3. Initialize receivedQuantities if not exists
      const receivedQuantities = po.receivedQuantities || {};

      // Group items by line item to track quantities
      const itemsByLineItem = {};

      // 4. CRITICAL FIX: Validate received quantities don't exceed ordered quantities
      // Calculate what will be the new totals after this receipt
      for (const itemData of itemsData) {
        if (itemData.lineItemId) {
          itemsByLineItem[itemData.lineItemId] = (itemsByLineItem[itemData.lineItemId] || 0) + 1;
        }
      }

      // Validate against line item quantities
      for (const [lineItemId, additionalCount] of Object.entries(itemsByLineItem)) {
        const lineItem = po.lineItems.find(li => li.id === lineItemId);

        if (!lineItem) {
          throw new Error(`Line item ${lineItemId} not found in PO`);
        }

        const alreadyReceived = receivedQuantities[lineItemId] || 0;
        const newTotalReceived = alreadyReceived + additionalCount;

        if (newTotalReceived > lineItem.quantity) {
          throw new Error(
            `Cannot receive more items than ordered for line item ${lineItem.description}. ` +
            `Ordered: ${lineItem.quantity}, Already received: ${alreadyReceived}, ` +
            `Attempting to receive: ${additionalCount} more (would exceed by ${newTotalReceived - lineItem.quantity})`
          );
        }
      }

      // 5. Create all items within THIS transaction
      for (const itemData of itemsData) {
        try {
          // Validate serial number uniqueness using centralized method
          const exists = await this.checkSerialNumberExists(itemData.serialNumber, prisma);
          if (exists) {
            throw new Error(`Serial number ${itemData.serialNumber} already exists`);
          }

          // Determine status based on condition (if provided)
          const condition = itemData.condition || 'New';
          const autoStatus = condition === 'Used' ? 'In Lab' : (itemData.status || 'In Store');
          const repairedStatus = condition === 'Used' ? 'No' : null;
          const inventoryStatus = condition === 'Used' ? 'Under Repair' : 'Available';

          // Create item directly in transaction (not via this.createItem)
          const item = await prisma.item.create({
            data: {
              serialNumber: itemData.serialNumber,
              condition: condition,
              status: autoStatus,
              inventoryStatus: inventoryStatus,
              repaired: repairedStatus,
              purchaseOrderId: purchaseOrderId,
              vendorId: po.vendorId,
              categoryId: itemData.categoryId,
              modelId: itemData.modelId,
              purchasePrice: itemData.purchasePrice ? formatAmount(itemData.purchasePrice) : null,
              sellingPrice: itemData.sellingPrice ? formatAmount(itemData.sellingPrice) : null,
              purchaseDate: itemData.purchaseDate ? new Date(itemData.purchaseDate) : null,
              specifications: itemData.specifications || {},
              inboundDate: itemData.inboundDate ? new Date(itemData.inboundDate) : new Date(),
              createdById: userId
            }
          });

          results.success.push({
            serialNumber: item.serialNumber,
            id: item.id
          });

        } catch (error) {
          results.failed.push({
            serialNumber: itemData.serialNumber,
            error: error.message
          });
        }
      }

      // 6. Update received quantities in PO
      for (const [lineItemId, count] of Object.entries(itemsByLineItem)) {
        receivedQuantities[lineItemId] = (receivedQuantities[lineItemId] || 0) + count;
      }

      // 7. Check if all line items are fully received
      let allItemsReceived = true;
      for (const lineItem of po.lineItems) {
        const received = receivedQuantities[lineItem.id] || 0;
        if (received < lineItem.quantity) {
          allItemsReceived = false;
          break;
        }
      }

      // 8. Auto-update PO status to Delivered if all items received
      const updateData = { receivedQuantities };
      if (allItemsReceived && po.status === 'Paid') {
        updateData.status = 'Delivered';
        logger.info(`PO ${po.poNumber} fully received - auto-updating status to Delivered`);
      }

      // 9. Update PO with new received quantities and status (in same transaction)
      const updatedPO = await prisma.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: updateData,
        include: {
          lineItems: true,
          vendor: true
        }
      });

      results.purchaseOrder = updatedPO;

      logger.info(`Bulk created ${results.success.length} items from PO ${po.poNumber}`, {
        poId: purchaseOrderId,
        successCount: results.success.length,
        failedCount: results.failed.length
      });

      return results;
    });
  }

  /**
   * Get item status history
   */
  async getItemHistory(serialNumber) {
    const item = await db.prisma.item.findFirst({
      where: {
        serialNumber,
        deletedAt: null
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
    const item = await db.prisma.item.findFirst({
      where: {
        serialNumber,
        deletedAt: null
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
   * Check if a serial number already exists (excluding soft-deleted items)
   * Fast, unified method for duplicate checking across the entire system
   * @param {string} serialNumber - Serial number to check
   * @param {object} prisma - Optional prisma instance (for use within transactions)
   * @returns {Promise<boolean>} - True if exists, false otherwise
   */
  async checkSerialNumberExists(serialNumber, prisma = null) {
    const client = prisma || db.prisma;

    const item = await client.item.findFirst({
      where: {
        serialNumber: serialNumber.trim(),
        deletedAt: null
      },
      select: { id: true }
    });

    return !!item;
  }
}

module.exports = new InventoryService();