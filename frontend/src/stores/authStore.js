// ========== src/stores/authStore.js ==========
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      permissions: [],

      login: async (username, password) => {
        try {
          const response = await axios.post('/auth/login', { username, password });
          const { user, accessToken, refreshToken } = response.data;
          
          set({
            user,
            token: accessToken,
            refreshToken,
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
          refreshToken: null,
          isAuthenticated: false,
          permissions: []
        });
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;

        try {
          const response = await axios.post('/auth/refresh', { refreshToken });
          const { accessToken, user } = response.data;
          
          set({
            token: accessToken,
            user,
            permissions: user.permissions || []
          });

          return true;
        } catch (error) {
          get().logout();
          return false;
        }
      },

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
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        permissions: state.permissions
      })
    }
  )
);
