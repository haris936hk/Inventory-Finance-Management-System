// ========== src/pages/inventory/Vendors.jsx ==========
import React, { useState } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, Switch, message, Space, Tag,
  Drawer, Descriptions, Statistic, Row, Col, Tabs
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, PhoneOutlined, MailOutlined,
  EyeOutlined, FileTextOutlined, CreditCardOutlined, ReconciliationOutlined,
  ShopOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import LedgerView from '../../components/LedgerView';
import { formatPKR } from '../../config/constants';

const Vendors = () => {
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [form] = Form.useForm();

  const { data: vendors, isLoading } = useQuery('vendors', async () => {
    const response = await axios.get('/inventory/vendors');
    return response.data.data;
  });

  const vendorMutation = useMutation(
    (data) => {
      if (editingVendor) {
        return axios.put(`/inventory/vendors/${editingVendor.id}`, data);
      }
      return axios.post('/inventory/vendors', data);
    },
    {
      onSuccess: () => {
        message.success(`Vendor ${editingVendor ? 'updated' : 'created'} successfully`);
        queryClient.invalidateQueries('vendors');
        handleCloseModal();
      },
      onError: (error) => {
        console.error('Vendor operation failed:', error);
        const errorMessage = error.response?.data?.message || error.message || 'An error occurred';
        message.error(errorMessage);
      }
    }
  );

  const deleteMutation = useMutation(
    (id) => axios.delete(`/inventory/vendors/${id}`),
    {
      onSuccess: () => {
        message.success('Vendor deleted successfully');
        queryClient.invalidateQueries('vendors');
      },
      onError: (error) => {
        console.error('Delete failed:', error);
        const errorMessage = error.response?.data?.message || error.message || 'Failed to delete vendor';
        message.error(errorMessage);
      }
    }
  );

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingVendor(null);
    form.resetFields();
  };

  const handleView = async (record) => {
    setSelectedVendor(record);
    // Fetch detailed vendor data including related records
    try {
      const response = await axios.get(`/inventory/vendors/${record.id}`);
      setSelectedVendor(response.data.data);
      setDrawerVisible(true);
    } catch (error) {
      message.error('Failed to load vendor details');
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      render: (code) => <Tag>{code}</Tag>
    },
    {
      title: 'Contact Person',
      dataIndex: 'contactPerson',
      key: 'contactPerson'
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
      render: (phone) => phone && (
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
      render: (email) => email && (
        <Space>
          <MailOutlined />
          {email}
        </Space>
      )
    },
    {
      title: 'Tax Number',
      dataIndex: 'taxNumber',
      key: 'taxNumber',
      render: (taxNumber) => taxNumber || '-'
    },
    {
      title: 'Payment Terms',
      dataIndex: 'paymentTerms',
      key: 'paymentTerms',
      render: (terms) => terms || '-'
    },
    {
      title: 'Current Balance',
      dataIndex: 'currentBalance',
      key: 'currentBalance',
      render: (balance) => balance ? formatPKR(Number(balance)) : formatPKR(0)
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            icon={<EyeOutlined />}
            onClick={() => handleView(record)}
          />
          <Button
            icon={<EditOutlined />}
            onClick={() => {
              setEditingVendor(record);
              form.setFieldsValue(record);
              setModalVisible(true);
            }}
          />
          <Button
            icon={<DeleteOutlined />}
            danger
            onClick={() => {
              Modal.confirm({
                title: 'Delete Vendor',
                content: 'Are you sure? This will affect all related purchase orders.',
                onOk: () => deleteMutation.mutate(record.id)
              });
            }}
          />
        </Space>
      )
    }
  ];

  return (
    <Card
      title="Vendors"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalVisible(true)}
        >
          Add Vendor
        </Button>
      }
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={vendors}
        loading={isLoading}
        scroll={{ x: 800 }}
      />

      <Modal
        title={editingVendor ? 'Edit Vendor' : 'Add Vendor'}
        open={modalVisible}
        onCancel={handleCloseModal}
        footer={null}
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => {
            // Convert balance fields to numbers for backend
            const processedValues = {
              ...values,
              openingBalance: values.openingBalance ? parseFloat(values.openingBalance) : 0,
              currentBalance: values.currentBalance ? parseFloat(values.currentBalance) : 0
            };
            vendorMutation.mutate(processedValues);
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              label="Name"
              name="name"
              rules={[{ required: true, message: 'Name is required' }]}
            >
              <Input placeholder="e.g., ABC Electronics" />
            </Form.Item>

            <Form.Item
              label="Code"
              name="code"
              rules={[{ required: true, message: 'Code is required' }]}
            >
              <Input placeholder="e.g., ABC" maxLength={10} />
            </Form.Item>

            <Form.Item label="Contact Person" name="contactPerson">
              <Input placeholder="Contact person name" />
            </Form.Item>

            <Form.Item
              label="Phone"
              name="phone"
              rules={[
                { pattern: /^[\d\s\-\+\(\)]+$/, message: 'Invalid phone number' }
              ]}
            >
              <Input placeholder="e.g., +92 300 1234567" />
            </Form.Item>

            <Form.Item
              label="Email"
              name="email"
              rules={[{ type: 'email', message: 'Invalid email address' }]}
            >
              <Input placeholder="vendor@example.com" />
            </Form.Item>

          </div>

          <Form.Item label="Address" name="address">
            <Input.TextArea rows={2} placeholder="Complete address" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item label="Tax Number" name="taxNumber">
              <Input placeholder="e.g., 12345-6789012-3" />
            </Form.Item>

            <Form.Item label="Payment Terms" name="paymentTerms">
              <Input placeholder="e.g., Net 30, Due on Receipt" />
            </Form.Item>

            <Form.Item
              label="Opening Balance (PKR)"
              name="openingBalance"
              rules={[
                { pattern: /^\d+(\.\d{1,2})?$/, message: 'Enter valid amount (e.g., 1000.50)' }
              ]}
            >
              <Input placeholder="0.00" />
            </Form.Item>

            <Form.Item
              label="Current Balance (PKR)"
              name="currentBalance"
              rules={[
                { pattern: /^\d+(\.\d{1,2})?$/, message: 'Enter valid amount (e.g., 1000.50)' }
              ]}
            >
              <Input placeholder="0.00" />
            </Form.Item>
          </div>

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={handleCloseModal}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={vendorMutation.isLoading}>
                {editingVendor ? 'Update' : 'Create'}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* Vendor Details Drawer */}
      <Drawer
        title="Vendor Details"
        placement="right"
        width={700}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
      >
        {selectedVendor && (
          <Tabs defaultActiveKey="1">
            <Tabs.TabPane tab="Overview" key="1">
              <Descriptions bordered column={1}>
                <Descriptions.Item label="Name">{selectedVendor.name}</Descriptions.Item>
                <Descriptions.Item label="Code">{selectedVendor.code}</Descriptions.Item>
                <Descriptions.Item label="Contact Person">{selectedVendor.contactPerson || '-'}</Descriptions.Item>
                <Descriptions.Item label="Phone">{selectedVendor.phone || '-'}</Descriptions.Item>
                <Descriptions.Item label="Email">{selectedVendor.email || '-'}</Descriptions.Item>
                <Descriptions.Item label="Address">{selectedVendor.address || '-'}</Descriptions.Item>
                <Descriptions.Item label="Tax Number">{selectedVendor.taxNumber || '-'}</Descriptions.Item>
                <Descriptions.Item label="Payment Terms">{selectedVendor.paymentTerms || '-'}</Descriptions.Item>
              </Descriptions>

              <Row gutter={16} style={{ marginTop: 24 }}>
                <Col span={8}>
                  <Card>
                    <Statistic
                      title="Current Balance"
                      value={selectedVendor.currentBalance}
                      prefix="PKR"
                      valueStyle={{
                        color: selectedVendor.currentBalance > 0 ? '#f5222d' : '#52c41a'
                      }}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card>
                    <Statistic
                      title="Purchase Orders"
                      value={selectedVendor._count?.purchaseOrders || 0}
                      prefix={<ReconciliationOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card>
                    <Statistic
                      title="Items Supplied"
                      value={selectedVendor._count?.items || 0}
                      prefix={<ShopOutlined />}
                    />
                  </Card>
                </Col>
              </Row>
            </Tabs.TabPane>

            <Tabs.TabPane tab="Purchase Orders" key="2">
              <Table
                dataSource={selectedVendor.purchaseOrders}
                columns={[
                  { title: 'PO #', dataIndex: 'poNumber', key: 'poNumber' },
                  {
                    title: 'Date',
                    dataIndex: 'orderDate',
                    key: 'orderDate',
                    render: (date) => new Date(date).toLocaleDateString()
                  },
                  {
                    title: 'Total',
                    dataIndex: 'total',
                    key: 'total',
                    render: (amount) => formatPKR(parseFloat(amount))
                  },
                  {
                    title: 'Status',
                    dataIndex: 'status',
                    key: 'status',
                    render: (status) => (
                      <Tag color={
                        status === 'Completed' ? 'green' :
                        status === 'Pending' ? 'orange' :
                        status === 'Cancelled' ? 'red' : 'blue'
                      }>
                        {status}
                      </Tag>
                    )
                  }
                ]}
                pagination={false}
              />
            </Tabs.TabPane>

            <Tabs.TabPane tab="Bills" key="3">
              <Table
                dataSource={selectedVendor.bills}
                columns={[
                  { title: 'Bill #', dataIndex: 'billNumber', key: 'billNumber' },
                  {
                    title: 'Date',
                    dataIndex: 'billDate',
                    key: 'billDate',
                    render: (date) => new Date(date).toLocaleDateString()
                  },
                  {
                    title: 'Total',
                    dataIndex: 'total',
                    key: 'total',
                    render: (amount) => formatPKR(parseFloat(amount))
                  },
                  {
                    title: 'Status',
                    dataIndex: 'status',
                    key: 'status',
                    render: (status) => (
                      <Tag color={
                        status === 'Paid' ? 'green' :
                        status === 'Overdue' ? 'red' :
                        status === 'Partial' ? 'orange' : 'blue'
                      }>
                        {status}
                      </Tag>
                    )
                  }
                ]}
                pagination={false}
              />
            </Tabs.TabPane>

            <Tabs.TabPane tab="Payments" key="4">
              <Table
                dataSource={selectedVendor.payments}
                columns={[
                  { title: 'Payment #', dataIndex: 'paymentNumber', key: 'paymentNumber' },
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
                    render: (amount) => formatPKR(parseFloat(amount))
                  },
                  { title: 'Method', dataIndex: 'method', key: 'method' }
                ]}
                pagination={false}
              />
            </Tabs.TabPane>

            <Tabs.TabPane tab="Ledger" key="5">
              <LedgerView
                entityId={selectedVendor.id}
                entityType="vendor"
                title="Vendor Ledger"
              />
            </Tabs.TabPane>
          </Tabs>
        )}
      </Drawer>
    </Card>
  );
};

export default Vendors;