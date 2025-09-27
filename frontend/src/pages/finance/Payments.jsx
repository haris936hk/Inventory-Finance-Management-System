// ========== src/pages/finance/Payments.jsx ==========
import React, { useState } from 'react';
import {
  Card, Table, Button, Space, Tag, Input, DatePicker, Select,
  Statistic, Row, Col, Typography
} from 'antd';
import {
  PlusOutlined, CreditCardOutlined, CalendarOutlined,
  UserOutlined, DollarOutlined, FilterOutlined
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatPKR } from '../../config/constants';

const { Search } = Input;
const { RangePicker } = DatePicker;
const { Text } = Typography;

const Payments = () => {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');
  const [dateRange, setDateRange] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('');

  // Fetch payments
  const { data: paymentsData, isLoading } = useQuery(
    ['payments', searchText, dateRange, paymentMethod],
    async () => {
      const params = {};
      if (searchText) params.search = searchText;
      if (dateRange.length === 2) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }
      if (paymentMethod) params.method = paymentMethod;

      const response = await axios.get('/finance/payments', { params });
      return response.data.data;
    }
  );

  const payments = paymentsData || [];

  // Calculate stats from the payments data
  const stats = {
    totalAmount: payments.reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0),
    totalCount: payments.length,
    todayAmount: payments
      .filter(payment => dayjs(payment.paymentDate).isSame(dayjs(), 'day'))
      .reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0),
    monthAmount: payments
      .filter(payment => dayjs(payment.paymentDate).isSame(dayjs(), 'month'))
      .reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0)
  };

  const paymentMethodColors = {
    'Cash': 'green',
    'Bank Transfer': 'blue',
    'Cheque': 'orange',
    'Credit Card': 'purple',
    'Online': 'cyan'
  };

  const columns = [
    {
      title: 'Payment ID',
      dataIndex: 'paymentNumber',
      key: 'paymentNumber',
      render: (text) => <Text strong>{text}</Text>
    },
    {
      title: 'Date',
      dataIndex: 'paymentDate',
      key: 'paymentDate',
      render: (date) => dayjs(date).format('DD/MM/YYYY')
    },
    {
      title: 'Customer',
      dataIndex: 'customer',
      key: 'customer',
      render: (customer) => (
        <div>
          <div>{customer?.name}</div>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {customer?.phone}
          </Text>
        </div>
      )
    },
    {
      title: 'Invoice',
      dataIndex: 'invoice',
      key: 'invoice',
      render: (invoice) => invoice?.invoiceNumber || '-'
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount) => (
        <Text strong style={{ color: '#52c41a' }}>
          {formatPKR(amount)}
        </Text>
      ),
      sorter: (a, b) => a.amount - b.amount
    },
    {
      title: 'Method',
      dataIndex: 'method',
      key: 'method',
      render: (method) => (
        <Tag color={paymentMethodColors[method] || 'default'}>
          {method}
        </Tag>
      )
    },
    {
      title: 'Reference',
      dataIndex: 'reference',
      key: 'reference',
      render: (ref) => ref || '-'
    },
    {
      title: 'Recorded By',
      dataIndex: 'recordedBy',
      key: 'recordedBy',
      render: (recordedBy) => recordedBy?.fullName || 'Unknown'
    }
  ];

  return (
    <div>
      {/* Stats Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Payments"
              value={stats.totalCount}
              prefix={<CreditCardOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Amount"
              value={stats.totalAmount}
              prefix="PKR"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Today's Payments"
              value={stats.todayAmount}
              prefix="PKR"
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="This Month"
              value={stats.monthAmount}
              prefix="PKR"
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Table */}
      <Card
        title="Payment Records"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/app/finance/payments/record')}
          >
            Record Payment
          </Button>
        }
      >
        {/* Filters */}
        <div style={{ marginBottom: 16 }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={8}>
              <Search
                placeholder="Search by customer or payment ID..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
              />
            </Col>
            <Col xs={24} sm={6}>
              <RangePicker
                value={dateRange}
                onChange={setDateRange}
                placeholder={['Start Date', 'End Date']}
                style={{ width: '100%' }}
              />
            </Col>
            <Col xs={24} sm={6}>
              <Select
                placeholder="Payment Method"
                value={paymentMethod}
                onChange={setPaymentMethod}
                allowClear
                style={{ width: '100%' }}
              >
                <Select.Option value="Cash">Cash</Select.Option>
                <Select.Option value="Bank Transfer">Bank Transfer</Select.Option>
                <Select.Option value="Cheque">Cheque</Select.Option>
                <Select.Option value="Credit Card">Credit Card</Select.Option>
                <Select.Option value="Online">Online</Select.Option>
              </Select>
            </Col>
            <Col xs={24} sm={4}>
              <Button
                icon={<FilterOutlined />}
                onClick={() => {
                  setSearchText('');
                  setDateRange([]);
                  setPaymentMethod('');
                }}
              >
                Clear
              </Button>
            </Col>
          </Row>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={payments}
          loading={isLoading}
          pagination={{
            total: paymentsData?.total,
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) =>
              `${range[0]}-${range[1]} of ${total} payments`
          }}
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
};

export default Payments;