// ========== src/config/constants.js ==========

// System Configuration for Pakistan
export const SYSTEM_CONFIG = {
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

// Currency formatting helper - Pakistani style (no decimals, comma separators)
export const formatCurrency = (amount) => {
  const safeAmount = parseFloat(amount || 0);
  const numericAmount = isNaN(safeAmount) ? 0 : safeAmount;

  return new Intl.NumberFormat(SYSTEM_CONFIG.CURRENCY.LOCALE, {
    style: 'currency',
    currency: SYSTEM_CONFIG.CURRENCY.CODE,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(numericAmount);
};

// Number formatting helper - Pakistani style (no decimals, comma separators)
export const formatNumber = (number) => {
  const safeNumber = parseFloat(number || 0);
  const numericNumber = isNaN(safeNumber) ? 0 : safeNumber;

  return new Intl.NumberFormat(SYSTEM_CONFIG.CURRENCY.LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(numericNumber);
};

// Simple PKR formatting helper (just PKR prefix + comma-separated numbers)
export const formatPKR = (amount) => {
  const safeAmount = parseFloat(amount || 0);
  const numericAmount = isNaN(safeAmount) ? 0 : safeAmount;

  return `PKR ${formatNumber(numericAmount)}`;
};

// System information
export const SYSTEM_INFO = {
  NAME: 'Inventory & Finance Management System',
  VERSION: '1.0.0',
  COUNTRY: 'Pakistan',
  LANGUAGE: 'English',
  CURRENCY: SYSTEM_CONFIG.CURRENCY.NAME,
  TIMEZONE: SYSTEM_CONFIG.TIMEZONE.NAME
};
