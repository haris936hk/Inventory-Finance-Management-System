// ========== src/routes/settingsRoutes.js ==========
const express = require('express');
const router = express.Router();
const {
  getSettings,
  getSettingsByKey,
  updateSettings,
  exportSettings,
  importSettings,
  resetSettings
} = require('../controllers/settingsController');
const { protect } = require('../middleware/auth');

// All settings routes require authentication
router.use(protect);

// Get all settings
router.get('/', getSettings);

// Get settings by key
router.get('/:key', getSettingsByKey);

// Update settings
router.put('/', updateSettings);

// Export settings
router.get('/export', exportSettings);

// Import settings
router.post('/import', importSettings);

// Reset settings to defaults
router.post('/reset', resetSettings);

module.exports = router;
