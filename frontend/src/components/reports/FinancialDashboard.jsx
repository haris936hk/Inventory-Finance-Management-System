import React, { useState } from 'react';
import { Card, Row, Col, Statistic, Select, Spin } from 'antd';
import { useQuery } from 'react-query';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import axios from 'axios';
import { formatCurrency } from '../../config/constants';

const { Option } = Select;

const FinancialDashboard = () => {
  const [period, setPeriod] = useState('month');

  const { data, isLoading } = useQuery(
    ['financial-dashboard', period],
    async () => {
      const response = await axios.get('/reports/financial-dashboard', {
        params: { period }
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

  const dashboard = data || {};
  const revenue = dashboard.revenue || {};
  const profit = dashboard.profit || {};
  const cashFlow = dashboard.cashFlow || {};
  const receivables = dashboard.receivables || {};
  const inventory = dashboard.inventory || {};

  return (
    <Card
      title="Financial Dashboard Summary"
      extra={
        <Select
          value={period}
          onChange={setPeriod}
          style={{ width: 120 }}
        >
          <Option value="month">This Month</Option>
          <Option value="quarter">This Quarter</Option>
          <Option value="year">This Year</Option>
        </Select>
      }
    >
      {/* Revenue Section */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={24}>
          <h3>Revenue & Profitability</h3>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="Total Revenue"
              value={revenue.total || 0}
              prefix="PKR"
              valueStyle={{ color: '#3f8600' }}
              suffix={
                revenue.growth > 0 ? (
                  <ArrowUpOutlined />
                ) : revenue.growth < 0 ? (
                  <ArrowDownOutlined />
                ) : null
              }
            />
            {revenue.growth !== undefined && (
              <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
                Growth: {revenue.growth > 0 ? '+' : ''}{revenue.growth}%
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="Gross Profit"
              value={profit.gross || 0}
              prefix="PKR"
              valueStyle={{ color: '#1890ff' }}
            />
            <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              Margin: {profit.margin ? profit.margin.toFixed(2) : 0}%
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="Net Profit"
              value={profit.net || 0}
              prefix="PKR"
              valueStyle={{ color: profit.net >= 0 ? '#52c41a' : '#ff4d4f' }}
            />
            <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              Margin: {profit.margin ? profit.margin.toFixed(2) : 0}%
            </div>
          </Card>
        </Col>
      </Row>

      {/* Cash Flow Section */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={24}>
          <h3>Cash Flow & Liquidity</h3>
        </Col>
        <Col xs={24} sm={12}>
          <Card>
            <Statistic
              title="Operating Cash Flow"
              value={cashFlow.operating || 0}
              prefix="PKR"
              valueStyle={{ color: cashFlow.operating >= 0 ? '#52c41a' : '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card>
            <Statistic
              title="Available Cash"
              value={cashFlow.available || 0}
              prefix="PKR"
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Receivables & Inventory Section */}
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <h3>Working Capital</h3>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="Total Receivables"
              value={receivables.total || 0}
              prefix="PKR"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="Overdue Amount"
              value={receivables.overdue || 0}
              prefix="PKR"
              valueStyle={{ color: receivables.overdue > 0 ? '#ff4d4f' : '#52c41a' }}
            />
            <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              {receivables.overduePercentage ? receivables.overduePercentage.toFixed(1) : 0}% of total
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="Inventory Value"
              value={inventory.value || 0}
              prefix="PKR"
            />
          </Card>
        </Col>
      </Row>
    </Card>
  );
};

export default FinancialDashboard;
