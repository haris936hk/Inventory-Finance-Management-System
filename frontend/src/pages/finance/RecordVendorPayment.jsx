// ========== src/pages/finance/RecordVendorPayment.jsx ==========
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Card, Form, Input, Select, DatePicker, Button, Row, Col,
  Typography, Divider, Alert, Space, Table, message, InputNumber
} from 'antd';
import {
  DollarCircleOutlined, ShopOutlined, CalendarOutlined,
  ArrowLeftOutlined, BankOutlined, CreditCardOutlined, MoneyCollectOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatPKR } from '../../config/constants';

const { TextArea } = Input;
const { Title, Text } = Typography;

const RecordVendorPayment = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedBill, setSelectedBill] = useState(null);

  // Watch form values for real-time validation
  const watchedValues = Form.useWatch([], form);

  // Calculate remaining bill balance
  const remainingBalance = React.useMemo(() => {
    if (!selectedBill) return 0;
    const total = parseFloat(selectedBill.total) || 0;
    const paid = parseFloat(selectedBill.paidAmount) || 0;
    return total - paid;
  }, [selectedBill]);

  // Check if payment amount exceeds remaining balance
  const exceedsBalance = React.useMemo(() => {
    if (!selectedBill || !watchedValues?.amount) return false;
    const paymentAmount = parseFloat(watchedValues.amount) || 0;
    return paymentAmount > remainingBalance;
  }, [selectedBill, watchedValues, remainingBalance]);

  const billId = searchParams.get('billId');

  // Fetch vendors
  const { data: vendors } = useQuery('vendors', async () => {
    const response = await axios.get('/inventory/vendors');
    return response.data.data;
  });

  // Fetch specific bill if billId is provided
  const { data: specificBill, isLoading: billLoading } = useQuery(
    ['vendor-bill', billId],
    async () => {
      if (!billId) return null;
      const response = await axios.get(`/finance/vendor-bills/${billId}`);
      return response.data.data;
    },
    { enabled: !!billId }
  );

  // Fetch vendor bills when vendor is selected
  const { data: vendorBills, isLoading: billsLoading } = useQuery(
    ['vendor-bills', selectedVendor],
    async () => {
      if (!selectedVendor) return [];
      const response = await axios.get('/finance/vendor-bills', {
        params: {
          vendorId: selectedVendor,
          status: 'Unpaid,Partial'
        }
      });
      return response.data.data;
    },
    { enabled: !!selectedVendor }
  );

  // Record payment mutation
  const paymentMutation = useMutation(
    (data) => axios.post('/finance/vendor-payments', data),
    {
      onSuccess: () => {
        message.success('Vendor payment recorded successfully!');
        queryClient.invalidateQueries(['vendor-payments']);
        queryClient.invalidateQueries(['vendor-bills']);
        queryClient.invalidateQueries(['vendors']);
        navigate('/app/finance/vendor-payments');
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Failed to record payment');
      }
    }
  );

  // Set initial values when specific bill is loaded
  useEffect(() => {
    if (specificBill) {
      setSelectedVendor(specificBill.vendorId);
      setSelectedBill(specificBill);
      form.setFieldsValue({
        vendorId: specificBill.vendorId,
        billId: specificBill.id
      });
    }
  }, [specificBill, form]);

  const handleVendorChange = (vendorId) => {
    setSelectedVendor(vendorId);
    setSelectedBill(null);
    form.setFieldsValue({ billId: undefined });
  };

  const handleBillChange = (billId) => {
    const bill = vendorBills?.find(b => b.id === billId);
    setSelectedBill(bill);
  };

  const handleSubmit = (values) => {
    const paymentAmount = parseFloat(values.amount);

    // Always validate if a bill ID is provided
    if (values.billId) {
      // Try to get bill data from selectedBill or specificBill
      const bill = selectedBill || specificBill;

      if (!bill) {
        message.error('Bill data not available. Please refresh the page and try again.');
        return;
      }

      const billTotal = parseFloat(bill.total) || 0;
      const paidAmount = parseFloat(bill.paidAmount) || 0;
      const remainingBalance = billTotal - paidAmount;

      if (paymentAmount > remainingBalance) {
        message.error(`Payment amount (${formatPKR(paymentAmount)}) cannot exceed remaining bill balance (${formatPKR(remainingBalance)})`);
        return;
      }
    }

    const paymentData = {
      ...values,
      paymentDate: values.paymentDate.format('YYYY-MM-DD'),
      amount: paymentAmount
    };
    paymentMutation.mutate(paymentData);
  };

  const billColumns = [
    {
      title: 'Bill #',
      dataIndex: 'billNumber',
      key: 'billNumber'
    },
    {
      title: 'Bill Date',
      dataIndex: 'billDate',
      key: 'billDate',
      render: (date) => dayjs(date).format('DD/MM/YYYY')
    },
    {
      title: 'Due Date',
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: (date) => date ? dayjs(date).format('DD/MM/YYYY') : '-'
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      render: (amount) => formatPKR(Number(amount))
    },
    {
      title: 'Paid',
      dataIndex: 'paidAmount',
      key: 'paidAmount',
      render: (amount) => formatPKR(Number(amount || 0))
    },
    {
      title: 'Balance',
      key: 'balance',
      render: (_, record) => (
        <Text strong style={{ color: '#f5222d' }}>
          {formatPKR(Number(record.total) - Number(record.paidAmount || 0))}
        </Text>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <span style={{
          color: status === 'Paid' ? '#52c41a' :
                status === 'Partial' ? '#faad14' : '#f5222d'
        }}>
          {status}
        </span>
      )
    }
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/app/finance/vendor-payments')}
            />
            <DollarCircleOutlined />
            Record Vendor Payment
            {specificBill && (
              <Text type="secondary">- Bill {specificBill.billNumber}</Text>
            )}
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            paymentDate: dayjs(),
            method: 'Cash'
          }}
        >
          <Row gutter={[24, 0]}>
            <Col xs={24} lg={12}>
              <Card title="Payment Details" size="small">
                <Form.Item
                  label="Vendor"
                  name="vendorId"
                  rules={[{ required: true, message: 'Please select a vendor' }]}
                >
                  <Select
                    placeholder="Select vendor"
                    showSearch
                    optionFilterProp="children"
                    onChange={handleVendorChange}
                    disabled={!!specificBill}
                  >
                    {vendors?.map(vendor => (
                      <Select.Option key={vendor.id} value={vendor.id}>
                        {vendor.name} ({vendor.code})
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item
                  label="Bill (Optional)"
                  name="billId"
                  help="Select specific bill or leave blank for general payment"
                >
                  <Select
                    placeholder="Select bill"
                    loading={billsLoading}
                    disabled={!selectedVendor}
                    allowClear={!specificBill}
                    onChange={handleBillChange}
                  >
                    {vendorBills?.map(bill => (
                      <Select.Option key={bill.id} value={bill.id}>
                        {bill.billNumber} - {formatPKR(Number(bill.total))}
                        (Balance: {formatPKR(Number(bill.total) - Number(bill.paidAmount || 0))})
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      label="Payment Date"
                      name="paymentDate"
                      rules={[{ required: true, message: 'Please select payment date' }]}
                    >
                      <DatePicker style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      label="Amount (PKR)"
                      name="amount"
                      rules={[
                        { required: true, message: 'Please enter amount' },
                        { type: 'number', min: 0.01, message: 'Amount must be greater than 0' },
                        {
                          validator: (_, value) => {
                            console.log('Field validator called:', { value, selectedBill, remainingBalance });

                            if (!selectedBill || !value) {
                              return Promise.resolve();
                            }
                            const paymentAmount = parseFloat(value) || 0;

                            if (paymentAmount > remainingBalance) {
                              console.log('Field validation failed:', { paymentAmount, remainingBalance });
                              return Promise.reject(new Error(`Amount cannot exceed remaining balance (${formatPKR(remainingBalance)})`));
                            }
                            return Promise.resolve();
                          }
                        }
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

                <Form.Item
                  label="Reference"
                  name="reference"
                  help="Transaction ID, cheque number, etc."
                >
                  <Input placeholder="e.g., TXN123456, CHQ001" />
                </Form.Item>

                <Form.Item label="Notes" name="notes">
                  <TextArea rows={3} placeholder="Additional notes about this payment" />
                </Form.Item>

                {/* Payment Validation Alert */}
                {selectedBill && exceedsBalance && (
                  <Alert
                    message="Payment Amount Exceeds Bill Balance"
                    description={`Payment amount cannot exceed remaining bill balance of ${formatPKR(remainingBalance)}. Please adjust the amount.`}
                    type="error"
                    style={{ marginTop: 16 }}
                    showIcon
                  />
                )}
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              {selectedVendor && (
                <Card title="Vendor Outstanding Bills" size="small">
                  {vendorBills?.length > 0 ? (
                    <Table
                      size="small"
                      columns={billColumns}
                      dataSource={vendorBills}
                      pagination={false}
                      scroll={{ y: 300 }}
                    />
                  ) : (
                    <Alert
                      message="No outstanding bills"
                      description="This vendor has no unpaid bills."
                      type="info"
                    />
                  )}
                </Card>
              )}

              {selectedBill && (
                <>
                  {/* Payment Summary */}
                  <Card title="Payment Summary" size="small" style={{ marginTop: 16, backgroundColor: '#f9f9f9' }}>
                    <Row gutter={16}>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <Text type="secondary">Bill Total</Text>
                          <br />
                          <Text strong style={{ fontSize: 16, color: '#1890ff' }}>
                            {formatPKR(Number(selectedBill.total))}
                          </Text>
                        </div>
                      </Col>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <Text type="secondary">Already Paid</Text>
                          <br />
                          <Text strong style={{ fontSize: 16, color: '#52c41a' }}>
                            {formatPKR(Number(selectedBill.paidAmount || 0))}
                          </Text>
                        </div>
                      </Col>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <Text type="secondary">Remaining Balance</Text>
                          <br />
                          <Text strong style={{
                            fontSize: 16,
                            color: exceedsBalance ? '#ff4d4f' : '#f5222d'
                          }}>
                            {formatPKR(remainingBalance)}
                          </Text>
                        </div>
                      </Col>
                    </Row>
                  </Card>

                  <Card title="Selected Bill Details" size="small" style={{ marginTop: 16 }}>
                    <Row gutter={[16, 8]}>
                      <Col span={12}>
                        <Text strong>Bill #:</Text>
                        <br />
                        {selectedBill.billNumber}
                      </Col>
                      <Col span={12}>
                        <Text strong>Bill Date:</Text>
                        <br />
                        {dayjs(selectedBill.billDate).format('DD/MM/YYYY')}
                      </Col>
                      <Col span={12}>
                        <Text strong>Due Date:</Text>
                        <br />
                        {selectedBill.dueDate ? dayjs(selectedBill.dueDate).format('DD/MM/YYYY') : 'Not set'}
                      </Col>
                      <Col span={12}>
                        <Text strong>Status:</Text>
                        <br />
                        <span style={{
                          color: selectedBill.status === 'Paid' ? '#52c41a' :
                                selectedBill.status === 'Partial' ? '#faad14' : '#f5222d'
                        }}>
                          {selectedBill.status}
                        </span>
                      </Col>
                    </Row>
                  </Card>
                </>
              )}
            </Col>
          </Row>

          <Divider />

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => navigate('/app/finance/vendor-payments')}>
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={paymentMutation.isLoading}
                disabled={exceedsBalance}
                icon={<DollarCircleOutlined />}
              >
                Record Payment
              </Button>
            </Space>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default RecordVendorPayment;