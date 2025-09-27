import React from 'react';
import { Modal, Form, Input, DatePicker, Select, Row, Col, Alert, message } from 'antd';
import { useMutation } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { TruckOutlined } from '@ant-design/icons';

const { TextArea } = Input;

const DeliveryProcessModal = ({ visible, item, onClose, onSuccess }) => {
  const [form] = Form.useForm();

  const deliveryMutation = useMutation(
    (data) => axios.put(`/inventory/items/${item?.serialNumber}/delivery`, data),
    {
      onSuccess: () => {
        message.success('Item delivered successfully');
        form.resetFields();
        onSuccess();
      },
      onError: (error) => {
        message.error(error.response?.data?.message || 'Failed to process delivery');
      }
    }
  );

  const onFinish = (values) => {
    const deliveryData = {
      handoverTo: values.handoverTo,
      handoverToPhone: values.handoverToPhone,
      handoverToNIC: values.handoverToNIC,
      handoverDate: values.handoverDate.toISOString(),
      handoverDetails: values.handoverDetails,
      deliveryMethod: values.deliveryMethod,
      inventoryStatus: 'Delivered', // Automatically set to delivered
      status: 'Delivered', // Also update physical status
      outboundDate: values.handoverDate.toISOString()
    };

    deliveryMutation.mutate(deliveryData);
  };

  return (
    <Modal
      title={
        <div>
          <TruckOutlined style={{ marginRight: 8 }} />
          Delivery Process - {item?.serialNumber}
        </div>
      }
      open={visible}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={deliveryMutation.isLoading}
      width={700}
      okText="Complete Delivery"
    >
      <Alert
        message="Delivery Process"
        description={
          <div>
            <div><strong>Customer:</strong> {item?.customer?.name || 'Unknown'}</div>
            <div><strong>Phone:</strong> {item?.customer?.phone || 'N/A'}</div>
            {item?.customer?.company && (
              <div><strong>Company:</strong> {item?.customer?.company}</div>
            )}
            <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
              Completing this process will automatically update the item status to "Delivered"
            </div>
          </div>
        }
        type="info"
        style={{ marginBottom: 16 }}
      />

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          handoverDate: dayjs(),
          deliveryMethod: 'Hand Delivery'
        }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="Delivered To (Person)"
              name="handoverTo"
              rules={[{ required: true, message: 'Required' }]}
              tooltip="Person who physically received the item"
            >
              <Input placeholder="Name of person receiving" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="Recipient Phone"
              name="handoverToPhone"
              tooltip="Contact number of the person receiving"
            >
              <Input placeholder="Phone number" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="Recipient NIC/ID"
              name="handoverToNIC"
              tooltip="National ID or identification document"
            >
              <Input placeholder="NIC or ID number" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="Delivery Date & Time"
              name="handoverDate"
              rules={[{ required: true, message: 'Required' }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                showTime
                format="DD/MM/YYYY HH:mm"
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="Delivery Method"
              name="deliveryMethod"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Select>
                <Select.Option value="Hand Delivery">Hand Delivery</Select.Option>
                <Select.Option value="Courier Service">Courier Service</Select.Option>
                <Select.Option value="Customer Pickup">Customer Pickup</Select.Option>
                <Select.Option value="Transport Company">Transport Company</Select.Option>
                <Select.Option value="Postal Service">Postal Service</Select.Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          label="Delivery Details"
          name="handoverDetails"
          tooltip="Transportation details, vehicle info, special instructions, etc."
        >
          <TextArea
            rows={4}
            placeholder="Delivery details: transportation company, vehicle number, courier tracking, special instructions, etc."
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default DeliveryProcessModal;