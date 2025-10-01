import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Descriptions, Table, Button, Space, Tag, Row, Col,
  Statistic, Divider, Typography, message, Spin, Alert, Progress,
  Modal, Form, Select, DatePicker, InputNumber
} from 'antd';
import {
  ArrowLeftOutlined, EditOutlined, PrinterOutlined, ShopOutlined,
  CalendarOutlined, FileTextOutlined, DollarOutlined, ExclamationCircleOutlined,
  DollarCircleOutlined, ReconciliationOutlined, ClockCircleOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { useAuthStore } from '../../stores/authStore';
import { formatPKR } from '../../config/constants';

const { Title, Text } = Typography;

const VendorBillDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState(null);
  const [selectedVendorId, setSelectedVendorId] = useState(null);
  const [form] = Form.useForm();

  // Fetch vendor bill details
  const { data: vendorBill, isLoading, error } = useQuery(
    ['vendor-bill', id],
    async () => {
      const response = await axios.get(`/finance/vendor-bills/${id}`);
      return response.data.data;
    },
    {
      enabled: !!id
    }
  );

  // Fetch payments for this bill
  const { data: payments } = useQuery(
    ['vendor-bill-payments', id],
    async () => {
      const response = await axios.get('/finance/vendor-payments', {
        params: { billId: id }
      });
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

  // Fetch purchase orders for form
  const { data: purchaseOrders } = useQuery('purchase-orders', async () => {
    const response = await axios.get('/finance/purchase-orders', {
      params: {
        status: 'Completed',
        include: 'lineItems'
      }
    });
    return response.data.data;
  });

  // Update Bill mutation
  const updateMutation = useMutation(
    (data) => axios.put(`/finance/vendor-bills/${id}`, data),
    {
      onSuccess: () => {
        message.success('Vendor Bill updated successfully');
        queryClient.invalidateQueries(['vendor-bill', id]);
        handleCloseModal();
      },
      onError: (error) => {
        console.error('Bill update failed:', error);
        const errorMessage = error.response?.data?.message || error.message || 'An error occurred';
        message.error(errorMessage);
      }
    }
  );

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedPurchaseOrder(null);
    setSelectedVendorId(null);
    form.resetFields();
  };

  const handleVendorChange = (vendorId) => {
    setSelectedVendorId(vendorId);
    setSelectedPurchaseOrder(null);
    form.setFieldsValue({
      purchaseOrderId: null,
      subtotal: null,
      taxAmount: null
    });
  };

  const handlePurchaseOrderChange = (poId) => {
    if (!poId) {
      setSelectedPurchaseOrder(null);
      form.setFieldsValue({
        subtotal: null,
        taxAmount: null
      });
      return;
    }

    const selectedPO = purchaseOrders?.find(po => po.id === poId);
    if (selectedPO) {
      setSelectedPurchaseOrder(selectedPO);
      form.setFieldsValue({
        subtotal: parseFloat(selectedPO.subtotal || 0),
        taxAmount: parseFloat(selectedPO.taxAmount || 0)
      });
      message.success(`Populated bill amounts from PO ${selectedPO.poNumber}`);
    }
  };

  const filteredPurchaseOrders = React.useMemo(() => {
    if (!selectedVendorId || !purchaseOrders) return [];
    return purchaseOrders.filter(po => po.vendorId === selectedVendorId);
  }, [selectedVendorId, purchaseOrders]);

  const handleEdit = () => {
    if (!vendorBill) return;

    setSelectedVendorId(vendorBill.vendorId);
    form.setFieldsValue({
      ...vendorBill,
      billDate: vendorBill.billDate ? dayjs(vendorBill.billDate) : null,
      dueDate: vendorBill.dueDate ? dayjs(vendorBill.dueDate) : null
    });

    setModalVisible(true);
  };

  const handleFormSubmit = (values) => {
    const processedValues = {
      ...values,
      billDate: values.billDate ? values.billDate.toISOString() : new Date().toISOString(),
      dueDate: values.dueDate ? values.dueDate.toISOString() : null,
      subtotal: parseFloat(values.subtotal) || 0,
      taxAmount: parseFloat(values.taxAmount) || 0,
      total: (parseFloat(values.subtotal) || 0) + (parseFloat(values.taxAmount) || 0)
    };
    updateMutation.mutate(processedValues);
  };

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading vendor bill details...</div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <Alert
          message="Error Loading Vendor Bill"
          description={error.response?.data?.message || "Failed to load vendor bill details"}
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

  if (!vendorBill) {
    return (
      <Card>
        <Alert
          message="Vendor Bill Not Found"
          description="The requested vendor bill could not be found."
          type="warning"
          showIcon
        />
      </Card>
    );
  }

  const getStatusColor = (status) => {
    const colors = {
      'Unpaid': 'red',
      'Partial': 'orange',
      'Paid': 'green'
    };
    return colors[status] || 'default';
  };

  const isOverdue = (bill) => {
    if (!bill.dueDate || bill.status === 'Paid') return false;
    return new Date(bill.dueDate) < new Date();
  };

  const getPaymentProgress = () => {
    const total = parseFloat(vendorBill.total);
    const paid = parseFloat(vendorBill.paidAmount) || 0;
    return Math.round((paid / total) * 100);
  };

  const getRemainingAmount = () => {
    const total = parseFloat(vendorBill.total);
    const paid = parseFloat(vendorBill.paidAmount) || 0;
    return total - paid;
  };

  const paymentColumns = [
    {
      title: 'Payment #',
      dataIndex: 'paymentNumber',
      key: 'paymentNumber',
      render: (text) => <Text strong>{text}</Text>
    },
    {
      title: 'Date',
      dataIndex: 'paymentDate',
      key: 'paymentDate',
      render: (date) => new Date(date).toLocaleDateString('en-GB')
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (amount) => (
        <Text strong style={{ color: '#52c41a' }}>
          {formatPKR(amount)}
        </Text>
      )
    },
    {
      title: 'Method',
      dataIndex: 'method',
      key: 'method',
      render: (method) => <Tag>{method}</Tag>
    },
    {
      title: 'Reference',
      dataIndex: 'reference',
      key: 'reference',
      render: (ref) => ref || '-'
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
              onClick={() => navigate('/app/finance/vendor-bills')}
              style={{ marginBottom: 16 }}
            >
              Back to Vendor Bills
            </Button>
            <Title level={2} style={{ margin: 0 }}>
              Vendor Bill: {vendorBill.billNumber}
            </Title>
            <Space style={{ marginTop: 8 }}>
              <Tag color={getStatusColor(vendorBill.status)} style={{ fontSize: '14px', padding: '4px 12px' }}>
                {vendorBill.status}
              </Tag>
              {isOverdue(vendorBill) && (
                <Tag color="red" icon={<ExclamationCircleOutlined />}>
                  OVERDUE
                </Tag>
              )}
            </Space>
          </div>
          <Space>
            {hasPermission('finance.edit') && vendorBill.status !== 'Paid' && (
              <Button icon={<EditOutlined />} onClick={handleEdit}>
                Edit
              </Button>
            )}
            {hasPermission('finance.create') && vendorBill.status !== 'Paid' && (
              <Button
                type="primary"
                icon={<DollarCircleOutlined />}
                onClick={() => navigate(`/app/finance/vendor-payments/record?billId=${vendorBill.id}`)}
              >
                Record Payment
              </Button>
            )}
            <Button icon={<PrinterOutlined />} onClick={() => message.info('Print functionality coming soon')}>
              Print
            </Button>
          </Space>
        </div>
      </Card>

      {/* Payment Progress */}
      {vendorBill.status !== 'Paid' && (
        <Card style={{ marginBottom: 16 }}>
          <Row align="middle">
            <Col flex="auto">
              <div style={{ marginRight: 16 }}>
                <Text strong>Payment Progress</Text>
                <Progress
                  percent={getPaymentProgress()}
                  status={vendorBill.status === 'Paid' ? 'success' : 'active'}
                  strokeColor={vendorBill.status === 'Paid' ? '#52c41a' : '#1890ff'}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text type="secondary">
                    Paid: {formatPKR(vendorBill.paidAmount || 0)}
                  </Text>
                  <Text type="secondary">
                    Total: {formatPKR(vendorBill.total)}
                  </Text>
                </div>
              </div>
            </Col>
            {getRemainingAmount() > 0 && (
              <Col>
                <Statistic
                  title="Remaining"
                  value={getRemainingAmount()}
                  prefix="PKR"
                  valueStyle={{ color: isOverdue(vendorBill) ? '#ff4d4f' : '#fa8c16' }}
                />
              </Col>
            )}
          </Row>
        </Card>
      )}

      {/* Summary Statistics */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8} md={6}>
          <Card>
            <Statistic
              title="Subtotal"
              value={vendorBill.subtotal}
              prefix="PKR"
              precision={2}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8} md={6}>
          <Card>
            <Statistic
              title="Tax Amount"
              value={vendorBill.taxAmount}
              prefix="PKR"
              precision={2}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8} md={6}>
          <Card>
            <Statistic
              title="Total Amount"
              value={vendorBill.total}
              prefix="PKR"
              precision={2}
              valueStyle={{ color: '#52c41a', fontWeight: 'bold' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8} md={6}>
          <Card>
            <Statistic
              title="Payments"
              value={payments?.length || 0}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Bill Details */}
      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card title={
            <Space>
              <FileTextOutlined />
              Bill Information
            </Space>
          }>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Bill Number">
                <Text strong>{vendorBill.billNumber}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Space>
                  <Tag color={getStatusColor(vendorBill.status)}>{vendorBill.status}</Tag>
                  {isOverdue(vendorBill) && <Tag color="red" size="small">OVERDUE</Tag>}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Bill Date">
                <Space>
                  <CalendarOutlined />
                  {new Date(vendorBill.billDate).toLocaleDateString('en-GB')}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Due Date">
                <Space>
                  <CalendarOutlined />
                  <span style={{ color: isOverdue(vendorBill) ? '#ff4d4f' : 'inherit' }}>
                    {vendorBill.dueDate
                      ? new Date(vendorBill.dueDate).toLocaleDateString('en-GB')
                      : 'Not specified'
                    }
                  </span>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Purchase Order">
                {vendorBill.purchaseOrder ? (
                  <Button
                    type="link"
                    size="small"
                    icon={<ReconciliationOutlined />}
                    onClick={() => navigate(`/app/finance/purchase-orders/${vendorBill.purchaseOrder.id}`)}
                    style={{ padding: 0 }}
                  >
                    {vendorBill.purchaseOrder.poNumber}
                  </Button>
                ) : (
                  <Text type="secondary">Not linked to PO</Text>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Created">
                {new Date(vendorBill.createdAt).toLocaleDateString('en-GB')} at{' '}
                {new Date(vendorBill.createdAt).toLocaleTimeString('en-GB')}
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
                <Text strong>{vendorBill.vendor?.name}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Vendor Code">
                {vendorBill.vendor?.code}
              </Descriptions.Item>
              <Descriptions.Item label="Contact Person">
                {vendorBill.vendor?.contactPerson || 'Not specified'}
              </Descriptions.Item>
              <Descriptions.Item label="Phone">
                {vendorBill.vendor?.phone || 'Not specified'}
              </Descriptions.Item>
              <Descriptions.Item label="Email">
                {vendorBill.vendor?.email || 'Not specified'}
              </Descriptions.Item>
              <Descriptions.Item label="Address">
                {vendorBill.vendor?.address || 'Not specified'}
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
                {formatPKR(vendorBill.subtotal)}
              </Descriptions.Item>
              <Descriptions.Item label="Tax Amount">
                {formatPKR(vendorBill.taxAmount)}
              </Descriptions.Item>
              <Descriptions.Item label="Total Amount">
                <Text strong style={{ fontSize: '16px', color: '#52c41a' }}>
                  {formatPKR(vendorBill.total)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Amount Paid">
                <Text strong style={{ color: '#1890ff' }}>
                  {formatPKR(vendorBill.paidAmount || 0)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Balance Due">
                <Text strong style={{ color: getRemainingAmount() > 0 ? '#fa8c16' : '#52c41a' }}>
                  {formatPKR(getRemainingAmount())}
                </Text>
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col xs={24} md={12}>
            {vendorBill.status === 'Paid' && (
              <Alert
                message="Bill Fully Paid"
                description="This vendor bill has been fully paid."
                type="success"
                showIcon
              />
            )}
            {vendorBill.status === 'Partial' && (
              <Alert
                message="Partial Payment"
                description={`${formatPKR(getRemainingAmount())} remaining to be paid.`}
                type="warning"
                showIcon
              />
            )}
            {isOverdue(vendorBill) && (
              <Alert
                message="Overdue Bill"
                description={`This bill was due on ${new Date(vendorBill.dueDate).toLocaleDateString('en-GB')}.`}
                type="error"
                showIcon
                style={{ marginTop: vendorBill.status !== 'Unpaid' ? 16 : 0 }}
              />
            )}
          </Col>
        </Row>
      </Card>

      {/* Payment History */}
      <Card title={
        <Space>
          <ClockCircleOutlined />
          Payment History
        </Space>
      }>
        <Table
          columns={paymentColumns}
          dataSource={payments || []}
          rowKey="id"
          pagination={false}
          locale={{
            emptyText: 'No payments recorded for this bill'
          }}
        />
        {(!payments || payments.length === 0) && (
          <Alert
            message="No Payments"
            description="No payments have been recorded for this vendor bill yet."
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
      </Card>

      {/* Edit Modal */}
      <Modal
        title="Edit Vendor Bill"
        open={modalVisible}
        onCancel={handleCloseModal}
        footer={null}
        width={900}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFormSubmit}
          initialValues={{
            billDate: dayjs(),
            status: 'Unpaid',
            taxAmount: 0
          }}
        >
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Vendor"
                name="vendorId"
                rules={[{ required: true, message: 'Please select a vendor' }]}
              >
                <Select
                  placeholder="Select vendor first"
                  showSearch
                  optionFilterProp="children"
                  onChange={handleVendorChange}
                >
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
                label="Purchase Order (Optional)"
                name="purchaseOrderId"
              >
                <Select
                  placeholder={
                    !selectedVendorId
                      ? "Select vendor first"
                      : filteredPurchaseOrders.length === 0
                      ? "No POs available for this vendor"
                      : "Select PO to auto-populate amounts"
                  }
                  allowClear
                  showSearch
                  optionFilterProp="children"
                  onChange={handlePurchaseOrderChange}
                  disabled={!selectedVendorId || filteredPurchaseOrders.length === 0}
                  notFoundContent={
                    !selectedVendorId
                      ? "Please select a vendor first"
                      : "No purchase orders found for this vendor"
                  }
                >
                  {filteredPurchaseOrders.map(po => (
                    <Select.Option key={po.id} value={po.id}>
                      {po.poNumber} ({formatPKR(Number(po.total || 0))})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Bill Date"
                name="billDate"
                rules={[{ required: true, message: 'Please select bill date' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Due Date" name="dueDate">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          {/* Informational Alert */}
          <Alert
            message="Smart Bill Editing"
            description="You can change the vendor or link a different Purchase Order to automatically update amounts. Adjust the amounts manually if needed."
            type="info"
            icon={<InfoCircleOutlined />}
            style={{ marginBottom: 16 }}
            showIcon
          />

          <Divider />

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Subtotal (PKR)"
                name="subtotal"
                rules={[
                  { required: true, message: 'Please enter subtotal' },
                  { type: 'number', min: 0, message: 'Amount must be positive' }
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  precision={2}
                  min={0}
                  placeholder="0.00"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Tax Amount (PKR)"
                name="taxAmount"
                rules={[{ type: 'number', min: 0, message: 'Amount must be positive' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  precision={2}
                  min={0}
                  placeholder="0.00"
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Purchase Order Line Items Preview */}
          {selectedPurchaseOrder && (
            <>
              <Divider />
              <Card
                size="small"
                title={`Purchase Order ${selectedPurchaseOrder.poNumber} - Line Items`}
                style={{ backgroundColor: '#f9f9f9' }}
              >
                <Table
                  size="small"
                  dataSource={selectedPurchaseOrder.lineItems || []}
                  pagination={false}
                  rowKey="id"
                  columns={[
                    {
                      title: 'Description',
                      dataIndex: 'description',
                      key: 'description'
                    },
                    {
                      title: 'Quantity',
                      dataIndex: 'quantity',
                      key: 'quantity',
                      align: 'center',
                      width: 80
                    },
                    {
                      title: 'Unit Price',
                      dataIndex: 'unitPrice',
                      key: 'unitPrice',
                      align: 'right',
                      width: 100,
                      render: (price) => formatPKR(Number(price))
                    },
                    {
                      title: 'Total',
                      dataIndex: 'totalPrice',
                      key: 'totalPrice',
                      align: 'right',
                      width: 100,
                      render: (total) => (
                        <span style={{ fontWeight: 'bold' }}>
                          {formatPKR(Number(total))}
                        </span>
                      )
                    }
                  ]}
                  summary={() => (
                    <Table.Summary>
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={3}>
                          <span style={{ fontWeight: 'bold' }}>Total</span>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3}>
                          <span style={{ fontWeight: 'bold', color: '#1890ff' }}>
                            {formatPKR(Number(selectedPurchaseOrder.total || 0))}
                          </span>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  )}
                />
              </Card>
            </>
          )}

          <div style={{ textAlign: 'right', marginTop: 16 }}>
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

export default VendorBillDetails;