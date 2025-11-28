// ========== src/middleware/decimalSerializer.js ==========
const { Decimal } = require('@prisma/client/runtime/library');

/**
 * Middleware to convert Prisma Decimal objects to numbers before JSON serialization
 *
 * Prisma returns Decimal objects for DECIMAL database columns.
 * When Express serializes these to JSON, they become strings, causing
 * string concatenation bugs in frontend calculations.
 *
 * This middleware recursively converts all Decimal objects to numbers
 * before sending the response.
 */

/**
 * Recursively convert Decimal objects to numbers
 * @param {*} obj - Object to convert
 * @returns {*} Object with Decimals converted to numbers
 */
function convertDecimalsToNumbers(obj) {
  // Handle null/undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle Decimal objects
  if (obj instanceof Decimal) {
    return parseFloat(obj.toString());
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => convertDecimalsToNumbers(item));
  }

  // Handle plain objects
  if (typeof obj === 'object' && obj.constructor === Object) {
    const converted = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        converted[key] = convertDecimalsToNumbers(obj[key]);
      }
    }
    return converted;
  }

  // Return primitives as-is
  return obj;
}

/**
 * Express middleware that overrides res.json() to auto-convert Decimals
 */
const decimalSerializer = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = function(data) {
    // Convert all Decimal objects to numbers
    const convertedData = convertDecimalsToNumbers(data);

    // Call original json method with converted data
    return originalJson(convertedData);
  };

  next();
};

module.exports = decimalSerializer;
