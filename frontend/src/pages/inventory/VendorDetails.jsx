import React from 'react';
import {
  Card, Descriptions, Statistic, Row, Col, Tabs, Table, Tag, Space, Button, message, Spin
} from 'antd';
import {
  ArrowLeftOutlined, ReconciliationOutlined, ShopOutlined, PrinterOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import LedgerView from '../../components/LedgerView';
import { formatPKR } from '../../config/constants';
import { parseAmount, subtractAmounts } from '../../utils/decimalUtils';

const VendorDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Fetch vendor details
  const { data: vendor, isLoading, error } = useQuery(
    ['vendor', id],
    async () => {
      const response = await axios.get(`/inventory/vendors/${id}`);
      return response.data.data;
    },
    {
      enabled: !!id,
      onError: (error) => {
        message.error(`Failed to load vendor details: ${error.response?.data?.message || error.message}`);
      }
    }
  );

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <p>Failed to load vendor details</p>
          <Button onClick={() => navigate('/app/inventory/vendors')}>
            Go Back
          </Button>
        </div>
      </Card>
    );
  }

  if (isLoading || !vendor) {
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
          onClick={() => navigate('/app/inventory/vendors')}
          style={{ padding: 0, marginBottom: 16 }}
        >
          Back to Vendors
        </Button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24 }}>{vendor.name}</h1>
            <p style={{ margin: '8px 0 0 0', color: '#666' }}>
              Vendor Code: <Tag>{vendor.code}</Tag>
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
              value={vendor.currentBalance}
              prefix="PKR"
              valueStyle={{
                color: vendor.currentBalance > 0 ? '#f5222d' : '#52c41a'
              }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Purchase Orders"
              value={vendor._count?.purchaseOrders || 0}
              prefix={<ReconciliationOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Items Supplied"
              value={vendor._count?.items || 0}
              prefix={<ShopOutlined />}
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
              <Descriptions.Item label="Name" span={2}>{vendor.name}</Descriptions.Item>
              <Descriptions.Item label="Code">{vendor.code}</Descriptions.Item>
              <Descriptions.Item label="Contact Person">{vendor.contactPerson || '-'}</Descriptions.Item>
              <Descriptions.Item label="Phone">{vendor.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="Email">{vendor.email || '-'}</Descriptions.Item>
              <Descriptions.Item label="Address" span={2}>{vendor.address || '-'}</Descriptions.Item>
              <Descriptions.Item label="Tax Number">{vendor.taxNumber || '-'}</Descriptions.Item>
              <Descriptions.Item label="Payment Terms">{vendor.paymentTerms || '-'}</Descriptions.Item>
              <Descriptions.Item label="Opening Balance">
                {formatPKR(vendor.openingBalance || 0)}
              </Descriptions.Item>
              <Descriptions.Item label="Current Balance">
                <span style={{
                  color: vendor.currentBalance > 0 ? '#f5222d' : '#52c41a',
                  fontWeight: 'bold'
                }}>
                  {formatPKR(vendor.currentBalance || 0)}
                </span>
              </Descriptions.Item>
            </Descriptions>
          </Tabs.TabPane>

          {/* Purchase Orders Tab */}
          <Tabs.TabPane tab={`Purchase Orders (${vendor.purchaseOrders?.length || 0})`} key="2">
            <Table
              rowKey="id"
              dataSource={vendor.purchaseOrders}
              columns={[
                {
                  title: 'PO #',
                  dataIndex: 'poNumber',
                  key: 'poNumber',
                  render: (text, record) => (
                    <Button
                      type="link"
                      onClick={() => navigate(`/app/finance/purchase-orders/${record.id}`)}
                    >
                      {text}
                    </Button>
                  )
                },
                {
                  title: 'Date',
                  dataIndex: 'orderDate',
                  key: 'orderDate',
                  render: (date) => new Date(date).toLocaleDateString('en-GB')
                },
                {
                  title: 'Total',
                  dataIndex: 'total',
                  key: 'total',
                  align: 'right',
                  render: (amount) => formatPKR(parseAmount(amount))
                },
                {
                  title: 'Billed',
                  dataIndex: 'billedAmount',
                  key: 'billedAmount',
                  align: 'right',
                  render: (amount) => formatPKR(parseAmount(amount))
                },
                {
                  title: 'Unbilled',
                  key: 'unbilled',
                  align: 'right',
                  render: (_, record) => {
                    const unbilled = subtractAmounts(record.total, record.billedAmount);
                    return formatPKR(unbilled);
                  }
                },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status) => (
                    <Tag color={
                      status === 'Draft' ? 'default' :
                      status === 'Sent' ? 'blue' :
                      status === 'Partial' ? 'orange' :
                      status === 'Completed' ? 'green' :
                      status === 'Cancelled' ? 'red' : 'default'
                    }>
                      {status}
                    </Tag>
                  )
                }
              ]}
              pagination={{ pageSize: 10 }}
            />
          </Tabs.TabPane>

          {/* Bills Tab */}
          <Tabs.TabPane tab={`Bills (${vendor.bills?.length || 0})`} key="3">
            <Table
              rowKey="id"
              dataSource={vendor.bills}
              columns={[
                {
                  title: 'Bill #',
                  dataIndex: 'billNumber',
                  key: 'billNumber',
                  render: (text, record) => (
                    <Space direction="vertical" size="small">
                      <Button
                        type="link"
                        onClick={() => navigate(`/app/finance/vendor-bills/${record.id}`)}
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
                  dataIndex: 'billDate',
                  key: 'billDate',
                  render: (date) => new Date(date).toLocaleDateString('en-GB')
                },
                {
                  title: 'Total',
                  dataIndex: 'total',
                  key: 'total',
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
                    const balance = subtractAmounts(record.total, record.paidAmount);
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
                        status === 'Paid' ? 'green' :
                        status === 'Partial' ? 'orange' :
                        status === 'Unpaid' ? 'blue' : 'default'
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
          <Tabs.TabPane tab={`Payments (${vendor.payments?.length || 0})`} key="4">
            <Table
              rowKey="id"
              dataSource={vendor.payments}
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
                  dataIndex: 'method',
                  key: 'method',
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
          <Tabs.TabPane tab="Ledger" key="5">
            <LedgerView
              entityId={vendor.id}
              entityType="vendor"
              title="Vendor Ledger"
            />
          </Tabs.TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default VendorDetails;
