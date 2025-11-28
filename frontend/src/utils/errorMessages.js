// ========== src/utils/errorMessages.js ==========
/**
 * Error Message Mapper Utility
 * Provides standardized, user-friendly error messages across the application
 */

/**
 * HTTP Status Code Messages
 */
const HTTP_STATUS_MESSAGES = {
  400: 'Invalid request. Please check your input and try again.',
  401: 'You are not authorized. Please log in again.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested resource was not found.',
  408: 'Request timeout. Please check your connection and try again.',
  409: 'This operation conflicts with existing data. Please refresh and try again.',
  422: 'Validation failed. Please check the form and correct any errors.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'An internal server error occurred. Please try again later.',
  502: 'Service temporarily unavailable. Please try again later.',
  503: 'Service temporarily unavailable. Please try again later.',
  504: 'Gateway timeout. Please check your connection and try again.'
};

/**
 * Backend Error Type Messages
 * Maps backend error types/codes to user-friendly messages
 */
const ERROR_TYPE_MESSAGES = {
  // Validation errors
  VALIDATION_ERROR: 'Please check your input and correct any errors.',
  INVALID_INPUT: 'One or more fields contain invalid data.',
  REQUIRED_FIELD: 'Required fields are missing.',

  // Authentication & Authorization
  UNAUTHORIZED: 'You are not logged in. Please log in to continue.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  TOKEN_EXPIRED: 'Your session has expired. Please log in again.',
  INVALID_CREDENTIALS: 'Invalid username or password.',

  // Database errors
  NOT_FOUND: 'The requested item could not be found.',
  DUPLICATE_ENTRY: 'This entry already exists in the system.',
  FOREIGN_KEY_CONSTRAINT: 'Cannot delete this item because it is being used elsewhere.',
  UNIQUE_CONSTRAINT: 'A record with this value already exists.',

  // Business logic errors
  INSUFFICIENT_BALANCE: 'Insufficient balance for this operation.',
  INSUFFICIENT_STOCK: 'Not enough items available in stock.',
  INVALID_STATUS: 'Cannot perform this action in the current status.',
  INVALID_TRANSITION: 'This status change is not allowed.',
  OVER_CREDIT_LIMIT: 'This operation would exceed the customer credit limit.',
  ALREADY_CANCELLED: 'This item has already been cancelled.',
  ALREADY_PAID: 'This item has already been paid.',
  ALREADY_DELIVERED: 'This item has already been delivered.',

  // Concurrency errors
  CONCURRENCY_ERROR: 'This record is being modified by another user. Please refresh and try again.',
  DEADLOCK_DETECTED: 'A conflict occurred. Please try again.',
  LOCKED: 'This record is currently locked. Please try again in a moment.',

  // Network errors
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  TIMEOUT: 'Request timed out. Please try again.',

  // File errors
  FILE_TOO_LARGE: 'The file is too large. Maximum size is 5MB.',
  INVALID_FILE_TYPE: 'Invalid file type. Please upload a valid file.',
  UPLOAD_FAILED: 'File upload failed. Please try again.',

  // General errors
  INTERNAL_ERROR: 'An unexpected error occurred. Please try again.',
  UNKNOWN_ERROR: 'An unknown error occurred. Please try again or contact support.'
};

/**
 * Context-specific error messages
 * Provides more specific messages based on the operation context
 */
const CONTEXT_MESSAGES = {
  invoice: {
    create: 'Failed to create invoice. Please check all fields and try again.',
    update: 'Failed to update invoice. Please try again.',
    delete: 'Failed to delete invoice. It may be in use or already processed.',
    cancel: 'Failed to cancel invoice. It may already be paid or delivered.',
    notFound: 'Invoice not found. It may have been deleted.',
    overCreditLimit: 'Cannot create invoice. This would exceed the customer\'s credit limit.',
    noItems: 'Cannot create invoice without items. Please add at least one item.',
    invalidStatus: 'Cannot modify invoice in its current status.'
  },
  payment: {
    create: 'Failed to record payment. Please check the amount and try again.',
    void: 'Failed to void payment. Please try again.',
    overpayment: 'Payment amount exceeds the remaining balance.',
    invalidAmount: 'Payment amount must be greater than zero.',
    alreadyPaid: 'This invoice is already fully paid.',
    notFound: 'Payment not found. It may have been deleted.'
  },
  customer: {
    create: 'Failed to create customer. The phone number may already be in use.',
    update: 'Failed to update customer. Please try again.',
    delete: 'Cannot delete customer. They have existing invoices or transactions.',
    notFound: 'Customer not found.',
    duplicatePhone: 'A customer with this phone number already exists.',
    hasTransactions: 'Cannot delete customer with existing transactions.'
  },
  vendor: {
    create: 'Failed to create vendor. The code may already be in use.',
    update: 'Failed to update vendor. Please try again.',
    delete: 'Cannot delete vendor. They have existing purchase orders or bills.',
    notFound: 'Vendor not found.',
    duplicateCode: 'A vendor with this code already exists.',
    hasTransactions: 'Cannot delete vendor with existing transactions.'
  },
  item: {
    create: 'Failed to create item. Please check all fields and try again.',
    update: 'Failed to update item. Please try again.',
    delete: 'Cannot delete item. It may be reserved or sold.',
    notFound: 'Item not found.',
    alreadyReserved: 'This item is already reserved for another order.',
    alreadySold: 'This item has already been sold.',
    invalidSerial: 'Serial number already exists or is invalid.',
    insufficientStock: 'Not enough items available in stock.'
  },
  purchaseOrder: {
    create: 'Failed to create purchase order. Please check all fields and try again.',
    update: 'Failed to update purchase order. It may already be processed.',
    cancel: 'Failed to cancel purchase order. It may have associated bills or received items.',
    notFound: 'Purchase order not found.',
    invalidStatus: 'Cannot modify purchase order in its current status.',
    hasBills: 'Cannot modify purchase order with existing bills.',
    hasItems: 'Cannot cancel purchase order with received items.'
  },
  bill: {
    create: 'Failed to create bill. The amount may exceed the purchase order total.',
    update: 'Failed to update bill. It may have existing payments.',
    cancel: 'Failed to cancel bill. It may have payments or received items.',
    notFound: 'Bill not found.',
    exceedsPO: 'Bill amount exceeds the remaining purchase order balance.',
    hasPayments: 'Cannot modify bill with existing payments.',
    invalidAmount: 'Bill amount must be greater than zero.'
  },
  user: {
    create: 'Failed to create user. The username may already be in use.',
    update: 'Failed to update user. Please try again.',
    delete: 'Cannot delete user. They may have associated records.',
    notFound: 'User not found.',
    duplicateUsername: 'This username is already taken.',
    weakPassword: 'Password does not meet security requirements.'
  },
  category: {
    create: 'Failed to create category. The code may already be in use.',
    update: 'Failed to update category. Please try again.',
    delete: 'Cannot delete category. It may have associated products or items.',
    notFound: 'Category not found.',
    duplicateCode: 'A category with this code already exists.',
    hasProducts: 'Cannot delete category with existing products.',
    hasItems: 'Cannot delete category with existing inventory items.',
    invalidTemplate: 'Specification template is invalid. Please check the format.'
  },
  company: {
    create: 'Failed to create company. The name may already be in use.',
    update: 'Failed to update company. Please try again.',
    delete: 'Cannot delete company. It may have associated product models or items.',
    notFound: 'Company not found.',
    duplicateName: 'A company with this name already exists.',
    hasModels: 'Cannot delete company with existing product models.',
    hasItems: 'Cannot delete company with existing inventory items.'
  },
  model: {
    create: 'Failed to create product model. The name may already be in use for this company.',
    update: 'Failed to update product model. Please try again.',
    delete: 'Cannot delete product model. It may have associated inventory items.',
    notFound: 'Product model not found.',
    duplicateName: 'A model with this name already exists for this company.',
    hasItems: 'Cannot delete product model with existing inventory items.',
    invalidCategory: 'The selected category is invalid or does not exist.',
    invalidCompany: 'The selected company is invalid or does not exist.'
  }
};

/**
 * Prisma Error Code Mappings
 * Maps Prisma error codes to user-friendly messages
 */
const PRISMA_ERROR_CODES = {
  P2002: 'A record with this value already exists. Please use a different value.',
  P2003: 'This operation would violate a relationship constraint.',
  P2025: 'The record you are trying to update or delete does not exist.',
  P2014: 'This operation would violate a required relationship.',
  P2016: 'Query interpretation error. Please contact support.',
  P2021: 'The table does not exist in the database.',
  P2022: 'The column does not exist in the database.',
  P2023: 'Inconsistent column data.',
  P1001: 'Cannot connect to the database. Please try again later.',
  P1002: 'Database connection timed out. Please try again.',
  P1008: 'Operation timed out. Please try again.',
  P1017: 'Database connection lost. Please try again.'
};

/**
 * Extract field name from Prisma unique constraint error
 * Example: "Unique constraint failed on the fields: (`phone`)" -> "phone"
 */
const extractFieldFromPrismaError = (message) => {
  const match = message.match(/fields?: \(`([^`]+)`\)/);
  return match ? match[1] : null;
};

/**
 * Get user-friendly field name
 */
const getFieldLabel = (fieldName) => {
  const fieldLabels = {
    phone: 'phone number',
    email: 'email address',
    code: 'vendor code',
    serialNumber: 'serial number',
    username: 'username',
    billNumber: 'bill number',
    invoiceNumber: 'invoice number',
    poNumber: 'purchase order number'
  };
  return fieldLabels[fieldName] || fieldName;
};

/**
 * Main error message mapper function
 * @param {Error} error - The error object from axios or other sources
 * @param {string} context - Optional context (e.g., 'invoice', 'payment', 'customer')
 * @param {string} operation - Optional operation (e.g., 'create', 'update', 'delete')
 * @returns {string} User-friendly error message
 */
export const getErrorMessage = (error, context = null, operation = null) => {
  // Return string errors directly
  if (typeof error === 'string') {
    return error;
  }

  // Handle axios errors
  if (error.response) {
    const { status, data } = error.response;

    // Check for backend error message
    if (data?.message) {
      // If it's a detailed backend message, return it
      if (data.message.length > 10) {
        return data.message;
      }
    }

    // Check for InsufficientBalanceError structure
    if (data?.error) {
      const { message, available, required } = data.error;
      if (available !== undefined && required !== undefined) {
        return `${message}. Available: PKR ${available.toLocaleString()}, Required: PKR ${required.toLocaleString()}`;
      }
      if (message) {
        return message;
      }
    }

    // Check for error type
    if (data?.type && ERROR_TYPE_MESSAGES[data.type]) {
      return ERROR_TYPE_MESSAGES[data.type];
    }

    // Check for Prisma error code
    if (data?.code && PRISMA_ERROR_CODES[data.code]) {
      const prismaMessage = PRISMA_ERROR_CODES[data.code];

      // Enhanced message for unique constraint (P2002)
      if (data.code === 'P2002' && data.message) {
        const field = extractFieldFromPrismaError(data.message);
        if (field) {
          const fieldLabel = getFieldLabel(field);
          return `A record with this ${fieldLabel} already exists. Please use a different ${fieldLabel}.`;
        }
      }

      return prismaMessage;
    }

    // Check for context-specific message
    if (context && operation && CONTEXT_MESSAGES[context]?.[operation]) {
      return CONTEXT_MESSAGES[context][operation];
    }

    // Fallback to HTTP status message
    if (HTTP_STATUS_MESSAGES[status]) {
      return HTTP_STATUS_MESSAGES[status];
    }
  }

  // Handle network errors
  if (error.request && !error.response) {
    return ERROR_TYPE_MESSAGES.NETWORK_ERROR;
  }

  // Handle timeout errors
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return ERROR_TYPE_MESSAGES.TIMEOUT;
  }

  // Fallback to error message if available
  if (error.message) {
    return error.message;
  }

  // Ultimate fallback
  return ERROR_TYPE_MESSAGES.UNKNOWN_ERROR;
};

/**
 * Shorthand function for common operations
 */
export const getOperationError = (error, context, operation) => {
  return getErrorMessage(error, context, operation);
};

/**
 * Get validation error messages from form validation
 * @param {Object} validationErrors - Validation errors from form
 * @returns {string[]} Array of error messages
 */
export const getValidationErrors = (validationErrors) => {
  if (!validationErrors || typeof validationErrors !== 'object') {
    return [];
  }

  const messages = [];
  Object.keys(validationErrors).forEach(field => {
    const errors = validationErrors[field];
    if (Array.isArray(errors)) {
      errors.forEach(error => {
        messages.push(typeof error === 'string' ? error : error.message);
      });
    } else if (typeof errors === 'string') {
      messages.push(errors);
    }
  });

  return messages;
};

/**
 * Check if error is a specific type
 */
export const isAuthError = (error) => {
  return error.response?.status === 401 || error.response?.status === 403;
};

export const isValidationError = (error) => {
  return error.response?.status === 400 || error.response?.status === 422;
};

export const isNotFoundError = (error) => {
  return error.response?.status === 404;
};

export const isConcurrencyError = (error) => {
  return error.response?.status === 409 || error.response?.data?.type === 'CONCURRENCY_ERROR';
};

export const isNetworkError = (error) => {
  return error.request && !error.response;
};

/**
 * Export error type constants for use in components
 */
export const ERROR_TYPES = ERROR_TYPE_MESSAGES;
export const HTTP_STATUSES = HTTP_STATUS_MESSAGES;
