// ========== src/pages/finance/Invoices.jsx ==========
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, Button, Space, Tag, Input, Select, DatePicker,
  Row, Col, Statistic, Badge, Dropdown, message, Modal
} from 'antd';
import {
  PlusOutlined, SearchOutlined, FilterOutlined, PrinterOutlined,
  EyeOutlined, EditOutlined, DeleteOutlined, DollarOutlined,
  MailOutlined, FilePdfOutlined, MoreOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import { useAuthStore } from '../../stores/authStore';
import { formatPKR } from '../../config/constants';

const { RangePicker } = DatePicker;
const { Search } = Input;

const Invoices = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [filters, setFilters] = useState({});
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  // Fetch invoices
  const { data: invoicesData, isLoading } = useQuery(
    ['invoices', filters],
    async () => {
      const response = await axios.get('/finance/invoices', { params: filters });
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
    if (!invoicesData) return { total: 0, paid: 0, pending: 0, overdue: 0 };
    
    return invoicesData.reduce((acc, invoice) => {
      acc.total += parseFloat(invoice.total);
      if (invoice.status === 'Paid') {
        acc.paid += parseFloat(invoice.total);
      } else if (invoice.status === 'Overdue') {
        acc.overdue += parseFloat(invoice.total) - parseFloat(invoice.paidAmount);
      } else {
        acc.pending += parseFloat(invoice.total) - parseFloat(invoice.paidAmount);
      }
      return acc;
    }, { total: 0, paid: 0, pending: 0, overdue: 0 });
  }, [invoicesData]);

  // Update status mutation
  const updateStatusMutation = useMutation(
    ({ id, status }) => axios.put(`/finance/invoices/${id}/status`, { status }),
    {
      onSuccess: () => {
        message.success('Invoice status updated');
        queryClient.invalidateQueries('invoices');
      }
    }
  );

  const getStatusColor = (status) => {
    const colors = {
      'Draft': 'default',
      'Sent': 'blue',
      'Partial': 'orange',
      'Paid': 'green',
      'Overdue': 'red',
      'Cancelled': 'default'
    };
    return colors[status] || 'default';
  };

  const handlePrintInvoice = async (invoice) => {
    try {
      const response = await axios.post(`/finance/invoices/${invoice.id}/pdf`);
      window.open(response.data.url, '_blank');
    } catch (error) {
      message.error('Failed to generate PDF');
    }
  };

  const handleSendInvoice = (invoice) => {
    message.info('Email functionality not configured');
  };

  const columns = [
    {
      title: 'Invoice #',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
      fixed: 'left',
      width: 120,
      render: (text, record) => (
        <Button type="link" onClick={() => navigate(`/app/finance/invoices/${record.id}`)}>
          {text}
        </Button>
      )
    },
    {
      title: 'Customer',
      dataIndex: ['customer', 'name'],
      key: 'customer',
      width: 180,
      render: (name, record) => (
        <div>
          <div>{name}</div>
          <small style={{ color: '#8c8c8c' }}>{record.customer.phone}</small>
        </div>
      )
    },
    {
      title: 'Date',
      dataIndex: 'invoiceDate',
      key: 'invoiceDate',
      width: 100,
      render: (date) => new Date(date).toLocaleDateString(),
      sorter: (a, b) => new Date(a.invoiceDate) - new Date(b.invoiceDate)
    },
    {
      title: 'Due Date',
      dataIndex: 'dueDate',
      key: 'dueDate',
      width: 100,
      render: (date) => new Date(date).toLocaleDateString()
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      width: 120,
      render: (amount) => formatPKR(parseFloat(amount)),
      sorter: (a, b) => a.total - b.total
    },
    {
      title: 'Paid',
      dataIndex: 'paidAmount',
      key: 'paidAmount',
      width: 120,
      render: (amount) => formatPKR(parseFloat(amount))
    },
    {
      title: 'Balance',
      key: 'balance',
      width: 120,
      render: (_, record) => {
        const balance = parseFloat(record.total) - parseFloat(record.paidAmount);
        return (
          <span style={{ color: balance > 0 ? '#ff4d4f' : '#52c41a' }}>
            formatPKR(balance)
          </span>
        );
      }
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      filters: [
        { text: 'Draft', value: 'Draft' },
        { text: 'Sent', value: 'Sent' },
        { text: 'Partial', value: 'Partial' },
        { text: 'Paid', value: 'Paid' },
        { text: 'Overdue', value: 'Overdue' }
      ],
      onFilter: (value, record) => record.status === value,
      render: (status) => <Tag color={getStatusColor(status)}>{status}</Tag>
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 100,
      render: (_, record) => {
        const menuItems = [
          {
            key: 'view',
            label: 'View',
            icon: <EyeOutlined />,
            onClick: () => navigate(`/app/finance/invoices/${record.id}`)
          },
          {
            key: 'payment',
            label: 'Record Payment',
            icon: <DollarOutlined />,
            onClick: () => navigate(`/app/finance/payments/record?invoiceId=${record.id}`),
            disabled: record.status === 'Paid'
          },
          {
            key: 'print',
            label: 'Print PDF',
            icon: <FilePdfOutlined />,
            onClick: () => handlePrintInvoice(record)
          },
          {
            key: 'send',
            label: 'Send Email',
            icon: <MailOutlined />,
            onClick: () => handleSendInvoice(record),
            disabled: record.status === 'Draft'
          },
          { type: 'divider' },
          {
            key: 'markSent',
            label: 'Mark as Sent',
            onClick: () => updateStatusMutation.mutate({ id: record.id, status: 'Sent' }),
            disabled: record.status !== 'Draft'
          },
          {
            key: 'cancel',
            label: 'Cancel Invoice',
            danger: true,
            onClick: () => {
              Modal.confirm({
                title: 'Cancel Invoice',
                content: 'Are you sure you want to cancel this invoice?',
                onOk: () => updateStatusMutation.mutate({ id: record.id, status: 'Cancelled' })
              });
            },
            disabled: ['Paid', 'Cancelled'].includes(record.status)
          }
        ];

        return (
          <Dropdown menu={{ items: menuItems }} trigger={['click']}>
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        );
      }
    }
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys)
  };

  return (
    <Card>
      {/* Statistics */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={6}>
          <Statistic
            title="Total Invoiced"
            value={statistics.total}
            prefix="PKR"
            valueStyle={{ color: '#1890ff' }}
          />
        </Col>
        <Col xs={24} sm={6}>
          <Statistic
            title="Paid"
            value={statistics.paid}
            prefix="PKR"
            valueStyle={{ color: '#52c41a' }}
          />
        </Col>
        <Col xs={24} sm={6}>
          <Statistic
            title="Pending"
            value={statistics.pending}
            prefix="PKR"
            valueStyle={{ color: '#faad14' }}
          />
        </Col>
        <Col xs={24} sm={6}>
          <Statistic
            title="Overdue"
            value={statistics.overdue}
            prefix="PKR"
            valueStyle={{ color: '#ff4d4f' }}
          />
        </Col>
      </Row>

      {/* Filters */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8} lg={6}>
          <Search
            placeholder="Search invoice number"
            allowClear
            onSearch={(value) => setFilters({ ...filters, search: value })}
          />
        </Col>
        
        <Col xs={24} sm={8} lg={6}>
          <Select
            placeholder="Select customer"
            allowClear
            style={{ width: '100%' }}
            onChange={(value) => setFilters({ ...filters, customerId: value })}
            showSearch
            optionFilterProp="children"
          >
            {customers?.map(customer => (
              <Select.Option key={customer.id} value={customer.id}>
                {customer.name}
              </Select.Option>
            ))}
          </Select>
        </Col>

        <Col xs={24} sm={8} lg={6}>
          <Select
            placeholder="Status"
            allowClear
            style={{ width: '100%' }}
            onChange={(value) => setFilters({ ...filters, status: value })}
          >
            <Select.Option value="Draft">Draft</Select.Option>
            <Select.Option value="Sent">Sent</Select.Option>
            <Select.Option value="Partial">Partial</Select.Option>
            <Select.Option value="Paid">Paid</Select.Option>
            <Select.Option value="Overdue">Overdue</Select.Option>
          </Select>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          {hasPermission('finance.create') && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/app/finance/invoices/create')}
            >
              Create Invoice
            </Button>
          )}
        </Col>
      </Row>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={invoicesData}
        loading={isLoading}
        rowSelection={rowSelection}
        scroll={{ x: 1200 }}
        pagination={{
          showSizeChanger: true,
          showTotal: (total) => `Total ${total} invoices`
        }}
      />
    </Card>
  );
};

export default Invoices;
