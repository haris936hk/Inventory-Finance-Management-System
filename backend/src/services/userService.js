// ========== src/services/userService.js ==========
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const logger = require('../config/logger');

class UserService {
  async getAllUsers() {
    return await db.prisma.user.findMany({
      where: {
        deletedAt: null
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        phone: true,
        isActive: true,
        lastLogin: true,
        role: {
          select: {
            id: true,
            name: true
          }
        },
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  async getUserById(id) {
    return await db.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        phone: true,
        isActive: true,
        lastLogin: true,
        role: {
          select: {
            id: true,
            name: true,
            permissions: true
          }
        },
        createdAt: true,
        updatedAt: true
      }
    });
  }

  async createUser(userData, createdBy) {
    const authService = require('./authService');
    return await authService.createUser(userData, createdBy);
  }

  async updateUser(id, updateData) {
    // Don't allow password update through this method
    delete updateData.password;
    
    // Check if username is being changed
    if (updateData.username) {
      const existing = await db.prisma.user.findFirst({
        where: {
          username: updateData.username,
          id: { not: id }
        }
      });
      
      if (existing) {
        throw new Error('Username already exists');
      }
    }
    
    // Check if email is being changed
    if (updateData.email) {
      const existing = await db.prisma.user.findFirst({
        where: {
          email: updateData.email,
          id: { not: id }
        }
      });
      
      if (existing) {
        throw new Error('Email already exists');
      }
    }
    
    return await db.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        phone: true,
        isActive: true,
        role: {
          select: {
            id: true,
            name: true,
            permissions: true
          }
        },
        createdAt: true,
        updatedAt: true
      }
    });
  }

  async deleteUser(id) {
    // Don't allow deleting the last admin
    const user = await db.prisma.user.findUnique({
      where: { id },
      include: { role: true }
    });
    
    if (user.role.name === 'Financial + Inventory Operator') {
      const adminCount = await db.prisma.user.count({
        where: {
          deletedAt: null,
          role: {
            name: 'Financial + Inventory Operator'
          }
        }
      });
      
      if (adminCount <= 1) {
        throw new Error('Cannot delete the last admin user');
      }
    }
    
    return await db.softDelete('user', id);
  }

  async restoreUser(id) {
    return await db.restore('user', id);
  }

  async resetPassword(userId, newPassword, resetBy) {
    const authService = require('./authService');
    return await authService.resetPassword(userId, newPassword, resetBy);
  }
}

module.exports = new UserService();