// ========== src/pages/inventory/Companies.jsx ==========
import React, { useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Switch, message, Space, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';

const Companies = () => {
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [form] = Form.useForm();

  const { data: companies, isLoading, error } = useQuery('companies', async () => {
    const response = await axios.get('/inventory/companies');
    return response.data.data;
  }, {
    onError: (error) => {
      console.error('Failed to load companies:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load companies';
      message.error(errorMessage);
    }
  });

  const companyMutation = useMutation(
    (data) => {
      if (editingCompany) {
        return axios.put(`/inventory/companies/${editingCompany.id}`, data);
      }
      return axios.post('/inventory/companies', data);
    },
    {
      onSuccess: () => {
        message.success(`Company ${editingCompany ? 'updated' : 'created'} successfully`);
        queryClient.invalidateQueries('companies');
        handleCloseModal();
      },
      onError: (error) => {
        console.error('Company operation failed:', error);
        const errorMessage = error.response?.data?.message || error.message || 'An error occurred';
        message.error(errorMessage);
      }
    }
  );

  const deleteMutation = useMutation(
    (id) => axios.delete(`/inventory/companies/${id}`),
    {
      onSuccess: () => {
        message.success('Company deleted successfully');
        queryClient.invalidateQueries('companies');
      },
      onError: (error) => {
        console.error('Delete failed:', error);
        const errorMessage = error.response?.data?.message || error.message || 'Failed to delete company';
        message.error(errorMessage);
      }
    }
  );

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingCompany(null);
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
      key: 'description',
      render: (description) => description ? description : '-'
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
              setEditingCompany(record);
              form.setFieldsValue(record);
              setModalVisible(true);
            }}
          />
          <Button
            icon={<DeleteOutlined />}
            danger
            onClick={() => {
              Modal.confirm({
                title: 'Delete Company',
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
      title="Companies"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalVisible(true)}
        >
          Add Company
        </Button>
      }
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={companies}
        loading={isLoading}
      />

      <Modal
        title={editingCompany ? 'Edit Company' : 'Add Company'}
        open={modalVisible}
        onCancel={handleCloseModal}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => companyMutation.mutate(values)}
        >
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="e.g., Samsung" />
          </Form.Item>

          <Form.Item
            label="Code"
            name="code"
            rules={[{ required: true, message: 'Code is required' }]}
          >
            <Input placeholder="e.g., SAM" maxLength={5} />
          </Form.Item>

          <Form.Item
            label="Description"
            name="description"
          >
            <Input.TextArea
              placeholder="Brief description of the company"
              rows={3}
              maxLength={500}
            />
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
              <Button type="primary" htmlType="submit" loading={companyMutation.isLoading}>
                {editingCompany ? 'Update' : 'Create'}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </Card>
  );
};

export default Companies;