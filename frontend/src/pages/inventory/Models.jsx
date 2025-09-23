// ========== src/pages/inventory/Models.jsx ==========
import React, { useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Switch, message, Space, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';

const Models = () => {
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingModel, setEditingModel] = useState(null);
  const [form] = Form.useForm();

  const { data: models, isLoading, error } = useQuery('models', async () => {
    const response = await axios.get('/inventory/models');
    return response.data.data;
  }, {
    onError: (error) => {
      console.error('Failed to load models:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load models';
      message.error(errorMessage);
    }
  });

  const { data: categories } = useQuery('categories', async () => {
    const response = await axios.get('/inventory/categories');
    return response.data.data;
  }, {
    onError: (error) => {
      console.error('Failed to load categories:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load categories';
      message.error(errorMessage);
    }
  });

  const { data: companies } = useQuery('companies', async () => {
    const response = await axios.get('/inventory/companies');
    return response.data.data;
  }, {
    onError: (error) => {
      console.error('Failed to load companies:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load companies';
      message.error(errorMessage);
    }
  });

  const modelMutation = useMutation(
    (data) => {
      return axios.post('/inventory/models', data);
    },
    {
      onSuccess: () => {
        message.success('Model created successfully');
        queryClient.invalidateQueries('models');
        handleCloseModal();
      },
      onError: (error) => {
        console.error('Model creation failed:', error);
        const errorMessage = error.response?.data?.message || error.message || 'An error occurred';
        message.error(errorMessage);
      }
    }
  );

  const deleteMutation = useMutation(
    (id) => axios.delete(`/inventory/models/${id}`),
    {
      onSuccess: () => {
        message.success('Model deleted successfully');
        queryClient.invalidateQueries('models');
      },
      onError: (error) => {
        console.error('Delete failed:', error);
        const errorMessage = error.response?.data?.message || error.message || 'Failed to delete model';
        message.error(errorMessage);
      }
    }
  );

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingModel(null);
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
      title: 'Company',
      dataIndex: 'company',
      key: 'company',
      render: (company) => company?.name
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      render: (category) => category?.name
    },
    {
      title: 'Items',
      dataIndex: 'items',
      key: 'items',
      render: (items) => items?.length || 0
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
            disabled
            title="Edit functionality not yet implemented"
          />
          <Button
            icon={<DeleteOutlined />}
            danger
            disabled
            title="Delete functionality not yet implemented"
          />
        </Space>
      )
    }
  ];

  return (
    <Card
      title="Product Models"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalVisible(true)}
        >
          Add Model
        </Button>
      }
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={models}
        loading={isLoading}
      />

      <Modal
        title="Add Model"
        open={modalVisible}
        onCancel={handleCloseModal}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => modelMutation.mutate(values)}
        >
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="e.g., Galaxy S24" />
          </Form.Item>

          <Form.Item
            label="Code"
            name="code"
            rules={[{ required: true, message: 'Code is required' }]}
          >
            <Input placeholder="e.g., GS24" maxLength={10} />
          </Form.Item>

          <Form.Item
            label="Company"
            name="companyId"
            rules={[{ required: true, message: 'Company is required' }]}
          >
            <Select placeholder="Select company">
              {companies?.map(company => (
                <Select.Option key={company.id} value={company.id}>
                  {company.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="Category"
            name="categoryId"
            rules={[{ required: true, message: 'Category is required' }]}
          >
            <Select placeholder="Select category">
              {categories?.map(category => (
                <Select.Option key={category.id} value={category.id}>
                  {category.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label="Description" name="description">
            <Input.TextArea rows={3} placeholder="Brief description of the model" />
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
              <Button type="primary" htmlType="submit" loading={modelMutation.isLoading}>
                Create
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </Card>
  );
};

export default Models;