// ========== src/stores/authStore.js ==========
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      permissions: [],

      login: async (username, password) => {
        try {
          const response = await axios.post('/auth/login', { username, password });
          const { user, accessToken } = response.data;

          set({
            user,
            token: accessToken,
            isAuthenticated: true,
            permissions: user.permissions || []
          });

          return { success: true };
        } catch (error) {
          return {
            success: false,
            error: error.response?.data?.message || 'Login failed'
          };
        }
      },

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          permissions: []
        });
      },

      // Refresh logic removed - using long-lived tokens (30 days) for desktop app

      checkAuth: () => {
        const { token } = get();
        if (!token) {
          set({ isAuthenticated: false });
          return false;
        }
        return true;
      },

      hasPermission: (permission) => {
        const { permissions } = get();
        return permissions.includes(permission);
      },

      hasAnyPermission: (permissionList) => {
        const { permissions } = get();
        return permissionList.some(p => permissions.includes(p));
      },

      updateUser: (updatedUser) => {
        // Normalize role to string if it's an object
        const normalizedRole = typeof updatedUser.role === 'object' && updatedUser.role?.name
          ? updatedUser.role.name
          : updatedUser.role;

        // Extract permissions from role object or use existing permissions
        const newPermissions = updatedUser.role?.permissions || updatedUser.permissions || get().permissions || [];

        set({
          user: {
            ...updatedUser,
            role: normalizedRole
          },
          permissions: newPermissions
        });
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        permissions: state.permissions
      })
    }
  )
);
