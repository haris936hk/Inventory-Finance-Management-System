import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Form,
  Input,
  Select,
  InputNumber,
  DatePicker,
  Button,
  Row,
  Col,
  Space,
  message,
  Divider,
  Typography,
  Modal
} from 'antd';
import {
  SaveOutlined,
  ArrowLeftOutlined,
  UserAddOutlined
} from '@ant-design/icons';
import { useMutation, useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import GroupedItemSelector from '../../components/GroupedItemSelector';

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

  const handleItemsChange = (newItems) => {
    setSelectedItems(newItems);
    setSubtotal(newItems.reduce((sum, item) => sum + (item.unitPrice || 0), 0));
  };

  const handleSubtotalChange = (newSubtotal) => {
    setSubtotal(newSubtotal);
  };

  const calculateTotals = () => {
    const discountType = form.getFieldValue('discountType');
    const discountValue = form.getFieldValue('discountValue') || 0;

    let discount = 0;
    if (discountType === 'Percentage') {
      discount = (subtotal * discountValue) / 100;
    } else if (discountType === 'Fixed') {
      discount = discountValue;
    }
    setDiscountAmount(discount);

    const taxableAmount = subtotal - discount;
    const taxRate = form.getFieldValue('taxRate') || 0;
    const tax = (taxableAmount * taxRate) / 100;
    setTaxAmount(tax);

    setTotal(taxableAmount + tax);
  };

  // Recalculate totals when form values change
  React.useEffect(() => {
    calculateTotals();
  }, [subtotal, form.getFieldValue('discountType'), form.getFieldValue('discountValue'), form.getFieldValue('taxRate')]);

  const onFinish = (values) => {
    if (selectedItems.length === 0) {
      message.error('Please add at least one item');
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

          <div style={{ marginTop: 16 }}>
            <GroupedItemSelector
              selectedItems={selectedItems}
              onItemsChange={handleItemsChange}
              onTotalChange={handleSubtotalChange}
            />
          </div>

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
                          setTimeout(() => calculateTotals(), 0);
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
                          setTimeout(() => calculateTotals(), 0);
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