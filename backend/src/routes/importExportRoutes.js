// ========== src/routes/importExportRoutes.js ==========
const express = require('express');
const router = express.Router();
const {
  upload,
  importFromExcel,
  importSamhanFile,
  rollbackImport,
  processManualReview,
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

// Samhan-specific import routes
router.post('/samhan',
  hasPermission(['inventory.create']),
  upload.single('file'),
  importSamhanFile
);

// Import management routes
router.post('/rollback',
  hasPermission(['inventory.create']),
  rollbackImport
);

router.post('/manual-review',
  hasPermission(['inventory.create']),
  processManualReview
);

module.exports = router;