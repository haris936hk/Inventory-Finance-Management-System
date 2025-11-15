import React, { useState } from 'react';
import { Card, Table, Row, Col, Statistic, Select, Button, Space, Spin, Divider } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatCurrency } from '../../config/constants';

const { Option } = Select;

const GSTReport = () => {
  const currentYear = dayjs().year();
  const currentMonth = dayjs().month() + 1; // dayjs months are 0-indexed

  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  const { data, isLoading } = useQuery(
    ['gst-report', year, month],
    async () => {
      const response = await axios.get('/reports/gst', {
        params: { year, month }
      });
      return response.data.data;
    }
  );

  const handleExport = () => {
    // TODO: Implement export functionality
    console.log('Export GST report');
  };

  // Generate year options (last 5 years)
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  // Month names
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Sales columns
  const salesColumns = [
    {
      title: 'Invoice Number',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
    },
    {
      title: 'Customer',
      dataIndex: ['customer', 'name'],
      key: 'customerName',
    },
    {
      title: 'GSTIN',
      dataIndex: ['customer', 'gstinNumber'],
      key: 'gstin',
      render: (gstin) => gstin || 'N/A',
    },
    {
      title: 'Invoice Amount',
      dataIndex: 'total',
      key: 'total',
      render: (amount) => formatCurrency(amount),
      align: 'right',
    },
    {
      title: 'CGST',
      dataIndex: 'cgstAmount',
      key: 'cgstAmount',
      render: (amount) => formatCurrency(amount || 0),
      align: 'right',
    },
    {
      title: 'SGST',
      dataIndex: 'sgstAmount',
      key: 'sgstAmount',
      render: (amount) => formatCurrency(amount || 0),
      align: 'right',
    },
    {
      title: 'IGST',
      dataIndex: 'igstAmount',
      key: 'igstAmount',
      render: (amount) => formatCurrency(amount || 0),
      align: 'right',
    },
  ];

  // Purchase columns
  const purchaseColumns = [
    {
      title: 'Bill Number',
      dataIndex: 'billNumber',
      key: 'billNumber',
    },
    {
      title: 'Vendor',
      dataIndex: ['vendor', 'name'],
      key: 'vendorName',
    },
    {
      title: 'Tax Number',
      dataIndex: ['vendor', 'taxNumber'],
      key: 'taxNumber',
      render: (taxNumber) => taxNumber || 'N/A',
    },
    {
      title: 'Bill Amount',
      dataIndex: 'total',
      key: 'total',
      render: (amount) => formatCurrency(amount),
      align: 'right',
    },
    {
      title: 'Tax Amount',
      dataIndex: 'taxAmount',
      key: 'taxAmount',
      render: (amount) => formatCurrency(amount || 0),
      align: 'right',
    },
  ];

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 50 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  const summary = data?.summary || {};
  const sales = data?.sales || {};
  const purchases = data?.purchases || [];
  const salesSummary = summary.sales || {};
  const purchaseSummary = summary.purchases || {};
  const netTax = summary.netTax || {};

  // Combine all sales
  const allSales = [
    ...(sales.b2b || []),
    ...(sales.b2c || []),
    ...(sales.export || []),
  ];

  return (
    <Card
      title={`GST Report - ${monthNames[month - 1]} ${year}`}
      extra={
        <Space>
          <Select
            value={month}
            onChange={setMonth}
            style={{ width: 120 }}
          >
            {monthNames.map((name, index) => (
              <Option key={index + 1} value={index + 1}>
                {name}
              </Option>
            ))}
          </Select>
          <Select
            value={year}
            onChange={setYear}
            style={{ width: 100 }}
          >
            {yearOptions.map((y) => (
              <Option key={y} value={y}>
                {y}
              </Option>
            ))}
          </Select>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            Export
          </Button>
        </Space>
      }
    >
      {/* Tax Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Sales Tax Collected"
              value={salesSummary.totalTax || 0}
              prefix="PKR"
              valueStyle={{ color: '#52c41a' }}
            />
            <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              From {salesSummary.totalSales ? formatCurrency(salesSummary.totalSales) : 'PKR 0'} sales
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Purchase Tax Paid"
              value={purchaseSummary.totalTaxPaid || 0}
              prefix="PKR"
              valueStyle={{ color: '#faad14' }}
            />
            <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              From {purchaseSummary.totalPurchases ? formatCurrency(purchaseSummary.totalPurchases) : 'PKR 0'} purchases
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Net Tax Payable"
              value={netTax.netPayable || 0}
              prefix="PKR"
              valueStyle={{ color: netTax.netPayable >= 0 ? '#ff4d4f' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <div style={{ marginBottom: 8 }}>
              <small>CGST: {formatCurrency(netTax.salesCGST || 0)}</small>
            </div>
            <div style={{ marginBottom: 8 }}>
              <small>SGST: {formatCurrency(netTax.salesSGST || 0)}</small>
            </div>
            <div>
              <small>IGST: {formatCurrency(netTax.salesIGST || 0)}</small>
            </div>
          </Card>
        </Col>
      </Row>

      <Divider>Sales Details (GSTR-1)</Divider>

      {/* Sales Breakdown */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title="B2B Sales"
              value={(sales.b2b || []).length}
              suffix="invoices"
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title="B2C Sales"
              value={(sales.b2c || []).length}
              suffix="invoices"
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title="Export Sales"
              value={(sales.export || []).length}
              suffix="invoices"
            />
          </Card>
        </Col>
      </Row>

      {/* Sales Table */}
      <Card title="Sales Transactions" size="small" style={{ marginBottom: 24 }}>
        <Table
          dataSource={allSales}
          columns={salesColumns}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} invoices`,
          }}
          size="small"
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ fontWeight: 'bold', backgroundColor: '#fafafa' }}>
                <Table.Summary.Cell colSpan={3} align="right">
                  TOTAL
                </Table.Summary.Cell>
                <Table.Summary.Cell align="right">
                  {formatCurrency(salesSummary.totalSales || 0)}
                </Table.Summary.Cell>
                <Table.Summary.Cell align="right">
                  {formatCurrency(salesSummary.cgstCollected || 0)}
                </Table.Summary.Cell>
                <Table.Summary.Cell align="right">
                  {formatCurrency(salesSummary.sgstCollected || 0)}
                </Table.Summary.Cell>
                <Table.Summary.Cell align="right">
                  {formatCurrency(salesSummary.igstCollected || 0)}
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>

      <Divider>Purchase Details (GSTR-2)</Divider>

      {/* Purchases Table */}
      <Card title="Purchase Transactions" size="small">
        <Table
          dataSource={purchases}
          columns={purchaseColumns}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} bills`,
          }}
          size="small"
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ fontWeight: 'bold', backgroundColor: '#fafafa' }}>
                <Table.Summary.Cell colSpan={3} align="right">
                  TOTAL
                </Table.Summary.Cell>
                <Table.Summary.Cell align="right">
                  {formatCurrency(purchaseSummary.totalPurchases || 0)}
                </Table.Summary.Cell>
                <Table.Summary.Cell align="right">
                  {formatCurrency(purchaseSummary.totalTaxPaid || 0)}
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
        {purchaseSummary.note && (
          <div style={{ marginTop: 16, padding: 12, backgroundColor: '#fff7e6', borderRadius: 4 }}>
            <small><strong>Note:</strong> {purchaseSummary.note}</small>
          </div>
        )}
      </Card>
    </Card>
  );
};

export default GSTReport;
