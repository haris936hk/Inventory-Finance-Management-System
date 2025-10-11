import React, { useState } from 'react';
import {
  Card, Table, DatePicker, Button, Row, Col, Statistic,
  Typography, Space, message, Spin
} from 'antd';
import {
  DownloadOutlined, ReloadOutlined
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatCurrency } from '../../config/constants';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const InventoryTurnoverReport = () => {
  const [dateRange, setDateRange] = useState([
    dayjs().startOf('month'),
    dayjs().endOf('month')
  ]);

  const { data: turnoverData, isLoading, refetch } = useQuery(
    ['inventory-turnover', dateRange],
    async () => {
      const response = await axios.get('/reports/inventory-turnover', {
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
        reportType: 'inventory-turnover',
        format: 'pdf',
        parameters: {
          startDate: dateRange[0].format('YYYY-MM-DD'),
          endDate: dateRange[1].format('YYYY-MM-DD')
        }
      });
      message.success('Inventory Turnover Report exported successfully');
    } catch (error) {
      message.error('Export failed');
    }
  };

  const renderSummaryCards = () => {
    if (!turnoverData || !turnoverData.summary) return null;

    const { summary } = turnoverData;

    return (
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Inventory Turnover Ratio"
              value={summary.inventoryTurnoverRatio || 0}
              precision={2}
              suffix="times"
              valueStyle={{ color: '#1890ff' }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Higher is better
              </Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Days Sales in Inventory"
              value={summary.daysSalesInInventory || 0}
              precision={0}
              suffix="days"
              valueStyle={{ color: '#52c41a' }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Lower is better
              </Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Average Inventory Value"
              value={summary.averageInventory || 0}
              precision={0}
              prefix="PKR"
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
      title: 'Units Sold',
      dataIndex: 'unitsSold',
      key: 'unitsSold',
      align: 'right',
      sorter: (a, b) => a.unitsSold - b.unitsSold
    },
    {
      title: 'COGS',
      dataIndex: 'cogs',
      key: 'cogs',
      align: 'right',
      render: (value) => formatCurrency(value),
      sorter: (a, b) => a.cogs - b.cogs
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
              Inventory Turnover Report
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
          </Space>
        }
      >
        {renderSummaryCards()}

        <Card
          title="What is Inventory Turnover?"
          style={{ marginBottom: 16, backgroundColor: '#f0f5ff' }}
        >
          <Text>
            <strong>Inventory Turnover Ratio</strong> measures how many times inventory is sold and replaced during a period.
            It's calculated as: <strong>COGS ÷ Average Inventory Value</strong>
            <br /><br />
            <strong>Days Sales in Inventory</strong> shows how many days it takes to sell inventory.
            It's calculated as: <strong>365 ÷ Inventory Turnover Ratio</strong>
            <br /><br />
            A higher turnover ratio (and lower days in inventory) generally indicates efficient inventory management.
          </Text>
        </Card>

        {turnoverData?.categoryBreakdown && turnoverData.categoryBreakdown.length > 0 && (
          <Card title="Category-wise Breakdown" style={{ marginBottom: 16 }}>
            <Table
              dataSource={turnoverData.categoryBreakdown}
              columns={categoryColumns}
              pagination={false}
              rowKey="category"
              size="small"
            />
          </Card>
        )}

        {turnoverData?.summary && (
          <Card title="Inventory Values">
            <Row gutter={[16, 16]}>
              <Col span={8}>
                <Statistic
                  title="Beginning Inventory"
                  value={turnoverData.summary.beginningInventory || 0}
                  precision={0}
                  prefix="PKR"
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Ending Inventory"
                  value={turnoverData.summary.endingInventory || 0}
                  precision={0}
                  prefix="PKR"
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Average Inventory"
                  value={turnoverData.summary.averageInventory || 0}
                  precision={0}
                  prefix="PKR"
                  valueStyle={{ color: '#1890ff' }}
                />
              </Col>
            </Row>
          </Card>
        )}
      </Card>
    </div>
  );
};

export default InventoryTurnoverReport;
