import React, { useState } from 'react';
import { Card, Descriptions, Button, Space, Table, Tag, Divider, Modal, message } from 'antd';
import { ArrowLeftOutlined, PrinterOutlined, DownloadOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';

const InvoiceDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [invoice, setInvoice] = useState({
    id: id || 'INV-001',
    invoiceNumber: 'INV-2024-001',
    date: '2024-01-15',
    dueDate: '2024-02-15',
    status: 'Pending',
    customer: {
      name: 'ABC Corporation',
      email: 'billing@abccorp.com',
      phone: '+1-555-0123',
      address: '123 Business Street, City, State 12345'
    },
    items: [
      {
        id: 1,
        description: 'Product A',
        quantity: 2,
        unitPrice: 150.00,
        total: 300.00
      },
      {
        id: 2,
        description: 'Product B',
        quantity: 1,
        unitPrice: 250.00,
        total: 250.00
      },
      {
        id: 3,
        description: 'Service Fee',
        quantity: 1,
        unitPrice: 100.00,
        total: 100.00
      }
    ],
    subtotal: 650.00,
    tax: 65.00,
    total: 715.00,
    notes: 'Payment due within 30 days. Late fees may apply.'
  });

  const handleBack = () => {
    navigate('/finance/invoices');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    message.info('Download functionality would be implemented here');
  };

  const handleEdit = () => {
    navigate(`/finance/invoices/edit/${id}`);
  };

  const handleDelete = () => {
    Modal.confirm({
      title: 'Are you sure you want to delete this invoice?',
      content: 'This action cannot be undone.',
      onOk: () => {
        message.success('Invoice deleted successfully');
        navigate('/finance/invoices');
      },
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Paid': return 'green';
      case 'Pending': return 'orange';
      case 'Overdue': return 'red';
      case 'Draft': return 'blue';
      default: return 'default';
    }
  };

  const itemColumns = [
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      align: 'center',
    },
    {
      title: 'Unit Price',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      align: 'right',
      render: (price) => `$${price.toFixed(2)}`,
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      render: (total) => `$${total.toFixed(2)}`,
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Space style={{ marginBottom: '16px', width: '100%', justifyContent: 'space-between' }}>
        <Button 
          icon={<ArrowLeftOutlined />} 
          onClick={handleBack}
        >
          Back to Invoices
        </Button>
        
        <Space>
          <Button 
            icon={<EditOutlined />} 
            onClick={handleEdit}
          >
            Edit
          </Button>
          <Button 
            icon={<PrinterOutlined />} 
            onClick={handlePrint}
          >
            Print
          </Button>
          <Button 
            icon={<DownloadOutlined />} 
            onClick={handleDownload}
          >
            Download PDF
          </Button>
          <Button 
            icon={<DeleteOutlined />} 
            danger 
            onClick={handleDelete}
          >
            Delete
          </Button>
        </Space>
      </Space>
      
      <Card title={`Invoice ${invoice.invoiceNumber}`}>
        <Descriptions bordered column={2} style={{ marginBottom: '24px' }}>
          <Descriptions.Item label="Invoice Number">{invoice.invoiceNumber}</Descriptions.Item>
          <Descriptions.Item label="Status">
            <Tag color={getStatusColor(invoice.status)}>{invoice.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Invoice Date">{invoice.date}</Descriptions.Item>
          <Descriptions.Item label="Due Date">{invoice.dueDate}</Descriptions.Item>
        </Descriptions>

        <Divider orientation="left">Customer Information</Divider>
        <Descriptions bordered column={2} style={{ marginBottom: '24px' }}>
          <Descriptions.Item label="Customer Name">{invoice.customer.name}</Descriptions.Item>
          <Descriptions.Item label="Email">{invoice.customer.email}</Descriptions.Item>
          <Descriptions.Item label="Phone">{invoice.customer.phone}</Descriptions.Item>
          <Descriptions.Item label="Address" span={2}>{invoice.customer.address}</Descriptions.Item>
        </Descriptions>

        <Divider orientation="left">Invoice Items</Divider>
        <Table 
          columns={itemColumns}
          dataSource={invoice.items}
          rowKey="id"
          pagination={false}
          style={{ marginBottom: '24px' }}
          summary={() => (
            <Table.Summary>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3}>
                  <strong>Subtotal</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <strong>${invoice.subtotal.toFixed(2)}</strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3}>
                  <strong>Tax (10%)</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <strong>${invoice.tax.toFixed(2)}</strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3}>
                  <strong style={{ fontSize: '16px' }}>Total Amount</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <strong style={{ fontSize: '16px', color: '#1890ff' }}>
                    ${invoice.total.toFixed(2)}
                  </strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />

        {invoice.notes && (
          <>
            <Divider orientation="left">Notes</Divider>
            <Card size="small" style={{ backgroundColor: '#f9f9f9' }}>
              <p style={{ margin: 0 }}>{invoice.notes}</p>
            </Card>
          </>
        )}
      </Card>
    </div>
  );
};

export default InvoiceDetails;