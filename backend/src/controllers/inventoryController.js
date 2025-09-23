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
    warehouseId: req.query.warehouseId,
    clientPhone: req.query.clientPhone,
    clientName: req.query.clientName,
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
  const { items } = req.body;
  
  if (!items || !Array.isArray(items)) {
    res.status(400);
    throw new Error('Items array required');
  }
  
  const results = await inventoryService.bulkCreateItems(items, req.user.id);
  
  res.status(201).json({
    success: true,
    data: results
  });
});

// @desc    Update item status
// @route   PUT /api/inventory/items/:serialNumber/status
// @access  Private
const updateItemStatus = asyncHandler(async (req, res) => {
  const item = await inventoryService.updateItemStatus(
    req.params.serialNumber,
    req.body,
    req.user.id
  );
  
  res.json({
    success: true,
    data: item
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

module.exports = {
  // Categories
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  // Companies
  getCompanies,
  getCompany,
  createCompany,
  updateCompany,
  // Models
  getModels,
  createModel,
  // Items
  getItems,
  getItem,
  createItem,
  bulkCreateItems,
  updateItemStatus,
  getStockSummary,
  // Vendors
  getVendors,
  getVendor,
  createVendor,
  updateVendor
};