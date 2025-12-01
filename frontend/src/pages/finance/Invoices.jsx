// ========== src/pages/finance/Invoices.jsx ==========
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, Button, Space, Tag, Input, Select, DatePicker,
  Row, Col, Statistic, Badge, Dropdown, message, Modal, Alert
} from 'antd';
import {
  PlusOutlined, SearchOutlined, FilterOutlined,
  EyeOutlined, EditOutlined, DeleteOutlined, DollarOutlined,
  FilePdfOutlined, MoreOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import { useAuthStore } from '../../stores/authStore';
import { formatPKR } from '../../config/constants';
import { parseAmount, formatAmount, subtractAmounts, addAmounts } from '../../utils/decimalUtils';
import { getErrorMessage } from '../../utils/errorMessages';

const { RangePicker } = DatePicker;
const { Search } = Input;

const Invoices = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [filters, setFilters] = useState({});

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
      // CRITICAL FIX: Exclude cancelled invoices from all statistics
      // Cancelled Draft invoices have been reversed and should not count
      if (invoice.cancelledAt || invoice.status === 'Cancelled') {
        return acc;
      }

      const total = parseAmount(invoice.total);
      const paidAmount = parseAmount(invoice.paidAmount || 0);

      acc.total = addAmounts(acc.total, total);
      // Paid should accumulate actual paid amounts from all invoices
      acc.paid = addAmounts(acc.paid, paidAmount);

      // Calculate remaining balances for pending/overdue
      const remaining = subtractAmounts(total, paidAmount);
      if (invoice.status === 'Overdue') {
        acc.overdue = addAmounts(acc.overdue, remaining);
      } else if (invoice.status !== 'Paid') {
        // Sent, Partial, and Draft invoices contribute to pending
        acc.pending = addAmounts(acc.pending, remaining);
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

  // Cancel invoice mutation
  const cancelInvoiceMutation = useMutation(
    (id) => axios.post(`/finance/invoices/${id}/cancel`),
    {
      onSuccess: () => {
        message.success('Invoice cancelled successfully');
        queryClient.invalidateQueries('invoices');
        queryClient.invalidateQueries('customers');
      },
      onError: (error) => {
        const errorMessage = getErrorMessage(error, 'invoice', 'cancel');
        message.error(errorMessage);
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

  const handleMarkAsSent = (record) => {
    Modal.confirm({
      title: 'Mark as Sent',
      content: (
        <div>
          <p>Are you sure you want to mark invoice <strong>{record.invoiceNumber}</strong> as Sent?</p>
          <Alert
            message="Important: Once sent, this invoice cannot be cancelled"
            description="Invoices can only be cancelled while in Draft status. After sending to customer, cancellation will no longer be possible."
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
          />
        </div>
      ),
      onOk: () => updateStatusMutation.mutate({ id: record.id, status: 'Sent' }),
      okText: 'Yes, Mark as Sent',
      okButtonProps: { type: 'primary' },
      cancelText: 'Cancel'
    });
  };

  const handleCancelInvoice = (record) => {
    Modal.confirm({
      title: 'Cancel Invoice',
      content: (
        <div>
          <p>Are you sure you want to cancel invoice <strong>{record.invoiceNumber}</strong>?</p>
          <p style={{ color: '#ff4d4f', marginTop: 12 }}>
            This will reverse all amounts and mark the invoice as cancelled. This action cannot be undone.
          </p>
        </div>
      ),
      onOk: () => cancelInvoiceMutation.mutateAsync(record.id),
      okText: 'Yes, Cancel Invoice',
      okButtonProps: { danger: true },
      cancelText: 'No, Keep It'
    });
  };

  const columns = [
    {
      title: 'Invoice #',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
      fixed: 'left',
      width: 80,
      render: (text, record) => (
        <Space direction="vertical" size="small">
          <Button
            type="link"
            onClick={() => navigate(`/app/finance/invoices/${record.id}`)}
            style={{ color: record.cancelledAt ? '#999' : undefined }}
          >
            {text}
          </Button>
          {record.cancelledAt && <Tag color="red" size="small">CANCELLED</Tag>}
        </Space>
      )
    },
    {
      title: 'Customer',
      dataIndex: ['customer', 'name'],
      key: 'customer',
      width: 80,
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
      width: 80,
      render: (date) => new Date(date).toLocaleDateString(),
      sorter: (a, b) => new Date(a.invoiceDate) - new Date(b.invoiceDate)
    },
    {
      title: 'Due Date',
      dataIndex: 'dueDate',
      key: 'dueDate',
      width: 80,
      render: (date) => new Date(date).toLocaleDateString()
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      width: 80,
      render: (amount, record) => (
        <span style={{
          color: record.cancelledAt ? '#999' : 'inherit',
          textDecoration: record.cancelledAt ? 'line-through' : 'none'
        }}>
          {formatPKR(parseAmount(amount))}
        </span>
      ),
      sorter: (a, b) => parseAmount(a.total) - parseAmount(b.total)
    },
    {
      title: 'Paid',
      dataIndex: 'paidAmount',
      key: 'paidAmount',
      width: 80,
      render: (amount) => formatPKR(parseAmount(amount))
    },
    {
      title: 'Balance',
      key: 'balance',
      width: 80,
      render: (_, record) => {
        const balance = subtractAmounts(parseAmount(record.total), parseAmount(record.paidAmount || 0));
        return (
          <span style={{ color: balance > 0 ? '#ff4d4f' : '#52c41a' }}>
            {formatPKR(balance)}
          </span>
        );
      }
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 50,
      filters: [
        { text: 'Draft', value: 'Draft' },
        { text: 'Sent', value: 'Sent' },
        { text: 'Partial', value: 'Partial' },
        { text: 'Paid', value: 'Paid' },
        { text: 'Overdue', value: 'Overdue' },
        { text: 'Cancelled', value: 'Cancelled' }
      ],
      onFilter: (value, record) => record.status === value,
      render: (status, record) => {
        if (record.cancelledAt) {
          return <Tag color="red">Cancelled</Tag>;
        }
        return <Tag color={getStatusColor(status)}>{status}</Tag>;
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 50,
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
            disabled: !['Sent', 'Partial', 'Overdue'].includes(record.status)
          },
          {
            key: 'download-pdf',
            label: 'Download PDF',
            icon: <FilePdfOutlined />,
            onClick: async () => {
              try {
                message.loading({ content: 'Generating PDF...', key: 'pdf' });
                const response = await axios.get(`/finance/invoices/${record.id}/pdf`, {
                  responseType: 'blob'
                });
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `invoice_${record.invoiceNumber}.pdf`);
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
                message.success({ content: 'PDF downloaded successfully', key: 'pdf' });
              } catch (error) {
                message.error({ content: 'Failed to download PDF', key: 'pdf' });
              }
            }
          },
          { type: 'divider' },
          {
            key: 'markSent',
            label: 'Mark as Sent',
            onClick: () => handleMarkAsSent(record),
            disabled: record.status !== 'Draft'
          },
          {
            key: 'cancel',
            label: 'Cancel Invoice',
            danger: true,
            onClick: () => handleCancelInvoice(record),
            disabled: record.status !== 'Draft' || record.cancelledAt || parseAmount(record.paidAmount) > 0
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
        pagination={{
          showSizeChanger: true,
          showTotal: (total) => `Total ${total} invoices`
        }}
      />
    </Card>
  );
};

export default Invoices;
