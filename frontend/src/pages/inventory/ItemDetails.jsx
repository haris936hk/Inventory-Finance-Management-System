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
import UpdateStatusModal from '../../components/UpdateStatusModal';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const ItemDetails = () => {
  const { serialNumber } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [statusModalVisible, setStatusModalVisible] = useState(false);

  // Fetch item details
  const { data: item, isLoading, error } = useQuery(
    ['item', serialNumber],
    async () => {
      const response = await axios.get(`/inventory/items/${serialNumber}`);
      return response.data.data;
    }
  );

  // Fetch item history
  const { data: itemHistory } = useQuery(
    ['item-history', serialNumber],
    async () => {
      const response = await axios.get(`/inventory/items/${serialNumber}/history`);
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

  const getStatusColor = (status) => {
    const colors = {
      'Available': 'green',
      'Sold': 'blue',
      'Reserved': 'orange',
      'Damaged': 'red',
      'Under Repair': 'purple',
      'Lost': 'magenta'
    };
    return colors[status] || 'default';
  };

  const getStatusIcon = (status) => {
    const icons = {
      'Available': <CheckCircleOutlined />,
      'Sold': <DollarOutlined />,
      'Reserved': <ClockCircleOutlined />,
      'Damaged': <WarningOutlined />,
      'Under Repair': <TruckOutlined />,
      'Lost': <WarningOutlined />
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
      render: (status) => status && <Tag color={getStatusColor(status)}>{status}</Tag>
    },
    {
      title: 'To Status',
      dataIndex: 'toStatus',
      key: 'toStatus',
      render: (status) => status && <Tag color={getStatusColor(status)}>{status}</Tag>
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
                  <Descriptions.Item label="Status">
                    <Tag
                      color={getStatusColor(item.status)}
                      icon={getStatusIcon(item.status)}
                    >
                      {item.status}
                    </Tag>
                  </Descriptions.Item>

                  <Descriptions.Item label="Purchase Price">
                    PKR {item.purchasePrice?.toLocaleString() || 'N/A'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Sale Price">
                    PKR {item.salePrice?.toLocaleString() || 'N/A'}
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

            <TabPane tab="History" key="history">
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
          </Tabs>
        </Col>

        {/* Right Column - Statistics & Quick Info */}
        <Col xs={24} lg={8}>
          {/* Status Card */}
          <Card style={{ marginBottom: 16 }}>
            <Statistic
              title="Current Status"
              value={item.status}
              prefix={getStatusIcon(item.status)}
              valueStyle={{
                color: item.status === 'Available' ? '#52c41a' :
                       item.status === 'Sold' ? '#1890ff' : '#faad14'
              }}
            />
            {item.status === 'Available' && (
              <Text type="success">Ready for sale</Text>
            )}
            {item.status === 'Reserved' && (
              <Text type="warning">Reserved for customer</Text>
            )}
            {item.status === 'Sold' && (
              <Text type="secondary">Transaction completed</Text>
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
                  title="Sale Price"
                  value={item.salePrice || 0}
                  prefix="PKR"
                  precision={0}
                />
              </Col>
            </Row>
            {item.purchasePrice && item.salePrice && (
              <div style={{ marginTop: 16 }}>
                <Text strong>Profit Margin: </Text>
                <Text style={{ color: '#52c41a' }}>
                  PKR {(item.salePrice - item.purchasePrice).toLocaleString()}
                  ({(((item.salePrice - item.purchasePrice) / item.purchasePrice) * 100).toFixed(1)}%)
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
        }}
      />
    </div>
  );
};

export default ItemDetails;