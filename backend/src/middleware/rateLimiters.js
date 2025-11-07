/**
 * Rate Limiting Middleware for Financial Operations
 *
 * Implements tiered rate limiting to prevent abuse and ensure system stability:
 * - Strict limits on payment/invoice creation (high-value operations)
 * - Moderate limits on read operations
 * - Lenient limits on general queries
 */

const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

/**
 * Custom handler for rate limit exceeded
 */
const rateLimitHandler = (req, res) => {
  logger.warn('Rate limit exceeded', {
    ip: req.ip,
    user: req.user?.id,
    path: req.path,
    method: req.method
  });

  res.status(429).json({
    success: false,
    message: 'Too many requests. Please try again later.',
    retryAfter: req.rateLimit.resetTime
  });
};

/**
 * Strict rate limiter for payment operations
 * Limit: 10 requests per minute per user
 * Use: Payment creation, payment voiding
 */
const paymentRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many payment requests. Maximum 10 payments per minute.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => {
    // Rate limit per user (not IP) for authenticated operations
    return req.user?.id || req.ip;
  }
});

/**
 * Moderate rate limiter for invoice/bill creation
 * Limit: 20 requests per minute per user
 * Use: Invoice creation, Bill creation, PO creation
 */
const creationRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20,
  message: 'Too many creation requests. Maximum 20 per minute.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => req.user?.id || req.ip
});

/**
 * Moderate rate limiter for update/cancel operations
 * Limit: 30 requests per minute per user
 * Use: Invoice cancellation, Bill cancellation, Status updates
 */
const updateRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  message: 'Too many update requests. Maximum 30 per minute.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => req.user?.id || req.ip
});

/**
 * Lenient rate limiter for read operations
 * Limit: 100 requests per minute per user
 * Use: Viewing invoices, bills, ledgers, reports
 */
const readRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  message: 'Too many read requests. Maximum 100 per minute.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => req.user?.id || req.ip
});

/**
 * Very strict rate limiter for bulk import operations
 * Limit: 5 requests per 5 minutes per user
 * Use: Excel import, bulk operations
 */
const bulkOperationRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5,
  message: 'Too many bulk operations. Maximum 5 per 5 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => req.user?.id || req.ip
});

module.exports = {
  paymentRateLimiter,
  creationRateLimiter,
  updateRateLimiter,
  readRateLimiter,
  bulkOperationRateLimiter
};
