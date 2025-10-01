// ========== src/pages/inventory/BulkAddItems.jsx ==========
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Form, Input, Select, InputNumber, DatePicker, Button,
  Row, Col, Space, message, Steps, Divider, Switch, Table, Tag
} from 'antd';
import {
  SaveOutlined, ArrowLeftOutlined, ScanOutlined
} from '@ant-design/icons';
import { useMutation, useQuery } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const { Step } = Steps;
const { TextArea } = Input;

const BulkAddItems = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [serialNumbers, setSerialNumbers] = useState([]);
  const [quantity, setQuantity] = useState(1);

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
      enabled: !!selectedCategoryId,
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

  // Create bulk items mutation
  const createMutation = useMutation(
    (data) => axios.post('/inventory/items/bulk', data),
    {
      onSuccess: (response) => {
        const count = response.data.data?.count || serialNumbers.length;
        message.success(`${count} items added successfully`);
        navigate('/app/inventory/items');
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Failed to add items');
      }
    }
  );

  // Initialize serial number rows when quantity changes
  useEffect(() => {
    const currentQuantity = form.getFieldValue('quantity') || 1;
    if (currentQuantity !== serialNumbers.length) {
      const newSerialNumbers = Array.from({ length: currentQuantity }, (_, i) => ({
        key: i,
        index: i + 1,
        serialNumber: serialNumbers[i]?.serialNumber || ''
      }));
      setSerialNumbers(newSerialNumbers);
      setQuantity(currentQuantity);
    }
  }, [form.getFieldValue('quantity')]);

  const onCategoryChange = (categoryId) => {
    const category = categories?.find(c => c.id === categoryId);
    setSelectedCategory(category);
    setSelectedCategoryId(categoryId);
    form.setFieldsValue({ modelId: undefined, specifications: {} });
  };

  const onCompanyChange = (companyId) => {
    setSelectedCompanyId(companyId);
    form.setFieldsValue({ modelId: undefined });
  };

  const handleSerialNumberChange = (index, value) => {
    const newSerialNumbers = [...serialNumbers];
    newSerialNumbers[index] = {
      ...newSerialNumbers[index],
      serialNumber: value
    };
    setSerialNumbers(newSerialNumbers);
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
          'quantity',
          'categoryId',
          'modelId',
          'condition',
          'status',
          ...Object.keys(selectedCategory?.specTemplate || {}).map(key => ['specifications', key])
        ];
      case 1: // Purchase Information
        return [
          'inboundDate',
          'vendorId',
          'purchasePrice',
          'purchaseDate',
          'notes'
        ];
      case 2: // Serial Numbers
        return [];
      default:
        return [];
    }
  };

  const validateSerialNumbers = () => {
    const emptySerials = serialNumbers.filter(item => !item.serialNumber.trim());
    if (emptySerials.length > 0) {
      message.error('Please enter all serial numbers');
      return false;
    }

    const uniqueSerials = new Set(serialNumbers.map(item => item.serialNumber.trim()));
    if (uniqueSerials.size !== serialNumbers.length) {
      message.error('Serial numbers must be unique');
      return false;
    }

    return true;
  };

  const onFinish = (values) => {
    console.log('Form values being submitted:', values);

    if (!validateSerialNumbers()) {
      return;
    }

    // Prepare items array with serial numbers
    const items = serialNumbers.map(item => ({
      serialNumber: item.serialNumber.trim(),
      categoryId: values.categoryId,
      modelId: values.modelId,
      condition: values.condition,
      status: values.status,
      specifications: values.specifications,
      vendorId: values.vendorId,
      purchasePrice: values.purchasePrice,
      purchaseDate: values.purchaseDate ? values.purchaseDate.toISOString() : null,
      inboundDate: values.inboundDate ? values.inboundDate.toISOString() : null,
      notes: values.notes
    }));

    console.log('Final payload being sent to API:', { items });
    createMutation.mutate({ items });
  };

  const serialNumberColumns = [
    {
      title: '#',
      dataIndex: 'index',
      key: 'index',
      width: 60,
      align: 'center'
    },
    {
      title: 'Serial Number',
      dataIndex: 'serialNumber',
      key: 'serialNumber',
      render: (text, record, index) => (
        <Input
          value={text}
          onChange={(e) => handleSerialNumberChange(index, e.target.value)}
          placeholder={`Enter serial number ${index + 1}`}
          status={!text.trim() ? 'error' : ''}
        />
      )
    }
  ];

  const steps = [
    {
      title: 'Basic Information',
      content: (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}>
              <Form.Item
                label="Quantity"
                name="quantity"
                rules={[{ required: true, message: 'Quantity is required' }]}
                initialValue={1}
              >
                <InputNumber
                  min={1}
                  max={1000}
                  style={{ width: '100%' }}
                  placeholder="Enter number of items to add"
                  onChange={(value) => {
                    const newSerialNumbers = Array.from({ length: value || 1 }, (_, i) => ({
                      key: i,
                      index: i + 1,
                      serialNumber: serialNumbers[i]?.serialNumber || ''
                    }));
                    setSerialNumbers(newSerialNumbers);
                    setQuantity(value || 1);
                  }}
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
                placeholder="Enter purchase price per item"
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
              <TextArea rows={3} placeholder="Additional notes (will apply to all items)" />
            </Form.Item>
          </Col>
        </Row>
      )
    },
    {
      title: 'Serial Numbers',
      content: (
        <>
          <div style={{ marginBottom: 16 }}>
            <Tag color="blue">Total Items: {serialNumbers.length}</Tag>
            <p style={{ marginTop: 8, color: '#666' }}>
              Enter unique serial numbers for each item. All items will have the same specifications and purchase details.
            </p>
          </div>
          <Table
            columns={serialNumberColumns}
            dataSource={serialNumbers}
            pagination={false}
            size="small"
            bordered
            scroll={{ y: 400 }}
          />
        </>
      )
    }
  ];

  return (
    <Card
      title="Bulk Add Items"
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
        <div style={{ display: currentStep === 2 ? 'block' : 'none' }}>
          {steps[2].content}
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
                onClick={() => form.submit()}
                loading={createMutation.isLoading}
              >
                Add Items
              </Button>
            )}
          </Space>
        </div>
      </Form>
    </Card>
  );
};

export default BulkAddItems;
