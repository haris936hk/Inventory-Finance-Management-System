import React, { useState } from 'react';
import {
  Card, Table, DatePicker, Button, Row, Col, Statistic,
  Typography, Alert, Space, message, Spin
} from 'antd';
import {
  DownloadOutlined, PrinterOutlined, ReloadOutlined,
  CheckCircleOutlined, WarningOutlined
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatCurrency } from '../../config/constants';

const { Title, Text } = Typography;

const BalanceSheet = () => {
  const [asOfDate, setAsOfDate] = useState(dayjs());

  const { data: balanceSheetData, isLoading, refetch } = useQuery(
    ['balance-sheet', asOfDate],
    async () => {
      const response = await axios.get('/reports/balance-sheet', {
        params: {
          asOfDate: asOfDate.format('YYYY-MM-DD')
        }
      });
      return response.data.data;
    }
  );

  const handleExport = async () => {
    try {
      await axios.post('/reports/export', {
        reportType: 'balance-sheet',
        format: 'pdf',
        parameters: {
          asOfDate: asOfDate.format('YYYY-MM-DD')
        }
      });
      message.success('Balance Sheet exported successfully');
    } catch (error) {
      message.error('Export failed');
    }
  };


  const renderSummaryCards = () => {
    if (!balanceSheetData) return null;

    const { assets, liabilities, equity } = balanceSheetData;

    return (
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Total Assets"
              value={assets.total || 0}
              precision={0}
              prefix="PKR"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Total Liabilities"
              value={liabilities.total || 0}
              precision={0}
              prefix="PKR"
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Total Equity"
              value={equity.total || 0}
              precision={0}
              prefix="PKR"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>
    );
  };

  const renderBalanceAlert = () => {
    if (!balanceSheetData) return null;

    const { totals } = balanceSheetData;

    return (
      <Alert
        message={
          totals.balanced
            ? "Balance Sheet is Balanced"
            : "Balance Sheet is NOT Balanced"
        }
        description={
          totals.balanced
            ? `Assets (${formatCurrency(totals.assets)}) = Liabilities + Equity (${formatCurrency(totals.liabilitiesAndEquity)})`
            : `Assets (${formatCurrency(totals.assets)}) ≠ Liabilities + Equity (${formatCurrency(totals.liabilitiesAndEquity)})`
        }
        type={totals.balanced ? "success" : "error"}
        icon={totals.balanced ? <CheckCircleOutlined /> : <WarningOutlined />}
        style={{ marginBottom: 24 }}
      />
    );
  };

  const renderBalanceSheetTable = () => {
    if (!balanceSheetData) return null;

    const { assets, liabilities, equity } = balanceSheetData;

    const balanceSheetItems = [
      // ASSETS
      {
        key: 'assets-header',
        description: 'ASSETS',
        amount: null,
        isHeader: true,
        level: 0
      },
      {
        key: 'current-assets',
        description: 'Current Assets',
        amount: null,
        isSubHeader: true,
        level: 1
      },
      {
        key: 'cash',
        description: 'Cash',
        amount: assets.current.cash || 0,
        level: 2
      },
      {
        key: 'accounts-receivable',
        description: 'Accounts Receivable',
        amount: assets.current.accountsReceivable || 0,
        level: 2
      },
      {
        key: 'inventory',
        description: 'Inventory',
        amount: assets.current.inventory || 0,
        level: 2
      },
      {
        key: 'current-assets-total',
        description: 'Total Current Assets',
        amount: assets.current.total || 0,
        isSubTotal: true,
        level: 1
      },
      {
        key: 'total-assets',
        description: 'TOTAL ASSETS',
        amount: assets.total || 0,
        isTotal: true,
        level: 0
      },
      // SPACER
      {
        key: 'spacer1',
        description: '',
        amount: null,
        isSpacer: true
      },
      // LIABILITIES
      {
        key: 'liabilities-header',
        description: 'LIABILITIES',
        amount: null,
        isHeader: true,
        level: 0
      },
      {
        key: 'accounts-payable',
        description: 'Accounts Payable',
        amount: liabilities.current.accountsPayable || 0,
        level: 1
      },
      {
        key: 'total-liabilities',
        description: 'TOTAL LIABILITIES',
        amount: liabilities.total || 0,
        isTotal: true,
        level: 0
      },
      // SPACER
      {
        key: 'spacer2',
        description: '',
        amount: null,
        isSpacer: true
      },
      // EQUITY
      {
        key: 'equity-header',
        description: 'EQUITY',
        amount: null,
        isHeader: true,
        level: 0
      },
      {
        key: 'retained-earnings',
        description: 'Retained Earnings',
        amount: equity.retainedEarnings || 0,
        level: 1
      },
      {
        key: 'current-year-earnings',
        description: 'Current Year Earnings',
        amount: equity.currentYearEarnings || 0,
        level: 1
      },
      {
        key: 'total-equity',
        description: 'TOTAL EQUITY',
        amount: equity.total || 0,
        isTotal: true,
        level: 0
      },
      // FINAL TOTAL
      {
        key: 'spacer3',
        description: '',
        amount: null,
        isSpacer: true
      },
      {
        key: 'total-liabilities-equity',
        description: 'TOTAL LIABILITIES & EQUITY',
        amount: (liabilities.total || 0) + (equity.total || 0),
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
        render: (text, record) => {
          if (record.isSpacer) {
            return <div style={{ height: '16px' }} />;
          }

          return (
            <div
              style={{
                paddingLeft: record.level * 20,
                fontWeight: record.isHeader || record.isTotal || record.isFinal ? 'bold' :
                          record.isSubHeader || record.isSubTotal ? '600' : 'normal',
                fontSize: record.isFinal ? '16px' : '14px',
                textTransform: record.isHeader ? 'uppercase' : 'none'
              }}
            >
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
          if (record.isSpacer || amount === null) {
            return null;
          }

          return (
            <Text
              strong={record.isHeader || record.isTotal || record.isFinal || record.isSubTotal}
              style={{
                color: record.isFinal || record.isTotal ? '#1890ff' : 'inherit',
                fontSize: record.isFinal ? '16px' : '14px'
              }}
            >
              {formatCurrency(amount)}
            </Text>
          );
        }
      }
    ];

    return (
      <Table
        dataSource={balanceSheetItems}
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
              Balance Sheet
            </Title>
            <Text type="secondary">
              As of {asOfDate.format('MMMM DD, YYYY')}
            </Text>
          </Space>
        }
        extra={
          <Space>
            <DatePicker
              value={asOfDate}
              onChange={(date) => date && setAsOfDate(date)}
              format="YYYY-MM-DD"
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
        {renderBalanceAlert()}

        <Card title="Balance Sheet Statement">
          {renderBalanceSheetTable()}
        </Card>
      </Card>
    </div>
  );
};

export default BalanceSheet;