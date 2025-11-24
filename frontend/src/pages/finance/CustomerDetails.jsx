import React from 'react';
import {
  Card, Descriptions, Statistic, Row, Col, Tabs, Table, Tag, Space, Button, message, Spin
} from 'antd';
import {
  ArrowLeftOutlined, FileTextOutlined, CreditCardOutlined, PrinterOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import LedgerView from '../../components/LedgerView';
import CustomerStatement from '../../components/CustomerStatement';
import { formatPKR } from '../../config/constants';
import { parseAmount, subtractAmounts } from '../../utils/decimalUtils';

const CustomerDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Fetch customer details
  const { data: customer, isLoading, error } = useQuery(
    ['customer', id],
    async () => {
      const response = await axios.get(`/finance/customers/${id}`);
      return response.data.data;
    },
    {
      enabled: !!id,
      onError: (error) => {
        message.error(`Failed to load customer details: ${error.response?.data?.message || error.message}`);
      }
    }
  );

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <p>Failed to load customer details</p>
          <Button onClick={() => navigate('/app/finance/customers')}>
            Go Back
          </Button>
        </div>
      </Card>
    );
  }

  if (isLoading || !customer) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  return (
    <div>
      {/* Header Card */}
      <Card
        style={{ marginBottom: 16 }}
        extra={
          <Space>
            <Button icon={<PrinterOutlined />}>Print</Button>
            <Button icon={<DownloadOutlined />}>Export</Button>
          </Space>
        }
      >
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/app/finance/customers')}
          style={{ padding: 0, marginBottom: 16 }}
        >
          Back to Customers
        </Button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24 }}>{customer.name}</h1>
            <p style={{ margin: '8px 0 0 0', color: '#666' }}>
              {customer.company && `Company: ${customer.company}`}
              {customer.phone && ` • Phone: ${customer.phone}`}
            </p>
          </div>
        </div>
      </Card>

      {/* Statistics Row */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="Current Balance"
              value={customer.currentBalance}
              prefix="PKR"
              valueStyle={{
                color: customer.currentBalance > 0 ? '#f5222d' : '#52c41a'
              }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Total Invoices"
              value={customer._count?.invoices || 0}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Total Payments"
              value={customer._count?.payments || 0}
              prefix={<CreditCardOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Content Tabs */}
      <Card>
        <Tabs defaultActiveKey="1">
          {/* Overview Tab */}
          <Tabs.TabPane tab="Overview" key="1">
            <Descriptions bordered column={2}>
              <Descriptions.Item label="Name" span={2}>{customer.name}</Descriptions.Item>
              <Descriptions.Item label="Company">{customer.company || '-'}</Descriptions.Item>
              <Descriptions.Item label="Phone">{customer.phone}</Descriptions.Item>
              <Descriptions.Item label="Email">{customer.email || '-'}</Descriptions.Item>
              <Descriptions.Item label="NIC">{customer.nic || '-'}</Descriptions.Item>
              <Descriptions.Item label="Address" span={2}>{customer.address || '-'}</Descriptions.Item>
              <Descriptions.Item label="Credit Limit">
                {customer.creditLimit > 0
                  ? formatPKR(parseAmount(customer.creditLimit))
                  : 'No Limit'}
              </Descriptions.Item>
              <Descriptions.Item label="Opening Balance">
                {formatPKR(customer.openingBalance || 0)}
              </Descriptions.Item>
              <Descriptions.Item label="Current Balance" span={2}>
                <span style={{
                  color: customer.currentBalance > 0 ? '#f5222d' : '#52c41a',
                  fontWeight: 'bold'
                }}>
                  {formatPKR(customer.currentBalance || 0)}
                </span>
              </Descriptions.Item>
            </Descriptions>
          </Tabs.TabPane>

          {/* Invoices Tab */}
          <Tabs.TabPane tab={`Invoices (${customer.invoices?.length || 0})`} key="2">
            <Table
              rowKey="id"
              dataSource={customer.invoices}
              columns={[
                {
                  title: 'Invoice #',
                  dataIndex: 'invoiceNumber',
                  key: 'invoiceNumber',
                  render: (text, record) => (
                    <Space direction="vertical" size="small">
                      <Button
                        type="link"
                        onClick={() => navigate(`/app/finance/invoices/${record.id}`)}
                        style={{
                          color: record.cancelledAt ? '#999' : undefined,
                          padding: 0
                        }}
                      >
                        {text}
                      </Button>
                      {record.cancelledAt && <Tag color="red" size="small">CANCELLED</Tag>}
                    </Space>
                  )
                },
                {
                  title: 'Date',
                  dataIndex: 'invoiceDate',
                  key: 'invoiceDate',
                  render: (date) => new Date(date).toLocaleDateString('en-GB')
                },
                {
                  title: 'Total',
                  dataIndex: 'totalAmount',
                  key: 'totalAmount',
                  align: 'right',
                  render: (amount, record) => (
                    <span style={{
                      color: record.cancelledAt ? '#999' : 'inherit',
                      textDecoration: record.cancelledAt ? 'line-through' : 'none'
                    }}>
                      {formatPKR(parseAmount(amount))}
                    </span>
                  )
                },
                {
                  title: 'Paid',
                  dataIndex: 'paidAmount',
                  key: 'paidAmount',
                  align: 'right',
                  render: (amount, record) => (
                    <span style={{ color: record.cancelledAt ? '#999' : 'inherit' }}>
                      {formatPKR(parseAmount(amount))}
                    </span>
                  )
                },
                {
                  title: 'Balance',
                  key: 'balance',
                  align: 'right',
                  render: (_, record) => {
                    if (record.cancelledAt) return '-';
                    const balance = subtractAmounts(record.totalAmount, record.paidAmount);
                    return (
                      <span style={{
                        color: balance > 0 ? '#f5222d' : '#52c41a',
                        fontWeight: balance > 0 ? 'bold' : 'normal'
                      }}>
                        {formatPKR(balance)}
                      </span>
                    );
                  }
                },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status, record) => {
                    if (record.cancelledAt) {
                      return <Tag color="red">Cancelled</Tag>;
                    }
                    return (
                      <Tag color={
                        status === 'Draft' ? 'default' :
                        status === 'Sent' ? 'blue' :
                        status === 'Partial' ? 'orange' :
                        status === 'Paid' ? 'green' :
                        status === 'Overdue' ? 'red' : 'default'
                      }>
                        {status}
                      </Tag>
                    );
                  }
                }
              ]}
              pagination={{ pageSize: 10 }}
            />
          </Tabs.TabPane>

          {/* Payments Tab */}
          <Tabs.TabPane tab={`Payments (${customer.payments?.length || 0})`} key="3">
            <Table
              rowKey="id"
              dataSource={customer.payments}
              columns={[
                {
                  title: 'Payment #',
                  dataIndex: 'paymentNumber',
                  key: 'paymentNumber',
                  render: (text, record) => (
                    <Space direction="vertical" size="small">
                      <span style={{ color: record.voidedAt ? '#999' : 'inherit' }}>
                        {text}
                      </span>
                      {record.voidedAt && <Tag color="red" size="small">VOIDED</Tag>}
                    </Space>
                  )
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
                  render: (amount, record) => (
                    <span style={{
                      color: record.voidedAt ? '#999' : 'inherit',
                      textDecoration: record.voidedAt ? 'line-through' : 'none'
                    }}>
                      {formatPKR(parseAmount(amount))}
                    </span>
                  )
                },
                {
                  title: 'Method',
                  dataIndex: 'paymentMethod',
                  key: 'paymentMethod',
                  render: (method, record) => (
                    <span style={{ color: record.voidedAt ? '#999' : 'inherit' }}>
                      {method}
                    </span>
                  )
                },
                {
                  title: 'Reference',
                  dataIndex: 'reference',
                  key: 'reference',
                  render: (ref, record) => (
                    <span style={{ color: record.voidedAt ? '#999' : 'inherit' }}>
                      {ref || '-'}
                    </span>
                  )
                }
              ]}
              pagination={{ pageSize: 10 }}
            />
          </Tabs.TabPane>

          {/* Ledger Tab */}
          <Tabs.TabPane tab="Ledger" key="4">
            <LedgerView
              entityId={customer.id}
              entityType="customer"
              title="Customer Ledger"
            />
          </Tabs.TabPane>

          {/* Statement Tab */}
          <Tabs.TabPane tab="Statement" key="5">
            <CustomerStatement customerId={customer.id} />
          </Tabs.TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default CustomerDetails;
