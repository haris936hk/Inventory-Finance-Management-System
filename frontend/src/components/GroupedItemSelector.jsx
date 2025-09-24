// ========== src/components/GroupedItemSelector.jsx ==========
import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Select, InputNumber, Modal, List, Avatar,
  Typography, Space, Tag, message, Tooltip, Radio, Divider
} from 'antd';
import {
  PlusOutlined, EyeOutlined, DeleteOutlined, ShoppingOutlined,
  TagOutlined, SettingOutlined
} from '@ant-design/icons';
import { useQuery, useMutation } from 'react-query';
import axios from 'axios';

const { Text } = Typography;
const { Option } = Select;

const GroupedItemSelector = ({ selectedItems, onItemsChange, onTotalChange, onSessionChange }) => {
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [assignmentPreference, setAssignmentPreference] = useState('FIFO');
  const [quantityToAdd, setQuantityToAdd] = useState(1);
  const [serialModalVisible, setSerialModalVisible] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  // Fetch grouped available items
  const { data: groupedItems, isLoading, refetch } = useQuery(
    'groupedItems',
    async () => {
      const response = await axios.get('/inventory/items/grouped');
      return response.data.data;
    }
  );

  // Auto-assign items mutation
  const autoAssignMutation = useMutation(
    (data) => axios.post('/inventory/items/auto-assign', data),
    {
      onSuccess: (response) => {
        const result = response.data.data;
        const sessionId = result.sessionId;
        setCurrentSessionId(sessionId);
        onSessionChange?.(sessionId); // Notify parent about session ID

        // Add selected items to the invoice
        const newItems = result.selectedItems.map(item => ({
          id: item.id,
          itemId: item.id,
          serialNumber: item.serialNumber,
          description: `${result.group.category.name} - ${result.group.model.company.name} ${result.group.model.name}`,
          unitPrice: result.group.samplePrice,
          specifications: result.group.specifications,
          condition: result.group.condition,
          groupKey: `${result.group.modelId}_${result.group.condition}_${JSON.stringify(result.group.specifications || {})}`
        }));

        const updatedItems = [...selectedItems, ...newItems];
        onItemsChange(updatedItems);
        calculateTotal(updatedItems);

        message.success(`Added ${result.selectedItems.length} items to invoice`);
        setGroupModalVisible(false);
        refetch(); // Refresh available items
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Failed to assign items');
      }
    }
  );

  // Calculate total when items change
  const calculateTotal = (items) => {
    const total = items.reduce((sum, item) => sum + (item.unitPrice || 0), 0);
    onTotalChange(total);
  };

  const handleAddGroup = (group) => {
    setSelectedGroup(group);
    setQuantityToAdd(1);
    setGroupModalVisible(true);
  };

  const handleConfirmAdd = () => {
    const groupKey = `${selectedGroup.modelId}_${selectedGroup.condition}_${JSON.stringify(selectedGroup.specifications || {})}`;

    autoAssignMutation.mutate({
      groupKey,
      quantity: quantityToAdd,
      assignmentPreference
    });
  };

  const handleViewSerialNumbers = (groupKey) => {
    // Find all items with the same group key
    const groupItems = selectedItems.filter(item => item.groupKey === groupKey);
    setSelectedGroup({ items: groupItems, groupKey });
    setSerialModalVisible(true);
  };

  const handleRemoveItem = (itemId) => {
    const updatedItems = selectedItems.filter(item => item.itemId !== itemId);
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
        const unitPrice = record.items.length > 0 ? (record.items[0].unitPrice || 0) : 0;
        return (
          <InputNumber
            value={unitPrice}
            onChange={(value) => {
              const newPrice = value || 0;
              // Update all items in this group with the same unit price
              record.items.forEach(item => {
                handlePriceChange(item.itemId, newPrice);
              });
            }}
            min={0}
            precision={2}
            prefix="PKR"
            style={{ width: '100%' }}
            placeholder="0.00"
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
        const unitPrice = record.items.length > 0 ? (record.items[0].unitPrice || 0) : 0;
        const quantity = record.items.length;
        const total = unitPrice * quantity;
        return (
          <Text strong>PKR {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
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
              onClick={() => {
                record.items.forEach(item => handleRemoveItem(item.itemId));
              }}
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
        onCancel={() => setGroupModalVisible(false)}
        footer={null}
        width={800}
      >
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
                      <Text strong>PKR {group.samplePrice.toLocaleString()}</Text>
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
          confirmLoading={autoAssignMutation.isLoading}
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
              <Text strong>Assignment Preference:</Text>
              <Radio.Group
                value={assignmentPreference}
                onChange={(e) => setAssignmentPreference(e.target.value)}
                style={{ width: '100%', marginTop: 8 }}
              >
                <Radio value="FIFO">First In, First Out (FIFO)</Radio>
                <Radio value="LIFO">Last In, First Out (LIFO)</Radio>
                <Radio value="LOWEST_COST">Lowest Cost First</Radio>
                <Radio value="HIGHEST_COST">Highest Cost First</Radio>
              </Radio.Group>
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
        {selectedGroup?.items && (
          <List
            dataSource={selectedGroup.items}
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
                  description={`PKR ${item.unitPrice?.toLocaleString()}`}
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