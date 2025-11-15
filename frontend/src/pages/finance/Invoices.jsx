// ========== src/pages/finance/Invoices.jsx ==========
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, Button, Space, Tag, Input, Select, DatePicker,
  Row, Col, Statistic, Badge, Dropdown, message, Modal
} from 'antd';
const { TextArea } = Input;
import {
  PlusOutlined, SearchOutlined, FilterOutlined,
  EyeOutlined, EditOutlined, DeleteOutlined, DollarOutlined,
  FilePdfOutlined, MoreOutlined
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Fetch invoices
  const { data: response, isLoading } = useQuery(
    ['invoices', filters, page, pageSize],
    async () => {
      const response = await axios.get('/finance/invoices', {
        params: { ...filters, page, limit: pageSize }
      });
      return response.data.data;
    }
  );

  const invoicesData = response?.invoices || [];
  const pagination = response?.pagination || { page: 1, limit: 50, totalCount: 0, totalPages: 0 };
  const backendStatistics = response?.statistics || {};

  // Fetch customers
  const { data: customersResponse } = useQuery('customers', async () => {
    const response = await axios.get('/finance/customers', { params: { limit: 1000 } });
    return response.data.data;
  });
  const customers = customersResponse?.customers || [];

  // Simple statistics calculation
  const paid = backendStatistics.byStatus?.Paid?.total || 0;
  const overdue = (backendStatistics.byStatus?.Overdue?.total || 0) -
                  (backendStatistics.byStatus?.Overdue?.paid || 0);
  const partial = (backendStatistics.byStatus?.Partial?.total || 0) -
                  (backendStatistics.byStatus?.Partial?.paid || 0);
  const sent = (backendStatistics.byStatus?.Sent?.total || 0) -
               (backendStatistics.byStatus?.Sent?.paid || 0);
  const draft = (backendStatistics.byStatus?.Draft?.total || 0) -
                (backendStatistics.byStatus?.Draft?.paid || 0);

  const statistics = {
    total: backendStatistics.totalAmount || 0,
    paid: paid,
    pending: partial + sent + draft,
    overdue: overdue
  };

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
    ({ id, reason }) => axios.post(`/finance/invoices/${id}/cancel`, { reason }),
    {
      onSuccess: () => {
        message.success('Invoice cancelled successfully');
        queryClient.invalidateQueries('invoices');
        queryClient.invalidateQueries('customers');
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Failed to cancel invoice');
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

  const handleCancelInvoice = (record) => {
    let reason = '';
    Modal.confirm({
      title: 'Cancel Invoice',
      content: (
        <div>
          <p>Are you sure you want to cancel invoice <strong>{record.invoiceNumber}</strong>?</p>
          <p style={{ color: '#ff4d4f', marginTop: 12 }}>
            ⚠️ Only Draft invoices can be cancelled. This action cannot be undone.
          </p>
          <TextArea
            placeholder="Enter cancellation reason (required)"
            rows={3}
            onChange={(e) => { reason = e.target.value; }}
            style={{ marginTop: 12 }}
          />
        </div>
      ),
      onOk: () => {
        if (!reason || reason.trim() === '') {
          message.error('Please provide a cancellation reason');
          return Promise.reject();
        }
        return cancelInvoiceMutation.mutateAsync({ id: record.id, reason: reason.trim() });
      },
      okText: 'Cancel Invoice',
      okButtonProps: { danger: true }
    });
  };

  const columns = [
    {
      title: 'Invoice #',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
      fixed: 'left',
      width: 120,
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
      render: (amount, record) => (
        <span style={{
          color: record.cancelledAt ? '#999' : 'inherit',
          textDecoration: record.cancelledAt ? 'line-through' : 'none'
        }}>
          {formatPKR(parseFloat(amount))}
        </span>
      ),
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
            {formatPKR(balance)}
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
            onClick: () => updateStatusMutation.mutate({ id: record.id, status: 'Sent' }),
            disabled: record.status !== 'Draft'
          },
          {
            key: 'cancel',
            label: 'Cancel Invoice',
            danger: true,
            onClick: () => handleCancelInvoice(record),
            disabled: record.status !== 'Draft' || record.cancelledAt || parseFloat(record.paidAmount || 0) > 0
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
          current: page,
          pageSize: pageSize,
          total: pagination.totalCount,
          showSizeChanger: true,
          showTotal: (total) => `Total ${total} invoices`,
          onChange: (newPage, newPageSize) => {
            setPage(newPage);
            setPageSize(newPageSize);
          },
          pageSizeOptions: ['10', '25', '50', '100']
        }}
      />
    </Card>
  );
};

export default Invoices;
