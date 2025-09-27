import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Descriptions, Table, Button, Space, Tag, Row, Col,
  Statistic, Divider, Typography, message, Spin, Alert, Progress
} from 'antd';
import {
  ArrowLeftOutlined, EditOutlined, PrinterOutlined, ShopOutlined,
  CalendarOutlined, FileTextOutlined, DollarOutlined, ExclamationCircleOutlined,
  DollarCircleOutlined, ReconciliationOutlined, ClockCircleOutlined
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import axios from 'axios';
import { useAuthStore } from '../../stores/authStore';
import { formatPKR } from '../../config/constants';

const { Title, Text } = Typography;

const VendorBillDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();

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
              <Button icon={<EditOutlined />}>
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
    </>
  );
};

export default VendorBillDetails;