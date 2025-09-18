// ========== src/middleware/auth.js ==========
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const db = require('../config/database');
const logger = require('../config/logger');

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from database
      req.user = await db.prisma.user.findUnique({
        where: { 
          id: decoded.id,
          deletedAt: null,
          isActive: true
        },
        select: {
          id: true,
          username: true,
          fullName: true,
          email: true,
          roleId: true,
          role: {
            select: {
              name: true,
              permissions: true
            }
          }
        }
      });

      if (!req.user) {
        res.status(401);
        throw new Error('User not found or inactive');
      }

      // Update last login
      await db.prisma.user.update({
        where: { id: req.user.id },
        data: { lastLogin: new Date() }
      });

      next();
    } catch (error) {
      logger.error('Auth error:', error);
      res.status(401);
      throw new Error('Not authorized, token failed');
    }
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }
});

// Permission checker middleware
const hasPermission = (requiredPermissions) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      res.status(401);
      throw new Error('Not authenticated');
    }

    const userPermissions = req.user.role.permissions || [];
    const hasAllPermissions = requiredPermissions.every(permission => 
      userPermissions.includes(permission)
    );

    if (!hasAllPermissions) {
      res.status(403);
      throw new Error('Insufficient permissions');
    }

    next();
  });
};

// Role checker middleware
const hasRole = (allowedRoles) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      res.status(401);
      throw new Error('Not authenticated');
    }

    if (!allowedRoles.includes(req.user.role.name)) {
      res.status(403);
      throw new Error(`Role ${req.user.role.name} is not authorized`);
    }

    next();
  });
};

module.exports = {
  protect,
  hasPermission,
  hasRole
};