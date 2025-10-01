// ========== src/pages/inventory/ItemDetails.jsx ==========
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Row, Col, Descriptions, Tag, Button, Space, Timeline, Table,
  Typography, Divider, Statistic, Alert, Modal, message, Tabs
} from 'antd';
import {
  ArrowLeftOutlined, EditOutlined, DeleteOutlined, PrinterOutlined,
  BarcodeOutlined, HistoryOutlined, DollarOutlined, TruckOutlined,
  WarningOutlined, CheckCircleOutlined, ClockCircleOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { useAuthStore } from '../../stores/authStore';
import { formatPKR } from '../../config/constants';
import UpdateStatusModal from '../../components/UpdateStatusModal';
import DeliveryProcessModal from '../../components/DeliveryProcessModal';
import InventoryMovementHistory from '../../components/InventoryMovementHistory';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const ItemDetails = () => {
  const { serialNumber } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [deliveryModalVisible, setDeliveryModalVisible] = useState(false);

  // Fetch item details
  const { data: item, isLoading, error } = useQuery(
    ['item', serialNumber],
    async () => {
      const response = await axios.get(`/inventory/items/${serialNumber}`);
      return response.data.data;
    }
  );

  // Fetch item history (status changes)
  const { data: itemHistory } = useQuery(
    ['item-history', serialNumber],
    async () => {
      const response = await axios.get(`/inventory/items/${serialNumber}/history`);
      return response.data.data;
    },
    { enabled: !!serialNumber }
  );

  // Fetch inventory movements
  const { data: inventoryMovements } = useQuery(
    ['inventory-movements', serialNumber],
    async () => {
      const response = await axios.get(`/inventory/items/${serialNumber}/movements`);
      return response.data.data;
    },
    { enabled: !!serialNumber }
  );

  // Delete mutation
  const deleteMutation = useMutation(
    () => axios.delete(`/inventory/items/${serialNumber}`),
    {
      onSuccess: () => {
        message.success('Item deleted successfully');
        navigate('/app/inventory/items');
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Failed to delete item');
      }
    }
  );

  if (isLoading) {
    return (
      <Card loading style={{ margin: 24 }}>
        Loading item details...
      </Card>
    );
  }

  if (error || !item) {
    return (
      <Card style={{ margin: 24 }}>
        <Alert
          message="Item Not Found"
          description="The item you're looking for doesn't exist or has been removed."
          type="error"
          action={
            <Button onClick={() => navigate('/app/inventory/items')}>
              Back to Inventory
            </Button>
          }
        />
      </Card>
    );
  }

  const getInventoryStatusColor = (status) => {
    const colors = {
      'Available': 'green',
      'Reserved': 'orange',
      'Sold': 'blue',
      'Delivered': 'cyan'
    };
    return colors[status] || 'default';
  };

  const getPhysicalStatusColor = (status) => {
    const colors = {
      'In Store': 'green',
      'In Hand': 'blue',
      'In Lab': 'purple',
      'Sold': 'blue',
      'Delivered': 'cyan',
      'Handover': 'orange'
    };
    return colors[status] || 'default';
  };

  const getInventoryStatusIcon = (status) => {
    const icons = {
      'Available': <CheckCircleOutlined />,
      'Reserved': <ClockCircleOutlined />,
      'Sold': <DollarOutlined />,
      'Delivered': <TruckOutlined />
    };
    return icons[status] || <CheckCircleOutlined />;
  };

  const getPhysicalStatusIcon = (status) => {
    const icons = {
      'In Store': <CheckCircleOutlined />,
      'In Hand': <DollarOutlined />,
      'In Lab': <WarningOutlined />,
      'Sold': <DollarOutlined />,
      'Delivered': <TruckOutlined />,
      'Handover': <TruckOutlined />
    };
    return icons[status] || <CheckCircleOutlined />;
  };

  const historyColumns = [
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date) => dayjs(date).format('DD/MM/YYYY HH:mm')
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      render: (action) => <Tag color="blue">{action}</Tag>
    },
    {
      title: 'From Status',
      dataIndex: 'fromStatus',
      key: 'fromStatus',
      render: (status) => status && <Tag color={getPhysicalStatusColor(status)}>{status}</Tag>
    },
    {
      title: 'To Status',
      dataIndex: 'toStatus',
      key: 'toStatus',
      render: (status) => status && <Tag color={getPhysicalStatusColor(status)}>{status}</Tag>
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes'
    },
    {
      title: 'User',
      dataIndex: 'user',
      key: 'user',
      render: (user) => user?.fullName || user?.username
    }
  ];

  const handleDelete = () => {
    Modal.confirm({
      title: 'Delete Item',
      content: 'Are you sure you want to delete this item? This action cannot be undone.',
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: () => deleteMutation.mutate()
    });
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/app/inventory/items')}
            >
              Back
            </Button>
            <div>
              <Title level={2} style={{ margin: 0 }}>
                {item.model?.name}
              </Title>
              <Text type="secondary">
                Serial: {item.serialNumber} | {item.model?.company?.name}
              </Text>
            </div>
          </Space>

          <Space>
            <Button icon={<BarcodeOutlined />}>
              Print Barcode
            </Button>
            <Button icon={<PrinterOutlined />}>
              Print Details
            </Button>
            {hasPermission('inventory.update') && (
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => setStatusModalVisible(true)}
              >
                Update Status
              </Button>
            )}
            {item.inventoryStatus === 'Sold' && hasPermission('inventory.update') && (
              <Button
                type="primary"
                icon={<TruckOutlined />}
                onClick={() => setDeliveryModalVisible(true)}
                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
              >
                Process Delivery
              </Button>
            )}
            {hasPermission('inventory.delete') && (
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleDelete}
                loading={deleteMutation.isLoading}
              >
                Delete
              </Button>
            )}
          </Space>
        </div>
      </Card>

      <Row gutter={[24, 24]}>
        {/* Left Column - Main Details */}
        <Col xs={24} lg={16}>
          <Tabs defaultActiveKey="details">
            <TabPane tab="Item Details" key="details">
              <Card>
                <Descriptions column={2} bordered>
                  <Descriptions.Item label="Serial Number" span={2}>
                    <Text strong>{item.serialNumber}</Text>
                    <Tag color="blue" style={{ marginLeft: 8 }}>
                      <BarcodeOutlined /> {item.barcode || 'Auto-generated'}
                    </Tag>
                  </Descriptions.Item>

                  <Descriptions.Item label="Model">
                    {item.model?.name}
                  </Descriptions.Item>
                  <Descriptions.Item label="Company">
                    {item.model?.company?.name}
                  </Descriptions.Item>

                  <Descriptions.Item label="Category">
                    {item.model?.category?.name}
                  </Descriptions.Item>
                  <Descriptions.Item label="Inventory Status">
                    <Tag
                      color={getInventoryStatusColor(item.inventoryStatus)}
                      icon={getInventoryStatusIcon(item.inventoryStatus)}
                    >
                      {item.inventoryStatus || 'Available'}
                    </Tag>
                  </Descriptions.Item>

                  <Descriptions.Item label="Physical Status" span={2}>
                    <Tag
                      color={getPhysicalStatusColor(item.status)}
                      icon={getPhysicalStatusIcon(item.status)}
                    >
                      {item.status}
                    </Tag>
                  </Descriptions.Item>

                  <Descriptions.Item label="Purchase Price">
                    {item.purchasePrice ? formatPKR(item.purchasePrice) : 'N/A'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Selling Price">
                    {item.sellingPrice ? formatPKR(item.sellingPrice) : 'N/A'}
                  </Descriptions.Item>

                  <Descriptions.Item label="Purchase Date">
                    {item.purchaseDate ? dayjs(item.purchaseDate).format('DD/MM/YYYY') : 'N/A'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Warranty Expires">
                    {item.warrantyExpires ? dayjs(item.warrantyExpires).format('DD/MM/YYYY') : 'N/A'}
                  </Descriptions.Item>

                  <Descriptions.Item label="Vendor">
                    {item.vendor?.name || 'N/A'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Location">
                    {item.location || 'Not specified'}
                  </Descriptions.Item>

                  {item.specifications && (
                    <Descriptions.Item label="Specifications" span={2}>
                      <div>
                        {typeof item.specifications === 'object' ? (
                          Object.entries(item.specifications).map(([key, value]) => (
                            <div key={key} style={{ marginBottom: 4 }}>
                              <Text strong>{key.charAt(0).toUpperCase() + key.slice(1)}: </Text>
                              <Text>{value}</Text>
                            </div>
                          ))
                        ) : (
                          <div style={{ whiteSpace: 'pre-wrap' }}>
                            {item.specifications}
                          </div>
                        )}
                      </div>
                    </Descriptions.Item>
                  )}

                  {/* Handover Information */}
                  {(item.handoverTo || item.handoverDetails) && (
                    <>
                      <Descriptions.Item label="Handover To" span={2}>
                        <div>
                          <Text strong>{item.handoverTo}</Text>
                          {item.handoverToPhone && (
                            <div>
                              <Text type="secondary">Phone: </Text>
                              <Text>{item.handoverToPhone}</Text>
                            </div>
                          )}
                          {item.handoverToNIC && (
                            <div>
                              <Text type="secondary">NIC: </Text>
                              <Text>{item.handoverToNIC}</Text>
                            </div>
                          )}
                        </div>
                      </Descriptions.Item>

                      {item.handoverDetails && (
                        <Descriptions.Item label="Handover Details" span={2}>
                          <div style={{ whiteSpace: 'pre-wrap' }}>
                            {item.handoverDetails}
                          </div>
                        </Descriptions.Item>
                      )}

                      {item.handoverDate && (
                        <Descriptions.Item label="Handover Date">
                          {dayjs(item.handoverDate).format('DD/MM/YYYY HH:mm')}
                        </Descriptions.Item>
                      )}
                      {item.handoverByUser && (
                        <Descriptions.Item label="Handed Over By">
                          {item.handoverByUser.fullName || item.handoverByUser.username}
                        </Descriptions.Item>
                      )}
                    </>
                  )}

                  {/* Customer Information */}
                  {item.customer && (
                    <>
                      <Descriptions.Item label="Customer" span={2}>
                        <div>
                          <Text strong>{item.customer.name}</Text>
                          {item.customer.company && (
                            <div>
                              <Text type="secondary">Company: </Text>
                              <Text>{item.customer.company}</Text>
                            </div>
                          )}
                          {item.customer.phone && (
                            <div>
                              <Text type="secondary">Phone: </Text>
                              <Text>{item.customer.phone}</Text>
                            </div>
                          )}
                        </div>
                      </Descriptions.Item>
                    </>
                  )}

                  {item.notes && (
                    <Descriptions.Item label="Notes" span={2}>
                      <div style={{ whiteSpace: 'pre-wrap' }}>
                        {item.notes}
                      </div>
                    </Descriptions.Item>
                  )}

                  <Descriptions.Item label="Created">
                    {dayjs(item.createdAt).format('DD/MM/YYYY HH:mm')}
                  </Descriptions.Item>
                  <Descriptions.Item label="Last Updated">
                    {dayjs(item.updatedAt).format('DD/MM/YYYY HH:mm')}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </TabPane>

            <TabPane tab="Status History" key="history">
              <Card>
                <Table
                  rowKey="id"
                  columns={historyColumns}
                  dataSource={itemHistory}
                  pagination={false}
                  size="small"
                />
              </Card>
            </TabPane>

            <TabPane tab="Movement History" key="movements">
              <InventoryMovementHistory
                movements={inventoryMovements || []}
                statusHistory={itemHistory || []}
              />
            </TabPane>
          </Tabs>
        </Col>

        {/* Right Column - Statistics & Quick Info */}
        <Col xs={24} lg={8}>
          {/* Status Cards */}
          <Card title="Current Status" style={{ marginBottom: 16 }}>
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <Statistic
                  title="Inventory Status (Business)"
                  value={item.inventoryStatus || 'Available'}
                  prefix={getInventoryStatusIcon(item.inventoryStatus || 'Available')}
                  valueStyle={{
                    color: getInventoryStatusColor(item.inventoryStatus || 'Available') === 'green' ? '#52c41a' :
                           getInventoryStatusColor(item.inventoryStatus || 'Available') === 'blue' ? '#1890ff' : '#faad14'
                  }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Controls business logic and availability
                </Text>
              </Col>
              <Col span={24}>
                <Statistic
                  title="Physical Status (Location)"
                  value={item.status}
                  prefix={getPhysicalStatusIcon(item.status)}
                  valueStyle={{
                    color: getPhysicalStatusColor(item.status) === 'green' ? '#52c41a' :
                           getPhysicalStatusColor(item.status) === 'blue' ? '#1890ff' : '#faad14'
                  }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Tracks physical location and handling
                </Text>
              </Col>
            </Row>

            <Divider />

            {item.inventoryStatus === 'Available' && (
              <Text type="success">✓ Ready for sale</Text>
            )}
            {item.inventoryStatus === 'Reserved' && (
              <Text type="warning">⏳ Reserved for customer</Text>
            )}
            {item.inventoryStatus === 'Sold' && (
              <Text type="secondary">💰 Transaction completed</Text>
            )}
            {item.inventoryStatus === 'Delivered' && (
              <Text type="success">🚚 Delivered to customer</Text>
            )}
          </Card>

          {/* Financial Info */}
          <Card title="Financial Information" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={12}>
                <Statistic
                  title="Purchase"
                  value={item.purchasePrice || 0}
                  prefix="PKR"
                  precision={0}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Selling Price"
                  value={item.sellingPrice || 0}
                  prefix="PKR"
                  precision={0}
                />
              </Col>
            </Row>
            {item.purchasePrice && item.sellingPrice && (
              <div style={{ marginTop: 16 }}>
                <Text strong>Profit Margin: </Text>
                <Text style={{ color: '#52c41a' }}>
                  {formatPKR(item.sellingPrice - item.purchasePrice)}
                  ({(((item.sellingPrice - item.purchasePrice) / item.purchasePrice) * 100).toFixed(1)}%)
                </Text>
              </div>
            )}
          </Card>

          {/* Warranty Info */}
          {item.warrantyExpires && (
            <Card title="Warranty Information">
              <div>
                <Text strong>Expires: </Text>
                <Text>{dayjs(item.warrantyExpires).format('DD/MM/YYYY')}</Text>
              </div>
              <div style={{ marginTop: 8 }}>
                <Text strong>Status: </Text>
                {dayjs().isAfter(dayjs(item.warrantyExpires)) ? (
                  <Text type="danger">Expired</Text>
                ) : (
                  <Text type="success">
                    {dayjs(item.warrantyExpires).diff(dayjs(), 'days')} days remaining
                  </Text>
                )}
              </div>
            </Card>
          )}
        </Col>
      </Row>

      {/* Update Status Modal */}
      <UpdateStatusModal
        visible={statusModalVisible}
        onClose={() => setStatusModalVisible(false)}
        item={item}
        onSuccess={() => {
          queryClient.invalidateQueries(['item', serialNumber]);
          queryClient.invalidateQueries(['item-history', serialNumber]);
          queryClient.invalidateQueries(['inventory-movements', serialNumber]);
        }}
      />

      {/* Delivery Process Modal */}
      <DeliveryProcessModal
        visible={deliveryModalVisible}
        item={item}
        onClose={() => setDeliveryModalVisible(false)}
        onSuccess={() => {
          setDeliveryModalVisible(false);
          queryClient.invalidateQueries(['item', serialNumber]);
          queryClient.invalidateQueries(['item-history', serialNumber]);
          queryClient.invalidateQueries(['inventory-movements', serialNumber]);
        }}
      />
    </div>
  );
};

export default ItemDetails;