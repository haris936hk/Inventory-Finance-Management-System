// ========== src/pages/finance/VendorBills.jsx ==========
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, Button, Space, Tag, Input, Select, DatePicker,
  Row, Col, Statistic, Badge, Dropdown, message, Modal, Progress
} from 'antd';
import {
  PlusOutlined, SearchOutlined, FilterOutlined,
  EyeOutlined, DeleteOutlined, ShopOutlined,
  MoreOutlined, CheckOutlined,
  SendOutlined, StopOutlined, DollarCircleOutlined, FileTextOutlined,
  ClockCircleOutlined, InfoCircleOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import { useAuthStore } from '../../stores/authStore';
import { formatPKR } from '../../config/constants';
import { parseAmount } from '../../utils/decimalUtils';
import { getErrorMessage } from '../../utils/errorMessages';

const { RangePicker } = DatePicker;
const { Search } = Input;

const VendorBills = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [filters, setFilters] = useState({});

  // Fetch vendor bills
  const { data: vendorBillsData, isLoading } = useQuery(
    ['vendor-bills', filters],
    async () => {
      const response = await axios.get('/finance/vendor-bills', { params: filters });
      return response.data.data;
    }
  );

  // Fetch vendors for filter
  const { data: vendors } = useQuery('vendors', async () => {
    const response = await axios.get('/inventory/vendors');
    return response.data.data;
  });

  // Calculate statistics
  const statistics = React.useMemo(() => {
    if (!vendorBillsData) return { total: 0, unpaid: 0, partial: 0, paid: 0, overdue: 0 };

    const today = new Date();
    return vendorBillsData.reduce((acc, bill) => {
      const billTotal = parseAmount(bill.total);
      const paidAmount = parseAmount(bill.paidAmount);
      const balance = billTotal - paidAmount;

      acc.total += billTotal;

      switch (bill.status) {
        case 'Unpaid':
          acc.unpaid += balance;
          if (bill.dueDate && new Date(bill.dueDate) < today) {
            acc.overdue += balance;
          }
          break;
        case 'Partial':
          acc.partial += balance;
          if (bill.dueDate && new Date(bill.dueDate) < today) {
            acc.overdue += balance;
          }
          break;
        case 'Paid':
          acc.paid += billTotal;
          break;
      }
      return acc;
    }, { total: 0, unpaid: 0, partial: 0, paid: 0, overdue: 0 });
  }, [vendorBillsData]);

  // Cancel bill mutation
  const cancelBillMutation = useMutation(
    (id) => axios.post(`/finance/vendor-bills/${id}/cancel`),
    {
      onSuccess: () => {
        message.success('Bill cancelled successfully');
        queryClient.invalidateQueries('vendor-bills');
        queryClient.invalidateQueries('purchase-orders');
        queryClient.invalidateQueries('vendors');
      },
      onError: (error) => {
        const errorMessage = getErrorMessage(error, 'bill', 'cancel');
        message.error(errorMessage);
      }
    }
  );

  const getStatusColor = (status) => {
    const colors = {
      'Unpaid': 'red',
      'Partial': 'orange',
      'Paid': 'green'
    };
    return colors[status] || 'default';
  };

  const handleCancelBill = (record) => {
    Modal.confirm({
      title: 'Cancel Bill',
      content: (
        <div>
          <p>Are you sure you want to cancel bill <strong>{record.billNumber}</strong>?</p>
          <p style={{ color: '#ff4d4f', marginTop: 12 }}>
            This will reverse all amounts and mark the bill as cancelled. This action cannot be undone.
          </p>
        </div>
      ),
      onOk: () => cancelBillMutation.mutateAsync(record.id),
      okText: 'Yes, Cancel Bill',
      cancelText: 'No, Keep It',
      okType: 'danger'
    });
  };

  const getStatusActions = (record) => {
    // Status actions removed - use Record Payment instead
    return [];
  };

  const isOverdue = (bill) => {
    if (!bill.dueDate || bill.status === 'Paid') return false;
    return new Date(bill.dueDate) < new Date();
  };

  const getPaymentProgress = (bill) => {
    const total = parseAmount(bill.total);
    const paid = parseAmount(bill.paidAmount);
    return Math.round((paid / total) * 100);
  };

  const columns = [
    {
      title: 'Bill #',
      dataIndex: 'billNumber',
      key: 'billNumber',
      fixed: 'left',
      width: 135,
      render: (text, record) => (
        <Button
          type="link"
          onClick={() => navigate(`/app/finance/vendor-bills/${record.id}`)}
          style={{ padding: 0, fontWeight: 'bold' }}
        >
          {text}
        </Button>
      ),
    },
    {
      title: 'Vendor',
      dataIndex: 'vendor',
      key: 'vendor',
      width: 110,
      render: (vendor) => (
        <Space>
          <ShopOutlined />
          <span>{vendor?.name}</span>
        </Space>
      ),
    },
    {
      title: 'Bill Date',
      dataIndex: 'billDate',
      key: 'billDate',
      width: 90,
      render: (date) => new Date(date).toLocaleDateString('en-GB'),
    },
    {
      title: 'Due Date',
      dataIndex: 'dueDate',
      key: 'dueDate',
      width: 90,
      render: (date, record) => {
        if (!date) return '-';
        const formatted = new Date(date).toLocaleDateString('en-GB');
        const overdue = isOverdue(record);
        return (
          <span style={{ color: overdue ? '#ff4d4f' : 'inherit' }}>
            {overdue && <ExclamationCircleOutlined style={{ marginRight: 4 }} />}
            {formatted}
          </span>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status, record) => {
        const overdue = isOverdue(record);
        return (
          <Space direction="vertical" size="small">
            <Tag color={getStatusColor(status)}>{status}</Tag>
            {overdue && <Tag color="red" size="small">OVERDUE</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'PO #',
      dataIndex: 'purchaseOrder',
      key: 'purchaseOrder',
      width: 110,
      render: (po) => po ? (
        <Button
          type="link"
          size="small"
          onClick={() => navigate(`/app/finance/purchase-orders/${po.id}`)}
        >
          {po.poNumber}
        </Button>
      ) : '-',
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      width: 100,
      align: 'right',
      render: (amount) => (
        <span style={{ fontWeight: 'bold', color: '#1890ff' }}>
          {formatPKR(Number(amount))}
        </span>
      ),
    },
    {
      title: 'Paid',
      dataIndex: 'paidAmount',
      key: 'paidAmount',
      width: 100,
      align: 'right',
      render: (paidAmount) => (
        <span style={{ color: '#52c41a' }}>
          {formatPKR(Number(paidAmount || 0))}
        </span>
      ),
    },
    {
      title: 'Progress',
      key: 'progress',
      width: 90,
      render: (_, record) => (
        <Progress
          percent={getPaymentProgress(record)}
          size="small"
          status={record.status === 'Paid' ? 'success' : 'active'}
        />
      ),
    },
    {
      title: 'Pay',
      key: 'paymentsCount',
      width: 50,
      align: 'center',
      render: (_, record) => (
        <Badge
          count={record._count?.payments || 0}
          showZero
          style={{ backgroundColor: '#1890ff' }}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 100,
      render: (_, record) => {
        const statusActions = getStatusActions(record);
        const menuItems = [
          {
            key: 'payment',
            icon: <DollarCircleOutlined />,
            label: 'Record Payment',
            disabled: record.status === 'Paid',
            onClick: () => navigate(`/app/finance/vendor-payments/record?billId=${record.id}`)
          },
          {
            key: 'cancel',
            icon: <StopOutlined />,
            label: 'Cancel Bill',
            danger: true,
            disabled: record.status !== 'Unpaid' || parseAmount(record.paidAmount) > 0,
            onClick: () => handleCancelBill(record)
          }
        ];

        return (
          <Space>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/app/finance/vendor-bills/${record.id}`)}
            />
            <Dropdown menu={{ items: menuItems }} placement="bottomRight">
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  return (
    <>
      {/* Statistics Cards */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Bills"
              value={statistics.total}
              prefix="PKR"
              precision={0}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Unpaid"
              value={statistics.unpaid}
              prefix="PKR"
              precision={0}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Partial"
              value={statistics.partial}
              prefix="PKR"
              precision={0}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Overdue"
              value={statistics.overdue}
              prefix="PKR"
              precision={0}
              valueStyle={{ color: '#ff7875' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Table Card */}
      <Card
        title={
          <Space>
            <FileTextOutlined />
            Vendor Bills
          </Space>
        }
        extra={
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/app/finance/vendor-bills/create')}
              disabled={!hasPermission('finance.create')}
            >
              New Bill
            </Button>
          </Space>
        }
      >
        {/* Filters */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={8} md={6}>
            <Search
              placeholder="Search bill number..."
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
              placeholder="All Status"
              allowClear
              style={{ width: '100%' }}
              onChange={(value) => setFilters({...filters, status: value})}
            >
              <Select.Option value="Unpaid">Unpaid</Select.Option>
              <Select.Option value="Partial">Partial</Select.Option>
              <Select.Option value="Paid">Paid</Select.Option>
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
          dataSource={vendorBillsData}
          loading={isLoading}
          scroll={{ x: 1100 }}
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

export default VendorBills;