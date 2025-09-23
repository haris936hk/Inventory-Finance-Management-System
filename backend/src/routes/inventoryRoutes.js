// ========== src/routes/inventoryRoutes.js ==========
const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { protect, hasPermission } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Category routes
router.route('/categories')
  .get(hasPermission(['inventory.view']), inventoryController.getCategories)
  .post(hasPermission(['inventory.create']), inventoryController.createCategory);

router.route('/categories/:id')
  .get(hasPermission(['inventory.view']), inventoryController.getCategory)
  .put(hasPermission(['inventory.edit']), inventoryController.updateCategory);

// Company routes
router.route('/companies')
  .get(hasPermission(['inventory.view']), inventoryController.getCompanies)
  .post(hasPermission(['inventory.create']), inventoryController.createCompany);

router.route('/companies/:id')
  .get(hasPermission(['inventory.view']), inventoryController.getCompany)
  .put(hasPermission(['inventory.edit']), inventoryController.updateCompany);

// Model routes
router.route('/models')
  .get(hasPermission(['inventory.view']), inventoryController.getModels)
  .post(hasPermission(['inventory.create']), inventoryController.createModel);

// Item routes
router.route('/items')
  .get(hasPermission(['inventory.view']), inventoryController.getItems)
  .post(hasPermission(['inventory.create']), inventoryController.createItem);

router.post('/items/bulk', 
  hasPermission(['inventory.create']), 
  inventoryController.bulkCreateItems
);

router.route('/items/:serialNumber')
  .get(hasPermission(['inventory.view']), inventoryController.getItem);

router.put('/items/:serialNumber/status',
  hasPermission(['inventory.edit']),
  inventoryController.updateItemStatus
);

// Stock summary
router.get('/stock-summary',
  hasPermission(['inventory.view']),
  inventoryController.getStockSummary
);

// Vendor routes
router.route('/vendors')
  .get(hasPermission(['inventory.view']), inventoryController.getVendors)
  .post(hasPermission(['inventory.create']), inventoryController.createVendor);

router.route('/vendors/:id')
  .get(hasPermission(['inventory.view']), inventoryController.getVendor)
  .put(hasPermission(['inventory.edit']), inventoryController.updateVendor);

module.exports = router;