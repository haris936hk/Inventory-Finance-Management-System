// ========== src/components/ExportModal.jsx ==========
import React, { useState } from 'react';
import { Modal, Radio, DatePicker, Button, Select, message, Space } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const ExportModal = ({ visible, onClose }) => {
  const [reportType, setReportType] = useState('inventory');
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    
    try {
      const response = await axios.post('/reports/export', {
        reportType,
        filters
      });
      
      window.open(response.data.data.url, '_blank');
      message.success('Export generated successfully');
      onClose();
    } catch (error) {
      message.error('Export failed');
    }
    
    setLoading(false);
  };

  return (
    <Modal
      title="Export Data"
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key="export"
          type="primary"
          icon={<DownloadOutlined />}
          loading={loading}
          onClick={handleExport}
        >
          Export
        </Button>
      ]}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <div>
          <h4>Select Report Type</h4>
          <Radio.Group value={reportType} onChange={(e) => setReportType(e.target.value)}>
            <Radio value="inventory">Inventory Report</Radio>
            <Radio value="financial">Financial Summary</Radio>
            <Radio value="sales">Sales Report</Radio>
            <Radio value="valuation">Stock Valuation</Radio>
          </Radio.Group>
        </div>

        {(reportType === 'financial' || reportType === 'sales') && (
          <div>
            <h4>Date Range</h4>
            <RangePicker
              style={{ width: '100%' }}
              onChange={(dates) => {
                if (dates) {
                  setFilters({
                    ...filters,
                    startDate: dates[0].toISOString(),
                    endDate: dates[1].toISOString()
                  });
                }
              }}
            />
          </div>
        )}

        {reportType === 'sales' && (
          <div>
            <h4>Group By</h4>
            <Select
              style={{ width: '100%' }}
              placeholder="Select grouping"
              onChange={(value) => setFilters({ ...filters, groupBy: value })}
            >
              <Select.Option value="day">Day</Select.Option>
              <Select.Option value="week">Week</Select.Option>
              <Select.Option value="month">Month</Select.Option>
            </Select>
          </div>
        )}
      </Space>
    </Modal>
  );
};

export default ExportModal;