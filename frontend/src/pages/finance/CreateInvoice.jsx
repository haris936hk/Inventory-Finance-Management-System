// ========== src/pages/finance/CreateInvoice.jsx ==========
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Form, Input, Select, InputNumber, DatePicker, Button,
  Row, Col, Space, Table, message, Divider, Typography, Modal,
  AutoComplete
} from 'antd';
import {
  SaveOutlined, ArrowLeftOutlined, PlusOutlined, DeleteOutlined,
  UserAddOutlined, SearchOutlined
} from '@ant-design/icons';
import { useMutation, useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const { Text } = Typography;
const { TextArea } = Input;

const CreateInvoice = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [selectedItems, setSelectedItems] = useState([]);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [customerForm] = Form.useForm();
  const [subtotal, setSubtotal] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [total, setTotal] = useState(0);

  // Fetch customers
  const { data: customers, refetch: refetchCustomers } = useQuery('customers', async () => {
    const response = await axios.get('/finance/customers');
    return response.data.data;
  });

  // Fetch available items (In Store/In Hand)
  const { data: availableItems } = useQuery('availableItems', async () => {
    const response = await axios.get('/inventory/items', {
      params: { status: 'In Store' }
    });
    const inHand = await axios.get('/inventory/items', {
      params: { status: 'In Hand' }
    });
    return [...response.data.data, ...inHand.data.data];
  });

  // Create invoice mutation
  const createInvoiceMutation = useMutation(
    (data) => axios.post('/finance/invoices', data),
    {
      onSuccess: (response) => {
        message.success('Invoice created successfully');
        navigate(`/app/finance/invoices/${response.data.data.id}`);
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Failed to create invoice');
      }
    }
  );

  // Create customer mutation
  const createCustomerMutation = useMutation(
    (data) => axios.post('/finance/customers', data),
    {
      onSuccess: (response) => {
        message.success('Customer created successfully');
        form.setFieldsValue({ customerId: response.data.data.id });
        refetchCustomers();
        setCustomerModalVisible(false);
        customerForm.resetFields();
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Failed to create customer');
      }
    }
  );

  const handleAddItem = () => {
    const newItem = {
      key: Date.now(),
      itemId: '',
      description: '',
      quantity: 1,
      unitPrice: 0,
      total: 0
    };
    setSelectedItems([...selectedItems, newItem]);
  };

  const handleRemoveItem = (key) => {
    const filtered = selectedItems.filter(item => item.key !== key);
    setSelectedItems(filtered);
    calculateTotals(filtered);
  };

  const handleItemChange = (key, field, value) => {
    const updated = selectedItems.map(item => {
      if (item.key === key) {
        const updatedItem = { ...item, [field]: value };
        
        // Auto-fill price and description when item is selected
        if (field === 'itemId') {
          const selectedItem = availableItems?.find(i => i.id === value);
          if (selectedItem) {
            updatedItem.description = `${selectedItem.category.name} - ${selectedItem.model.company.name} ${selectedItem.model.name}`;
            updatedItem.unitPrice = selectedItem.sellingPrice || selectedItem.purchasePrice || 0;
          }
        }
        
        // Calculate line total
        updatedItem.total = updatedItem.quantity * updatedItem.unitPrice;
        
        return updatedItem;
      }
      return item;
    });
    
    setSelectedItems(updated);
    calculateTotals(updated);
  };

  const calculateTotals = (items) => {
    const sub = items.reduce((sum, item) => sum + (item.total || 0), 0);
    setSubtotal(sub);
    
    const discountType = form.getFieldValue('discountType');
    const discountValue = form.getFieldValue('discountValue') || 0;
    
    let discount = 0;
    if (discountType === 'Percentage') {
      discount = (sub * discountValue) / 100;
    } else if (discountType === 'Fixed') {
      discount = discountValue;
    }
    setDiscountAmount(discount);
    
    const taxableAmount = sub - discount;
    const taxRate = form.getFieldValue('taxRate') || 0;
    const tax = (taxableAmount * taxRate) / 100;
    setTaxAmount(tax);
    
    setTotal(taxableAmount + tax);
  };

  const columns = [
    {
      title: 'Item',
      dataIndex: 'itemId',
      key: 'itemId',
      width: '30%',
      render: (value, record) => (
        <Select
          value={value}
          onChange={(val) => handleItemChange(record.key, 'itemId', val)}
          placeholder="Select item"
          showSearch
          optionFilterProp="children"
          style={{ width: '100%' }}
        >
          {availableItems?.map(item => (
            <Select.Option key={item.id} value={item.id}>
              {item.serialNumber} - {item.model.name}
            </Select.Option>
          ))}
        </Select>
      )
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: '25%',
      render: (value, record) => (
        <Input
          value={value}
          onChange={(e) => handleItemChange(record.key, 'description', e.target.value)}
          placeholder="Item description"
        />
      )
    },
    {
      title: 'Qty',
      dataIndex: 'quantity',
      key: 'quantity',
      width: '10%',
      render: (value, record) => (
        <InputNumber
          value={value}
          onChange={(val) => handleItemChange(record.key, 'quantity', val)}
          min={1}
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: 'Unit Price',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: '15%',
      render: (value, record) => (
        <InputNumber
          value={value}
          onChange={(val) => handleItemChange(record.key, 'unitPrice', val)}
          min={0}
          prefix="PKR"
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      width: '15%',
      render: (value) => `PKR ${value || 0}`
    },
    {
      title: '',
      key: 'action',
      width: '5%',
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleRemoveItem(record.key)}
        />
      )
    }
  ];

  const onFinish = (values) => {
    if (selectedItems.length === 0) {
      message.error('Please add at least one item');
      return;
    }

    const invalidItems = selectedItems.filter(item => !item.itemId);
    if (invalidItems.length > 0) {
      message.error('Please select items for all rows');
      return;
    }

    const invoiceData = {
      ...values,
      invoiceDate: values.invoiceDate.toISOString(),
      dueDate: values.dueDate.toISOString(),
      subtotal,
      taxAmount,
      total,
      items: selectedItems.map(item => ({
        itemId: item.itemId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice
      }))
    };

    createInvoiceMutation.mutate(invoiceData);
  };

  return (
    <>
      <Card
        title="Create Invoice"
        extra={
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/app/finance/invoices')}
          >
            Back to List
          </Button>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            invoiceDate: dayjs(),
            dueDate: dayjs().add(30, 'days'),
            taxRate: 0,
            discountValue: 0
          }}
        >
          <Row gutter={[16, 16]}>
            {/* Customer Section */}
            <Col xs={24} lg={12}>
              <Card size="small" title="Customer Information">
                <Form.Item
                  label="Customer"
                  name="customerId"
                  rules={[{ required: true, message: 'Customer is required' }]}
                >
                  <Select
                    placeholder="Select customer"
                    showSearch
                    optionFilterProp="children"
                    dropdownRender={(menu) => (
                      <>
                        {menu}
                        <Divider style={{ margin: '8px 0' }} />
                        <Button
                          type="text"
                          icon={<UserAddOutlined />}
                          onClick={() => setCustomerModalVisible(true)}
                          style={{ width: '100%' }}
                        >
                          Add New Customer
                        </Button>
                      </>
                    )}
                  >
                    {customers?.map(customer => (
                      <Select.Option key={customer.id} value={customer.id}>
                        {customer.name} - {customer.phone}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Card>
            </Col>

            {/* Invoice Details */}
            <Col xs={24} lg={12}>
              <Card size="small" title="Invoice Details">
                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      label="Invoice Date"
                      name="invoiceDate"
                      rules={[{ required: true }]}
                    >
                      <DatePicker style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      label="Due Date"
                      name="dueDate"
                      rules={[{ required: true }]}
                    >
                      <DatePicker style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>

          {/* Items Section */}
          <Card
            title="Items"
            style={{ marginTop: 16 }}
            extra={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddItem}
              >
                Add Item
              </Button>
            }
          >
            <Table
              dataSource={selectedItems}
              columns={columns}
              pagination={false}
              rowKey="key"
              locale={{ emptyText: 'No items added. Click "Add Item" to start.' }}
            />

            <Row gutter={16} style={{ marginTop: 24 }}>
              <Col xs={24} lg={12}>
                <Card size="small" title="Additional Information">
                  <Form.Item label="Terms & Conditions" name="terms">
                    <TextArea rows={3} placeholder="Enter terms and conditions" />
                  </Form.Item>
                  <Form.Item label="Notes" name="notes">
                    <TextArea rows={3} placeholder="Additional notes" />
                  </Form.Item>
                </Card>
              </Col>

              <Col xs={24} lg={12}>
                <Card size="small" title="Totals">
                  <div style={{ marginBottom: 16 }}>
                    <Text>Subtotal: </Text>
                    <Text strong style={{ float: 'right' }}>PKR {subtotal}</Text>
                  </div>

                  <Row gutter={8} style={{ marginBottom: 16 }}>
                    <Col span={8}>
                      <Form.Item name="discountType" noStyle>
                        <Select placeholder="Discount">
                          <Select.Option value="Percentage">%</Select.Option>
                          <Select.Option value="Fixed">Fixed</Select.Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="discountValue" noStyle>
                        <InputNumber
                          style={{ width: '100%' }}
                          min={0}
                          onChange={() => {
                            setTimeout(() => calculateTotals(selectedItems), 0);
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Text strong style={{ float: 'right' }}>- PKR {discountAmount}</Text>
                    </Col>
                  </Row>

                  <Row gutter={8} style={{ marginBottom: 16 }}>
                    <Col span={16}>
                      <Form.Item label="Tax Rate (%)" name="taxRate" labelCol={{ span: 12 }}>
                        <InputNumber
                          style={{ width: '100%' }}
                          min={0}
                          max={100}
                          onChange={() => {
                            setTimeout(() => calculateTotals(selectedItems), 0);
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Text strong style={{ float: 'right' }}>PKR {taxAmount}</Text>
                    </Col>
                  </Row>

                  <Divider />

                  <div>
                    <Text strong style={{ fontSize: 18 }}>Total: </Text>
                    <Text strong style={{ float: 'right', fontSize: 18, color: '#1890ff' }}>
                      PKR {total}
                    </Text>
                  </div>
                </Card>
              </Col>
            </Row>
          </Card>

          <div style={{ marginTop: 24, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => navigate('/app/finance/invoices')}>
                Cancel
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                htmlType="submit"
                loading={createInvoiceMutation.isLoading}
              >
                Create Invoice
              </Button>
            </Space>
          </div>
        </Form>
      </Card>

      {/* Add Customer Modal */}
      <Modal
        title="Add New Customer"
        open={customerModalVisible}
        onCancel={() => setCustomerModalVisible(false)}
        footer={null}
      >
        <Form
          form={customerForm}
          layout="vertical"
          onFinish={(values) => createCustomerMutation.mutate(values)}
        >
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="Customer name" />
          </Form.Item>

          <Form.Item
            label="Phone"
            name="phone"
            rules={[
              { required: true, message: 'Phone is required' },
              { pattern: /^\d{11}$/, message: 'Phone must be 11 digits' }
            ]}
          >
            <Input placeholder="03001234567" />
          </Form.Item>

          <Form.Item label="Company" name="company">
            <Input placeholder="Company name (optional)" />
          </Form.Item>

          <Form.Item label="Email" name="email">
            <Input type="email" placeholder="email@example.com" />
          </Form.Item>

          <Form.Item label="NIC" name="nic">
            <Input placeholder="National ID Card" />
          </Form.Item>

          <Form.Item label="Address" name="address">
            <TextArea rows={2} placeholder="Full address" />
          </Form.Item>

          <Form.Item label="Credit Limit" name="creditLimit" initialValue={0}>
            <InputNumber
              min={0}
              style={{ width: '100%' }}
              prefix="PKR"
              placeholder="0 for no limit"
            />
          </Form.Item>

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setCustomerModalVisible(false)}>
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={createCustomerMutation.isLoading}
              >
                Add Customer
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </>
  );
};

export default CreateInvoice;