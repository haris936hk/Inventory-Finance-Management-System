// ========== src/pages/finance/VendorBills.jsx ==========
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, Button, Space, Tag, Input, Select, DatePicker,
  Row, Col, Statistic, Badge, Dropdown, message, Modal, Form,
  Divider, InputNumber, Progress, Alert
} from 'antd';
import {
  PlusOutlined, SearchOutlined, FilterOutlined, PrinterOutlined,
  EyeOutlined, EditOutlined, DeleteOutlined, ShopOutlined,
  MailOutlined, FilePdfOutlined, MoreOutlined, CheckOutlined,
  SendOutlined, StopOutlined, DollarCircleOutlined, FileTextOutlined,
  ExclamationCircleOutlined, ClockCircleOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import { useAuthStore } from '../../stores/authStore';
import { formatPKR } from '../../config/constants';

const { RangePicker } = DatePicker;
const { Search } = Input;
const { TextArea } = Input;

const VendorBills = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [filters, setFilters] = useState({});
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState(null);
  const [selectedVendorId, setSelectedVendorId] = useState(null);
  const [form] = Form.useForm();

  // Fetch vendor bills
  const { data: vendorBillsData, isLoading } = useQuery(
    ['vendor-bills', filters],
    async () => {
      const response = await axios.get('/finance/vendor-bills', { params: filters });
      return response.data.data;
    }
  );

  // Fetch vendors for filter and form
  const { data: vendors } = useQuery('vendors', async () => {
    const response = await axios.get('/inventory/vendors');
    return response.data.data;
  });

  // Fetch purchase orders for form (including line items)
  const { data: purchaseOrders } = useQuery('purchase-orders', async () => {
    const response = await axios.get('/finance/purchase-orders', {
      params: {
        status: 'Completed',
        include: 'lineItems' // Request line items to be included
      }
    });
    return response.data.data;
  });

  // Calculate statistics
  const statistics = React.useMemo(() => {
    if (!vendorBillsData) return { total: 0, unpaid: 0, partial: 0, paid: 0, overdue: 0 };

    const today = new Date();
    return vendorBillsData.reduce((acc, bill) => {
      const billTotal = parseFloat(bill.total);
      const paidAmount = parseFloat(bill.paidAmount) || 0;
      const balance = billTotal - paidAmount;

      acc.total += billTotal;

      switch (bill.status) {
        case 'Unpaid':
          acc.unpaid += balance;
          if (bill.dueDate && new Date(bill.dueDate) < today) {
            acc.overdue += balance;
          }
          break;
        case 'Partial':
          acc.partial += balance;
          if (bill.dueDate && new Date(bill.dueDate) < today) {
            acc.overdue += balance;
          }
          break;
        case 'Paid':
          acc.paid += billTotal;
          break;
      }
      return acc;
    }, { total: 0, unpaid: 0, partial: 0, paid: 0, overdue: 0 });
  }, [vendorBillsData]);

  // Create/Update Bill mutation
  const billMutation = useMutation(
    (data) => {
      if (editingBill) {
        return axios.put(`/finance/vendor-bills/${editingBill.id}`, data);
      }
      return axios.post('/finance/vendor-bills', data);
    },
    {
      onSuccess: () => {
        message.success(`Vendor Bill ${editingBill ? 'updated' : 'created'} successfully`);
        queryClient.invalidateQueries('vendor-bills');
        handleCloseModal();
      },
      onError: (error) => {
        console.error('Bill operation failed:', error);
        const errorMessage = error.response?.data?.message || error.message || 'An error occurred';
        message.error(errorMessage);
      }
    }
  );

  // Update status mutation
  const updateStatusMutation = useMutation(
    ({ id, status }) => axios.put(`/finance/vendor-bills/${id}/status`, { status }),
    {
      onSuccess: () => {
        message.success('Bill status updated');
        queryClient.invalidateQueries('vendor-bills');
      }
    }
  );

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingBill(null);
    setSelectedPurchaseOrder(null);
    setSelectedVendorId(null);
    form.resetFields();
  };

  // Handle vendor selection and reset PO when vendor changes
  const handleVendorChange = (vendorId) => {
    setSelectedVendorId(vendorId);

    // Clear PO selection and amounts when vendor changes
    setSelectedPurchaseOrder(null);
    form.setFieldsValue({
      purchaseOrderId: null,
      subtotal: null,
      taxAmount: null
    });
  };

  // Handle purchase order selection and auto-populate form fields
  const handlePurchaseOrderChange = (poId) => {
    if (!poId) {
      setSelectedPurchaseOrder(null);
      // Reset financial fields when PO is cleared
      form.setFieldsValue({
        subtotal: null,
        taxAmount: null
      });
      return;
    }

    const selectedPO = purchaseOrders?.find(po => po.id === poId);
    if (selectedPO) {
      setSelectedPurchaseOrder(selectedPO);

      // Auto-populate financial fields from PO (no longer set vendor since it's already selected)
      form.setFieldsValue({
        subtotal: parseFloat(selectedPO.subtotal || 0),
        taxAmount: parseFloat(selectedPO.taxAmount || 0)
      });

      message.success(`Populated bill amounts from PO ${selectedPO.poNumber}`);
    }
  };

  // Filter purchase orders for selected vendor
  const filteredPurchaseOrders = React.useMemo(() => {
    if (!selectedVendorId || !purchaseOrders) return [];
    return purchaseOrders.filter(po => po.vendorId === selectedVendorId);
  }, [selectedVendorId, purchaseOrders]);

  const getStatusColor = (status) => {
    const colors = {
      'Unpaid': 'red',
      'Partial': 'orange',
      'Paid': 'green'
    };
    return colors[status] || 'default';
  };

  const handleStatusChange = (record, newStatus) => {
    Modal.confirm({
      title: `Change Status to ${newStatus}`,
      content: `Are you sure you want to change this bill status to ${newStatus}?`,
      onOk: () => updateStatusMutation.mutate({ id: record.id, status: newStatus })
    });
  };

  const getStatusActions = (record) => {
    const items = [];

    switch (record.status) {
      case 'Unpaid':
        items.push({
          key: 'partial',
          icon: <ClockCircleOutlined />,
          label: 'Mark Partial',
          onClick: () => handleStatusChange(record, 'Partial')
        });
        items.push({
          key: 'paid',
          icon: <CheckOutlined />,
          label: 'Mark Paid',
          onClick: () => handleStatusChange(record, 'Paid')
        });
        break;
      case 'Partial':
        items.push({
          key: 'paid',
          icon: <CheckOutlined />,
          label: 'Mark Paid',
          onClick: () => handleStatusChange(record, 'Paid')
        });
        break;
    }

    return items;
  };

  const isOverdue = (bill) => {
    if (!bill.dueDate || bill.status === 'Paid') return false;
    return new Date(bill.dueDate) < new Date();
  };

  const getPaymentProgress = (bill) => {
    const total = parseFloat(bill.total);
    const paid = parseFloat(bill.paidAmount) || 0;
    return Math.round((paid / total) * 100);
  };

  const columns = [
    {
      title: 'Bill Number',
      dataIndex: 'billNumber',
      key: 'billNumber',
      fixed: 'left',
      width: 140,
      render: (text, record) => (
        <Button
          type="link"
          onClick={() => navigate(`/app/finance/vendor-bills/${record.id}`)}
          style={{ padding: 0, fontWeight: 'bold' }}
        >
          {text}
        </Button>
      ),
    },
    {
      title: 'Vendor',
      dataIndex: 'vendor',
      key: 'vendor',
      width: 180,
      render: (vendor) => (
        <Space>
          <ShopOutlined />
          <span>{vendor?.name}</span>
        </Space>
      ),
    },
    {
      title: 'Bill Date',
      dataIndex: 'billDate',
      key: 'billDate',
      width: 120,
      render: (date) => new Date(date).toLocaleDateString('en-GB'),
    },
    {
      title: 'Due Date',
      dataIndex: 'dueDate',
      key: 'dueDate',
      width: 120,
      render: (date, record) => {
        if (!date) return '-';
        const formatted = new Date(date).toLocaleDateString('en-GB');
        const overdue = isOverdue(record);
        return (
          <span style={{ color: overdue ? '#ff4d4f' : 'inherit' }}>
            {overdue && <ExclamationCircleOutlined style={{ marginRight: 4 }} />}
            {formatted}
          </span>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status, record) => {
        const overdue = isOverdue(record);
        return (
          <Space direction="vertical" size="small">
            <Tag color={getStatusColor(status)}>{status}</Tag>
            {overdue && <Tag color="red" size="small">OVERDUE</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'PO Number',
      dataIndex: 'purchaseOrder',
      key: 'purchaseOrder',
      width: 120,
      render: (po) => po ? (
        <Button
          type="link"
          size="small"
          onClick={() => navigate(`/app/finance/purchase-orders/${po.id}`)}
        >
          {po.poNumber}
        </Button>
      ) : '-',
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      width: 120,
      align: 'right',
      render: (amount) => (
        <span style={{ fontWeight: 'bold', color: '#1890ff' }}>
          {formatPKR(Number(amount))}
        </span>
      ),
    },
    {
      title: 'Paid',
      dataIndex: 'paidAmount',
      key: 'paidAmount',
      width: 120,
      align: 'right',
      render: (paidAmount) => (
        <span style={{ color: '#52c41a' }}>
          {formatPKR(Number(paidAmount || 0))}
        </span>
      ),
    },
    {
      title: 'Progress',
      key: 'progress',
      width: 100,
      render: (_, record) => (
        <Progress
          percent={getPaymentProgress(record)}
          size="small"
          status={record.status === 'Paid' ? 'success' : 'active'}
        />
      ),
    },
    {
      title: 'Payments',
      key: 'paymentsCount',
      width: 80,
      align: 'center',
      render: (_, record) => (
        <Badge
          count={record._count?.payments || 0}
          showZero
          style={{ backgroundColor: '#1890ff' }}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 120,
      render: (_, record) => {
        const statusActions = getStatusActions(record);
        const menuItems = [
          {
            key: 'view',
            icon: <EyeOutlined />,
            label: 'View Details',
            onClick: () => navigate(`/app/finance/vendor-bills/${record.id}`)
          },
          {
            key: 'edit',
            icon: <EditOutlined />,
            label: 'Edit',
            disabled: record.status === 'Paid',
            onClick: () => {
              setEditingBill(record);
              form.setFieldsValue({
                ...record,
                billDate: record.billDate ? dayjs(record.billDate) : null,
                dueDate: record.dueDate ? dayjs(record.dueDate) : null
              });
              setModalVisible(true);
            }
          },
          { type: 'divider' },
          ...statusActions,
          { type: 'divider' },
          {
            key: 'payment',
            icon: <DollarCircleOutlined />,
            label: 'Record Payment',
            onClick: () => navigate(`/app/finance/vendor-payments/record?billId=${record.id}`)
          },
          {
            key: 'print',
            icon: <PrinterOutlined />,
            label: 'Print',
            onClick: () => message.info('Print functionality coming soon')
          }
        ];

        return (
          <Space>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/app/finance/vendor-bills/${record.id}`)}
            />
            <Dropdown menu={{ items: menuItems }} placement="bottomRight">
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  const handleFormSubmit = (values) => {
    const processedValues = {
      ...values,
      billDate: values.billDate ? values.billDate.toISOString() : new Date().toISOString(),
      dueDate: values.dueDate ? values.dueDate.toISOString() : null,
      subtotal: parseFloat(values.subtotal) || 0,
      taxAmount: parseFloat(values.taxAmount) || 0,
      total: (parseFloat(values.subtotal) || 0) + (parseFloat(values.taxAmount) || 0)
    };
    billMutation.mutate(processedValues);
  };

  return (
    <>
      {/* Statistics Cards */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Bills"
              value={statistics.total}
              prefix="PKR"
              precision={0}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Unpaid"
              value={statistics.unpaid}
              prefix="PKR"
              precision={0}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Partial"
              value={statistics.partial}
              prefix="PKR"
              precision={0}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Overdue"
              value={statistics.overdue}
              prefix="PKR"
              precision={0}
              valueStyle={{ color: '#ff7875' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Table Card */}
      <Card
        title={
          <Space>
            <FileTextOutlined />
            Vendor Bills
          </Space>
        }
        extra={
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setModalVisible(true)}
              disabled={!hasPermission('finance.create')}
            >
              New Bill
            </Button>
          </Space>
        }
      >
        {/* Filters */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={8} md={6}>
            <Search
              placeholder="Search bill number..."
              onSearch={(value) => setFilters({...filters, search: value})}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Select
              placeholder="All Vendors"
              allowClear
              style={{ width: '100%' }}
              onChange={(value) => setFilters({...filters, vendorId: value})}
            >
              {vendors?.map(vendor => (
                <Select.Option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </Select.Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Select
              placeholder="All Status"
              allowClear
              style={{ width: '100%' }}
              onChange={(value) => setFilters({...filters, status: value})}
            >
              <Select.Option value="Unpaid">Unpaid</Select.Option>
              <Select.Option value="Partial">Partial</Select.Option>
              <Select.Option value="Paid">Paid</Select.Option>
            </Select>
          </Col>
          <Col xs={24} sm={8} md={6}>
            <RangePicker
              style={{ width: '100%' }}
              onChange={(dates) => {
                setFilters({
                  ...filters,
                  dateFrom: dates?.[0]?.format('YYYY-MM-DD'),
                  dateTo: dates?.[1]?.format('YYYY-MM-DD')
                });
              }}
            />
          </Col>
        </Row>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={vendorBillsData}
          loading={isLoading}
          scroll={{ x: 1400 }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          }}
        />
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={editingBill ? 'Edit Vendor Bill' : 'Create Vendor Bill'}
        open={modalVisible}
        onCancel={handleCloseModal}
        footer={null}
        width={900}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFormSubmit}
          initialValues={{
            billDate: dayjs(),
            status: 'Unpaid',
            taxAmount: 0
          }}
        >
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Vendor"
                name="vendorId"
                rules={[{ required: true, message: 'Please select a vendor' }]}
              >
                <Select
                  placeholder="Select vendor first"
                  showSearch
                  optionFilterProp="children"
                  onChange={handleVendorChange}
                >
                  {vendors?.map(vendor => (
                    <Select.Option key={vendor.id} value={vendor.id}>
                      {vendor.name} ({vendor.code})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Purchase Order (Optional)"
                name="purchaseOrderId"
              >
                <Select
                  placeholder={
                    !selectedVendorId
                      ? "Select vendor first"
                      : filteredPurchaseOrders.length === 0
                      ? "No POs available for this vendor"
                      : "Select PO to auto-populate amounts"
                  }
                  allowClear
                  showSearch
                  optionFilterProp="children"
                  onChange={handlePurchaseOrderChange}
                  disabled={!selectedVendorId || filteredPurchaseOrders.length === 0}
                  notFoundContent={
                    !selectedVendorId
                      ? "Please select a vendor first"
                      : "No purchase orders found for this vendor"
                  }
                >
                  {filteredPurchaseOrders.map(po => (
                    <Select.Option key={po.id} value={po.id}>
                      {po.poNumber} ({formatPKR(Number(po.total || 0))})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Bill Date"
                name="billDate"
                rules={[{ required: true, message: 'Please select bill date' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Due Date" name="dueDate">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          {/* Informational Alert */}
          <Alert
            message="Smart Bill Creation"
            description="First select a vendor, then choose a Purchase Order to automatically populate subtotal and tax amounts. You can still adjust the amounts if needed."
            type="info"
            icon={<InfoCircleOutlined />}
            style={{ marginBottom: 16 }}
            showIcon
          />

          <Divider />

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Subtotal (PKR)"
                name="subtotal"
                rules={[
                  { required: true, message: 'Please enter subtotal' },
                  { type: 'number', min: 0, message: 'Amount must be positive' }
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  precision={2}
                  min={0}
                  placeholder="0.00"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Tax Amount (PKR)"
                name="taxAmount"
                rules={[{ type: 'number', min: 0, message: 'Amount must be positive' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  precision={2}
                  min={0}
                  placeholder="0.00"
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Purchase Order Line Items Preview */}
          {selectedPurchaseOrder && (
            <>
              <Divider />
              <Card
                size="small"
                title={`Purchase Order ${selectedPurchaseOrder.poNumber} - Line Items`}
                style={{ backgroundColor: '#f9f9f9' }}
              >
                <Table
                  size="small"
                  dataSource={selectedPurchaseOrder.lineItems || []}
                  pagination={false}
                  rowKey="id"
                  columns={[
                    {
                      title: 'Description',
                      dataIndex: 'description',
                      key: 'description'
                    },
                    {
                      title: 'Quantity',
                      dataIndex: 'quantity',
                      key: 'quantity',
                      align: 'center',
                      width: 80
                    },
                    {
                      title: 'Unit Price',
                      dataIndex: 'unitPrice',
                      key: 'unitPrice',
                      align: 'right',
                      width: 100,
                      render: (price) => formatPKR(Number(price))
                    },
                    {
                      title: 'Total',
                      dataIndex: 'totalPrice',
                      key: 'totalPrice',
                      align: 'right',
                      width: 100,
                      render: (total) => (
                        <span style={{ fontWeight: 'bold' }}>
                          {formatPKR(Number(total))}
                        </span>
                      )
                    }
                  ]}
                  summary={() => (
                    <Table.Summary>
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={3}>
                          <span style={{ fontWeight: 'bold' }}>Total</span>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3}>
                          <span style={{ fontWeight: 'bold', color: '#1890ff' }}>
                            {formatPKR(Number(selectedPurchaseOrder.total || 0))}
                          </span>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  )}
                />
              </Card>
            </>
          )}

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={handleCloseModal}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={billMutation.isLoading}>
                {editingBill ? 'Update' : 'Create'}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </>
  );
};

export default VendorBills;