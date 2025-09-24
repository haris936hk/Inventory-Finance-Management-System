// ========== src/config/database.js ==========
const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

class Database {
  constructor() {
    this.prisma = new PrismaClient({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' }
      ],
      errorFormat: 'pretty'
    });

    // Log database events in development
    if (process.env.NODE_ENV === 'development') {
      this.prisma.$on('query', (e) => {
        logger.debug('Query: ' + e.query);
        logger.debug('Duration: ' + e.duration + 'ms');
      });
    }

    this.prisma.$on('error', (e) => {
      logger.error('Database error:', e);
    });
  }

  async connect() {
    try {
      await this.prisma.$connect();
      logger.info('✅ Database connected successfully');
    } catch (error) {
      logger.error('❌ Database connection failed:', error);
      process.exit(1);
    }
  }

  async disconnect() {
    await this.prisma.$disconnect();
    logger.info('Database disconnected');
  }

  // Transaction helper
  async transaction(callback) {
    return await this.prisma.$transaction(callback, {
      maxWait: 10000, // default: 2000
      timeout: 15000, // default: 5000
    });
  }

  // Soft delete helper
  async softDelete(model, id) {
    return await this.prisma[model].update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  // Restore soft deleted record
  async restore(model, id) {
    return await this.prisma[model].update({
      where: { id },
      data: { deletedAt: null }
    });
  }

  // Find with soft delete filter
  async findMany(model, options = {}) {
    const whereClause = options.where || {};

    // Add soft delete filter by default
    if (!options.includeDeleted) {
      whereClause.deletedAt = null;
    }

    // Remove includeDeleted from options before passing to Prisma
    const { includeDeleted, ...prismaOptions } = options;

    return await this.prisma[model].findMany({
      ...prismaOptions,
      where: whereClause
    });
  }

  // Find one with soft delete filter
  async findUnique(model, options = {}) {
    const record = await this.prisma[model].findUnique(options);
    
    // Check if soft deleted
    if (record && record.deletedAt && !options.includeDeleted) {
      return null;
    }
    
    return record;
  }
}

module.exports = new Database();