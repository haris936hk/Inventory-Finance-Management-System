import React, { useState } from 'react';
import { Card, DatePicker, Spin, Row, Col, Statistic, Table } from 'antd';
import { useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatCurrency } from '../../config/constants';

const { RangePicker } = DatePicker;

const CashFlowReport = () => {
  const [dateRange, setDateRange] = useState([
    dayjs().startOf('month'),
    dayjs().endOf('month')
  ]);

  const { data, isLoading } = useQuery(
    ['cash-flow', dateRange],
    async () => {
      const response = await axios.get('/reports/cash-flow', {
        params: {
          startDate: dateRange[0].format('YYYY-MM-DD'),
          endDate: dateRange[1].format('YYYY-MM-DD')
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

  const cashFlowData = [
    {
      key: '1',
      section: 'OPERATING ACTIVITIES',
      isHeader: true
    },
    {
      key: '2',
      description: 'Cash from Customers',
      amount: data?.operating?.receipts || 0
    },
    {
      key: '3',
      description: 'Cash to Suppliers',
      amount: -(data?.operating?.payments || 0)
    },
    {
      key: '4',
      description: 'Net Operating Cash Flow',
      amount: data?.operating?.net || 0,
      isSubtotal: true
    },
    {
      key: '5',
      section: 'INVESTING ACTIVITIES',
      isHeader: true
    },
    {
      key: '6',
      description: 'Asset Purchases',
      amount: -(data?.investing?.assetPurchases || 0)
    },
    {
      key: '7',
      description: 'Asset Sales',
      amount: data?.investing?.assetSales || 0
    },
    {
      key: '8',
      description: 'Net Investing Cash Flow',
      amount: data?.investing?.net || 0,
      isSubtotal: true
    },
    {
      key: '9',
      section: 'FINANCING ACTIVITIES',
      isHeader: true
    },
    {
      key: '10',
      description: 'Borrowings',
      amount: data?.financing?.borrowings || 0
    },
    {
      key: '11',
      description: 'Repayments',
      amount: -(data?.financing?.repayments || 0)
    },
    {
      key: '12',
      description: 'Net Financing Cash Flow',
      amount: data?.financing?.net || 0,
      isSubtotal: true
    },
    {
      key: '13',
      description: 'NET CHANGE IN CASH',
      amount: data?.netChange || 0,
      isTotal: true
    }
  ];

  const columns = [
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (text, record) => {
        if (record.isHeader) {
          return (
            <div style={{ fontWeight: 'bold', fontSize: '14px', marginTop: '8px' }}>
              {record.section}
            </div>
          );
        }
        return (
          <div style={{
            paddingLeft: record.isTotal ? 0 : 20,
            fontWeight: record.isTotal || record.isSubtotal ? 'bold' : 'normal'
          }}>
            {text}
          </div>
        );
      }
    },
    {
      title: 'Amount (PKR)',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (amount, record) => {
        if (record.isHeader) return null;
        return (
          <span style={{
            fontWeight: record.isTotal || record.isSubtotal ? 'bold' : 'normal',
            color: record.isTotal
              ? (amount >= 0 ? '#52c41a' : '#ff4d4f')
              : 'inherit'
          }}>
            {formatCurrency(amount)}
          </span>
        );
      }
    }
  ];

  return (
    <Card
      title={
        <span>
          Cash Flow Statement
          <span style={{ marginLeft: 16, fontSize: '14px', color: '#666', fontWeight: 'normal' }}>
            {dateRange[0].format('MMM DD')} - {dateRange[1].format('MMM DD, YYYY')}
          </span>
        </span>
      }
      extra={
        <RangePicker
          value={dateRange}
          onChange={(dates) => dates && setDateRange(dates)}
        />
      }
    >
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="Operating Cash Flow"
              value={data?.operating?.net || 0}
              prefix="PKR"
              valueStyle={{ color: (data?.operating?.net || 0) >= 0 ? '#52c41a' : '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Investing Cash Flow"
              value={data?.investing?.net || 0}
              prefix="PKR"
              valueStyle={{ color: (data?.investing?.net || 0) >= 0 ? '#52c41a' : '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Net Change in Cash"
              value={data?.netChange || 0}
              prefix="PKR"
              valueStyle={{
                color: (data?.netChange || 0) >= 0 ? '#52c41a' : '#ff4d4f',
                fontSize: '20px'
              }}
            />
          </Card>
        </Col>
      </Row>

      <Table
        dataSource={cashFlowData}
        columns={columns}
        pagination={false}
        showHeader={false}
      />
    </Card>
  );
};

export default CashFlowReport;
