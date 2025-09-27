import React, { useState } from 'react';
import {
  Card, Table, Button, Select, InputNumber, Modal, List, Avatar,
  Typography, Space, Tag, message, Tooltip, Row, Col, Input,
  Divider
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ShopOutlined,
  EditOutlined, ClearOutlined
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import axios from 'axios';
import SpecificationForm from './SpecificationForm';
import { formatPKR } from '../config/constants';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const PurchaseOrderItemSelector = ({ selectedItems, onItemsChange, onTotalChange }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [editingItemIndex, setEditingItemIndex] = useState(null);

  // Fetch filter data
  const { data: categories } = useQuery('categories', async () => {
    const response = await axios.get('/inventory/categories');
    return response.data.data;
  });

  const { data: companies } = useQuery('companies', async () => {
    const response = await axios.get('/inventory/companies');
    return response.data.data;
  });

  // Fetch product models
  const { data: productModels, isLoading } = useQuery(
    ['product-models', categoryFilter, companyFilter],
    async () => {
      const params = {};
      if (categoryFilter) params.categoryId = categoryFilter;
      if (companyFilter) params.companyId = companyFilter;

      const response = await axios.get('/inventory/models', { params });
      return response.data.data;
    }
  );

  const clearAllFilters = () => {
    setCategoryFilter('');
    setCompanyFilter('');
  };

  const addProductModel = (productModel) => {
    const newItem = {
      id: Math.random().toString(36),
      productModelId: productModel.id,
      description: `${productModel.company.name} ${productModel.name}`,
      categoryName: productModel.category.name,
      companyName: productModel.company.name,
      modelName: productModel.name,
      category: productModel.category, // Store full category object for template access
      company: productModel.company,   // Store full company object if needed
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      specifications: {},
      notes: ''
    };

    const updatedItems = [...selectedItems, newItem];
    onItemsChange(updatedItems);
    calculateTotals(updatedItems);
    message.success(`Added ${productModel.company.name} ${productModel.name} to purchase order`);
    setModalVisible(false);
  };

  const removeItem = (itemId) => {
    const updatedItems = selectedItems.filter(item => item.id !== itemId);
    onItemsChange(updatedItems);
    calculateTotals(updatedItems);
  };

  const updateItem = (itemId, field, value) => {
    const updatedItems = selectedItems.map(item => {
      if (item.id === itemId) {
        const updatedItem = { ...item, [field]: value };

        // Recalculate totalPrice when quantity or unitPrice changes
        if (field === 'quantity' || field === 'unitPrice') {
          updatedItem.totalPrice = (updatedItem.quantity || 0) * (updatedItem.unitPrice || 0);
        }

        return updatedItem;
      }
      return item;
    });

    onItemsChange(updatedItems);
    calculateTotals(updatedItems);
  };

  const calculateTotals = (items) => {
    const total = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    onTotalChange(total);
  };

  const editSpecifications = (itemIndex) => {
    setEditingItemIndex(itemIndex);
  };

  const updateSpecifications = (values) => {
    if (editingItemIndex !== null) {
      const updatedItems = [...selectedItems];
      updatedItems[editingItemIndex] = {
        ...updatedItems[editingItemIndex],
        specifications: values.specifications || {},
        notes: values.notes || ''
      };
      onItemsChange(updatedItems);
      setEditingItemIndex(null);
    }
  };

  const columns = [
    {
      title: 'Product',
      key: 'product',
      render: (_, record) => (
        <div>
          <Text strong>{record.description}</Text>
          <br />
          <Space size={4}>
            <Tag color="blue">{record.categoryName}</Tag>
            {Object.keys(record.specifications || {}).length > 0 && (
              <Tooltip title={JSON.stringify(record.specifications, null, 2)}>
                <Tag color="green">Has Specs</Tag>
              </Tooltip>
            )}
          </Space>
          {record.notes && (
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {record.notes.length > 50 ? `${record.notes.substring(0, 50)}...` : record.notes}
              </Text>
            </div>
          )}
        </div>
      )
    },
    {
      title: 'Quantity',
      key: 'quantity',
      width: 100,
      render: (_, record) => (
        <InputNumber
          value={record.quantity}
          onChange={(value) => updateItem(record.id, 'quantity', value || 1)}
          min={1}
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: 'Unit Price (PKR)',
      key: 'unitPrice',
      width: 140,
      render: (_, record) => (
        <InputNumber
          value={record.unitPrice}
          onChange={(value) => updateItem(record.id, 'unitPrice', value || 0)}
          min={0}
          precision={2}
          style={{ width: '100%' }}
          placeholder="0.00"
        />
      )
    },
    {
      title: 'Total (PKR)',
      key: 'totalPrice',
      width: 120,
      align: 'right',
      render: (_, record) => (
        <Text strong style={{ color: '#1890ff' }}>
          {formatPKR(Number(record.totalPrice || 0))}
        </Text>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record, index) => (
        <Space>
          <Tooltip title="Edit Specifications">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => editSpecifications(index)}
            />
          </Tooltip>
          <Tooltip title="Remove">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeItem(record.id)}
            />
          </Tooltip>
        </Space>
      )
    }
  ];

  return (
    <>
      <Card
        title="Purchase Order Items"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setModalVisible(true)}
          >
            Add Product
          </Button>
        }
      >
        <Table
          dataSource={selectedItems}
          columns={columns}
          rowKey="id"
          pagination={false}
          locale={{
            emptyText: 'No products selected. Click "Add Product" to start.'
          }}
        />

        {selectedItems.length > 0 && (
          <div style={{ marginTop: 16, textAlign: 'right', borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
            <Text strong style={{ fontSize: '16px' }}>
              Subtotal: {formatPKR(Number(selectedItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0)))}
            </Text>
          </div>
        )}
      </Card>

      {/* Product Selection Modal */}
      <Modal
        title="Select Product"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={800}
      >
        <Card
          size="small"
          title="Filters"
          style={{ marginBottom: 16 }}
          extra={
            <Button
              size="small"
              icon={<ClearOutlined />}
              onClick={clearAllFilters}
              type="text"
            >
              Clear All
            </Button>
          }
        >
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Text strong>Category:</Text>
              <Select
                value={categoryFilter}
                onChange={setCategoryFilter}
                style={{ width: '100%', marginTop: 4 }}
                placeholder="All categories"
                allowClear
                showSearch
                optionFilterProp="children"
              >
                <Option value="">All Categories</Option>
                {categories?.map(category => (
                  <Option key={category.id} value={category.id}>
                    {category.name}
                  </Option>
                ))}
              </Select>
            </Col>

            <Col xs={24} md={12}>
              <Text strong>Company:</Text>
              <Select
                value={companyFilter}
                onChange={setCompanyFilter}
                style={{ width: '100%', marginTop: 4 }}
                placeholder="All companies"
                allowClear
                showSearch
                optionFilterProp="children"
              >
                <Option value="">All Companies</Option>
                {companies?.map(company => (
                  <Option key={company.id} value={company.id}>
                    {company.name}
                  </Option>
                ))}
              </Select>
            </Col>
          </Row>
        </Card>

        <List
          loading={isLoading}
          dataSource={productModels}
          renderItem={(productModel) => (
            <List.Item
              actions={[
                <Button
                  type="primary"
                  icon={<ShopOutlined />}
                  onClick={() => addProductModel(productModel)}
                >
                  Add
                </Button>
              ]}
            >
              <List.Item.Meta
                avatar={
                  <Avatar style={{ backgroundColor: '#1890ff' }}>
                    {productModel.company.name.charAt(0)}
                  </Avatar>
                }
                title={
                  <Space>
                    <Text strong>{productModel.company.name} {productModel.name}</Text>
                    <Tag color="blue">{productModel.category.name}</Tag>
                    {productModel.code && <Tag color="green">{productModel.code}</Tag>}
                  </Space>
                }
                description={productModel.description || 'No description available'}
              />
            </List.Item>
          )}
        />
      </Modal>

      {/* Specifications Modal */}
      {editingItemIndex !== null && (
        <SpecificationsModal
          visible={editingItemIndex !== null}
          onCancel={() => setEditingItemIndex(null)}
          onSave={updateSpecifications}
          item={selectedItems[editingItemIndex]}
        />
      )}
    </>
  );
};

// Specifications Modal Component
const SpecificationsModal = ({ visible, onCancel, onSave, item }) => {
  const [formValues, setFormValues] = useState({ specifications: {}, notes: '' });

  // Initialize form values when modal opens
  React.useEffect(() => {
    if (visible && item) {
      setFormValues({
        specifications: item.specifications || {},
        notes: item.notes || ''
      });
    }
  }, [visible, item]);

  const handleSave = () => {
    onSave(formValues);
  };

  const handleValuesChange = (values) => {
    setFormValues(values);
  };

  if (!item) return null;

  // Get the category specification template
  const categoryTemplate = item.category?.specTemplate || {};

  return (
    <Modal
      title={
        <Space direction="vertical" size={0}>
          <Text strong>Edit Product Specifications</Text>
          <Text type="secondary" style={{ fontSize: '14px' }}>
            {item.description}
          </Text>
        </Space>
      }
      open={visible}
      onCancel={onCancel}
      onOk={handleSave}
      width={800}
      okText="Save Specifications"
      cancelText="Cancel"
    >
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Tag color="blue">{item.categoryName}</Tag>
          <Tag color="green">{item.companyName}</Tag>
          <Tag>{item.modelName}</Tag>
        </Space>
      </div>

      <Divider />

      <SpecificationForm
        template={categoryTemplate}
        initialValues={formValues}
        onValuesChange={handleValuesChange}
        showNotes={true}
        layout="vertical"
      />
    </Modal>
  );
};

export default PurchaseOrderItemSelector;