import React, { useState } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, Select, Tag, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PhoneOutlined, MailOutlined } from '@ant-design/icons';

const { Option } = Select;

const Vendors = () => {
  const [vendors, setVendors] = useState([
    {
      id: 1,
      name: 'TechSupply Co.',
      contactPerson: 'Michael Johnson',
      email: 'michael@techsupply.com',
      phone: '+1-555-0789',
      address: '789 Tech Street, Silicon Valley, CA 94000',
      category: 'Electronics',
      status: 'Active',
      paymentTerms: 'Net 30'
    },
    {
      id: 2,
      name: 'Global Parts Ltd.',
      contactPerson: 'Sarah Wilson',
      email: 'sarah@globalparts.com',
      phone: '+1-555-0321',
      address: '321 Industrial Blvd, Detroit, MI 48000',
      category: 'Hardware',
      status: 'Active',
      paymentTerms: 'Net 15'
    },
    {
      id: 3,
      name: 'Office Supplies Inc.',
      contactPerson: 'David Brown',
      email: 'david@officesupplies.com',
      phone: '+1-555-0654',
      address: '654 Business Ave, New York, NY 10000',
      category: 'Office Supplies',
      status: 'Inactive',
      paymentTerms: 'Net 45'
    }
  ]);
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [form] = Form.useForm();

  const categories = ['Electronics', 'Hardware', 'Software', 'Office Supplies', 'Raw Materials', 'Other'];
  const paymentTermsOptions = ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'COD', 'Prepaid'];

  const columns = [
    {
      title: 'Vendor Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: 'Contact Person',
      dataIndex: 'contactPerson',
      key: 'contactPerson',
    },
    {
      title: 'Contact Info',
      key: 'contact',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <span><MailOutlined /> {record.email}</span>
          <span><PhoneOutlined /> {record.phone}</span>
        </Space>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      filters: categories.map(cat => ({ text: cat, value: cat })),
      onFilter: (value, record) => record.category === value,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'Active' ? 'green' : 'red'}>
          {status}
        </Tag>
      ),
      filters: [
        { text: 'Active', value: 'Active' },
        { text: 'Inactive', value: 'Inactive' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Payment Terms',
      dataIndex: 'paymentTerms',
      key: 'paymentTerms',
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
    setEditingVendor(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (vendor) => {
    setEditingVendor(vendor);
    form.setFieldsValue(vendor);
    setIsModalVisible(true);
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: 'Are you sure you want to delete this vendor?',
      content: 'This action cannot be undone.',
      onOk: () => {
        setVendors(vendors.filter(vendor => vendor.id !== id));
        message.success('Vendor deleted successfully');
      },
    });
  };

  const handleSubmit = (values) => {
    if (editingVendor) {
      setVendors(vendors.map(vendor => 
        vendor.id === editingVendor.id ? { ...vendor, ...values } : vendor
      ));
      message.success('Vendor updated successfully');
    } else {
      const newVendor = {
        id: Math.max(...vendors.map(v => v.id)) + 1,
        ...values
      };
      setVendors([...vendors, newVendor]);
      message.success('Vendor added successfully');
    }
    setIsModalVisible(false);
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card 
        title="Vendors Management" 
        extra={
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleAdd}
          >
            Add Vendor
          </Button>
        }
      >
        <Table 
          columns={columns} 
          dataSource={vendors} 
          rowKey="id"
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1200 }}
        />
      </Card>

      <Modal
        title={editingVendor ? 'Edit Vendor' : 'Add Vendor'}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ status: 'Active', paymentTerms: 'Net 30' }}
        >
          <Form.Item
            name="name"
            label="Vendor Name"
            rules={[{ required: true, message: 'Please enter vendor name' }]}
          >
            <Input placeholder="Enter vendor company name" />
          </Form.Item>
          
          <Form.Item
            name="contactPerson"
            label="Contact Person"
            rules={[{ required: true, message: 'Please enter contact person' }]}
          >
            <Input placeholder="Enter contact person name" />
          </Form.Item>
          
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item
              name="email"
              label="Email"
              style={{ width: '50%', marginRight: '8px' }}
              rules={[
                { required: true, message: 'Please enter email' },
                { type: 'email', message: 'Please enter valid email' }
              ]}
            >
              <Input placeholder="vendor@email.com" />
            </Form.Item>
            
            <Form.Item
              name="phone"
              label="Phone"
              style={{ width: '50%' }}
              rules={[{ required: true, message: 'Please enter phone number' }]}
            >
              <Input placeholder="+1-555-0123" />
            </Form.Item>
          </Space.Compact>
          
          <Form.Item
            name="address"
            label="Address"
            rules={[{ required: true, message: 'Please enter address' }]}
          >
            <Input.TextArea rows={2} placeholder="Enter vendor address" />
          </Form.Item>
          
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item
              name="category"
              label="Category"
              style={{ width: '33%', marginRight: '8px' }}
              rules={[{ required: true, message: 'Please select category' }]}
            >
              <Select placeholder="Select category">
                {categories.map(category => (
                  <Option key={category} value={category}>{category}</Option>
                ))}
              </Select>
            </Form.Item>
            
            <Form.Item
              name="status"
              label="Status"
              style={{ width: '33%', marginRight: '8px' }}
              rules={[{ required: true, message: 'Please select status' }]}
            >
              <Select>
                <Option value="Active">Active</Option>
                <Option value="Inactive">Inactive</Option>
              </Select>
            </Form.Item>
            
            <Form.Item
              name="paymentTerms"
              label="Payment Terms"
              style={{ width: '34%' }}
              rules={[{ required: true, message: 'Please select payment terms' }]}
            >
              <Select placeholder="Select terms">
                {paymentTermsOptions.map(term => (
                  <Option key={term} value={term}>{term}</Option>
                ))}
              </Select>
            </Form.Item>
          </Space.Compact>
          
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingVendor ? 'Update' : 'Add'} Vendor
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

export default Vendors;