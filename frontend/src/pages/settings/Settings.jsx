import React, { useState } from 'react';
import {
  Card, Tabs, Form, Input, Switch, Button, Select,
  message, Space, Divider, InputNumber, Upload,
  Row, Col, Typography, Alert, Descriptions, Tag
} from 'antd';
import {
  SettingOutlined,
  DatabaseOutlined,
  BellOutlined,
  SecurityScanOutlined,
  UploadOutlined,
  SaveOutlined,
  ReloadOutlined,
  EditOutlined,
  CloseOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';

const { Title, Text } = Typography;
const { TextArea } = Input;

const Settings = () => {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const { data: settings, isLoading } = useQuery('settings', async () => {
    try {
      const response = await axios.get('/settings');
      return response.data.data;
    } catch (error) {
      return {
        general: {
          companyName: 'IMS System',
          companyAddress: '',
          companyPhone: '',
          companyEmail: '',
          language: 'en'
        },
        inventory: {
          lowStockThreshold: 10,
          enableBarcodeScanning: true,
          requireSerialNumbers: true,
          autoGenerateSerialNumbers: false
        },
        finance: {
          defaultPaymentTerms: 30,
          enableInstallments: true,
          taxRate: 0,
          invoicePrefix: 'INV',
          invoiceStartNumber: 1000
        },
        notifications: {
          lowStockAlerts: true,
          paymentReminders: true,
          systemUpdates: true,
          emailNotifications: true
        },
        backup: {
          autoBackup: true,
          backupFrequency: 'daily',
          retentionDays: 30
        }
      };
    }
  });

  const updateSettingsMutation = useMutation(
    (data) => axios.put('/settings', data),
    {
      onSuccess: () => {
        message.success('Settings updated successfully');
        queryClient.invalidateQueries('settings');
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Failed to update settings');
      }
    }
  );

  const handleSave = async (values) => {
    setLoading(true);
    try {
      await updateSettingsMutation.mutateAsync(values);
      setIsEditMode(false);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setIsEditMode(true);
    form.setFieldsValue(settings);
  };

  const handleCancel = () => {
    setIsEditMode(false);
    form.setFieldsValue(settings);
    message.info('Changes cancelled');
  };

  const handleExportSettings = async () => {
    try {
      const response = await axios.get('/settings/export', {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `settings-${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success('Settings exported successfully');
    } catch (error) {
      message.error('Failed to export settings');
    }
  };

  const getLanguageLabel = (lang) => {
    const languages = {
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      de: 'German'
    };
    return languages[lang] || lang;
  };

  const items = [
    {
      key: 'general',
      label: (
        <span>
          <SettingOutlined />
          General
        </span>
      ),
      children: isEditMode ? (
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item
              label="Company Name"
              name={['general', 'companyName']}
              rules={[{ required: true, message: 'Company name is required' }]}
            >
              <Input placeholder="Enter company name" />
            </Form.Item>

            <Form.Item
              label="Company Address"
              name={['general', 'companyAddress']}
            >
              <TextArea rows={3} placeholder="Enter company address" />
            </Form.Item>

            <Form.Item
              label="Company Phone"
              name={['general', 'companyPhone']}
            >
              <Input placeholder="Enter phone number" />
            </Form.Item>

            <Form.Item
              label="Company Email"
              name={['general', 'companyEmail']}
              rules={[{ type: 'email', message: 'Invalid email address' }]}
            >
              <Input placeholder="Enter email address" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Alert
              message="System Configuration"
              description="This system is configured for Pakistan operations with PKR currency and Asia/Karachi timezone. These settings cannot be changed."
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Form.Item
              label="Language"
              name={['general', 'language']}
            >
              <Select placeholder="Select language">
                <Select.Option value="en">English</Select.Option>
                <Select.Option value="es">Spanish</Select.Option>
                <Select.Option value="fr">French</Select.Option>
                <Select.Option value="de">German</Select.Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
      ) : (
        <Row gutter={24}>
          <Col span={12}>
            <Descriptions column={1} bordered>
              <Descriptions.Item label="Company Name">
                <Text strong>{settings?.general?.companyName || '-'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Company Address">
                {settings?.general?.companyAddress || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Company Phone">
                {settings?.general?.companyPhone || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Company Email">
                {settings?.general?.companyEmail || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Language">
                {getLanguageLabel(settings?.general?.language)}
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Alert
              message="System Configuration"
              description="This system is configured for Pakistan operations with PKR currency and Asia/Karachi timezone. These settings cannot be changed."
              type="info"
              showIcon
            />
          </Col>
        </Row>
      )
    },
    {
      key: 'inventory',
      label: (
        <span>
          <DatabaseOutlined />
          Inventory
        </span>
      ),
      children: isEditMode ? (
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item
              label="Low Stock Threshold"
              name={['inventory', 'lowStockThreshold']}
              rules={[{ required: true, message: 'Low stock threshold is required' }]}
            >
              <InputNumber min={1} placeholder="Enter threshold quantity" style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label="Enable Barcode Scanning"
              name={['inventory', 'enableBarcodeScanning']}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label="Require Serial Numbers"
              name={['inventory', 'requireSerialNumbers']}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="Auto Generate Serial Numbers"
              name={['inventory', 'autoGenerateSerialNumbers']}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Alert
              message="Inventory Settings"
              description="These settings control how inventory items are managed and tracked in the system."
              type="info"
              showIcon
              style={{ marginTop: 16 }}
            />
          </Col>
        </Row>
      ) : (
        <Row gutter={24}>
          <Col span={12}>
            <Descriptions column={1} bordered>
              <Descriptions.Item label="Low Stock Threshold">
                <Text strong>{settings?.inventory?.lowStockThreshold}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Enable Barcode Scanning">
                <Tag color={settings?.inventory?.enableBarcodeScanning ? 'green' : 'red'}>
                  {settings?.inventory?.enableBarcodeScanning ? 'Enabled' : 'Disabled'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Require Serial Numbers">
                <Tag color={settings?.inventory?.requireSerialNumbers ? 'green' : 'red'}>
                  {settings?.inventory?.requireSerialNumbers ? 'Required' : 'Not Required'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Auto Generate Serial Numbers">
                <Tag color={settings?.inventory?.autoGenerateSerialNumbers ? 'green' : 'red'}>
                  {settings?.inventory?.autoGenerateSerialNumbers ? 'Enabled' : 'Disabled'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Alert
              message="Inventory Settings"
              description="These settings control how inventory items are managed and tracked in the system."
              type="info"
              showIcon
            />
          </Col>
        </Row>
      )
    },
    {
      key: 'finance',
      label: (
        <span>
          <SecurityScanOutlined />
          Finance
        </span>
      ),
      children: isEditMode ? (
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item
              label="Default Payment Terms (Days)"
              name={['finance', 'defaultPaymentTerms']}
              rules={[{ required: true, message: 'Payment terms is required' }]}
            >
              <InputNumber min={0} max={365} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label="Enable Installments"
              name={['finance', 'enableInstallments']}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label="Default Tax Rate (%)"
              name={['finance', 'taxRate']}
            >
              <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="Invoice Prefix"
              name={['finance', 'invoicePrefix']}
              rules={[{ required: true, message: 'Invoice prefix is required' }]}
            >
              <Input placeholder="e.g., INV" />
            </Form.Item>

            <Form.Item
              label="Invoice Start Number"
              name={['finance', 'invoiceStartNumber']}
              rules={[{ required: true, message: 'Invoice start number is required' }]}
            >
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>

            <Alert
              message="Finance Settings"
              description="Configure default financial settings for invoicing and payment processing."
              type="info"
              showIcon
              style={{ marginTop: 16 }}
            />
          </Col>
        </Row>
      ) : (
        <Row gutter={24}>
          <Col span={12}>
            <Descriptions column={1} bordered>
              <Descriptions.Item label="Default Payment Terms">
                <Text strong>{settings?.finance?.defaultPaymentTerms} Days</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Enable Installments">
                <Tag color={settings?.finance?.enableInstallments ? 'green' : 'red'}>
                  {settings?.finance?.enableInstallments ? 'Enabled' : 'Disabled'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Default Tax Rate">
                <Text strong>{settings?.finance?.taxRate}%</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Invoice Prefix">
                <Text strong>{settings?.finance?.invoicePrefix}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Invoice Start Number">
                <Text strong>{settings?.finance?.invoiceStartNumber}</Text>
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Alert
              message="Finance Settings"
              description="Configure default financial settings for invoicing and payment processing."
              type="info"
              showIcon
            />
          </Col>
        </Row>
      )
    },
    {
      key: 'notifications',
      label: (
        <span>
          <BellOutlined />
          Notifications
        </span>
      ),
      children: isEditMode ? (
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item
              label="Low Stock Alerts"
              name={['notifications', 'lowStockAlerts']}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label="Payment Reminders"
              name={['notifications', 'paymentReminders']}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="System Updates"
              name={['notifications', 'systemUpdates']}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label="Email Notifications"
              name={['notifications', 'emailNotifications']}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      ) : (
        <Row gutter={24}>
          <Col span={24}>
            <Descriptions column={2} bordered>
              <Descriptions.Item label="Low Stock Alerts">
                <Tag color={settings?.notifications?.lowStockAlerts ? 'green' : 'red'}>
                  {settings?.notifications?.lowStockAlerts ? 'Enabled' : 'Disabled'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Payment Reminders">
                <Tag color={settings?.notifications?.paymentReminders ? 'green' : 'red'}>
                  {settings?.notifications?.paymentReminders ? 'Enabled' : 'Disabled'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="System Updates">
                <Tag color={settings?.notifications?.systemUpdates ? 'green' : 'red'}>
                  {settings?.notifications?.systemUpdates ? 'Enabled' : 'Disabled'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Email Notifications">
                <Tag color={settings?.notifications?.emailNotifications ? 'green' : 'red'}>
                  {settings?.notifications?.emailNotifications ? 'Enabled' : 'Disabled'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      )
    },
    {
      key: 'backup',
      label: (
        <span>
          <UploadOutlined />
          Backup
        </span>
      ),
      children: isEditMode ? (
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item
              label="Auto Backup"
              name={['backup', 'autoBackup']}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label="Backup Frequency"
              name={['backup', 'backupFrequency']}
            >
              <Select placeholder="Select frequency">
                <Select.Option value="daily">Daily</Select.Option>
                <Select.Option value="weekly">Weekly</Select.Option>
                <Select.Option value="monthly">Monthly</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              label="Retention Period (Days)"
              name={['backup', 'retentionDays']}
            >
              <InputNumber min={1} max={365} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                type="default"
                icon={<UploadOutlined />}
                onClick={handleExportSettings}
              >
                Export Settings
              </Button>

              <Upload
                accept=".json"
                showUploadList={false}
                beforeUpload={(file) => {
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    try {
                      const importedSettings = JSON.parse(e.target.result);
                      form.setFieldsValue(importedSettings);
                      message.success('Settings imported successfully');
                    } catch (error) {
                      message.error('Invalid settings file');
                    }
                  };
                  reader.readAsText(file);
                  return false;
                }}
              >
                <Button icon={<UploadOutlined />}>
                  Import Settings
                </Button>
              </Upload>

              <Alert
                message="Backup & Restore"
                description="Configure automatic backups and manage settings import/export."
                type="warning"
                showIcon
              />
            </Space>
          </Col>
        </Row>
      ) : (
        <Row gutter={24}>
          <Col span={12}>
            <Descriptions column={1} bordered>
              <Descriptions.Item label="Auto Backup">
                <Tag color={settings?.backup?.autoBackup ? 'green' : 'red'}>
                  {settings?.backup?.autoBackup ? 'Enabled' : 'Disabled'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Backup Frequency">
                <Text strong>{settings?.backup?.backupFrequency?.charAt(0).toUpperCase() + settings?.backup?.backupFrequency?.slice(1)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Retention Period">
                <Text strong>{settings?.backup?.retentionDays} Days</Text>
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                type="default"
                icon={<UploadOutlined />}
                onClick={handleExportSettings}
              >
                Export Settings
              </Button>

              <Alert
                message="Backup & Restore"
                description="Configure automatic backups and manage settings import/export."
                type="warning"
                showIcon
              />
            </Space>
          </Col>
        </Row>
      )
    }
  ];

  if (isLoading) {
    return <Card loading />;
  }

  return (
    <Card
      title={
        <Space>
          <SettingOutlined />
          System Settings
          {!isEditMode && <Tag color="blue">View Mode</Tag>}
          {isEditMode && <Tag color="orange">Edit Mode</Tag>}
        </Space>
      }
      extra={
        <Space>
          {isEditMode ? (
            <>
              <Button
                icon={<CloseOutlined />}
                onClick={handleCancel}
              >
                Cancel
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={loading}
                onClick={() => form.submit()}
              >
                Save Settings
              </Button>
            </>
          ) : (
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={handleEdit}
            >
              Edit Settings
            </Button>
          )}
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={settings}
        onFinish={handleSave}
      >
        <Tabs
          defaultActiveKey="general"
          items={items}
          style={{ minHeight: 400 }}
        />
      </Form>
    </Card>
  );
};

export default Settings;