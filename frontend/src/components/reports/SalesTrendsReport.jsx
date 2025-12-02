import React, { useState } from 'react';
import { Card, Row, Col, Statistic, DatePicker, Select, Spin, Space, Typography } from 'antd';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatAmount } from '../../utils/decimalUtils';

const { RangePicker } = DatePicker;
const { Title } = Typography;

const SalesTrendsReport = () => {
  const [dateRange, setDateRange] = useState([
    dayjs().startOf('month'),
    dayjs().endOf('month')
  ]);
  const [groupBy, setGroupBy] = useState('day');

  const { data, isLoading, error } = useQuery(
    ['sales-trends', dateRange, groupBy],
    async () => {
      const response = await axios.get('/reports/sales-trends', {
        params: {
          startDate: dateRange[0].format('YYYY-MM-DD'),
          endDate: dateRange[1].format('YYYY-MM-DD'),
          groupBy
        }
      });
      return response.data.data;
    }
  );

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 50 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 50, color: '#ff4d4f' }}>
          Error loading sales trends report
        </div>
      </Card>
    );
  }

  const formatCurrency = (value) => {
    return `PKR ${Number(value).toLocaleString('en-PK', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    })}`;
  };

  return (
    <Card
      title={<Title level={4} style={{ margin: 0 }}>Sales Revenue Trends</Title>}
      extra={
        <Space>
          <RangePicker
            value={dateRange}
            onChange={(dates) => dates && setDateRange(dates)}
          />
          <Select
            value={groupBy}
            onChange={setGroupBy}
            style={{ width: 120 }}
          >
            <Select.Option value="day">Daily</Select.Option>
            <Select.Option value="week">Weekly</Select.Option>
            <Select.Option value="month">Monthly</Select.Option>
          </Select>
        </Space>
      }
    >
      {/* Stats Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Invoiced"
              value={formatAmount(data?.summary?.totalInvoiced || 0)}
              prefix="PKR"
              valueStyle={{ color: '#1890ff' }}
            />
            <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
              Revenue recognized (accrual)
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Collected"
              value={formatAmount(data?.summary?.totalCollected || 0)}
              prefix="PKR"
              valueStyle={{ color: '#52c41a' }}
            />
            <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
              Cash received
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Outstanding"
              value={formatAmount(data?.summary?.outstanding || 0)}
              prefix="PKR"
              valueStyle={{ color: '#faad14' }}
            />
            <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
              Yet to be collected
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Collection Rate"
              value={formatAmount(data?.summary?.collectionRate || 0, 2)}
              suffix="%"
              precision={2}
              valueStyle={{
                color: data?.summary?.collectionRate >= 80 ? '#52c41a' :
                       data?.summary?.collectionRate >= 60 ? '#faad14' : '#ff4d4f'
              }}
            />
            <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
              Collected / Invoiced
            </div>
          </Card>
        </Col>
      </Row>

      {/* Chart */}
      <Card title="Revenue Trend (Invoiced vs Collected)" style={{ marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={data?.trends || []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="period"
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`}
            />
            <Tooltip formatter={(value) => formatCurrency(value)} />
            <Legend />
            <Area
              type="monotone"
              dataKey="collected"
              fill="#52c41a"
              stroke="#52c41a"
              fillOpacity={0.6}
              name="Revenue Collected"
            />
            <Line
              type="monotone"
              dataKey="invoiced"
              stroke="#1890ff"
              strokeWidth={2}
              name="Revenue Invoiced"
              dot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ marginTop: 16, padding: '12px', backgroundColor: '#f0f5ff', borderRadius: '4px' }}>
          <strong>Understanding this chart:</strong>
          <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}>
            <li><span style={{ color: '#1890ff' }}>■ Blue line</span> shows invoiced revenue (when you bill customers)</li>
            <li><span style={{ color: '#52c41a' }}>■ Green area</span> shows collected revenue (cash actually received)</li>
            <li>The gap between them represents outstanding receivables</li>
          </ul>
        </div>
      </Card>
    </Card>
  );
};

export default SalesTrendsReport;
