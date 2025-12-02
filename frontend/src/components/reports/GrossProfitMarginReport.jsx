import React, { useState } from 'react';
import {
  Card, Table, DatePicker, Button, Row, Col, Statistic,
  Typography, Space, Spin, Progress
} from 'antd';
import {
  ReloadOutlined
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatCurrency } from '../../config/constants';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const GrossProfitMarginReport = () => {
  const [dateRange, setDateRange] = useState([
    dayjs().startOf('month'),
    dayjs().endOf('month')
  ]);

  const { data: marginData, isLoading, refetch } = useQuery(
    ['gross-profit-margin', dateRange],
    async () => {
      const response = await axios.get('/reports/gross-profit-margin', {
        params: {
          startDate: dateRange[0].format('YYYY-MM-DD'),
          endDate: dateRange[1].format('YYYY-MM-DD')
        }
      });
      return response.data.data;
    }
  );


  const renderSummaryCards = () => {
    if (!marginData || !marginData.summary) return null;

    const { summary } = marginData;

    return (
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Gross Profit Margin"
              value={summary.grossProfitMargin || 0}
              precision={2}
              suffix="%"
              valueStyle={{
                color: summary.grossProfitMargin >= 30 ? '#52c41a' :
                       summary.grossProfitMargin >= 15 ? '#faad14' : '#ff4d4f'
              }}
            />
            <Progress
              percent={summary.grossProfitMargin || 0}
              strokeColor={
                summary.grossProfitMargin >= 30 ? '#52c41a' :
                summary.grossProfitMargin >= 15 ? '#faad14' : '#ff4d4f'
              }
              showInfo={false}
              style={{ marginTop: 8 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Gross Revenue"
              value={summary.grossRevenue || 0}
              precision={0}
              prefix="PKR"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Cost of Goods Sold"
              value={summary.costOfGoodsSold || 0}
              precision={0}
              prefix="PKR"
              valueStyle={{ color: '#faad14' }}
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
              valueStyle={{ color: summary.grossProfit >= 0 ? '#52c41a' : '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>
    );
  };

  const categoryColumns = [
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      sorter: (a, b) => a.category.localeCompare(b.category)
    },
    {
      title: 'Revenue',
      dataIndex: 'revenue',
      key: 'revenue',
      align: 'right',
      render: (value) => formatCurrency(value),
      sorter: (a, b) => a.revenue - b.revenue
    },
    {
      title: 'Cost',
      dataIndex: 'cost',
      key: 'cost',
      align: 'right',
      render: (value) => formatCurrency(value),
      sorter: (a, b) => a.cost - b.cost
    },
    {
      title: 'Profit',
      dataIndex: 'profit',
      key: 'profit',
      align: 'right',
      render: (value) => (
        <Text style={{ color: value >= 0 ? '#52c41a' : '#ff4d4f' }}>
          {formatCurrency(value)}
        </Text>
      ),
      sorter: (a, b) => a.profit - b.profit
    },
    {
      title: 'Margin %',
      dataIndex: 'margin',
      key: 'margin',
      align: 'right',
      render: (value) => (
        <Text strong style={{
          color: value >= 30 ? '#52c41a' :
                 value >= 15 ? '#faad14' : '#ff4d4f'
        }}>
          {value.toFixed(2)}%
        </Text>
      ),
      sorter: (a, b) => a.margin - b.margin,
      defaultSortOrder: 'descend'
    },
    {
      title: 'Units Sold',
      dataIndex: 'unitsSold',
      key: 'unitsSold',
      align: 'right',
      sorter: (a, b) => a.unitsSold - b.unitsSold
    }
  ];

  const productColumns = [
    {
      title: 'Product',
      dataIndex: 'product',
      key: 'product',
      sorter: (a, b) => a.product.localeCompare(b.product)
    },
    {
      title: 'Revenue',
      dataIndex: 'revenue',
      key: 'revenue',
      align: 'right',
      render: (value) => formatCurrency(value),
      sorter: (a, b) => a.revenue - b.revenue
    },
    {
      title: 'Cost',
      dataIndex: 'cost',
      key: 'cost',
      align: 'right',
      render: (value) => formatCurrency(value),
      sorter: (a, b) => a.cost - b.cost
    },
    {
      title: 'Profit',
      dataIndex: 'profit',
      key: 'profit',
      align: 'right',
      render: (value) => (
        <Text style={{ color: value >= 0 ? '#52c41a' : '#ff4d4f' }}>
          {formatCurrency(value)}
        </Text>
      ),
      sorter: (a, b) => a.profit - b.profit
    },
    {
      title: 'Margin %',
      dataIndex: 'margin',
      key: 'margin',
      align: 'right',
      render: (value) => (
        <Text strong style={{
          color: value >= 30 ? '#52c41a' :
                 value >= 15 ? '#faad14' : '#ff4d4f'
        }}>
          {value.toFixed(2)}%
        </Text>
      ),
      sorter: (a, b) => a.margin - b.margin,
      defaultSortOrder: 'descend'
    },
    {
      title: 'Units',
      dataIndex: 'unitsSold',
      key: 'unitsSold',
      align: 'right',
      sorter: (a, b) => a.unitsSold - b.unitsSold
    }
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

  return (
    <div>
      <Card
        title={
          <Space>
            <Title level={3} style={{ margin: 0 }}>
              Gross Profit Margin Report
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
          </Space>
        }
      >
        {renderSummaryCards()}

        <Card
          title="What is Gross Profit Margin?"
          style={{ marginBottom: 16, backgroundColor: '#f0f5ff' }}
        >
          <Text>
            <strong>Gross Profit Margin</strong> shows the percentage of revenue that exceeds the cost of goods sold.
            It's calculated as: <strong>(Revenue - COGS) ÷ Revenue × 100</strong>
            <br /><br />
            <strong>Interpretation:</strong>
            <ul style={{ marginTop: 8 }}>
              <li><span style={{ color: '#52c41a' }}>✓ Good: ≥ 30%</span></li>
              <li><span style={{ color: '#faad14' }}>⚠ Average: 15-30%</span></li>
              <li><span style={{ color: '#ff4d4f' }}>✗ Low: &lt; 15%</span></li>
            </ul>
            Higher margins indicate better pricing power and cost management.
          </Text>
        </Card>

        {marginData?.categoryBreakdown && marginData.categoryBreakdown.length > 0 && (
          <Card title="Category-wise Margins" style={{ marginBottom: 16 }}>
            <Table
              dataSource={marginData.categoryBreakdown}
              columns={categoryColumns}
              pagination={{ pageSize: 10 }}
              rowKey="category"
              size="small"
            />
          </Card>
        )}

        {marginData?.topProducts && marginData.topProducts.length > 0 && (
          <Card title="Top Products by Margin">
            <Table
              dataSource={marginData.topProducts}
              columns={productColumns}
              pagination={{ pageSize: 10 }}
              rowKey="product"
              size="small"
            />
          </Card>
        )}
      </Card>
    </div>
  );
};

export default GrossProfitMarginReport;
