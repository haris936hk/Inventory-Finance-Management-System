// ========== src/controllers/settingsController.js ==========
const settingsService = require('../services/settingsService');
const logger = require('../config/logger');

/**
 * Get all system settings
 */
exports.getSettings = async (req, res, next) => {
  try {
    const settings = await settingsService.getSettings();

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error('Error in getSettings controller:', error);
    next(error);
  }
};

/**
 * Get settings by specific key
 */
exports.getSettingsByKey = async (req, res, next) => {
  try {
    const { key } = req.params;
    const settings = await settingsService.getSettingsByKey(key);

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error('Error in getSettingsByKey controller:', error);
    next(error);
  }
};

/**
 * Update system settings
 */
exports.updateSettings = async (req, res, next) => {
  try {
    const settingsData = req.body;

    const updatedSettings = await settingsService.updateSettings(settingsData);

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: updatedSettings
    });
  } catch (error) {
    logger.error('Error in updateSettings controller:', error);

    // Handle validation errors
    if (error.message.includes('required') ||
        error.message.includes('Invalid') ||
        error.message.includes('must be')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    next(error);
  }
};

/**
 * Export settings as JSON file
 */
exports.exportSettings = async (req, res, next) => {
  try {
    const settings = await settingsService.exportSettings();

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=settings-${new Date().toISOString().split('T')[0]}.json`);

    res.json(settings);
  } catch (error) {
    logger.error('Error in exportSettings controller:', error);
    next(error);
  }
};

/**
 * Import settings from JSON
 */
exports.importSettings = async (req, res, next) => {
  try {
    const settingsData = req.body;

    const updatedSettings = await settingsService.importSettings(settingsData);

    res.json({
      success: true,
      message: 'Settings imported successfully',
      data: updatedSettings
    });
  } catch (error) {
    logger.error('Error in importSettings controller:', error);

    // Handle validation errors
    if (error.message.includes('required') ||
        error.message.includes('Invalid') ||
        error.message.includes('must be')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    next(error);
  }
};

/**
 * Reset settings to defaults
 */
exports.resetSettings = async (req, res, next) => {
  try {
    await settingsService.initializeDefaultSettings();
    const settings = await settingsService.getSettings();

    res.json({
      success: true,
      message: 'Settings reset to defaults successfully',
      data: settings
    });
  } catch (error) {
    logger.error('Error in resetSettings controller:', error);
    next(error);
  }
};
