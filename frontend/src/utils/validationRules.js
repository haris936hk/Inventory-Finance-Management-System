// ========== src/utils/validationRules.js ==========
// Centralized validation rules for forms
import { VALIDATION } from '../config/constants';
import { parseAmount, isPositive } from './decimalUtils';

/**
 * Phone Number Validation (Pakistan format: 03XXXXXXXXX)
 */
export const phoneRules = [
  { required: true, message: 'Phone number is required' },
  {
    pattern: VALIDATION.PHONE_PATTERN,
    message: 'Please enter a valid 11-digit phone number (e.g., 03001234567)'
  },
  {
    validator: (_, value) => {
      if (!value) return Promise.resolve();
      if (value.length !== 11) {
        return Promise.reject(new Error('Phone number must be exactly 11 digits'));
      }
      return Promise.resolve();
    }
  }
];

/**
 * Optional Phone Number Validation
 */
export const optionalPhoneRules = [
  {
    pattern: VALIDATION.PHONE_PATTERN,
    message: 'Please enter a valid 11-digit phone number (e.g., 03001234567)'
  },
  {
    validator: (_, value) => {
      if (!value) return Promise.resolve();
      if (value.length !== 11) {
        return Promise.reject(new Error('Phone number must be exactly 11 digits'));
      }
      return Promise.resolve();
    }
  }
];

/**
 * Email Validation
 */
export const emailRules = [
  { required: true, message: 'Email is required' },
  {
    type: 'email',
    message: 'Please enter a valid email address'
  },
  {
    pattern: VALIDATION.EMAIL_PATTERN,
    message: 'Please enter a valid email format (e.g., user@example.com)'
  }
];

/**
 * Optional Email Validation
 */
export const optionalEmailRules = [
  {
    type: 'email',
    message: 'Please enter a valid email address'
  },
  {
    validator: (_, value) => {
      if (!value) return Promise.resolve();
      if (!VALIDATION.EMAIL_PATTERN.test(value)) {
        return Promise.reject(new Error('Please enter a valid email format'));
      }
      return Promise.resolve();
    }
  }
];

/**
 * NIC/CNIC Validation (Pakistan: 13 digits without dashes)
 */
export const nicRules = [
  {
    validator: (_, value) => {
      if (!value) return Promise.resolve(); // Optional field
      const cleanedValue = value.replace(/[-\s]/g, '');
      if (!/^\d{13}$/.test(cleanedValue)) {
        return Promise.reject(new Error('NIC must be 13 digits (e.g., 1234567890123)'));
      }
      return Promise.resolve();
    }
  }
];

/**
 * Required NIC Validation
 */
export const requiredNicRules = [
  { required: true, message: 'NIC is required' },
  ...nicRules
];

/**
 * Amount Validation (Positive, within limits)
 */
export const amountRules = [
  { required: true, message: 'Amount is required' },
  { type: 'number', message: 'Amount must be a number' },
  {
    validator: (_, value) => {
      if (value === null || value === undefined) {
        return Promise.reject(new Error('Amount is required'));
      }
      const amount = parseAmount(value);
      if (!isPositive(amount)) {
        return Promise.reject(new Error('Amount must be greater than zero'));
      }
      if (amount > VALIDATION.MAX_AMOUNT) {
        return Promise.reject(new Error(`Amount cannot exceed ${VALIDATION.MAX_AMOUNT.toLocaleString()}`));
      }
      return Promise.resolve();
    }
  }
];

/**
 * Optional Amount Validation (Positive, within limits)
 */
export const optionalAmountRules = [
  { type: 'number', message: 'Amount must be a number' },
  {
    validator: (_, value) => {
      if (value === null || value === undefined || value === '') {
        return Promise.resolve(); // Allow empty
      }
      const amount = parseAmount(value);
      if (amount < 0) {
        return Promise.reject(new Error('Amount cannot be negative'));
      }
      if (amount > VALIDATION.MAX_AMOUNT) {
        return Promise.reject(new Error(`Amount cannot exceed ${VALIDATION.MAX_AMOUNT.toLocaleString()}`));
      }
      return Promise.resolve();
    }
  }
];

/**
 * Credit Limit Validation
 */
export const creditLimitRules = [
  { type: 'number', message: 'Credit limit must be a number' },
  {
    validator: (_, value) => {
      if (value === null || value === undefined || value === 0) {
        return Promise.resolve(); // Allow zero (no limit)
      }
      const amount = parseAmount(value);
      if (amount < 0) {
        return Promise.reject(new Error('Credit limit cannot be negative'));
      }
      if (amount > VALIDATION.MAX_AMOUNT) {
        return Promise.reject(new Error(`Credit limit cannot exceed ${VALIDATION.MAX_AMOUNT.toLocaleString()}`));
      }
      return Promise.resolve();
    }
  }
];

/**
 * Percentage Validation (0-100)
 */
export const percentageRules = [
  { type: 'number', message: 'Percentage must be a number' },
  {
    validator: (_, value) => {
      if (value === null || value === undefined) {
        return Promise.resolve(); // Allow empty
      }
      if (value < 0 || value > 100) {
        return Promise.reject(new Error('Percentage must be between 0 and 100'));
      }
      return Promise.resolve();
    }
  }
];

/**
 * Discount Validation (based on type)
 */
export const getDiscountRules = (discountType, subtotal) => [
  { type: 'number', message: 'Discount must be a number' },
  {
    validator: (_, value) => {
      if (value === null || value === undefined || value === 0) {
        return Promise.resolve(); // Allow zero
      }

      if (value < 0) {
        return Promise.reject(new Error('Discount cannot be negative'));
      }

      if (discountType === 'Percentage') {
        if (value > 100) {
          return Promise.reject(new Error('Discount percentage cannot exceed 100%'));
        }
      } else if (discountType === 'Fixed') {
        const discountAmount = parseAmount(value);
        const subAmount = parseAmount(subtotal);
        if (discountAmount > subAmount) {
          return Promise.reject(new Error('Discount cannot exceed subtotal amount'));
        }
      }

      return Promise.resolve();
    }
  }
];

/**
 * Quantity Validation
 */
export const quantityRules = [
  { required: true, message: 'Quantity is required' },
  { type: 'number', message: 'Quantity must be a number' },
  {
    validator: (_, value) => {
      if (!value || value < 1) {
        return Promise.reject(new Error('Quantity must be at least 1'));
      }
      if (value > 999999) {
        return Promise.reject(new Error('Quantity cannot exceed 999,999'));
      }
      return Promise.resolve();
    }
  }
];

/**
 * Serial Number Validation
 */
export const serialNumberRules = [
  { required: true, message: 'Serial number is required' },
  {
    min: 3,
    message: 'Serial number must be at least 3 characters'
  },
  {
    max: 50,
    message: 'Serial number cannot exceed 50 characters'
  },
  {
    pattern: /^[A-Z0-9-]+$/,
    message: 'Serial number can only contain uppercase letters, numbers, and hyphens'
  }
];

/**
 * Name Validation (for customers, vendors, products)
 */
export const nameRules = [
  { required: true, message: 'Name is required' },
  {
    min: 2,
    message: 'Name must be at least 2 characters'
  },
  {
    max: 100,
    message: 'Name cannot exceed 100 characters'
  },
  {
    whitespace: true,
    message: 'Name cannot be only whitespace'
  }
];

/**
 * Code Validation (for vendors, products)
 */
export const codeRules = [
  { required: true, message: 'Code is required' },
  {
    min: 2,
    message: 'Code must be at least 2 characters'
  },
  {
    max: 20,
    message: 'Code cannot exceed 20 characters'
  },
  {
    pattern: /^[A-Z0-9-]+$/,
    message: 'Code can only contain uppercase letters, numbers, and hyphens'
  }
];

/**
 * Address Validation
 */
export const addressRules = [
  {
    max: 500,
    message: 'Address cannot exceed 500 characters'
  }
];

/**
 * Notes/Description Validation
 */
export const notesRules = [
  {
    max: 1000,
    message: 'Notes cannot exceed 1000 characters'
  }
];

/**
 * Required Date Validation
 */
export const requiredDateRules = [
  { required: true, message: 'Date is required' }
];

/**
 * Payment Method Validation
 */
export const paymentMethodRules = [
  { required: true, message: 'Payment method is required' }
];

/**
 * Required Select Validation
 */
export const requiredSelectRules = (fieldName) => [
  { required: true, message: `Please select ${fieldName}` }
];
