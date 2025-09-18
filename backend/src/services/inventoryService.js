// ========== src/services/inventoryService.js ==========
const db = require('../config/database');
const logger = require('../config/logger');
const { generateSerialNumber } = require('../utils/generateId');

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
      throw new Error('Category name or code already exists');
    }

    return await db.prisma.productCategory.create({
      data
    });
  }

  async getCategories(includeDeleted = false) {
    return await db.findMany('productCategory', {
      includeDeleted,
      orderBy: { name: 'asc' }
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
      throw new Error('Company name or code already exists');
    }

    return await db.prisma.company.create({
      data
    });
  }

  async getCompanies(includeDeleted = false) {
    return await db.findMany('company', {
      includeDeleted,
      orderBy: { name: 'asc' }
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

  /**
   * Product Model Management
   */
  async createModel(data) {
    const existing = await db.prisma.productModel.findUnique({
      where: { code: data.code }
    });

    if (existing) {
      throw new Error('Model code already exists');
    }

    return await db.prisma.productModel.create({
      data,
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
        company: true
      },
      orderBy: { name: 'asc' }
    });
  }

  /**
   * Item Management (Core Inventory)
   */
  async createItem(itemData, userId) {
    // Validate serial number uniqueness
    const existing = await db.prisma.item.findUnique({
      where: { serialNumber: itemData.serialNumber }
    });

    if (existing) {
      throw new Error(`Serial number ${itemData.serialNumber} already exists`);
    }

    // Validate model exists
    const model = await db.prisma.productModel.findUnique({
      where: { id: itemData.modelId },
      include: { category: true }
    });

    if (!model) {
      throw new Error('Invalid product model');
    }

    // Get warehouse (using default if not provided)
    let warehouseId = itemData.warehouseId;
    if (!warehouseId) {
      const defaultWarehouse = await db.prisma.warehouse.findFirst({
        where: { isActive: true }
      });
      warehouseId = defaultWarehouse?.id;
    }

    // Create item with initial status
    const item = await db.prisma.item.create({
      data: {
        serialNumber: itemData.serialNumber,
        condition: itemData.condition || 'New',
        status: itemData.status || 'In Store',
        statusHistory: [{
          status: itemData.status || 'In Store',
          date: new Date(),
          userId,
          notes: 'Initial entry'
        }],
        specifications: itemData.specifications,
        purchasePrice: itemData.purchasePrice,
        purchaseDate: itemData.purchaseDate,
        inboundDate: itemData.inboundDate || new Date(),
        categoryId: model.category.id,
        modelId: itemData.modelId,
        vendorId: itemData.vendorId,
        warehouseId,
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
        vendor: true,
        warehouse: true
      }
    });

    logger.info(`Item created: ${item.serialNumber}`);
    return item;
  }

  async getItems(filters = {}) {
    const where = { deletedAt: null };

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

    if (filters.warehouseId) {
      where.warehouseId = filters.warehouseId;
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

    // Client filters
    if (filters.clientPhone) {
      where.clientPhone = filters.clientPhone;
    }

    if (filters.clientName) {
      where.clientName = {
        contains: filters.clientName,
        mode: 'insensitive'
      };
    }

    return await db.prisma.item.findMany({
      where,
      include: {
        category: true,
        model: {
          include: {
            company: true
          }
        },
        vendor: true,
        warehouse: true,
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
            company: true
          }
        },
        vendor: true,
        warehouse: true,
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
      where: { serialNumber }
    });

    if (!item) {
      throw new Error('Item not found');
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

    // Handle handover/delivery specific fields
    if (statusData.status === 'Handover' || statusData.status === 'Delivered') {
      updateData.outboundDate = statusData.outboundDate || new Date();
      updateData.handoverDate = statusData.handoverDate || new Date();
      updateData.handoverTo = statusData.handoverTo;
      updateData.handoverById = userId;
      updateData.handoverDetails = statusData.handoverDetails;
      
      // Client details
      if (statusData.clientName) updateData.clientName = statusData.clientName;
      if (statusData.clientCompany) updateData.clientCompany = statusData.clientCompany;
      if (statusData.clientNIC) updateData.clientNIC = statusData.clientNIC;
      if (statusData.clientPhone) updateData.clientPhone = statusData.clientPhone;
      if (statusData.clientEmail) updateData.clientEmail = statusData.clientEmail;
      if (statusData.clientAddress) updateData.clientAddress = statusData.clientAddress;
    }

    // Handle sale status
    if (statusData.status === 'Sold') {
      updateData.outboundDate = statusData.outboundDate || new Date();
      if (statusData.sellingPrice) updateData.sellingPrice = statusData.sellingPrice;
      
      // Client details
      if (statusData.clientName) updateData.clientName = statusData.clientName;
      if (statusData.clientCompany) updateData.clientCompany = statusData.clientCompany;
      if (statusData.clientNIC) updateData.clientNIC = statusData.clientNIC;
      if (statusData.clientPhone) updateData.clientPhone = statusData.clientPhone;
      if (statusData.clientEmail) updateData.clientEmail = statusData.clientEmail;
      if (statusData.clientAddress) updateData.clientAddress = statusData.clientAddress;
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
        warehouse: true,
        handoverByUser: true
      }
    });

    logger.info(`Item ${serialNumber} status updated to ${statusData.status}`);
    return updatedItem;
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
      
      if (['In Store', 'In Hand', 'In Lab'].includes(item.status)) {
        acc[key].available++;
      } else if (item.status === 'Sold') {
        acc[key].sold++;
      } else if (item.status === 'Delivered') {
        acc[key].delivered++;
      }
      
      return acc;
    }, {});

    // Calculate total value
    const totalValue = items.reduce((sum, item) => {
      const price = item.sellingPrice || item.purchasePrice || 0;
      return sum + parseFloat(price);
    }, 0);

    return {
      totalItems: items.length,
      availableItems: items.filter(i => 
        ['In Store', 'In Hand', 'In Lab'].includes(i.status)
      ).length,
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
    return await db.findMany('vendor', {
      includeDeleted,
      include: {
        _count: {
          select: {
            items: true,
            purchaseOrders: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });
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
          take: 10,
          orderBy: { orderDate: 'desc' }
        },
        _count: {
          select: {
            items: true,
            purchaseOrders: true,
            bills: true
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

  /**
   * Bulk operations
   */
  async bulkCreateItems(itemsData, userId) {
    const results = {
      success: [],
      failed: []
    };

    for (const itemData of itemsData) {
      try {
        const item = await this.createItem(itemData, userId);
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

    return results;
  }
}

module.exports = new InventoryService();