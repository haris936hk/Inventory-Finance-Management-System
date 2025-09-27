// ========== src/components/UpdateStatusModal.jsx ==========
import React, { useState } from 'react';
import { Modal, Form, Select, Input, message, Row, Col, Card, Alert, Button, Typography } from 'antd';
import { useMutation } from 'react-query';
import axios from 'axios';
import { InfoCircleOutlined, TruckOutlined } from '@ant-design/icons';
import DeliveryProcessModal from './DeliveryProcessModal';

const { TextArea } = Input;
const { Text, Title } = Typography;

const UpdateStatusModal = ({ visible, item, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);

  const updateMutation = useMutation(
    (data) => axios.put(`/inventory/items/${item?.serialNumber}/status`, data),
    {
      onSuccess: () => {
        message.success('Status updated successfully');
        form.resetFields();
        onSuccess();
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Failed to update status');
      }
    }
  );

  const getInventoryStatusInfo = () => {
    const status = item?.inventoryStatus || 'Available';
    const info = {
      'Available': { color: 'green', description: 'Item is available for sale', automated: false },
      'Reserved': { color: 'orange', description: 'Reserved via invoice creation', automated: true },
      'Sold': { color: 'blue', description: 'Sold via invoice processing', automated: true },
      'Delivered': { color: 'cyan', description: 'Delivered to customer', automated: true }
    };
    return info[status] || info['Available'];
  };

  const canChangeInventoryStatus = () => {
    // Only allow manual override in specific cases
    const currentStatus = item?.inventoryStatus || 'Available';
    return currentStatus === 'Available'; // Only Available items can be manually reserved
  };

  const onFinish = (values) => {
    // Only send fields that should be updated
    const updateData = {
      status: values.status, // Physical status
      notes: values.notes
    };

    // Only include inventory status if it can be changed
    if (canChangeInventoryStatus() && values.inventoryStatus) {
      updateData.inventoryStatus = values.inventoryStatus;
    }

    updateMutation.mutate(updateData);
  };

  const handleDeliveryProcess = () => {
    setShowDeliveryModal(true);
    onClose(); // Close the status modal
  };

  const isHandoverStatus = (status) => {
    return ['Sold', 'Delivered', 'Handover'].includes(status);
  };

  return (
    <Modal
      title={`Update Item Status - ${item?.serialNumber}`}
      open={visible}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={updateMutation.isLoading}
      width={800}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          status: item?.status,
          inventoryStatus: item?.inventoryStatus || 'Available'
        }}
      >
        {/* Business Status Information */}
        <Alert
          message="Inventory Status (Automated)"
          description={
            <div>
              <Text>Current Status: </Text>
              <Text strong style={{ color: getInventoryStatusInfo().color }}>
                {item?.inventoryStatus || 'Available'}
              </Text>
              <br />
              <Text type="secondary">{getInventoryStatusInfo().description}</Text>
              {getInventoryStatusInfo().automated && (
                <div style={{ marginTop: 8 }}>
                  <InfoCircleOutlined style={{ marginRight: 4 }} />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    This status is automatically managed by invoice lifecycle
                  </Text>
                </div>
              )}
            </div>
          }
          type="info"
          style={{ marginBottom: 16 }}
        />

        {/* Customer Information (if item is sold/reserved) */}
        {item?.customer && (
          <Card title="Customer Information" size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={12}>
                <Text strong>Name: </Text><Text>{item.customer.name}</Text><br />
                <Text strong>Phone: </Text><Text>{item.customer.phone}</Text>
              </Col>
              <Col span={12}>
                {item.customer.company && (
                  <><Text strong>Company: </Text><Text>{item.customer.company}</Text><br /></>
                )}
                {item.customer.email && (
                  <><Text strong>Email: </Text><Text>{item.customer.email}</Text></>
                )}
              </Col>
            </Row>
          </Card>
        )}

        {/* Manual Inventory Status (only if allowed) */}
        {canChangeInventoryStatus() && (
          <Form.Item
            label="Override Inventory Status"
            name="inventoryStatus"
            tooltip="Only available items can be manually reserved"
          >
            <Select placeholder="Keep current status">
              <Select.Option value="Available">Available</Select.Option>
              <Select.Option value="Reserved">Reserved (Manual Hold)</Select.Option>
            </Select>
          </Form.Item>
        )}

        {/* Physical Status - Main Update */}
        <Card title="Physical Location Status" style={{ marginBottom: 16 }}>
          <Form.Item
            label="Current Location/Handling Status"
            name="status"
            rules={[{ required: true, message: 'Physical status is required' }]}
            tooltip="Track where the item physically is and who is handling it"
          >
            <Select placeholder="Select physical status">
              <Select.Option value="In Store">In Store</Select.Option>
              <Select.Option value="In Hand">In Hand</Select.Option>
              <Select.Option value="In Lab">In Lab</Select.Option>
              <Select.Option value="Handover">Handover/Transit</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="Notes" name="notes">
            <TextArea rows={3} placeholder="Location details, handling notes, etc." />
          </Form.Item>
        </Card>

        {/* Delivery Process Button */}
        {(item?.inventoryStatus === 'Sold') && (
          <Card title="Delivery Process" style={{ marginBottom: 16 }}>
            <Alert
              message="Ready for Delivery"
              description="This item has been sold and is ready for delivery to the customer."
              type="success"
              style={{ marginBottom: 12 }}
            />
            <Button
              type="primary"
              icon={<TruckOutlined />}
              onClick={handleDeliveryProcess}
              block
            >
              Start Delivery Process
            </Button>
          </Card>
        )}

      {/* Separate Delivery Process Modal */}
      <DeliveryProcessModal
        visible={showDeliveryModal}
        item={item}
        onClose={() => setShowDeliveryModal(false)}
        onSuccess={() => {
          setShowDeliveryModal(false);
          onSuccess();
        }}
      />
      </Form>
    </Modal>
  );
};

export default UpdateStatusModal;