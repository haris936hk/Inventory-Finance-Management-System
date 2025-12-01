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

// Currency formatting helper
const formatCurrency = (amount) => {
  return new Intl.NumberFormat(SYSTEM_CONFIG.CURRENCY.LOCALE, {
    style: 'currency',
    currency: SYSTEM_CONFIG.CURRENCY.CODE,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0);
};

// Number formatting helper
const formatNumber = (number) => {
  return new Intl.NumberFormat(SYSTEM_CONFIG.CURRENCY.LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(number || 0);
};

// ========== BUSINESS CONSTANTS ==========

// Inventory Status (Business/Sales State)
const INVENTORY_STATUS = {
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  SOLD: 'Sold',
  DELIVERED: 'Delivered',
  UNDER_REPAIR: 'Under Repair',
  RETURNED: 'Returned'
};

// Physical Status (Physical Location/State)
const PHYSICAL_STATUS = {
  IN_STORE: 'In Store',
  IN_LAB: 'In Lab',
  HANDOVER: 'Handover'
};

// Item Conditions
const ITEM_CONDITION = {
  NEW: 'New',
  USED: 'Used'
};

// Repaired Status
const REPAIRED_STATUS = {
  NO: 'No',
  YES: 'Yes',
  RETURNED: 'Returned'
};

// Invoice Statuses
const INVOICE_STATUS = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  PARTIAL: 'Partial',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  CANCELLED: 'Cancelled'
};

// Bill Statuses
const BILL_STATUS = {
  UNPAID: 'Unpaid',
  PARTIAL: 'Partial',
  PAID: 'Paid'
};

// Purchase Order Statuses
const PO_STATUS = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  PARTIAL: 'Partial',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
};

// Payment Methods
const PAYMENT_METHODS = [
  'Cash',
  'Bank Transfer',
  'Cheque',
  'UPI',
  'Card'
];

module.exports = {
  SYSTEM_CONFIG,
  SYSTEM_INFO,
  formatCurrency,
  formatNumber,
  INVENTORY_STATUS,
  PHYSICAL_STATUS,
  ITEM_CONDITION,
  REPAIRED_STATUS,
  INVOICE_STATUS,
  BILL_STATUS,
  PO_STATUS,
  PAYMENT_METHODS
};
