import React, { useState } from 'react';
import { Card, Row, Col, Statistic, DatePicker, Select, Spin, Space, Typography } from 'antd';
import { BarChart, Bar, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatAmount } from '../../utils/decimalUtils';

const { RangePicker } = DatePicker;
const { Title } = Typography;

const CashSummaryReport = () => {
  const [dateRange, setDateRange] = useState([
    dayjs().startOf('month'),
    dayjs().endOf('month')
  ]);
  const [groupBy, setGroupBy] = useState('month');

  const { data, isLoading, error } = useQuery(
    ['cash-summary', dateRange, groupBy],
    async () => {
      const response = await axios.get('/reports/cash-summary', {
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
          Error loading cash summary report
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
      title={<Title level={4} style={{ margin: 0 }}>Cash Flow Summary</Title>}
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
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Total Cash Inflow"
              value={formatAmount(data?.summary?.totalInflow || 0)}
              prefix="PKR"
              valueStyle={{ color: '#52c41a' }}
            />
            <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
              Payments received from customers
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Total Cash Outflow"
              value={formatAmount(data?.summary?.totalOutflow || 0)}
              prefix="PKR"
              valueStyle={{ color: '#ff4d4f' }}
            />
            <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
              Payments made to vendors
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Net Cash Flow"
              value={formatAmount(data?.summary?.netCashFlow || 0)}
              prefix="PKR"
              valueStyle={{
                color: data?.summary?.netCashFlow >= 0 ? '#52c41a' : '#ff4d4f'
              }}
            />
            <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
              Inflow - Outflow
            </div>
          </Card>
        </Col>
      </Row>

      {/* Chart */}
      <Card title="Cash Flow Trend" style={{ marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={data?.cashFlow || []}>
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
            <Bar
              dataKey="inflow"
              fill="#52c41a"
              name="Cash Inflow"
            />
            <Bar
              dataKey="outflow"
              fill="#ff4d4f"
              name="Cash Outflow"
            />
            <Line
              type="monotone"
              dataKey="netCashFlow"
              stroke="#1890ff"
              strokeWidth={2}
              name="Net Cash Flow"
              dot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ marginTop: 16, padding: '12px', backgroundColor: '#f0f5ff', borderRadius: '4px' }}>
          <strong>Understanding this chart:</strong>
          <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}>
            <li><span style={{ color: '#52c41a' }}>■ Green bars</span> show cash received from customers</li>
            <li><span style={{ color: '#ff4d4f' }}>■ Red bars</span> show cash paid to vendors</li>
            <li><span style={{ color: '#1890ff' }}>■ Blue line</span> shows net cash position (inflow - outflow)</li>
            <li>Positive net cash means more money coming in than going out</li>
          </ul>
        </div>
      </Card>

      {/* Additional Info */}
      <Card title="Cash Flow Health" size="small">
        <div style={{ padding: '8px 0' }}>
          {data?.summary?.netCashFlow >= 0 ? (
            <div style={{ color: '#52c41a' }}>
              ✓ Positive cash flow - Your business is generating more cash than it's spending
            </div>
          ) : (
            <div style={{ color: '#ff4d4f' }}>
              ⚠ Negative cash flow - Your business is spending more cash than it's generating
            </div>
          )}
        </div>
      </Card>
    </Card>
  );
};

export default CashSummaryReport;
