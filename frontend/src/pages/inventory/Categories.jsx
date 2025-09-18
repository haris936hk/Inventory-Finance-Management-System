// ========== src/pages/inventory/Categories.jsx ==========
import React, { useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Switch, message, Space, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';

const Categories = () => {
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [form] = Form.useForm();

  const { data: categories, isLoading } = useQuery('categories', async () => {
    const response = await axios.get('/inventory/categories');
    return response.data.data;
  });

  const categoryMutation = useMutation(
    (data) => {
      if (editingCategory) {
        return axios.put(`/inventory/categories/${editingCategory.id}`, data);
      }
      return axios.post('/inventory/categories', data);
    },
    {
      onSuccess: () => {
        message.success(`Category ${editingCategory ? 'updated' : 'created'} successfully`);
        queryClient.invalidateQueries('categories');
        handleCloseModal();
      }
    }
  );

  const deleteMutation = useMutation(
    (id) => axios.delete(`/inventory/categories/${id}`),
    {
      onSuccess: () => {
        message.success('Category deleted successfully');
        queryClient.invalidateQueries('categories');
      }
    }
  );

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingCategory(null);
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
      title: 'Description',
      dataIndex: 'description',
      key: 'description'
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
            onClick={() => {
              setEditingCategory(record);
              form.setFieldsValue(record);
              setModalVisible(true);
            }}
          />
          <Button 
            icon={<DeleteOutlined />} 
            danger
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

  return (
    <Card
      title="Product Categories"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalVisible(true)}
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
      />

      <Modal
        title={editingCategory ? 'Edit Category' : 'Add Category'}
        open={modalVisible}
        onCancel={handleCloseModal}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => categoryMutation.mutate(values)}
        >
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="e.g., Lithium Battery" />
          </Form.Item>

          <Form.Item
            label="Code"
            name="code"
            rules={[{ required: true, message: 'Code is required' }]}
          >
            <Input placeholder="e.g., LB" maxLength={5} />
          </Form.Item>

          <Form.Item label="Description" name="description">
            <Input.TextArea rows={2} />
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
              <Button type="primary" htmlType="submit" loading={categoryMutation.isLoading}>
                {editingCategory ? 'Update' : 'Create'}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </Card>
  );
};

export default Categories;