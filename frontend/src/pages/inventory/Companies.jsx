import React, { useState } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

const Companies = () => {
  const [companies, setCompanies] = useState([
    {
      id: 1,
      name: 'ABC Electronics',
      contactPerson: 'John Smith',
      email: 'john@abcelectronics.com',
      phone: '+1-555-0123',
      address: '123 Business St, City, State 12345'
    },
    {
      id: 2,
      name: 'XYZ Supplies',
      contactPerson: 'Jane Doe',
      email: 'jane@xyzsupplies.com',
      phone: '+1-555-0456',
      address: '456 Commerce Ave, City, State 67890'
    }
  ]);
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [form] = Form.useForm();

  const columns = [
    {
      title: 'Company Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Contact Person',
      dataIndex: 'contactPerson',
      key: 'contactPerson',
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
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
    setEditingCompany(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (company) => {
    setEditingCompany(company);
    form.setFieldsValue(company);
    setIsModalVisible(true);
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: 'Are you sure you want to delete this company?',
      onOk: () => {
        setCompanies(companies.filter(company => company.id !== id));
        message.success('Company deleted successfully');
      },
    });
  };

  const handleSubmit = (values) => {
    if (editingCompany) {
      setCompanies(companies.map(company => 
        company.id === editingCompany.id ? { ...company, ...values } : company
      ));
      message.success('Company updated successfully');
    } else {
      const newCompany = {
        id: Math.max(...companies.map(c => c.id)) + 1,
        ...values
      };
      setCompanies([...companies, newCompany]);
      message.success('Company added successfully');
    }
    setIsModalVisible(false);
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card 
        title="Companies Management" 
        extra={
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleAdd}
          >
            Add Company
          </Button>
        }
      >
        <Table 
          columns={columns} 
          dataSource={companies} 
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editingCompany ? 'Edit Company' : 'Add Company'}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="name"
            label="Company Name"
            rules={[{ required: true, message: 'Please enter company name' }]}
          >
            <Input />
          </Form.Item>
          
          <Form.Item
            name="contactPerson"
            label="Contact Person"
            rules={[{ required: true, message: 'Please enter contact person' }]}
          >
            <Input />
          </Form.Item>
          
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Please enter email' },
              { type: 'email', message: 'Please enter valid email' }
            ]}
          >
            <Input />
          </Form.Item>
          
          <Form.Item
            name="phone"
            label="Phone"
            rules={[{ required: true, message: 'Please enter phone number' }]}
          >
            <Input />
          </Form.Item>
          
          <Form.Item
            name="address"
            label="Address"
          >
            <Input.TextArea rows={3} />
          </Form.Item>
          
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingCompany ? 'Update' : 'Add'} Company
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

export default Companies;