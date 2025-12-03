import React, { useState } from 'react';
import {
  Card, Tabs, Form, Input, Switch, Button, Select,
  message, Space, Divider, InputNumber,
  Row, Col, Typography, Alert, Descriptions, Tag
} from 'antd';
import {
  SettingOutlined,
  DatabaseOutlined,
  SecurityScanOutlined,
  SaveOutlined,
  ReloadOutlined,
  EditOutlined,
  CloseOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import { useAuthStore } from '../../stores/authStore';
import { getErrorMessage } from '../../utils/errorMessages';

const { Title, Text } = Typography;
const { TextArea } = Input;

const Settings = () => {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const { hasPermission } = useAuthStore();

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
          companyFBR: '',
          language: 'en'
        },
        finance: {
          defaultPaymentTerms: 30,
          taxRate: 0,
          openingCashBalance: 0
        },
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
        const errorMessage = getErrorMessage(error);
        message.error(errorMessage);
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

            <Form.Item
              label="FBR Registration No."
              name={['general', 'companyFBR']}
            >
              <Input placeholder="Enter FBR registration number (e.g., 2600-4136614-19)" />
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
              <Descriptions.Item label="FBR Registration No.">
                {settings?.general?.companyFBR || '-'}
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
              label="Default Tax Rate (%)"
              name={['finance', 'taxRate']}
            >
              <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label="Opening Cash Balance (PKR)"
              name={['finance', 'openingCashBalance']}
              tooltip="Set to 0 if your business started with no cash, or enter the cash you had before using this system"
              rules={[{ required: true, message: 'Opening cash balance is required' }]}
            >
              <InputNumber
                min={0}
                step={1000}
                style={{ width: '100%' }}
                formatter={value => `PKR ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={value => value.replace(/PKR\s?|(,*)/g, '')}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Alert
              message="Finance Settings"
              description="Configure default financial settings for invoicing and payment processing."
              type="info"
              showIcon
            />
            <Alert
              message="Fiscal Year Information"
              description="The fiscal year starts on July 1st every year. This is a fixed setting and cannot be changed."
              type="warning"
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
              <Descriptions.Item label="Default Tax Rate">
                <Text strong>{settings?.finance?.taxRate}%</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Opening Cash Balance">
                <Text strong>PKR {(settings?.finance?.openingCashBalance || 0).toLocaleString()}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Fiscal Year Start">
                <Text strong>July 1st (Fixed)</Text>
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
            <Alert
              message="Fiscal Year Information"
              description="The fiscal year starts on July 1st every year. This is a fixed setting and cannot be changed."
              type="warning"
              showIcon
              style={{ marginTop: 16 }}
            />
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
        hasPermission('settings.edit') && (
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
        )
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