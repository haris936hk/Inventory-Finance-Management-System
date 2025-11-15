/**
 * Transaction wrapper utilities for safe concurrent operations
 * Uses Decimal.js for precise financial calculations
 */

const db = require('../config/database');
const logger = require('../config/logger');
const Decimal = require('decimal.js');

// Configure Decimal.js for financial precision
// precision: 20 digits for intermediate calculations
// rounding: ROUND_HALF_EVEN (banker's rounding) for fairness
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -9,
  toExpPos: 9
});

/**
 * Custom error classes for better error handling
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

class ConcurrencyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConcurrencyError';
    this.statusCode = 409;
  }
}

class InsufficientBalanceError extends Error {
  constructor(message, available, required) {
    super(message);
    this.name = 'InsufficientBalanceError';
    this.statusCode = 400;
    this.available = available;
    this.required = required;
  }
}

/**
 * Execute a function within a Prisma transaction with retry logic
 *
 * @param {Function} callback - Async function that receives Prisma transaction client
 * @param {Object} options - Transaction options
 * @param {number} options.maxRetries - Maximum number of retries on deadlock (default: 3)
 * @param {number} options.timeout - Transaction timeout in ms (default: 10000)
 * @param {boolean} options.isolationLevel - Isolation level (default: Serializable)
 * @returns {Promise<any>} Result from callback
 */
async function withTransaction(callback, options = {}) {
  const {
    maxRetries = 3,
    timeout = 10000,
    isolationLevel = 'Serializable'
  } = options;

  let lastError;

  // Check if using Supabase transaction pooler (pgbouncer mode)
  // Transaction pooler doesn't support SET TRANSACTION ISOLATION LEVEL
  const isSupabasePooler = process.env.DATABASE_URL?.includes('pgbouncer=true');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await db.prisma.$transaction(
        async (tx) => {
          // Set transaction isolation level (skip for Supabase transaction pooler)
          if (isolationLevel === 'Serializable' && !isSupabasePooler) {
            await tx.$executeRaw`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`;
          }

          return await callback(tx);
        },
        {
          maxWait: 5000, // Max wait to get a connection
          timeout: timeout
        }
      );
    } catch (error) {
      lastError = error;

      // Check if error is due to serialization/deadlock
      const isDeadlock = error.code === '40001' ||
                        error.code === '40P01' ||
                        error.message?.includes('deadlock') ||
                        error.message?.includes('could not serialize');

      if (isDeadlock && attempt < maxRetries) {
        logger.warn(`Transaction deadlock detected, retry ${attempt}/${maxRetries}`, {
          error: error.message
        });

        // Exponential backoff: 100ms, 200ms, 400ms
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
        continue;
      }

      // Re-throw if not a deadlock or max retries exceeded
      throw error;
    }
  }

  throw new ConcurrencyError(
    `Transaction failed after ${maxRetries} attempts due to concurrent modifications`
  );
}

/**
 * Acquire a row-level lock on a record using SELECT ... FOR UPDATE
 *
 * @param {Object} tx - Prisma transaction client
 * @param {string} table - Table name
 * @param {string} id - Record ID to lock
 * @param {number} timeout - Lock timeout in seconds (default: 5)
 * @returns {Promise<Object>} Locked record
 */
async function lockForUpdate(tx, table, id, timeout = 5) {
  // PostgreSQL: Use SELECT ... FOR UPDATE with NOWAIT or timeout
  const result = await tx.$queryRawUnsafe(
    `SELECT * FROM "${table}" WHERE id = $1 FOR UPDATE NOWAIT`,
    id
  );

  if (!result || result.length === 0) {
    throw new ValidationError(`Record not found in ${table} with id ${id}`);
  }

  return result[0];
}

/**
 * Acquire application-level advisory lock
 * This is useful for serializing certain operations
 *
 * @param {Object} tx - Prisma transaction client
 * @param {string} lockKey - Unique lock key
 * @returns {Promise<boolean>} True if lock acquired
 */
async function acquireAdvisoryLock(tx, lockKey) {
  // Convert string to integer hash for pg_advisory_xact_lock
  const lockId = hashStringToInt(lockKey);

  // Try to acquire advisory lock (auto-released at transaction end)
  const result = await tx.$queryRaw`
    SELECT pg_try_advisory_xact_lock(${lockId}) as locked
  `;

  return result[0].locked;
}

/**
 * Simple string hash function (for advisory locks)
 */
function hashStringToInt(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Validate and compare decimal amounts with tolerance
 * FIXED: Uses Decimal.js instead of parseFloat() to avoid precision errors
 *
 * @param {Decimal|number|string} amount1
 * @param {Decimal|number|string} amount2
 * @param {number} tolerance - Allowed difference (default: 0.0001 for DECIMAL(18,4))
 * @returns {boolean} True if amounts are equal within tolerance
 */
function compareAmounts(amount1, amount2, tolerance = 0.0001) {
  try {
    const dec1 = new Decimal(amount1 || 0);
    const dec2 = new Decimal(amount2 || 0);
    const diff = dec1.minus(dec2).abs();
    return diff.lessThanOrEqualTo(tolerance);
  } catch (error) {
    logger.error('compareAmounts error:', { amount1, amount2, error: error.message });
    return false;
  }
}

/**
 * Safely add decimal amounts
 * FIXED: Uses Decimal.js instead of parseFloat() to avoid precision errors
 *
 * @param {...(Decimal|number|string)} amounts - Amounts to add
 * @returns {string} Sum formatted to 4 decimal places
 */
function addAmounts(...amounts) {
  try {
    const sum = amounts.reduce((acc, amount) => {
      return acc.plus(new Decimal(amount || 0));
    }, new Decimal(0));
    return sum.toFixed(4);
  } catch (error) {
    logger.error('addAmounts error:', { amounts, error: error.message });
    return '0.0000';
  }
}

/**
 * Format amount to fixed precision for storage
 * FIXED: Uses Decimal.js instead of parseFloat() to avoid precision errors
 *
 * @param {Decimal|number|string} amount - Amount to format
 * @param {number} precision - Decimal places (default: 4)
 * @returns {number} Formatted amount as number (for Prisma Decimal compatibility)
 */
function formatAmount(amount, precision = 4) {
  try {
    const dec = new Decimal(amount || 0);
    // Return as number for Prisma Decimal field compatibility
    return parseFloat(dec.toFixed(precision));
  } catch (error) {
    logger.error('formatAmount error:', { amount, error: error.message });
    return 0;
  }
}

/**
 * Parse and normalize date input consistently
 * Handles: Date objects, ISO strings, timestamps, null/undefined
 *
 * @param {Date|string|number|null|undefined} dateInput - Date to parse
 * @returns {Date} Parsed Date object (or current date if input is null/undefined)
 */
function parseDate(dateInput) {
  // Return current date if no input provided
  if (!dateInput) {
    return new Date();
  }

  // If already a Date object, return as-is
  if (dateInput instanceof Date) {
    return dateInput;
  }

  // Parse string or number input
  return new Date(dateInput);
}

/**
 * Multiply two amounts with precision
 * @param {Decimal|number|string} amount1
 * @param {Decimal|number|string} amount2
 * @returns {number} Product formatted to 4 decimal places
 */
function multiplyAmounts(amount1, amount2) {
  try {
    const dec1 = new Decimal(amount1 || 0);
    const dec2 = new Decimal(amount2 || 0);
    const product = dec1.times(dec2);
    return parseFloat(product.toFixed(4));
  } catch (error) {
    logger.error('multiplyAmounts error:', { amount1, amount2, error: error.message });
    return 0;
  }
}

/**
 * Divide two amounts with precision
 * @param {Decimal|number|string} amount1 - Numerator
 * @param {Decimal|number|string} amount2 - Denominator
 * @returns {number} Quotient formatted to 4 decimal places
 */
function divideAmounts(amount1, amount2) {
  try {
    const dec1 = new Decimal(amount1 || 0);
    const dec2 = new Decimal(amount2 || 0);
    if (dec2.isZero()) {
      logger.warn('divideAmounts: Division by zero', { amount1, amount2 });
      return 0;
    }
    const quotient = dec1.dividedBy(dec2);
    return parseFloat(quotient.toFixed(4));
  } catch (error) {
    logger.error('divideAmounts error:', { amount1, amount2, error: error.message });
    return 0;
  }
}

/**
 * Subtract two amounts with precision
 * @param {Decimal|number|string} amount1
 * @param {Decimal|number|string} amount2
 * @returns {number} Difference formatted to 4 decimal places
 */
function subtractAmounts(amount1, amount2) {
  try {
    const dec1 = new Decimal(amount1 || 0);
    const dec2 = new Decimal(amount2 || 0);
    const diff = dec1.minus(dec2);
    return parseFloat(diff.toFixed(4));
  } catch (error) {
    logger.error('subtractAmounts error:', { amount1, amount2, error: error.message });
    return 0;
  }
}

/**
 * Calculate percentage of amount
 * @param {Decimal|number|string} amount - Base amount
 * @param {Decimal|number|string} percentage - Percentage (e.g., 10 for 10%)
 * @returns {number} Result formatted to 4 decimal places
 */
function calculatePercentage(amount, percentage) {
  try {
    const dec = new Decimal(amount || 0);
    const pct = new Decimal(percentage || 0);
    const result = dec.times(pct).dividedBy(100);
    return parseFloat(result.toFixed(4));
  } catch (error) {
    logger.error('calculatePercentage error:', { amount, percentage, error: error.message });
    return 0;
  }
}

module.exports = {
  withTransaction,
  lockForUpdate,
  acquireAdvisoryLock,
  ValidationError,
  ConcurrencyError,
  InsufficientBalanceError,
  compareAmounts,
  addAmounts,
  formatAmount,
  parseDate,
  // New Decimal-based helpers
  multiplyAmounts,
  divideAmounts,
  subtractAmounts,
  calculatePercentage,
  Decimal // Export Decimal for advanced use cases
};
