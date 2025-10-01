/**
 * Transaction wrapper utilities for safe concurrent operations
 */

const db = require('../config/database');
const logger = require('../config/logger');

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

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await db.prisma.$transaction(
        async (tx) => {
          // Set transaction isolation level
          if (isolationLevel === 'Serializable') {
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
 *
 * @param {Decimal|number|string} amount1
 * @param {Decimal|number|string} amount2
 * @param {number} tolerance - Allowed difference (default: 0.0001 for DECIMAL(18,4))
 * @returns {boolean} True if amounts are equal within tolerance
 */
function compareAmounts(amount1, amount2, tolerance = 0.0001) {
  const diff = Math.abs(parseFloat(amount1) - parseFloat(amount2));
  return diff <= tolerance;
}

/**
 * Safely add decimal amounts
 */
function addAmounts(...amounts) {
  return amounts.reduce((sum, amount) => {
    return sum + (parseFloat(amount) || 0);
  }, 0);
}

/**
 * Format amount to fixed precision for storage
 */
function formatAmount(amount, precision = 4) {
  return parseFloat(parseFloat(amount).toFixed(precision));
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
  formatAmount
};
