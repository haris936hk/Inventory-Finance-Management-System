// ========== src/pages/inventory/AddItem.jsx ==========
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Form, Input, Select, InputNumber, DatePicker, Button,
  Row, Col, Space, message, Steps, Divider, Checkbox, Switch
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
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);

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
  const { data: models, error: modelsError, isLoading: modelsLoading } = useQuery(
    ['models', selectedCategoryId, selectedCompanyId],
    async () => {
      const params = {};
      if (selectedCategoryId) params.categoryId = selectedCategoryId;
      if (selectedCompanyId) params.companyId = selectedCompanyId;

      console.log('Fetching models with params:', params);
      const response = await axios.get('/inventory/models', { params });
      console.log('Models API response:', response.data);
      return response.data.data;
    },
    {
      enabled: !!selectedCategoryId, // Only require categoryId to load models
      onError: (error) => {
        console.error('Models fetch error:', error);
      }
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
    setSelectedCategoryId(categoryId);
    // Clear model selection when category changes
    form.setFieldsValue({ modelId: undefined, specifications: {} });
  };

  const onCompanyChange = (companyId) => {
    setSelectedCompanyId(companyId);
    // Clear model selection when company changes
    form.setFieldsValue({ modelId: undefined });
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

        case 'boolean':
          return (
            <Col xs={24} sm={12} key={key}>
              <Form.Item
                label={key.charAt(0).toUpperCase() + key.slice(1)}
                name={fieldName}
                rules={[{ required: spec.required }]}
                valuePropName="checked"
              >
                <Switch
                  checkedChildren="Yes"
                  unCheckedChildren="No"
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

  const getCurrentStepFields = (step) => {
    switch (step) {
      case 0: // Basic Information
        return [
          'serialNumber',
          'categoryId',
          'companyId',
          'modelId',
          'condition',
          'status',
          // Include specification fields if any
          ...Object.keys(selectedCategory?.specTemplate || {}).map(key => ['specifications', key])
        ];
      case 1: // Purchase Information
        return [
          'inboundDate', // This is required
          'vendorId',
          'purchasePrice',
          'sellingPrice',
          'purchaseDate',
          'notes'
        ];
      default:
        return [];
    }
  };

  const onFinish = (values) => {
    // Debug logging
    console.log('Form values being submitted:', values);
    console.log('ModelId:', values.modelId);
    console.log('Condition:', values.condition);
    console.log('Available categories:', categories?.length || 0);
    console.log('Available companies:', companies?.length || 0);
    console.log('Available models:', models?.length || 0);
    console.log('Selected category ID:', selectedCategoryId);
    console.log('Selected company ID:', selectedCompanyId);

    // Ensure required fields are present
    if (!values.modelId) {
      console.error('Model validation failed - no modelId provided');
      console.log('Models available:', models);
      message.error('Please select a model');
      return;
    }

    if (!values.companyId) {
      message.error('Please select a company');
      return;
    }

    if (!values.condition) {
      message.error('Please select a condition');
      return;
    }

    // Format dates
    if (values.inboundDate) {
      values.inboundDate = values.inboundDate.toISOString();
    }
    if (values.purchaseDate) {
      values.purchaseDate = values.purchaseDate.toISOString();
    }

    // Log final payload
    console.log('Final payload being sent to API:', values);

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
                rules={[{ required: true, message: 'Company is required' }]}
              >
                <Select
                  placeholder="Select company"
                  showSearch
                  optionFilterProp="children"
                  onChange={onCompanyChange}
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
                  loading={modelsLoading}
                  notFoundContent={
                    modelsLoading ? 'Loading models...' :
                    modelsError ? 'Error loading models' :
                    selectedCategoryId ? 'No models found for selected filters' :
                    'Select category first'
                  }
                  onFocus={() => {
                    console.log('Models dropdown focused. Available models:', models?.length || 0);
                    console.log('Models data:', models);
                  }}
                >
                  {models?.map(model => (
                    <Select.Option key={model.id} value={model.id}>
                      {model.name} ({model.company?.name || 'No Company'})
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
              label="Selling Price (PKR)"
              name="sellingPrice"
            >
              <InputNumber
                min={0}
                style={{ width: '100%' }}
                placeholder="Enter selling price"
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
          <div style={{ display: currentStep === 0 ? 'block' : 'none' }}>
            {steps[0].content}
          </div>
          <div style={{ display: currentStep === 1 ? 'block' : 'none' }}>
            {steps[1].content}
          </div>

          <div style={{ marginTop: 24, textAlign: 'right' }}>
            <Space>
              {currentStep > 0 && (
                <Button onClick={() => setCurrentStep(currentStep - 1)}>
                  Previous
                </Button>
              )}
              
              {currentStep < steps.length - 1 && (
                <Button type="primary" onClick={() => {
                  // Only validate fields for the current step
                  const currentStepFields = getCurrentStepFields(currentStep);
                  form.validateFields(currentStepFields).then(() => {
                    setCurrentStep(currentStep + 1);
                  }).catch((errorInfo) => {
                    console.log('Validation failed for step:', currentStep, errorInfo);
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