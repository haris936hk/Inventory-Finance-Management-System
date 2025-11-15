import React, { useState } from 'react';
import { Card, Table, DatePicker, Button, Row, Col, Statistic, Tag, Space, Spin } from 'antd';
import { DownloadOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatCurrency } from '../../config/constants';

const TrialBalanceReport = () => {
  const [asOfDate, setAsOfDate] = useState(dayjs());

  const { data, isLoading, refetch } = useQuery(
    ['trial-balance', asOfDate?.format('YYYY-MM-DD')],
    async () => {
      const response = await axios.get('/reports/trial-balance', {
        params: { asOfDate: asOfDate.format('YYYY-MM-DD') }
      });
      return response.data.data;
    },
    { enabled: !!asOfDate }
  );

  const handleExport = () => {
    // TODO: Implement export functionality
    console.log('Export trial balance');
  };

  const columns = [
    {
      title: 'Account Code',
      dataIndex: 'code',
      key: 'code',
      width: 150,
      sorter: (a, b) => a.code.localeCompare(b.code),
    },
    {
      title: 'Account Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: 'Account Type',
      dataIndex: 'type',
      key: 'type',
      width: 150,
      filters: [
        { text: 'Asset', value: 'Asset' },
        { text: 'Liability', value: 'Liability' },
        { text: 'Equity', value: 'Equity' },
        { text: 'Income', value: 'Income' },
        { text: 'Expense', value: 'Expense' },
      ],
      onFilter: (value, record) => record.type === value,
      render: (type) => {
        const colors = {
          'Asset': 'green',
          'Liability': 'red',
          'Equity': 'blue',
          'Income': 'cyan',
          'Expense': 'orange'
        };
        return <Tag color={colors[type] || 'default'}>{type}</Tag>;
      }
    },
    {
      title: 'Debit',
      dataIndex: 'debit',
      key: 'debit',
      width: 150,
      align: 'right',
      render: (amount) => amount > 0 ? formatCurrency(amount) : '-',
    },
    {
      title: 'Credit',
      dataIndex: 'credit',
      key: 'credit',
      width: 150,
      align: 'right',
      render: (amount) => amount > 0 ? formatCurrency(amount) : '-',
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

  const accounts = data?.accounts || [];
  const totals = data?.totals || { debit: 0, credit: 0, balanced: false };

  return (
    <Card
      title={`Trial Balance - As of ${asOfDate.format('DD/MM/YYYY')}`}
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
      {/* Balance Status */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Total Debit"
              value={totals.debit || 0}
              prefix="PKR"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Total Credit"
              value={totals.credit || 0}
              prefix="PKR"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Balance Status"
              value={totals.balanced ? 'Balanced' : 'Not Balanced'}
              valueStyle={{ color: totals.balanced ? '#52c41a' : '#ff4d4f' }}
              prefix={
                totals.balanced ? (
                  <CheckCircleOutlined />
                ) : (
                  <CloseCircleOutlined />
                )
              }
            />
            <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              Difference: PKR {Math.abs(totals.debit - totals.credit).toFixed(2)}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Accounts Table */}
      <Table
        columns={columns}
        dataSource={accounts}
        rowKey={(record) => record.code}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showTotal: (total) => `Total ${total} accounts`,
        }}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row style={{ fontWeight: 'bold', backgroundColor: '#fafafa' }}>
              <Table.Summary.Cell colSpan={3} align="right">
                TOTAL
              </Table.Summary.Cell>
              <Table.Summary.Cell align="right">
                {formatCurrency(totals.debit || 0)}
              </Table.Summary.Cell>
              <Table.Summary.Cell align="right">
                {formatCurrency(totals.credit || 0)}
              </Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </Card>
  );
};

export default TrialBalanceReport;
