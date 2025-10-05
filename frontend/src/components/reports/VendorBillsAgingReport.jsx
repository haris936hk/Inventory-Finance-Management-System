import React, { useState } from 'react';
import { Card, DatePicker, Spin, Row, Col, Statistic, Table, Collapse, Tag } from 'antd';
import { useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatCurrency } from '../../config/constants';
import { WarningOutlined, CheckCircleOutlined } from '@ant-design/icons';

const { Panel } = Collapse;

const VendorBillsAgingReport = () => {
  const [asOfDate, setAsOfDate] = useState(dayjs());

  const { data, isLoading } = useQuery(
    ['vendor-bills-aging', asOfDate],
    async () => {
      const response = await axios.get('/reports/vendor-bills-aging', {
        params: {
          asOfDate: asOfDate.format('YYYY-MM-DD')
        }
      });
      return response.data.data;
    }
  );

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
      </div>
    );
  }

  const summaryCards = [
    {
      title: 'Current (0-30 days)',
      value: data?.summary?.current || 0,
      color: '#52c41a'
    },
    {
      title: '31-60 Days',
      value: data?.summary?.days31to60 || 0,
      color: '#faad14'
    },
    {
      title: '61-90 Days',
      value: data?.summary?.days61to90 || 0,
      color: '#ff7a45'
    },
    {
      title: 'Over 90 Days',
      value: data?.summary?.over90 || 0,
      color: '#ff4d4f'
    }
  ];

  const agingColumns = [
    {
      title: 'Bill Number',
      dataIndex: 'billNumber',
      key: 'billNumber',
      render: (text) => <span style={{ fontWeight: '500' }}>{text}</span>
    },
    {
      title: 'Vendor',
      dataIndex: ['vendor', 'name'],
      key: 'vendor'
    },
    {
      title: 'Bill Date',
      dataIndex: 'billDate',
      key: 'billDate',
      render: (date) => dayjs(date).format('MMM DD, YYYY')
    },
    {
      title: 'Due Date',
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: (date) => date ? dayjs(date).format('MMM DD, YYYY') : '-'
    },
    {
      title: 'Amount',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      render: (amount) => formatCurrency(amount)
    },
    {
      title: 'Paid',
      dataIndex: 'paidAmount',
      key: 'paidAmount',
      align: 'right',
      render: (amount) => formatCurrency(amount)
    },
    {
      title: 'Balance',
      dataIndex: 'balance',
      key: 'balance',
      align: 'right',
      render: (amount) => (
        <span style={{ fontWeight: 'bold', color: '#1890ff' }}>
          {formatCurrency(amount)}
        </span>
      )
    },
    {
      title: 'Days Overdue',
      dataIndex: 'daysOverdue',
      key: 'daysOverdue',
      align: 'center',
      render: (days) => {
        let color = '#52c41a';
        if (days > 90) color = '#ff4d4f';
        else if (days > 60) color = '#ff7a45';
        else if (days > 30) color = '#faad14';

        return <Tag color={color}>{days} days</Tag>;
      }
    }
  ];

  const vendorColumns = [
    {
      title: 'Vendor',
      dataIndex: ['vendor', 'name'],
      key: 'vendor',
      render: (text) => <span style={{ fontWeight: '500' }}>{text}</span>
    },
    {
      title: 'Total Due',
      dataIndex: 'totalDue',
      key: 'totalDue',
      align: 'right',
      render: (amount) => (
        <span style={{ fontWeight: 'bold' }}>{formatCurrency(amount)}</span>
      ),
      sorter: (a, b) => a.totalDue - b.totalDue
    },
    {
      title: 'Current',
      dataIndex: 'current',
      key: 'current',
      align: 'right',
      render: (amount) => formatCurrency(amount)
    },
    {
      title: '31-60',
      dataIndex: 'days31to60',
      key: 'days31to60',
      align: 'right',
      render: (amount) => formatCurrency(amount)
    },
    {
      title: '61-90',
      dataIndex: 'days61to90',
      key: 'days61to90',
      align: 'right',
      render: (amount) => formatCurrency(amount)
    },
    {
      title: '90+',
      dataIndex: 'over90',
      key: 'over90',
      align: 'right',
      render: (amount) => formatCurrency(amount)
    }
  ];

  return (
    <Card
      title={
        <span>
          Vendor Bills Aging Report
          <span style={{ marginLeft: 16, fontSize: '14px', color: '#666', fontWeight: 'normal' }}>
            As of {asOfDate.format('MMM DD, YYYY')}
          </span>
        </span>
      }
      extra={
        <DatePicker
          value={asOfDate}
          onChange={(date) => date && setAsOfDate(date)}
        />
      }
    >
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {summaryCards.map((card, index) => (
          <Col xs={24} sm={12} lg={6} key={index}>
            <Card>
              <Statistic
                title={card.title}
                value={card.value}
                precision={0}
                prefix="PKR"
                valueStyle={{ color: card.color }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Total Amount Due"
              value={data?.summary?.total || 0}
              prefix="PKR"
              valueStyle={{ color: '#1890ff', fontSize: '24px' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Vendors with Dues"
              value={data?.statistics?.totalVendorsWithDues || 0}
              suffix="vendors"
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Avg Days Overdue"
              value={data?.statistics?.averageDaysOverdue || 0}
              suffix="days"
              prefix={data?.statistics?.averageDaysOverdue > 30 ? <WarningOutlined /> : <CheckCircleOutlined />}
              valueStyle={{
                color: data?.statistics?.averageDaysOverdue > 30 ? '#faad14' : '#52c41a'
              }}
            />
          </Card>
        </Col>
      </Row>

      <Collapse defaultActiveKey={['1']} style={{ marginBottom: 16 }}>
        <Panel header="Vendor-wise Summary" key="1">
          <Table
            dataSource={data?.vendorSummary || []}
            columns={vendorColumns}
            pagination={false}
            rowKey={(record) => record.vendor.id}
            size="small"
          />
        </Panel>
      </Collapse>

      <Card title="Aging Details" style={{ marginTop: 16 }}>
        <Collapse accordion>
          <Panel
            header={`Current (0-30 days) - ${formatCurrency(data?.summary?.current || 0)}`}
            key="current"
          >
            <Table
              dataSource={data?.buckets?.current || []}
              columns={agingColumns}
              pagination={{ pageSize: 10 }}
              rowKey="id"
              size="small"
            />
          </Panel>
          <Panel
            header={`31-60 Days - ${formatCurrency(data?.summary?.days31to60 || 0)}`}
            key="31-60"
          >
            <Table
              dataSource={data?.buckets?.days31to60 || []}
              columns={agingColumns}
              pagination={{ pageSize: 10 }}
              rowKey="id"
              size="small"
            />
          </Panel>
          <Panel
            header={`61-90 Days - ${formatCurrency(data?.summary?.days61to90 || 0)}`}
            key="61-90"
          >
            <Table
              dataSource={data?.buckets?.days61to90 || []}
              columns={agingColumns}
              pagination={{ pageSize: 10 }}
              rowKey="id"
              size="small"
            />
          </Panel>
          <Panel
            header={`Over 90 Days - ${formatCurrency(data?.summary?.over90 || 0)}`}
            key="90+"
          >
            <Table
              dataSource={data?.buckets?.over90 || []}
              columns={agingColumns}
              pagination={{ pageSize: 10 }}
              rowKey="id"
              size="small"
            />
          </Panel>
        </Collapse>
      </Card>
    </Card>
  );
};

export default VendorBillsAgingReport;
