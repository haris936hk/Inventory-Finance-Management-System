// ========== src/pages/inventory/InventoryList.jsx ==========
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Card, Button, Space, Tag, Input,
  Row, Col, Tooltip, message,
  Modal, Dropdown
} from 'antd';
import {
  PlusOutlined, SearchOutlined,
  EditOutlined, DeleteOutlined, EyeOutlined,
  MoreOutlined, AppstoreAddOutlined,
  TruckOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import { useAuthStore } from '../../stores/authStore';
import HandoverModal from '../../components/HandoverModal';
import UpdateRepairedStatusModal from '../../components/UpdateRepairedStatusModal';
import BulkHandoverModal from '../../components/BulkHandoverModal';
import BulkRepairedStatusModal from '../../components/BulkRepairedStatusModal';
import { getErrorMessage } from '../../utils/errorMessages';

const { Search } = Input;

const InventoryList = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  
  const [filters, setFilters] = useState({});
  const [searchText, setSearchText] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [handoverModalVisible, setHandoverModalVisible] = useState(false);
  const [repairedModalVisible, setRepairedModalVisible] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [pageSize, setPageSize] = useState(20);
  const [bulkHandoverModalVisible, setBulkHandoverModalVisible] = useState(false);
  const [bulkRepairedModalVisible, setBulkRepairedModalVisible] = useState(false);

  // Fetch items
  const { data: itemsData, isLoading } = useQuery(
    ['items', filters],
    async () => {
      const response = await axios.get('/inventory/items', { params: filters });
      return response.data.data;
    }
  );

  // Fetch categories for filter
  const { data: categories } = useQuery('categories', async () => {
    const response = await axios.get('/inventory/categories');
    return response.data.data;
  });

  // Fetch companies for filter
  const { data: companies } = useQuery('companies', async () => {
    const response = await axios.get('/inventory/companies');
    return response.data.data;
  });

  // Delete item mutation
  const deleteMutation = useMutation(
    (id) => axios.delete(`/inventory/items/${id}`),
    {
      onSuccess: () => {
        message.success('Item deleted successfully');
        queryClient.invalidateQueries('items');
      },
      onError: (error) => {
        const errorMessage = getErrorMessage(error, 'item', 'delete');
        message.error(errorMessage);
      }
    }
  );

  const getInventoryStatusColor = (status) => {
    const colors = {
      'Available': 'success',
      'Reserved': 'warning',
      'Sold': 'processing',
      'Delivered': 'success',
      'Under Repair': 'orange',
      'Returned': 'error'
    };
    return colors[status] || 'default';
  };

  const getPhysicalStatusColor = (status) => {
    const colors = {
      'In Store': 'green',
      'In Lab': 'cyan',
      'Handover': 'magenta',
      'Returned': 'red'
    };
    return colors[status] || 'default';
  };

  const columns = [
    {
      title: 'Serial Number',
      dataIndex: 'serialNumber',
      key: 'serialNumber',
      fixed: 'left',
      width: 150,
      render: (text, record) => (
        <Button 
          type="link" 
          onClick={() => navigate(`/app/inventory/items/${text}`)}
        >
          {text}
        </Button>
      )
    },
    {
      title: 'Category',
      dataIndex: ['category', 'name'],
      key: 'category',
      width: 120,
      filters: categories?.map(cat => ({ text: cat.name, value: cat.id })),
      onFilter: (value, record) => record.category.id === value,
    },
    {
      title: 'Company',
      dataIndex: ['model', 'company', 'name'],
      key: 'company',
      width: 120,
    },
    {
      title: 'Model',
      dataIndex: ['model', 'name'],
      key: 'model',
      width: 150,
    },
    {
      title: 'Inventory Status',
      dataIndex: 'inventoryStatus',
      key: 'inventoryStatus',
      width: 130,
      filters: [
        { text: 'Available', value: 'Available' },
        { text: 'Reserved', value: 'Reserved' },
        { text: 'Sold', value: 'Sold' },
        { text: 'Delivered', value: 'Delivered' },
        { text: 'Under Repair', value: 'Under Repair' },
        { text: 'Returned', value: 'Returned' },
      ],
      onFilter: (value, record) => (record.inventoryStatus || 'Available') === value,
      render: (status) => (
        <Tag color={getInventoryStatusColor(status || 'Available')}>
          {status || 'Available'}
        </Tag>
      )
    },
    {
      title: 'Physical Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      filters: [
        { text: 'In Store', value: 'In Store' },
        { text: 'In Lab', value: 'In Lab' },
        { text: 'Handover', value: 'Handover' },
        { text: 'Returned', value: 'Returned' },
      ],
      onFilter: (value, record) => record.status === value,
      render: (status) => (
        <Tag color={getPhysicalStatusColor(status)}>{status}</Tag>
      )
    },
    {
      title: 'Repaired Status',
      dataIndex: 'repaired',
      key: 'repaired',
      width: 130,
      filters: [
        { text: 'No', value: 'No' },
        { text: 'Yes', value: 'Yes' },
        { text: 'Returned', value: 'Returned' },
        { text: 'N/A', value: 'N/A' },
      ],
      onFilter: (value, record) => {
        if (record.status !== 'In Lab') {
          return value === 'N/A';
        }
        return (record.repaired || 'No') === value;
      },
      render: (repaired, record) => {
        if (record.status !== 'In Lab') return '-';
        const status = repaired || 'No';
        const colors = {
          'No': 'orange',
          'Yes': 'green',
          'Returned': 'red'
        };
        return <Tag color={colors[status]}>{status}</Tag>;
      }
    },
    {
      title: 'Condition',
      dataIndex: 'condition',
      key: 'condition',
      width: 100,
      filters: [
        { text: 'New', value: 'New' },
        { text: 'Used', value: 'Used' },
      ],
      onFilter: (value, record) => record.condition === value,
      render: (condition) => (
        <Tag color={condition === 'New' ? 'green' : 'orange'}>{condition}</Tag>
      )
    },
    {
      title: 'Purchase Price',
      dataIndex: 'purchasePrice',
      key: 'purchasePrice',
      width: 120,
      render: (price) => price ? `PKR ${price}` : '-',
      sorter: (a, b) => (a.purchasePrice || 0) - (b.purchasePrice || 0),
    },
    {
      title: 'Selling Price',
      dataIndex: 'sellingPrice',
      key: 'sellingPrice',
      width: 120,
      render: (price) => price ? `PKR ${price}` : '-',
      sorter: (a, b) => (a.sellingPrice || 0) - (b.sellingPrice || 0),
    },
    {
      title: 'Customer',
      dataIndex: 'customer',
      key: 'customer',
      width: 150,
      render: (customer, record) => {
        if (!customer) {
          // Show reservation info if available
          if (record.reservedBy || record.reservedForType) {
            return (
              <Tooltip title={`Reserved ${record.reservedForType ? 'for ' + record.reservedForType : ''}`}>
                <Tag color="orange" size="small">Reserved</Tag>
              </Tooltip>
            );
          }
          return '-';
        }
        return (
          <Tooltip title={`${customer.phone || ''} ${customer.company || ''}`}>
            {customer.name}
          </Tooltip>
        );
      }
    },
    {
      title: 'Vendor',
      dataIndex: 'vendor',
      key: 'vendor',
      width: 150,
      render: (vendor, record) => {
        if (!vendor) return '-';
        return (
          <Tooltip title={vendor.phone || vendor.email || ''}>
            {vendor.name}
          </Tooltip>
        );
      }
    },
    {
      title: 'Inbound Date',
      dataIndex: 'inboundDate',
      key: 'inboundDate',
      width: 120,
      render: (date) => new Date(date).toLocaleDateString(),
      sorter: (a, b) => new Date(a.inboundDate) - new Date(b.inboundDate),
    },
    {
      title: 'Outbound Date',
      dataIndex: 'outboundDate',
      key: 'outboundDate',
      width: 120,
      render: (date) => date ? new Date(date).toLocaleDateString() : '-',
      sorter: (a, b) => {
        if (!a.outboundDate && !b.outboundDate) return 0;
        if (!a.outboundDate) return 1;
        if (!b.outboundDate) return -1;
        return new Date(a.outboundDate) - new Date(b.outboundDate);
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 120,
      render: (_, record) => {
        const isAvailable = (record.inventoryStatus || 'Available') === 'Available';
        const isSold = (record.inventoryStatus === 'Sold' || record.inventoryStatus === 'Delivered');
        const isInLab = record.status === 'In Lab';
        const isReturned = record.repaired === 'Returned';
        const isReserved = record.inventoryStatus === 'Reserved';
        // CRITICAL: Items with Reserved, Sold, or Delivered status cannot be deleted
        const isNotDeletable = ['Reserved', 'Sold', 'Delivered'].includes(record.inventoryStatus);

        const menuItems = [
          ...(isReserved ? [{
            key: 'handover',
            label: 'Handover',
            icon: <TruckOutlined />,
            onClick: () => {
              setSelectedItem(record);
              setHandoverModalVisible(true);
            },
            disabled: !hasPermission('inventory.edit')
          }] : []),
          ...(record.inventoryStatus === 'Under Repair' && record.status === 'In Lab' && record.repaired === 'No' ? [{
            key: 'repaired',
            label: 'Update Repaired Status',
            icon: <EditOutlined />,
            onClick: () => {
              setSelectedItem(record);
              setRepairedModalVisible(true);
            },
            disabled: !hasPermission('inventory.edit')
          }] : []),
          ...(isReserved || (record.inventoryStatus === 'Under Repair' && record.status === 'In Lab' && record.repaired === 'No') ? [{
            type: 'divider'
          }] : []),
          {
            key: 'delete',
            label: 'Delete',
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => handleDelete(record),
            disabled: !hasPermission('inventory.delete') || isNotDeletable
          }
        ];

        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/app/inventory/items/${record.serialNumber}`)}
            />
            {hasPermission('inventory.edit') && isReserved && (
              <Button
                type="link"
                size="small"
                icon={<TruckOutlined />}
                onClick={() => {
                  setSelectedItem(record);
                  setHandoverModalVisible(true);
                }}
                title="Handover"
              />
            )}
            <Dropdown menu={{ items: menuItems }} trigger={['click']}>
              <Button type="text" size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        );
      }
    }
  ];

  const handleSearch = (value) => {
    setFilters({ ...filters, serialNumber: value });
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: 'Delete Item',
      content: `Are you sure you want to delete item ${record.serialNumber}?`,
      okText: 'Delete',
      okType: 'danger',
      onOk: () => deleteMutation.mutate(record.id)
    });
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
  };

  // Get selected items data
  const selectedItems = itemsData?.filter(item => selectedRowKeys.includes(item.id)) || [];

  // Bulk action validation
  const canBulkHandover = selectedItems.length > 0 &&
    selectedItems.every(item => item.inventoryStatus === 'Reserved');

  const canBulkUpdateRepaired = selectedItems.length > 0 &&
    selectedItems.every(item =>
      item.inventoryStatus === 'Under Repair' &&
      item.status === 'In Lab' &&
      item.repaired === 'No'
    );

  const canBulkDelete = selectedItems.length > 0 &&
    selectedItems.every(item =>
      !['Reserved', 'Sold', 'Delivered'].includes(item.inventoryStatus)
    );

  // Bulk delete handler
  const handleBulkDelete = () => {
    Modal.confirm({
      title: 'Delete Items',
      content: `Are you sure you want to delete ${selectedItems.length} item(s)?`,
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          await Promise.all(selectedItems.map(item =>
            axios.delete(`/inventory/items/${item.id}`)
          ));
          message.success(`${selectedItems.length} item(s) deleted successfully`);
          queryClient.invalidateQueries('items');
          setSelectedRowKeys([]);
        } catch (error) {
          const errorMessage = getErrorMessage(error, 'item', 'delete');
          message.error(errorMessage);
        }
      }
    });
  };

  // Bulk handover handler
  const handleBulkHandover = () => {
    if (selectedItems.length === 1) {
      setSelectedItem(selectedItems[0]);
      setHandoverModalVisible(true);
    } else {
      // For multiple items, we'll use a bulk modal
      setBulkHandoverModalVisible(true);
    }
  };

  // Bulk repair status update handler
  const handleBulkRepairUpdate = () => {
    if (selectedItems.length === 1) {
      setSelectedItem(selectedItems[0]);
      setRepairedModalVisible(true);
    } else {
      // For multiple items, we'll use a bulk modal
      setBulkRepairedModalVisible(true);
    }
  };

  return (
    <>
      <style>
        {`
          .returned-item-row {
            opacity: 0.5;
            background-color: #f5f5f5;
          }
          .returned-item-row td:first-child {
            text-decoration: line-through;
          }
        `}
      </style>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Row gutter={[8, 8]} align="middle" justify="space-between">
            <Col xs={24} sm={12} md={8}>
              <Search
                placeholder="Search by serial number"
                allowClear
                enterButton={<SearchOutlined />}
                onSearch={handleSearch}
              />
            </Col>

            <Col xs={24} sm={12} md={8} style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Space wrap>
                {hasPermission('inventory.create') && (
                  <>
                    <Button
                      type="default"
                      icon={<AppstoreAddOutlined />}
                      onClick={() => navigate('/app/inventory/items/bulk-add')}
                    >
                      Bulk Add
                    </Button>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => navigate('/app/inventory/items/add')}
                    >
                      Add Item
                    </Button>
                  </>
                )}
              </Space>
            </Col>
          </Row>
        </div>

        {/* Bulk Actions Bar */}
        {selectedRowKeys.length > 0 && (
          <div style={{
            marginBottom: 16,
            padding: '12px 16px',
            background: '#e6f7ff',
            border: '1px solid #91d5ff',
            borderRadius: '4px'
          }}>
            <Row align="middle" justify="space-between">
              <Col>
                <Space>
                  <span style={{ fontWeight: 500 }}>
                    {selectedRowKeys.length} item(s) selected
                  </span>
                  <Button
                    size="small"
                    onClick={() => setSelectedRowKeys([])}
                  >
                    Clear Selection
                  </Button>
                </Space>
              </Col>
              <Col>
                <Space>
                  {hasPermission('inventory.edit') && canBulkHandover && (
                    <Button
                      type="primary"
                      icon={<TruckOutlined />}
                      onClick={handleBulkHandover}
                    >
                      Handover ({selectedRowKeys.length})
                    </Button>
                  )}
                  {hasPermission('inventory.edit') && canBulkUpdateRepaired && (
                    <Button
                      type="primary"
                      icon={<EditOutlined />}
                      onClick={handleBulkRepairUpdate}
                    >
                      Update Repaired Status ({selectedRowKeys.length})
                    </Button>
                  )}
                  {hasPermission('inventory.delete') && canBulkDelete && (
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={handleBulkDelete}
                    >
                      Delete ({selectedRowKeys.length})
                    </Button>
                  )}
                </Space>
              </Col>
            </Row>
          </div>
        )}

        <Table
          rowKey="id"
          columns={columns}
          dataSource={itemsData}
          loading={isLoading}
          rowSelection={rowSelection}
          rowClassName={(record) => record.repaired === 'Returned' ? 'returned-item-row' : ''}
          scroll={{ x: 1800 }}
          pagination={{
            total: itemsData?.length || 0,
            pageSize: pageSize,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} items`,
            onShowSizeChange: (current, size) => setPageSize(size),
          }}
        />
      </Card>

      {/* Handover Modal */}
      <HandoverModal
        visible={handoverModalVisible}
        item={selectedItem}
        onClose={() => {
          setHandoverModalVisible(false);
          setSelectedItem(null);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries('items');
          setHandoverModalVisible(false);
          setSelectedItem(null);
        }}
      />

      {/* Update Repaired Status Modal */}
      <UpdateRepairedStatusModal
        visible={repairedModalVisible}
        item={selectedItem}
        onClose={() => {
          setRepairedModalVisible(false);
          setSelectedItem(null);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries('items');
          setRepairedModalVisible(false);
          setSelectedItem(null);
        }}
      />

      {/* Bulk Handover Modal */}
      <BulkHandoverModal
        visible={bulkHandoverModalVisible}
        items={selectedItems}
        onClose={() => {
          setBulkHandoverModalVisible(false);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries('items');
          setBulkHandoverModalVisible(false);
          setSelectedRowKeys([]);
        }}
      />

      {/* Bulk Repaired Status Modal */}
      <BulkRepairedStatusModal
        visible={bulkRepairedModalVisible}
        items={selectedItems}
        onClose={() => {
          setBulkRepairedModalVisible(false);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries('items');
          setBulkRepairedModalVisible(false);
          setSelectedRowKeys([]);
        }}
      />
    </>
  );
};

export default InventoryList;