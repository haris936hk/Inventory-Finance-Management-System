import React from 'react';
import {
  Card, Timeline, Tag, Typography, Space, Divider, Empty,
  Row, Col, Statistic, Alert, Tooltip
} from 'antd';
import {
  InboxOutlined, ShoppingOutlined, TruckOutlined,
  SwapOutlined, ToolOutlined, UserOutlined, CalendarOutlined,
  FileTextOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const { Text, Title } = Typography;

const InventoryMovementHistory = ({ movements = [], statusHistory = [] }) => {

  const getMovementTypeIcon = (type) => {
    const icons = {
      'PURCHASE_RECEIPT': <InboxOutlined style={{ color: '#52c41a' }} />,
      'SALE': <ShoppingOutlined style={{ color: '#1890ff' }} />,
      'HANDOVER': <TruckOutlined style={{ color: '#fa8c16' }} />,
      'TRANSFER': <SwapOutlined style={{ color: '#722ed1' }} />,
      'ADJUSTMENT': <ToolOutlined style={{ color: '#eb2f96' }} />,
    };
    return icons[type] || <InfoCircleOutlined />;
  };

  const getMovementTypeColor = (type) => {
    const colors = {
      'PURCHASE_RECEIPT': 'success',
      'SALE': 'processing',
      'HANDOVER': 'warning',
      'TRANSFER': 'purple',
      'ADJUSTMENT': 'magenta',
    };
    return colors[type] || 'default';
  };

  const getStatusColor = (status) => {
    const colors = {
      'Available': 'success',
      'Reserved': 'warning',
      'Sold': 'processing',
      'Delivered': 'success',
      'In Store': 'blue',
      'In Hand': 'cyan',
      'In Lab': 'purple',
      'Handover': 'orange'
    };
    return colors[status] || 'default';
  };

  // Combine and sort movements and status changes
  const combinedHistory = [
    ...movements.map(m => ({ ...m, type: 'movement' })),
    ...statusHistory.map(s => ({ ...s, type: 'status', createdAt: s.changeDate }))
  ].sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf());

  const renderMovementCard = (item) => {
    if (item.type === 'movement') {
      return (
        <Card size="small" style={{ marginBottom: 8 }}>
          <Row align="middle" justify="space-between">
            <Col flex="auto">
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Space>
                  {getMovementTypeIcon(item.movementType)}
                  <Text strong>{item.movementType.replace('_', ' ')}</Text>
                  <Tag color={getMovementTypeColor(item.movementType)}>
                    Movement
                  </Tag>
                </Space>

                {(item.fromStatus || item.toStatus) && (
                  <div>
                    <Text type="secondary">Status: </Text>
                    {item.fromStatus && (
                      <Tag color={getStatusColor(item.fromStatus)} size="small">
                        {item.fromStatus}
                      </Tag>
                    )}
                    {item.fromStatus && item.toStatus && <Text type="secondary"> → </Text>}
                    {item.toStatus && (
                      <Tag color={getStatusColor(item.toStatus)} size="small">
                        {item.toStatus}
                      </Tag>
                    )}
                  </div>
                )}

                {item.reference && (
                  <div>
                    <FileTextOutlined style={{ marginRight: 4 }} />
                    <Text type="secondary">Ref: </Text>
                    <Text code>{item.reference}</Text>
                  </div>
                )}

                {item.notes && (
                  <div>
                    <Text type="secondary">Notes: </Text>
                    <Text>{item.notes}</Text>
                  </div>
                )}

                <div>
                  <UserOutlined style={{ marginRight: 4 }} />
                  <Text type="secondary">By: </Text>
                  <Text>{item.user?.fullName || item.user?.username || 'Unknown'}</Text>
                  <Divider type="vertical" />
                  <CalendarOutlined style={{ marginRight: 4 }} />
                  <Text type="secondary">{dayjs(item.createdAt).format('DD/MM/YYYY HH:mm')}</Text>
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    ({dayjs(item.createdAt).fromNow()})
                  </Text>
                </div>
              </Space>
            </Col>
          </Row>
        </Card>
      );
    } else {
      // Status change
      return (
        <Card size="small" style={{ marginBottom: 8, backgroundColor: '#fafafa' }}>
          <Row align="middle" justify="space-between">
            <Col flex="auto">
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Space>
                  <SwapOutlined style={{ color: '#1890ff' }} />
                  <Text strong>Status Change</Text>
                  <Tag color="blue">Status Update</Tag>
                </Space>

                <div>
                  <Text type="secondary">Status: </Text>
                  {item.fromStatus && (
                    <Tag color={getStatusColor(item.fromStatus)} size="small">
                      {item.fromStatus}
                    </Tag>
                  )}
                  {item.fromStatus && <Text type="secondary"> → </Text>}
                  <Tag color={getStatusColor(item.toStatus)} size="small">
                    {item.toStatus}
                  </Tag>
                </div>

                <div>
                  <Text type="secondary">Reason: </Text>
                  <Tag color="geekblue" size="small">{item.changeReason}</Tag>
                </div>

                {item.referenceType && item.referenceId && (
                  <div>
                    <FileTextOutlined style={{ marginRight: 4 }} />
                    <Text type="secondary">Reference: </Text>
                    <Text code>{item.referenceType}#{item.referenceId}</Text>
                  </div>
                )}

                {item.notes && (
                  <div>
                    <Text type="secondary">Notes: </Text>
                    <Text>{item.notes}</Text>
                  </div>
                )}

                <div>
                  <UserOutlined style={{ marginRight: 4 }} />
                  <Text type="secondary">By: </Text>
                  <Text>{item.changedByUser?.fullName || item.changedByUser?.username || 'Unknown'}</Text>
                  <Divider type="vertical" />
                  <CalendarOutlined style={{ marginRight: 4 }} />
                  <Text type="secondary">{dayjs(item.createdAt).format('DD/MM/YYYY HH:mm')}</Text>
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    ({dayjs(item.createdAt).fromNow()})
                  </Text>
                </div>
              </Space>
            </Col>
          </Row>
        </Card>
      );
    }
  };

  if (!combinedHistory.length) {
    return (
      <Card>
        <Empty
          description="No movement history available"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  // Calculate statistics
  const movementCount = movements.length;
  const statusChangeCount = statusHistory.length;
  const totalEvents = combinedHistory.length;
  const lastActivity = combinedHistory[0]?.createdAt;

  return (
    <div>
      {/* Summary Statistics */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="Total Events"
              value={totalEvents}
              prefix={<InfoCircleOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Movements"
              value={movementCount}
              prefix={<TruckOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Status Changes"
              value={statusChangeCount}
              prefix={<SwapOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Last Activity"
              value={lastActivity ? dayjs(lastActivity).fromNow() : 'Never'}
              prefix={<CalendarOutlined />}
            />
          </Col>
        </Row>
      </Card>

      {/* Activity Timeline */}
      <Card title="Complete Activity History" style={{ marginBottom: 16 }}>
        <Alert
          message="Audit Trail"
          description="This section shows all movements and status changes for this item, providing a complete audit trail for compliance and tracking purposes."
          type="info"
          style={{ marginBottom: 16 }}
          showIcon
        />

        <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
          {combinedHistory.map((item, index) => (
            <div key={`${item.type}-${item.id}-${index}`}>
              {renderMovementCard(item)}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default InventoryMovementHistory;