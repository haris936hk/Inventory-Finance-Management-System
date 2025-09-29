import React, { useState, useEffect } from 'react';
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
  Tag,
  Input,
  Select,
  Tooltip,
  message
} from 'antd';
import {
  SearchOutlined,
  DownloadOutlined,
  PrinterOutlined,
  FilterOutlined,
  CalendarOutlined,
  DollarOutlined,
  FileTextOutlined,
  CreditCardOutlined,
  ShopOutlined
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatPKR } from '../config/constants';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Search } = Input;

const LedgerView = ({
  entityId,
  entityType, // 'customer' or 'vendor'
  title = "Ledger"
}) => {
  const [dateRange, setDateRange] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [filteredData, setFilteredData] = useState([]);

  // Fetch ledger data
  const { data: ledgerData, isLoading, error } = useQuery(
    [`${entityType}-ledger`, entityId, dateRange],
    async () => {
      const endpoint = entityType === 'customer'
        ? `/finance/customers/${entityId}/ledger`
        : `/finance/vendors/${entityId}/ledger`;

      const params = {};
      if (dateRange.length === 2) {
        params.dateFrom = dateRange[0].format('YYYY-MM-DD');
        params.dateTo = dateRange[1].format('YYYY-MM-DD');
      }

      const response = await axios.get(endpoint, { params });
      return response.data.data;
    },
    {
      enabled: !!entityId,
      onError: (error) => {
        message.error(`Failed to load ${entityType} ledger: ${error.response?.data?.message || error.message}`);
      }
    }
  );

  // Filter data based on search and type
  useEffect(() => {
    if (!ledgerData) return;

    let filtered = [...ledgerData];

    // Apply search filter
    if (searchText) {
      filtered = filtered.filter(entry =>
        entry.description.toLowerCase().includes(searchText.toLowerCase()) ||
        entry.reference.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    // Apply type filter
    if (typeFilter) {
      filtered = filtered.filter(entry => entry.type === typeFilter);
    }

    setFilteredData(filtered);
  }, [ledgerData, searchText, typeFilter]);

  // Calculate summary statistics
  const summaryStats = React.useMemo(() => {
    if (!filteredData || filteredData.length === 0) {
      return { totalDebits: 0, totalCredits: 0, currentBalance: 0 };
    }

    let totalDebits = 0;
    let totalCredits = 0;
    let currentBalance = 0;

    filteredData.forEach(entry => {
      // Skip opening balance entries in calculations
      if (entry.type === 'Opening Balance') return;

      const entryAmount = parseFloat(entry.amount || 0);

      if (entityType === 'customer') {
        // Customer: Invoices = Debits (they owe us), Payments = Credits (they pay us)
        if (entryAmount > 0) {
          totalDebits += entryAmount;
        } else {
          totalCredits += Math.abs(entryAmount);
        }
      } else {
        // Vendor: Bills/POs = Credits (we owe them), Payments = Debits (we pay them)
        if (entryAmount > 0) {
          totalCredits += entryAmount;
        } else {
          totalDebits += Math.abs(entryAmount);
        }
      }
    });

    // Current balance is the last entry's balance
    if (filteredData.length > 0) {
      const lastBalance = parseFloat(filteredData[filteredData.length - 1].balance || 0);
      currentBalance = isNaN(lastBalance) ? 0 : lastBalance;
    }

    return {
      totalDebits: isNaN(totalDebits) ? 0 : totalDebits,
      totalCredits: isNaN(totalCredits) ? 0 : totalCredits,
      currentBalance: isNaN(currentBalance) ? 0 : currentBalance
    };
  }, [filteredData, entityType]);

  // Get transaction type options based on entity type
  const getTypeOptions = () => {
    if (entityType === 'customer') {
      return ['Invoice', 'Payment', 'Opening Balance'];
    } else {
      return ['Purchase Order', 'Bill', 'Payment', 'Opening Balance'];
    }
  };

  // Get transaction type icon
  const getTypeIcon = (type) => {
    switch (type) {
      case 'Invoice':
        return <FileTextOutlined style={{ color: '#1890ff' }} />;
      case 'Payment':
        return <CreditCardOutlined style={{ color: '#52c41a' }} />;
      case 'Purchase Order':
        return <ShopOutlined style={{ color: '#722ed1' }} />;
      case 'Bill':
        return <FileTextOutlined style={{ color: '#f5222d' }} />;
      case 'Opening Balance':
        return <DollarOutlined style={{ color: '#faad14' }} />;
      default:
        return <FileTextOutlined />;
    }
  };

  // Table columns
  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (date) => dayjs(date).format('DD/MM/YYYY'),
      sorter: (a, b) => dayjs(a.date).unix() - dayjs(b.date).unix(),
      width: 120
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type) => (
        <Space>
          {getTypeIcon(type)}
          <Tag color={
            type === 'Payment' ? 'green' :
            type === 'Invoice' ? 'blue' :
            type === 'Bill' ? 'red' :
            type === 'Purchase Order' ? 'purple' :
            'orange'
          }>
            {type}
          </Tag>
        </Space>
      ),
      width: 150
    },
    {
      title: 'Reference',
      dataIndex: 'reference',
      key: 'reference',
      render: (ref, record) => (
        <Tooltip title={record.description}>
          <Button type="link" size="small">
            {ref}
          </Button>
        </Tooltip>
      ),
      width: 120
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true
    },
    {
      title: 'Debit',
      dataIndex: 'amount',
      key: 'debit',
      align: 'right',
      render: (amount) => {
        const numericAmount = parseFloat(amount || 0);
        const shouldShowAsDebit = entityType === 'customer' ? numericAmount > 0 : numericAmount < 0;
        return shouldShowAsDebit ? (
          <span style={{ color: '#f5222d', fontWeight: 'bold' }}>
            {formatPKR(Math.abs(numericAmount))}
          </span>
        ) : '-';
      },
      width: 120
    },
    {
      title: 'Credit',
      dataIndex: 'amount',
      key: 'credit',
      align: 'right',
      render: (amount) => {
        const numericAmount = parseFloat(amount || 0);
        const shouldShowAsCredit = entityType === 'customer' ? numericAmount < 0 : numericAmount > 0;
        return shouldShowAsCredit ? (
          <span style={{ color: '#52c41a', fontWeight: 'bold' }}>
            {formatPKR(Math.abs(numericAmount))}
          </span>
        ) : '-';
      },
      width: 120
    },
    {
      title: 'Balance',
      dataIndex: 'balance',
      key: 'balance',
      align: 'right',
      render: (balance) => {
        const numericBalance = parseFloat(balance || 0);
        const safeBalance = isNaN(numericBalance) ? 0 : numericBalance;
        return (
          <span style={{
            color: safeBalance > 0 ? '#f5222d' : '#52c41a',
            fontWeight: 'bold'
          }}>
            {formatPKR(safeBalance)}
          </span>
        );
      },
      width: 120
    }
  ];

  const handleExport = () => {
    // TODO: Implement export functionality
    message.info('Export functionality will be implemented soon');
  };

  const handlePrint = () => {
    window.print();
  };

  if (error) {
    return (
      <Card title={title}>
        <Empty
          description={`Failed to load ${entityType} ledger`}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  return (
    <div>
      {/* Summary Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title={entityType === 'customer' ? 'Total Debits' : 'Total Paid'}
              value={formatPKR(summaryStats.totalDebits)}
              valueStyle={{ color: '#f5222d' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={entityType === 'customer' ? 'Total Credits' : 'Total Owed'}
              value={formatPKR(summaryStats.totalCredits)}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Current Balance"
              value={formatPKR(summaryStats.currentBalance)}
              valueStyle={{
                color: summaryStats.currentBalance > 0 ? '#f5222d' : '#52c41a'
              }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Transactions"
              value={filteredData.length}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters and Controls */}
      <Card
        title={
          <Space>
            <CalendarOutlined />
            {title}
          </Space>
        }
        extra={
          <Space>
            <Button icon={<PrinterOutlined />} onClick={handlePrint}>
              Print
            </Button>
            <Button icon={<DownloadOutlined />} onClick={handleExport}>
              Export
            </Button>
          </Space>
        }
      >
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Search
              placeholder="Search description or reference"
              allowClear
              prefix={<SearchOutlined />}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={6}>
            <Select
              placeholder="Filter by type"
              allowClear
              style={{ width: '100%' }}
              onChange={setTypeFilter}
              suffixIcon={<FilterOutlined />}
            >
              {getTypeOptions().map(type => (
                <Option key={type} value={type}>{type}</Option>
              ))}
            </Select>
          </Col>
          <Col span={10}>
            <RangePicker
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              placeholder={['Start Date', 'End Date']}
              onChange={(dates) => setDateRange(dates || [])}
            />
          </Col>
        </Row>

        {/* Ledger Table */}
        <Spin spinning={isLoading}>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredData}
            scroll={{ x: 800 }}
            pagination={{
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) =>
                `${range[0]}-${range[1]} of ${total} transactions`,
              pageSizeOptions: ['10', '25', '50', '100'],
              defaultPageSize: 25
            }}
            locale={{
              emptyText: (
                <Empty
                  description={`No ${entityType} ledger entries found`}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              )
            }}
          />
        </Spin>
      </Card>
    </div>
  );
};

export default LedgerView;