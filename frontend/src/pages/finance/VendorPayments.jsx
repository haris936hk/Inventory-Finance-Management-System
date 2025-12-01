// ========== src/pages/finance/VendorPayments.jsx ==========
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, Button, Space, Tag, Input, Select, DatePicker,
  Row, Col, Statistic, Dropdown, message, Modal
} from 'antd';
import {
  PlusOutlined, SearchOutlined, EyeOutlined, EditOutlined,
  DeleteOutlined, DollarCircleOutlined, PrinterOutlined,
  MoreOutlined, BankOutlined, CreditCardOutlined, MoneyCollectOutlined,
  ShopOutlined, FileTextOutlined, StopOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import { useAuthStore } from '../../stores/authStore';
import { formatPKR } from '../../config/constants';
import { parseAmount, addAmounts } from '../../utils/decimalUtils';
import { getErrorMessage } from '../../utils/errorMessages';

const { RangePicker } = DatePicker;
const { Search } = Input;
const { TextArea } = Input;

const VendorPayments = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [filters, setFilters] = useState({});

  // Fetch vendor payments
  const { data: vendorPaymentsData, isLoading } = useQuery(
    ['vendor-payments', filters],
    async () => {
      const response = await axios.get('/finance/vendor-payments', { params: filters });
      return response.data.data;
    }
  );

  // Fetch vendors for filter and form
  const { data: vendors } = useQuery('vendors', async () => {
    const response = await axios.get('/inventory/vendors');
    return response.data.data;
  });


  // Calculate statistics
  const statistics = React.useMemo(() => {
    if (!vendorPaymentsData) return { total: 0, cash: 0, bank: 0, cheque: 0, count: 0 };

    return vendorPaymentsData.reduce((acc, payment) => {
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
  }, [vendorPaymentsData]);

  // Void Payment mutation
  const voidPaymentMutation = useMutation(
    ({ id }) => axios.post(`/finance/vendor-payments/${id}/void`),
    {
      onSuccess: () => {
        message.success('Payment voided successfully');
        queryClient.invalidateQueries('vendor-payments');
        queryClient.invalidateQueries('vendor-bills');
        queryClient.invalidateQueries('vendors');
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
      'Cheque': 'orange'
    };
    return colors[method] || 'default';
  };

  const getMethodIcon = (method) => {
    const icons = {
      'Cash': <MoneyCollectOutlined />,
      'Bank Transfer': <BankOutlined />,
      'Cheque': <CreditCardOutlined />
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
            <ExclamationCircleOutlined /> This will reverse the payment amount from the bill and vendor balance.
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
      width: 140,
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
      width: 80,
      render: (date) => new Date(date).toLocaleDateString('en-GB'),
    },
    {
      title: 'Vendor',
      dataIndex: 'vendor',
      key: 'vendor',
      width: 100,
      render: (vendor) => (
        <Space>
          <ShopOutlined />
          <span>{vendor?.name}</span>
        </Space>
      ),
    },
    {
      title: 'Bill Reference',
      dataIndex: 'bill',
      key: 'bill',
      width: 140,
      render: (bill) => bill ? (
        <Button
          type="link"
          size="small"
          onClick={() => navigate(`/app/finance/vendor-bills/${bill.id}`)}
        >
          {bill.billNumber}
        </Button>
      ) : <Tag color="blue">General Payment</Tag>,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
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
      width: 80,
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
      width: 120,
      render: (reference) => reference || '-',
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      width: 120,
      render: (notes) => notes ? (
        <span title={notes}>
          {notes.length > 50 ? `${notes.substring(0, 50)}...` : notes}
        </span>
      ) : '-',
    },
    {
      title: 'Recorded By',
      dataIndex: 'createdByUser',
      key: 'createdByUser',
      width: 90,
      render: (createdByUser) => createdByUser?.fullName || 'Unknown',
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 65,
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
            Vendor Payments
          </Space>
        }
        extra={
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/app/finance/vendor-payments/record')}
              disabled={!hasPermission('finance.create')}
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
              placeholder="All Vendors"
              allowClear
              style={{ width: '100%' }}
              onChange={(value) => setFilters({...filters, vendorId: value})}
            >
              {vendors?.map(vendor => (
                <Select.Option key={vendor.id} value={vendor.id}>
                  {vendor.name}
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
            </Select>
          </Col>
          <Col xs={24} sm={8} md={6}>
            <RangePicker
              style={{ width: '100%' }}
              onChange={(dates) => {
                setFilters({
                  ...filters,
                  dateFrom: dates?.[0]?.format('YYYY-MM-DD'),
                  dateTo: dates?.[1]?.format('YYYY-MM-DD')
                });
              }}
            />
          </Col>
        </Row>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={vendorPaymentsData}
          loading={isLoading}
          scroll={{ x: 1200 }}
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

export default VendorPayments;