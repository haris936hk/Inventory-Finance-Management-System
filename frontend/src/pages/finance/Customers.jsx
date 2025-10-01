// ========== src/pages/finance/Customers.jsx ==========
import React, { useState } from 'react';
import {
  Card, Table, Button, Space, Tag, Input, Modal, Form,
  message, Descriptions, Drawer, Statistic, Row, Col, Tabs
} from 'antd';
import {
  PlusOutlined, EditOutlined, EyeOutlined, PhoneOutlined,
  MailOutlined, CreditCardOutlined, FileTextOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import LedgerView from '../../components/LedgerView';
import CustomerStatement from '../../components/CustomerStatement';
import { formatPKR } from '../../config/constants';

const { Search } = Input;
const { TextArea } = Input;

const Customers = () => {
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [form] = Form.useForm();

  // Fetch customers
  const { data: customersData, isLoading } = useQuery(
    ['customers', searchText],
    async () => {
      const response = await axios.get('/finance/customers', {
        params: { search: searchText }
      });
      return response.data.data;
    }
  );

  // Create/Update customer mutation
  const customerMutation = useMutation(
    (data) => {
      if (editingCustomer) {
        return axios.put(`/finance/customers/${editingCustomer.id}`, data);
      }
      return axios.post('/finance/customers', data);
    },
    {
      onSuccess: () => {
        message.success(`Customer ${editingCustomer ? 'updated' : 'created'} successfully`);
        queryClient.invalidateQueries('customers');
        setModalVisible(false);
        form.resetFields();
        setEditingCustomer(null);
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Operation failed');
      }
    }
  );

  const handleEdit = (record) => {
    setEditingCustomer(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleView = async (record) => {
    setSelectedCustomer(record);
    // Fetch detailed customer data
    try {
      const response = await axios.get(`/finance/customers/${record.id}`);
      setSelectedCustomer(response.data.data);
      setDrawerVisible(true);
    } catch (error) {
      message.error('Failed to load customer details');
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Button type="link" onClick={() => handleView(record)}>
          {text}
        </Button>
      )
    },
    {
      title: 'Company',
      dataIndex: 'company',
      key: 'company',
      render: (text) => text || '-'
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
      render: (phone) => (
        <Space>
          <PhoneOutlined />
          {phone}
        </Space>
      )
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (email) => email ? (
        <Space>
          <MailOutlined />
          {email}
        </Space>
      ) : '-'
    },
    {
      title: 'Balance',
      dataIndex: 'currentBalance',
      key: 'currentBalance',
      render: (balance) => {
        const amount = parseFloat(balance);
        return (
          <Tag color={amount > 0 ? 'red' : 'green'}>
            {formatPKR(amount)}
          </Tag>
        );
      }
    },
    {
      title: 'Credit Limit',
      dataIndex: 'creditLimit',
      key: 'creditLimit',
      render: (limit) => limit > 0 ? formatPKR(parseFloat(limit)) : 'No Limit'
    },
    {
      title: 'Invoices',
      dataIndex: '_count',
      key: 'invoices',
      render: (count) => count?.invoices || 0
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button icon={<EyeOutlined />} onClick={() => handleView(record)} />
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
        </Space>
      )
    }
  ];

  return (
    <>
      <Card
        title="Customers"
        extra={
          <Space>
            <Search
              placeholder="Search customers"
              allowClear
              onSearch={setSearchText}
              style={{ width: 200 }}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingCustomer(null);
                form.resetFields();
                setModalVisible(true);
              }}
            >
              Add Customer
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={customersData}
          loading={isLoading}
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} customers`
          }}
        />
      </Card>

      {/* Add/Edit Customer Modal */}
      <Modal
        title={editingCustomer ? 'Edit Customer' : 'Add Customer'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingCustomer(null);
          form.resetFields();
        }}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => customerMutation.mutate(values)}
        >
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="Customer name" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Phone"
                name="phone"
                rules={[
                  { required: true, message: 'Phone is required' },
                  { pattern: /^\d{11}$/, message: 'Invalid phone number' }
                ]}
              >
                <Input placeholder="03001234567" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="NIC" name="nic">
                <Input placeholder="National ID" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Company" name="company">
            <Input placeholder="Company name" />
          </Form.Item>

          <Form.Item
            label="Email"
            name="email"
            rules={[{ type: 'email', message: 'Invalid email' }]}
          >
            <Input placeholder="email@example.com" />
          </Form.Item>

          <Form.Item label="Address" name="address">
            <TextArea rows={2} placeholder="Full address" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Credit Limit" name="creditLimit" initialValue={0}>
                <Input type="number" prefix="PKR" placeholder="0 for no limit" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Opening Balance" name="openingBalance" initialValue={0}>
                <Input type="number" prefix="PKR" />
              </Form.Item>
            </Col>
          </Row>

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setModalVisible(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={customerMutation.isLoading}>
                {editingCustomer ? 'Update' : 'Create'}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* Customer Details Drawer */}
      <Drawer
        title="Customer Details"
        placement="right"
        width={700}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
      >
        {selectedCustomer && (
          <Tabs defaultActiveKey="1">
            <Tabs.TabPane tab="Overview" key="1">
              <Descriptions bordered column={1}>
                <Descriptions.Item label="Name">{selectedCustomer.name}</Descriptions.Item>
                <Descriptions.Item label="Company">{selectedCustomer.company || '-'}</Descriptions.Item>
                <Descriptions.Item label="Phone">{selectedCustomer.phone}</Descriptions.Item>
                <Descriptions.Item label="Email">{selectedCustomer.email || '-'}</Descriptions.Item>
                <Descriptions.Item label="NIC">{selectedCustomer.nic || '-'}</Descriptions.Item>
                <Descriptions.Item label="Address">{selectedCustomer.address || '-'}</Descriptions.Item>
                <Descriptions.Item label="Credit Limit">
                  {selectedCustomer.creditLimit > 0
                    ? formatPKR(parseFloat(selectedCustomer.creditLimit))
                    : 'No Limit'}
                </Descriptions.Item>
              </Descriptions>

              <Row gutter={16} style={{ marginTop: 24 }}>
                <Col span={8}>
                  <Card>
                    <Statistic
                      title="Current Balance"
                      value={selectedCustomer.currentBalance}
                      prefix="PKR"
                      valueStyle={{ 
                        color: selectedCustomer.currentBalance > 0 ? '#ff4d4f' : '#52c41a' 
                      }}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card>
                    <Statistic
                      title="Total Invoices"
                      value={selectedCustomer.invoices?.length || 0}
                      prefix={<FileTextOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card>
                    <Statistic
                      title="Total Payments"
                      value={selectedCustomer.payments?.length || 0}
                      prefix={<CreditCardOutlined />}
                    />
                  </Card>
                </Col>
              </Row>
            </Tabs.TabPane>

            <Tabs.TabPane tab="Invoices" key="2">
              <Table
                dataSource={selectedCustomer.invoices}
                columns={[
                  {
                    title: 'Invoice #',
                    dataIndex: 'invoiceNumber',
                    key: 'invoiceNumber',
                    render: (text, record) => (
                      <Space direction="vertical" size="small">
                        <span style={{ color: record.cancelledAt ? '#999' : 'inherit' }}>
                          {text}
                        </span>
                        {record.cancelledAt && <Tag color="red" size="small">CANCELLED</Tag>}
                      </Space>
                    )
                  },
                  {
                    title: 'Date',
                    dataIndex: 'invoiceDate',
                    key: 'invoiceDate',
                    render: (date) => new Date(date).toLocaleDateString()
                  },
                  {
                    title: 'Total',
                    dataIndex: 'total',
                    key: 'total',
                    render: (amount, record) => (
                      <span style={{
                        color: record.cancelledAt ? '#999' : 'inherit',
                        textDecoration: record.cancelledAt ? 'line-through' : 'none'
                      }}>
                        {formatPKR(parseFloat(amount))}
                      </span>
                    )
                  },
                  {
                    title: 'Paid',
                    dataIndex: 'paidAmount',
                    key: 'paidAmount',
                    render: (amount) => formatPKR(parseFloat(amount || 0))
                  },
                  {
                    title: 'Status',
                    dataIndex: 'status',
                    key: 'status',
                    render: (status, record) => {
                      if (record.cancelledAt) {
                        return <Tag color="red">Cancelled</Tag>;
                      }
                      return (
                        <Tag color={
                          status === 'Draft' ? 'default' :
                          status === 'Sent' ? 'blue' :
                          status === 'Partial' ? 'orange' :
                          status === 'Paid' ? 'green' :
                          status === 'Overdue' ? 'red' : 'default'
                        }>
                          {status}
                        </Tag>
                      );
                    }
                  }
                ]}
                pagination={false}
              />
            </Tabs.TabPane>

            <Tabs.TabPane tab="Payments" key="3">
              <Table
                dataSource={selectedCustomer.payments}
                columns={[
                  {
                    title: 'Payment #',
                    dataIndex: 'paymentNumber',
                    key: 'paymentNumber',
                    render: (text, record) => (
                      <Space direction="vertical" size="small">
                        <span style={{ color: record.voidedAt ? '#999' : 'inherit' }}>
                          {text}
                        </span>
                        {record.voidedAt && <Tag color="red" size="small">VOIDED</Tag>}
                      </Space>
                    )
                  },
                  {
                    title: 'Date',
                    dataIndex: 'paymentDate',
                    key: 'paymentDate',
                    render: (date) => new Date(date).toLocaleDateString()
                  },
                  {
                    title: 'Amount',
                    dataIndex: 'amount',
                    key: 'amount',
                    render: (amount, record) => (
                      <span style={{
                        color: record.voidedAt ? '#999' : 'inherit',
                        textDecoration: record.voidedAt ? 'line-through' : 'none'
                      }}>
                        {formatPKR(parseFloat(amount))}
                      </span>
                    )
                  },
                  {
                    title: 'Method',
                    dataIndex: 'method',
                    key: 'method',
                    render: (method, record) => (
                      <span style={{ color: record.voidedAt ? '#999' : 'inherit' }}>
                        {method}
                      </span>
                    )
                  }
                ]}
                pagination={false}
              />
            </Tabs.TabPane>

            <Tabs.TabPane tab="Ledger" key="4">
              <LedgerView
                entityId={selectedCustomer.id}
                entityType="customer"
                title="Customer Ledger"
              />
            </Tabs.TabPane>

            <Tabs.TabPane tab="Statement" key="5">
              <CustomerStatement customerId={selectedCustomer.id} />
            </Tabs.TabPane>
          </Tabs>
        )}
      </Drawer>
    </>
  );
};

export default Customers;
