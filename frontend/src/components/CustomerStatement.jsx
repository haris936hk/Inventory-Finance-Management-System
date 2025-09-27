import React, { useState } from 'react';
import {
  Card,
  Table,
  Row,
  Col,
  Statistic,
  DatePicker,
  Button,
  Space,
  Empty,
  Spin,
  Typography,
  Divider,
  message
} from 'antd';
import {
  DownloadOutlined,
  PrinterOutlined,
  CalendarOutlined
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatPKR } from '../config/constants';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const CustomerStatement = ({ customerId }) => {
  const [dateRange, setDateRange] = useState([
    dayjs().startOf('month'),
    dayjs().endOf('month')
  ]);

  // Fetch statement data
  const { data: statementData, isLoading, error } = useQuery(
    ['customer-statement', customerId, dateRange],
    async () => {
      const params = {};
      if (dateRange.length === 2) {
        params.dateFrom = dateRange[0].format('YYYY-MM-DD');
        params.dateTo = dateRange[1].format('YYYY-MM-DD');
      }

      const response = await axios.get(`/finance/customers/${customerId}/statement`, { params });
      return response.data.data;
    },
    {
      enabled: !!customerId,
      onError: (error) => {
        message.error(`Failed to load customer statement: ${error.response?.data?.message || error.message}`);
      }
    }
  );

  const handleExport = () => {
    message.info('Export functionality will be implemented soon');
  };

  const handlePrint = () => {
    window.print();
  };

  // Table columns for statement entries
  const columns = [
    {
      title: 'Date',
      dataIndex: 'entryDate',
      key: 'entryDate',
      render: (date) => dayjs(date).format('DD/MM/YYYY'),
      width: 120
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description'
    },
    {
      title: 'Invoice #',
      dataIndex: 'invoice',
      key: 'invoice',
      render: (invoice) => invoice?.invoiceNumber || '-',
      width: 120
    },
    {
      title: 'Debit',
      dataIndex: 'debit',
      key: 'debit',
      align: 'right',
      render: (amount) => amount > 0 ? (
        <Text style={{ color: '#f5222d', fontWeight: 'bold' }}>
          {formatPKR(amount)}
        </Text>
      ) : '-',
      width: 120
    },
    {
      title: 'Credit',
      dataIndex: 'credit',
      key: 'credit',
      align: 'right',
      render: (amount) => amount > 0 ? (
        <Text style={{ color: '#52c41a', fontWeight: 'bold' }}>
          {formatPKR(amount)}
        </Text>
      ) : '-',
      width: 120
    },
    {
      title: 'Balance',
      dataIndex: 'balance',
      key: 'balance',
      align: 'right',
      render: (balance) => (
        <Text style={{
          color: balance > 0 ? '#f5222d' : '#52c41a',
          fontWeight: 'bold'
        }}>
          {formatPKR(balance)}
        </Text>
      ),
      width: 120
    }
  ];

  if (error) {
    return (
      <Card>
        <Empty
          description="Failed to load customer statement"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  return (
    <div>
      {/* Statement Header */}
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
          <Col>
            <Title level={4}>
              <CalendarOutlined /> Customer Statement
            </Title>
            <Text type="secondary">
              {statementData?.customer?.name || 'Customer Statement'}
            </Text>
          </Col>
          <Col>
            <Space>
              <Button icon={<PrinterOutlined />} onClick={handlePrint}>
                Print
              </Button>
              <Button icon={<DownloadOutlined />} onClick={handleExport}>
                Export
              </Button>
            </Space>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={12}>
            <RangePicker
              value={dateRange}
              onChange={(dates) => setDateRange(dates || [])}
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              placeholder={['Start Date', 'End Date']}
            />
          </Col>
        </Row>
      </Card>

      {/* Summary Statistics */}
      {statementData && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="Opening Balance"
                value={formatPKR(statementData.openingBalance)}
                valueStyle={{
                  color: statementData.openingBalance > 0 ? '#f5222d' : '#52c41a'
                }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Total Debits"
                value={formatPKR(statementData.totalDebits)}
                valueStyle={{ color: '#f5222d' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Total Credits"
                value={formatPKR(statementData.totalCredits)}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Closing Balance"
                value={formatPKR(statementData.closingBalance)}
                valueStyle={{
                  color: statementData.closingBalance > 0 ? '#f5222d' : '#52c41a'
                }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Statement Table */}
      <Card title="Statement Details">
        <Spin spinning={isLoading}>
          <Table
            rowKey={(record, index) => index}
            columns={columns}
            dataSource={statementData?.entries || []}
            pagination={{
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) =>
                `${range[0]}-${range[1]} of ${total} entries`,
              defaultPageSize: 25
            }}
            locale={{
              emptyText: (
                <Empty
                  description="No statement entries found"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              )
            }}
            scroll={{ x: 800 }}
          />
        </Spin>
      </Card>
    </div>
  );
};

export default CustomerStatement;