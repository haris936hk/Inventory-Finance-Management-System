const UserService = require('../src/services/userService');

describe('UserService', () => {
  let userService;

  beforeEach(() => {
    userService = new UserService();
  });

  describe('getAllUsers', () => {
    it('should return all non-deleted users with role information', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          username: 'admin',
          fullName: 'System Administrator',
          email: 'admin@company.com',
          phone: null,
          isActive: true,
          lastLogin: new Date(),
          role: {
            id: 'role-1',
            name: 'Financial + Inventory Operator'
          },
          createdAt: new Date()
        },
        {
          id: 'user-2',
          username: 'operator',
          fullName: 'Inventory Operator',
          email: 'operator@company.com',
          phone: '1234567890',
          isActive: true,
          lastLogin: null,
          role: {
            id: 'role-2',
            name: 'Inventory Operator'
          },
          createdAt: new Date()
        }
      ];

      mockPrisma.user.findMany.mockResolvedValue(mockUsers);

      const result = await userService.getAllUsers();

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
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
      expect(result).toEqual(mockUsers);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no users exist', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await userService.getAllUsers();

      expect(result).toEqual([]);
    });
  });

  describe('getUserById', () => {
    it('should return user with detailed role information', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        fullName: 'Test User',
        email: 'test@company.com',
        phone: '1234567890',
        isActive: true,
        lastLogin: new Date(),
        role: {
          id: 'role-123',
          name: 'Inventory Operator',
          permissions: [
            'inventory.view',
            'inventory.create',
            'inventory.edit',
            'reports.view'
          ]
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await userService.getUserById('user-123');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
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
      expect(result).toEqual(mockUser);
    });

    it('should return null for non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await userService.getUserById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should update user successfully with valid data', async () => {
      const userId = 'user-123';
      const updateData = {
        fullName: 'Updated Full Name',
        email: 'updated@company.com',
        phone: '9876543210',
        isActive: false
      };

      const existingUser = {
        id: userId,
        username: 'testuser',
        fullName: 'Test User',
        email: 'test@company.com'
      };

      const updatedUser = {
        ...existingUser,
        ...updateData,
        updatedAt: new Date()
      };

      mockPrisma.user.findFirst.mockResolvedValue(null); // No username conflict
      mockPrisma.user.findUnique.mockResolvedValue(null); // No email conflict
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await userService.updateUser(userId, updateData);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
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
              name: true
            }
          },
          updatedAt: true
        }
      });
      expect(result.fullName).toBe('Updated Full Name');
      expect(result.email).toBe('updated@company.com');
    });

    it('should remove password from update data', async () => {
      const userId = 'user-123';
      const updateData = {
        fullName: 'Updated Name',
        password: 'newpassword123' // This should be removed
      };

      const updatedUser = {
        id: userId,
        fullName: 'Updated Name'
      };

      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      await userService.updateUser(userId, updateData);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { fullName: 'Updated Name' }, // Password should be removed
        select: expect.any(Object)
      });
    });

    it('should throw error when updating to existing username', async () => {
      const userId = 'user-123';
      const updateData = {
        username: 'existinguser',
        fullName: 'Updated Name'
      };

      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'different-user',
        username: 'existinguser'
      });

      await expect(userService.updateUser(userId, updateData))
        .rejects.toThrow('Username already exists');

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should throw error when updating to existing email', async () => {
      const userId = 'user-123';
      const updateData = {
        email: 'existing@company.com',
        fullName: 'Updated Name'
      };

      mockPrisma.user.findFirst.mockResolvedValue(null); // No username conflict
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'different-user',
        email: 'existing@company.com'
      });

      await expect(userService.updateUser(userId, updateData))
        .rejects.toThrow('Email already exists');

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should allow user to keep their own username', async () => {
      const userId = 'user-123';
      const updateData = {
        username: 'currentuser',
        fullName: 'Updated Name'
      };

      mockPrisma.user.findFirst.mockResolvedValue({
        id: userId, // Same user ID
        username: 'currentuser'
      });

      const updatedUser = {
        id: userId,
        username: 'currentuser',
        fullName: 'Updated Name'
      };

      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await userService.updateUser(userId, updateData);

      expect(mockPrisma.user.update).toHaveBeenCalled();
      expect(result.fullName).toBe('Updated Name');
    });

    it('should allow user to keep their own email', async () => {
      const userId = 'user-123';
      const updateData = {
        email: 'current@company.com',
        fullName: 'Updated Name'
      };

      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId, // Same user ID
        email: 'current@company.com'
      });

      const updatedUser = {
        id: userId,
        email: 'current@company.com',
        fullName: 'Updated Name'
      };

      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await userService.updateUser(userId, updateData);

      expect(mockPrisma.user.update).toHaveBeenCalled();
      expect(result.email).toBe('current@company.com');
    });
  });

  describe('deleteUser', () => {
    it('should soft delete user successfully', async () => {
      const userId = 'user-123';
      const deletedUser = {
        id: userId,
        username: 'deleteduser',
        deletedAt: new Date()
      };

      const mockDb = require('../src/config/database');
      mockDb.softDelete.mockResolvedValue(deletedUser);

      const result = await userService.deleteUser(userId);

      expect(mockDb.softDelete).toHaveBeenCalledWith('user', userId);
      expect(result).toEqual(deletedUser);
    });
  });

  describe('restoreUser', () => {
    it('should restore soft deleted user successfully', async () => {
      const userId = 'user-123';
      const restoredUser = {
        id: userId,
        username: 'restoreduser',
        deletedAt: null
      };

      const mockDb = require('../src/config/database');
      mockDb.restore.mockResolvedValue(restoredUser);

      const result = await userService.restoreUser(userId);

      expect(mockDb.restore).toHaveBeenCalledWith('user', userId);
      expect(result).toEqual(restoredUser);
    });
  });

  describe('toggleUserStatus', () => {
    it('should activate inactive user', async () => {
      const userId = 'user-123';
      const inactiveUser = {
        id: userId,
        username: 'testuser',
        isActive: false
      };

      const activatedUser = {
        ...inactiveUser,
        isActive: true
      };

      mockPrisma.user.findUnique.mockResolvedValue(inactiveUser);
      mockPrisma.user.update.mockResolvedValue(activatedUser);

      const result = await userService.toggleUserStatus(userId);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId }
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { isActive: true }
      });
      expect(result.isActive).toBe(true);
    });

    it('should deactivate active user', async () => {
      const userId = 'user-123';
      const activeUser = {
        id: userId,
        username: 'testuser',
        isActive: true
      };

      const deactivatedUser = {
        ...activeUser,
        isActive: false
      };

      mockPrisma.user.findUnique.mockResolvedValue(activeUser);
      mockPrisma.user.update.mockResolvedValue(deactivatedUser);

      const result = await userService.toggleUserStatus(userId);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { isActive: false }
      });
      expect(result.isActive).toBe(false);
    });

    it('should throw error for non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(userService.toggleUserStatus('nonexistent'))
        .rejects.toThrow('User not found');

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('getUserStats', () => {
    it('should return user statistics', async () => {
      const mockStats = {
        total: 10,
        active: 8,
        inactive: 2,
        byRole: [
          { role: { name: 'Admin' }, _count: { id: 2 } },
          { role: { name: 'Operator' }, _count: { id: 8 } }
        ]
      };

      mockPrisma.user.count.mockResolvedValueOnce(10); // Total
      mockPrisma.user.count.mockResolvedValueOnce(8);  // Active
      mockPrisma.user.count.mockResolvedValueOnce(2);  // Inactive
      mockPrisma.user.groupBy.mockResolvedValue(mockStats.byRole);

      const result = await userService.getUserStats();

      expect(mockPrisma.user.count).toHaveBeenCalledTimes(3);
      expect(mockPrisma.user.count).toHaveBeenNthCalledWith(1, {
        where: { deletedAt: null }
      });
      expect(mockPrisma.user.count).toHaveBeenNthCalledWith(2, {
        where: { deletedAt: null, isActive: true }
      });
      expect(mockPrisma.user.count).toHaveBeenNthCalledWith(3, {
        where: { deletedAt: null, isActive: false }
      });

      expect(result.total).toBe(10);
      expect(result.active).toBe(8);
      expect(result.inactive).toBe(2);
      expect(result.byRole).toEqual(mockStats.byRole);
    });
  });

  describe('searchUsers', () => {
    it('should search users by username', async () => {
      const searchTerm = 'admin';
      const mockUsers = [
        {
          id: 'user-1',
          username: 'admin',
          fullName: 'System Administrator'
        }
      ];

      mockPrisma.user.findMany.mockResolvedValue(mockUsers);

      const result = await userService.searchUsers(searchTerm);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          OR: [
            { username: { contains: searchTerm, mode: 'insensitive' } },
            { fullName: { contains: searchTerm, mode: 'insensitive' } },
            { email: { contains: searchTerm, mode: 'insensitive' } }
          ]
        },
        select: {
          id: true,
          username: true,
          fullName: true,
          email: true,
          isActive: true,
          role: {
            select: {
              name: true
            }
          }
        },
        orderBy: { username: 'asc' }
      });
      expect(result).toEqual(mockUsers);
    });

    it('should search users by full name', async () => {
      const searchTerm = 'john';
      const mockUsers = [
        {
          id: 'user-1',
          username: 'jdoe',
          fullName: 'John Doe'
        }
      ];

      mockPrisma.user.findMany.mockResolvedValue(mockUsers);

      const result = await userService.searchUsers(searchTerm);

      expect(result).toEqual(mockUsers);
    });

    it('should return empty array when no matches found', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await userService.searchUsers('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('createUser', () => {
    it('should delegate to authService.createUser', async () => {
      const userData = {
        username: 'newuser',
        password: 'password123',
        fullName: 'New User',
        email: 'new@company.com',
        roleId: 'role-123'
      };
      const createdBy = 'admin';

      const mockAuthService = require('../src/services/authService');
      const mockCreatedUser = {
        id: 'user-123',
        username: 'newuser',
        fullName: 'New User',
        email: 'new@company.com'
      };

      // Mock the authService.createUser method
      jest.doMock('../src/services/authService', () => ({
        createUser: jest.fn().mockResolvedValue(mockCreatedUser)
      }));

      const result = await userService.createUser(userData, createdBy);

      expect(result).toEqual(mockCreatedUser);
    });
  });
});