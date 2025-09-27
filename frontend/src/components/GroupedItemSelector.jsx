// ========== src/components/GroupedItemSelector.jsx ==========
import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Select, InputNumber, Modal, List, Avatar,
  Typography, Space, Tag, message, Tooltip, Divider, Row, Col
} from 'antd';
import {
  PlusOutlined, EyeOutlined, DeleteOutlined, ShoppingOutlined,
  TagOutlined, SettingOutlined, ClearOutlined
} from '@ant-design/icons';
import { useQuery, useMutation } from 'react-query';
import axios from 'axios';
import { formatPKR } from '../config/constants';

const { Text } = Typography;
const { Option } = Select;

const GroupedItemSelector = ({ selectedItems, onItemsChange, onTotalChange }) => {
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  // Always use FIFO assignment preference
  const [quantityToAdd, setQuantityToAdd] = useState(1);
  const [serialModalVisible, setSerialModalVisible] = useState(false);
  const [conditionFilter, setConditionFilter] = useState(''); // '' means all conditions
  const [categoryFilter, setCategoryFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');

  // Reset dependent filters when parent filter changes
  useEffect(() => {
    setModelFilter(''); // Reset model when company changes
  }, [companyFilter]);

  // Clear all filters function
  const clearAllFilters = () => {
    setConditionFilter('');
    setCategoryFilter('');
    setCompanyFilter('');
    setModelFilter('');
  };

  // Fetch filter data
  const { data: categories } = useQuery('categories', async () => {
    const response = await axios.get('/inventory/categories');
    return response.data.data;
  });

  const { data: companies } = useQuery('companies', async () => {
    const response = await axios.get('/inventory/companies');
    return response.data.data;
  });

  const { data: models } = useQuery(['models', companyFilter], async () => {
    const params = companyFilter ? { companyId: companyFilter } : {};
    const response = await axios.get('/inventory/models', { params });
    return response.data.data;
  });

  // Fetch grouped available items
  const { data: groupedItems, isLoading, refetch } = useQuery(
    ['groupedItems', conditionFilter, categoryFilter, companyFilter, modelFilter],
    async () => {
      const params = {};
      if (conditionFilter) params.condition = conditionFilter;
      if (categoryFilter) params.categoryId = categoryFilter;
      if (modelFilter) params.modelId = modelFilter;

      const response = await axios.get('/inventory/items/grouped', { params });
      return response.data.data;
    }
  );

  // Select items for UI display only (no reservation yet)
  const selectItemsForDisplay = (group, quantity) => {
    // Get available items from the group
    let availableItems = [...group.items];

    if (availableItems.length < quantity) {
      message.error(`Only ${availableItems.length} items available, requested ${quantity}`);
      return;
    }

    // Always use FIFO (First In, First Out) sorting
    availableItems.sort((a, b) => new Date(a.inboundDate) - new Date(b.inboundDate));

    // Select the required quantity for UI display
    const selectedItemsFromGroup = availableItems.slice(0, quantity);

    // Add selected items to the invoice form for display only
    const newItems = selectedItemsFromGroup.map(item => ({
      id: item.id,
      itemId: item.id,
      serialNumber: item.serialNumber,
      description: `${group.category.name} - ${group.model.company.name} ${group.model.name}`,
      unitPrice: Number(group.samplePrice) || 0,
      specifications: group.specifications,
      condition: group.condition,
      groupKey: `${group.modelId}_${group.condition}_${JSON.stringify(group.specifications || {})}`
    }));

    const updatedItems = [...selectedItems, ...newItems];
    onItemsChange(updatedItems);
    calculateTotal(updatedItems);

    message.success(`Added ${selectedItemsFromGroup.length} items to invoice (items will be reserved when you click "Create Invoice")`);
    setGroupModalVisible(false);
    // Reset all filters after successful selection
    setConditionFilter('');
    setCategoryFilter('');
    setCompanyFilter('');
    setModelFilter('');
    refetch(); // Refresh available items to show updated counts
  };

  // Calculate total when items change
  const calculateTotal = (items) => {
    const total = items.reduce((sum, item) => sum + (Number(item.unitPrice) || 0), 0);
    onTotalChange(total);
  };

  const handleAddGroup = (group) => {
    setSelectedGroup(group);
    setQuantityToAdd(1);
    setGroupModalVisible(true);
  };

  const handleConfirmAdd = () => {
    selectItemsForDisplay(selectedGroup, quantityToAdd);
  };

  const handleViewSerialNumbers = (groupKey) => {
    // Store only the groupKey - items will be filtered dynamically
    setSelectedGroup({ groupKey });
    setSerialModalVisible(true);
  };

  const handleRemoveItem = (itemId) => {
    const updatedItems = selectedItems.filter(item => item.itemId !== itemId);
    onItemsChange(updatedItems);
    calculateTotal(updatedItems);
  };

  const handleRemoveGroup = (groupItems) => {
    const itemIds = groupItems.map(item => item.itemId);
    const updatedItems = selectedItems.filter(item => !itemIds.includes(item.itemId));
    onItemsChange(updatedItems);
    calculateTotal(updatedItems);
  };

  const handlePriceChange = (itemId, newPrice) => {
    const price = Number(newPrice) || 0;
    const updatedItems = selectedItems.map(item =>
      item.itemId === itemId ? { ...item, unitPrice: price } : item
    );
    onItemsChange(updatedItems);
    calculateTotal(updatedItems);
  };

  const handleGroupPriceChange = (groupItems, newPrice) => {
    const price = Number(newPrice) || 0;
    const itemIds = groupItems.map(item => item.itemId);

    const updatedItems = selectedItems.map(item =>
      itemIds.includes(item.itemId) ? { ...item, unitPrice: price } : item
    );
    onItemsChange(updatedItems);
    calculateTotal(updatedItems);
  };

  // Group selected items by model+specs+condition for display
  const groupedSelectedItems = selectedItems.reduce((groups, item) => {
    const key = item.groupKey || 'unknown';
    if (!groups[key]) {
      groups[key] = {
        description: item.description,
        condition: item.condition,
        specifications: item.specifications,
        items: [],
        totalPrice: 0
      };
    }
    groups[key].items.push(item);
    groups[key].totalPrice += item.unitPrice || 0;
    return groups;
  }, {});

  const selectedItemsColumns = [
    {
      title: 'Item Group',
      key: 'group',
      render: (_, record) => (
        <div>
          <Text strong>{record.description}</Text>
          <br />
          <Space size={4}>
            <Tag color="blue">{record.condition}</Tag>
            {record.specifications && Object.keys(record.specifications).length > 0 && (
              <Tooltip title={JSON.stringify(record.specifications, null, 2)}>
                <Tag color="green"><TagOutlined /> Specs</Tag>
              </Tooltip>
            )}
          </Space>
        </div>
      )
    },
    {
      title: 'Quantity',
      key: 'quantity',
      width: 80,
      render: (_, record) => (
        <Text strong>{record.items.length}</Text>
      )
    },
    {
      title: 'Unit Price',
      key: 'unitPrice',
      width: 120,
      render: (_, record) => {
        // Get unit price from first item (all items in group should have same unit price)
        const unitPrice = record.items.length > 0 ? (Number(record.items[0].unitPrice) || 0) : 0;
        return (
          <InputNumber
            value={unitPrice}
            onChange={(value) => {
              const newPrice = Number(value) || 0;
              // Update all items in this group with the same unit price
              handleGroupPriceChange(record.items, newPrice);
            }}
            min={0}
            prefix="PKR"
            style={{ width: '100%' }}
            placeholder="0"
          />
        );
      }
    },
    {
      title: 'Total',
      key: 'total',
      width: 120,
      render: (_, record) => {
        // Total = Unit Price × Quantity
        const unitPrice = record.items.length > 0 ? (Number(record.items[0].unitPrice) || 0) : 0;
        const quantity = record.items.length;
        const total = unitPrice * quantity;
        return (
          <Text strong>{formatPKR(total)}</Text>
        );
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Tooltip title="View Serial Numbers">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => handleViewSerialNumbers(record.items[0]?.groupKey)}
            />
          </Tooltip>
          <Tooltip title="Remove Group">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleRemoveGroup(record.items)}
            />
          </Tooltip>
        </Space>
      )
    }
  ];

  const availableItemsData = Object.values(groupedSelectedItems);

  return (
    <>
      <Card
        title="Selected Items"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setGroupModalVisible(true)}
            disabled={!groupedItems || groupedItems.length === 0}
          >
            Add Items
          </Button>
        }
      >
        <Table
          dataSource={availableItemsData}
          columns={selectedItemsColumns}
          rowKey={(record) => record.items[0]?.groupKey || Math.random()}
          pagination={false}
          locale={{
            emptyText: 'No items selected. Click "Add Items" to start.'
          }}
        />
      </Card>

      {/* Group Selection Modal */}
      <Modal
        title="Select Items"
        open={groupModalVisible}
        onCancel={() => {
          setGroupModalVisible(false);
          // Reset all filters when modal closes
          setConditionFilter('');
          setCategoryFilter('');
          setCompanyFilter('');
          setModelFilter('');
        }}
        footer={null}
        width={1000}
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
            <Col xs={24} sm={12} md={6}>
              <Text strong>Condition:</Text>
              <Select
                value={conditionFilter}
                onChange={setConditionFilter}
                style={{ width: '100%', marginTop: 4 }}
                placeholder="All conditions"
                allowClear
              >
                <Option value="">All Conditions</Option>
                <Option value="New">New</Option>
                <Option value="Used">Used</Option>
                <Option value="Refurbished">Refurbished</Option>
              </Select>
            </Col>

            <Col xs={24} sm={12} md={6}>
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

            <Col xs={24} sm={12} md={6}>
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

            <Col xs={24} sm={12} md={6}>
              <Text strong>Model:</Text>
              <Select
                value={modelFilter}
                onChange={setModelFilter}
                style={{ width: '100%', marginTop: 4 }}
                placeholder="All models"
                allowClear
                showSearch
                optionFilterProp="children"
                disabled={!companyFilter}
              >
                <Option value="">All Models</Option>
                {models?.map(model => (
                  <Option key={model.id} value={model.id}>
                    {model.name}
                  </Option>
                ))}
              </Select>
            </Col>
          </Row>
        </Card>

        <List
          loading={isLoading}
          dataSource={groupedItems}
          renderItem={(group) => (
            <List.Item
              actions={[
                <Button
                  type="primary"
                  icon={<ShoppingOutlined />}
                  onClick={() => handleAddGroup(group)}
                >
                  Select
                </Button>
              ]}
            >
              <List.Item.Meta
                avatar={
                  <Avatar style={{ backgroundColor: '#1890ff' }}>
                    {group.model.company.name.charAt(0)}
                  </Avatar>
                }
                title={
                  <Space>
                    <Text strong>{group.model.company.name} {group.model.name}</Text>
                    <Tag color="blue">{group.condition}</Tag>
                    <Tag color="green">{group.availableCount} available</Tag>
                  </Space>
                }
                description={
                  <div>
                    <Text type="secondary">{group.category.name}</Text>
                    {group.specifications && Object.keys(group.specifications).length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        {Object.entries(group.specifications).map(([key, value]) => (
                          <Tag key={key} size="small">
                            {key}: {value}
                          </Tag>
                        ))}
                      </div>
                    )}
                    <div style={{ marginTop: 4 }}>
                      <Text strong>{formatPKR(group.samplePrice)}</Text>
                    </div>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </Modal>

      {/* Add Item Configuration Modal */}
      {selectedGroup && (
        <Modal
          title={`Add ${selectedGroup.model?.company.name} ${selectedGroup.model?.name}`}
          open={groupModalVisible && selectedGroup}
          onOk={handleConfirmAdd}
          onCancel={() => {
            setSelectedGroup(null);
            setGroupModalVisible(false);
          }}
          confirmLoading={false}
        >
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <Text strong>Available: </Text>
              <Text>{selectedGroup.availableCount} units</Text>
            </div>

            <div>
              <Text strong>Quantity to add:</Text>
              <InputNumber
                value={quantityToAdd}
                onChange={setQuantityToAdd}
                min={1}
                max={selectedGroup.availableCount}
                style={{ width: '100%', marginTop: 8 }}
              />
            </div>

            <div>
              <Text strong>Assignment Method:</Text>
              <div style={{ marginTop: 8, padding: 8, backgroundColor: '#f6f6f6', borderRadius: 4 }}>
                <Text type="secondary">Items will be automatically assigned using FIFO (First In, First Out) method</Text>
              </div>
            </div>
          </Space>
        </Modal>
      )}

      {/* Serial Numbers Modal */}
      <Modal
        title="Selected Serial Numbers"
        open={serialModalVisible}
        onCancel={() => setSerialModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setSerialModalVisible(false)}>
            Close
          </Button>
        ]}
      >
        {selectedGroup?.groupKey && (
          <List
            dataSource={selectedItems.filter(item => item.groupKey === selectedGroup.groupKey)}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveItem(item.itemId)}
                  >
                    Remove
                  </Button>
                ]}
              >
                <List.Item.Meta
                  title={<Text code>{item.serialNumber}</Text>}
                  description={formatPKR(item.unitPrice)}
                />
              </List.Item>
            )}
          />
        )}
      </Modal>
    </>
  );
};

export default GroupedItemSelector;