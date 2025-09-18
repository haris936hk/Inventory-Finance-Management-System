import React, { useState } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, Select, DatePicker, Tag, message, InputNumber } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

const { Option } = Select;
const { RangePicker } = DatePicker;

const Payments = () => {
  const navigate = useNavigate();
  const [payments, setPayments] = useState([
    {
      id: 1,
      paymentId: 'PAY-001',
      invoiceNumber: 'INV-2024-001',
      customerName: 'ABC Corporation',
      amount: 715.00,
      paymentDate: '2024-01-20',
      paymentMethod: 'Bank Transfer',
      status: 'Completed',
      reference: 'TXN123456789'
    },
    {
      id: 2,
      paymentId: 'PAY-002',
      invoiceNumber: 'INV-2024-002',
      customerName: 'XYZ Ltd.',
      amount: 1250.00,
      paymentDate: '2024-01-18',
      paymentMethod: 'Credit Card',
      status: 'Completed',
      reference: 'CC987654321'
    },
    {
      id: 3,
      paymentId: 'PAY-003',
      invoiceNumber: 'INV-2024-003',
      customerName: 'Tech Solutions Inc.',
      amount: 850.00,
      paymentDate: '2024-01-15',
      paymentMethod: 'Check',
      status: 'Pending',
      reference: 'CHK001234'
    },
    {
      id: 4,
      paymentId: 'PAY-004',
      invoiceNumber: 'INV-2024-004',
      customerName: 'Global Services',
      amount: 500.00,
      paymentDate: '2024-01-10',
      paymentMethod: 'Cash',
      status: 'Failed',
      reference: 'CASH001'
    }
  ]);
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const paymentMethods = ['Bank Transfer', 'Credit Card', 'Debit Card', 'Check', 'Cash', 'PayPal', 'Other'];
  const paymentStatuses = ['Completed', 'Pending', 'Failed', 'Cancelled'];

  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed': return 'green';
      case 'Pending': return 'orange';
      case 'Failed': return 'red';
      case 'Cancelled': return 'gray';
      default: return 'default';
    }
  };

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = payment.customerName.toLowerCase().includes(searchText.toLowerCase()) ||
                         payment.invoiceNumber.toLowerCase().includes(searchText.toLowerCase()) ||
                         payment.paymentId.toLowerCase().includes(searchText.toLowerCase());
    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const columns = [
    {
      title: 'Payment ID',
      dataIndex: 'paymentId',
      key: 'paymentId',
      sorter: (a, b) => a.paymentId.localeCompare(b.paymentId),
    },
    {
      title: 'Invoice Number',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
      render: (invoiceNumber) => (
        <Button 
          type="link" 
          onClick={() => navigate(`/finance/invoices/${invoiceNumber}`)}
        >
          {invoiceNumber}
        </Button>
      ),
    },
    {
      title: 'Customer',
      dataIndex: 'customerName',
      key: 'customerName',
      sorter: (a, b) => a.customerName.localeCompare(b.customerName),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount) => `$${amount.toFixed(2)}`,
      sorter: (a, b) => a.amount - b.amount,
      align: 'right',
    },
    {
      title: 'Payment Date',
      dataIndex: 'paymentDate',
      key: 'paymentDate',
      sorter: (a, b) => new Date(a.paymentDate) - new Date(b.paymentDate),
    },
    {
      title: 'Method',
      dataIndex: 'paymentMethod',
      key: 'paymentMethod',
      filters: paymentMethods.map(method => ({ text: method, value: method })),
      onFilter: (value, record) => record.paymentMethod === value,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={getStatusColor(status)}>{status}</Tag>
      ),
      filters: paymentStatuses.map(status => ({ text: status, value: status })),
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Reference',
      dataIndex: 'reference',
      key: 'reference',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button 
            icon={<EyeOutlined />} 
            size="small"
            onClick={() => handleView(record)}
          >
            View
          </Button>
          <Button 
            icon={<EditOutlined />} 
            size="small"
            onClick={() => handleEdit(record)}
          >
            Edit
          </Button>
          <Button 
            icon={<DeleteOutlined />} 
            danger 
            size="small"
            onClick={() => handleDelete(record.id)}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  const handleAdd = () => {
    setEditingPayment(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (payment) => {
    setEditingPayment(payment);
    form.setFieldsValue({
      ...payment,
      paymentDate: dayjs(payment.paymentDate)
    });
    setIsModalVisible(true);
  };

  const handleView = (payment) => {
    navigate(`/finance/payments/${payment.id}`);
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: 'Are you sure you want to delete this payment?',
      content: 'This action cannot be undone.',
      onOk: () => {
        setPayments(payments.filter(payment => payment.id !== id));
        message.success('Payment deleted successfully');
      },
    });
  };

  const handleSubmit = (values) => {
    const formattedValues = {
      ...values,
      paymentDate: values.paymentDate.format('YYYY-MM-DD')
    };

    if (editingPayment) {
      setPayments(payments.map(payment => 
        payment.id === editingPayment.id ? { ...payment, ...formattedValues } : payment
      ));
      message.success('Payment updated successfully');
    } else {
      const newPayment = {
        id: Math.max(...payments.map(p => p.id)) + 1,
        paymentId: `PAY-${String(Math.max(...payments.map(p => p.id)) + 1).padStart(3, '0')}`,
        ...formattedValues
      };
      setPayments([...payments, newPayment]);
      message.success('Payment added successfully');
    }
    setIsModalVisible(false);
  };

  const handleRecordPayment = () => {
    navigate('/finance/record-payment');
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card 
        title="Payments Management"
        extra={
          <Space>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={handleRecordPayment}
            >
              Record Payment
            </Button>
            <Button 
              icon={<PlusOutlined />} 
              onClick={handleAdd}
            >
              Add Payment
            </Button>
          </Space>
        }
      >
        <Space style={{ marginBottom: '16px', width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Input.Search
              placeholder="Search payments..."
              allowClear
              style={{ width: 300 }}
              onChange={(e) => setSearchText(e.target.value)}
              prefix={<SearchOutlined />}
            />
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 150 }}
            >
              <Option value="all">All Status</Option>
              {paymentStatuses.map(status => (
                <Option key={status} value={status}>{status}</Option>
              ))}
            </Select>
          </Space>
        </Space>
        
        <Table 
          columns={columns} 
          dataSource={filteredPayments} 
          rowKey="id"
          pagination={{ 
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} payments`
          }}
          scroll={{ x: 1200 }}
        />
      </Card>

      <Modal
        title={editingPayment ? 'Edit Payment' : 'Add Payment'}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ status: 'Completed' }}
        >
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item
              name="invoiceNumber"
              label="Invoice Number"
              style={{ width: '50%', marginRight: '8px' }}
              rules={[{ required: true, message: 'Please enter invoice number' }]}
            >
              <Input placeholder="INV-2024-001" />
            </Form.Item>
            
            <Form.Item
              name="customerName"
              label="Customer Name"
              style={{ width: '50%' }}
              rules={[{ required: true, message: 'Please enter customer name' }]}
            >
              <Input placeholder="Customer name" />
            </Form.Item>
          </Space.Compact>
          
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item
              name="amount"
              label="Amount"
              style={{ width: '50%', marginRight: '8px' }}
              rules={[{ required: true, message: 'Please enter amount' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                placeholder="0.00"
                min={0}
                precision={2}
                formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={value => value.replace(/\$\s?|(,*)/g, '')}
              />
            </Form.Item>
            
            <Form.Item
              name="paymentDate"
              label="Payment Date"
              style={{ width: '50%' }}
              rules={[{ required: true, message: 'Please select payment date' }]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space.Compact>
          
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item
              name="paymentMethod"
              label="Payment Method"
              style={{ width: '50%', marginRight: '8px' }}
              rules={[{ required: true, message: 'Please select payment method' }]}
            >
              <Select placeholder="Select method">
                {paymentMethods.map(method => (
                  <Option key={method} value={method}>{method}</Option>
                ))}
              </Select>
            </Form.Item>
            
            <Form.Item
              name="status"
              label="Status"
              style={{ width: '50%' }}
              rules={[{ required: true, message: 'Please select status' }]}
            >
              <Select>
                {paymentStatuses.map(status => (
                  <Option key={status} value={status}>{status}</Option>
                ))}
              </Select>
            </Form.Item>
          </Space.Compact>
          
          <Form.Item
            name="reference"
            label="Reference Number"
          >
            <Input placeholder="Transaction reference or check number" />
          </Form.Item>
          
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingPayment ? 'Update' : 'Add'} Payment
              </Button>
              <Button onClick={() => setIsModalVisible(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Payments;