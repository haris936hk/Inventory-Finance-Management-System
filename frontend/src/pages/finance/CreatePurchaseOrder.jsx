// ========== src/pages/finance/CreatePurchaseOrder.jsx ==========
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Form, Select, DatePicker, Button, Row, Col,
  Typography, Divider, Space, InputNumber, message
} from 'antd';
import {
  ShopOutlined, ArrowLeftOutlined, ReconciliationOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import PurchaseOrderItemSelector from '../../components/PurchaseOrderItemSelector';
import { formatPKR } from '../../config/constants';

const { Title, Text } = Typography;

const CreatePurchaseOrder = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [subtotal, setSubtotal] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [total, setTotal] = useState(0);

  // Fetch vendors
  const { data: vendors } = useQuery('vendors', async () => {
    const response = await axios.get('/inventory/vendors');
    return response.data.data;
  });

  // Create PO mutation
  const poMutation = useMutation(
    (data) => axios.post('/finance/purchase-orders', data),
    {
      onSuccess: () => {
        message.success('Purchase Order created successfully!');
        queryClient.invalidateQueries(['purchase-orders']);
        navigate('/app/finance/purchase-orders');
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Failed to create purchase order');
      }
    }
  );

  const handleVendorChange = (vendorId) => {
    setSelectedVendor(vendorId);
  };

  const handleItemsChange = (items) => {
    setSelectedItems(items);
  };

  const handleSubtotalChange = (newSubtotal) => {
    setSubtotal(newSubtotal);
    calculateTotals(newSubtotal);
  };

  const calculateTotals = (currentSubtotal = subtotal) => {
    const taxRate = form.getFieldValue('taxRate') || 0;
    const calculatedTax = (currentSubtotal * taxRate) / 100;
    const calculatedTotal = currentSubtotal + calculatedTax;

    setTaxAmount(calculatedTax);
    setTotal(calculatedTotal);
  };

  useEffect(() => {
    calculateTotals();
  }, [form.getFieldValue('taxRate')]);

  const handleSubmit = (values) => {
    if (selectedItems.length === 0) {
      message.error('Please add at least one line item');
      return;
    }

    // Check if all items have required specifications filled
    const hasRequiredSpecs = (item) => {
      const template = item.category?.specTemplate || {};
      const specs = item.specifications || {};

      for (const [key, field] of Object.entries(template)) {
        if (field.required && (!specs[key] || specs[key] === '')) {
          return false;
        }
      }
      return true;
    };

    const incompleteItems = selectedItems.filter(item => {
      const hasTemplate = item.category?.specTemplate && Object.keys(item.category.specTemplate).length > 0;
      return hasTemplate && !hasRequiredSpecs(item);
    });

    if (incompleteItems.length > 0) {
      message.error({
        content: `${incompleteItems.length} line item(s) have incomplete specifications. Please fill in all required specifications before submitting.`,
        duration: 5
      });
      return;
    }

    const poData = {
      vendorId: values.vendorId,
      poDate: values.orderDate.toISOString(),
      expectedDate: values.expectedDate ? values.expectedDate.toISOString() : null,
      lineItems: selectedItems.map(item => ({
        productModelId: item.productModelId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        specifications: item.specifications || {}
      })),
      subtotal: parseFloat(subtotal.toFixed(2)),
      taxRate: parseFloat(values.taxRate || 0),
      taxAmount: parseFloat(taxAmount.toFixed(2)),
      total: parseFloat(total.toFixed(2))
    };

    poMutation.mutate(poData);
  };

  return (
    <div>
      <Card
        title={
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/app/finance/purchase-orders')}
            />
            <ReconciliationOutlined />
            Create Purchase Order
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            orderDate: dayjs(),
            taxRate: 0
          }}
        >
          <Row gutter={[24, 0]}>
            <Col xs={24} lg={12}>
              <Card title="PO Details" size="small">
                <Form.Item
                  label="Vendor"
                  name="vendorId"
                  rules={[{ required: true, message: 'Please select a vendor' }]}
                >
                  <Select
                    placeholder="Select vendor"
                    showSearch
                    optionFilterProp="children"
                    onChange={handleVendorChange}
                  >
                    {vendors?.map(vendor => (
                      <Select.Option key={vendor.id} value={vendor.id}>
                        {vendor.name} ({vendor.code})
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      label="Order Date"
                      name="orderDate"
                      rules={[{ required: true, message: 'Please select order date' }]}
                    >
                      <DatePicker style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      label="Expected Date"
                      name="expectedDate"
                    >
                      <DatePicker style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>

                <Divider />

                <Form.Item
                  label="Tax Rate (%)"
                  name="taxRate"
                >
                  <InputNumber
                    style={{ width: '100%' }}
                    precision={2}
                    min={0}
                    max={100}
                    placeholder="0.00"
                    onChange={() => {
                      setTimeout(() => calculateTotals(), 0);
                    }}
                  />
                </Form.Item>

                <div style={{ background: '#f5f5f5', padding: '16px', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text>Subtotal:</Text>
                    <Text strong>{formatPKR(subtotal)}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text>Tax:</Text>
                    <Text>{formatPKR(taxAmount)}</Text>
                  </div>
                  <Divider style={{ margin: '8px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text strong style={{ fontSize: '16px' }}>Total:</Text>
                    <Text strong style={{ fontSize: '16px', color: '#1890ff' }}>
                      {formatPKR(total)}
                    </Text>
                  </div>
                </div>
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              {selectedVendor && vendors && (
                <Card title="Vendor Information" size="small">
                  {(() => {
                    const vendor = vendors.find(v => v.id === selectedVendor);
                    if (!vendor) return null;
                    return (
                      <div>
                        <Row gutter={[16, 8]}>
                          <Col span={12}>
                            <Text strong>Vendor Name:</Text>
                            <br />
                            {vendor.name}
                          </Col>
                          <Col span={12}>
                            <Text strong>Vendor Code:</Text>
                            <br />
                            {vendor.code}
                          </Col>
                          <Col span={12}>
                            <Text strong>Contact Person:</Text>
                            <br />
                            {vendor.contactPerson || 'N/A'}
                          </Col>
                          <Col span={12}>
                            <Text strong>Phone:</Text>
                            <br />
                            {vendor.phone || 'N/A'}
                          </Col>
                          <Col span={24}>
                            <Text strong>Address:</Text>
                            <br />
                            {vendor.address || 'N/A'}
                          </Col>
                          <Col span={12}>
                            <Text strong>Current Balance:</Text>
                            <br />
                            <Text style={{ color: '#f5222d', fontWeight: 'bold' }}>
                              {formatPKR(Number(vendor.currentBalance || 0))}
                            </Text>
                          </Col>
                        </Row>
                      </div>
                    );
                  })()}
                </Card>
              )}
            </Col>
          </Row>

          <Divider />

          <Card title="Line Items" size="small">
            <PurchaseOrderItemSelector
              selectedItems={selectedItems}
              onItemsChange={handleItemsChange}
              onTotalChange={handleSubtotalChange}
            />
          </Card>

          <Divider />

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => navigate('/app/finance/purchase-orders')}>
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={poMutation.isLoading}
                icon={<ReconciliationOutlined />}
              >
                Create Purchase Order
              </Button>
            </Space>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default CreatePurchaseOrder;
