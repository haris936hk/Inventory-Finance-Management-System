import React, { useState } from 'react';
import { Modal, Form, Select, message, List, Tag, Alert } from 'antd';
import { useMutation } from 'react-query';
import axios from 'axios';
import { getErrorMessage } from '../utils/errorMessages';

const { Option } = Select;

const BulkRepairedStatusModal = ({ visible, items, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values) => {
    try {
      setLoading(true);

      // Process each item
      const promises = items.map(item =>
        axios.put(`/inventory/items/${item.serialNumber}/repaired`, {
          repaired: values.repaired
        })
      );

      await Promise.all(promises);

      message.success(`${items.length} item(s) updated successfully`);
      form.resetFields();
      onSuccess();
    } catch (error) {
      const errorMessage = getErrorMessage(error, 'item', 'update');
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  const selectedStatus = Form.useWatch('repaired', form);

  return (
    <Modal
      title={`Bulk Update Repaired Status - ${items.length} Item(s)`}
      open={visible}
      onOk={() => form.submit()}
      onCancel={handleCancel}
      confirmLoading={loading}
      width={700}
      destroyOnClose
      okText="Update Status"
    >
      <List
        style={{ marginBottom: 16, maxHeight: 200, overflow: 'auto' }}
        size="small"
        bordered
        dataSource={items}
        renderItem={item => (
          <List.Item>
            <span style={{ fontWeight: 500 }}>{item.serialNumber}</span>
            <span> - {item.model?.name}</span>
            <Tag color="cyan" style={{ marginLeft: 8 }}>
              {item.status}
            </Tag>
            <Tag color={item.repaired === 'Yes' ? 'green' : 'orange'}>
              Current: {item.repaired || 'No'}
            </Tag>
          </List.Item>
        )}
      />

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
      >
        <Form.Item
          name="repaired"
          label="New Repaired Status"
          rules={[{ required: true, message: 'Please select a repaired status' }]}
        >
          <Select placeholder="Select repaired status">
            <Option value="Yes">Yes - Ready for Sale</Option>
            <Option value="Returned">Returned - Cannot Repair</Option>
          </Select>
        </Form.Item>

        {selectedStatus === 'Yes' && (
          <Alert
            message="Items Will Be Available for Sale"
            description={`Marking as 'Yes' will change the ${items.length} item(s) status to 'Available' in 'In Store', making them ready for sale and visible in invoice creation.`}
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}

        {selectedStatus === 'Returned' && (
          <Alert
            message="Warning: Terminal State"
            description={`Marking as 'Returned' is PERMANENT and cannot be undone. The ${items.length} item(s) will be moved to a terminal 'Returned' state. They will appear in inventory lists (with strikethrough styling) but cannot be sold, repaired, or have their status changed ever again. Only use this option if the items are completely unusable and cannot be repaired.`}
            type="error"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
      </Form>
    </Modal>
  );
};

export default BulkRepairedStatusModal;
