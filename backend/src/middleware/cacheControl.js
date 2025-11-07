// ========== src/middleware/cacheControl.js ==========
// Cache-Control Middleware
// Adds appropriate cache headers to GET requests for improved performance

/**
 * Middleware to add cache-control headers for GET requests
 * @param {number} maxAge - Cache duration in seconds
 */
const cacheControl = (maxAge = 300) => {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method === 'GET') {
      // Set Cache-Control header
      res.set('Cache-Control', `public, max-age=${maxAge}`);
    }
    next();
  };
};

/**
 * No-cache middleware for endpoints that should never be cached
 */
const noCache = (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
};

/**
 * Predefined cache durations
 */
const CACHE_DURATION = {
  NONE: 0,
  SHORT: 60,           // 1 minute - for frequently changing data
  MEDIUM: 300,         // 5 minutes - for standard API responses
  LONG: 900,           // 15 minutes - for dropdown/reference data
  VERY_LONG: 3600,     // 1 hour - for static/rarely changing data
  DAY: 86400           // 24 hours - for truly static content
};

module.exports = {
  cacheControl,
  noCache,
  CACHE_DURATION
};
