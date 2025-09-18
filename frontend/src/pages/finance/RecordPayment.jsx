import React, { useState } from 'react';
import { Card, Form, Input, Select, DatePicker, Button, Space, InputNumber, Row, Col, Divider, message, Table, Tag } from 'antd';
import { ArrowLeftOutlined, SaveOutlined, SearchOutlined, DollarOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

const { Option } = Select;
const { TextArea } = Input;

const RecordPayment = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Mock invoice data
  const mockInvoices = [
    {
      id: 1,
      invoiceNumber: 'INV-2024-001',
      customerName: 'ABC Corporation',
      totalAmount: 715.00,
      paidAmount: 0.00,
      remainingAmount: 715.00,
      dueDate: '2024-02-15',
      status: 'Pending'
    },
    {
      id: 2,
      invoiceNumber: 'INV-2024-002',
      customerName: 'XYZ Ltd.',
      totalAmount: 1250.00,
      paidAmount: 500.00,
      remainingAmount: 750.00,
      dueDate: '2024-02-20',
      status: 'Partially Paid'
    },
    {
      id: 3,
      invoiceNumber: 'INV-2024-003',
      customerName: 'Tech Solutions Inc.',
      totalAmount: 850.00,
      paidAmount: 0.00,
      remainingAmount: 850.00,
      dueDate: '2024-02-10',
      status: 'Overdue'
    }
  ];

  const paymentMethods = [
    'Bank Transfer',
    'Credit Card',
    'Debit Card',
    'Check',
    'Cash',
    'PayPal',
    'Wire Transfer',
    'Other'
  ];

  const handleInvoiceSearch = (value) => {
    if (!value || value.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    // Simulate API call
    setTimeout(() => {
      const results = mockInvoices.filter(invoice => 
        invoice.invoiceNumber.toLowerCase().includes(value.toLowerCase()) ||
        invoice.customerName.toLowerCase().includes(value.toLowerCase())
      );
      setSearchResults(results);
      setIsSearching(false);
    }, 500);
  };

  const handleInvoiceSelect = (invoice) => {
    setSelectedInvoice(invoice);
    form.setFieldsValue({
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      invoiceAmount: invoice.totalAmount,
      remainingAmount: invoice.remainingAmount,
      paymentAmount: invoice.remainingAmount // Default to full remaining amount
    });
    setSearchResults([]);
  };

  const handleSubmit = (values) => {
    const paymentData = {
      ...values,
      paymentDate: values.paymentDate.format('YYYY-MM-DD'),
      invoiceId: selectedInvoice?.id,
      paymentId: `PAY-${Date.now()}` // Generate unique payment ID
    };

    console.log('Recording payment:', paymentData);
    message.success('Payment recorded successfully!');
    
    // Navigate back to payments list
    navigate('/finance/payments');
  };

  const handleBack = () => {
    navigate('/finance/payments');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Paid': return 'green';
      case 'Pending': return 'orange';
      case 'Overdue': return 'red';
      case 'Partially Paid': return 'blue';
      default: return 'default';
    }
  };

  const searchColumns = [
    {
      title: 'Invoice Number',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
    },
    {
      title: 'Customer',
      dataIndex: 'customerName',
      key: 'customerName',
    },
    {
      title: 'Total Amount',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      render: (amount) => `$${amount.toFixed(2)}`,
      align: 'right',
    },
    {
      title: 'Remaining',
      dataIndex: 'remainingAmount',
      key: 'remainingAmount',
      render: (amount) => `$${amount.toFixed(2)}`,
      align: 'right',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={getStatusColor(status)}>{status}</Tag>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Button 
          type="primary" 
          size="small"
          onClick={() => handleInvoiceSelect(record)}
        >
          Select
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Space style={{ marginBottom: '24px' }}>
        <Button 
          icon={<ArrowLeftOutlined />} 
          onClick={handleBack}
        >
          Back to Payments
        </Button>
      </Space>

      <Card title="Record Payment" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            paymentDate: dayjs(),
            paymentMethod: 'Bank Transfer'
          }}
        >
          {/* Invoice Search Section */}
          <Divider orientation="left">Invoice Information</Divider>
          
          <Form.Item label="Search Invoice">
            <Input.Search
              placeholder="Search by invoice number or customer name"
              allowClear
              loading={isSearching}
              onSearch={handleInvoiceSearch}
              onChange={(e) => handleInvoiceSearch(e.target.value)}
              prefix={<SearchOutlined />}
            />
          </Form.Item>

          {searchResults.length > 0 && (
            <Card size="small" style={{ marginBottom: '16px' }}>
              <Table
                columns={searchColumns}
                dataSource={searchResults}
                rowKey="id"
                pagination={false}
                size="small"
              />
            </Card>
          )}

          {selectedInvoice && (
            <Card size="small" style={{ marginBottom: '16px', backgroundColor: '#f6ffed', border: '1px solid #b7eb8f' }}>
              <Row gutter={16}>
                <Col span={12}>
                  <strong>Selected Invoice:</strong> {selectedInvoice.invoiceNumber}
                </Col>
                <Col span={12}>
                  <strong>Customer:</strong> {selectedInvoice.customerName}
                </Col>
                <Col span={12}>
                  <strong>Total Amount:</strong> ${selectedInvoice.totalAmount.toFixed(2)}
                </Col>
                <Col span={12}>
                  <strong>Remaining:</strong> ${selectedInvoice.remainingAmount.toFixed(2)}
                </Col>
              </Row>
            </Card>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="invoiceNumber"
                label="Invoice Number"
                rules={[{ required: true, message: 'Please select an invoice' }]}
              >
                <Input placeholder="Select an invoice from search" disabled />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="customerName"
                label="Customer Name"
              >
                <Input disabled />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="invoiceAmount"
                label="Invoice Total Amount"
              >
                <InputNumber
                  style={{ width: '100%' }}
                  disabled
                  formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={value => value.replace(/\$\s?|(,*)/g, '')}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="remainingAmount"
                label="Remaining Amount"
              >
                <InputNumber
                  style={{ width: '100%' }}
                  disabled
                  formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={value => value.replace(/\$\s?|(,*)/g, '')}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Payment Details Section */}
          <Divider orientation="left">Payment Details</Divider>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="paymentAmount"
                label="Payment Amount"
                rules={[
                  { required: true, message: 'Please enter payment amount' },
                  {
                    validator: (_, value) => {
                      if (selectedInvoice && value > selectedInvoice.remainingAmount) {
                        return Promise.reject(new Error('Payment amount cannot exceed remaining amount'));
                      }
                      return Promise.resolve();
                    }
                  }
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  precision={2}
                  formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={value => value.replace(/\$\s?|(,*)/g, '')}
                  placeholder="0.00"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="paymentDate"
                label="Payment Date"
                rules={[{ required: true, message: 'Please select payment date' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="paymentMethod"
                label="Payment Method"
                rules={[{ required: true, message: 'Please select payment method' }]}
              >
                <Select placeholder="Select payment method">
                  {paymentMethods.map(method => (
                    <Option key={method} value={method}>{method}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="referenceNumber"
                label="Reference Number"
              >
                <Input placeholder="Transaction reference or check number" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="notes"
            label="Notes (Optional)"
          >
            <TextArea 
              rows={3} 
              placeholder="Additional notes about this payment..."
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button 
                type="primary" 
                htmlType="submit"
                icon={<SaveOutlined />}
                disabled={!selectedInvoice}
              >
                Record Payment
              </Button>
              <Button onClick={handleBack}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default RecordPayment;