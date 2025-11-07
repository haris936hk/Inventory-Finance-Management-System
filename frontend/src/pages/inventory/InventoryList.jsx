// ========== src/pages/inventory/InventoryList.jsx ==========
import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Card, Button, Space, Tag, Input, Select, DatePicker,
  Row, Col, Drawer, Descriptions, Badge, Tooltip, message,
  Popconfirm, Modal, Form, Dropdown, Typography, Alert
} from 'antd';
import {
  PlusOutlined, SearchOutlined, FilterOutlined,
  EditOutlined, DeleteOutlined, EyeOutlined, BarcodeOutlined,
  MoreOutlined, ScanOutlined, AppstoreAddOutlined,
  TruckOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import { useAuthStore } from '../../stores/authStore';
import BarcodeScanner from '../../components/BarcodeScanner';
import HandoverModal from '../../components/HandoverModal';
import UpdateRepairedStatusModal from '../../components/UpdateRepairedStatusModal';

const { Search, TextArea } = Input;
const { RangePicker } = DatePicker;
const { Text } = Typography;

const InventoryList = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  
  const [filters, setFilters] = useState({});
  const [searchText, setSearchText] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [handoverModalVisible, setHandoverModalVisible] = useState(false);
  const [repairedModalVisible, setRepairedModalVisible] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [pageSize, setPageSize] = useState(20);
  const [bulkRepairedForm] = Form.useForm();
  const [bulkHandoverForm] = Form.useForm();
  const [bulkRepairedModalVisible, setBulkRepairedModalVisible] = useState(false);
  const [bulkHandoverModalVisible, setBulkHandoverModalVisible] = useState(false);

  // Fetch items
  const { data: itemsResponse, isLoading, error } = useQuery(
    ['items', filters],
    async () => {
      const response = await axios.get('/inventory/items', { params: filters });
      console.log('Items API Response:', response.data);
      return response.data.data;
    },
    {
      onError: (error) => {
        console.error('Error fetching items:', error);
        console.error('Error response:', error.response?.data);
        if (error.response?.status === 403) {
          message.error('You do not have permission to view inventory items');
        } else if (error.response?.status === 401) {
          message.error('Authentication failed. Please login again.');
        } else {
          message.error(error.response?.data?.message || 'Failed to fetch items');
        }
      }
    }
  );

  // Extract items and pagination from the response
  const itemsData = itemsResponse?.items || [];
  const paginationData = itemsResponse?.pagination || { totalCount: 0, page: 1, limit: 100 };

  // Fetch categories for filter (static reference data - cache for 30 minutes)
  const { data: categories } = useQuery(
    'categories',
    async () => {
      const response = await axios.get('/inventory/categories');
      return response.data.data;
    },
    {
      staleTime: 30 * 60 * 1000, // 30 minutes - categories rarely change
    }
  );

  // Fetch companies for filter (static reference data - cache for 30 minutes)
  const { data: companies } = useQuery(
    'companies',
    async () => {
      const response = await axios.get('/inventory/companies');
      return response.data.data;
    },
    {
      staleTime: 30 * 60 * 1000, // 30 minutes - companies rarely change
    }
  );

  // Fetch models for filter (static reference data - cache for 30 minutes)
  const { data: models } = useQuery(
    'models',
    async () => {
      const response = await axios.get('/inventory/models');
      return response.data.data;
    },
    {
      staleTime: 30 * 60 * 1000, // 30 minutes - models rarely change
    }
  );

  // Delete item mutation
  const deleteMutation = useMutation(
    (id) => axios.delete(`/inventory/items/${id}`),
    {
      onSuccess: () => {
        message.success('Item deleted successfully');
        queryClient.invalidateQueries('items');
      },
      onError: () => {
        message.error('Failed to delete item');
      }
    }
  );

  const getInventoryStatusColor = (status) => {
    const colors = {
      'Available': 'success',
      'Reserved': 'warning',
      'Under Repair': 'purple',
      'Sold': 'processing',
      'Delivered': 'success'
    };
    return colors[status] || 'default';
  };

  const getPhysicalStatusColor = (status) => {
    const colors = {
      'In Store': 'green',
      'In Lab': 'cyan',
      'Handover': 'magenta'
    };
    return colors[status] || 'default';
  };

  // PERFORMANCE OPTIMIZATION: Memoize handlers to prevent column recreation
  // Note: These must be defined BEFORE columns since columns references them
  const handleSearch = useCallback((value) => {
    setFilters(prev => ({ ...prev, serialNumber: value }));
  }, []);

  const handleScanResult = useCallback((result) => {
    setScannerVisible(false);
    setFilters(prev => ({ ...prev, serialNumber: result }));
    message.success(`Scanned: ${result}`);
  }, []);

  const handleDelete = useCallback((record) => {
    Modal.confirm({
      title: 'Delete Item',
      content: `Are you sure you want to delete item ${record.serialNumber}?`,
      okText: 'Delete',
      okType: 'danger',
      onOk: () => deleteMutation.mutate(record.id)
    });
  }, [deleteMutation]);

  // PERFORMANCE OPTIMIZATION: Memoize columns to prevent recreation on every render
  const columns = useMemo(() => [
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
      filters: companies?.map(company => ({ text: company.name, value: company.id })),
      onFilter: (value, record) => record.model?.company?.id === value,
    },
    {
      title: 'Model',
      dataIndex: ['model', 'name'],
      key: 'model',
      width: 150,
      filters: models?.map(model => ({ text: model.name, value: model.id })),
      onFilter: (value, record) => record.model?.id === value,
    },
    {
      title: 'Inventory Status',
      dataIndex: 'inventoryStatus',
      key: 'inventoryStatus',
      width: 130,
      filters: [
        { text: 'Available', value: 'Available' },
        { text: 'Reserved', value: 'Reserved' },
        { text: 'Under Repair', value: 'Under Repair' },
        { text: 'Sold', value: 'Sold' },
        { text: 'Delivered', value: 'Delivered' },
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
      ],
      onFilter: (value, record) => {
        if (record.status !== 'In Lab') return false;
        const status = record.repaired || 'No';
        return status === value;
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
        // First check direct customer relationship (for sold/delivered items)
        let displayCustomer = customer;

        // If no direct customer, check if item is in an invoice (reserved or sold)
        if (!displayCustomer && record.invoiceItems && record.invoiceItems.length > 0) {
          displayCustomer = record.invoiceItems[0].invoice?.customer;
        }

        if (!displayCustomer) {
          return '-';
        }

        return (
          <Tooltip title={`${displayCustomer.phone || ''} ${displayCustomer.company || ''}`}>
            {displayCustomer.name}
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
        const canUpdateRepaired = isInLab && (record.repaired === 'No' || record.repaired === null);

        const menuItems = [
          {
            key: 'view',
            label: 'View Details',
            icon: <EyeOutlined />,
            onClick: () => {
              setSelectedItem(record);
              setDrawerVisible(true);
            }
          },
          {
            key: 'handover',
            label: 'Handover',
            icon: <TruckOutlined />,
            onClick: () => {
              setSelectedItem(record);
              setHandoverModalVisible(true);
            },
            disabled: !hasPermission('inventory.edit') || isReturned
          },
          ...(canUpdateRepaired ? [{
            key: 'repaired',
            label: 'Update Repaired Status',
            icon: <EditOutlined />,
            onClick: () => {
              setSelectedItem(record);
              setRepairedModalVisible(true);
            },
            disabled: !hasPermission('inventory.edit')
          }] : []),
          {
            type: 'divider'
          },
          {
            key: 'delete',
            label: 'Delete',
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => handleDelete(record),
            disabled: !hasPermission('inventory.delete') || isSold
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
            {hasPermission('inventory.edit') && !isReturned && (
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
  ], [categories, companies, models, navigate, hasPermission, handleDelete]);

  // Get selected items data
  const selectedItems = itemsData?.filter(item => selectedRowKeys.includes(item.id)) || [];

  // Calculate eligible items for each bulk action
  const eligibleForRepairUpdate = selectedItems.filter(item =>
    item.status === 'In Lab' && (item.repaired === 'No' || item.repaired === null)
  );

  const eligibleForHandover = selectedItems.filter(item =>
    (item.inventoryStatus === 'Reserved' || item.inventoryStatus === 'Sold') &&
    item.repaired !== 'Returned' &&
    item.repaired !== 'No'
  );

  const eligibleForDelete = selectedItems.filter(item =>
    item.inventoryStatus !== 'Sold' && item.inventoryStatus !== 'Delivered'
  );

  // Bulk action handlers
  const handleBulkRepairedUpdate = () => {
    if (eligibleForRepairUpdate.length === 0) {
      message.warning('No eligible items selected for repaired status update');
      return;
    }
    setBulkRepairedModalVisible(true);
  };

  const handleBulkRepairedSubmit = async (values) => {
    try {
      await Promise.all(eligibleForRepairUpdate.map(item =>
        axios.put(`/inventory/items/${item.serialNumber}/repaired-status`, {
          repairedStatus: values.repairedStatus,
          notes: values.notes
        })
      ));
      message.success(`Successfully updated repaired status for ${eligibleForRepairUpdate.length} item(s)`);
      queryClient.invalidateQueries('items');
      setBulkRepairedModalVisible(false);
      bulkRepairedForm.resetFields();
      setSelectedRowKeys([]);
    } catch (error) {
      message.error('Failed to update some items');
    }
  };

  const handleBulkHandover = () => {
    if (eligibleForHandover.length === 0) {
      message.warning('No eligible items selected for handover');
      return;
    }
    setBulkHandoverModalVisible(true);
  };

  const handleBulkHandoverSubmit = async (values) => {
    try {
      await Promise.all(eligibleForHandover.map(item =>
        axios.put(`/inventory/items/${item.serialNumber}/status`, {
          status: 'Handover',
          handoverTo: values.handoverTo,
          handoverToNIC: values.handoverToNIC,
          handoverToPhone: values.handoverToPhone,
          handoverDetails: values.handoverDetails,
          notes: values.notes
        })
      ));
      message.success(`Successfully handed over ${eligibleForHandover.length} item(s)`);
      queryClient.invalidateQueries('items');
      setBulkHandoverModalVisible(false);
      bulkHandoverForm.resetFields();
      setSelectedRowKeys([]);
    } catch (error) {
      message.error('Failed to handover some items');
    }
  };

  const handleBulkDelete = () => {
    if (eligibleForDelete.length === 0) {
      message.warning('No eligible items selected for deletion');
      return;
    }

    Modal.confirm({
      title: 'Bulk Delete Items',
      content: `Are you sure you want to delete ${eligibleForDelete.length} item(s)? ${selectedItems.length - eligibleForDelete.length > 0 ? `\n\n(${selectedItems.length - eligibleForDelete.length} sold/delivered item(s) will be skipped)` : ''}`,
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          await Promise.all(eligibleForDelete.map(item =>
            axios.delete(`/inventory/items/${item.id}`)
          ));
          message.success(`Successfully deleted ${eligibleForDelete.length} item(s)`);
          queryClient.invalidateQueries('items');
          setSelectedRowKeys([]);
        } catch (error) {
          message.error('Failed to delete some items');
        }
      }
    });
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
  };

  return (
    <>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Row gutter={[8, 8]} align="middle">
            <Col xs={24} sm={12} md={8} lg={5}>
              <Search
                placeholder="Search by serial number"
                allowClear
                enterButton={<SearchOutlined />}
                onSearch={handleSearch}
                addonAfter={
                  <Button
                    type="text"
                    icon={<ScanOutlined />}
                    onClick={() => setScannerVisible(true)}
                  />
                }
              />
            </Col>

            <Col xs={12} sm={6} md={4} lg={3}>
              <Select
                placeholder="Category"
                allowClear
                style={{ width: '100%' }}
                onChange={(value) => setFilters({ ...filters, categoryId: value })}
              >
                {categories?.map(cat => (
                  <Select.Option key={cat.id} value={cat.id}>
                    {cat.name}
                  </Select.Option>
                ))}
              </Select>
            </Col>

            <Col xs={12} sm={6} md={4} lg={3}>
              <Select
                placeholder="Status"
                allowClear
                style={{ width: '100%' }}
                onChange={(value) => setFilters({ ...filters, status: value })}
              >
                <Select.Option value="In Store">In Store</Select.Option>
                <Select.Option value="In Lab">In Lab</Select.Option>
                <Select.Option value="Handover">Handover</Select.Option>
              </Select>
            </Col>

            <Col xs={24} sm={12} md={8} lg={5}>
              <RangePicker
                style={{ width: '100%' }}
                onChange={(dates) => {
                  if (dates) {
                    setFilters({
                      ...filters,
                      inboundFrom: dates[0].toISOString(),
                      inboundTo: dates[1].toISOString()
                    });
                  } else {
                    const { inboundFrom, inboundTo, ...rest } = filters;
                    setFilters(rest);
                  }
                }}
              />
            </Col>

            <Col xs={24} sm={24} md={24} lg={8} style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Space wrap>
                {hasPermission('inventory.create') && (
                  <>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => navigate('/app/inventory/items/add')}
                    >
                      Add Item
                    </Button>
                    <Button
                      type="default"
                      icon={<AppstoreAddOutlined />}
                      onClick={() => navigate('/app/inventory/items/bulk-add')}
                    >
                      Bulk Add
                    </Button>
                  </>
                )}
              </Space>
            </Col>
          </Row>
        </div>

        {/* Bulk Actions Bar */}
        {selectedRowKeys.length > 0 && (
          <div style={{ marginBottom: 16, padding: 12, background: '#e6f7ff', borderRadius: 4, border: '1px solid #91d5ff' }}>
            <Row align="middle" justify="space-between">
              <Col>
                <Space>
                  <Text strong>{selectedRowKeys.length} item(s) selected</Text>
                  <Button size="small" onClick={() => setSelectedRowKeys([])}>Clear Selection</Button>
                </Space>
              </Col>
              <Col>
                <Space>
                  {hasPermission('inventory.edit') && eligibleForRepairUpdate.length > 0 && (
                    <Button
                      icon={<EditOutlined />}
                      onClick={handleBulkRepairedUpdate}
                    >
                      Update Repaired Status ({eligibleForRepairUpdate.length})
                    </Button>
                  )}
                  {hasPermission('inventory.edit') && eligibleForHandover.length > 0 && (
                    <Button
                      icon={<TruckOutlined />}
                      onClick={handleBulkHandover}
                    >
                      Handover ({eligibleForHandover.length})
                    </Button>
                  )}
                  {hasPermission('inventory.delete') && eligibleForDelete.length > 0 && (
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={handleBulkDelete}
                    >
                      Delete ({eligibleForDelete.length})
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
          scroll={{ x: 1800 }}
          pagination={{
            current: paginationData.page,
            pageSize: paginationData.limit,
            total: paginationData.totalCount,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} items`,
            onChange: (page, limit) => {
              setFilters({ ...filters, page, limit });
            },
            onShowSizeChange: (current, size) => {
              setFilters({ ...filters, page: 1, limit: size });
            },
          }}
          locale={{
            emptyText: error
              ? `Error loading items: ${error.response?.data?.message || error.message || 'Unknown error'}`
              : 'No items found'
          }}
        />
      </Card>

      {/* Item Details Drawer */}
      <Drawer
        title="Item Details"
        placement="right"
        width={600}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
      >
        {selectedItem && (
          <>
            <Descriptions bordered column={1}>
              <Descriptions.Item label="Serial Number">
                <Badge status="processing" text={selectedItem.serialNumber} />
              </Descriptions.Item>
              <Descriptions.Item label="Category">
                {selectedItem.category.name}
              </Descriptions.Item>
              <Descriptions.Item label="Company">
                {selectedItem.model?.company.name}
              </Descriptions.Item>
              <Descriptions.Item label="Model">
                {selectedItem.model?.name}
              </Descriptions.Item>
              <Descriptions.Item label="Inventory Status">
                <Tag color={getInventoryStatusColor(selectedItem.inventoryStatus || 'Available')}>
                  {selectedItem.inventoryStatus || 'Available'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Physical Status">
                <Tag color={getPhysicalStatusColor(selectedItem.status)}>
                  {selectedItem.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Condition">
                <Tag color={selectedItem.condition === 'New' ? 'green' : 'orange'}>
                  {selectedItem.condition}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Purchase Price">
                PKR {selectedItem.purchasePrice || '-'}
              </Descriptions.Item>
              {selectedItem.sellingPrice && (
                <Descriptions.Item label="Selling Price">
                  PKR {selectedItem.sellingPrice}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Vendor">
                {selectedItem.vendor?.name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Inbound Date">
                {new Date(selectedItem.inboundDate).toLocaleDateString()}
              </Descriptions.Item>
              {selectedItem.outboundDate && (
                <Descriptions.Item label="Outbound Date">
                  {new Date(selectedItem.outboundDate).toLocaleDateString()}
                </Descriptions.Item>
              )}
            </Descriptions>

            {selectedItem.specifications && (
              <>
                <h3 style={{ marginTop: 24 }}>Specifications</h3>
                <Descriptions bordered column={1}>
                  {Object.entries(selectedItem.specifications).map(([key, value]) => (
                    <Descriptions.Item key={key} label={key}>
                      {value}
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              </>
            )}

            {selectedItem.customer && (
              <>
                <h3 style={{ marginTop: 24 }}>Customer Information</h3>
                <Descriptions bordered column={1}>
                  <Descriptions.Item label="Name">
                    {selectedItem.customer.name}
                  </Descriptions.Item>
                  {selectedItem.customer.company && (
                    <Descriptions.Item label="Company">
                      {selectedItem.customer.company}
                    </Descriptions.Item>
                  )}
                  {selectedItem.customer.phone && (
                    <Descriptions.Item label="Phone">
                      {selectedItem.customer.phone}
                    </Descriptions.Item>
                  )}
                  {selectedItem.customer.email && (
                    <Descriptions.Item label="Email">
                      {selectedItem.customer.email}
                    </Descriptions.Item>
                  )}
                  {selectedItem.customer.nic && (
                    <Descriptions.Item label="NIC">
                      {selectedItem.customer.nic}
                    </Descriptions.Item>
                  )}
                  {selectedItem.customer.address && (
                    <Descriptions.Item label="Address">
                      {selectedItem.customer.address}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </>
            )}

            {selectedItem.handoverTo && (
              <>
                <h3 style={{ marginTop: 24 }}>Handover Details</h3>
                <Descriptions bordered column={1}>
                  <Descriptions.Item label="Handed To">
                    {selectedItem.handoverTo}
                  </Descriptions.Item>
                  <Descriptions.Item label="Handed By">
                    {selectedItem.handoverByUser?.fullName}
                  </Descriptions.Item>
                  {selectedItem.handoverDetails && (
                    <Descriptions.Item label="Details">
                      {selectedItem.handoverDetails}
                    </Descriptions.Item>
                  )}
                  {selectedItem.handoverDate && (
                    <Descriptions.Item label="Date">
                      {new Date(selectedItem.handoverDate).toLocaleDateString()}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </>
            )}

            <div style={{ marginTop: 24 }}>
              <Space>
                <Button 
                  type="primary"
                  onClick={() => navigate(`/app/inventory/items/${selectedItem.serialNumber}`)}
                >
                  View Full Details
                </Button>
                {hasPermission('inventory.edit') && selectedItem?.repaired !== 'Returned' && (
                  <>
                    <Button onClick={() => {
                      setHandoverModalVisible(true);
                      setDrawerVisible(false);
                    }}>
                      Handover
                    </Button>
                    {selectedItem?.status === 'In Lab' && (selectedItem?.repaired === 'No' || selectedItem?.repaired === null) && (
                      <Button onClick={() => {
                        setRepairedModalVisible(true);
                        setDrawerVisible(false);
                      }}>
                        Update Repaired Status
                      </Button>
                    )}
                  </>
                )}
              </Space>
            </div>
          </>
        )}
      </Drawer>

      {/* Barcode Scanner Modal */}
      <BarcodeScanner
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScan={handleScanResult}
      />

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

      {/* Bulk Update Repaired Status Modal */}
      <Modal
        title={`Bulk Update Repaired Status - ${eligibleForRepairUpdate.length} Item(s)`}
        open={bulkRepairedModalVisible}
        onCancel={() => {
          setBulkRepairedModalVisible(false);
          bulkRepairedForm.resetFields();
        }}
        onOk={() => bulkRepairedForm.submit()}
        okText="Update All"
        width={600}
      >
        <Form
          form={bulkRepairedForm}
          layout="vertical"
          onFinish={handleBulkRepairedSubmit}
        >
          {selectedItems.length - eligibleForRepairUpdate.length > 0 && (
            <Alert
              message={`${selectedItems.length - eligibleForRepairUpdate.length} item(s) will be skipped`}
              description="Only items with 'In Lab' status and repaired status 'No' can be updated."
              type="warning"
              style={{ marginBottom: 16 }}
              showIcon
            />
          )}

          <Form.Item
            label="Repaired Status"
            name="repairedStatus"
            rules={[{ required: true, message: 'Please select repaired status' }]}
          >
            <Select placeholder="Select status">
              <Select.Option value="Yes">Yes - Repaired Successfully</Select.Option>
              <Select.Option value="Returned">Returned - Cannot be Repaired</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="Notes"
            name="notes"
          >
            <TextArea rows={3} placeholder="Optional notes for all items" />
          </Form.Item>

          <Alert
            message="Items to be updated:"
            description={
              <div style={{ maxHeight: 200, overflow: 'auto' }}>
                {eligibleForRepairUpdate.map(item => (
                  <div key={item.id}>• {item.serialNumber} - {item.model?.name}</div>
                ))}
              </div>
            }
            type="info"
            showIcon
          />
        </Form>
      </Modal>

      {/* Bulk Handover Modal */}
      <Modal
        title={`Bulk Handover - ${eligibleForHandover.length} Item(s)`}
        open={bulkHandoverModalVisible}
        onCancel={() => {
          setBulkHandoverModalVisible(false);
          bulkHandoverForm.resetFields();
        }}
        onOk={() => bulkHandoverForm.submit()}
        okText="Process Handover"
        width={700}
      >
        <Form
          form={bulkHandoverForm}
          layout="vertical"
          onFinish={handleBulkHandoverSubmit}
        >
          {selectedItems.length - eligibleForHandover.length > 0 && (
            <Alert
              message={`${selectedItems.length - eligibleForHandover.length} item(s) will be skipped`}
              description="Items with 'Returned' repaired status cannot be handed over."
              type="warning"
              style={{ marginBottom: 16 }}
              showIcon
            />
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Handover To (Name)"
                name="handoverTo"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="Recipient name" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Phone Number"
                name="handoverToPhone"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="Contact number" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="NIC (Optional)"
            name="handoverToNIC"
          >
            <Input placeholder="National ID" />
          </Form.Item>

          <Form.Item
            label="Handover Details"
            name="handoverDetails"
          >
            <TextArea rows={2} placeholder="Transport details, vehicle info, etc." />
          </Form.Item>

          <Form.Item
            label="Notes"
            name="notes"
          >
            <TextArea rows={2} placeholder="Additional notes" />
          </Form.Item>

          <Alert
            message="Items to be handed over:"
            description={
              <div style={{ maxHeight: 150, overflow: 'auto' }}>
                {eligibleForHandover.map(item => (
                  <div key={item.id}>• {item.serialNumber} - {item.model?.name}</div>
                ))}
              </div>
            }
            type="info"
            showIcon
          />
        </Form>
      </Modal>
    </>
  );
};

export default InventoryList;