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

// ============= ITEM RESERVATION SYSTEM =============
const reservationController = require('../controllers/reservationController');
const inventoryLifecycleController = require('../controllers/inventoryLifecycleController');

// Grouped item selection routes (must come BEFORE parameterized routes)
router.get('/items/grouped',
  hasPermission(['inventory.view']),
  reservationController.getGroupedAvailableItems
);

// Item reservation routes
router.post('/items/reserve',
  hasPermission(['inventory.create']),
  reservationController.reserveSpecificItems
);

router.post('/items/auto-assign',
  hasPermission(['inventory.create']),
  reservationController.autoAssignItems
);

// Item routes
router.route('/items')
  .get(hasPermission(['inventory.view']), inventoryController.getItems)
  .post(hasPermission(['inventory.create']), inventoryController.createItem);

router.post('/items/bulk',
  hasPermission(['inventory.create']),
  inventoryController.bulkCreateItems
);

// Parameterized routes must come AFTER specific routes
router.route('/items/:serialNumber')
  .get(hasPermission(['inventory.view']), inventoryController.getItem);

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

// Reservation management routes
router.route('/reservations/:sessionId')
  .get(hasPermission(['inventory.view']), reservationController.getReservationsBySession)
  .delete(hasPermission(['inventory.edit']), reservationController.releaseReservations);

router.put('/reservations/:sessionId/extend',
  hasPermission(['inventory.edit']),
  reservationController.extendReservation
);

// Admin route for cleanup
router.delete('/reservations/expired',
  hasPermission(['inventory.admin']),
  reservationController.cleanupExpiredReservations
);

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