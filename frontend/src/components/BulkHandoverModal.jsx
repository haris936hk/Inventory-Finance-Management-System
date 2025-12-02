import React, { useState } from 'react';
import { Modal, Form, Input, message, List, Tag, Row, Col, Alert } from 'antd';
import { useMutation } from 'react-query';
import axios from 'axios';
import { getErrorMessage } from '../utils/errorMessages';
import { phoneRules, nicRules } from '../utils/validationRules';

const BulkHandoverModal = ({ visible, items, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values) => {
    try {
      setLoading(true);

      // Process each item
      const promises = items.map(item =>
        axios.put(`/inventory/items/${item.serialNumber}/status`, {
          status: 'Handover',
          handoverTo: values.handoverTo,
          handoverToNIC: values.handoverToNIC,
          handoverToPhone: values.handoverToPhone,
          handoverDetails: values.handoverDetails,
          notes: values.notes
        })
      );

      await Promise.all(promises);

      message.success(`${items.length} item(s) handed over successfully`);
      form.resetFields();
      onSuccess();
    } catch (error) {
      const errorMessage = getErrorMessage(error, 'handover', 'update');
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      title={`Bulk Handover - ${items.length} Item(s)`}
      open={visible}
      onOk={() => form.submit()}
      onCancel={handleCancel}
      confirmLoading={loading}
      width={700}
      destroyOnClose
      okText="Process Handover"
    >
      <Alert
        message="Handover Process"
        description={`This will mark ${items.length} item(s) as 'Delivered' and update the related invoices to 'Delivered' status.`}
        type="info"
        style={{ marginBottom: 16 }}
        showIcon
      />

      <List
        style={{ marginBottom: 16, maxHeight: 200, overflow: 'auto' }}
        size="small"
        bordered
        dataSource={items}
        renderItem={item => (
          <List.Item>
            <span style={{ fontWeight: 500 }}>{item.serialNumber}</span>
            <span> - {item.model?.name}</span>
            <Tag color="orange" style={{ marginLeft: 8 }}>
              {item.inventoryStatus}
            </Tag>
          </List.Item>
        )}
      />

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="Handover To (Name)"
              name="handoverTo"
              rules={[
                { required: true, message: 'Recipient name is required' }
              ]}
            >
              <Input placeholder="Full name of recipient" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="CNIC/NIC Number"
              name="handoverToNIC"
              rules={nicRules}
            >
              <Input placeholder="e.g., 12345-1234567-1" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="Phone Number"
              name="handoverToPhone"
              rules={phoneRules}
            >
              <Input placeholder="Contact number" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="Additional Details"
              name="handoverDetails"
            >
              <Input placeholder="Optional notes about delivery" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="General Notes" name="notes">
          <Input.TextArea rows={3} placeholder="Delivery notes, vehicle info, etc." />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default BulkHandoverModal;
