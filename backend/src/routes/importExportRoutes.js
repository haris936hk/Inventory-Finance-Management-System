// ========== src/routes/importExportRoutes.js ==========
const express = require('express');
const router = express.Router();
const { 
  upload, 
  importFromExcel, 
  validateExcel, 
  downloadTemplate 
} = require('../controllers/importExportController');
const { protect, hasPermission } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Import routes
router.post('/excel',
  hasPermission(['inventory.create']),
  upload.single('file'),
  importFromExcel
);

router.post('/validate',
  hasPermission(['inventory.create']),
  upload.single('file'),
  validateExcel
);

router.get('/template',
  hasPermission(['inventory.view']),
  downloadTemplate
);

module.exports = router;