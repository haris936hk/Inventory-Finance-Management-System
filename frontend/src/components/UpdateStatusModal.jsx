// ========== src/components/UpdateStatusModal.jsx ==========
import React from 'react';
import { Modal, Form, Select, Input, DatePicker, message } from 'antd';
import { useMutation } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const { TextArea } = Input;

const UpdateStatusModal = ({ visible, item, onClose, onSuccess }) => {
  const [form] = Form.useForm();

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

  const handleStatusChange = (status) => {
    // Show/hide fields based on status
    form.resetFields(['clientName', 'clientPhone', 'clientCompany', 'clientNIC',
                      'clientEmail', 'clientAddress', 'handoverTo', 'handoverDetails', 'customerId']);
  };

  const onFinish = (values) => {
    if (values.outboundDate) {
      values.outboundDate = values.outboundDate.toISOString();
    }
    if (values.handoverDate) {
      values.handoverDate = values.handoverDate.toISOString();
    }

    updateMutation.mutate(values);
  };

  const isHandoverStatus = (status) => {
    return ['Sold', 'Delivered', 'Handover'].includes(status);
  };

  return (
    <Modal
      title={`Update Status - ${item?.serialNumber}`}
      open={visible}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={updateMutation.isLoading}
      width={600}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          status: item?.status
        }}
      >
        <Form.Item
          label="New Status"
          name="status"
          rules={[{ required: true, message: 'Status is required' }]}
        >
          <Select onChange={handleStatusChange}>
            <Select.Option value="In Store">In Store</Select.Option>
            <Select.Option value="In Hand">In Hand</Select.Option>
            <Select.Option value="In Lab">In Lab</Select.Option>
            <Select.Option value="Sold">Sold</Select.Option>
            <Select.Option value="Delivered">Delivered</Select.Option>
            <Select.Option value="Handover">Handover</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          noStyle
          shouldUpdate={(prevValues, currentValues) => 
            prevValues.status !== currentValues.status
          }
        >
          {({ getFieldValue }) => {
            const status = getFieldValue('status');
            
            if (!isHandoverStatus(status)) {
              return (
                <Form.Item label="Notes" name="notes">
                  <TextArea rows={3} placeholder="Additional notes" />
                </Form.Item>
              );
            }

            return (
              <>
                {/* Client Information - Note: Backend will create Customer record from these fields */}
                <Form.Item
                  label="Client Name"
                  name="clientName"
                  rules={[{ required: true, message: 'Client name is required' }]}
                >
                  <Input placeholder="Enter client name" />
                </Form.Item>

                <Form.Item
                  label="Client Phone"
                  name="clientPhone"
                  rules={[
                    { required: true, message: 'Client phone is required' },
                    { pattern: /^\d{11}$/, message: 'Phone must be 11 digits' }
                  ]}
                >
                  <Input placeholder="03001234567" />
                </Form.Item>

                <Form.Item label="Client Company" name="clientCompany">
                  <Input placeholder="Company name (optional)" />
                </Form.Item>

                <Form.Item label="Client NIC" name="clientNIC">
                  <Input placeholder="National ID Card" />
                </Form.Item>

                <Form.Item label="Client Email" name="clientEmail">
                  <Input type="email" placeholder="email@example.com" />
                </Form.Item>

                <Form.Item label="Client Address" name="clientAddress">
                  <TextArea rows={2} placeholder="Full address" />
                </Form.Item>

                {status === 'Sold' && (
                  <Form.Item label="Selling Price" name="sellingPrice">
                    <Input type="number" prefix="PKR" placeholder="Enter selling price" />
                  </Form.Item>
                )}

                {(status === 'Handover' || status === 'Delivered') && (
                  <>
                    <Form.Item
                      label="Handover To"
                      name="handoverTo"
                      rules={[{ required: true, message: 'Required' }]}
                    >
                      <Input placeholder="Transportation company or person" />
                    </Form.Item>

                    <Form.Item label="Handover Details" name="handoverDetails">
                      <TextArea 
                        rows={2} 
                        placeholder="Bus number, contact details, etc." 
                      />
                    </Form.Item>

                    <Form.Item
                      label="Handover Date"
                      name="handoverDate"
                      initialValue={dayjs()}
                    >
                      <DatePicker style={{ width: '100%' }} />
                    </Form.Item>
                  </>
                )}

                <Form.Item
                  label="Outbound Date"
                  name="outboundDate"
                  initialValue={dayjs()}
                >
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item label="Notes" name="notes">
                  <TextArea rows={2} placeholder="Additional notes" />
                </Form.Item>
              </>
            );
          }}
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default UpdateStatusModal;