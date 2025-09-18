// ========== src/layouts/PrivateLayout.jsx ==========
import React, { useState, useEffect } from 'react';
import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Space, Badge, Button, Drawer } from 'antd';
import {
  DashboardOutlined,
  ShoppingCartOutlined,
  DollarOutlined,
  FileTextOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  AppstoreOutlined,
  TeamOutlined,
  BankOutlined,
  ShopOutlined,
  TagsOutlined,
  DatabaseOutlined,
  InboxOutlined,
  SolutionOutlined,
  AccountBookOutlined,
  CreditCardOutlined,
  BarChartOutlined,
  ImportOutlined,
  ExportOutlined
} from '@ant-design/icons';
import { useAuthStore } from '../stores/authStore';
import ImportModal from '../components/ImportModal';
import ExportModal from '../components/ExportModal';

const { Header, Sider, Content, Footer } = Layout;

const PrivateLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  
  const { isAuthenticated, user, logout, hasPermission } = useAuthStore();

  useEffect(() => {
    // Listen for Electron menu events
    if (window.electronAPI) {
      window.electronAPI.receive('menu-import', () => {
        setImportModalVisible(true);
      });
      
      window.electronAPI.receive('menu-export', () => {
        setExportModalVisible(true);
      });
    }
  }, []);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const getMenuItems = () => {
    const items = [
      {
        key: '/app/dashboard',
        icon: <DashboardOutlined />,
        label: 'Dashboard',
      },
    ];

    // Inventory Menu
    if (hasPermission('inventory.view')) {
      items.push({
        key: 'inventory',
        icon: <ShoppingCartOutlined />,
        label: 'Inventory',
        children: [
          {
            key: '/app/inventory/items',
            icon: <InboxOutlined />,
            label: 'Items',
          },
          {
            key: '/app/inventory/categories',
            icon: <AppstoreOutlined />,
            label: 'Categories',
          },
          {
            key: '/app/inventory/companies',
            icon: <BankOutlined />,
            label: 'Companies',
          },
          {
            key: '/app/inventory/models',
            icon: <TagsOutlined />,
            label: 'Models',
          },
          {
            key: '/app/inventory/vendors',
            icon: <ShopOutlined />,
            label: 'Vendors',
          },
        ],
      });
    }

    // Finance Menu
    if (hasPermission('finance.view')) {
      items.push({
        key: 'finance',
        icon: <DollarOutlined />,
        label: 'Finance',
        children: [
          {
            key: '/app/finance/customers',
            icon: <TeamOutlined />,
            label: 'Customers',
          },
          {
            key: '/app/finance/invoices',
            icon: <FileTextOutlined />,
            label: 'Invoices',
          },
          {
            key: '/app/finance/payments',
            icon: <CreditCardOutlined />,
            label: 'Payments',
          },
        ],
      });
    }

    // Reports
    if (hasPermission('reports.view')) {
      items.push({
        key: '/app/reports',
        icon: <BarChartOutlined />,
        label: 'Reports',
      });
    }

    // Settings (Admin only)
    if (hasPermission('users.view')) {
      items.push({
        key: 'settings',
        icon: <SettingOutlined />,
        label: 'Settings',
        children: [
          {
            key: '/app/settings/users',
            icon: <UserOutlined />,
            label: 'Users',
          },
          {
            key: '/app/settings',
            icon: <SettingOutlined />,
            label: 'General',
          },
        ],
      });
    }

    return items;
  };

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile',
      onClick: () => navigate('/app/settings/profile'),
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      onClick: () => {
        logout();
        navigate('/login');
      },
    },
  ];

  const quickActions = [
    {
      key: 'import',
      icon: <ImportOutlined />,
      label: 'Import',
      onClick: () => setImportModalVisible(true),
      permission: 'inventory.create',
    },
    {
      key: 'export',
      icon: <ExportOutlined />,
      label: 'Export',
      onClick: () => setExportModalVisible(true),
      permission: 'reports.export',
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider 
        trigger={null} 
        collapsible 
        collapsed={collapsed}
        style={{
          background: '#001529',
          boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          {collapsed ? (
            <DatabaseOutlined style={{ fontSize: 24, color: '#fff' }} />
          ) : (
            <h2 style={{ color: '#fff', margin: 0, fontSize: 18 }}>IMS System</h2>
          )}
        </div>
        
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={['inventory', 'finance']}
          items={getMenuItems()}
          onClick={({ key }) => {
            if (key.startsWith('/')) {
              navigate(key);
            }
          }}
          style={{ borderRight: 0 }}
        />
      </Sider>

      <Layout>
        <Header 
          style={{ 
            padding: '0 24px', 
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            zIndex: 1,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16 }}
            />
            
            <Space size="middle" style={{ marginLeft: 24 }}>
              {quickActions
                .filter(action => !action.permission || hasPermission(action.permission))
                .map(action => (
                  <Button
                    key={action.key}
                    icon={action.icon}
                    onClick={action.onClick}
                  >
                    {action.label}
                  </Button>
                ))}
            </Space>
          </div>

          <Space size="large">
            <Badge count={0}>
              <Button
                type="text"
                icon={<BellOutlined />}
                style={{ fontSize: 18 }}
              />
            </Badge>

            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
                <span>{user?.fullName || user?.username}</span>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{ 
          margin: '24px', 
          minHeight: 280,
          background: '#f0f2f5',
        }}>
          <Outlet />
        </Content>

        <Footer style={{ 
          textAlign: 'center',
          background: '#fff',
          borderTop: '1px solid #f0f0f0',
        }}>
          Inventory & Finance Management System ©{new Date().getFullYear()}
        </Footer>
      </Layout>

      {/* Global Modals */}
      <ImportModal
        visible={importModalVisible}
        onClose={() => setImportModalVisible(false)}
      />
      
      <ExportModal
        visible={exportModalVisible}
        onClose={() => setExportModalVisible(false)}
      />
    </Layout>
  );
};

export default PrivateLayout;