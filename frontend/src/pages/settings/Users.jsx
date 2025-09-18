// ========== src/pages/settings/Users.jsx ==========
import React, { useState } from 'react';
import { 
  Card, Table, Button, Modal, Form, Input, Select, 
  Switch, message, Space, Tag, Badge 
} from 'antd';
import { 
  PlusOutlined, EditOutlined, DeleteOutlined, 
  KeyOutlined, UserOutlined 
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';

const Users = () => {
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [resetPasswordModal, setResetPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();

  const { data: users, isLoading } = useQuery('users', async () => {
    const response = await axios.get('/users');
    return response.data.data;
  });

  const { data: roles } = useQuery('roles', async () => {
    // Hardcoded roles as per system design
    return [
      { id: '1', name: 'Inventory Operator' },
      { id: '2', name: 'Financial + Inventory Operator' }
    ];
  });

  const userMutation = useMutation(
    (data) => {
      if (editingUser) {
        return axios.put(`/users/${editingUser.id}`, data);
      }
      return axios.post('/users', data);
    },
    {
      onSuccess: () => {
        message.success(`User ${editingUser ? 'updated' : 'created'} successfully`);
        queryClient.invalidateQueries('users');
        handleCloseModal();
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Operation failed');
      }
    }
  );

  const resetPasswordMutation = useMutation(
    ({ userId, newPassword }) => 
      axios.post(`/users/${userId}/reset-password`, { newPassword }),
    {
      onSuccess: () => {
        message.success('Password reset successfully');
        setResetPasswordModal(false);
        passwordForm.resetFields();
      }
    }
  );

  const deleteMutation = useMutation(
    (id) => axios.delete(`/users/${id}`),
    {
      onSuccess: () => {
        message.success('User deleted successfully');
        queryClient.invalidateQueries('users');
      }
    }
  );

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingUser(null);
    form.resetFields();
  };

  const columns = [
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
      render: (text) => (
        <Space>
          <UserOutlined />
          {text}
        </Space>
      )
    },
    {
      title: 'Full Name',
      dataIndex: 'fullName',
      key: 'fullName'
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email'
    },
    {
      title: 'Role',
      dataIndex: ['role', 'name'],
      key: 'role',
      render: (role) => (
        <Tag color={role === 'Financial + Inventory Operator' ? 'gold' : 'blue'}>
          {role}
        </Tag>
      )
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (active) => (
        <Badge status={active ? 'success' : 'error'} text={active ? 'Active' : 'Inactive'} />
      )
    },
    {
      title: 'Last Login',
      dataIndex: 'lastLogin',
      key: 'lastLogin',
      render: (date) => date ? new Date(date).toLocaleString() : 'Never'
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button 
            icon={<EditOutlined />} 
            onClick={() => {
              setEditingUser(record);
              form.setFieldsValue({
                ...record,
                roleId: record.role.id
              });
              setModalVisible(true);
            }}
          />
          <Button 
            icon={<KeyOutlined />}
            onClick={() => {
              setSelectedUser(record);
              setResetPasswordModal(true);
            }}
          />
          <Button 
            icon={<DeleteOutlined />} 
            danger
            onClick={() => {
              Modal.confirm({
                title: 'Delete User',
                content: 'Are you sure you want to delete this user?',
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
        title="User Management"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setModalVisible(true)}
          >
            Add User
          </Button>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={users}
          loading={isLoading}
        />
      </Card>

      {/* Add/Edit User Modal */}
      <Modal
        title={editingUser ? 'Edit User' : 'Add User'}
        open={modalVisible}
        onCancel={handleCloseModal}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => userMutation.mutate(values)}
        >
          <Form.Item
            label="Username"
            name="username"
            rules={[{ required: true, message: 'Username is required' }]}
          >
            <Input placeholder="Username" disabled={!!editingUser} />
          </Form.Item>

          <Form.Item
            label="Full Name"
            name="fullName"
            rules={[{ required: true, message: 'Full name is required' }]}
          >
            <Input placeholder="Full Name" />
          </Form.Item>

          <Form.Item
            label="Email"
            name="email"
            rules={[{ type: 'email', message: 'Invalid email' }]}
          >
            <Input placeholder="email@example.com" />
          </Form.Item>

          <Form.Item label="Phone" name="phone">
            <Input placeholder="Phone number" />
          </Form.Item>

          {!editingUser && (
            <Form.Item
              label="Password"
              name="password"
              rules={[
                { required: true, message: 'Password is required' },
                { min: 6, message: 'Password must be at least 6 characters' }
              ]}
            >
              <Input.Password placeholder="Password" />
            </Form.Item>
          )}

          <Form.Item
            label="Role"
            name="roleId"
            rules={[{ required: true, message: 'Role is required' }]}
          >
            <Select placeholder="Select role">
              {roles?.map(role => (
                <Select.Option key={role.id} value={role.id}>
                  {role.name}
                </Select.Option>
              ))}
            </Select>
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
              <Button type="primary" htmlType="submit" loading={userMutation.isLoading}>
                {editingUser ? 'Update' : 'Create'}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        title={`Reset Password - ${selectedUser?.fullName}`}
        open={resetPasswordModal}
        onCancel={() => {
          setResetPasswordModal(false);
          passwordForm.resetFields();
        }}
        footer={null}
      >
        <Form
          form={passwordForm}
          layout="vertical"
          onFinish={(values) => resetPasswordMutation.mutate({
            userId: selectedUser.id,
            newPassword: values.newPassword
          })}
        >
          <Form.Item
            label="New Password"
            name="newPassword"
            rules={[
              { required: true, message: 'Password is required' },
              { min: 6, message: 'Password must be at least 6 characters' }
            ]}
          >
            <Input.Password placeholder="New password" />
          </Form.Item>

          <Form.Item
            label="Confirm Password"
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Please confirm password' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject('Passwords do not match');
                }
              })
            ]}
          >
            <Input.Password placeholder="Confirm password" />
          </Form.Item>

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setResetPasswordModal(false)}>Cancel</Button>
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={resetPasswordMutation.isLoading}
              >
                Reset Password
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </>
  );
};

export default Users;