import React, { useState } from 'react';
import { Card, Row, Col, Statistic, DatePicker, Table, Spin, Space, Typography, Tag } from 'antd';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatAmount } from '../../utils/decimalUtils';

const { RangePicker } = DatePicker;
const { Title } = Typography;

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82ca9d', '#ffc658', '#ff7c7c', '#a28bfe', '#68d4f8'];

const CustomerAnalysisReport = () => {
  const [dateRange, setDateRange] = useState([
    dayjs().startOf('month'),
    dayjs().endOf('month')
  ]);

  const { data, isLoading, error } = useQuery(
    ['customer-analysis', dateRange],
    async () => {
      const response = await axios.get('/reports/customer-analysis', {
        params: {
          startDate: dateRange[0].format('YYYY-MM-DD'),
          endDate: dateRange[1].format('YYYY-MM-DD'),
          topN: 10
        }
      });
      return response.data.data;
    }
  );

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 50 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 50, color: '#ff4d4f' }}>
          Error loading customer analysis report
        </div>
      </Card>
    );
  }

  const formatCurrency = (value) => {
    return `PKR ${Number(value).toLocaleString('en-PK', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    })}`;
  };

  // Prepare data for bar chart
  const barChartData = (data?.topCustomers || []).map(c => ({
    name: c.customer.name.length > 20 ? c.customer.name.substring(0, 20) + '...' : c.customer.name,
    revenue: c.revenue,
    outstanding: c.outstanding
  }));

  // Prepare data for pie chart
  const pieChartData = (data?.topCustomers || []).map((c, index) => ({
    name: c.customer.name.length > 15 ? c.customer.name.substring(0, 15) + '...' : c.customer.name,
    value: c.revenue
  }));

  const columns = [
    {
      title: 'Customer',
      dataIndex: ['customer', 'name'],
      key: 'name',
      fixed: 'left',
      width: 200
    },
    {
      title: 'Company',
      dataIndex: ['customer', 'company'],
      key: 'company',
      width: 150
    },
    {
      title: 'Phone',
      dataIndex: ['customer', 'phone'],
      key: 'phone',
      width: 120
    },
    {
      title: 'Revenue',
      dataIndex: 'revenue',
      key: 'revenue',
      align: 'right',
      render: (value) => formatCurrency(value),
      sorter: (a, b) => a.revenue - b.revenue
    },
    {
      title: 'Payments',
      dataIndex: 'payments',
      key: 'payments',
      align: 'right',
      render: (value) => formatCurrency(value)
    },
    {
      title: 'Outstanding',
      dataIndex: 'outstanding',
      key: 'outstanding',
      align: 'right',
      render: (value) => (
        <span style={{ color: value > 0 ? '#faad14' : '#52c41a' }}>
          {formatCurrency(value)}
        </span>
      ),
      sorter: (a, b) => a.outstanding - b.outstanding
    },
    {
      title: 'Invoices',
      dataIndex: 'invoiceCount',
      key: 'invoiceCount',
      align: 'center'
    },
    {
      title: 'Collection Rate',
      dataIndex: 'collectionRate',
      key: 'collectionRate',
      align: 'center',
      render: (value) => (
        <Tag color={value >= 80 ? 'green' : value >= 60 ? 'orange' : 'red'}>
          {formatAmount(value, 1)}%
        </Tag>
      ),
      sorter: (a, b) => a.collectionRate - b.collectionRate
    }
  ];

  return (
    <Card
      title={<Title level={4} style={{ margin: 0 }}>Customer Analysis</Title>}
      extra={
        <RangePicker
          value={dateRange}
          onChange={(dates) => dates && setDateRange(dates)}
        />
      }
    >
      {/* Stats Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Total Customers"
              value={data?.summary?.totalCustomers || 0}
              valueStyle={{ color: '#1890ff' }}
            />
            <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
              Customers with invoices in this period
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Total Revenue"
              value={formatAmount(data?.summary?.totalRevenue || 0)}
              prefix="PKR"
              valueStyle={{ color: '#52c41a' }}
            />
            <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
              Sum of all invoices
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Avg Revenue per Customer"
              value={formatAmount(data?.summary?.averageRevenuePerCustomer || 0)}
              prefix="PKR"
              valueStyle={{ color: '#faad14' }}
            />
            <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
              Total revenue / customer count
            </div>
          </Card>
        </Col>
      </Row>

      {/* Charts */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <Card title="Top 10 Customers by Revenue">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`}
                />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="revenue" fill="#1890ff" name="Revenue" />
                <Bar dataKey="outstanding" fill="#faad14" name="Outstanding" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Revenue Distribution">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${((entry.value / data.summary.totalRevenue) * 100).toFixed(1)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      {/* Customer Table */}
      <Card title="Customer Details">
        <Table
          dataSource={data?.topCustomers || []}
          columns={columns}
          rowKey={(record) => record.customer.id}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1000 }}
          size="small"
        />
      </Card>
    </Card>
  );
};

export default CustomerAnalysisReport;
