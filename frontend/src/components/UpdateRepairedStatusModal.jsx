// ========== src/components/UpdateRepairedStatusModal.jsx ==========
import React from 'react';
import { Modal, Form, Select, message, Alert } from 'antd';
import { useMutation } from 'react-query';
import axios from 'axios';

const UpdateRepairedStatusModal = ({ visible, item, onClose, onSuccess }) => {
  const [form] = Form.useForm();

  const updateMutation = useMutation(
    (data) => axios.put(`/inventory/items/${item?.serialNumber}/repaired`, data),
    {
      onSuccess: (response) => {
        message.success(response.data?.message || 'Repaired status updated successfully');
        form.resetFields();
        onSuccess();
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Failed to update repaired status');
      }
    }
  );

  const onFinish = (values) => {
    updateMutation.mutate({ repaired: values.repaired });
  };

  const getCurrentRepaired = () => {
    return item?.repaired || 'No';
  };

  return (
    <Modal
      title={`Update Repaired Status - ${item?.serialNumber}`}
      open={visible}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={updateMutation.isLoading}
      okText="Update Status"
      width={500}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
      >
        <Alert
          message={`Current Status: ${getCurrentRepaired()}`}
          type="info"
          style={{ marginBottom: 16 }}
          showIcon
        />

        <Form.Item
          label="New Repaired Status"
          name="repaired"
          rules={[
            { required: true, message: 'Please select a repaired status' }
          ]}
        >
          <Select placeholder="Select repaired status">
            <Select.Option value="Yes">Yes - Ready for Sale</Select.Option>
            <Select.Option value="Returned">Returned - Cannot Repair</Select.Option>
          </Select>
        </Form.Item>

        {form.getFieldValue('repaired') === 'Returned' && (
          <Alert
            message="Warning"
            description="Marking as 'Returned' will exclude this item from all reports and it cannot be sold."
            type="warning"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
      </Form>
    </Modal>
  );
};

export default UpdateRepairedStatusModal;
