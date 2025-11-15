import React, { useState } from 'react';
import { Card, Table, Tag, Row, Col, Statistic, DatePicker, Button, Space, Spin, Tabs } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatCurrency } from '../../config/constants';

const { TabPane } = Tabs;

const VendorBillsAgingReport = () => {
  const [asOfDate, setAsOfDate] = useState(dayjs());

  const { data, isLoading } = useQuery(
    ['vendor-bills-aging', asOfDate?.format('YYYY-MM-DD')],
    async () => {
      const response = await axios.get('/reports/vendor-bills-aging', {
        params: { asOfDate: asOfDate.format('YYYY-MM-DD') }
      });
      return response.data.data;
    },
    { enabled: !!asOfDate }
  );

  const handleExport = () => {
    // TODO: Implement export functionality
    console.log('Export vendor bills aging');
  };

  // Columns for detailed bills view
  const billColumns = [
    {
      title: 'Vendor',
      dataIndex: ['vendor', 'name'],
      key: 'vendorName',
      sorter: (a, b) => a.vendor.name.localeCompare(b.vendor.name),
    },
    {
      title: 'Bill Number',
      dataIndex: 'billNumber',
      key: 'billNumber',
    },
    {
      title: 'Bill Date',
      dataIndex: 'billDate',
      key: 'billDate',
      render: (date) => new Date(date).toLocaleDateString('en-PK'),
    },
    {
      title: 'Due Date',
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: (date) => date ? new Date(date).toLocaleDateString('en-PK') : 'N/A',
    },
    {
      title: 'Balance',
      dataIndex: 'balance',
      key: 'balance',
      render: (amount) => formatCurrency(amount),
      align: 'right',
      sorter: (a, b) => a.balance - b.balance,
    },
    {
      title: 'Days Overdue',
      dataIndex: 'daysOverdue',
      key: 'daysOverdue',
      render: (days) => (
        <Tag color={days <= 0 ? 'green' : days <= 30 ? 'orange' : days <= 60 ? 'red' : 'purple'}>
          {days <= 0 ? 'Current' : `${days} days`}
        </Tag>
      ),
      sorter: (a, b) => a.daysOverdue - b.daysOverdue,
    },
  ];

  // Columns for vendor summary view
  const vendorColumns = [
    {
      title: 'Vendor Name',
      dataIndex: ['vendor', 'name'],
      key: 'vendorName',
      sorter: (a, b) => a.vendor.name.localeCompare(b.vendor.name),
    },
    {
      title: 'Contact',
      dataIndex: ['vendor', 'phone'],
      key: 'phone',
    },
    {
      title: 'Current',
      dataIndex: 'current',
      key: 'current',
      render: (amount) => formatCurrency(amount),
      align: 'right',
    },
    {
      title: '31-60 Days',
      dataIndex: 'days31to60',
      key: 'days31to60',
      render: (amount) => formatCurrency(amount),
      align: 'right',
    },
    {
      title: '61-90 Days',
      dataIndex: 'days61to90',
      key: 'days61to90',
      render: (amount) => formatCurrency(amount),
      align: 'right',
    },
    {
      title: '90+ Days',
      dataIndex: 'over90',
      key: 'over90',
      render: (amount) => formatCurrency(amount),
      align: 'right',
    },
    {
      title: 'Total Due',
      dataIndex: 'totalDue',
      key: 'totalDue',
      render: (amount) => formatCurrency(amount),
      align: 'right',
      sorter: (a, b) => a.totalDue - b.totalDue,
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
  const buckets = data?.buckets || {};
  const vendorSummary = data?.vendorSummary || [];
  const statistics = data?.statistics || {};

  // Combine all bills from all buckets
  const allBills = [
    ...(buckets.current || []),
    ...(buckets.days31to60 || []),
    ...(buckets.days61to90 || []),
    ...(buckets.over90 || []),
  ];

  return (
    <Card
      title={`Vendor Bills Aging - As of ${asOfDate.format('DD/MM/YYYY')}`}
      extra={
        <Space>
          <DatePicker
            value={asOfDate}
            onChange={(date) => date && setAsOfDate(date)}
            format="DD/MM/YYYY"
          />
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            Export
          </Button>
        </Space>
      }
    >
      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Payable"
              value={summary.total || 0}
              prefix="PKR"
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Current (0-30 days)"
              value={summary.current || 0}
              prefix="PKR"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="31-60 Days"
              value={summary.days31to60 || 0}
              prefix="PKR"
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="61+ Days"
              value={(summary.days61to90 || 0) + (summary.over90 || 0)}
              prefix="PKR"
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Statistics Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title="Vendors with Dues"
              value={statistics.totalVendorsWithDues || 0}
              valueStyle={{ fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title="Avg Days Overdue"
              value={statistics.averageDaysOverdue || 0}
              suffix="days"
              valueStyle={{ fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title="Overdue Percentage"
              value={statistics.overduePercentage || 0}
              suffix="%"
              precision={1}
              valueStyle={{ fontSize: 20, color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Tabs for different views */}
      <Tabs defaultActiveKey="bills">
        <TabPane tab="All Bills" key="bills">
          <Table
            dataSource={allBills}
            columns={billColumns}
            rowKey="id"
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total) => `Total ${total} bills`,
            }}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ fontWeight: 'bold', backgroundColor: '#fafafa' }}>
                  <Table.Summary.Cell colSpan={4} align="right">
                    TOTAL PAYABLE
                  </Table.Summary.Cell>
                  <Table.Summary.Cell align="right">
                    {formatCurrency(summary.total || 0)}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell />
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </TabPane>

        <TabPane tab="By Vendor" key="vendors">
          <Table
            dataSource={vendorSummary}
            columns={vendorColumns}
            rowKey={(record) => record.vendor.id}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total) => `Total ${total} vendors`,
            }}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ fontWeight: 'bold', backgroundColor: '#fafafa' }}>
                  <Table.Summary.Cell colSpan={2} align="right">
                    TOTAL
                  </Table.Summary.Cell>
                  <Table.Summary.Cell align="right">
                    {formatCurrency(summary.current || 0)}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell align="right">
                    {formatCurrency(summary.days31to60 || 0)}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell align="right">
                    {formatCurrency(summary.days61to90 || 0)}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell align="right">
                    {formatCurrency(summary.over90 || 0)}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell align="right">
                    {formatCurrency(summary.total || 0)}
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </TabPane>
      </Tabs>
    </Card>
  );
};

export default VendorBillsAgingReport;
