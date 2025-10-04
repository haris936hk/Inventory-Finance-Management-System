import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Descriptions, Table, Button, Space, Tag, Row, Col,
  Statistic, Divider, Typography, message, Spin, Alert, Modal, Form,
  Select, DatePicker, InputNumber
} from 'antd';
import {
  ArrowLeftOutlined, EditOutlined, PrinterOutlined, ShopOutlined,
  CalendarOutlined, FileTextOutlined, DollarOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { useAuthStore } from '../../stores/authStore';
import { formatPKR } from '../../config/constants';
import PurchaseOrderItemSelector from '../../components/PurchaseOrderItemSelector';

const { Title, Text } = Typography;

const PurchaseOrderDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [selectedItems, setSelectedItems] = useState([]);
  const [subtotal, setSubtotal] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [total, setTotal] = useState(0);

  // Fetch purchase order details
  const { data: purchaseOrder, isLoading, error } = useQuery(
    ['purchase-order', id],
    async () => {
      const response = await axios.get(`/finance/purchase-orders/${id}`);
      return response.data.data;
    },
    {
      enabled: !!id
    }
  );

  // Fetch vendors for edit form
  const { data: vendors } = useQuery('vendors', async () => {
    const response = await axios.get('/inventory/vendors');
    return response.data.data;
  });

  // Update PO mutation
  const updateMutation = useMutation(
    (data) => axios.put(`/finance/purchase-orders/${id}`, data),
    {
      onSuccess: () => {
        message.success('Purchase Order updated successfully');
        queryClient.invalidateQueries(['purchase-order', id]);
        handleCloseModal();
      },
      onError: (error) => {
        console.error('PO update failed:', error);
        const errorMessage = error.response?.data?.message || error.message || 'An error occurred';
        message.error(errorMessage);
      }
    }
  );

  const handleCloseModal = () => {
    setModalVisible(false);
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

  const handleEdit = () => {
    if (!purchaseOrder) return;

    form.setFieldsValue({
      ...purchaseOrder,
      orderDate: purchaseOrder.orderDate ? dayjs(purchaseOrder.orderDate) : null,
      expectedDate: purchaseOrder.expectedDate ? dayjs(purchaseOrder.expectedDate) : null,
      taxRate: purchaseOrder.taxAmount && purchaseOrder.subtotal
        ? (Number(purchaseOrder.taxAmount) / Number(purchaseOrder.subtotal) * 100).toFixed(2)
        : 0
    });

    // Load existing line items
    if (purchaseOrder.lineItems && purchaseOrder.lineItems.length > 0) {
      const items = purchaseOrder.lineItems.map(item => ({
        productModelId: item.productModelId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
        specifications: item.specifications || {},
        notes: item.notes || '',
        productModel: item.productModel
      }));
      setSelectedItems(items);
      setSubtotal(Number(purchaseOrder.subtotal));
      setTaxAmount(Number(purchaseOrder.taxAmount));
      setTotal(Number(purchaseOrder.total));
    }

    setModalVisible(true);
  };

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
    updateMutation.mutate(processedValues);
  };

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading purchase order details...</div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <Alert
          message="Error Loading Purchase Order"
          description={error.response?.data?.message || "Failed to load purchase order details"}
          type="error"
          showIcon
          action={
            <Button size="small" onClick={() => window.location.reload()}>
              Retry
            </Button>
          }
        />
      </Card>
    );
  }

  if (!purchaseOrder) {
    return (
      <Card>
        <Alert
          message="Purchase Order Not Found"
          description="The requested purchase order could not be found."
          type="warning"
          showIcon
        />
      </Card>
    );
  }

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

  const lineItemColumns = [
    {
      title: 'Product Description',
      key: 'description',
      render: (_, record) => (
        <div>
          <Text strong>{record.description}</Text>
          <br />
          <Space size={4}>
            <Tag color="blue">{record.productModel?.category?.name}</Tag>
            <Tag color="green">{record.productModel?.company?.name}</Tag>
          </Space>
          {record.notes && (
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {record.notes}
              </Text>
            </div>
          )}
        </div>
      )
    },
    {
      title: 'Model',
      key: 'model',
      width: 150,
      render: (_, record) => record.productModel?.name || '-'
    },
    {
      title: 'Specifications',
      key: 'specifications',
      width: 150,
      render: (_, record) => {
        const specs = record.specifications;
        if (!specs || Object.keys(specs).length === 0) return '-';

        return (
          <div>
            {Object.entries(specs).slice(0, 2).map(([key, value]) => (
              <Tag key={key} size="small">
                {key}: {value}
              </Tag>
            ))}
            {Object.keys(specs).length > 2 && (
              <Tag size="small">+{Object.keys(specs).length - 2} more</Tag>
            )}
          </div>
        );
      }
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'center',
      render: (qty) => <Text strong>{qty}</Text>
    },
    {
      title: 'Unit Price',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 120,
      align: 'right',
      render: (price) => formatPKR(Number(price))
    },
    {
      title: 'Total Price',
      dataIndex: 'totalPrice',
      key: 'totalPrice',
      width: 120,
      align: 'right',
      render: (total) => (
        <Text strong style={{ color: '#1890ff' }}>
          {formatPKR(Number(total))}
        </Text>
      )
    }
  ];

  return (
    <>
      {/* Header */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/app/finance/purchase-orders')}
              style={{ marginBottom: 16 }}
            >
              Back to Purchase Orders
            </Button>
            <Title level={2} style={{ margin: 0 }}>
              Purchase Order: {purchaseOrder.poNumber}
            </Title>
            <Space style={{ marginTop: 8 }}>
              <Tag color={getStatusColor(purchaseOrder.status)} style={{ fontSize: '14px', padding: '4px 12px' }}>
                {purchaseOrder.status}
              </Tag>
              {purchaseOrder.status === 'Draft' && (
                <Text type="secondary">This purchase order is still in draft status</Text>
              )}
            </Space>
          </div>
          <Space>
            {hasPermission('finance.edit') && purchaseOrder.status === 'Draft' && (
              <Button icon={<EditOutlined />} onClick={handleEdit}>
                Edit
              </Button>
            )}
            <Button icon={<PrinterOutlined />} onClick={() => window.open(`/print/purchase-orders/${id}`, '_blank')}>
              Print
            </Button>
          </Space>
        </div>
      </Card>

      {/* Summary Statistics */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8} md={6}>
          <Card>
            <Statistic
              title="Subtotal"
              value={purchaseOrder.subtotal}
              prefix="PKR"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8} md={6}>
          <Card>
            <Statistic
              title="Tax Amount"
              value={purchaseOrder.taxAmount}
              prefix="PKR"
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8} md={6}>
          <Card>
            <Statistic
              title="Total Amount"
              value={purchaseOrder.total}
              prefix="PKR"
              valueStyle={{ color: '#52c41a', fontWeight: 'bold' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8} md={6}>
          <Card>
            <Statistic
              title="Line Items"
              value={purchaseOrder.lineItems?.length || 0}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Purchase Order Details */}
      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card title={
            <Space>
              <FileTextOutlined />
              Purchase Order Information
            </Space>
          }>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="PO Number">
                <Text strong>{purchaseOrder.poNumber}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={getStatusColor(purchaseOrder.status)}>{purchaseOrder.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Order Date">
                <Space>
                  <CalendarOutlined />
                  {new Date(purchaseOrder.orderDate).toLocaleDateString('en-GB')}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Expected Date">
                <Space>
                  <CalendarOutlined />
                  {purchaseOrder.expectedDate
                    ? new Date(purchaseOrder.expectedDate).toLocaleDateString('en-GB')
                    : 'Not specified'
                  }
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Created">
                {new Date(purchaseOrder.createdAt).toLocaleDateString('en-GB')} at{' '}
                {new Date(purchaseOrder.createdAt).toLocaleTimeString('en-GB')}
              </Descriptions.Item>
              <Descriptions.Item label="Last Updated">
                {new Date(purchaseOrder.updatedAt).toLocaleDateString('en-GB')} at{' '}
                {new Date(purchaseOrder.updatedAt).toLocaleTimeString('en-GB')}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title={
            <Space>
              <ShopOutlined />
              Vendor Information
            </Space>
          }>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Vendor Name">
                <Text strong>{purchaseOrder.vendor?.name}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Vendor Code">
                {purchaseOrder.vendor?.code}
              </Descriptions.Item>
              <Descriptions.Item label="Contact Person">
                {purchaseOrder.vendor?.contactPerson || 'Not specified'}
              </Descriptions.Item>
              <Descriptions.Item label="Phone">
                {purchaseOrder.vendor?.phone || 'Not specified'}
              </Descriptions.Item>
              <Descriptions.Item label="Email">
                {purchaseOrder.vendor?.email || 'Not specified'}
              </Descriptions.Item>
              <Descriptions.Item label="Address">
                {purchaseOrder.vendor?.address || 'Not specified'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <Divider />

      {/* Financial Summary */}
      <Card title={
        <Space>
          <DollarOutlined />
          Financial Summary
        </Space>
      } style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Subtotal">
                {formatPKR(Number(purchaseOrder.subtotal))}
              </Descriptions.Item>
              <Descriptions.Item label="Tax Amount">
                {formatPKR(Number(purchaseOrder.taxAmount))}
              </Descriptions.Item>
              <Descriptions.Item label="Total Amount">
                <Text strong style={{ fontSize: '16px', color: '#52c41a' }}>
                  {formatPKR(Number(purchaseOrder.total))}
                </Text>
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col xs={24} md={12}>
            {purchaseOrder.status === 'Completed' && (
              <Alert
                message="Purchase Order Completed"
                description="This purchase order has been completed and delivered."
                type="success"
                showIcon
              />
            )}
            {purchaseOrder.status === 'Cancelled' && (
              <Alert
                message="Purchase Order Cancelled"
                description="This purchase order has been cancelled."
                type="error"
                showIcon
              />
            )}
          </Col>
        </Row>
      </Card>

      {/* Line Items Table */}
      <Card title="Purchase Order Line Items">
        <Table
          columns={lineItemColumns}
          dataSource={purchaseOrder.lineItems || []}
          rowKey="id"
          pagination={false}
          scroll={{ x: 1000 }}
          locale={{
            emptyText: 'No line items found for this purchase order'
          }}
        />
        {(!purchaseOrder.lineItems || purchaseOrder.lineItems.length === 0) && (
          <Alert
            message="No Line Items"
            description="This purchase order doesn't have detailed line items. The amounts shown are summary totals."
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
      </Card>

      {/* Edit Modal */}
      <Modal
        title="Edit Purchase Order"
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
              <Button type="primary" htmlType="submit" loading={updateMutation.isLoading}>
                Update
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </>
  );
};

export default PurchaseOrderDetails;