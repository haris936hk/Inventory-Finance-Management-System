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

// Currency formatting helper - Pakistani style with decimals
export const formatCurrency = (amount, decimals = 2) => {
  return new Intl.NumberFormat(SYSTEM_CONFIG.CURRENCY.LOCALE, {
    style: 'currency',
    currency: SYSTEM_CONFIG.CURRENCY.CODE,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(amount || 0);
};

// Number formatting helper - Pakistani style with decimals
export const formatNumber = (number, decimals = 2) => {
  return new Intl.NumberFormat(SYSTEM_CONFIG.CURRENCY.LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(number || 0);
};

// PKR formatting helper with proper decimal precision
// Shows 2 decimals by default (suitable for financial display)
export const formatPKR = (amount, decimals = 2) => {
  return `PKR ${formatNumber(amount, decimals)}`;
};

// Legacy function for whole number display (for compatibility)
export const formatPKRInteger = (amount) => {
  return `PKR ${new Intl.NumberFormat(SYSTEM_CONFIG.CURRENCY.LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0)}`;
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

// ========== BUSINESS CONSTANTS ==========

// Payment Methods
export const PAYMENT_METHODS = [
  { value: 'Cash', label: 'Cash' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
  { value: 'Cheque', label: 'Cheque' },
  { value: 'UPI', label: 'UPI' },
  { value: 'Card', label: 'Card' }
];

// Invoice Statuses
export const INVOICE_STATUS = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  PARTIAL: 'Partial',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  CANCELLED: 'Cancelled'
};

export const INVOICE_STATUS_OPTIONS = [
  { value: 'Draft', label: 'Draft', color: 'default' },
  { value: 'Sent', label: 'Sent', color: 'blue' },
  { value: 'Partial', label: 'Partial', color: 'orange' },
  { value: 'Paid', label: 'Paid', color: 'green' },
  { value: 'Overdue', label: 'Overdue', color: 'red' },
  { value: 'Cancelled', label: 'Cancelled', color: 'red' }
];

// Purchase Order Statuses
export const PO_STATUS = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  PARTIAL: 'Partial',
  PAID: 'Paid',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled'
};

export const PO_STATUS_OPTIONS = [
  { value: 'Draft', label: 'Draft', color: 'default' },
  { value: 'Sent', label: 'Sent', color: 'blue' },
  { value: 'Partial', label: 'Partial', color: 'orange' },
  { value: 'Paid', label: 'Paid', color: 'cyan' },
  { value: 'Delivered', label: 'Delivered', color: 'green' },
  { value: 'Cancelled', label: 'Cancelled', color: 'red' }
];

// Bill Statuses
export const BILL_STATUS = {
  UNPAID: 'Unpaid',
  PARTIAL: 'Partial',
  PAID: 'Paid'
};

export const BILL_STATUS_OPTIONS = [
  { value: 'Unpaid', label: 'Unpaid', color: 'orange' },
  { value: 'Partial', label: 'Partial', color: 'blue' },
  { value: 'Paid', label: 'Paid', color: 'green' }
];

// Inventory Statuses
export const INVENTORY_STATUS = {
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  SOLD: 'Sold',
  DELIVERED: 'Delivered',
  UNDER_REPAIR: 'Under Repair',
  RETURNED: 'Returned'
};

export const INVENTORY_STATUS_OPTIONS = [
  { value: 'Available', label: 'Available', color: 'green' },
  { value: 'Reserved', label: 'Reserved', color: 'blue' },
  { value: 'Sold', label: 'Sold', color: 'orange' },
  { value: 'Delivered', label: 'Delivered', color: 'purple' },
  { value: 'Under Repair', label: 'Under Repair', color: 'gold' },
  { value: 'Returned', label: 'Returned', color: 'red' }
];

// Physical Item Statuses
export const ITEM_STATUS = {
  IN_STORE: 'In Store',
  IN_LAB: 'In Lab',
  HANDOVER: 'Handover',
  SOLD: 'Sold',
  DELIVERED: 'Delivered',
  RETURNED: 'Returned'
};

export const ITEM_STATUS_OPTIONS = [
  { value: 'In Store', label: 'In Store', color: 'green' },
  { value: 'In Lab', label: 'In Lab', color: 'blue' },
  { value: 'Handover', label: 'Handover', color: 'orange' },
  { value: 'Sold', label: 'Sold', color: 'purple' },
  { value: 'Delivered', label: 'Delivered', color: 'cyan' },
  { value: 'Returned', label: 'Returned', color: 'red' }
];

// Item Conditions
export const ITEM_CONDITIONS = [
  { value: 'New', label: 'New' },
  { value: 'Used', label: 'Used' }
];

// Repaired Status
export const REPAIRED_STATUS = [
  { value: 'No', label: 'No' },
  { value: 'Yes', label: 'Yes' },
  { value: 'Returned', label: 'Returned' }
];

// Discount Types
export const DISCOUNT_TYPES = [
  { value: 'Percentage', label: 'Percentage (%)' },
  { value: 'Fixed', label: 'Fixed Amount' }
];

// Tax Types
export const TAX_TYPES = [
  { value: 'GST', label: 'GST' },
  { value: 'VAT', label: 'VAT' }
];

// Default Tax Rate (can be overridden in settings)
export const DEFAULT_TAX_RATE = 18.0; // 18%

// Default Credit Limit
export const DEFAULT_CREDIT_LIMIT = 0; // No limit by default

// Validation Constants
export const VALIDATION = {
  PHONE_PATTERN: /^\d{11}$/, // 11 digits for Pakistan
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  AMOUNT_PATTERN: /^\d+(\.\d{1,4})?$/, // Supports up to 4 decimals
  CODE_PATTERN: /^[A-Z0-9-_]+$/i,
  MAX_AMOUNT: 999999999999.9999, // Max for DECIMAL(18,4)
  MIN_AMOUNT: 0.01,
  MAX_DECIMAL_PLACES: 4
};
