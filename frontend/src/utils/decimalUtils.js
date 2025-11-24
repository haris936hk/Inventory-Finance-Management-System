/**
 * Decimal Utility Functions
 *
 * These utilities match the backend's decimal handling (DECIMAL(18,4))
 * to ensure consistency between frontend and backend calculations.
 *
 * Backend uses:
 * - DECIMAL(18,4) for all monetary fields
 * - formatAmount(amount, precision=4) for rounding
 * - compareAmounts(a, b, tolerance=0.0001) for comparisons
 * - addAmounts(...amounts) for safe addition
 */

/**
 * Format amount to specified decimal precision
 * Matches backend's formatAmount() function
 *
 * @param {number|string} amount - The amount to format
 * @param {number} precision - Number of decimal places (default: 4 to match DECIMAL(18,4))
 * @returns {number} - Formatted amount as number with specified precision
 *
 * @example
 * formatAmount(10.123456789, 4) // Returns: 10.1235
 * formatAmount(10.123456789, 2) // Returns: 10.12
 * formatAmount("10.5", 4) // Returns: 10.5000
 */
export const formatAmount = (amount, precision = 4) => {
  if (amount === null || amount === undefined || amount === '') {
    return 0;
  }

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(numAmount)) {
    return 0;
  }

  // Use toFixed for precision, then convert back to number
  return parseFloat(numAmount.toFixed(precision));
};

/**
 * Safely parse amount from user input
 * Handles string inputs, empty values, and invalid numbers
 *
 * @param {any} value - The value to parse
 * @param {number} precision - Decimal precision (default: 4)
 * @returns {number} - Parsed and formatted amount
 *
 * @example
 * parseAmount("10.50") // Returns: 10.5000
 * parseAmount("") // Returns: 0
 * parseAmount(null) // Returns: 0
 * parseAmount("abc") // Returns: 0
 */
export const parseAmount = (value, precision = 4) => {
  return formatAmount(value, precision);
};

/**
 * Compare two amounts with tolerance for floating-point errors
 * Matches backend's compareAmounts() function
 *
 * @param {number} amount1 - First amount
 * @param {number} amount2 - Second amount
 * @param {number} tolerance - Acceptable difference (default: 0.01 for 1 cent)
 * @returns {boolean} - True if amounts are equal within tolerance
 *
 * @example
 * compareAmounts(10.1234, 10.1235) // Returns: true (within 0.01)
 * compareAmounts(10.00, 10.02) // Returns: false (exceeds 0.01)
 */
export const compareAmounts = (amount1, amount2, tolerance = 0.01) => {
  const diff = Math.abs(
    formatAmount(amount1, 4) - formatAmount(amount2, 4)
  );
  return diff <= tolerance;
};

/**
 * Safely add multiple amounts with proper decimal handling
 * Matches backend's addAmounts() function
 *
 * @param {...number} amounts - Amounts to add
 * @returns {number} - Sum with proper precision
 *
 * @example
 * addAmounts(10.12, 20.34, 30.56) // Returns: 61.02
 * addAmounts(0.1, 0.2) // Returns: 0.3 (not 0.30000000000000004)
 */
export const addAmounts = (...amounts) => {
  const sum = amounts.reduce((acc, amount) => {
    return acc + formatAmount(amount, 4);
  }, 0);

  return formatAmount(sum, 4);
};

/**
 * Safely subtract two amounts with proper decimal handling
 *
 * @param {number} amount1 - Amount to subtract from
 * @param {number} amount2 - Amount to subtract
 * @returns {number} - Difference with proper precision
 *
 * @example
 * subtractAmounts(10.50, 3.25) // Returns: 7.25
 */
export const subtractAmounts = (amount1, amount2) => {
  const diff = formatAmount(amount1, 4) - formatAmount(amount2, 4);
  return formatAmount(diff, 4);
};

/**
 * Safely multiply amount by a factor with proper decimal handling
 *
 * @param {number} amount - Amount to multiply
 * @param {number} factor - Multiplication factor
 * @param {number} precision - Result precision (default: 4)
 * @returns {number} - Product with proper precision
 *
 * @example
 * multiplyAmount(10.50, 1.18) // Returns: 12.3900 (for 18% tax)
 * multiplyAmount(100, 0.15, 2) // Returns: 15.00 (for 15% discount)
 */
export const multiplyAmount = (amount, factor, precision = 4) => {
  const product = formatAmount(amount, 4) * factor;
  return formatAmount(product, precision);
};

/**
 * Calculate percentage of an amount
 *
 * @param {number} amount - Base amount
 * @param {number} percentage - Percentage (e.g., 18 for 18%)
 * @param {number} precision - Result precision (default: 4)
 * @returns {number} - Calculated percentage amount
 *
 * @example
 * calculatePercentage(1000, 18) // Returns: 180.0000 (18% of 1000)
 * calculatePercentage(1000, 15, 2) // Returns: 150.00 (15% of 1000)
 */
export const calculatePercentage = (amount, percentage, precision = 4) => {
  return multiplyAmount(amount, percentage / 100, precision);
};

/**
 * Validate if a value is a valid decimal amount
 *
 * @param {any} value - Value to validate
 * @param {object} options - Validation options
 * @param {number} options.min - Minimum value (optional)
 * @param {number} options.max - Maximum value (optional)
 * @param {number} options.maxDecimals - Maximum decimal places (optional)
 * @returns {object} - { valid: boolean, error: string|null }
 *
 * @example
 * validateAmount("10.50", { min: 0 }) // Returns: { valid: true, error: null }
 * validateAmount("-5", { min: 0 }) // Returns: { valid: false, error: "Amount must be at least 0" }
 * validateAmount("10.12345", { maxDecimals: 2 }) // Returns: { valid: false, error: "Maximum 2 decimal places allowed" }
 */
export const validateAmount = (value, options = {}) => {
  const { min, max, maxDecimals } = options;

  // Check if value is provided
  if (value === null || value === undefined || value === '') {
    return { valid: false, error: 'Amount is required' };
  }

  // Parse and validate number
  const amount = parseFloat(value);

  if (isNaN(amount)) {
    return { valid: false, error: 'Invalid amount' };
  }

  // Check minimum
  if (min !== undefined && amount < min) {
    return { valid: false, error: `Amount must be at least ${min}` };
  }

  // Check maximum
  if (max !== undefined && amount > max) {
    return { valid: false, error: `Amount must not exceed ${max}` };
  }

  // Check decimal places
  if (maxDecimals !== undefined) {
    const decimalPart = value.toString().split('.')[1];
    if (decimalPart && decimalPart.length > maxDecimals) {
      return {
        valid: false,
        error: `Maximum ${maxDecimals} decimal place${maxDecimals === 1 ? '' : 's'} allowed`
      };
    }
  }

  return { valid: true, error: null };
};

/**
 * Round amount to specified decimal places (alias for formatAmount)
 *
 * @param {number} amount - Amount to round
 * @param {number} decimals - Number of decimal places (default: 2 for display)
 * @returns {number} - Rounded amount
 *
 * @example
 * roundAmount(10.126, 2) // Returns: 10.13
 * roundAmount(10.124, 2) // Returns: 10.12
 */
export const roundAmount = (amount, decimals = 2) => {
  return formatAmount(amount, decimals);
};

/**
 * Check if amount is zero (within tolerance)
 *
 * @param {number} amount - Amount to check
 * @param {number} tolerance - Acceptable difference from zero (default: 0.0001)
 * @returns {boolean} - True if amount is effectively zero
 *
 * @example
 * isZero(0.0001) // Returns: true
 * isZero(0.01) // Returns: false
 */
export const isZero = (amount, tolerance = 0.0001) => {
  return Math.abs(formatAmount(amount, 4)) <= tolerance;
};

/**
 * Check if amount is positive (greater than zero within tolerance)
 *
 * @param {number} amount - Amount to check
 * @param {number} tolerance - Minimum positive value (default: 0.0001)
 * @returns {boolean} - True if amount is positive
 *
 * @example
 * isPositive(0.01) // Returns: true
 * isPositive(0.0001) // Returns: false
 * isPositive(-5) // Returns: false
 */
export const isPositive = (amount, tolerance = 0.0001) => {
  return formatAmount(amount, 4) > tolerance;
};

/**
 * Ensure amount is non-negative (clamp to 0 if negative)
 *
 * @param {number} amount - Amount to clamp
 * @returns {number} - Non-negative amount
 *
 * @example
 * ensureNonNegative(10) // Returns: 10
 * ensureNonNegative(-5) // Returns: 0
 */
export const ensureNonNegative = (amount) => {
  const formatted = formatAmount(amount, 4);
  return formatted < 0 ? 0 : formatted;
};
