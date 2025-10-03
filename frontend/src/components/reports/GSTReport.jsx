import React, { useState } from 'react';
import { Card, DatePicker, Spin, Row, Col, Statistic, Table } from 'antd';
import { useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatCurrency } from '../../config/constants';

const { RangePicker } = DatePicker;

const GSTReport = () => {
  const [dateRange, setDateRange] = useState([
    dayjs().startOf('month'),
    dayjs().endOf('month')
  ]);

  const { data, isLoading } = useQuery(
    ['gst', dateRange],
    async () => {
      const response = await axios.get('/reports/gst', {
        params: {
          startDate: dateRange[0].format('YYYY-MM-DD'),
          endDate: dateRange[1].format('YYYY-MM-DD')
        }
      });
      return response.data.data;
    }
  );

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
      </div>
    );
  }

  const gstData = [
    {
      key: '1',
      section: 'OUTPUT TAX (Sales)',
      isHeader: true
    },
    {
      key: '2',
      description: 'CGST Collected',
      amount: data?.sales?.cgstCollected || 0
    },
    {
      key: '3',
      description: 'SGST Collected',
      amount: data?.sales?.sgstCollected || 0
    },
    {
      key: '4',
      description: 'IGST Collected',
      amount: data?.sales?.igstCollected || 0
    },
    {
      key: '5',
      description: 'Total Output Tax',
      amount: data?.sales?.totalGST || 0,
      isSubtotal: true
    },
    {
      key: '6',
      section: 'INPUT TAX CREDIT (Purchases)',
      isHeader: true
    },
    {
      key: '7',
      description: 'CGST Paid',
      amount: data?.purchases?.cgstPaid || 0
    },
    {
      key: '8',
      description: 'SGST Paid',
      amount: data?.purchases?.sgstPaid || 0
    },
    {
      key: '9',
      description: 'IGST Paid',
      amount: data?.purchases?.igstPaid || 0
    },
    {
      key: '10',
      description: 'Total Input Credit',
      amount: data?.purchases?.totalGST || 0,
      isSubtotal: true
    },
    {
      key: '11',
      section: 'NET GST LIABILITY',
      isHeader: true
    },
    {
      key: '12',
      description: 'Net CGST Payable',
      amount: data?.netGST?.cgst || 0
    },
    {
      key: '13',
      description: 'Net SGST Payable',
      amount: data?.netGST?.sgst || 0
    },
    {
      key: '14',
      description: 'Net IGST Payable',
      amount: data?.netGST?.igst || 0
    },
    {
      key: '15',
      description: 'TOTAL GST PAYABLE',
      amount: data?.netGST?.total || 0,
      isTotal: true
    }
  ];

  const columns = [
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (text, record) => {
        if (record.isHeader) {
          return (
            <div style={{ fontWeight: 'bold', fontSize: '14px', marginTop: '8px' }}>
              {record.section}
            </div>
          );
        }
        return (
          <div style={{
            paddingLeft: record.isTotal ? 0 : 20,
            fontWeight: record.isTotal || record.isSubtotal ? 'bold' : 'normal',
            fontSize: record.isTotal ? '16px' : '14px'
          }}>
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
        if (record.isHeader) return null;
        return (
          <span style={{
            fontWeight: record.isTotal || record.isSubtotal ? 'bold' : 'normal',
            fontSize: record.isTotal ? '16px' : '14px',
            color: record.isTotal ? (amount >= 0 ? '#ff4d4f' : '#52c41a') : 'inherit'
          }}>
            {formatCurrency(amount)}
          </span>
        );
      }
    }
  ];

  return (
    <Card
      title={
        <span>
          GST Report
          <span style={{ marginLeft: 16, fontSize: '14px', color: '#666', fontWeight: 'normal' }}>
            {dateRange[0].format('MMM DD')} - {dateRange[1].format('MMM DD, YYYY')}
          </span>
        </span>
      }
      extra={
        <RangePicker
          value={dateRange}
          onChange={(dates) => dates && setDateRange(dates)}
        />
      }
    >
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="Total GST Collected"
              value={data?.sales?.totalGST || 0}
              prefix="PKR"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Total Input Credit"
              value={data?.purchases?.totalGST || 0}
              prefix="PKR"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Net GST Payable"
              value={data?.netGST?.total || 0}
              prefix="PKR"
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      <Table
        dataSource={gstData}
        columns={columns}
        pagination={false}
        showHeader={false}
      />
    </Card>
  );
};

export default GSTReport;
