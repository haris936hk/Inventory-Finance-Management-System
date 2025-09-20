// ========== src/pages/reports/Reports.jsx ==========
import React, { useState } from 'react';
import {
  Card, Tabs, DatePicker, Button, Table, Row, Col,
  Statistic, Select, Space, Spin, message
} from 'antd';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  DownloadOutlined, ReloadOutlined, PrinterOutlined
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';

// Import comprehensive financial reports
import ProfitLossStatement from '../../components/reports/ProfitLossStatement';
import BalanceSheet from '../../components/reports/BalanceSheet';

const { RangePicker } = DatePicker;
const { TabPane } = Tabs;

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

const Reports = () => {
  const [dateRange, setDateRange] = useState([
    dayjs().startOf('month'),
    dayjs().endOf('month')
  ]);
  const [reportType, setReportType] = useState('inventory');

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

  const handleExport = async () => {
    try {
      const response = await axios.post('/reports/export', {
        reportType,
        filters: {
          startDate: dateRange[0].toISOString(),
          endDate: dateRange[1].toISOString()
        }
      });
      window.open(response.data.data.url, '_blank');
    } catch (error) {
      message.error('Export failed');
    }
  };

  const renderInventoryReport = () => {
    if (!reportData?.data?.data) return null;
    const data = reportData.data.data;

    // Prepare chart data
    const chartData = Object.entries(data.summary || {}).map(([category, statuses]) => ({
      category,
      ...statuses
    }));

    return (
      <>
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic title="Total Items" value={data.total?.count || 0} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic 
                title="Total Value" 
                value={data.total?.value || 0} 
                prefix="PKR"
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic 
                title="Available" 
                value={data.items?.filter(i => 
                  ['In Store', 'In Hand', 'In Lab'].includes(i.status)
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

  const renderFinancialReport = () => {
    if (!reportData?.data?.data) return null;
    const data = reportData.data.data;

    return (
      <>
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic 
                title="Total Revenue" 
                value={data.income?.invoiced || 0} 
                prefix="PKR"
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic 
                title="Received" 
                value={data.income?.received || 0} 
                prefix="PKR"
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic 
                title="Outstanding" 
                value={data.income?.outstanding || 0} 
                prefix="PKR"
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic 
                title="Net Profit" 
                value={data.profitLoss?.netProfit || 0} 
                prefix="PKR"
                valueStyle={{ 
                  color: data.profitLoss?.netProfit > 0 ? '#52c41a' : '#ff4d4f' 
                }}
              />
            </Card>
          </Col>
        </Row>

        <Card title="Cash Flow">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={[
                { name: 'Inflow', value: data.cashFlow?.inflow || 0 },
                { name: 'Outflow', value: data.cashFlow?.outflow || 0 },
                { name: 'Net', value: data.cashFlow?.net || 0 }
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#1890ff" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </>
    );
  };

  const renderSalesReport = () => {
    if (!reportData?.data?.data) return null;
    const data = reportData.data.data;

    const chartData = Object.entries(data.data || {}).map(([period, metrics]) => ({
      period,
      ...metrics
    }));

    return (
      <>
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col span={8}>
            <Card>
              <Statistic 
                title="Total Invoices" 
                value={data.totals?.invoices || 0}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic 
                title="Total Revenue" 
                value={data.totals?.revenue || 0} 
                prefix="PKR"
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic 
                title="Average Invoice" 
                value={data.totals?.averageInvoiceValue || 0} 
                prefix="PKR"
              />
            </Card>
          </Col>
        </Row>

        <Card title="Sales Trend">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="total" stroke="#1890ff" name="Revenue" />
              <Line type="monotone" dataKey="invoices" stroke="#52c41a" name="Invoices" />
            </LineChart>
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
                title="Profit Margin" 
                value={data.summary?.profitMargin || 0} 
                suffix="%"
                valueStyle={{ 
                  color: data.summary?.profitMargin > 0 ? '#52c41a' : '#ff4d4f' 
                }}
              />
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
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 50 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Tabs activeKey={reportType} onChange={setReportType}>
          <TabPane tab="Inventory" key="inventory">
            {renderInventoryReport()}
          </TabPane>
          <TabPane tab="Financial Summary" key="financial">
            {renderFinancialReport()}
          </TabPane>
          <TabPane tab="Profit & Loss" key="profit-loss">
            <ProfitLossStatement />
          </TabPane>
          <TabPane tab="Balance Sheet" key="balance-sheet">
            <BalanceSheet />
          </TabPane>
          <TabPane tab="Sales Analysis" key="sales">
            {renderSalesReport()}
          </TabPane>
          <TabPane tab="Stock Valuation" key="valuation">
            {renderStockValuation()}
          </TabPane>
        </Tabs>
      )}
    </Card>
  );
};

export default Reports;