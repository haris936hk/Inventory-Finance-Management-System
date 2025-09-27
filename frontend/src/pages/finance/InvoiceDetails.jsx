// ========== src/pages/finance/InvoiceDetails.jsx ==========
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Row, Col, Descriptions, Tag, Button, Space, Table, Typography,
  Divider, Statistic, Alert, Modal, message, Tabs, Timeline
} from 'antd';
import {
  ArrowLeftOutlined, EditOutlined, DeleteOutlined, PrinterOutlined,
  FilePdfOutlined, MailOutlined, DollarOutlined, CreditCardOutlined,
  CalendarOutlined, UserOutlined, PhoneOutlined, EnvironmentOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { useAuthStore } from '../../stores/authStore';
import { formatPKR } from '../../config/constants';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const InvoiceDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();

  // Fetch invoice details
  const { data: invoice, isLoading, error } = useQuery(
    ['invoice', id],
    async () => {
      const response = await axios.get(`/finance/invoices/${id}`);
      return response.data.data;
    }
  );

  // Fetch payment history for this invoice
  const { data: payments } = useQuery(
    ['invoice-payments', id],
    async () => {
      const response = await axios.get(`/finance/payments?invoiceId=${id}`);
      return response.data.data?.payments || [];
    },
    { enabled: !!id }
  );

  // Delete mutation
  const deleteMutation = useMutation(
    () => axios.delete(`/finance/invoices/${id}`),
    {
      onSuccess: () => {
        message.success('Invoice deleted successfully');
        navigate('/app/finance/invoices');
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Failed to delete invoice');
      }
    }
  );

  // Mark as paid mutation
  const markPaidMutation = useMutation(
    () => axios.put(`/finance/invoices/${id}/mark-paid`),
    {
      onSuccess: () => {
        message.success('Invoice marked as paid');
        queryClient.invalidateQueries(['invoice', id]);
        queryClient.invalidateQueries(['invoice-payments', id]);
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Failed to update invoice');
      }
    }
  );

  if (isLoading) {
    return (
      <Card loading style={{ margin: 24 }}>
        Loading invoice details...
      </Card>
    );
  }

  if (error || !invoice) {
    return (
      <Card style={{ margin: 24 }}>
        <Alert
          message="Invoice Not Found"
          description="The invoice you're looking for doesn't exist or has been removed."
          type="error"
          action={
            <Button onClick={() => navigate('/app/finance/invoices')}>
              Back to Invoices
            </Button>
          }
        />
      </Card>
    );
  }

  const getStatusColor = (status) => {
    const colors = {
      'Draft': 'default',
      'Sent': 'blue',
      'Paid': 'green',
      'Partial': 'orange',
      'Overdue': 'red',
      'Cancelled': 'red'
    };
    return colors[status] || 'default';
  };

  const handleDelete = () => {
    Modal.confirm({
      title: 'Delete Invoice',
      content: 'Are you sure you want to delete this invoice? This action cannot be undone.',
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: () => deleteMutation.mutate()
    });
  };

  const handleMarkPaid = () => {
    Modal.confirm({
      title: 'Mark as Paid',
      content: 'Are you sure you want to mark this invoice as fully paid?',
      okText: 'Yes, Mark Paid',
      okType: 'primary',
      cancelText: 'Cancel',
      onOk: () => markPaidMutation.mutate()
    });
  };

  const lineItemColumns = [
    {
      title: 'Item',
      dataIndex: 'description',
      key: 'description',
      render: (text, record) => (
        <div>
          <div>{text}</div>
          {record.item && (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              S/N: {record.item.serialNumber}
            </Text>
          )}
        </div>
      )
    },
    {
      title: 'Qty',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      align: 'center'
    },
    {
      title: 'Rate',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 120,
      align: 'right',
      render: (amount) => formatPKR(amount)
    },
    {
      title: 'Amount',
      dataIndex: 'total',
      key: 'total',
      width: 120,
      align: 'right',
      render: (amount) => (
        <Text strong>{formatPKR(amount)}</Text>
      )
    }
  ];

  const paymentColumns = [
    {
      title: 'Date',
      dataIndex: 'paymentDate',
      key: 'paymentDate',
      render: (date) => dayjs(date).format('DD/MM/YYYY')
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount) => formatPKR(amount)
    },
    {
      title: 'Method',
      dataIndex: 'paymentMethod',
      key: 'paymentMethod'
    },
    {
      title: 'Reference',
      dataIndex: 'referenceNumber',
      key: 'referenceNumber',
      render: (ref) => ref || '-'
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'Cleared' ? 'green' : 'orange'}>
          {status}
        </Tag>
      )
    }
  ];

  const paidAmount = payments?.reduce((sum, payment) => sum + (payment.amount || 0), 0) || 0;
  const outstandingAmount = (invoice.total || 0) - paidAmount;

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/app/finance/invoices')}
            >
              Back
            </Button>
            <div>
              <Title level={2} style={{ margin: 0 }}>
                Invoice {invoice.invoiceNumber}
              </Title>
              <Text type="secondary">
                {invoice.customer?.name} • {dayjs(invoice.invoiceDate).format('DD/MM/YYYY')}
              </Text>
            </div>
          </Space>

          <Space>
            <Tag
              color={getStatusColor(invoice.status)}
              style={{ fontSize: '14px', padding: '4px 12px' }}
            >
              {invoice.status}
            </Tag>
            <Button icon={<PrinterOutlined />}>
              Print
            </Button>
            <Button icon={<FilePdfOutlined />}>
              PDF
            </Button>
            <Button icon={<MailOutlined />}>
              Email
            </Button>
            {hasPermission('finance.update') && invoice.status !== 'Paid' && (
              <Button
                type="primary"
                icon={<CreditCardOutlined />}
                onClick={() => navigate(`/app/finance/payments/record?invoiceId=${id}`)}
              >
                Record Payment
              </Button>
            )}
            {hasPermission('finance.update') && invoice.status !== 'Paid' && (
              <Button
                type="primary"
                ghost
                onClick={handleMarkPaid}
                loading={markPaidMutation.isLoading}
              >
                Mark as Paid
              </Button>
            )}
            {hasPermission('finance.delete') && (
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleDelete}
                loading={deleteMutation.isLoading}
              >
                Delete
              </Button>
            )}
          </Space>
        </div>
      </Card>

      <Row gutter={[24, 24]}>
        {/* Left Column - Invoice Details */}
        <Col xs={24} lg={16}>
          <Tabs defaultActiveKey="details">
            <TabPane tab="Invoice Details" key="details">
              <Card>
                {/* Customer Information */}
                <div style={{ marginBottom: 24 }}>
                  <Title level={4}>Bill To:</Title>
                  <Descriptions column={1} size="small">
                    <Descriptions.Item>
                      <Space direction="vertical" size={0}>
                        <Text strong style={{ fontSize: '16px' }}>
                          {invoice.customer?.name}
                        </Text>
                        {invoice.customer?.phone && (
                          <Space>
                            <PhoneOutlined />
                            {invoice.customer.phone}
                          </Space>
                        )}
                        {invoice.customer?.email && (
                          <Space>
                            <MailOutlined />
                            {invoice.customer.email}
                          </Space>
                        )}
                        {invoice.customer?.address && (
                          <Space align="start">
                            <EnvironmentOutlined />
                            <div style={{ whiteSpace: 'pre-wrap' }}>
                              {invoice.customer.address}
                            </div>
                          </Space>
                        )}
                      </Space>
                    </Descriptions.Item>
                  </Descriptions>
                </div>

                <Divider />

                {/* Invoice Information */}
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                  <Col span={12}>
                    <Descriptions column={1} size="small">
                      <Descriptions.Item label="Invoice Number">
                        <Text strong>{invoice.invoiceNumber}</Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="Invoice Date">
                        {dayjs(invoice.invoiceDate).format('DD/MM/YYYY')}
                      </Descriptions.Item>
                      <Descriptions.Item label="Due Date">
                        {dayjs(invoice.dueDate).format('DD/MM/YYYY')}
                      </Descriptions.Item>
                    </Descriptions>
                  </Col>
                  <Col span={12}>
                    <Descriptions column={1} size="small">
                      <Descriptions.Item label="Status">
                        <Tag color={getStatusColor(invoice.status)}>
                          {invoice.status}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Terms">
                        {invoice.paymentTerms || 'Net 30'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Created">
                        {dayjs(invoice.createdAt).format('DD/MM/YYYY')}
                      </Descriptions.Item>
                    </Descriptions>
                  </Col>
                </Row>

                <Divider />

                {/* Line Items */}
                <Title level={4}>Items</Title>
                <Table
                  rowKey="id"
                  columns={lineItemColumns}
                  dataSource={invoice.items}
                  pagination={false}
                  size="small"
                  style={{ marginBottom: 24 }}
                />

                {/* Totals */}
                <Row justify="end">
                  <Col span={8}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ marginBottom: 8 }}>
                        <Text>Subtotal: </Text>
                        <Text strong>{formatPKR(invoice.subtotal)}</Text>
                      </div>
                      {invoice.taxAmount > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <Text>Tax ({invoice.taxRate}%): </Text>
                          <Text strong>{formatPKR(invoice.taxAmount)}</Text>
                        </div>
                      )}
                      {invoice.discountAmount > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <Text>Discount: </Text>
                          <Text strong style={{ color: '#52c41a' }}>
                            -{formatPKR(invoice.discountAmount)}
                          </Text>
                        </div>
                      )}
                      <Divider style={{ margin: '8px 0' }} />
                      <div>
                        <Text style={{ fontSize: '16px' }}>Total: </Text>
                        <Text strong style={{ fontSize: '18px' }}>
                          {formatPKR(invoice.total)}
                        </Text>
                      </div>
                    </div>
                  </Col>
                </Row>

                {invoice.notes && (
                  <>
                    <Divider />
                    <div>
                      <Title level={5}>Notes</Title>
                      <div style={{ whiteSpace: 'pre-wrap' }}>
                        {invoice.notes}
                      </div>
                    </div>
                  </>
                )}
              </Card>
            </TabPane>

            <TabPane tab="Payment History" key="payments">
              <Card>
                <Table
                  rowKey="id"
                  columns={paymentColumns}
                  dataSource={payments}
                  pagination={false}
                  size="small"
                  locale={{ emptyText: 'No payments recorded' }}
                />
              </Card>
            </TabPane>
          </Tabs>
        </Col>

        {/* Right Column - Summary & Actions */}
        <Col xs={24} lg={8}>
          {/* Payment Summary */}
          <Card title="Payment Summary" style={{ marginBottom: 16 }}>
            <Row gutter={[0, 16]}>
              <Col span={24}>
                <Statistic
                  title="Invoice Total"
                  value={invoice.total || 0}
                  prefix="PKR"
                  valueStyle={{ color: '#1890ff' }}
                />
              </Col>
              <Col span={24}>
                <Statistic
                  title="Paid Amount"
                  value={paidAmount}
                  prefix="PKR"
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col span={24}>
                <Statistic
                  title="Outstanding"
                  value={outstandingAmount}
                  prefix="PKR"
                  valueStyle={{
                    color: outstandingAmount > 0 ? '#f5222d' : '#52c41a'
                  }}
                />
              </Col>
            </Row>

            {outstandingAmount > 0 && (
              <div style={{ marginTop: 16 }}>
                <Text type="secondary">
                  Payment progress: {((paidAmount / invoice.total) * 100).toFixed(1)}%
                </Text>
                <div style={{
                  height: 6,
                  backgroundColor: '#f0f0f0',
                  borderRadius: 3,
                  marginTop: 4
                }}>
                  <div style={{
                    height: '100%',
                    width: `${(paidAmount / invoice.total) * 100}%`,
                    backgroundColor: '#52c41a',
                    borderRadius: 3
                  }} />
                </div>
              </div>
            )}
          </Card>

          {/* Quick Actions */}
          {hasPermission('finance.create') && (
            <Card title="Quick Actions">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button
                  block
                  type="primary"
                  icon={<CreditCardOutlined />}
                  onClick={() => navigate(`/app/finance/payments/record?invoiceId=${id}`)}
                  disabled={invoice.status === 'Paid'}
                >
                  Record Payment
                </Button>
                <Button
                  block
                  icon={<FilePdfOutlined />}
                >
                  Download PDF
                </Button>
                <Button
                  block
                  icon={<MailOutlined />}
                >
                  Send to Customer
                </Button>
                <Button
                  block
                  icon={<EditOutlined />}
                  onClick={() => navigate(`/app/finance/invoices/${id}/edit`)}
                  disabled={invoice.status === 'Paid'}
                >
                  Edit Invoice
                </Button>
              </Space>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
};

export default InvoiceDetails;