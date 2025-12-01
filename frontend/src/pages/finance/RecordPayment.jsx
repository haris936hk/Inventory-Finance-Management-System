// ========== src/pages/finance/RecordPayment.jsx ==========
import React, { useState } from 'react';
import {
  Card, Form, Input, Select, DatePicker, Button, Row, Col,
  Typography, Divider, Alert, Space, Table, message
} from 'antd';
import {
  CreditCardOutlined, UserOutlined, CalendarOutlined,
  DollarOutlined, FileTextOutlined, ArrowLeftOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatPKR } from '../../config/constants';
import { parseAmount, subtractAmounts, isPositive } from '../../utils/decimalUtils';
import { getErrorMessage } from '../../utils/errorMessages';

const { TextArea } = Input;
const { Title, Text } = Typography;

const RecordPayment = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const invoiceIdFromUrl = searchParams.get('invoiceId');
  const [form] = Form.useForm();
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('Cash');

  // Fetch customers
  const { data: customers } = useQuery('customers', async () => {
    const response = await axios.get('/finance/customers');
    return response.data.data;
  });

  // Fetch invoice from URL if invoiceId is provided
  const { data: invoiceFromUrl, isLoading: loadingInvoiceFromUrl } = useQuery(
    ['invoice-from-url', invoiceIdFromUrl],
    async () => {
      if (!invoiceIdFromUrl) return null;
      const response = await axios.get(`/finance/invoices/${invoiceIdFromUrl}`);
      return response.data.data;
    },
    { enabled: !!invoiceIdFromUrl }
  );

  // Fetch customer invoices when customer is selected
  const { data: customerInvoices, isLoading: invoicesLoading } = useQuery(
    ['customer-invoices', selectedCustomer],
    async () => {
      if (!selectedCustomer) return [];
      const response = await axios.get(`/finance/invoices?customerId=${selectedCustomer}&status=Sent,Partial,Overdue`);
      return response.data.data;
    },
    { enabled: !!selectedCustomer }
  );

  // Record payment mutation
  const paymentMutation = useMutation(
    (data) => axios.post('/finance/payments', data),
    {
      onSuccess: (response, variables) => {
        message.success('Payment recorded successfully!');
        queryClient.invalidateQueries(['payments']);
        queryClient.invalidateQueries(['customer-invoices']);
        queryClient.invalidateQueries('customers'); // Refresh customer list balances
        // Invalidate specific customer query if customerId was provided
        if (variables.customerId) {
          queryClient.invalidateQueries(['customer', variables.customerId]);
        }
        navigate('/app/finance/payments');
      },
      onError: (error) => {
        const errorMessage = getErrorMessage(error, 'payment', 'create');
        message.error(errorMessage);
      }
    }
  );

  // Prefill form when invoice is loaded from URL
  React.useEffect(() => {
    if (invoiceFromUrl && !loadingInvoiceFromUrl) {
      // Set customer and invoice
      setSelectedCustomer(invoiceFromUrl.customerId);
      setSelectedInvoice(invoiceFromUrl);

      // Calculate remaining balance
      const remainingBalance = subtractAmounts(invoiceFromUrl.total, invoiceFromUrl.paidAmount);

      // Prefill form fields
      form.setFieldsValue({
        customerId: invoiceFromUrl.customerId,
        invoiceId: invoiceFromUrl.id,
        amount: remainingBalance > 0 ? remainingBalance : undefined
      });
    }
  }, [invoiceFromUrl, loadingInvoiceFromUrl, form]);

  const handleCustomerChange = (customerId) => {
    setSelectedCustomer(customerId);
    setSelectedInvoice(null);
    form.setFieldsValue({ invoiceId: undefined });
  };

  const handleInvoiceChange = (invoiceId) => {
    const invoice = customerInvoices?.find(inv => inv.id === invoiceId);
    setSelectedInvoice(invoice);
    // Re-validate the amount field when invoice changes
    form.validateFields(['amount']).catch(() => { });
  };

  const handleSubmit = (values) => {
    const paymentData = {
      ...values,
      paymentDate: values.paymentDate.toISOString(),
      method: values.paymentMethod, // Map paymentMethod to method
      reference: values.referenceNumber, // Map referenceNumber to reference
    };
    // Remove the original fields to avoid duplication
    delete paymentData.paymentMethod;
    delete paymentData.referenceNumber;
    paymentMutation.mutate(paymentData);
  };

  const invoiceColumns = [
    {
      title: 'Invoice #',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber'
    },
    {
      title: 'Date',
      dataIndex: 'invoiceDate',
      key: 'invoiceDate',
      render: (date) => dayjs(date).format('DD/MM/YYYY')
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      render: (amount) => formatPKR(amount)
    },
    {
      title: 'Paid',
      dataIndex: 'paidAmount',
      key: 'paidAmount',
      render: (amount) => formatPKR(amount || 0)
    },
    {
      title: 'Balance',
      key: 'balance',
      render: (_, record) => (
        <Text strong style={{ color: '#f5222d' }}>
          {formatPKR(subtractAmounts(record.total, record.paidAmount))}
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
              onClick={() => navigate('/app/finance/payments')}
            />
            <CreditCardOutlined />
            Record Payment
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            paymentDate: dayjs(),
            paymentMethod: 'Cash'
          }}
        >
          <Row gutter={[24, 0]}>
            <Col xs={24} lg={12}>
              <Card title="Payment Details" size="small">
                <Form.Item
                  label="Customer"
                  name="customerId"
                  rules={[{ required: true, message: 'Please select a customer' }]}
                >
                  <Select
                    placeholder="Select customer"
                    showSearch
                    filterOption={(input, option) =>
                      option.children.toLowerCase().includes(input.toLowerCase())
                    }
                    onChange={handleCustomerChange}
                  >
                    {customers?.map(customer => (
                      <Select.Option key={customer.id} value={customer.id}>
                        {customer.name} - {customer.phone}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item
                  label="Invoice (Optional)"
                  name="invoiceId"
                  help="Select specific invoice or leave blank for general payment"
                >
                  <Select
                    placeholder="Select invoice"
                    loading={invoicesLoading}
                    disabled={!selectedCustomer}
                    allowClear
                    onChange={handleInvoiceChange}
                  >
                    {customerInvoices?.map(invoice => (
                      <Select.Option key={invoice.id} value={invoice.id}>
                        {invoice.invoiceNumber} - {formatPKR(invoice.total)}
                        (Balance: {formatPKR(subtractAmounts(invoice.total, invoice.paidAmount))})
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
                      label="Amount"
                      name="amount"
                      rules={[
                        { required: true, message: 'Please enter amount' },
                        {
                          validator: (_, value) => {
                            const numValue = parseAmount(value);
                            if (!isPositive(numValue)) {
                              return Promise.reject(new Error('Amount must be greater than 0'));
                            }

                            // Validate against invoice remaining balance if invoice is selected
                            if (selectedInvoice) {
                              const remainingBalance = subtractAmounts(selectedInvoice.total, selectedInvoice.paidAmount);
                              if (numValue > remainingBalance) {
                                return Promise.reject(new Error(`Amount cannot exceed remaining balance of ${formatPKR(remainingBalance)}`));
                              }
                            }

                            return Promise.resolve();
                          }
                        }
                      ]}
                    >
                      <Input
                        type="number"
                        prefix="PKR"
                        placeholder="0.00"
                        step="0.01"
                        min="0.01"
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item
                  label="Payment Method"
                  name="paymentMethod"
                  rules={[{ required: true, message: 'Please select payment method' }]}
                >
                  <Select onChange={(value) => setPaymentMethod(value)}>
                    <Select.Option value="Cash">Cash</Select.Option>
                    <Select.Option value="Bank Transfer">Bank Transfer</Select.Option>
                    <Select.Option value="Cheque">Cheque</Select.Option>
                    <Select.Option value="Credit Card">Credit Card</Select.Option>
                    <Select.Option value="Online">Online Payment</Select.Option>
                  </Select>
                </Form.Item>

                <Form.Item
                  label="Reference Number"
                  name="referenceNumber"
                  help="Transaction ID, cheque number, etc."
                  rules={[
                    {
                      required: paymentMethod !== 'Cash',
                      message: 'Reference number is required for this payment method'
                    }
                  ]}
                >
                  <Input placeholder="Enter reference number" />
                </Form.Item>

                <Form.Item label="Notes" name="notes">
                  <TextArea rows={3} placeholder="Additional notes about this payment" />
                </Form.Item>
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              {selectedCustomer && (
                <Card title="Customer Outstanding Invoices" size="small">
                  {customerInvoices?.length > 0 ? (
                    <Table
                      size="small"
                      columns={invoiceColumns}
                      dataSource={customerInvoices}
                      pagination={false}
                      scroll={{ y: 300 }}
                    />
                  ) : (
                    <Alert
                      message="No outstanding invoices"
                      description="This customer has no unpaid invoices."
                      type="info"
                    />
                  )}
                </Card>
              )}

              {selectedInvoice && (
                <Card title="Selected Invoice Details" size="small" style={{ marginTop: 16 }}>
                  <Row gutter={[16, 8]}>
                    <Col span={12}>
                      <Text strong>Invoice #:</Text>
                      <br />
                      {selectedInvoice.invoiceNumber}
                    </Col>
                    <Col span={12}>
                      <Text strong>Date:</Text>
                      <br />
                      {dayjs(selectedInvoice.invoiceDate).format('DD/MM/YYYY')}
                    </Col>
                    <Col span={12}>
                      <Text strong>Total Amount:</Text>
                      <br />
                      PKR {selectedInvoice.total?.toLocaleString()}
                    </Col>
                    <Col span={12}>
                      <Text strong>Outstanding:</Text>
                      <br />
                      <Text style={{ color: '#f5222d' }}>
                        {formatPKR(subtractAmounts(selectedInvoice.total, selectedInvoice.paidAmount))}
                      </Text>
                    </Col>
                  </Row>
                </Card>
              )}
            </Col>
          </Row>

          <Divider />

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => navigate('/app/finance/payments')}>
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={paymentMutation.isLoading}
                icon={<CreditCardOutlined />}
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

export default RecordPayment;