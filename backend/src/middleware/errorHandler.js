// ========== src/middleware/errorHandler.js ==========
const logger = require('../config/logger');

const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message;
  let errorResponse = {
    success: false,
    message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  };

  // Handle custom error types from transaction wrapper
  if (err.name === 'ValidationError') {
    statusCode = 400;
  } else if (err.name === 'ConcurrencyError') {
    statusCode = 409;
    message = err.message || 'This record is being modified by another user. Please try again.';
  } else if (err.name === 'InsufficientBalanceError') {
    statusCode = 400;
    // Include additional context for InsufficientBalanceError
    errorResponse = {
      success: false,
      error: {
        message: err.message,
        available: err.available,
        required: err.required
      },
      stack: process.env.NODE_ENV === 'production' ? null : err.stack
    };
  }

  // Prisma errors
  if (err.code === 'P2002') {
    statusCode = 400;
    message = `Duplicate value for ${err.meta?.target}`;
  }

  if (err.code === 'P2025') {
    statusCode = 404;
    message = 'Record not found';
  }

  // PostgreSQL deadlock errors
  if (err.code === '40001' || err.code === '40P01') {
    statusCode = 409;
    message = 'Transaction conflict detected. Please retry your request.';
  }

  // Log error with appropriate level
  const logLevel = statusCode >= 500 ? 'error' : 'warn';
  logger[logLevel]({
    message: err.message,
    errorName: err.name,
    statusCode,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    user: req.user?.id
  });

  // Send error response
  if (err.name === 'InsufficientBalanceError') {
    res.status(statusCode).json(errorResponse);
  } else {
    res.status(statusCode).json({
      success: false,
      message,
      stack: process.env.NODE_ENV === 'production' ? null : err.stack
    });
  }
};

module.exports = {
  notFound,
  errorHandler
};