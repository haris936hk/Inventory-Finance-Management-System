// ========== src/pages/Dashboard.jsx ==========
import React from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Progress, Space, Button, List } from 'antd';
import {
  ShoppingCartOutlined,
  DollarOutlined,
  UserOutlined,
  RiseOutlined,
  FallOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  FileTextOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { Line, Bar, Pie } from 'recharts';
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const Dashboard = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();

  // Fetch dashboard data
  const { data: dashboardData, isLoading } = useQuery(
    'dashboard',
    async () => {
      const response = await axios.get('/reports/dashboard');
      return response.data.data;
    },
    {
      refetchInterval: 60000, // Refresh every minute
    }
  );

  if (isLoading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        Loading dashboard...
      </div>
    );
  }

  const data = dashboardData || {
    inventory: { totalItems: 0, availableItems: 0, soldThisMonth: 0, utilizationRate: 0 },
    financial: { totalRevenue: 0, monthlyRevenue: 0, outstandingAmount: 0 },
    customers: { total: 0, newThisMonth: 0 },
    topProducts: [],
    recentTransactions: { invoices: [], payments: [] }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <p style={{ color: '#8c8c8c', marginTop: 8 }}>
          Welcome back! Here's what's happening with your business today.
        </p>
      </div>

      {/* Stats Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable className="hover-card">
            <Statistic
              title="Total Items"
              value={data.inventory.totalItems}
              prefix={<ShoppingCartOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">Available: </Text>
              <Text strong>{data.inventory.availableItems}</Text>
            </div>
            <Progress 
              percent={parseFloat(data.inventory.utilizationRate)} 
              size="small" 
              strokeColor="#52c41a"
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card hoverable className="hover-card">
            <Statistic
              title="Monthly Revenue"
              value={data.financial.monthlyRevenue}
              prefix="PKR"
              valueStyle={{ color: '#52c41a' }}
              suffix={
                <span style={{ fontSize: 14, color: '#52c41a' }}>
                  <ArrowUpOutlined /> 12%
                </span>
              }
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">Total: </Text>
              <Text strong>PKR {data.financial.totalRevenue}</Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card hoverable className="hover-card">
            <Statistic
              title="Outstanding"
              value={data.financial.outstandingAmount}
              prefix="PKR"
              valueStyle={{ color: '#faad14' }}
            />
            <div style={{ marginTop: 8 }}>
              <Button 
                type="link" 
                size="small" 
                onClick={() => navigate('/app/finance/invoices?status=overdue')}
              >
                View Overdue Invoices →
              </Button>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card hoverable className="hover-card">
            <Statistic
              title="Total Customers"
              value={data.customers.total}
              prefix={<UserOutlined />}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">New this month: </Text>
              <Text strong style={{ color: '#52c41a' }}>
                +{data.customers.newThisMonth}
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Charts and Lists */}
      <Row gutter={[16, 16]}>
        {/* Top Products */}
        <Col xs={24} lg={8}>
          <Card 
            title="Top Selling Products" 
            extra={<Button type="link" onClick={() => navigate('/app/reports')}>View All</Button>}
          >
            <List
              dataSource={data.topProducts}
              renderItem={(item, index) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<Tag color="blue">#{index + 1}</Tag>}
                    title={item.model?.name}
                    description={`${item.model?.company.name} - ${item.model?.category.name}`}
                  />
                  <div>
                    <Text strong>{item.count}</Text>
                    <Text type="secondary"> sold</Text>
                  </div>
                </List.Item>
              )}
              locale={{ emptyText: 'No sales data' }}
            />
          </Card>
        </Col>

        {/* Recent Invoices */}
        <Col xs={24} lg={8}>
          <Card 
            title="Recent Invoices"
            extra={
              hasPermission('finance.create') && (
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />} 
                  onClick={() => navigate('/app/finance/invoices/create')}
                >
                  Create
                </Button>
              )
            }
          >
            <List
              dataSource={data.recentTransactions.invoices.slice(0, 5)}
              renderItem={(invoice) => (
                <List.Item
                  actions={[
                    <Button 
                      type="link" 
                      size="small"
                      onClick={() => navigate(`/app/finance/invoices/${invoice.id}`)}
                    >
                      View
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    title={invoice.invoiceNumber}
                    description={invoice.customer?.name}
                  />
                  <div>
                    <div>PKR {invoice.total}</div>
                    <Tag 
                      color={
                        invoice.status === 'Paid' ? 'green' :
                        invoice.status === 'Overdue' ? 'red' :
                        invoice.status === 'Partial' ? 'orange' : 'blue'
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

        {/* Recent Payments */}
        <Col xs={24} lg={8}>
          <Card 
            title="Recent Payments"
            extra={
              hasPermission('finance.create') && (
                <Button 
                  type="primary" 
                  icon={<DollarOutlined />}
                  onClick={() => navigate('/app/finance/payments/record')}
                >
                  Record
                </Button>
              )
            }
          >
            <List
              dataSource={data.recentTransactions.payments.slice(0, 5)}
              renderItem={(payment) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={
                      <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a' }} />
                    }
                    title={`PKR ${payment.amount}`}
                    description={payment.customer?.name}
                  />
                  <div>
                    <Text type="secondary">
                      {new Date(payment.paymentDate).toLocaleDateString()}
                    </Text>
                  </div>
                </List.Item>
              )}
              locale={{ emptyText: 'No recent payments' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Quick Actions */}
      {(hasPermission('inventory.create') || hasPermission('finance.create')) && (
        <Card style={{ marginTop: 16 }}>
          <Space size="large">
            <Text strong>Quick Actions:</Text>
            {hasPermission('inventory.create') && (
              <Button icon={<PlusOutlined />} onClick={() => navigate('/app/inventory/items/add')}>
                Add Item
              </Button>
            )}
            {hasPermission('finance.create') && (
              <>
                <Button icon={<FileTextOutlined />} onClick={() => navigate('/app/finance/invoices/create')}>
                  Create Invoice
                </Button>
                <Button icon={<DollarOutlined />} onClick={() => navigate('/app/finance/payments/record')}>
                  Record Payment
                </Button>
              </>
            )}
          </Space>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;