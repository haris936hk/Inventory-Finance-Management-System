// ========== src/utils/dateUtils.js ==========
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

// Extend dayjs with timezone support
dayjs.extend(utc);
dayjs.extend(timezone);

// Pakistan timezone
const PAKISTAN_TIMEZONE = 'Asia/Karachi';

/**
 * Get current date in Pakistan timezone
 */
export const getCurrentDate = () => {
  return dayjs().tz(PAKISTAN_TIMEZONE);
};

/**
 * Format date for display in Pakistan timezone
 * @param {Date|string|dayjs} date - Date to format
 * @param {string} format - Format string (default: 'DD/MM/YYYY')
 */
export const formatDate = (date, format = 'DD/MM/YYYY') => {
  if (!date) return 'N/A';
  return dayjs(date).tz(PAKISTAN_TIMEZONE).format(format);
};

/**
 * Format date and time for display in Pakistan timezone
 * @param {Date|string|dayjs} date - Date to format
 * @param {string} format - Format string (default: 'DD/MM/YYYY HH:mm')
 */
export const formatDateTime = (date, format = 'DD/MM/YYYY HH:mm') => {
  if (!date) return 'N/A';
  return dayjs(date).tz(PAKISTAN_TIMEZONE).format(format);
};

/**
 * Convert date to Pakistan timezone
 * @param {Date|string|dayjs} date - Date to convert
 */
export const toPakistanTime = (date) => {
  if (!date) return null;
  return dayjs(date).tz(PAKISTAN_TIMEZONE);
};

/**
 * Get start of day in Pakistan timezone
 * @param {Date|string|dayjs} date - Date to get start of day for
 */
export const startOfDay = (date) => {
  if (!date) return null;
  return dayjs(date).tz(PAKISTAN_TIMEZONE).startOf('day');
};

/**
 * Get end of day in Pakistan timezone
 * @param {Date|string|dayjs} date - Date to get end of day for
 */
export const endOfDay = (date) => {
  if (!date) return null;
  return dayjs(date).tz(PAKISTAN_TIMEZONE).endOf('day');
};

/**
 * Get start of month in Pakistan timezone
 * @param {Date|string|dayjs} date - Date to get start of month for
 */
export const startOfMonth = (date) => {
  if (!date) return null;
  return dayjs(date).tz(PAKISTAN_TIMEZONE).startOf('month');
};

/**
 * Get end of month in Pakistan timezone
 * @param {Date|string|dayjs} date - Date to get end of month for
 */
export const endOfMonth = (date) => {
  if (!date) return null;
  return dayjs(date).tz(PAKISTAN_TIMEZONE).endOf('month');
};

/**
 * Check if date is valid
 * @param {Date|string|dayjs} date - Date to check
 */
export const isValidDate = (date) => {
  if (!date) return false;
  return dayjs(date).isValid();
};

/**
 * Get Pakistan timezone info
 */
export const getTimezoneInfo = () => {
  return {
    timezone: PAKISTAN_TIMEZONE,
    name: 'Pakistan Standard Time',
    offset: '+05:00'
  };
};
