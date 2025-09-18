import React, { useState } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, Select, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

const { Option } = Select;

const Models = () => {
  const [models, setModels] = useState([
    {
      id: 1,
      name: 'iPhone 15 Pro',
      brand: 'Apple',
      category: 'Smartphones',
      description: 'Latest iPhone model with advanced features'
    },
    {
      id: 2,
      name: 'MacBook Pro M3',
      brand: 'Apple',
      category: 'Laptops',
      description: 'High-performance laptop for professionals'
    },
    {
      id: 3,
      name: 'Galaxy S24 Ultra',
      brand: 'Samsung',
      category: 'Smartphones',
      description: 'Premium Android smartphone'
    }
  ]);
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingModel, setEditingModel] = useState(null);
  const [form] = Form.useForm();

  const brands = ['Apple', 'Samsung', 'Dell', 'HP', 'Lenovo', 'Sony', 'LG', 'Other'];
  const categories = ['Smartphones', 'Laptops', 'Tablets', 'Accessories', 'Electronics', 'Other'];

  const columns = [
    {
      title: 'Model Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Brand',
      dataIndex: 'brand',
      key: 'brand',
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button 
            icon={<EditOutlined />} 
            onClick={() => handleEdit(record)}
            size="small"
          >
            Edit
          </Button>
          <Button 
            icon={<DeleteOutlined />} 
            danger 
            onClick={() => handleDelete(record.id)}
            size="small"
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  const handleAdd = () => {
    setEditingModel(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (model) => {
    setEditingModel(model);
    form.setFieldsValue(model);
    setIsModalVisible(true);
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: 'Are you sure you want to delete this model?',
      onOk: () => {
        setModels(models.filter(model => model.id !== id));
        message.success('Model deleted successfully');
      },
    });
  };

  const handleSubmit = (values) => {
    if (editingModel) {
      setModels(models.map(model => 
        model.id === editingModel.id ? { ...model, ...values } : model
      ));
      message.success('Model updated successfully');
    } else {
      const newModel = {
        id: Math.max(...models.map(m => m.id)) + 1,
        ...values
      };
      setModels([...models, newModel]);
      message.success('Model added successfully');
    }
    setIsModalVisible(false);
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card 
        title="Product Models Management" 
        extra={
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleAdd}
          >
            Add Model
          </Button>
        }
      >
        <Table 
          columns={columns} 
          dataSource={models} 
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editingModel ? 'Edit Model' : 'Add Model'}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="name"
            label="Model Name"
            rules={[{ required: true, message: 'Please enter model name' }]}
          >
            <Input placeholder="e.g., iPhone 15 Pro" />
          </Form.Item>
          
          <Form.Item
            name="brand"
            label="Brand"
            rules={[{ required: true, message: 'Please select brand' }]}
          >
            <Select placeholder="Select brand">
              {brands.map(brand => (
                <Option key={brand} value={brand}>{brand}</Option>
              ))}
            </Select>
          </Form.Item>
          
          <Form.Item
            name="category"
            label="Category"
            rules={[{ required: true, message: 'Please select category' }]}
          >
            <Select placeholder="Select category">
              {categories.map(category => (
                <Option key={category} value={category}>{category}</Option>
              ))}
            </Select>
          </Form.Item>
          
          <Form.Item
            name="description"
            label="Description"
          >
            <Input.TextArea 
              rows={3} 
              placeholder="Enter model description..."
            />
          </Form.Item>
          
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingModel ? 'Update' : 'Add'} Model
              </Button>
              <Button onClick={() => setIsModalVisible(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Models;