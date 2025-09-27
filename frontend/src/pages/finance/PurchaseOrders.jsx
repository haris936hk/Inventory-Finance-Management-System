// ========== src/pages/finance/PurchaseOrders.jsx ==========
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, Button, Space, Tag, Input, Select, DatePicker,
  Row, Col, Statistic, Badge, Dropdown, message, Modal, Form,
  Divider, InputNumber
} from 'antd';
import {
  PlusOutlined, SearchOutlined, FilterOutlined, PrinterOutlined,
  EyeOutlined, EditOutlined, DeleteOutlined, ShopOutlined,
  MailOutlined, FilePdfOutlined, MoreOutlined, CheckOutlined,
  SendOutlined, StopOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import { useAuthStore } from '../../stores/authStore';
import PurchaseOrderItemSelector from '../../components/PurchaseOrderItemSelector';
import { formatPKR } from '../../config/constants';

const { RangePicker } = DatePicker;
const { Search } = Input;
const { TextArea } = Input;

const PurchaseOrders = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [filters, setFilters] = useState({});
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPO, setEditingPO] = useState(null);
  const [form] = Form.useForm();
  const [selectedItems, setSelectedItems] = useState([]);
  const [subtotal, setSubtotal] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [total, setTotal] = useState(0);

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
    if (!purchaseOrdersData) return { total: 0, draft: 0, sent: 0, completed: 0, cancelled: 0 };

    return purchaseOrdersData.reduce((acc, po) => {
      acc.total += parseFloat(po.total);
      switch (po.status) {
        case 'Draft':
          acc.draft += parseFloat(po.total);
          break;
        case 'Sent':
          acc.sent += parseFloat(po.total);
          break;
        case 'Completed':
          acc.completed += parseFloat(po.total);
          break;
        case 'Cancelled':
          acc.cancelled += parseFloat(po.total);
          break;
      }
      return acc;
    }, { total: 0, draft: 0, sent: 0, completed: 0, cancelled: 0 });
  }, [purchaseOrdersData]);

  // Create/Update PO mutation
  const poMutation = useMutation(
    (data) => {
      if (editingPO) {
        return axios.put(`/finance/purchase-orders/${editingPO.id}`, data);
      }
      return axios.post('/finance/purchase-orders', data);
    },
    {
      onSuccess: () => {
        message.success(`Purchase Order ${editingPO ? 'updated' : 'created'} successfully`);
        queryClient.invalidateQueries('purchase-orders');
        handleCloseModal();
      },
      onError: (error) => {
        console.error('PO operation failed:', error);
        const errorMessage = error.response?.data?.message || error.message || 'An error occurred';
        message.error(errorMessage);
      }
    }
  );

  // Update status mutation
  const updateStatusMutation = useMutation(
    ({ id, status }) => axios.put(`/finance/purchase-orders/${id}/status`, { status }),
    {
      onSuccess: () => {
        message.success('Purchase Order status updated');
        queryClient.invalidateQueries('purchase-orders');
      }
    }
  );

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingPO(null);
    setSelectedItems([]);
    setSubtotal(0);
    setTaxAmount(0);
    setTotal(0);
    form.resetFields();
  };

  const handleItemsChange = (newItems) => {
    setSelectedItems(newItems);
  };

  const handleSubtotalChange = (newSubtotal) => {
    setSubtotal(newSubtotal);
    calculateTotals(newSubtotal);
  };

  const calculateTotals = (currentSubtotal = subtotal) => {
    const taxRate = form.getFieldValue('taxRate') || 0;
    const tax = (currentSubtotal * taxRate) / 100;
    setTaxAmount(tax);
    setTotal(currentSubtotal + tax);
  };

  // Recalculate totals when tax rate changes
  React.useEffect(() => {
    calculateTotals();
  }, [form.getFieldValue('taxRate')]);

  const getStatusColor = (status) => {
    const colors = {
      'Draft': 'default',
      'Sent': 'blue',
      'Partial': 'orange',
      'Completed': 'green',
      'Cancelled': 'red'
    };
    return colors[status] || 'default';
  };

  const handleStatusChange = (record, newStatus) => {
    Modal.confirm({
      title: `Change Status to ${newStatus}`,
      content: `Are you sure you want to change this PO status to ${newStatus}?`,
      onOk: () => updateStatusMutation.mutate({ id: record.id, status: newStatus })
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
      case 'Sent':
        items.push({
          key: 'complete',
          icon: <CheckOutlined />,
          label: 'Mark Completed',
          onClick: () => handleStatusChange(record, 'Completed')
        });
        break;
    }

    if (['Draft', 'Sent'].includes(record.status)) {
      items.push({
        key: 'cancel',
        icon: <StopOutlined />,
        label: 'Cancel',
        danger: true,
        onClick: () => handleStatusChange(record, 'Cancelled')
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
      width: 140,
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
      width: 180,
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
      width: 120,
      render: (date) => new Date(date).toLocaleDateString('en-GB'),
    },
    {
      title: 'Expected Date',
      dataIndex: 'expectedDate',
      key: 'expectedDate',
      width: 120,
      render: (date) => date ? new Date(date).toLocaleDateString('en-GB') : '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => (
        <Tag color={getStatusColor(status)}>{status}</Tag>
      ),
    },
    {
      title: 'Subtotal',
      dataIndex: 'subtotal',
      key: 'subtotal',
      width: 120,
      align: 'right',
      render: (amount) => formatPKR(amount),
    },
    {
      title: 'Tax',
      dataIndex: 'taxAmount',
      key: 'taxAmount',
      width: 100,
      align: 'right',
      render: (amount) => formatPKR(amount),
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      width: 120,
      align: 'right',
      render: (amount) => (
        <span style={{ fontWeight: 'bold', color: '#1890ff' }}>
          {formatPKR(amount)}
        </span>
      ),
    },
    {
      title: 'Line Items',
      key: 'lineItemsCount',
      width: 80,
      align: 'center',
      render: (_, record) => (
        <Badge count={record._count?.lineItems || 0} showZero style={{ backgroundColor: '#52c41a' }} />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 120,
      render: (_, record) => {
        const statusActions = getStatusActions(record);
        const menuItems = [
          {
            key: 'view',
            icon: <EyeOutlined />,
            label: 'View Details',
            onClick: () => navigate(`/app/finance/purchase-orders/${record.id}`)
          },
          {
            key: 'edit',
            icon: <EditOutlined />,
            label: 'Edit',
            disabled: record.status === 'Completed',
            onClick: () => {
              setEditingPO(record);
              form.setFieldsValue({
                ...record,
                orderDate: record.orderDate ? dayjs(record.orderDate) : null,
                expectedDate: record.expectedDate ? dayjs(record.expectedDate) : null
              });
              setModalVisible(true);
            }
          },
          { type: 'divider' },
          ...statusActions,
          { type: 'divider' },
          {
            key: 'print',
            icon: <PrinterOutlined />,
            label: 'Print',
            onClick: () => message.info('Print functionality coming soon')
          }
        ];

        return (
          <Space>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/app/finance/purchase-orders/${record.id}`)}
            />
            <Dropdown menu={{ items: menuItems }} placement="bottomRight">
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  const handleFormSubmit = (values) => {
    if (selectedItems.length === 0) {
      message.error('Please add at least one product to the purchase order');
      return;
    }

    const processedValues = {
      ...values,
      orderDate: values.orderDate ? values.orderDate.toISOString() : new Date().toISOString(),
      expectedDate: values.expectedDate ? values.expectedDate.toISOString() : null,
      subtotal: subtotal,
      taxAmount: taxAmount,
      total: total,
      lineItems: selectedItems.map(item => ({
        productModelId: item.productModelId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        specifications: item.specifications,
        notes: item.notes
      }))
    };
    poMutation.mutate(processedValues);
  };

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
              title="Completed"
              value={statistics.completed}
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
              onClick={() => setModalVisible(true)}
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
              <Select.Option value="Completed">Completed</Select.Option>
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
          scroll={{ x: 1200 }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          }}
        />
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={editingPO ? 'Edit Purchase Order' : 'Create Purchase Order'}
        open={modalVisible}
        onCancel={handleCloseModal}
        footer={null}
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFormSubmit}
          initialValues={{
            orderDate: dayjs(),
            status: 'Draft',
            taxRate: 0
          }}
        >
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Vendor"
                name="vendorId"
                rules={[{ required: true, message: 'Please select a vendor' }]}
              >
                <Select placeholder="Select vendor" showSearch optionFilterProp="children">
                  {vendors?.map(vendor => (
                    <Select.Option key={vendor.id} value={vendor.id}>
                      {vendor.name} ({vendor.code})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Status"
                name="status"
                rules={[{ required: true, message: 'Please select status' }]}
              >
                <Select>
                  <Select.Option value="Draft">Draft</Select.Option>
                  <Select.Option value="Sent">Sent</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Order Date"
                name="orderDate"
                rules={[{ required: true, message: 'Please select order date' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Expected Date" name="expectedDate">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <div style={{ margin: '16px 0' }}>
            <PurchaseOrderItemSelector
              selectedItems={selectedItems}
              onItemsChange={handleItemsChange}
              onTotalChange={handleSubtotalChange}
            />
          </div>

          <Divider />

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Tax Rate (%)"
                name="taxRate"
                initialValue={0}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  precision={2}
                  min={0}
                  max={100}
                  placeholder="0.00"
                  onChange={() => {
                    setTimeout(() => calculateTotals(), 0);
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <div style={{ marginTop: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span>Subtotal:</span>
                  <span style={{ fontWeight: 'bold' }}>{formatPKR(subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span>Tax:</span>
                  <span>{formatPKR(taxAmount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 'bold', color: '#1890ff' }}>
                  <span>Total:</span>
                  <span>{formatPKR(total)}</span>
                </div>
              </div>
            </Col>
          </Row>

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={handleCloseModal}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={poMutation.isLoading}>
                {editingPO ? 'Update' : 'Create'}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </>
  );
};

export default PurchaseOrders;