// ========== src/utils/dateUtils.js ==========
const moment = require('moment-timezone');

// Pakistan timezone
const PAKISTAN_TIMEZONE = 'Asia/Karachi';

/**
 * Get current date in Pakistan timezone
 */
const getCurrentDate = () => {
  return moment().tz(PAKISTAN_TIMEZONE);
};

/**
 * Format date for display in Pakistan timezone
 * @param {Date|string|moment} date - Date to format
 * @param {string} format - Format string (default: 'DD/MM/YYYY')
 */
const formatDate = (date, format = 'DD/MM/YYYY') => {
  if (!date) return 'N/A';
  return moment(date).tz(PAKISTAN_TIMEZONE).format(format);
};

/**
 * Format date and time for display in Pakistan timezone
 * @param {Date|string|moment} date - Date to format
 * @param {string} format - Format string (default: 'DD/MM/YYYY HH:mm')
 */
const formatDateTime = (date, format = 'DD/MM/YYYY HH:mm') => {
  if (!date) return 'N/A';
  return moment(date).tz(PAKISTAN_TIMEZONE).format(format);
};

/**
 * Convert date to Pakistan timezone
 * @param {Date|string|moment} date - Date to convert
 */
const toPakistanTime = (date) => {
  if (!date) return null;
  return moment(date).tz(PAKISTAN_TIMEZONE);
};

/**
 * Get start of day in Pakistan timezone
 * @param {Date|string|moment} date - Date to get start of day for
 */
const startOfDay = (date) => {
  if (!date) return null;
  return moment(date).tz(PAKISTAN_TIMEZONE).startOf('day');
};

/**
 * Get end of day in Pakistan timezone
 * @param {Date|string|moment} date - Date to get end of day for
 */
const endOfDay = (date) => {
  if (!date) return null;
  return moment(date).tz(PAKISTAN_TIMEZONE).endOf('day');
};

/**
 * Get start of month in Pakistan timezone
 * @param {Date|string|moment} date - Date to get start of month for
 */
const startOfMonth = (date) => {
  if (!date) return null;
  return moment(date).tz(PAKISTAN_TIMEZONE).startOf('month');
};

/**
 * Get end of month in Pakistan timezone
 * @param {Date|string|moment} date - Date to get end of month for
 */
const endOfMonth = (date) => {
  if (!date) return null;
  return moment(date).tz(PAKISTAN_TIMEZONE).endOf('month');
};

/**
 * Check if date is valid
 * @param {Date|string|moment} date - Date to check
 */
const isValidDate = (date) => {
  if (!date) return false;
  return moment(date).isValid();
};

/**
 * Get Pakistan timezone info
 */
const getTimezoneInfo = () => {
  return {
    timezone: PAKISTAN_TIMEZONE,
    name: 'Pakistan Standard Time',
    offset: '+05:00'
  };
};

module.exports = {
  getCurrentDate,
  formatDate,
  formatDateTime,
  toPakistanTime,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  isValidDate,
  getTimezoneInfo,
  PAKISTAN_TIMEZONE
};
