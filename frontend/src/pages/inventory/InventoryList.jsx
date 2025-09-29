// ========== src/pages/inventory/InventoryList.jsx ==========
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Table, Card, Button, Space, Tag, Input, Select, DatePicker, 
  Row, Col, Drawer, Descriptions, Badge, Tooltip, message,
  Popconfirm, Modal, Form, Dropdown
} from 'antd';
import {
  PlusOutlined, SearchOutlined, FilterOutlined, ExportOutlined,
  EditOutlined, DeleteOutlined, EyeOutlined, BarcodeOutlined,
  PrinterOutlined, MoreOutlined, ScanOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import { useAuthStore } from '../../stores/authStore';
import BarcodeScanner from '../../components/BarcodeScanner';
import UpdateStatusModal from '../../components/UpdateStatusModal';

const { Search } = Input;
const { RangePicker } = DatePicker;

const InventoryList = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  
  const [filters, setFilters] = useState({});
  const [searchText, setSearchText] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

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
      onError: () => {
        message.error('Failed to delete item');
      }
    }
  );

  const getInventoryStatusColor = (status) => {
    const colors = {
      'Available': 'success',
      'Reserved': 'warning',
      'Sold': 'processing',
      'Delivered': 'success'
    };
    return colors[status] || 'default';
  };

  const getPhysicalStatusColor = (status) => {
    const colors = {
      'In Store': 'green',
      'In Hand': 'blue',
      'In Lab': 'cyan',
      'Sold': 'orange',
      'Delivered': 'purple',
      'Handover': 'magenta'
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
        { text: 'In Hand', value: 'In Hand' },
        { text: 'In Lab', value: 'In Lab' },
        { text: 'Sold', value: 'Sold' },
        { text: 'Delivered', value: 'Delivered' },
        { text: 'Handover', value: 'Handover' },
      ],
      onFilter: (value, record) => record.status === value,
      render: (status) => (
        <Tag color={getPhysicalStatusColor(status)}>{status}</Tag>
      )
    },
    {
      title: 'Condition',
      dataIndex: 'condition',
      key: 'condition',
      width: 100,
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
      title: 'Customer',
      dataIndex: 'customer',
      key: 'customer',
      width: 150,
      render: (customer, record) => {
        // If there's a direct customer relationship (sold/delivered)
        if (customer) {
          return (
            <Tooltip title={`${customer.phone || ''} ${customer.company || ''}`}>
              {customer.name}
            </Tooltip>
          );
        }

        // If item is reserved for a customer (via invoice)
        if (record.reservedCustomer) {
          return (
            <Tooltip title={`Reserved for Invoice - ${record.reservedCustomer.phone || ''} ${record.reservedCustomer.company || ''}`}>
              <Tag color="orange" size="small">
                {record.reservedCustomer.name}
              </Tag>
            </Tooltip>
          );
        }

        // If item is reserved but no customer info available
        if (record.reservedBy || record.reservedForType) {
          return (
            <Tooltip title={`Reserved ${record.reservedForType ? 'for ' + record.reservedForType : ''}`}>
              <Tag color="orange" size="small">Reserved</Tag>
            </Tooltip>
          );
        }

        return '-';
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
            key: 'edit',
            label: 'Update Status',
            icon: <EditOutlined />,
            onClick: () => {
              setSelectedItem(record);
              setStatusModalVisible(true);
            },
            disabled: !hasPermission('inventory.edit')
          },
          {
            key: 'print',
            label: 'Print Label',
            icon: <PrinterOutlined />,
            onClick: () => handlePrintLabel(record)
          },
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
            {hasPermission('inventory.edit') && (
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => {
                  setSelectedItem(record);
                  setStatusModalVisible(true);
                }}
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

  const handleScanResult = (result) => {
    setScannerVisible(false);
    setFilters({ ...filters, serialNumber: result });
    message.success(`Scanned: ${result}`);
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

  const handlePrintLabel = (record) => {
    // Generate and print label
    message.info('Printing label...');
  };

  const handleBulkExport = () => {
    const selectedItems = itemsData?.filter(item => 
      selectedRowKeys.includes(item.id)
    );
    // Export logic
    message.info(`Exporting ${selectedItems.length} items...`);
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
  };

  return (
    <>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={6}>
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
            
            <Col xs={24} sm={12} lg={4}>
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

            <Col xs={24} sm={12} lg={4}>
              <Select
                placeholder="Status"
                allowClear
                style={{ width: '100%' }}
                onChange={(value) => setFilters({ ...filters, status: value })}
              >
                <Select.Option value="In Store">In Store</Select.Option>
                <Select.Option value="In Hand">In Hand</Select.Option>
                <Select.Option value="In Lab">In Lab</Select.Option>
                <Select.Option value="Sold">Sold</Select.Option>
                <Select.Option value="Delivered">Delivered</Select.Option>
                <Select.Option value="Handover">Handover</Select.Option>
              </Select>
            </Col>

            <Col xs={24} sm={12} lg={6}>
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

            <Col xs={24} sm={12} lg={4}>
              <Space>
                {hasPermission('inventory.create') && (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => navigate('/app/inventory/items/add')}
                  >
                    Add Item
                  </Button>
                )}
                
                {selectedRowKeys.length > 0 && (
                  <Button
                    icon={<ExportOutlined />}
                    onClick={handleBulkExport}
                  >
                    Export ({selectedRowKeys.length})
                  </Button>
                )}
              </Space>
            </Col>
          </Row>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={itemsData}
          loading={isLoading}
          rowSelection={rowSelection}
          scroll={{ x: 1800 }}
          pagination={{
            total: itemsData?.length || 0,
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} items`,
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
              <Descriptions.Item label="Warehouse">
                {selectedItem.warehouse?.name || '-'}
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
                {hasPermission('inventory.edit') && (
                  <Button onClick={() => {
                    setStatusModalVisible(true);
                    setDrawerVisible(false);
                  }}>
                    Update Status
                  </Button>
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

      {/* Update Status Modal */}
      <UpdateStatusModal
        visible={statusModalVisible}
        item={selectedItem}
        onClose={() => {
          setStatusModalVisible(false);
          setSelectedItem(null);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries('items');
          setStatusModalVisible(false);
          setSelectedItem(null);
        }}
      />
    </>
  );
};

export default InventoryList;