// ========== src/pages/LoginPage.jsx ==========
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, Alert, Checkbox } from 'antd';
import { UserOutlined, LockOutlined, DatabaseOutlined } from '@ant-design/icons';
import { useAuthStore } from '../stores/authStore';

const { Title, Text } = Typography;

const LoginPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const login = useAuthStore((state) => state.login);

  const onFinish = async (values) => {
    setLoading(true);
    setError('');

    const result = await login(values.username, values.password);

    if (result.success) {
      navigate('/app/dashboard');
    } else {
      setError(result.error);
    }
    
    setLoading(false);
  };

  return (
    <Card
      style={{
        width: 400,
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <DatabaseOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
        <Title level={2} style={{ margin: 0 }}>Welcome Back</Title>
        <Text type="secondary">Inventory & Finance Management System</Text>
      </div>

      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 16 }}
          onClose={() => setError('')}
        />
      )}

      <Form
        name="login"
        onFinish={onFinish}
        autoComplete="off"
        layout="vertical"
        size="large"
      >
        <Form.Item
          name="username"
          rules={[{ required: true, message: 'Please enter your username!' }]}
        >
          <Input
            prefix={<UserOutlined />}
            placeholder="Username"
            autoFocus
          />
        </Form.Item>

        <Form.Item
          name="password"
          rules={[{ required: true, message: 'Please enter your password!' }]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="Password"
          />
        </Form.Item>

        <Form.Item>
          <Form.Item name="remember" valuePropName="checked" noStyle>
            <Checkbox>Remember me</Checkbox>
          </Form.Item>
        </Form.Item>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            block
            size="large"
          >
            Sign In
          </Button>
        </Form.Item>
      </Form>

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Text type="secondary">
          Default: admin / admin123
        </Text>
      </div>
    </Card>
  );
};

export default LoginPage;