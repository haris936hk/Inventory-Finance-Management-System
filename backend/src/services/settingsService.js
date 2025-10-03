// ========== src/services/settingsService.js ==========
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../config/logger');

// Default settings structure
const DEFAULT_SETTINGS = {
  general: {
    companyName: 'IMS System',
    companyAddress: '',
    companyPhone: '',
    companyEmail: '',
    language: 'en'
  },
  inventory: {
    lowStockThreshold: 10,
    enableBarcodeScanning: true,
    requireSerialNumbers: true,
    autoGenerateSerialNumbers: false
  },
  finance: {
    defaultPaymentTerms: 30,
    enableInstallments: true,
    taxRate: 0,
    invoicePrefix: 'INV',
    invoiceStartNumber: 1000
  },
  notifications: {
    lowStockAlerts: true,
    paymentReminders: true,
    systemUpdates: true,
    emailNotifications: true
  },
  backup: {
    autoBackup: true,
    backupFrequency: 'daily',
    retentionDays: 30
  }
};

class SettingsService {
  /**
   * Get all settings or initialize with defaults if not exists
   */
  async getSettings() {
    try {
      const settingsRecords = await prisma.systemSettings.findMany();

      // If no settings exist, initialize with defaults
      if (settingsRecords.length === 0) {
        await this.initializeDefaultSettings();
        return DEFAULT_SETTINGS;
      }

      // Build settings object from records
      const settings = {};
      settingsRecords.forEach(record => {
        settings[record.key] = record.value;
      });

      // Merge with defaults to ensure all keys exist
      return {
        ...DEFAULT_SETTINGS,
        ...settings
      };
    } catch (error) {
      logger.error('Error fetching settings:', error);
      throw error;
    }
  }

  /**
   * Get a specific settings category
   */
  async getSettingsByKey(key) {
    try {
      const setting = await prisma.systemSettings.findUnique({
        where: { key }
      });

      return setting ? setting.value : DEFAULT_SETTINGS[key];
    } catch (error) {
      logger.error(`Error fetching settings for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Update settings (full or partial update)
   */
  async updateSettings(settingsData) {
    try {
      const updatePromises = [];

      for (const [key, value] of Object.entries(settingsData)) {
        // Validate that the key is allowed
        if (!DEFAULT_SETTINGS.hasOwnProperty(key)) {
          throw new Error(`Invalid settings key: ${key}`);
        }

        // Validate settings based on key
        this.validateSettings(key, value);

        // Upsert the settings record
        updatePromises.push(
          prisma.systemSettings.upsert({
            where: { key },
            update: { value },
            create: { key, value }
          })
        );
      }

      await Promise.all(updatePromises);

      logger.info('Settings updated successfully', { keys: Object.keys(settingsData) });

      // Return updated settings
      return await this.getSettings();
    } catch (error) {
      logger.error('Error updating settings:', error);
      throw error;
    }
  }

  /**
   * Initialize default settings
   */
  async initializeDefaultSettings() {
    try {
      const createPromises = Object.entries(DEFAULT_SETTINGS).map(([key, value]) =>
        prisma.systemSettings.create({
          data: { key, value }
        })
      );

      await Promise.all(createPromises);
      logger.info('Default settings initialized');
    } catch (error) {
      logger.error('Error initializing default settings:', error);
      throw error;
    }
  }

  /**
   * Validate settings based on category
   */
  validateSettings(key, value) {
    switch (key) {
      case 'general':
        if (!value.companyName || value.companyName.trim() === '') {
          throw new Error('Company name is required');
        }
        if (value.companyEmail && !this.isValidEmail(value.companyEmail)) {
          throw new Error('Invalid email address');
        }
        if (!['en', 'es', 'fr', 'de'].includes(value.language)) {
          throw new Error('Invalid language selection');
        }
        break;

      case 'inventory':
        if (!value.lowStockThreshold || value.lowStockThreshold < 1) {
          throw new Error('Low stock threshold must be at least 1');
        }
        break;

      case 'finance':
        if (!value.defaultPaymentTerms || value.defaultPaymentTerms < 0 || value.defaultPaymentTerms > 365) {
          throw new Error('Default payment terms must be between 0 and 365 days');
        }
        if (!value.invoicePrefix || value.invoicePrefix.trim() === '') {
          throw new Error('Invoice prefix is required');
        }
        if (!value.invoiceStartNumber || value.invoiceStartNumber < 1) {
          throw new Error('Invoice start number must be at least 1');
        }
        if (value.taxRate < 0 || value.taxRate > 100) {
          throw new Error('Tax rate must be between 0 and 100');
        }
        break;

      case 'backup':
        if (!['daily', 'weekly', 'monthly'].includes(value.backupFrequency)) {
          throw new Error('Invalid backup frequency');
        }
        if (value.retentionDays < 1 || value.retentionDays > 365) {
          throw new Error('Retention days must be between 1 and 365');
        }
        break;

      case 'notifications':
        // No specific validation needed for boolean flags
        break;

      default:
        throw new Error(`Unknown settings key: ${key}`);
    }
  }

  /**
   * Email validation helper
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Export settings as JSON
   */
  async exportSettings() {
    try {
      const settings = await this.getSettings();
      return settings;
    } catch (error) {
      logger.error('Error exporting settings:', error);
      throw error;
    }
  }

  /**
   * Import settings from JSON
   */
  async importSettings(settingsData) {
    try {
      // Validate all settings before importing
      for (const [key, value] of Object.entries(settingsData)) {
        if (DEFAULT_SETTINGS.hasOwnProperty(key)) {
          this.validateSettings(key, value);
        }
      }

      // Import settings
      return await this.updateSettings(settingsData);
    } catch (error) {
      logger.error('Error importing settings:', error);
      throw error;
    }
  }
}

module.exports = new SettingsService();
