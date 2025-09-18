import React from 'react';
import { Card, Descriptions, Button, Space } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';

const ItemDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const handleBack = () => {
    navigate('/inventory');
  };

  return (
    <div style={{ padding: '24px' }}>
      <Space style={{ marginBottom: '16px' }}>
        <Button 
          icon={<ArrowLeftOutlined />} 
          onClick={handleBack}
        >
          Back to Inventory
        </Button>
      </Space>
      
      <Card title={`Item Details - ID: ${id}`}>
        <Descriptions bordered column={2}>
          <Descriptions.Item label="Item Name">Sample Item</Descriptions.Item>
          <Descriptions.Item label="SKU">SKU-001</Descriptions.Item>
          <Descriptions.Item label="Category">Electronics</Descriptions.Item>
          <Descriptions.Item label="Quantity">100</Descriptions.Item>
          <Descriptions.Item label="Unit Price">$25.00</Descriptions.Item>
          <Descriptions.Item label="Total Value">$2,500.00</Descriptions.Item>
          <Descriptions.Item label="Supplier">ABC Company</Descriptions.Item>
          <Descriptions.Item label="Location">Warehouse A</Descriptions.Item>
          <Descriptions.Item label="Description" span={2}>
            This is a sample item description. In a real application, this would contain detailed information about the inventory item.
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
};

export default ItemDetails;