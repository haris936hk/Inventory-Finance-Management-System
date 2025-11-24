// ========== src/pages/inventory/BulkAddItems.jsx ==========
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Form, Input, Select, InputNumber, DatePicker, Button,
  Row, Col, Space, message, Steps, Divider, Switch, Table, Tag, Typography
} from 'antd';
import {
  SaveOutlined, ArrowLeftOutlined, ScanOutlined
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatPKR } from '../../config/constants';
import { parseAmount } from '../../utils/decimalUtils';

const { Step } = Steps;
const { TextArea } = Input;
const { Text } = Typography;

const BulkAddItems = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [serialNumbers, setSerialNumbers] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [selectedPO, setSelectedPO] = useState(null);
  const [selectedPOLineItem, setSelectedPOLineItem] = useState(null);
  const [usePO, setUsePO] = useState(false);
  const [serialValidationErrors, setSerialValidationErrors] = useState({});
  const poIdFromUrl = searchParams.get('poId');

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

  // Fetch purchase orders (only Paid status ones)
  const { data: purchaseOrders } = useQuery('purchase-orders-paid', async () => {
    const response = await axios.get('/finance/purchase-orders', {
      params: { status: 'Paid', include: 'lineItems' }
    });
    return response.data.data;
  });

  // Create bulk items mutation
  const createMutation = useMutation(
    (data) => axios.post('/inventory/items/bulk', data),
    {
      onSuccess: (response) => {
        const count = response.data.data?.count || serialNumbers.length;
        message.success(`${count} items added successfully`);
        queryClient.invalidateQueries('items');
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

  // Auto-select PO from URL parameter
  useEffect(() => {
    if (poIdFromUrl && purchaseOrders && !selectedPO) {
      const po = purchaseOrders.find(p => p.id === poIdFromUrl);
      if (po) {
        setUsePO(true);
        setSelectedPO(po);
        form.setFieldsValue({
          purchaseOrderId: po.id,
          vendorId: po.vendorId
        });
      }
    }
  }, [poIdFromUrl, purchaseOrders, selectedPO, form]);

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

  const onPOChange = (poId) => {
    const po = purchaseOrders?.find(p => p.id === poId);
    setSelectedPO(po);

    if (po) {
      // Auto-populate vendor
      form.setFieldsValue({
        vendorId: po.vendorId,
        poLineItemId: undefined
      });
      setSelectedPOLineItem(null);
    }
  };

  const onPOLineItemChange = (lineItemId) => {
    const lineItem = selectedPO?.lineItems?.find(li => li.id === lineItemId);
    setSelectedPOLineItem(lineItem);

    if (lineItem) {
      // Auto-populate fields from line item
      const category = categories?.find(c => c.id === lineItem.productModel?.categoryId);
      setSelectedCategory(category);
      setSelectedCategoryId(lineItem.productModel?.categoryId);
      setSelectedCompanyId(lineItem.productModel?.companyId);

      form.setFieldsValue({
        categoryId: lineItem.productModel?.categoryId,
        companyId: lineItem.productModel?.companyId,
        modelId: lineItem.productModelId,
        purchasePrice: parseAmount(lineItem.unitPrice),
        specifications: lineItem.specifications || {}
      });
    }
  };

  const handleSerialNumberChange = (index, value) => {
    const newSerialNumbers = [...serialNumbers];
    newSerialNumbers[index] = {
      ...newSerialNumbers[index],
      serialNumber: value
    };
    setSerialNumbers(newSerialNumbers);

    // Clear any existing validation errors for this field when user starts typing
    if (serialValidationErrors[index]) {
      setSerialValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[index];
        return newErrors;
      });
    }

    // Check for duplicates within the list (instant, no delay)
    const duplicateIndex = newSerialNumbers.findIndex(
      (item, idx) => idx !== index && item.serialNumber.trim() === value.trim() && value.trim() !== ''
    );

    if (duplicateIndex !== -1 && value.trim()) {
      setSerialValidationErrors(prev => ({
        ...prev,
        [index]: 'Duplicate serial number in list'
      }));
    }
  };

  const getSpecificationFields = () => {
    if (!selectedCategory?.specTemplate) return null;

    // Disable specification fields if receiving from PO line item
    const isDisabled = !!selectedPOLineItem;

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
                <Select placeholder={`Select ${key}`} disabled={isDisabled}>
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
                  disabled={isDisabled}
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
                  disabled={isDisabled}
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
                <Input placeholder={`Enter ${key}`} disabled={isDisabled} />
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

  const validateSerialNumbers = async () => {
    // Check for empty serials
    const emptySerials = serialNumbers.filter(item => !item.serialNumber.trim());
    if (emptySerials.length > 0) {
      message.error('Please enter all serial numbers');
      return false;
    }

    // Check for duplicates within the list
    const uniqueSerials = new Set(serialNumbers.map(item => item.serialNumber.trim()));
    if (uniqueSerials.size !== serialNumbers.length) {
      message.error('Serial numbers must be unique within the list');
      return false;
    }

    // Check each serial number against the database
    message.loading({ content: 'Validating serial numbers...', key: 'validating' });

    try {
      const validationPromises = serialNumbers.map(async (item, index) => {
        const serialNumber = item.serialNumber.trim();
        try {
          const response = await axios.get(`/inventory/items/check-serial/${encodeURIComponent(serialNumber)}`);
          if (response.data.exists) {
            return {
              index,
              serialNumber,
              error: 'Serial number already exists in database'
            };
          }
          return null;
        } catch (error) {
          console.error('Error checking serial:', serialNumber, error);
          return {
            index,
            serialNumber,
            error: 'Error validating serial number'
          };
        }
      });

      const validationResults = await Promise.all(validationPromises);
      const errors = validationResults.filter(result => result !== null);

      if (errors.length > 0) {
        message.error({
          content: `Found ${errors.length} invalid serial number(s). Please check and fix them.`,
          key: 'validating',
          duration: 5
        });

        // Update validation errors state
        const newErrors = {};
        errors.forEach(err => {
          newErrors[err.index] = err.error;
        });
        setSerialValidationErrors(newErrors);

        return false;
      }

      message.success({ content: 'All serial numbers are valid', key: 'validating' });
      return true;
    } catch (error) {
      message.error({ content: 'Error validating serial numbers', key: 'validating' });
      return false;
    }
  };

  const onFinish = async (values) => {
    console.log('Form values being submitted:', values);

    const isValid = await validateSerialNumbers();
    if (!isValid) {
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
      sellingPrice: values.sellingPrice,
      purchaseDate: values.purchaseDate ? values.purchaseDate.toISOString() : null,
      inboundDate: values.inboundDate ? values.inboundDate.toISOString() : null,
      notes: values.notes,
      // Add line item ID if from PO
      lineItemId: usePO && selectedPOLineItem ? selectedPOLineItem.id : undefined
    }));

    const payload = {
      items,
      // Add PO ID if linking to PO
      purchaseOrderId: usePO && selectedPO ? selectedPO.id : undefined
    };

    console.log('Final payload being sent to API:', payload);
    createMutation.mutate(payload);
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
      render: (text, record, index) => {
        const hasError = serialValidationErrors[index];

        return (
          <div>
            <Input
              value={text}
              onChange={(e) => handleSerialNumberChange(index, e.target.value)}
              placeholder={`Enter serial number ${index + 1}`}
              status={!text.trim() || hasError ? 'error' : ''}
            />
            {hasError && (
              <Text type="danger" style={{ fontSize: '12px' }}>
                {hasError}
              </Text>
            )}
          </div>
        );
      }
    }
  ];

  const steps = [
    {
      title: 'Basic Information',
      content: (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24}>
              <Form.Item
                label="Link to Purchase Order"
                valuePropName="checked"
              >
                <Switch
                  checked={usePO}
                  onChange={(checked) => {
                    setUsePO(checked);
                    if (!checked) {
                      setSelectedPO(null);
                      setSelectedPOLineItem(null);
                      form.setFieldsValue({
                        purchaseOrderId: undefined,
                        poLineItemId: undefined
                      });
                    }
                  }}
                  checkedChildren="Yes"
                  unCheckedChildren="No"
                />
                <Text type="secondary" style={{ marginLeft: 10 }}>
                  Link items to a Purchase Order (auto-fills vendor, price, and product info)
                </Text>
              </Form.Item>
            </Col>

            {usePO && (
              <>
                <Col xs={24} sm={12}>
                  <Form.Item
                    label="Purchase Order"
                    name="purchaseOrderId"
                    rules={[{ required: usePO, message: 'Please select a purchase order' }]}
                  >
                    <Select
                      placeholder="Select Purchase Order"
                      onChange={onPOChange}
                      showSearch
                      optionFilterProp="children"
                    >
                      {purchaseOrders?.map(po => (
                        <Select.Option key={po.id} value={po.id}>
                          {po.poNumber} - {po.vendor?.name} ({formatPKR(po.total)})
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>

                {selectedPO && (
                  <Col xs={24} sm={12}>
                    <Form.Item
                      label="PO Line Item"
                      name="poLineItemId"
                      rules={[{ required: usePO && selectedPO, message: 'Please select a line item' }]}
                    >
                      <Select
                        placeholder="Select Line Item"
                        onChange={onPOLineItemChange}
                        showSearch
                        optionFilterProp="children"
                      >
                        {selectedPO.lineItems?.map(item => (
                          <Select.Option key={item.id} value={item.id}>
                            {item.productModel?.name} - {item.description} (Qty: {item.quantity}, {formatPKR(item.unitPrice)} each)
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                )}
              </>
            )}

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
                  disabled={usePO && selectedPOLineItem}
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
                  disabled={usePO && selectedPOLineItem}
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
                  disabled={usePO && selectedPOLineItem}
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
                disabled={usePO && selectedPO}
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
                disabled={usePO && selectedPOLineItem}
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
                placeholder="Enter selling price per item"
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
