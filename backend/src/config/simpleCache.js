// ========== src/config/simpleCache.js ==========
// Simple In-Memory Cache for Electron Desktop App
// Provides high-performance caching per Electron instance without external dependencies

const logger = require('./logger');

class SimpleCacheManager {
  constructor() {
    this.cache = new Map();
    this.isConnected = true; // Always "connected" for in-memory cache

    // Cache configuration
    this.config = {
      // Default TTL values (in seconds)
      TTL: {
        DASHBOARD: 5 * 60,        // 5 minutes
        DROPDOWN: 15 * 60,         // 15 minutes
        STATISTICS: 10 * 60,       // 10 minutes
        SHORT: 60,                 // 1 minute
        MEDIUM: 5 * 60,            // 5 minutes
        LONG: 30 * 60              // 30 minutes
      },
      // Key prefixes for organized cache
      KEYS: {
        DASHBOARD: 'dashboard:',
        CATEGORIES: 'categories:',
        COMPANIES: 'companies:',
        MODELS: 'models:',
        VENDORS: 'vendors:',
        CUSTOMERS: 'customers:',
        STATISTICS: 'stats:'
      }
    };
  }

  /**
   * Initialize cache (no-op for in-memory, but keeps API consistent)
   */
  async connect() {
    logger.info('✅ In-memory cache initialized (Electron mode)');
  }

  /**
   * Disconnect from cache (clears memory)
   */
  async disconnect() {
    this.cache.clear();
    logger.info('In-memory cache cleared');
  }

  /**
   * Get cached value by key
   */
  async get(key) {
    try {
      const cached = this.cache.get(key);
      if (cached) {
        // Check if expired
        if (cached.expiresAt && cached.expiresAt < Date.now()) {
          this.cache.delete(key);
          logger.debug(`Cache MISS (expired): ${key}`);
          return null;
        }
        logger.debug(`Cache HIT: ${key}`);
        return cached.value;
      }
      logger.debug(`Cache MISS: ${key}`);
      return null;
    } catch (error) {
      logger.error(`Cache GET error for key ${key}:`, error.message);
      return null;
    }
  }

  /**
   * Set cached value with TTL
   */
  async set(key, value, ttl = this.config.TTL.MEDIUM) {
    try {
      const expiresAt = Date.now() + (ttl * 1000);
      this.cache.set(key, {
        value,
        expiresAt
      });
      logger.debug(`Cache SET: ${key} (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      logger.error(`Cache SET error for key ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Delete cached value
   */
  async del(key) {
    try {
      this.cache.delete(key);
      logger.debug(`Cache DELETE: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Cache DELETE error for key ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Delete all keys matching a pattern
   */
  async delPattern(pattern) {
    try {
      const regex = new RegExp(pattern.replace('*', '.*'));
      let deletedCount = 0;

      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          this.cache.delete(key);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        logger.debug(`Cache DELETE pattern: ${pattern} (${deletedCount} keys)`);
      }
      return true;
    } catch (error) {
      logger.error(`Cache DELETE pattern error for ${pattern}:`, error.message);
      return false;
    }
  }

  /**
   * Clear all cache
   */
  async flush() {
    try {
      this.cache.clear();
      logger.info('Cache flushed successfully');
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error.message);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      return {
        connected: true,
        type: 'in-memory',
        size: this.cache.size,
        keys: Array.from(this.cache.keys())
      };
    } catch (error) {
      logger.error('Cache stats error:', error.message);
      return { connected: false, error: error.message };
    }
  }

  /**
   * Cache wrapper function - get from cache or execute function
   */
  async wrap(key, fetchFunction, ttl = this.config.TTL.MEDIUM) {
    // Try to get from cache first
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - execute function
    const data = await fetchFunction();

    // Store in cache
    await this.set(key, data, ttl);

    return data;
  }

  /**
   * Clean up expired entries (optional periodic cleanup)
   */
  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug(`Cache cleanup: removed ${cleanedCount} expired entries`);
    }
  }

  /**
   * Start periodic cleanup (every 5 minutes)
   */
  startPeriodicCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Stop periodic cleanup
   */
  stopPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Export singleton instance
module.exports = new SimpleCacheManager();
