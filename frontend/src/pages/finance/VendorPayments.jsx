// ========== src/pages/finance/VendorPayments.jsx ==========
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, Button, Space, Tag, Input, Select, DatePicker,
  Row, Col, Statistic, Dropdown, message, Modal, Form,
  Divider, InputNumber
} from 'antd';
import {
  PlusOutlined, SearchOutlined, EyeOutlined, EditOutlined,
  DeleteOutlined, DollarCircleOutlined, PrinterOutlined,
  MoreOutlined, BankOutlined, CreditCardOutlined, MoneyCollectOutlined,
  ShopOutlined, FileTextOutlined, StopOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import { useAuthStore } from '../../stores/authStore';
import { formatPKR } from '../../config/constants';

const { RangePicker } = DatePicker;
const { Search } = Input;
const { TextArea } = Input;

const VendorPayments = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [filters, setFilters] = useState({});
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [form] = Form.useForm();

  // Fetch vendor payments
  const { data: vendorPaymentsData, isLoading } = useQuery(
    ['vendor-payments', filters],
    async () => {
      const response = await axios.get('/finance/vendor-payments', { params: filters });
      return response.data.data;
    }
  );

  // Fetch vendors for filter and form
  const { data: vendors } = useQuery('vendors', async () => {
    const response = await axios.get('/inventory/vendors');
    return response.data.data;
  });

  // Fetch unpaid bills for payment allocation
  const { data: unpaidBills } = useQuery('unpaid-bills', async () => {
    const response = await axios.get('/finance/vendor-bills', {
      params: { status: 'Unpaid' }
    });
    return response.data.data;
  });

  // Calculate statistics
  const statistics = React.useMemo(() => {
    if (!vendorPaymentsData) return { total: 0, cash: 0, bank: 0, cheque: 0, count: 0 };

    return vendorPaymentsData.reduce((acc, payment) => {
      const amount = parseFloat(payment.amount);
      acc.total += amount;
      acc.count++;

      switch (payment.method) {
        case 'Cash':
          acc.cash += amount;
          break;
        case 'Bank Transfer':
          acc.bank += amount;
          break;
        case 'Cheque':
          acc.cheque += amount;
          break;
      }
      return acc;
    }, { total: 0, cash: 0, bank: 0, cheque: 0, count: 0 });
  }, [vendorPaymentsData]);

  // Record Payment mutation
  const paymentMutation = useMutation(
    (data) => {
      if (editingPayment) {
        return axios.put(`/finance/vendor-payments/${editingPayment.id}`, data);
      }
      return axios.post('/finance/vendor-payments', data);
    },
    {
      onSuccess: () => {
        message.success(`Vendor Payment ${editingPayment ? 'updated' : 'recorded'} successfully`);
        queryClient.invalidateQueries('vendor-payments');
        queryClient.invalidateQueries('vendor-bills');
        queryClient.invalidateQueries('vendors');
        handleCloseModal();
      },
      onError: (error) => {
        console.error('Payment operation failed:', error);
        const errorMessage = error.response?.data?.message || error.message || 'An error occurred';
        message.error(errorMessage);
      }
    }
  );

  // Void Payment mutation
  const voidPaymentMutation = useMutation(
    ({ id, reason }) => axios.post(`/finance/vendor-payments/${id}/void`, { reason }),
    {
      onSuccess: () => {
        message.success('Payment voided successfully');
        queryClient.invalidateQueries('vendor-payments');
        queryClient.invalidateQueries('vendor-bills');
        queryClient.invalidateQueries('vendors');
      },
      onError: (error) => {
        const errorMessage = error.response?.data?.message || error.response?.data?.error?.message || 'Failed to void payment';
        message.error(errorMessage);
      }
    }
  );

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingPayment(null);
    form.resetFields();
  };

  const getMethodColor = (method) => {
    const colors = {
      'Cash': 'green',
      'Bank Transfer': 'blue',
      'Cheque': 'orange'
    };
    return colors[method] || 'default';
  };

  const getMethodIcon = (method) => {
    const icons = {
      'Cash': <MoneyCollectOutlined />,
      'Bank Transfer': <BankOutlined />,
      'Cheque': <CreditCardOutlined />
    };
    return icons[method] || <DollarCircleOutlined />;
  };

  const handleVoidPayment = (record) => {
    let reason = '';
    Modal.confirm({
      title: 'Void Payment',
      content: (
        <div>
          <p>Are you sure you want to void payment <strong>{record.paymentNumber}</strong>?</p>
          <p style={{ color: '#ff4d4f', marginTop: 8 }}>
            <ExclamationCircleOutlined /> This will reverse the payment amount from the bill and vendor balance.
          </p>
          <TextArea
            rows={3}
            placeholder="Enter void reason (required)"
            onChange={(e) => { reason = e.target.value; }}
            style={{ marginTop: 12 }}
          />
        </div>
      ),
      onOk: () => {
        if (!reason || reason.trim() === '') {
          message.error('Please provide a void reason');
          return Promise.reject();
        }
        return voidPaymentMutation.mutateAsync({ id: record.id, reason: reason.trim() });
      }
    });
  };

  const columns = [
    {
      title: 'Payment #',
      dataIndex: 'paymentNumber',
      key: 'paymentNumber',
      fixed: 'left',
      width: 160,
      render: (text, record) => (
        <Space direction="vertical" size="small">
          <span style={{ fontWeight: 'bold', color: record.voidedAt ? '#999' : '#1890ff' }}>
            {text}
          </span>
          {record.voidedAt && <Tag color="red" size="small">VOIDED</Tag>}
        </Space>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'paymentDate',
      key: 'paymentDate',
      width: 120,
      render: (date) => new Date(date).toLocaleDateString('en-GB'),
    },
    {
      title: 'Vendor',
      dataIndex: 'vendor',
      key: 'vendor',
      width: 180,
      render: (vendor) => (
        <Space>
          <ShopOutlined />
          <span>{vendor?.name}</span>
        </Space>
      ),
    },
    {
      title: 'Bill Reference',
      dataIndex: 'bill',
      key: 'bill',
      width: 120,
      render: (bill) => bill ? (
        <Button
          type="link"
          size="small"
          onClick={() => navigate(`/app/finance/vendor-bills/${bill.id}`)}
        >
          {bill.billNumber}
        </Button>
      ) : <Tag color="blue">General Payment</Tag>,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      render: (amount, record) => (
        <span style={{
          fontWeight: 'bold',
          color: record.voidedAt ? '#999' : '#52c41a',
          textDecoration: record.voidedAt ? 'line-through' : 'none'
        }}>
          {formatPKR(Number(amount))}
        </span>
      ),
    },
    {
      title: 'Method',
      dataIndex: 'method',
      key: 'method',
      width: 130,
      render: (method) => (
        <Space>
          {getMethodIcon(method)}
          <Tag color={getMethodColor(method)}>{method}</Tag>
        </Space>
      ),
    },
    {
      title: 'Reference',
      dataIndex: 'reference',
      key: 'reference',
      width: 150,
      render: (reference) => reference || '-',
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      width: 200,
      render: (notes) => notes ? (
        <span title={notes}>
          {notes.length > 50 ? `${notes.substring(0, 50)}...` : notes}
        </span>
      ) : '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 120,
      render: (_, record) => {
        const menuItems = [
          {
            key: 'view',
            icon: <EyeOutlined />,
            label: 'View Details',
            onClick: () => {
              Modal.info({
                title: `Payment Details - ${record.paymentNumber}`,
                width: 600,
                content: (
                  <div style={{ marginTop: 16 }}>
                    <Row gutter={16}>
                      <Col span={12}>
                        <p><strong>Vendor:</strong> {record.vendor?.name}</p>
                        <p><strong>Date:</strong> {new Date(record.paymentDate).toLocaleDateString('en-GB')}</p>
                        <p><strong>Amount:</strong> {formatPKR(Number(record.amount))}</p>
                      </Col>
                      <Col span={12}>
                        <p><strong>Method:</strong> {record.method}</p>
                        <p><strong>Reference:</strong> {record.reference || 'N/A'}</p>
                        <p><strong>Bill:</strong> {record.bill?.billNumber || 'General Payment'}</p>
                      </Col>
                    </Row>
                    {record.voidedAt && (
                      <div style={{ marginTop: 16, padding: 12, backgroundColor: '#fff2e8', border: '1px solid #ffbb96', borderRadius: 4 }}>
                        <p style={{ color: '#d4380d', fontWeight: 'bold', marginBottom: 8 }}>
                          <ExclamationCircleOutlined /> VOIDED
                        </p>
                        <p><strong>Voided At:</strong> {new Date(record.voidedAt).toLocaleString('en-GB')}</p>
                        <p><strong>Reason:</strong> {record.voidReason || 'N/A'}</p>
                      </div>
                    )}
                    {record.notes && (
                      <div style={{ marginTop: 16 }}>
                        <strong>Notes:</strong>
                        <p style={{ marginTop: 8, padding: 8, backgroundColor: '#f5f5f5', borderRadius: 4 }}>
                          {record.notes}
                        </p>
                      </div>
                    )}
                  </div>
                )
              });
            }
          },
          { type: 'divider' },
          {
            key: 'void',
            icon: <StopOutlined />,
            label: 'Void Payment',
            danger: true,
            disabled: !!record.voidedAt,
            onClick: () => handleVoidPayment(record)
          },
          { type: 'divider' },
          {
            key: 'print',
            icon: <PrinterOutlined />,
            label: 'Print Receipt',
            onClick: () => message.info('Print functionality coming soon')
          }
        ];

        return (
          <Space>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => menuItems[0].onClick()}
            />
            <Dropdown menu={{ items: menuItems }} placement="bottomRight">
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  const handleFormSubmit = (values) => {
    const processedValues = {
      ...values,
      paymentDate: values.paymentDate ? values.paymentDate.toISOString() : new Date().toISOString(),
      amount: parseFloat(values.amount)
    };
    paymentMutation.mutate(processedValues);
  };

  return (
    <>
      {/* Statistics Cards */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Payments"
              value={statistics.total}
              prefix="PKR"
              precision={0}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Cash Payments"
              value={statistics.cash}
              prefix="PKR"
              precision={0}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Bank Transfers"
              value={statistics.bank}
              prefix="PKR"
              precision={0}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Count"
              value={statistics.count}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Table Card */}
      <Card
        title={
          <Space>
            <DollarCircleOutlined />
            Vendor Payments
          </Space>
        }
        extra={
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setModalVisible(true)}
              disabled={!hasPermission('finance.create')}
            >
              Record Payment
            </Button>
          </Space>
        }
      >
        {/* Filters */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={8} md={6}>
            <Search
              placeholder="Search payment number..."
              onSearch={(value) => setFilters({...filters, search: value})}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Select
              placeholder="All Vendors"
              allowClear
              style={{ width: '100%' }}
              onChange={(value) => setFilters({...filters, vendorId: value})}
            >
              {vendors?.map(vendor => (
                <Select.Option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </Select.Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Select
              placeholder="All Methods"
              allowClear
              style={{ width: '100%' }}
              onChange={(value) => setFilters({...filters, method: value})}
            >
              <Select.Option value="Cash">Cash</Select.Option>
              <Select.Option value="Bank Transfer">Bank Transfer</Select.Option>
              <Select.Option value="Cheque">Cheque</Select.Option>
            </Select>
          </Col>
          <Col xs={24} sm={8} md={6}>
            <RangePicker
              style={{ width: '100%' }}
              onChange={(dates) => {
                setFilters({
                  ...filters,
                  dateFrom: dates?.[0]?.format('YYYY-MM-DD'),
                  dateTo: dates?.[1]?.format('YYYY-MM-DD')
                });
              }}
            />
          </Col>
        </Row>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={vendorPaymentsData}
          loading={isLoading}
          scroll={{ x: 1200 }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          }}
        />
      </Card>

      {/* Record Payment Modal */}
      <Modal
        title={editingPayment ? 'Edit Vendor Payment' : 'Record Vendor Payment'}
        open={modalVisible}
        onCancel={handleCloseModal}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFormSubmit}
          initialValues={{
            paymentDate: dayjs(),
            method: 'Cash'
          }}
        >
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Vendor"
                name="vendorId"
                rules={[{ required: true, message: 'Please select a vendor' }]}
              >
                <Select placeholder="Select vendor" showSearch optionFilterProp="children">
                  {vendors?.map(vendor => (
                    <Select.Option key={vendor.id} value={vendor.id}>
                      {vendor.name} ({vendor.code})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Bill (Optional)"
                name="billId"
                help="Leave empty for general payment"
              >
                <Select
                  placeholder="Select bill (optional)"
                  allowClear
                  showSearch
                  optionFilterProp="children"
                >
                  {unpaidBills?.map(bill => (
                    <Select.Option key={bill.id} value={bill.id}>
                      {bill.billNumber} - {formatPKR(Number(bill.total - bill.paidAmount))}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Payment Date"
                name="paymentDate"
                rules={[{ required: true, message: 'Please select payment date' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Amount (PKR)"
                name="amount"
                rules={[
                  { required: true, message: 'Please enter amount' },
                  { type: 'number', min: 0.01, message: 'Amount must be greater than 0' }
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  precision={2}
                  min={0.01}
                  placeholder="0.00"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Payment Method"
                name="method"
                rules={[{ required: true, message: 'Please select payment method' }]}
              >
                <Select>
                  <Select.Option value="Cash">
                    <Space>
                      <MoneyCollectOutlined />
                      Cash
                    </Space>
                  </Select.Option>
                  <Select.Option value="Bank Transfer">
                    <Space>
                      <BankOutlined />
                      Bank Transfer
                    </Space>
                  </Select.Option>
                  <Select.Option value="Cheque">
                    <Space>
                      <CreditCardOutlined />
                      Cheque
                    </Space>
                  </Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Reference"
                name="reference"
                help="Transaction ID, Cheque number, etc."
              >
                <Input placeholder="e.g., TXN123456, CHQ001" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Notes" name="notes">
            <TextArea
              rows={3}
              placeholder="Additional notes about this payment..."
            />
          </Form.Item>

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={handleCloseModal}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={paymentMutation.isLoading}>
                {editingPayment ? 'Update Payment' : 'Record Payment'}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </>
  );
};

export default VendorPayments;