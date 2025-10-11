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
const { protect, hasPermission } = require('../middleware/auth');

// All settings routes require authentication
router.use(protect);

// Get all settings (anyone can view)
router.get('/', hasPermission(['settings.view']), getSettings);

// Get settings by key
router.get('/:key', hasPermission(['settings.view']), getSettingsByKey);

// Update settings (admin only)
router.put('/', hasPermission(['settings.edit']), updateSettings);

// Export settings (admin only)
router.get('/export', hasPermission(['settings.view']), exportSettings);

// Import settings (admin only)
router.post('/import', hasPermission(['settings.edit']), importSettings);

// Reset settings to defaults (admin only)
router.post('/reset', hasPermission(['settings.edit']), resetSettings);

module.exports = router;
