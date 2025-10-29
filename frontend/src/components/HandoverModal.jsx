// ========== src/components/HandoverModal.jsx ==========
import React from 'react';
import { Modal, Form, Input, message, Row, Col, Alert, Typography } from 'antd';
import { useMutation } from 'react-query';
import axios from 'axios';

const { TextArea } = Input;
const { Text } = Typography;

const HandoverModal = ({ visible, item, onClose, onSuccess }) => {
  const [form] = Form.useForm();

  const handoverMutation = useMutation(
    (data) => axios.put(`/inventory/items/${item?.serialNumber}/status`, data),
    {
      onSuccess: (response) => {
        message.success(response.data?.message || 'Item handed over successfully');
        form.resetFields();
        onSuccess();
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Failed to process handover');
      }
    }
  );

  const onFinish = (values) => {
    const handoverData = {
      status: 'Handover',
      handoverTo: values.handoverTo,
      handoverToNIC: values.handoverToNIC,
      handoverToPhone: values.handoverToPhone,
      handoverDetails: values.handoverDetails,
      notes: values.notes
    };

    handoverMutation.mutate(handoverData);
  };

  return (
    <Modal
      title={`Handover Item - ${item?.serialNumber}`}
      open={visible}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={handoverMutation.isLoading}
      okText="Process Handover"
      width={700}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
      >
        <Alert
          message="Handover Process"
          description="This will mark the item as 'Delivered' and update the related invoice to 'Delivered' status."
          type="info"
          style={{ marginBottom: 24 }}
          showIcon
        />

        {/* Customer Information (if item is sold/reserved) */}
        {item?.customer && (
          <Alert
            message="Customer Information"
            description={
              <div>
                <Text strong>Name: </Text><Text>{item.customer.name}</Text><br />
                <Text strong>Phone: </Text><Text>{item.customer.phone}</Text>
                {item.customer.company && (
                  <><br /><Text strong>Company: </Text><Text>{item.customer.company}</Text></>
                )}
              </div>
            }
            type="success"
            style={{ marginBottom: 24 }}
          />
        )}

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
              rules={[
                { required: true, message: 'NIC is required' }
              ]}
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
              rules={[
                { required: true, message: 'Phone number is required' }
              ]}
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
          <TextArea rows={3} placeholder="Delivery notes, vehicle info, etc." />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default HandoverModal;
