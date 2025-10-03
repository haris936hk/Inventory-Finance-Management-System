// ========== src/pages/settings/Profile.jsx ==========
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Form, Input, Button, Avatar, Space, App,
  Tabs, Descriptions, Tag, Divider, Row, Col
} from 'antd';
import {
  UserOutlined, MailOutlined, PhoneOutlined, LockOutlined,
  SaveOutlined, ArrowLeftOutlined, SafetyOutlined
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';
import { useMutation, useQueryClient } from 'react-query';
import axios from 'axios';

const { TabPane } = Tabs;

const ProfileContent = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { user, updateUser } = useAuthStore();
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState('details');

  // Update profile mutation
  const updateProfileMutation = useMutation(
    (values) => axios.put(`/users/${user.id}`, values),
    {
      onSuccess: (response) => {
        message.success('Profile updated successfully');
        updateUser(response.data.data);
        queryClient.invalidateQueries('currentUser');
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Failed to update profile');
      }
    }
  );

  // Change password mutation
  const changePasswordMutation = useMutation(
    (values) => axios.post('/auth/change-password', {
      oldPassword: values.currentPassword,
      newPassword: values.newPassword
    }),
    {
      onSuccess: () => {
        message.success('Password changed successfully');
        passwordForm.resetFields();
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Failed to change password');
      }
    }
  );

  const handleUpdateProfile = (values) => {
    updateProfileMutation.mutate(values);
  };

  const handleChangePassword = (values) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('New passwords do not match');
      return;
    }
    changePasswordMutation.mutate(values);
  };

  const getRoleBadgeColor = (role) => {
    const colors = {
      'Admin': 'red',
      'Manager': 'blue',
      'Staff': 'green',
      'Viewer': 'default'
    };
    return colors[role] || 'default';
  };

  return (
    <div>
      <Card>
        <Space style={{ marginBottom: 24 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
          >
            Back
          </Button>
        </Space>

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Avatar
            size={100}
            icon={<UserOutlined />}
            style={{ backgroundColor: '#1890ff', marginBottom: 16 }}
          />
          <h2 style={{ margin: 0 }}>{user?.fullName || user?.username}</h2>
          <Tag color={getRoleBadgeColor(user?.role?.name || user?.role)}>
            {user?.role?.name || user?.role}
          </Tag>
        </div>

        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab="Profile Details" key="details">
            <Card type="inner" title="Basic Information">
              <Form
                form={form}
                layout="vertical"
                initialValues={{
                  fullName: user?.fullName || '',
                  username: user?.username || '',
                  email: user?.email || '',
                  phone: user?.phone || ''
                }}
                onFinish={handleUpdateProfile}
              >
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      label="Full Name"
                      name="fullName"
                      rules={[
                        { required: true, message: 'Please enter your full name' }
                      ]}
                    >
                      <Input
                        prefix={<UserOutlined />}
                        placeholder="Enter your full name"
                        size="large"
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24} md={12}>
                    <Form.Item
                      label="Username"
                      name="username"
                      rules={[
                        { required: true, message: 'Please enter your username' }
                      ]}
                    >
                      <Input
                        prefix={<UserOutlined />}
                        placeholder="Enter username"
                        size="large"
                        disabled
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24} md={12}>
                    <Form.Item
                      label="Email"
                      name="email"
                      rules={[
                        { type: 'email', message: 'Please enter a valid email' }
                      ]}
                    >
                      <Input
                        prefix={<MailOutlined />}
                        placeholder="Enter email address"
                        size="large"
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24} md={12}>
                    <Form.Item
                      label="Phone"
                      name="phone"
                    >
                      <Input
                        prefix={<PhoneOutlined />}
                        placeholder="Enter phone number"
                        size="large"
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<SaveOutlined />}
                    size="large"
                    loading={updateProfileMutation.isLoading}
                  >
                    Save Changes
                  </Button>
                </Form.Item>
              </Form>
            </Card>

            <Card type="inner" title="Account Information" style={{ marginTop: 24 }}>
              <Descriptions bordered column={1}>
                <Descriptions.Item label="Role">
                  <Space>
                    <SafetyOutlined />
                    <Tag color={getRoleBadgeColor(user?.role?.name || user?.role)}>
                      {user?.role?.name || user?.role}
                    </Tag>
                  </Space>
                </Descriptions.Item>

                {user?.createdAt && (
                  <Descriptions.Item label="Member Since">
                    {new Date(user.createdAt).toLocaleDateString('en-PK', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </Descriptions.Item>
                )}

                {user?.updatedAt && (
                  <Descriptions.Item label="Last Updated">
                    {new Date(user.updatedAt).toLocaleString('en-PK', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </Descriptions.Item>
                )}
              </Descriptions>
            </Card>
          </TabPane>

          <TabPane tab="Change Password" key="password">
            <Card type="inner" title="Update Password">
              <Form
                form={passwordForm}
                layout="vertical"
                onFinish={handleChangePassword}
              >
                <Form.Item
                  label="Current Password"
                  name="currentPassword"
                  rules={[
                    { required: true, message: 'Please enter your current password' }
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined />}
                    placeholder="Enter current password"
                    size="large"
                  />
                </Form.Item>

                <Form.Item
                  label="New Password"
                  name="newPassword"
                  rules={[
                    { required: true, message: 'Please enter new password' },
                    { min: 6, message: 'Password must be at least 6 characters' }
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined />}
                    placeholder="Enter new password"
                    size="large"
                  />
                </Form.Item>

                <Form.Item
                  label="Confirm New Password"
                  name="confirmPassword"
                  dependencies={['newPassword']}
                  rules={[
                    { required: true, message: 'Please confirm new password' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('newPassword') === value) {
                          return Promise.resolve();
                        }
                        return Promise.reject(new Error('Passwords do not match'));
                      },
                    }),
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined />}
                    placeholder="Confirm new password"
                    size="large"
                  />
                </Form.Item>

                <Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<SaveOutlined />}
                    size="large"
                    loading={changePasswordMutation.isLoading}
                  >
                    Change Password
                  </Button>
                </Form.Item>
              </Form>
            </Card>
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

const Profile = () => {
  return (
    <App>
      <ProfileContent />
    </App>
  );
};

export default Profile;
