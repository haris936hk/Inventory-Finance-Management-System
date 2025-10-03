import React from 'react';
import { Card, Table, Tag, Row, Col, Statistic } from 'antd';
import { useQuery } from 'react-query';
import axios from 'axios';
import { formatCurrency } from '../../config/constants';

const ARAgingReport = () => {
  const { data, isLoading } = useQuery(
    ['ar-aging'],
    async () => {
      const response = await axios.get('/reports/accounts-receivable-aging');
      return response.data.data;
    }
  );

  const columns = [
    {
      title: 'Customer',
      dataIndex: 'customerName',
      key: 'customerName',
      sorter: (a, b) => a.customerName.localeCompare(b.customerName)
    },
    {
      title: 'Invoice',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
    },
    {
      title: 'Invoice Date',
      dataIndex: 'invoiceDate',
      key: 'invoiceDate',
      render: (date) => new Date(date).toLocaleDateString('en-PK')
    },
    {
      title: 'Due Date',
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: (date) => date ? new Date(date).toLocaleDateString('en-PK') : 'N/A'
    },
    {
      title: 'Balance',
      dataIndex: 'balanceAmount',
      key: 'balanceAmount',
      render: (amount) => formatCurrency(amount),
      align: 'right',
      sorter: (a, b) => a.balanceAmount - b.balanceAmount
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
      sorter: (a, b) => a.daysOverdue - b.daysOverdue
    },
    {
      title: 'Aging Bucket',
      dataIndex: 'agingBucket',
      key: 'agingBucket',
      filters: [
        { text: 'Current', value: 'Current' },
        { text: '1-30 Days', value: '1-30 Days' },
        { text: '31-60 Days', value: '31-60 Days' },
        { text: '61-90 Days', value: '61-90 Days' },
        { text: '90+ Days', value: '90+ Days' }
      ],
      onFilter: (value, record) => record.agingBucket === value
    }
  ];

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 50 }}>
          <span>Loading...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Accounts Receivable Aging">
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Outstanding"
              value={data?.summary?.total || 0}
              prefix="PKR"
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Current"
              value={data?.summary?.current || 0}
              prefix="PKR"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="30+ Days"
              value={data?.summary?.['30days'] || 0}
              prefix="PKR"
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="60+ Days"
              value={data?.summary?.['60days'] || 0}
              prefix="PKR"
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      <Table
        dataSource={data?.invoices || []}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 20 }}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <Table.Summary.Cell colSpan={4}>
                <strong>Total Outstanding</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell align="right">
                <strong>{formatCurrency(data?.summary?.total || 0)}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell colSpan={2} />
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </Card>
  );
};

export default ARAgingReport;
