// ========== src/config/constants.js ==========

// System Configuration for Pakistan
const SYSTEM_CONFIG = {
  CURRENCY: {
    CODE: 'PKR',
    SYMBOL: 'PKR',
    NAME: 'Pakistani Rupee',
    LOCALE: 'en-PK'
  },
  TIMEZONE: {
    CODE: 'Asia/Karachi',
    NAME: 'Pakistan Standard Time',
    OFFSET: '+05:00'
  },
  DATE_FORMAT: 'DD/MM/YYYY',
  DATETIME_FORMAT: 'DD/MM/YYYY HH:mm',
  NUMBER_FORMAT: {
    DECIMAL_SEPARATOR: '.',
    THOUSAND_SEPARATOR: ',',
    CURRENCY_POSITION: 'before'
  }
};

// System information
const SYSTEM_INFO = {
  NAME: 'Inventory & Finance Management System',
  VERSION: '1.0.0',
  COUNTRY: 'Pakistan',
  LANGUAGE: 'English',
  CURRENCY: SYSTEM_CONFIG.CURRENCY.NAME,
  TIMEZONE: SYSTEM_CONFIG.TIMEZONE.NAME
};

module.exports = {
  SYSTEM_CONFIG,
  SYSTEM_INFO
};
