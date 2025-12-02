// ========== src/controllers/inventoryController.js ==========
const asyncHandler = require('express-async-handler');
const inventoryService = require('../services/inventoryService');

// ============= PRODUCT CATEGORIES =============

// @desc    Get all categories
// @route   GET /api/inventory/categories
// @access  Private
const getCategories = asyncHandler(async (req, res) => {
  const categories = await inventoryService.getCategories();
  
  res.json({
    success: true,
    count: categories.length,
    data: categories
  });
});

// @desc    Get single category
// @route   GET /api/inventory/categories/:id
// @access  Private
const getCategory = asyncHandler(async (req, res) => {
  const category = await inventoryService.getCategoryById(req.params.id);
  
  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }
  
  res.json({
    success: true,
    data: category
  });
});

// @desc    Create category
// @route   POST /api/inventory/categories
// @access  Private/Admin
const createCategory = asyncHandler(async (req, res) => {
  const category = await inventoryService.createCategory(req.body);
  
  res.status(201).json({
    success: true,
    data: category
  });
});

// @desc    Update category
// @route   PUT /api/inventory/categories/:id
// @access  Private/Admin
const updateCategory = asyncHandler(async (req, res) => {
  const category = await inventoryService.updateCategory(req.params.id, req.body);

  res.json({
    success: true,
    data: category
  });
});

// @desc    Delete category
// @route   DELETE /api/inventory/categories/:id
// @access  Private/Admin
const deleteCategory = asyncHandler(async (req, res) => {
  await inventoryService.deleteCategory(req.params.id);

  res.json({
    success: true,
    message: 'Category deleted successfully'
  });
});

// ============= COMPANIES/MAKES =============

// @desc    Get all companies
// @route   GET /api/inventory/companies
// @access  Private
const getCompanies = asyncHandler(async (req, res) => {
  const companies = await inventoryService.getCompanies();
  
  res.json({
    success: true,
    count: companies.length,
    data: companies
  });
});

// @desc    Get single company
// @route   GET /api/inventory/companies/:id
// @access  Private
const getCompany = asyncHandler(async (req, res) => {
  const company = await inventoryService.getCompanyById(req.params.id);
  
  if (!company) {
    res.status(404);
    throw new Error('Company not found');
  }
  
  res.json({
    success: true,
    data: company
  });
});

// @desc    Create company
// @route   POST /api/inventory/companies
// @access  Private/Admin
const createCompany = asyncHandler(async (req, res) => {
  const company = await inventoryService.createCompany(req.body);

  res.status(201).json({
    success: true,
    data: company
  });
});

// @desc    Update company
// @route   PUT /api/inventory/companies/:id
// @access  Private/Admin
const updateCompany = asyncHandler(async (req, res) => {
  const company = await inventoryService.updateCompany(req.params.id, req.body);

  res.json({
    success: true,
    data: company
  });
});

// @desc    Delete company
// @route   DELETE /api/inventory/companies/:id
// @access  Private/Admin
const deleteCompany = asyncHandler(async (req, res) => {
  await inventoryService.deleteCompany(req.params.id);

  res.json({
    success: true,
    message: 'Company deleted successfully'
  });
});

// ============= PRODUCT MODELS =============

// @desc    Get all models
// @route   GET /api/inventory/models
// @access  Private
const getModels = asyncHandler(async (req, res) => {
  const filters = {
    categoryId: req.query.categoryId,
    companyId: req.query.companyId
  };
  
  const models = await inventoryService.getModels(filters);
  
  res.json({
    success: true,
    count: models.length,
    data: models
  });
});

// @desc    Create model
// @route   POST /api/inventory/models
// @access  Private/Admin
const createModel = asyncHandler(async (req, res) => {
  const model = await inventoryService.createModel(req.body);

  res.status(201).json({
    success: true,
    data: model
  });
});

// @desc    Update model
// @route   PUT /api/inventory/models/:id
// @access  Private/Admin
const updateModel = asyncHandler(async (req, res) => {
  const model = await inventoryService.updateModel(req.params.id, req.body);

  res.json({
    success: true,
    data: model
  });
});

// @desc    Delete model
// @route   DELETE /api/inventory/models/:id
// @access  Private/Admin
const deleteModel = asyncHandler(async (req, res) => {
  await inventoryService.deleteModel(req.params.id);

  res.json({
    success: true,
    message: 'Model deleted successfully'
  });
});

// ============= ITEMS (CORE INVENTORY) =============

// @desc    Get all items
// @route   GET /api/inventory/items
// @access  Private
const getItems = asyncHandler(async (req, res) => {
  const filters = {
    serialNumber: req.query.serialNumber,
    status: req.query.status,
    categoryId: req.query.categoryId,
    modelId: req.query.modelId,
    vendorId: req.query.vendorId,
    clientPhone: req.query.clientPhone, // Keep for backward compatibility, maps to customer.phone
    clientName: req.query.clientName,   // Keep for backward compatibility, maps to customer.name
    inboundFrom: req.query.inboundFrom,
    inboundTo: req.query.inboundTo
  };
  
  const items = await inventoryService.getItems(filters);
  
  res.json({
    success: true,
    count: items.length,
    data: items
  });
});

// @desc    Get grouped items for invoice selection
// @route   GET /api/inventory/items/grouped
// @access  Private
const getGroupedItems = asyncHandler(async (req, res) => {
  const filters = {
    availableForInvoice: req.query.availableForInvoice === 'true',
    condition: req.query.condition,
    categoryId: req.query.categoryId,
    modelId: req.query.modelId
  };

  const groupedItems = await inventoryService.getGroupedItems(filters);

  res.json({
    success: true,
    count: groupedItems.length,
    data: groupedItems
  });
});

// @desc    Get item by serial number
// @route   GET /api/inventory/items/:serialNumber
// @access  Private
const getItem = asyncHandler(async (req, res) => {
  const item = await inventoryService.getItemBySerialNumber(req.params.serialNumber);
  
  if (!item) {
    res.status(404);
    throw new Error('Item not found');
  }
  
  res.json({
    success: true,
    data: item
  });
});

// @desc    Create new item
// @route   POST /api/inventory/items
// @access  Private
const createItem = asyncHandler(async (req, res) => {
  const item = await inventoryService.createItem(req.body, req.user.id);
  
  res.status(201).json({
    success: true,
    data: item
  });
});

// @desc    Bulk create items
// @route   POST /api/inventory/items/bulk
// @access  Private
const bulkCreateItems = asyncHandler(async (req, res) => {
  const { items, purchaseOrderId } = req.body;

  if (!items || !Array.isArray(items)) {
    res.status(400);
    throw new Error('Items array required');
  }

  // If purchaseOrderId is provided, use the PO-linked method
  let results;
  if (purchaseOrderId) {
    results = await inventoryService.bulkCreateItemsFromPO(purchaseOrderId, items, req.user.id);

    // Also check and update PO delivery status after creating items
    const purchaseOrderService = require('../services/purchaseOrderService');
    await purchaseOrderService.checkAndUpdateDeliveryStatus(purchaseOrderId, req.user.id);
  } else {
    results = await inventoryService.bulkCreateItems(items, req.user.id);
  }

  res.status(201).json({
    success: true,
    data: results
  });
});

// @desc    Delete item
// @route   DELETE /api/inventory/items/:id
// @access  Private
const deleteItem = asyncHandler(async (req, res) => {
  await inventoryService.deleteItem(req.params.id);

  res.json({
    success: true,
    message: 'Item deleted successfully'
  });
});

// @desc    Update item status
// @route   PUT /api/inventory/items/:serialNumber/status
// @access  Private
const updateItemStatus = asyncHandler(async (req, res) => {
  const { status, handoverTo, handoverToNIC, handoverToPhone } = req.body;

  // Validate status is provided
  if (!status) {
    res.status(400);
    throw new Error('Status is required');
  }

  // Validate status value (only "Handover" allowed - items cannot move between In Store/In Lab)
  if (status !== 'Handover') {
    res.status(400);
    throw new Error('Only "Handover" status is allowed. Items cannot move between "In Store" and "In Lab".');
  }

  // Validate handover fields (always required since only Handover is allowed)
  if (status === 'Handover') {
    const missingFields = [];
    if (!handoverTo) missingFields.push('handoverTo');
    if (!handoverToNIC) missingFields.push('handoverToNIC');
    if (!handoverToPhone) missingFields.push('handoverToPhone');

    if (missingFields.length > 0) {
      res.status(400);
      throw new Error(`Handover requires the following fields: ${missingFields.join(', ')}`);
    }
  }

  const item = await inventoryService.updateItemStatus(
    req.params.serialNumber,
    req.body,
    req.user.id
  );

  res.json({
    success: true,
    data: item,
    message: 'Item handed over successfully. Invoice marked as Delivered.'
  });
});

// @desc    Update item repaired status
// @route   PUT /api/inventory/items/:serialNumber/repaired
// @access  Private
const updateRepairedStatus = asyncHandler(async (req, res) => {
  const { repaired } = req.body;

  // Validate repaired status is provided
  if (!repaired) {
    res.status(400);
    throw new Error('Repaired status is required');
  }

  // Validate repaired value (only "Yes" and "Returned" allowed)
  const allowedStatuses = ['Yes', 'Returned'];
  if (!allowedStatuses.includes(repaired)) {
    res.status(400);
    throw new Error('Invalid repaired status. Only "Yes" and "Returned" are allowed.');
  }

  const item = await inventoryService.updateRepairedStatus(
    req.params.serialNumber,
    repaired,
    req.user.id
  );

  res.json({
    success: true,
    data: item,
    message: `Item repaired status updated to "${repaired}"`
  });
});

// @desc    Get stock summary
// @route   GET /api/inventory/stock-summary
// @access  Private
const getStockSummary = asyncHandler(async (req, res) => {
  const summary = await inventoryService.getStockSummary();
  
  res.json({
    success: true,
    data: summary
  });
});

// ============= VENDORS =============

// @desc    Get all vendors
// @route   GET /api/inventory/vendors
// @access  Private
const getVendors = asyncHandler(async (req, res) => {
  const vendors = await inventoryService.getVendors();
  
  res.json({
    success: true,
    count: vendors.length,
    data: vendors
  });
});

// @desc    Get single vendor
// @route   GET /api/inventory/vendors/:id
// @access  Private
const getVendor = asyncHandler(async (req, res) => {
  const vendor = await inventoryService.getVendorById(req.params.id);
  
  if (!vendor) {
    res.status(404);
    throw new Error('Vendor not found');
  }
  
  res.json({
    success: true,
    data: vendor
  });
});

// @desc    Create vendor
// @route   POST /api/inventory/vendors
// @access  Private
const createVendor = asyncHandler(async (req, res) => {
  const vendor = await inventoryService.createVendor(req.body);
  
  res.status(201).json({
    success: true,
    data: vendor
  });
});

// @desc    Update vendor
// @route   PUT /api/inventory/vendors/:id
// @access  Private
const updateVendor = asyncHandler(async (req, res) => {
  const vendor = await inventoryService.updateVendor(req.params.id, req.body);

  res.json({
    success: true,
    data: vendor
  });
});

const deleteVendor = asyncHandler(async (req, res) => {
  await inventoryService.deleteVendor(req.params.id);

  res.json({
    success: true,
    message: 'Vendor deleted successfully'
  });
});

// @desc    Get item history (status changes)
// @route   GET /api/inventory/items/:serialNumber/history
// @access  Private
const getItemHistory = asyncHandler(async (req, res) => {
  const history = await inventoryService.getItemHistory(req.params.serialNumber);

  res.json({
    success: true,
    data: history
  });
});

// @desc    Get item movements
// @route   GET /api/inventory/items/:serialNumber/movements
// @access  Private
const getItemMovements = asyncHandler(async (req, res) => {
  const movements = await inventoryService.getItemMovements(req.params.serialNumber);

  res.json({
    success: true,
    data: movements
  });
});

// @desc    Check if serial number exists
// @route   GET /api/inventory/items/check-serial/:serialNumber
// @access  Private
const checkSerialNumber = asyncHandler(async (req, res) => {
  const { serialNumber } = req.params;

  const exists = await inventoryService.checkSerialNumberExists(serialNumber);

  res.json({
    success: true,
    exists,
    serialNumber
  });
});

module.exports = {
  // Categories
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  // Companies
  getCompanies,
  getCompany,
  createCompany,
  updateCompany,
  deleteCompany,
  // Models
  getModels,
  createModel,
  updateModel,
  deleteModel,
  // Items
  getItems,
  getGroupedItems,
  getItem,
  createItem,
  bulkCreateItems,
  deleteItem,
  updateItemStatus,
  updateRepairedStatus,
  getStockSummary,
  checkSerialNumber,
  // Vendors
  getVendors,
  getVendor,
  createVendor,
  updateVendor,
  deleteVendor,
  // Item History & Movements
  getItemHistory,
  getItemMovements
};
