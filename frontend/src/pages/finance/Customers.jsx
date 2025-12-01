// ========== src/pages/finance/Customers.jsx ==========
import React, { useState } from 'react';
import {
  Card, Table, Button, Space, Tag, Input, Modal, Form,
  message, Row, Col, InputNumber
} from 'antd';
import {
  PlusOutlined, EditOutlined, EyeOutlined, PhoneOutlined,
  MailOutlined, DeleteOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { formatPKR } from '../../config/constants';
import { parseAmount } from '../../utils/decimalUtils';
import { nameRules, phoneRules, optionalEmailRules, creditLimitRules, addressRules, nicRules } from '../../utils/validationRules';
import { getErrorMessage } from '../../utils/errorMessages';

const { Search } = Input;
const { TextArea } = Input;

const Customers = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
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
        const operation = editingCustomer ? 'update' : 'create';
        const errorMessage = getErrorMessage(error, 'customer', operation);
        message.error(errorMessage);
      }
    }
  );

  const deleteMutation = useMutation(
    (id) => axios.delete(`/finance/customers/${id}`),
    {
      onSuccess: () => {
        message.success('Customer deleted successfully');
        queryClient.invalidateQueries('customers');
      },
      onError: (error) => {
        const errorMessage = getErrorMessage(error, 'customer', 'delete');
        message.error(errorMessage);
      }
    }
  );

  const handleEdit = (record) => {
    setEditingCustomer(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleView = (record) => {
    navigate(`/app/finance/customers/${record.id}`);
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
        const amount = parseAmount(balance);
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
      render: (limit) => limit > 0 ? formatPKR(parseAmount(limit)) : 'No Limit'
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
          <Button
            icon={<DeleteOutlined />}
            danger
            onClick={() => {
              Modal.confirm({
                title: 'Delete Customer',
                content: 'Are you sure? This will affect all related data.',
                onOk: () => deleteMutation.mutate(record.id)
              });
            }}
          />
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
            rules={nameRules}
          >
            <Input placeholder="Customer name" maxLength={100} showCount />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Phone"
                name="phone"
                rules={phoneRules}
              >
                <Input placeholder="03001234567" maxLength={11} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="NIC" name="nic" rules={nicRules}>
                <Input placeholder="1234567890123 (13 digits)" maxLength={13} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Company" name="company">
            <Input placeholder="Company name" maxLength={100} />
          </Form.Item>

          <Form.Item
            label="Email"
            name="email"
            rules={optionalEmailRules}
          >
            <Input placeholder="email@example.com" maxLength={100} />
          </Form.Item>

          <Form.Item label="Address" name="address" rules={addressRules}>
            <TextArea rows={2} placeholder="Full address" maxLength={500} showCount />
          </Form.Item>

          <Row gutter={16}>
            <Col span={editingCustomer ? 24 : 12}>
              <Form.Item label="Credit Limit (PKR)" name="creditLimit" initialValue={0} rules={creditLimitRules}>
                <InputNumber style={{ width: '100%' }} precision={2} min={0} step={0.01} placeholder="0 for no limit" />
              </Form.Item>
            </Col>
            {!editingCustomer && (
              <Col span={12}>
                <Form.Item label="Opening Balance (PKR)" name="openingBalance" initialValue={0}>
                  <InputNumber style={{ width: '100%' }} precision={2} min={0} step={0.01} placeholder="0.00" />
                </Form.Item>
              </Col>
            )}
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
    </>
  );
};

export default Customers;
