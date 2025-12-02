// ========== src/pages/reports/Reports.jsx ==========
import React, { useState } from 'react';
import {
  Card, Tabs, Table, Row, Col,
  Statistic, Typography, Spin
} from 'antd';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';

// Import financial reports
import ARAgingReport from '../../components/reports/ARAgingReport';
import InventoryTurnoverReport from '../../components/reports/InventoryTurnoverReport';
import GrossProfitMarginReport from '../../components/reports/GrossProfitMarginReport';
// Import new simple ledger reports
import SalesTrendsReport from '../../components/reports/SalesTrendsReport';
import CashSummaryReport from '../../components/reports/CashSummaryReport';
import CustomerAnalysisReport from '../../components/reports/CustomerAnalysisReport';

const { TabPane } = Tabs;
const { Text } = Typography;

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

const Reports = () => {
  const [dateRange, setDateRange] = useState([
    dayjs().startOf('month'),
    dayjs().endOf('month')
  ]);
  const [reportType, setReportType] = useState('sales-trends');

  // Fetch report data
  const { data: reportData, isLoading, refetch } = useQuery(
    ['reports', reportType, dateRange],
    async () => {
      const params = {
        startDate: dateRange[0].toISOString(),
        endDate: dateRange[1].toISOString()
      };

      switch (reportType) {
        case 'inventory':
          return axios.get('/reports/inventory', { params });
        case 'financial':
          return axios.get('/reports/financial-summary', { params });
        case 'sales':
          return axios.get('/reports/sales', { params });
        case 'valuation':
          return axios.get('/reports/stock-valuation');
        default:
          return null;
      }
    },
    {
      enabled: !!reportType
    }
  );


  const renderInventoryReport = () => {
    if (!reportData?.data?.data) return null;
    const data = reportData.data.data;

    // Prepare chart data - extract count from each status object
    const chartData = Object.entries(data.summary || {}).map(([category, statuses]) => {
      const categoryData = { category };
      Object.entries(statuses).forEach(([status, values]) => {
        categoryData[status] = values?.count || 0;
      });
      return categoryData;
    });

    return (
      <>
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="Total Items"
                value={typeof data.total === 'object' ? (data.total?.count || 0) : (data.total || 0)}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Total Value"
                value={typeof data.total === 'object' ? (data.total?.value || 0) : 0}
                prefix="PKR"
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Available"
                value={data.items?.filter(i =>
                  (i.status === 'In Store' || i.status === 'In Lab') && i.repaired !== 'Returned'
                ).length || 0}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic 
                title="Sold/Delivered" 
                value={data.items?.filter(i => 
                  ['Sold', 'Delivered'].includes(i.status)
                ).length || 0}
              />
            </Card>
          </Col>
        </Row>

        <Card title="Category Distribution" style={{ marginBottom: 16 }}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="In Store" stackId="a" fill="#52c41a" />
              <Bar dataKey="Sold" stackId="a" fill="#faad14" />
              <Bar dataKey="Delivered" stackId="a" fill="#1890ff" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </>
    );
  };


  const renderStockValuation = () => {
    if (!reportData?.data?.data) return null;
    const data = reportData.data.data;

    const pieData = Object.entries(data.categories || {}).map(([category, values]) => ({
      name: category,
      value: values.totalValue
    }));

    return (
      <>
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic 
                title="Total Items" 
                value={data.summary?.totalItems || 0}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic 
                title="Total Cost" 
                value={data.summary?.totalCost || 0} 
                prefix="PKR"
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic 
                title="Total Value" 
                value={data.summary?.totalValue || 0} 
                prefix="PKR"
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Potential Profit"
                value={data.summary?.potentialProfit || 0}
                prefix="PKR"
                valueStyle={{
                  color: (data.summary?.potentialProfit || 0) > 0 ? '#52c41a' : '#ff4d4f'
                }}
              />
              <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
                Margin: {data.summary?.potentialMargin || 0}%
              </div>
            </Card>
          </Col>
        </Row>

        <Card title="Category Valuation">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => entry.name}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </>
    );
  };

  return (
    <Card
      title="Reports & Analytics"
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 50 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Tabs activeKey={reportType} onChange={setReportType}>
          <TabPane tab="Sales Trends" key="sales-trends">
            <SalesTrendsReport />
          </TabPane>
          <TabPane tab="Cash Flow" key="cash-summary">
            <CashSummaryReport />
          </TabPane>
          <TabPane tab="Customer Analysis" key="customer-analysis">
            <CustomerAnalysisReport />
          </TabPane>
          <TabPane tab="Real-time Stock Levels" key="inventory">
            {renderInventoryReport()}
          </TabPane>
          <TabPane tab="Stock Valuation" key="valuation">
            {renderStockValuation()}
          </TabPane>
          <TabPane tab="Inventory Turnover" key="inventory-turnover">
            <InventoryTurnoverReport />
          </TabPane>
          <TabPane tab="Gross Profit Margin" key="gross-profit-margin">
            <GrossProfitMarginReport />
          </TabPane>
          <TabPane tab="Accounts Receivable Aging" key="ar-aging">
            <ARAgingReport />
          </TabPane>
        </Tabs>
      )}
    </Card>
  );
};

export default Reports;