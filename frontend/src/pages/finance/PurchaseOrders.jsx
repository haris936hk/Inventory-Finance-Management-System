// ========== src/pages/finance/PurchaseOrders.jsx ==========
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, Button, Space, Tag, Input, Select, DatePicker,
  Row, Col, Statistic, Badge, Dropdown, message, Modal, Alert
} from 'antd';
import {
  PlusOutlined, SearchOutlined, FilterOutlined,
  EyeOutlined, ShopOutlined,
  FilePdfOutlined, MoreOutlined, CheckOutlined,
  SendOutlined, StopOutlined, FileTextOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import { useAuthStore } from '../../stores/authStore';
import { formatPKR } from '../../config/constants';
import { parseAmount, addAmounts } from '../../utils/decimalUtils';
import { getErrorMessage } from '../../utils/errorMessages';

const { RangePicker } = DatePicker;
const { Search } = Input;

const PurchaseOrders = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [filters, setFilters] = useState({});

  // Fetch purchase orders
  const { data: purchaseOrdersData, isLoading } = useQuery(
    ['purchase-orders', filters],
    async () => {
      const response = await axios.get('/finance/purchase-orders', { params: filters });
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
    if (!purchaseOrdersData) return { total: 0, draft: 0, sent: 0, paid: 0, delivered: 0, cancelled: 0 };

    return purchaseOrdersData.reduce((acc, po) => {
      const poTotal = parseAmount(po.total);

      // CRITICAL: Only include non-cancelled POs in total value
      if (po.status !== 'Cancelled') {
        acc.total = addAmounts(acc.total, poTotal);
      }

      switch (po.status) {
        case 'Draft':
          acc.draft = addAmounts(acc.draft, poTotal);
          break;
        case 'Sent':
        case 'Partial':
          acc.sent = addAmounts(acc.sent, poTotal);
          break;
        case 'Paid':
          acc.paid = addAmounts(acc.paid, poTotal);
          break;
        case 'Delivered':
          acc.delivered = addAmounts(acc.delivered, poTotal);
          break;
        case 'Cancelled':
          acc.cancelled = addAmounts(acc.cancelled, poTotal);
          break;
      }
      return acc;
    }, { total: 0, draft: 0, sent: 0, paid: 0, delivered: 0, cancelled: 0 });
  }, [purchaseOrdersData]);

  // Update status mutation
  const updateStatusMutation = useMutation(
    ({ id, status }) => axios.put(`/finance/purchase-orders/${id}/status`, { status }),
    {
      onSuccess: () => {
        message.success('Purchase Order status updated');
        queryClient.invalidateQueries('purchase-orders');
        queryClient.invalidateQueries('purchase-order'); // Invalidate detail queries too
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Failed to update status');
      }
    }
  );

  // Cancel PO mutation
  const cancelPOMutation = useMutation(
    (id) => axios.post(`/finance/purchase-orders/${id}/cancel`),
    {
      onSuccess: () => {
        message.success('Purchase Order cancelled successfully');
        queryClient.invalidateQueries('purchase-orders');
        queryClient.invalidateQueries('purchase-order'); // Invalidate detail queries too
        queryClient.invalidateQueries('vendors'); // Invalidate vendors if needed
      },
      onError: (error) => {
        const errorMessage = getErrorMessage(error, 'purchase order', 'cancel');
        message.error(errorMessage);
      }
    }
  );

  const getStatusColor = (status) => {
    const colors = {
      'Draft': 'default',
      'Sent': 'blue',
      'Partial': 'orange',
      'Paid': 'cyan',
      'Delivered': 'green',
      'Cancelled': 'red'
    };
    return colors[status] || 'default';
  };

  const handleStatusChange = (record, newStatus) => {
    Modal.confirm({
      title: `Change Status to ${newStatus}`,
      content: (
        <div>
          <p>Are you sure you want to change this PO status to <strong>{newStatus}</strong>?</p>
          {newStatus === 'Sent' && (
            <Alert
              message="Important: Once sent, this purchase order cannot be cancelled"
              description="Purchase orders can only be cancelled while in Draft status. After sending to vendor, cancellation will no longer be possible."
              type="warning"
              showIcon
              style={{ marginTop: 12 }}
            />
          )}
        </div>
      ),
      onOk: () => updateStatusMutation.mutate({ id: record.id, status: newStatus })
    });
  };

  const handleCancelPO = (record) => {
    Modal.confirm({
      title: 'Cancel Purchase Order',
      content: (
        <div>
          <p>Are you sure you want to cancel purchase order <strong>{record.poNumber}</strong>?</p>
          <p style={{ color: '#ff4d4f', marginTop: 12 }}>
            This will reverse all amounts and mark the purchase order as cancelled. This action cannot be undone.
          </p>
        </div>
      ),
      onOk: () => cancelPOMutation.mutateAsync(record.id),
      okText: 'Yes, Cancel Purchase Order',
      okButtonProps: { danger: true },
      cancelText: 'No, Keep It'
    });
  };

  const getStatusActions = (record) => {
    const items = [];

    switch (record.status) {
      case 'Draft':
        items.push({
          key: 'send',
          icon: <SendOutlined />,
          label: 'Send to Vendor',
          onClick: () => handleStatusChange(record, 'Sent')
        });
        break;
      case 'Paid':
        items.push({
          key: 'deliver',
          icon: <CheckOutlined />,
          label: 'Mark as Delivered',
          onClick: () => handleStatusChange(record, 'Delivered')
        });
        break;
    }

    // BUSINESS RULE: Only Draft POs can be cancelled
    if (record.status === 'Draft') {
      items.push({
        key: 'cancel',
        icon: <StopOutlined />,
        label: 'Cancel',
        danger: true,
        onClick: () => handleCancelPO(record)
      });
    }

    return items;
  };

  const columns = [
    {
      title: 'PO Number',
      dataIndex: 'poNumber',
      key: 'poNumber',
      fixed: 'left',
      width: 110,
      render: (text, record) => (
        <Button
          type="link"
          onClick={() => navigate(`/app/finance/purchase-orders/${record.id}`)}
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
      width: 90,
      render: (vendor) => (
        <Space>
          <ShopOutlined />
          <span>{vendor?.name}</span>
        </Space>
      ),
    },
    {
      title: 'Order Date',
      dataIndex: 'orderDate',
      key: 'orderDate',
      width: 70,
      render: (date) => new Date(date).toLocaleDateString('en-GB'),
    },
    {
      title: 'Expected',
      dataIndex: 'expectedDate',
      key: 'expectedDate',
      width: 70,
      render: (date) => date ? new Date(date).toLocaleDateString('en-GB') : '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 60,
      render: (status) => (
        <Tag color={getStatusColor(status)}>{status}</Tag>
      ),
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      width: 80,
      align: 'right',
      render: (amount) => (
        <span style={{ fontWeight: 'bold', color: '#1890ff' }}>
          {formatPKR(amount)}
        </span>
      ),
    },
    {
      title: 'Items',
      key: 'lineItemsCount',
      width: 35,
      align: 'center',
      render: (_, record) => (
        <Badge count={record._count?.lineItems || 0} showZero style={{ backgroundColor: '#52c41a' }} />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 50,
      render: (_, record) => {
        const statusActions = getStatusActions(record);
        const menuItems = [
          ...statusActions,
          {
            key: 'create-bill',
            icon: <FileTextOutlined />,
            label: 'Create Bill',
            onClick: () => navigate(`/app/finance/vendor-bills/create?purchaseOrderId=${record.id}`),
            disabled: !['Sent', 'Partial', 'Paid'].includes(record.status) || !hasPermission('finance.create')
          },
          {
            key: 'download-pdf',
            icon: <FilePdfOutlined />,
            label: 'Download PDF',
            onClick: async () => {
              try {
                message.loading({ content: 'Generating PDF...', key: 'pdf' });
                const response = await axios.get(`/finance/purchase-orders/${record.id}/pdf`, {
                  responseType: 'blob'
                });
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `purchase_order_${record.poNumber}.pdf`);
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
                message.success({ content: 'PDF downloaded successfully', key: 'pdf' });
              } catch (error) {
                message.error({ content: 'Failed to download PDF', key: 'pdf' });
              }
            }
          }
        ];

        return (
          <Space>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/app/finance/purchase-orders/${record.id}`)}
            />
            {menuItems.length > 0 && (
              <Dropdown menu={{ items: menuItems }} placement="bottomRight">
                <Button size="small" icon={<MoreOutlined />} />
              </Dropdown>
            )}
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
              title="Total Value"
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
              title="Draft"
              value={statistics.draft}
              prefix="PKR"
              precision={0}
              valueStyle={{ color: '#8c8c8c' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Sent"
              value={statistics.sent}
              prefix="PKR"
              precision={0}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Paid"
              value={statistics.paid}
              prefix="PKR"
              precision={0}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Delivered"
              value={statistics.delivered}
              prefix="PKR"
              precision={0}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Table Card */}
      <Card
        title={
          <Space>
            <ShopOutlined />
            Purchase Orders
          </Space>
        }
        extra={
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/app/finance/purchase-orders/create')}
              disabled={!hasPermission('finance.create')}
            >
              New Purchase Order
            </Button>
          </Space>
        }
      >
        {/* Filters */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={8} md={6}>
            <Search
              placeholder="Search PO number..."
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
              <Select.Option value="Draft">Draft</Select.Option>
              <Select.Option value="Sent">Sent</Select.Option>
              <Select.Option value="Partial">Partial</Select.Option>
              <Select.Option value="Paid">Paid</Select.Option>
              <Select.Option value="Delivered">Delivered</Select.Option>
              <Select.Option value="Cancelled">Cancelled</Select.Option>
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
          dataSource={purchaseOrdersData}
          loading={isLoading}
          scroll={{ x: 900 }}
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

export default PurchaseOrders;