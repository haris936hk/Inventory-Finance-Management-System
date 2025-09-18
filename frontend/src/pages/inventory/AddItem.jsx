// ========== src/pages/inventory/AddItem.jsx ==========
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Form, Input, Select, InputNumber, DatePicker, Button,
  Row, Col, Space, message, Steps, Divider, Checkbox
} from 'antd';
import {
  SaveOutlined, ArrowLeftOutlined, PlusOutlined, ScanOutlined
} from '@ant-design/icons';
import { useMutation, useQuery } from 'react-query';
import axios from 'axios';
import BarcodeScanner from '../../components/BarcodeScanner';
import dayjs from 'dayjs';

const { Step } = Steps;
const { TextArea } = Input;

const AddItem = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Fetch categories
  const { data: categories } = useQuery('categories', async () => {
    const response = await axios.get('/inventory/categories');
    return response.data.data;
  });

  // Fetch companies
  const { data: companies } = useQuery('companies', async () => {
    const response = await axios.get('/inventory/companies');
    return response.data.data;
  });

  // Fetch models based on selected category and company
  const { data: models } = useQuery(
    ['models', form.getFieldValue('categoryId'), form.getFieldValue('companyId')],
    async () => {
      const params = {};
      const categoryId = form.getFieldValue('categoryId');
      const companyId = form.getFieldValue('companyId');
      
      if (categoryId) params.categoryId = categoryId;
      if (companyId) params.companyId = companyId;
      
      const response = await axios.get('/inventory/models', { params });
      return response.data.data;
    },
    {
      enabled: !!(form.getFieldValue('categoryId') || form.getFieldValue('companyId'))
    }
  );

  // Fetch vendors
  const { data: vendors } = useQuery('vendors', async () => {
    const response = await axios.get('/inventory/vendors');
    return response.data.data;
  });

  // Create item mutation
  const createMutation = useMutation(
    (data) => axios.post('/inventory/items', data),
    {
      onSuccess: () => {
        message.success('Item added successfully');
        navigate('/app/inventory/items');
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Failed to add item');
      }
    }
  );

  const handleScanResult = (result) => {
    form.setFieldsValue({ serialNumber: result });
    setScannerVisible(false);
    message.success(`Scanned: ${result}`);
  };

  const onCategoryChange = (categoryId) => {
    const category = categories?.find(c => c.id === categoryId);
    setSelectedCategory(category);
    form.setFieldsValue({ specifications: {} });
  };

  const getSpecificationFields = () => {
    if (!selectedCategory?.specTemplate) return null;

    return Object.entries(selectedCategory.specTemplate).map(([key, spec]) => {
      const fieldName = ['specifications', key];
      
      switch (spec.type) {
        case 'select':
          return (
            <Col xs={24} sm={12} key={key}>
              <Form.Item
                label={key.charAt(0).toUpperCase() + key.slice(1)}
                name={fieldName}
                rules={[{ required: spec.required }]}
              >
                <Select placeholder={`Select ${key}`}>
                  {spec.options.map(option => (
                    <Select.Option key={option} value={option}>
                      {option}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          );
        
        case 'number':
          return (
            <Col xs={24} sm={12} key={key}>
              <Form.Item
                label={key.charAt(0).toUpperCase() + key.slice(1)}
                name={fieldName}
                rules={[{ required: spec.required }]}
              >
                <InputNumber
                  min={spec.min}
                  max={spec.max}
                  style={{ width: '100%' }}
                  placeholder={`Enter ${key}`}
                />
              </Form.Item>
            </Col>
          );
        
        default:
          return (
            <Col xs={24} sm={12} key={key}>
              <Form.Item
                label={key.charAt(0).toUpperCase() + key.slice(1)}
                name={fieldName}
                rules={[{ required: spec.required }]}
              >
                <Input placeholder={`Enter ${key}`} />
              </Form.Item>
            </Col>
          );
      }
    });
  };

  const onFinish = (values) => {
    // Format dates
    if (values.inboundDate) {
      values.inboundDate = values.inboundDate.toISOString();
    }
    if (values.purchaseDate) {
      values.purchaseDate = values.purchaseDate.toISOString();
    }

    createMutation.mutate(values);
  };

  const steps = [
    {
      title: 'Basic Information',
      content: (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}>
              <Form.Item
                label="Serial Number"
                name="serialNumber"
                rules={[{ required: true, message: 'Serial number is required' }]}
              >
                <Input
                  placeholder="Enter or scan serial number"
                  addonAfter={
                    <Button
                      type="text"
                      icon={<ScanOutlined />}
                      onClick={() => setScannerVisible(true)}
                    />
                  }
                />
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                label="Category"
                name="categoryId"
                rules={[{ required: true, message: 'Category is required' }]}
              >
                <Select
                  placeholder="Select category"
                  onChange={onCategoryChange}
                  showSearch
                  optionFilterProp="children"
                >
                  {categories?.map(cat => (
                    <Select.Option key={cat.id} value={cat.id}>
                      {cat.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                label="Company/Make"
                name="companyId"
              >
                <Select
                  placeholder="Select company"
                  showSearch
                  optionFilterProp="children"
                  allowClear
                >
                  {companies?.map(company => (
                    <Select.Option key={company.id} value={company.id}>
                      {company.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                label="Model"
                name="modelId"
                rules={[{ required: true, message: 'Model is required' }]}
              >
                <Select
                  placeholder="Select model"
                  showSearch
                  optionFilterProp="children"
                  notFoundContent={
                    form.getFieldValue('categoryId') ? 'No models found' : 'Select category first'
                  }
                >
                  {models?.map(model => (
                    <Select.Option key={model.id} value={model.id}>
                      {model.name} ({model.company.name})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                label="Condition"
                name="condition"
                initialValue="New"
                rules={[{ required: true }]}
              >
                <Select>
                  <Select.Option value="New">New</Select.Option>
                  <Select.Option value="Used">Used</Select.Option>
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                label="Status"
                name="status"
                initialValue="In Store"
                rules={[{ required: true }]}
              >
                <Select>
                  <Select.Option value="In Store">In Store</Select.Option>
                  <Select.Option value="In Hand">In Hand</Select.Option>
                  <Select.Option value="In Lab">In Lab</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {selectedCategory && (
            <>
              <Divider>Specifications</Divider>
              <Row gutter={[16, 16]}>
                {getSpecificationFields()}
              </Row>
            </>
          )}
        </>
      )
    },
    {
      title: 'Purchase Information',
      content: (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <Form.Item
              label="Vendor"
              name="vendorId"
            >
              <Select
                placeholder="Select vendor"
                showSearch
                optionFilterProp="children"
                allowClear
              >
                {vendors?.map(vendor => (
                  <Select.Option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>

          <Col xs={24} sm={12}>
            <Form.Item
              label="Purchase Price (PKR)"
              name="purchasePrice"
            >
              <InputNumber
                min={0}
                style={{ width: '100%' }}
                placeholder="Enter purchase price"
              />
            </Form.Item>
          </Col>

          <Col xs={24} sm={12}>
            <Form.Item
              label="Purchase Date"
              name="purchaseDate"
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>

          <Col xs={24} sm={12}>
            <Form.Item
              label="Inbound Date"
              name="inboundDate"
              initialValue={dayjs()}
              rules={[{ required: true, message: 'Inbound date is required' }]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>

          <Col xs={24}>
            <Form.Item
              label="Notes"
              name="notes"
            >
              <TextArea rows={3} placeholder="Additional notes" />
            </Form.Item>
          </Col>
        </Row>
      )
    }
  ];

  return (
    <>
      <Card
        title="Add New Item"
        extra={
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/app/inventory/items')}
          >
            Back to List
          </Button>
        }
      >
        <Steps current={currentStep} style={{ marginBottom: 24 }}>
          {steps.map(item => (
            <Step key={item.title} title={item.title} />
          ))}
        </Steps>

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
        >
          <div>{steps[currentStep].content}</div>

          <div style={{ marginTop: 24, textAlign: 'right' }}>
            <Space>
              {currentStep > 0 && (
                <Button onClick={() => setCurrentStep(currentStep - 1)}>
                  Previous
                </Button>
              )}
              
              {currentStep < steps.length - 1 && (
                <Button type="primary" onClick={() => {
                  form.validateFields().then(() => {
                    setCurrentStep(currentStep + 1);
                  });
                }}>
                  Next
                </Button>
              )}
              
              {currentStep === steps.length - 1 && (
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  htmlType="submit"
                  loading={createMutation.isLoading}
                >
                  Add Item
                </Button>
              )}
            </Space>
          </div>
        </Form>
      </Card>

      {/* Barcode Scanner */}
      <BarcodeScanner
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScan={handleScanResult}
      />
    </>
  );
};

export default AddItem;