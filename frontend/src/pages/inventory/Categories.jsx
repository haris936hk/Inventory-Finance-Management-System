// ========== src/pages/inventory/Categories.jsx ==========
import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, Switch, message, Space, Tag,
  Tabs, Alert, Typography, Divider, Badge
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined,
  InfoCircleOutlined, CheckCircleOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import TemplateBuilder from '../../components/TemplateBuilder';
import { validateTemplate } from '../../utils/templateValidation';

const { Title, Text } = Typography;

const Categories = () => {
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [activeTab, setActiveTab] = useState('basic');
  const [specTemplate, setSpecTemplate] = useState({});
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [form] = Form.useForm();

  const { data: categories, isLoading } = useQuery('categories', async () => {
    const response = await axios.get('/inventory/categories');
    return response.data.data;
  });

  const categoryMutation = useMutation(
    (data) => {
      // Include specTemplate in the data
      const fullData = {
        ...data,
        specTemplate: Object.keys(specTemplate).length > 0 ? specTemplate : null
      };

      if (editingCategory) {
        return axios.put(`/inventory/categories/${editingCategory.id}`, fullData);
      }
      return axios.post('/inventory/categories', fullData);
    },
    {
      onSuccess: () => {
        message.success(`Category ${editingCategory ? 'updated' : 'created'} successfully`);
        queryClient.invalidateQueries('categories');
        handleCloseModal();
      },
      onError: (error) => {
        console.error('Category operation failed:', error);
        const errorMessage = error.response?.data?.message || error.message || 'An error occurred';
        message.error(errorMessage);
      }
    }
  );

  const deleteMutation = useMutation(
    (id) => axios.delete(`/inventory/categories/${id}`),
    {
      onSuccess: () => {
        message.success('Category deleted successfully');
        queryClient.invalidateQueries('categories');
      },
      onError: (error) => {
        console.error('Delete failed:', error);
        const errorMessage = error.response?.data?.message || error.message || 'Failed to delete category';
        message.error(errorMessage);
      }
    }
  );

  // Track changes for unsaved warning
  useEffect(() => {
    const formValues = form.getFieldsValue();
    const hasFormChanges = editingCategory
      ? Object.keys(formValues).some(key => formValues[key] !== editingCategory[key])
      : Object.values(formValues).some(value => value);

    const hasTemplateChanges = editingCategory
      ? JSON.stringify(specTemplate) !== JSON.stringify(editingCategory.specTemplate || {})
      : Object.keys(specTemplate).length > 0;

    setUnsavedChanges(hasFormChanges || hasTemplateChanges);
  }, [form, editingCategory, specTemplate]);

  const handleCloseModal = () => {
    if (unsavedChanges) {
      Modal.confirm({
        title: 'Unsaved Changes',
        content: 'You have unsaved changes. Are you sure you want to close?',
        okText: 'Discard Changes',
        cancelText: 'Continue Editing',
        onOk: () => {
          setModalVisible(false);
          setEditingCategory(null);
          setSpecTemplate({});
          setActiveTab('basic');
          setUnsavedChanges(false);
          form.resetFields();
        }
      });
    } else {
      setModalVisible(false);
      setEditingCategory(null);
      setSpecTemplate({});
      setActiveTab('basic');
      setUnsavedChanges(false);
      form.resetFields();
    }
  };

  const handleEditCategory = (record) => {
    setEditingCategory(record);
    form.setFieldsValue(record);
    setSpecTemplate(record.specTemplate || {});
    setActiveTab('basic');
    setModalVisible(true);
  };

  const handleAddCategory = () => {
    setEditingCategory(null);
    form.resetFields();
    setSpecTemplate({});
    setActiveTab('basic');
    setModalVisible(true);
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
      title: 'Description',
      dataIndex: 'description',
      key: 'description'
    },
    {
      title: 'Template',
      dataIndex: 'specTemplate',
      key: 'specTemplate',
      render: (template) => {
        if (!template || Object.keys(template).length === 0) {
          return <Text type="secondary">No template</Text>;
        }

        const fieldCount = Object.keys(template).length;
        const validation = validateTemplate(template);
        const hasErrors = validation.errors.length > 0;

        return (
          <Space>
            <Badge count={fieldCount} showZero style={{ backgroundColor: hasErrors ? '#ff4d4f' : '#52c41a' }}>
              <Tag icon={<SettingOutlined />} color={hasErrors ? 'error' : 'success'}>
                {fieldCount} field{fieldCount !== 1 ? 's' : ''}
              </Tag>
            </Badge>
          </Space>
        );
      }
    },
    {
      title: 'Models',
      dataIndex: 'models',
      key: 'models',
      render: (models) => models?.length || 0
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
            onClick={() => handleEditCategory(record)}
          />
          <Button
            icon={<DeleteOutlined />}
            danger
            loading={deleteMutation.isLoading}
            onClick={() => {
              Modal.confirm({
                title: 'Delete Category',
                content: 'Are you sure? This will affect all related items.',
                onOk: () => deleteMutation.mutate(record.id)
              });
            }}
          />
        </Space>
      )
    }
  ];

  // Template validation for save validation
  const templateValidation = validateTemplate(specTemplate);
  const hasTemplateErrors = templateValidation.errors.length > 0;
  const canSave = !hasTemplateErrors;

  return (
    <Card
      title="Product Categories"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddCategory}
        >
          Add Category
        </Button>
      }
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={categories}
        loading={isLoading}
        scroll={{ x: 1000 }}
      />

      <Modal
        title={
          <Space>
            {editingCategory ? 'Edit Category' : 'Add Category'}
            {unsavedChanges && (
              <Badge dot>
                <Tag color="orange">Unsaved Changes</Tag>
              </Badge>
            )}
          </Space>
        }
        open={modalVisible}
        onCancel={handleCloseModal}
        width={1200}
        footer={null}
        destroyOnClose
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          type="card"
          items={[
            {
              key: 'basic',
              label: (
                <Space>
                  <InfoCircleOutlined />
                  Basic Information
                </Space>
              ),
              children: (
                <div style={{ padding: '16px 0' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="Category Information"
                    description="Configure the basic category details. These fields are required for category identification."
                    style={{ marginBottom: 24 }}
                  />

                  <Form
                    form={form}
                    layout="vertical"
                    onFinish={(values) => categoryMutation.mutate(values)}
                  >
                    <Form.Item
                      label="Category Name"
                      name="name"
                      rules={[{ required: true, message: 'Name is required' }]}
                    >
                      <Input
                        placeholder="e.g., Lithium Battery"
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item
                      label={
                        <Space>
                          Category Code
                          <Text type="secondary">(Used for serial number generation)</Text>
                        </Space>
                      }
                      name="code"
                      rules={[{ required: true, message: 'Code is required' }]}
                    >
                      <Input
                        placeholder="e.g., LB"
                        maxLength={5}
                        style={{ textTransform: 'uppercase' }}
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item
                      label="Description"
                      name="description"
                    >
                      <Input.TextArea
                        rows={3}
                        placeholder="Brief description of this category"
                        maxLength={500}
                        showCount
                      />
                    </Form.Item>

                    <Form.Item
                      label="Active Status"
                      name="isActive"
                      valuePropName="checked"
                      initialValue={true}
                    >
                      <Switch
                        checkedChildren="Active"
                        unCheckedChildren="Inactive"
                      />
                    </Form.Item>

                    <Divider />

                    <div style={{ textAlign: 'right' }}>
                      <Space>
                        <Button onClick={handleCloseModal}>
                          Cancel
                        </Button>
                        <Button
                          onClick={() => setActiveTab('template')}
                          disabled={!form.getFieldValue('name') || !form.getFieldValue('code')}
                        >
                          Configure Template →
                        </Button>
                        <Button
                          type="primary"
                          htmlType="submit"
                          loading={categoryMutation.isLoading}
                          disabled={!canSave}
                        >
                          {editingCategory ? 'Update Category' : 'Create Category'}
                        </Button>
                      </Space>
                    </div>
                  </Form>
                </div>
              )
            },
            {
              key: 'template',
              label: (
                <Space>
                  <SettingOutlined />
                  Specification Template
                  {Object.keys(specTemplate).length > 0 && (
                    <Badge count={Object.keys(specTemplate).length} />
                  )}
                  {hasTemplateErrors && (
                    <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                  )}
                </Space>
              ),
              children: (
                <div style={{ padding: '16px 0' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="Specification Template"
                    description={
                      <div>
                        <div>Define custom specification fields for products in this category.</div>
                        <div style={{ marginTop: 8 }}>
                          <Text type="secondary">
                            Templates are optional but highly recommended for consistent product data.
                          </Text>
                        </div>
                      </div>
                    }
                    style={{ marginBottom: 24 }}
                  />

                  {hasTemplateErrors && (
                    <Alert
                      type="error"
                      showIcon
                      message="Template Configuration Errors"
                      description="Please fix all template errors before saving the category."
                      style={{ marginBottom: 16 }}
                    />
                  )}

                  <TemplateBuilder
                    value={specTemplate}
                    onChange={setSpecTemplate}
                    showPreview={true}
                  />

                  <Divider />

                  <div style={{ textAlign: 'right' }}>
                    <Space>
                      <Button onClick={handleCloseModal}>
                        Cancel
                      </Button>
                      <Button onClick={() => setActiveTab('basic')}>
                        ← Basic Information
                      </Button>
                      <Button
                        type="primary"
                        onClick={() => {
                          const formValues = form.getFieldsValue();
                          categoryMutation.mutate(formValues);
                        }}
                        loading={categoryMutation.isLoading}
                        disabled={!canSave}
                      >
                        {editingCategory ? 'Update Category' : 'Create Category'}
                      </Button>
                    </Space>
                  </div>
                </div>
              )
            }
          ]}
        />
      </Modal>
    </Card>
  );
};

export default Categories;