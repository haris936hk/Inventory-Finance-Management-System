// ========== src/pages/finance/Payments.jsx ==========
import React, { useState } from 'react';
import {
  Card, Table, Button, Space, Tag, Input, DatePicker, Select,
  Statistic, Row, Col, Typography, Modal, message
} from 'antd';
import {
  PlusOutlined, DollarCircleOutlined, UserOutlined,
  BankOutlined, CreditCardOutlined, MoneyCollectOutlined,
  StopOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatPKR } from '../../config/constants';
import { parseAmount, addAmounts } from '../../utils/decimalUtils';
import { getErrorMessage } from '../../utils/errorMessages';

const { Search } = Input;
const { RangePicker } = DatePicker;

const Payments = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({});


  // Fetch payments
  const { data: paymentsData, isLoading } = useQuery(
    ['payments', filters],
    async () => {
      const response = await axios.get('/finance/payments', { params: filters });
      return response.data.data;
    }
  );

  // Fetch customers for filter
  const { data: customers } = useQuery('customers', async () => {
    const response = await axios.get('/finance/customers');
    return response.data.data;
  });

  // Calculate statistics
  const statistics = React.useMemo(() => {
    if (!paymentsData) return { total: 0, cash: 0, bank: 0, cheque: 0, count: 0 };

    return paymentsData.reduce((acc, payment) => {
      const amount = parseAmount(payment.amount);
      acc.total = addAmounts(acc.total, amount);
      acc.count++;

      switch (payment.method) {
        case 'Cash':
          acc.cash = addAmounts(acc.cash, amount);
          break;
        case 'Bank Transfer':
          acc.bank = addAmounts(acc.bank, amount);
          break;
        case 'Cheque':
          acc.cheque = addAmounts(acc.cheque, amount);
          break;
      }
      return acc;
    }, { total: 0, cash: 0, bank: 0, cheque: 0, count: 0 });
  }, [paymentsData]);

  // Void payment mutation
  const voidPaymentMutation = useMutation(
    ({ id }) => axios.post(`/finance/payments/${id}/void`),
    {
      onSuccess: () => {
        message.success('Payment voided successfully');
        queryClient.invalidateQueries('payments');
        queryClient.invalidateQueries('invoices');
        queryClient.invalidateQueries('customers');
      },
      onError: (error) => {
        const errorMessage = getErrorMessage(error, 'payment', 'void');
        message.error(errorMessage);
      }
    }
  );

  const getMethodColor = (method) => {
    const colors = {
      'Cash': 'green',
      'Bank Transfer': 'blue',
      'Cheque': 'orange',
      'Credit Card': 'purple',
      'Online': 'cyan'
    };
    return colors[method] || 'default';
  };

  const getMethodIcon = (method) => {
    const icons = {
      'Cash': <MoneyCollectOutlined />,
      'Bank Transfer': <BankOutlined />,
      'Cheque': <CreditCardOutlined />,
      'Credit Card': <CreditCardOutlined />,
      'Online': <DollarCircleOutlined />
    };
    return icons[method] || <DollarCircleOutlined />;
  };

  const handleVoidPayment = (record) => {
    Modal.confirm({
      title: 'Void Payment',
      content: (
        <div>
          <p>Are you sure you want to void payment <strong>{record.paymentNumber}</strong>?</p>
          <p style={{ color: '#ff4d4f', marginTop: 8 }}>
            <ExclamationCircleOutlined /> This will reverse the payment amount from the invoice and customer balance.
          </p>
        </div>
      ),
      onOk: () => {
        return voidPaymentMutation.mutateAsync({ id: record.id });
      },
      okText: 'Void Payment',
      okButtonProps: { danger: true }
    });
  };

  const columns = [
    {
      title: 'Payment #',
      dataIndex: 'paymentNumber',
      key: 'paymentNumber',
      fixed: 'left',
      width: 75,
      render: (text, record) => (
        <Space direction="vertical" size="small">
          <span style={{ fontWeight: 'bold', color: record.voidedAt ? '#999' : '#1890ff' }}>
            {text}
          </span>
          {record.voidedAt && <Tag color="red" size="small">VOIDED</Tag>}
        </Space>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'paymentDate',
      key: 'paymentDate',
      width: 50,
      render: (date) => new Date(date).toLocaleDateString('en-GB'),
    },
    {
      title: 'Customer',
      dataIndex: 'customer',
      key: 'customer',
      width: 60,
      render: (customer) => (
        <Space>
          <UserOutlined />
          <span>{customer?.name}</span>
        </Space>
      ),
    },
    {
      title: 'Invoice Reference',
      dataIndex: 'invoice',
      key: 'invoice',
      width: 65,
      render: (invoice) => invoice ? (
        <Button
          type="link"
          size="small"
          onClick={() => navigate(`/app/finance/invoices/${invoice.id}`)}
        >
          {invoice.invoiceNumber}
        </Button>
      ) : <Tag color="blue">General Payment</Tag>,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 50,
      align: 'right',
      render: (amount, record) => (
        <span style={{
          fontWeight: 'bold',
          color: record.voidedAt ? '#999' : '#52c41a',
          textDecoration: record.voidedAt ? 'line-through' : 'none'
        }}>
          {formatPKR(Number(amount))}
        </span>
      ),
    },
    {
      title: 'Method',
      dataIndex: 'method',
      key: 'method',
      width: 40,
      render: (method) => (
        <Space>
          {getMethodIcon(method)}
          <Tag color={getMethodColor(method)}>{method}</Tag>
        </Space>
      ),
    },
    {
      title: 'Reference',
      dataIndex: 'reference',
      key: 'reference',
      width: 70,
      render: (reference) => reference || '-',
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      width: 70,
      render: (notes) => notes ? (
        <span title={notes}>
          {notes.length > 50 ? `${notes.substring(0, 50)}...` : notes}
        </span>
      ) : '-',
    },
    {
      title: 'Recorded By',
      dataIndex: 'recordedBy',
      key: 'recordedBy',
      width: 90,
      render: (recordedBy) => recordedBy?.fullName || 'Unknown',
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 60,
      render: (_, record) => (
        <Button
          size="small"
          danger
          icon={<StopOutlined />}
          onClick={() => handleVoidPayment(record)}
          disabled={!!record.voidedAt}
        >
          
        </Button>
      ),
    },
  ];

  return (
    <>
      {/* Statistics Cards */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Payments"
              value={statistics.total}
              prefix="PKR"
              precision={0}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Cash Payments"
              value={statistics.cash}
              prefix="PKR"
              precision={0}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Bank Transfers"
              value={statistics.bank}
              prefix="PKR"
              precision={0}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Count"
              value={statistics.count}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Table Card */}
      <Card
        title={
          <Space>
            <DollarCircleOutlined />
            Customer Payments
          </Space>
        }
        extra={
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/app/finance/payments/record')}
            >
              Record Payment
            </Button>
          </Space>
        }
      >
        {/* Filters */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={8} md={6}>
            <Search
              placeholder="Search payment number..."
              onSearch={(value) => setFilters({...filters, search: value})}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Select
              placeholder="All Customers"
              allowClear
              style={{ width: '100%' }}
              onChange={(value) => setFilters({...filters, customerId: value})}
            >
              {customers?.map(customer => (
                <Select.Option key={customer.id} value={customer.id}>
                  {customer.name}
                </Select.Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Select
              placeholder="All Methods"
              allowClear
              style={{ width: '100%' }}
              onChange={(value) => setFilters({...filters, method: value})}
            >
              <Select.Option value="Cash">Cash</Select.Option>
              <Select.Option value="Bank Transfer">Bank Transfer</Select.Option>
              <Select.Option value="Cheque">Cheque</Select.Option>
              <Select.Option value="Credit Card">Credit Card</Select.Option>
              <Select.Option value="Online">Online</Select.Option>
            </Select>
          </Col>
          <Col xs={24} sm={8} md={6}>
            <RangePicker
              style={{ width: '100%' }}
              onChange={(dates) => {
                setFilters({
                  ...filters,
                  startDate: dates?.[0]?.format('YYYY-MM-DD'),
                  endDate: dates?.[1]?.format('YYYY-MM-DD')
                });
              }}
            />
          </Col>
        </Row>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={paymentsData}
          loading={isLoading}
          scroll={{ x: 1250 }}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          }}
        />
      </Card>
    </>
  );
};

export default Payments;