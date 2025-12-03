// ========== src/services/authService.js ==========
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const logger = require('../config/logger');

class AuthService {
  /**
   * Register initial admin user (run once during setup)
   */
  async registerAdmin(userData) {
    const { username, password, fullName, email, phone } = userData;

    // Check if admin already exists
    const existingAdmin = await db.prisma.user.findFirst({
      where: {
        role: {
          name: 'Financial + Inventory Operator'
        }
      }
    });

    if (existingAdmin) {
      throw new Error('Admin user already exists');
    }

    // Get or create admin role
    let adminRole = await db.prisma.role.findUnique({
      where: { name: 'Financial + Inventory Operator' }
    });

    if (!adminRole) {
      adminRole = await db.prisma.role.create({
        data: {
          name: 'Financial + Inventory Operator',
          description: 'Full access to inventory and financial modules',
          permissions: [
            'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete',
            'finance.view', 'finance.create', 'finance.edit', 'finance.delete',
            'reports.view', 'reports.export',
            'users.view', 'users.create', 'users.edit', 'users.delete'
          ]
        }
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
    const admin = await db.prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        fullName,
        email,
        phone,
        roleId: adminRole.id
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        role: {
          select: {
            name: true
          }
        }
      }
    });

    logger.info(`Admin user created: ${admin.username}`);
    return admin;
  }

  /**
   * Create a new user
   */
  async createUser(userData, createdBy) {
    const { username, password, fullName, email, phone, roleId } = userData;

    // Validate required fields
    if (!username || !password || !fullName || !roleId) {
      const error = new Error('Username, password, fullName, and roleId are required');
      error.status = 400;
      throw error;
    }

    // Check if username exists
    const existing = await db.prisma.user.findUnique({
      where: { username }
    });

    if (existing) {
      throw new Error('Username already exists');
    }

    // Check if email exists
    if (email) {
      const emailExists = await db.prisma.user.findUnique({
        where: { email }
      });

      if (emailExists) {
        throw new Error('Email already exists');
      }
    }

    // Verify role exists
    logger.debug(`Checking role with ID: ${roleId} (type: ${typeof roleId})`);
    const role = await db.prisma.role.findUnique({
      where: { id: roleId }
    });

    if (!role) {
      logger.error(`Role not found for ID: ${roleId}`);
      const allRoles = await db.prisma.role.findMany({ select: { id: true, name: true } });
      logger.error(`Available roles: ${JSON.stringify(allRoles)}`);
      throw new Error('Invalid role');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await db.prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        fullName,
        email,
        phone,
        roleId
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        role: {
          select: {
            name: true
          }
        }
      }
    });

    logger.info(`User created: ${user.username} by ${createdBy}`);
    return user;
  }

  /**
   * Login user
   */
  async login(username, password) {
    // Find user
    const user = await db.prisma.user.findUnique({
      where: {
        username,
        deletedAt: null,
        isActive: true
      },
      include: {
        role: {
          select: {
            name: true,
            permissions: true
          }
        }
      }
    });

    if (!user) {
      const error = new Error('Invalid credentials');
      error.status = 400;
      throw error;
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      const error = new Error('Invalid credentials');
      error.status = 400;
      throw error;
    }

    // Generate long-lived access token (no refresh token needed for desktop app)
    const accessToken = this.generateAccessToken(user);

    // Update last login
    await db.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });

    logger.info(`User logged in: ${user.username}`);

    return {
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role.name,
        permissions: user.role.permissions
      },
      accessToken
    };
  }

  /**
   * Generate long-lived access token for desktop app
   * Desktop apps don't need short-lived tokens since they run locally
   */
  generateAccessToken(user) {
    return jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role.name
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );
  }

  // Refresh token methods removed - not needed for desktop app
  // Desktop apps use long-lived JWT tokens (30 days) instead

  /**
   * Change password
   */
  async changePassword(userId, oldPassword, newPassword) {
    // Get user
    const user = await db.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify old password
    const isValidPassword = await bcrypt.compare(oldPassword, user.password);

    if (!isValidPassword) {
      throw new Error('Invalid old password');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await db.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    logger.info(`Password changed for user: ${user.username}`);
    return { message: 'Password changed successfully' };
  }

  /**
   * Reset password (admin function)
   */
  async resetPassword(userId, newPassword, resetBy) {
    // Get user
    const user = await db.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await db.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    logger.info(`Password reset for user: ${user.username} by ${resetBy}`);
    return { message: 'Password reset successfully' };
  }
}

module.exports = new AuthService();