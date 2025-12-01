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
  .put(hasPermission(['inventory.edit']), inventoryController.updateCategory)
  .delete(hasPermission(['inventory.delete']), inventoryController.deleteCategory);

// Company routes
router.route('/companies')
  .get(hasPermission(['inventory.view']), inventoryController.getCompanies)
  .post(hasPermission(['inventory.create']), inventoryController.createCompany);

router.route('/companies/:id')
  .get(hasPermission(['inventory.view']), inventoryController.getCompany)
  .put(hasPermission(['inventory.edit']), inventoryController.updateCompany)
  .delete(hasPermission(['inventory.delete']), inventoryController.deleteCompany);

// Model routes
router.route('/models')
  .get(hasPermission(['inventory.view']), inventoryController.getModels)
  .post(hasPermission(['inventory.create']), inventoryController.createModel);

router.route('/models/:id')
  .put(hasPermission(['inventory.edit']), inventoryController.updateModel)
  .delete(hasPermission(['inventory.delete']), inventoryController.deleteModel);

// ============= ITEM ROUTES =============
const inventoryLifecycleController = require('../controllers/inventoryLifecycleController');

// Item routes
router.route('/items')
  .get(hasPermission(['inventory.view']), inventoryController.getItems)
  .post(hasPermission(['inventory.create']), inventoryController.createItem);

router.post('/items/bulk',
  hasPermission(['inventory.create']),
  inventoryController.bulkCreateItems
);

// Check serial number availability (must come BEFORE parameterized routes)
router.get('/items/check-serial/:serialNumber',
  hasPermission(['inventory.view']),
  inventoryController.checkSerialNumber
);

// Parameterized routes must come AFTER specific routes
router.route('/items/:serialNumber')
  .get(hasPermission(['inventory.view']), inventoryController.getItem);

router.delete('/items/:id',
  hasPermission(['inventory.delete']),
  inventoryController.deleteItem
);

router.get('/items/:serialNumber/history',
  hasPermission(['inventory.view']),
  inventoryController.getItemHistory
);

router.get('/items/:serialNumber/movements',
  hasPermission(['inventory.view']),
  inventoryController.getItemMovements
);

router.put('/items/:serialNumber/status',
  hasPermission(['inventory.edit']),
  inventoryController.updateItemStatus
);

router.put('/items/:serialNumber/repaired',
  hasPermission(['inventory.edit']),
  inventoryController.updateRepairedStatus
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
  .put(hasPermission(['inventory.edit']), inventoryController.updateVendor)
  .delete(hasPermission(['inventory.delete']), inventoryController.deleteVendor);

// ============= INVENTORY LIFECYCLE MANAGEMENT =============

// Inventory lifecycle operations
router.post('/lifecycle/reserve',
  hasPermission(['inventory.edit']),
  inventoryLifecycleController.reserveItemsForInvoice
);

router.post('/lifecycle/release',
  hasPermission(['inventory.edit']),
  inventoryLifecycleController.releaseItemsForInvoice
);

router.post('/lifecycle/mark-sold',
  hasPermission(['inventory.edit']),
  inventoryLifecycleController.markItemsAsSold
);

router.post('/lifecycle/mark-delivered',
  hasPermission(['inventory.edit']),
  inventoryLifecycleController.markItemsAsDelivered
);

// Invoice lifecycle management
router.get('/lifecycle/invoice/:invoiceId/status',
  hasPermission(['inventory.view']),
  inventoryLifecycleController.getInvoiceLifecycleStatus
);

router.post('/lifecycle/invoice/:invoiceId/transition',
  hasPermission(['inventory.admin']),
  inventoryLifecycleController.forceInvoiceStatusTransition
);

router.post('/lifecycle/invoice/:invoiceId/fix-inconsistencies',
  hasPermission(['inventory.admin']),
  inventoryLifecycleController.fixInventoryInconsistencies
);

// Status tracking
router.get('/lifecycle/items/status',
  hasPermission(['inventory.view']),
  inventoryLifecycleController.getItemsStatus
);

router.get('/lifecycle/items/history',
  hasPermission(['inventory.view']),
  inventoryLifecycleController.getItemStatusHistory
);

// Maintenance and dashboard
router.delete('/lifecycle/cleanup-expired',
  hasPermission(['inventory.admin']),
  inventoryLifecycleController.cleanupExpiredReservations
);

router.get('/lifecycle/dashboard',
  hasPermission(['inventory.view']),
  inventoryLifecycleController.getLifecycleDashboard
);

module.exports = router;