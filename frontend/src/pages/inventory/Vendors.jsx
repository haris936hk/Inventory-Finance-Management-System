// ========== src/pages/inventory/Vendors.jsx ==========
import React, { useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Switch, message, Space, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PhoneOutlined, MailOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';

const Vendors = () => {
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
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
      }
    }
  );

  const deleteMutation = useMutation(
    (id) => axios.delete(`/inventory/vendors/${id}`),
    {
      onSuccess: () => {
        message.success('Vendor deleted successfully');
        queryClient.invalidateQueries('vendors');
      }
    }
  );

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingVendor(null);
    form.resetFields();
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
      title: 'City',
      dataIndex: 'city',
      key: 'city'
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (active) => <Switch checked={active} disabled />
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
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
          onFinish={(values) => vendorMutation.mutate(values)}
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

            <Form.Item label="City" name="city">
              <Input placeholder="e.g., Karachi" />
            </Form.Item>
          </div>

          <Form.Item label="Address" name="address">
            <Input.TextArea rows={2} placeholder="Complete address" />
          </Form.Item>

          <Form.Item label="Notes" name="notes">
            <Input.TextArea rows={2} placeholder="Additional notes about vendor" />
          </Form.Item>

          <Form.Item
            label="Active"
            name="isActive"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch />
          </Form.Item>

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
    </Card>
  );
};

export default Vendors;