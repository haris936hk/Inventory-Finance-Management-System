import React, { useState } from 'react';
import { Card, Form, Input, Select, Switch, Button, Space, Divider, Row, Col, message, Upload, Avatar, Tabs } from 'antd';
import { SaveOutlined, UploadOutlined, UserOutlined, SettingOutlined, SecurityScanOutlined, BellOutlined, DatabaseOutlined } from '@ant-design/icons';

const { Option } = Select;
const { TextArea } = Input;
const { TabPane } = Tabs;

const Settings = () => {
  const [form] = Form.useForm();
  const [profileForm] = Form.useForm();
  const [securityForm] = Form.useForm();
  const [notificationForm] = Form.useForm();
  const [systemForm] = Form.useForm();
  
  const [loading, setLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');

  // Mock current settings
  const currentSettings = {
    // Company Settings
    companyName: 'FinStock Solutions',
    companyEmail: 'admin@finstock.com',
    companyPhone: '+1 (555) 123-4567',
    companyAddress: '123 Business Street, City, State 12345',
    taxId: 'TAX123456789',
    currency: 'USD',
    timezone: 'America/New_York',
    dateFormat: 'MM/DD/YYYY',
    
    // Profile Settings
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@finstock.com',
    phone: '+1 (555) 987-6543',
    role: 'Administrator',
    
    // Security Settings
    twoFactorEnabled: true,
    sessionTimeout: 30,
    passwordExpiry: 90,
    
    // Notification Settings
    emailNotifications: true,
    smsNotifications: false,
    lowStockAlerts: true,
    paymentReminders: true,
    systemUpdates: true,
    
    // System Settings
    autoBackup: true,
    backupFrequency: 'daily',
    dataRetention: 365,
    maintenanceMode: false
  };

  const currencies = [
    { value: 'USD', label: 'US Dollar ($)' },
    { value: 'EUR', label: 'Euro (€)' },
    { value: 'GBP', label: 'British Pound (£)' },
    { value: 'CAD', label: 'Canadian Dollar (C$)' },
    { value: 'AUD', label: 'Australian Dollar (A$)' },
    { value: 'JPY', label: 'Japanese Yen (¥)' }
  ];

  const timezones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Australia/Sydney'
  ];

  const dateFormats = [
    'MM/DD/YYYY',
    'DD/MM/YYYY',
    'YYYY-MM-DD',
    'DD-MM-YYYY',
    'MM-DD-YYYY'
  ];

  const handleCompanySubmit = (values) => {
    setLoading(true);
    setTimeout(() => {
      console.log('Company settings updated:', values);
      message.success('Company settings updated successfully!');
      setLoading(false);
    }, 1000);
  };

  const handleProfileSubmit = (values) => {
    setLoading(true);
    setTimeout(() => {
      console.log('Profile updated:', values);
      message.success('Profile updated successfully!');
      setLoading(false);
    }, 1000);
  };

  const handleSecuritySubmit = (values) => {
    setLoading(true);
    setTimeout(() => {
      console.log('Security settings updated:', values);
      message.success('Security settings updated successfully!');
      setLoading(false);
    }, 1000);
  };

  const handleNotificationSubmit = (values) => {
    setLoading(true);
    setTimeout(() => {
      console.log('Notification settings updated:', values);
      message.success('Notification settings updated successfully!');
      setLoading(false);
    }, 1000);
  };

  const handleSystemSubmit = (values) => {
    setLoading(true);
    setTimeout(() => {
      console.log('System settings updated:', values);
      message.success('System settings updated successfully!');
      setLoading(false);
    }, 1000);
  };

  const handleAvatarChange = (info) => {
    if (info.file.status === 'uploading') {
      setLoading(true);
      return;
    }
    if (info.file.status === 'done') {
      // Get this url from response in real world.
      setAvatarUrl(info.file.response?.url || 'https://via.placeholder.com/100');
      setLoading(false);
    }
  };

  const uploadButton = (
    <div>
      <UploadOutlined />
      <div style={{ marginTop: 8 }}>Upload</div>
    </div>
  );

  return (
    <div style={{ padding: '24px' }}>
      <Card title="Settings">
        <Tabs defaultActiveKey="company" type="card">
          <TabPane 
            tab={
              <span>
                <SettingOutlined />
                Company
              </span>
            } 
            key="company"
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleCompanySubmit}
              initialValues={currentSettings}
            >
              <Divider orientation="left">Company Information</Divider>
              
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="companyName"
                    label="Company Name"
                    rules={[{ required: true, message: 'Please enter company name' }]}
                  >
                    <Input placeholder="Enter company name" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="companyEmail"
                    label="Company Email"
                    rules={[
                      { required: true, message: 'Please enter company email' },
                      { type: 'email', message: 'Please enter a valid email' }
                    ]}
                  >
                    <Input placeholder="company@example.com" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="companyPhone"
                    label="Company Phone"
                  >
                    <Input placeholder="+1 (555) 123-4567" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="taxId"
                    label="Tax ID"
                  >
                    <Input placeholder="TAX123456789" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="companyAddress"
                label="Company Address"
              >
                <TextArea rows={3} placeholder="Enter company address" />
              </Form.Item>

              <Divider orientation="left">Regional Settings</Divider>
              
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item
                    name="currency"
                    label="Default Currency"
                    rules={[{ required: true, message: 'Please select currency' }]}
                  >
                    <Select placeholder="Select currency">
                      {currencies.map(currency => (
                        <Option key={currency.value} value={currency.value}>
                          {currency.label}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="timezone"
                    label="Timezone"
                    rules={[{ required: true, message: 'Please select timezone' }]}
                  >
                    <Select placeholder="Select timezone">
                      {timezones.map(tz => (
                        <Option key={tz} value={tz}>{tz}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="dateFormat"
                    label="Date Format"
                    rules={[{ required: true, message: 'Please select date format' }]}
                  >
                    <Select placeholder="Select date format">
                      {dateFormats.map(format => (
                        <Option key={format} value={format}>{format}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
                  Save Company Settings
                </Button>
              </Form.Item>
            </Form>
          </TabPane>

          <TabPane 
            tab={
              <span>
                <UserOutlined />
                Profile
              </span>
            } 
            key="profile"
          >
            <Form
              form={profileForm}
              layout="vertical"
              onFinish={handleProfileSubmit}
              initialValues={currentSettings}
            >
              <Row gutter={16}>
                <Col span={6}>
                  <Form.Item label="Profile Picture">
                    <Upload
                      name="avatar"
                      listType="picture-card"
                      className="avatar-uploader"
                      showUploadList={false}
                      action="/api/upload"
                      onChange={handleAvatarChange}
                    >
                      {avatarUrl ? (
                        <Avatar size={100} src={avatarUrl} />
                      ) : (
                        <Avatar size={100} icon={<UserOutlined />} />
                      )}
                    </Upload>
                  </Form.Item>
                </Col>
                <Col span={18}>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="firstName"
                        label="First Name"
                        rules={[{ required: true, message: 'Please enter first name' }]}
                      >
                        <Input placeholder="First name" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="lastName"
                        label="Last Name"
                        rules={[{ required: true, message: 'Please enter last name' }]}
                      >
                        <Input placeholder="Last name" />
                      </Form.Item>
                    </Col>
                  </Row>
                  
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="email"
                        label="Email"
                        rules={[
                          { required: true, message: 'Please enter email' },
                          { type: 'email', message: 'Please enter a valid email' }
                        ]}
                      >
                        <Input placeholder="email@example.com" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="phone"
                        label="Phone"
                      >
                        <Input placeholder="+1 (555) 123-4567" />
                      </Form.Item>
                    </Col>
                  </Row>
                  
                  <Form.Item
                    name="role"
                    label="Role"
                  >
                    <Input disabled />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
                  Update Profile
                </Button>
              </Form.Item>
            </Form>
          </TabPane>

          <TabPane 
            tab={
              <span>
                <SecurityScanOutlined />
                Security
              </span>
            } 
            key="security"
          >
            <Form
              form={securityForm}
              layout="vertical"
              onFinish={handleSecuritySubmit}
              initialValues={currentSettings}
            >
              <Divider orientation="left">Authentication</Divider>
              
              <Form.Item
                name="twoFactorEnabled"
                label="Two-Factor Authentication"
                valuePropName="checked"
              >
                <Switch checkedChildren="Enabled" unCheckedChildren="Disabled" />
              </Form.Item>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="sessionTimeout"
                    label="Session Timeout (minutes)"
                  >
                    <Select>
                      <Option value={15}>15 minutes</Option>
                      <Option value={30}>30 minutes</Option>
                      <Option value={60}>1 hour</Option>
                      <Option value={120}>2 hours</Option>
                      <Option value={480}>8 hours</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="passwordExpiry"
                    label="Password Expiry (days)"
                  >
                    <Select>
                      <Option value={30}>30 days</Option>
                      <Option value={60}>60 days</Option>
                      <Option value={90}>90 days</Option>
                      <Option value={180}>180 days</Option>
                      <Option value={365}>1 year</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
                  Update Security Settings
                </Button>
              </Form.Item>
            </Form>
          </TabPane>

          <TabPane 
            tab={
              <span>
                <BellOutlined />
                Notifications
              </span>
            } 
            key="notifications"
          >
            <Form
              form={notificationForm}
              layout="vertical"
              onFinish={handleNotificationSubmit}
              initialValues={currentSettings}
            >
              <Divider orientation="left">General Notifications</Divider>
              
              <Space direction="vertical" style={{ width: '100%' }}>
                <Form.Item
                  name="emailNotifications"
                  label="Email Notifications"
                  valuePropName="checked"
                >
                  <Switch checkedChildren="On" unCheckedChildren="Off" />
                </Form.Item>

                <Form.Item
                  name="smsNotifications"
                  label="SMS Notifications"
                  valuePropName="checked"
                >
                  <Switch checkedChildren="On" unCheckedChildren="Off" />
                </Form.Item>
              </Space>

              <Divider orientation="left">Alert Types</Divider>
              
              <Space direction="vertical" style={{ width: '100%' }}>
                <Form.Item
                  name="lowStockAlerts"
                  label="Low Stock Alerts"
                  valuePropName="checked"
                >
                  <Switch checkedChildren="On" unCheckedChildren="Off" />
                </Form.Item>

                <Form.Item
                  name="paymentReminders"
                  label="Payment Reminders"
                  valuePropName="checked"
                >
                  <Switch checkedChildren="On" unCheckedChildren="Off" />
                </Form.Item>

                <Form.Item
                  name="systemUpdates"
                  label="System Updates"
                  valuePropName="checked"
                >
                  <Switch checkedChildren="On" unCheckedChildren="Off" />
                </Form.Item>
              </Space>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
                  Update Notification Settings
                </Button>
              </Form.Item>
            </Form>
          </TabPane>

          <TabPane 
            tab={
              <span>
                <DatabaseOutlined />
                System
              </span>
            } 
            key="system"
          >
            <Form
              form={systemForm}
              layout="vertical"
              onFinish={handleSystemSubmit}
              initialValues={currentSettings}
            >
              <Divider orientation="left">Backup Settings</Divider>
              
              <Form.Item
                name="autoBackup"
                label="Automatic Backup"
                valuePropName="checked"
              >
                <Switch checkedChildren="Enabled" unCheckedChildren="Disabled" />
              </Form.Item>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="backupFrequency"
                    label="Backup Frequency"
                  >
                    <Select>
                      <Option value="hourly">Hourly</Option>
                      <Option value="daily">Daily</Option>
                      <Option value="weekly">Weekly</Option>
                      <Option value="monthly">Monthly</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="dataRetention"
                    label="Data Retention (days)"
                  >
                    <Select>
                      <Option value={30}>30 days</Option>
                      <Option value={90}>90 days</Option>
                      <Option value={180}>180 days</Option>
                      <Option value={365}>1 year</Option>
                      <Option value={1095}>3 years</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Divider orientation="left">System Control</Divider>
              
              <Form.Item
                name="maintenanceMode"
                label="Maintenance Mode"
                valuePropName="checked"
              >
                <Switch checkedChildren="On" unCheckedChildren="Off" />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
                    Update System Settings
                  </Button>
                  <Button type="default">
                    Export Settings
                  </Button>
                  <Button type="default">
                    Import Settings
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default Settings;