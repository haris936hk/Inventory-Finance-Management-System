// ========== src/layouts/PublicLayout.jsx ==========
import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Layout } from 'antd';
import { useAuthStore } from '../stores/authStore';

const { Content } = Layout;

const PublicLayout = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (isAuthenticated) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return (
    <Layout style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      <Content style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Outlet />
      </Content>
    </Layout>
  );
};

export default PublicLayout;