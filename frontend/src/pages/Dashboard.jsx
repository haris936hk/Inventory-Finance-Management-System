import React from 'react';
import { Row, Col, Card, Statistic, List, Tag, Space, Button, Typography, Spin, Alert } from 'antd';
import {
  ShoppingCartOutlined,
  DollarOutlined,
  ShoppingOutlined,
  RiseOutlined,
  PlusOutlined,
  FileTextOutlined,
  DatabaseOutlined,
  WalletOutlined,
  FileDoneOutlined,
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';
import { formatPKR } from '../config/constants';

const { Text, Title } = Typography;

/**
 * Dashboard Component
 * REVAMPED: 2025-01-21
 * - Simplified to 3 essential stat cards
 * - Card 1: Inventory Levels (Total, Available, Reserved)
 * - Card 2: Outstanding Receivables (from unpaid invoices)
 * - Card 3: Outstanding Payables (amounts owed to vendors)
 * - Quick Actions: Create Invoice, Record Payment, Create Bill, Record Vendor Payment, Add Item, Bulk Add Items, Create PO
 * - Removed charts, top products, complex visualizations
 * - Spacious layout with large cards
 * - Recent Invoices and POs both clickable to details
 */
const Dashboard = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();

  // Fetch dashboard data (no auto-refresh, manual only)
  const { data: dashboardData, isLoading, isError, error } = useQuery(
    'dashboard',
    async () => {
      const response = await axios.get('/reports/dashboard');
      return response.data.data;
    },
    {
      staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
      cacheTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
      refetchOnWindowFocus: false, // Don't auto-refresh
    }
  );

  // Loading state
  if (isLoading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="Loading dashboard..." />
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          message="Error Loading Dashboard"
          description={error?.response?.data?.message || error?.message || 'Failed to load dashboard data. Please try again.'}
          type="error"
          showIcon
          action={
            <Button size="small" onClick={() => window.location.reload()}>
              Reload
            </Button>
          }
        />
      </div>
    );
  }

  // Default empty data structure with defensive merging
  const defaultData = {
    inventory: { totalItems: 0, availableItems: 0, reservedItems: 0, soldThisMonth: 0 },
    financial: { monthlyRevenue: 0, outstandingAmount: 0, unpaidInvoices: 0, overdueInvoices: 0 },
    purchaseOrders: { activePOs: 0, monthlyPOValue: 0, pendingBills: 0 },
    payables: { outstandingPayables: 0, unpaidBills: 0, overdueBills: 0 },
    customers: { total: 0, newThisMonth: 0, activeThisMonth: 0 },
    recentTransactions: { invoices: [], purchaseOrders: [] }
  };

  const data = {
    inventory: { ...defaultData.inventory, ...dashboardData?.inventory },
    financial: { ...defaultData.financial, ...dashboardData?.financial },
    purchaseOrders: { ...defaultData.purchaseOrders, ...dashboardData?.purchaseOrders },
    payables: { ...defaultData.payables, ...dashboardData?.payables },
    customers: { ...defaultData.customers, ...dashboardData?.customers },
    recentTransactions: {
      invoices: dashboardData?.recentTransactions?.invoices || [],
      purchaseOrders: dashboardData?.recentTransactions?.purchaseOrders || []
    }
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <Title level={2} style={{ margin: 0 }}>Dashboard</Title>
        <Text type="secondary" style={{ fontSize: '16px' }}>
          Welcome back! Here's what's happening with your business today.
        </Text>
      </div>

      {/* 3 Large Stat Cards - Spacious Layout */}
      <Row gutter={24} style={{ marginBottom: 32 }}>
        {/* Card 1: Inventory Levels */}
        <Col xs={24} sm={12} lg={8}>
          <Card
            hoverable
            className="hover-card"
            style={{ height: '160px' }}
          >
            <Statistic
              title="Inventory Levels"
              value={data.inventory.totalItems}
              prefix={<ShoppingCartOutlined />}
              valueStyle={{ color: '#1890ff', fontSize: '32px' }}
            />
            <div style={{ marginTop: 12 }}>
              <Space direction="horizontal" size="middle">
                <div>
                  <Text type="secondary" style={{ fontSize: '12px' }}>Available:</Text>
                  <br />
                  <Text strong style={{ color: '#52c41a', fontSize: '16px' }}>
                    {data.inventory.availableItems}
                  </Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: '12px' }}>Reserved:</Text>
                  <br />
                  <Text strong style={{ color: '#faad14', fontSize: '16px' }}>
                    {data.inventory.reservedItems}
                  </Text>
                </div>
              </Space>
            </div>
          </Card>
        </Col>

        {/* Card 2: Outstanding Receivables */}
        <Col xs={24} sm={12} lg={8}>
          <Card
            hoverable
            className="hover-card"
            style={{ height: '160px' }}
          >
            <Statistic
              title="Outstanding Receivables"
              value={data.financial.outstandingAmount}
              prefix="PKR"
              valueStyle={{ color: '#faad14', fontSize: '28px' }}
              precision={0}
            />
            <div style={{ marginTop: 12 }}>
              <Space direction="horizontal" size="middle">
                <div>
                  <Text type="secondary" style={{ fontSize: '12px' }}>Unpaid:</Text>
                  <br />
                  <Text strong style={{ fontSize: '16px' }}>
                    {data.financial.unpaidInvoices}
                  </Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: '12px' }}>Overdue:</Text>
                  <br />
                  <Text strong style={{ color: '#ff4d4f', fontSize: '16px' }}>
                    {data.financial.overdueInvoices}
                  </Text>
                </div>
              </Space>
            </div>
          </Card>
        </Col>

        {/* Card 3: Outstanding Payables */}
        <Col xs={24} sm={12} lg={8}>
          <Card
            hoverable
            className="hover-card"
            style={{ height: '160px' }}
          >
            <Statistic
              title="Outstanding Payables"
              value={data.payables.outstandingPayables}
              prefix="PKR"
              valueStyle={{ color: '#ff4d4f', fontSize: '28px' }}
              precision={0}
            />
            <div style={{ marginTop: 12 }}>
              <Space direction="horizontal" size="middle">
                <div>
                  <Text type="secondary" style={{ fontSize: '12px' }}>Unpaid Bills:</Text>
                  <br />
                  <Text strong style={{ fontSize: '16px' }}>
                    {data.payables.unpaidBills}
                  </Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: '12px' }}>Overdue:</Text>
                  <br />
                  <Text strong style={{ color: '#ff4d4f', fontSize: '16px' }}>
                    {data.payables.overdueBills}
                  </Text>
                </div>
              </Space>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Quick Actions Bar */}
      {(hasPermission('inventory.create') || hasPermission('finance.create')) && (
        <Card style={{ marginBottom: 32 }}>
          <Space size="large" wrap>
            <Text strong style={{ fontSize: '16px' }}>Quick Actions:</Text>

            {hasPermission('finance.create') && (
              <Button
                type="primary"
                icon={<FileTextOutlined />}
                onClick={() => navigate('/app/finance/invoices/create')}
                size="large"
              >
                Create Invoice
              </Button>
            )}

            {hasPermission('finance.create') && (
              <Button
                type="primary"
                icon={<DollarOutlined />}
                onClick={() => navigate('/app/finance/payments/record')}
                size="large"
              >
                Record Payment
              </Button>
            )}

            {hasPermission('finance.create') && (
              <Button
                type="primary"
                icon={<FileDoneOutlined />}
                onClick={() => navigate('/app/finance/vendor-bills/create')}
                size="large"
              >
                Create Bill
              </Button>
            )}

            {hasPermission('finance.create') && (
              <Button
                type="primary"
                icon={<WalletOutlined />}
                onClick={() => navigate('/app/finance/vendor-payments/record')}
                size="large"
              >
                Record Vendor Payment
              </Button>
            )}

            {hasPermission('inventory.create') && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate('/app/inventory/items/add')}
                size="large"
              >
                Add Item
              </Button>
            )}

            {hasPermission('inventory.create') && (
              <Button
                type="primary"
                icon={<DatabaseOutlined />}
                onClick={() => navigate('/app/inventory/items/bulk-add')}
                size="large"
              >
                Bulk Add Items
              </Button>
            )}

            {hasPermission('finance.create') && (
              <Button
                type="primary"
                icon={<ShoppingOutlined />}
                onClick={() => navigate('/app/finance/purchase-orders/create')}
                size="large"
              >
                Create Purchase Order
              </Button>
            )}
          </Space>
        </Card>
      )}

      {/* Recent Activity - Two Columns */}
      <Row gutter={24}>
        {/* Recent Invoices */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <span style={{ fontSize: '18px', fontWeight: 600 }}>
                Recent Invoices
              </span>
            }
            extra={
              hasPermission('finance.view') && (
                <Button
                  type="link"
                  onClick={() => navigate('/app/finance/invoices')}
                >
                  View All
                </Button>
              )
            }
            style={{ minHeight: '400px' }}
          >
            <List
              dataSource={data.recentTransactions.invoices.slice(0, 5)}
              renderItem={(invoice) => (
                <List.Item
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/app/finance/invoices/${invoice.id}`)}
                  className="hover-list-item"
                >
                  <List.Item.Meta
                    title={
                      <Text strong style={{ fontSize: '15px' }}>
                        {invoice.invoiceNumber}
                      </Text>
                    }
                    description={
                      <Space direction="vertical" size={0}>
                        <Text type="secondary">{invoice.customer?.name}</Text>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          {new Date(invoice.invoiceDate).toLocaleDateString('en-PK')}
                        </Text>
                      </Space>
                    }
                  />
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ marginBottom: 8, fontSize: '15px', fontWeight: 500 }}>
                      {formatPKR(invoice.total)}
                    </div>
                    <Tag
                      color={
                        invoice.status === 'Paid' ? 'green' :
                        invoice.status === 'Overdue' ? 'red' :
                        invoice.status === 'Partial' ? 'orange' :
                        invoice.status === 'Sent' ? 'blue' : 'default'
                      }
                    >
                      {invoice.status}
                    </Tag>
                  </div>
                </List.Item>
              )}
              locale={{ emptyText: 'No recent invoices' }}
            />
          </Card>
        </Col>

        {/* Recent Purchase Orders */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <span style={{ fontSize: '18px', fontWeight: 600 }}>
                Recent Purchase Orders
              </span>
            }
            extra={
              hasPermission('finance.view') && (
                <Button
                  type="link"
                  onClick={() => navigate('/app/finance/purchase-orders')}
                >
                  View All
                </Button>
              )
            }
            style={{ minHeight: '400px' }}
          >
            <List
              dataSource={data.recentTransactions.purchaseOrders.slice(0, 5)}
              renderItem={(po) => (
                <List.Item
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/app/finance/purchase-orders/${po.id}`)}
                  className="hover-list-item"
                >
                  <List.Item.Meta
                    title={
                      <Text strong style={{ fontSize: '15px' }}>
                        {po.poNumber}
                      </Text>
                    }
                    description={
                      <Space direction="vertical" size={0}>
                        <Text type="secondary">{po.vendor?.name}</Text>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          {new Date(po.orderDate).toLocaleDateString('en-PK')}
                        </Text>
                      </Space>
                    }
                  />
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ marginBottom: 8, fontSize: '15px', fontWeight: 500 }}>
                      {formatPKR(po.total)}
                    </div>
                    <Tag
                      color={
                        po.status === 'Delivered' ? 'green' :
                        po.status === 'Paid' ? 'blue' :
                        po.status === 'Partial' ? 'orange' :
                        po.status === 'Sent' ? 'cyan' :
                        po.status === 'Cancelled' ? 'red' : 'default'
                      }
                    >
                      {po.status}
                    </Tag>
                  </div>
                </List.Item>
              )}
              locale={{ emptyText: 'No recent purchase orders' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Custom CSS for hover effects */}
      <style jsx>{`
        .hover-card {
          transition: all 0.3s ease;
        }
        .hover-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          transform: translateY(-2px);
        }
        .hover-list-item {
          transition: background-color 0.2s ease;
          padding: 12px 16px;
          border-radius: 4px;
        }
        .hover-list-item:hover {
          background-color: #f0f2f5;
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
