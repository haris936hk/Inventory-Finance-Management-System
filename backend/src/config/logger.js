// ========== src/config/logger.js ==========
const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json(),
    winston.format.colorize(),
    winston.format.printf(({ level, message, timestamp, stack }) => {
      if (stack) {
        return `${timestamp} ${level}: ${message}\n${stack}`;
      }
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.simple()
    }),
    // File transport for errors
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error'
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/combined.log')
    })
  ]
});

module.exports = logger;
