import React, { useState } from 'react';
import {
  Card, Table, DatePicker, Button, Row, Col, Statistic,
  Typography, Space, message, Spin
} from 'antd';
import {
  DownloadOutlined, PrinterOutlined, ReloadOutlined
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const ProfitLossStatement = () => {
  const [dateRange, setDateRange] = useState([
    dayjs().startOf('month'),
    dayjs().endOf('month')
  ]);

  const { data: plData, isLoading, refetch } = useQuery(
    ['profit-loss', dateRange],
    async () => {
      const response = await axios.get('/reports/profit-loss', {
        params: {
          startDate: dateRange[0].format('YYYY-MM-DD'),
          endDate: dateRange[1].format('YYYY-MM-DD')
        }
      });
      return response.data.data;
    }
  );

  const handleExport = async () => {
    try {
      await axios.post('/reports/export', {
        reportType: 'profit-loss',
        format: 'pdf',
        parameters: {
          startDate: dateRange[0].format('YYYY-MM-DD'),
          endDate: dateRange[1].format('YYYY-MM-DD')
        }
      });
      message.success('P&L Statement exported successfully');
    } catch (error) {
      message.error('Export failed');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  const renderSummaryCards = () => {
    if (!plData || !plData.summary) return null;

    const { summary } = plData;

    return (
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Gross Revenue"
              value={summary.grossRevenue || 0}
              precision={0}
              prefix="PKR"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Gross Profit"
              value={summary.grossProfit || 0}
              precision={0}
              prefix="PKR"
              valueStyle={{ color: (summary.grossProfit || 0) >= 0 ? '#52c41a' : '#ff4d4f' }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Margin: {((summary.grossProfitMargin || 0).toFixed(1))}%
              </Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Operating Expenses"
              value={summary.operatingExpenses || 0}
              precision={0}
              prefix="PKR"
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Net Income"
              value={summary.netIncome || 0}
              precision={0}
              prefix="PKR"
              valueStyle={{ color: (summary.netIncome || 0) >= 0 ? '#52c41a' : '#ff4d4f' }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Margin: {((summary.netProfitMargin || 0).toFixed(1))}%
              </Text>
            </div>
          </Card>
        </Col>
      </Row>
    );
  };

  const renderProfitLossTable = () => {
    if (!plData || !plData.summary) return null;

    const { summary } = plData;

    const plItems = [
      {
        key: 'revenue',
        description: 'REVENUE',
        amount: summary.grossRevenue || 0,
        isHeader: true,
        level: 0
      },
      {
        key: 'sales',
        description: 'Sales Revenue',
        amount: summary.grossRevenue || 0,
        level: 1
      },
      {
        key: 'cogs',
        description: 'COST OF GOODS SOLD',
        amount: summary.costOfGoodsSold || 0,
        isHeader: true,
        level: 0
      },
      {
        key: 'gross-profit',
        description: 'GROSS PROFIT',
        amount: summary.grossProfit || 0,
        isTotal: true,
        level: 0
      },
      {
        key: 'expenses',
        description: 'OPERATING EXPENSES',
        amount: summary.operatingExpenses || 0,
        isHeader: true,
        level: 0
      },
      {
        key: 'net-income',
        description: 'NET INCOME',
        amount: summary.netIncome || 0,
        isTotal: true,
        isFinal: true,
        level: 0
      }
    ];

    const columns = [
      {
        title: 'Description',
        dataIndex: 'description',
        key: 'description',
        render: (text, record) => (
          <div
            style={{
              paddingLeft: record.level * 20,
              fontWeight: record.isHeader || record.isTotal ? 'bold' : 'normal',
              fontSize: record.isFinal ? '16px' : '14px'
            }}
          >
            {text}
          </div>
        )
      },
      {
        title: 'Amount (PKR)',
        dataIndex: 'amount',
        key: 'amount',
        align: 'right',
        render: (amount, record) => (
          <Text
            strong={record.isHeader || record.isTotal}
            style={{
              color: record.isFinal
                ? amount >= 0 ? '#52c41a' : '#ff4d4f'
                : record.isTotal
                ? '#1890ff'
                : 'inherit',
              fontSize: record.isFinal ? '16px' : '14px'
            }}
          >
            {formatCurrency(amount)}
          </Text>
        )
      }
    ];

    return (
      <Table
        dataSource={plItems}
        columns={columns}
        pagination={false}
        showHeader={false}
        size="small"
      />
    );
  };

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 50 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  return (
    <div>
      <Card
        title={
          <Space>
            <Title level={3} style={{ margin: 0 }}>
              Profit & Loss Statement
            </Title>
            <Text type="secondary">
              {dateRange[0].format('MMM DD')} - {dateRange[1].format('MMM DD, YYYY')}
            </Text>
          </Space>
        }
        extra={
          <Space>
            <RangePicker
              value={dateRange}
              onChange={(dates) => dates && setDateRange(dates)}
            />
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              Refresh
            </Button>
            <Button icon={<DownloadOutlined />} onClick={handleExport}>
              Export
            </Button>
            <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
              Print
            </Button>
          </Space>
        }
      >
        {renderSummaryCards()}

        <Card title="Statement Details" style={{ marginBottom: 16 }}>
          {renderProfitLossTable()}
        </Card>
      </Card>
    </div>
  );
};

export default ProfitLossStatement;