// ========== src/pages/finance/CreateVendorBill.jsx ==========
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Card, Form, Input, Select, DatePicker, Button, Row, Col,
  Typography, Divider, Alert, Space, Table, message, InputNumber
} from 'antd';
import {
  FileTextOutlined, ShopOutlined, CalendarOutlined,
  ArrowLeftOutlined, ReconciliationOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';
import { formatPKR, VALIDATION } from '../../config/constants';
import { parseAmount, formatAmount, addAmounts, subtractAmounts, multiplyAmount } from '../../utils/decimalUtils';
import { getErrorMessage } from '../../utils/errorMessages';

const { Title, Text } = Typography;

const CreateVendorBill = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState(null);

  const purchaseOrderId = searchParams.get('purchaseOrderId');

  // Fetch vendors
  const { data: vendors } = useQuery('vendors', async () => {
    const response = await axios.get('/inventory/vendors');
    return response.data.data;
  });

  // Fetch purchase orders for form (only Sent and Partial)
  const { data: purchaseOrders } = useQuery('purchase-orders-for-bills', async () => {
    const response = await axios.get('/finance/purchase-orders', {
      params: {
        include: 'lineItems'
      }
    });
    // Only show Sent and Partial purchase orders
    return response.data.data.filter(po =>
      po.status === 'Sent' || po.status === 'Partial'
    );
  });

  // Fetch specific PO if purchaseOrderId is provided
  const { data: specificPO, isLoading: poLoading } = useQuery(
    ['purchase-order', purchaseOrderId],
    async () => {
      if (!purchaseOrderId) return null;
      const response = await axios.get(`/finance/purchase-orders/${purchaseOrderId}`);
      return response.data.data;
    },
    { enabled: !!purchaseOrderId }
  );

  // Create Bill mutation
  const billMutation = useMutation(
    (data) => axios.post('/finance/vendor-bills', data),
    {
      onSuccess: () => {
        message.success('Vendor Bill created successfully!');
        queryClient.invalidateQueries(['vendor-bills']);
        queryClient.invalidateQueries(['purchase-orders']);
        navigate('/app/finance/vendor-bills');
      },
      onError: (error) => {
        const errorMessage = getErrorMessage(error, 'bill', 'create');
        message.error(errorMessage);
      }
    }
  );

  // Set initial values when specific PO is loaded
  useEffect(() => {
    if (specificPO) {
      setSelectedVendor(specificPO.vendorId);
      setSelectedPurchaseOrder(specificPO);
      form.setFieldsValue({
        vendorId: specificPO.vendorId,
        purchaseOrderId: specificPO.id,
        subtotal: parseAmount(specificPO.subtotal),
        taxAmount: parseAmount(specificPO.taxAmount)
      });
    }
  }, [specificPO, form]);

  const handleVendorChange = (vendorId) => {
    setSelectedVendor(vendorId);
    setSelectedPurchaseOrder(null);
    form.setFieldsValue({
      purchaseOrderId: undefined,
      subtotal: undefined,
      taxAmount: undefined
    });
  };

  const handlePurchaseOrderChange = (poId) => {
    if (!poId) {
      setSelectedPurchaseOrder(null);
      form.setFieldsValue({
        subtotal: undefined,
        taxAmount: undefined
      });
      return;
    }

    const selectedPO = purchaseOrders?.find(po => po.id === poId);
    if (selectedPO) {
      setSelectedPurchaseOrder(selectedPO);

      // Calculate remaining unbilled amount
      const poTotal = parseAmount(selectedPO.total);
      const billedAmount = parseAmount(selectedPO.billedAmount);
      const remainingUnbilled = subtractAmounts(poTotal, billedAmount);

      // Calculate proportional subtotal and tax from remaining unbilled
      const poSubtotal = parseAmount(selectedPO.subtotal);
      const poTaxAmount = parseAmount(selectedPO.taxAmount);
      const poTotalCalc = addAmounts(poSubtotal, poTaxAmount);

      const ratio = poTotalCalc > 0 ? remainingUnbilled / poTotalCalc : 0;
      const calculatedSubtotal = multiplyAmount(poSubtotal, ratio, 2);
      const calculatedTax = multiplyAmount(poTaxAmount, ratio, 2);

      form.setFieldsValue({
        subtotal: calculatedSubtotal,
        taxAmount: calculatedTax
      });
      message.success(`Populated remaining unbilled amount (${formatPKR(remainingUnbilled)}) from PO ${selectedPO.poNumber}`);
    }
  };

  const handleSubmit = (values) => {
    const subtotal = parseAmount(values.subtotal);
    const taxAmount = parseAmount(values.taxAmount);

    const billData = {
      ...values,
      billDate: values.billDate.toISOString(),
      dueDate: values.dueDate ? values.dueDate.toISOString() : null,
      subtotal: subtotal,
      taxAmount: taxAmount,
      total: addAmounts(subtotal, taxAmount)
    };
    billMutation.mutate(billData);
  };

  // Filter purchase orders for selected vendor
  const filteredPurchaseOrders = React.useMemo(() => {
    if (!selectedVendor || !purchaseOrders) return [];
    return purchaseOrders.filter(po => po.vendorId === selectedVendor);
  }, [selectedVendor, purchaseOrders]);

  const lineItemColumns = [
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
      width: 100
    },
    {
      title: 'Unit Price',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      align: 'right',
      width: 120,
      render: (price) => formatPKR(parseAmount(price))
    },
    {
      title: 'Total',
      dataIndex: 'totalPrice',
      key: 'totalPrice',
      align: 'right',
      width: 120,
      render: (total) => (
        <Text strong style={{ color: '#1890ff' }}>
          {formatPKR(parseAmount(total))}
        </Text>
      )
    }
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/app/finance/vendor-bills')}
            />
            <FileTextOutlined />
            Create Vendor Bill
            {specificPO && (
              <Text type="secondary">- PO {specificPO.poNumber}</Text>
            )}
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            billDate: dayjs(),
            taxAmount: 0
          }}
        >
          <Row gutter={[24, 0]}>
            <Col xs={24} lg={12}>
              <Card title="Bill Details" size="small">
                <Form.Item
                  label="Vendor"
                  name="vendorId"
                  rules={[{ required: true, message: 'Please select a vendor' }]}
                >
                  <Select
                    placeholder="Select vendor"
                    showSearch
                    optionFilterProp="children"
                    onChange={handleVendorChange}
                    disabled={!!specificPO}
                  >
                    {vendors?.map(vendor => (
                      <Select.Option key={vendor.id} value={vendor.id}>
                        {vendor.name} ({vendor.code})
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item
                  label="Purchase Order (Optional)"
                  name="purchaseOrderId"
                  help="Link to a PO to auto-populate amounts"
                >
                  <Select
                    placeholder={
                      !selectedVendor
                        ? "Select vendor first"
                        : filteredPurchaseOrders.length === 0
                        ? "No POs available for this vendor"
                        : "Select PO to auto-populate amounts"
                    }
                    allowClear={!specificPO}
                    showSearch
                    optionFilterProp="children"
                    onChange={handlePurchaseOrderChange}
                    disabled={!selectedVendor || filteredPurchaseOrders.length === 0}
                  >
                    {filteredPurchaseOrders.map(po => (
                      <Select.Option key={po.id} value={po.id}>
                        {po.poNumber} - {formatPKR(parseAmount(po.total))}
                        {' (Unbilled: '}
                        {formatPKR(subtractAmounts(po.total, po.billedAmount))}
                        {')'}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      label="Bill Date"
                      name="billDate"
                      rules={[{ required: true, message: 'Please select bill date' }]}
                    >
                      <DatePicker style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      label="Due Date"
                      name="dueDate"
                    >
                      <DatePicker style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>

                <Divider />

                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      label="Subtotal (PKR)"
                      name="subtotal"
                      rules={[
                        { required: true, message: 'Please enter subtotal' },
                        { type: 'number', min: 0, message: 'Amount must be positive' },
                        {
                          validator: (_, value) => {
                            if (!selectedPurchaseOrder) {
                              return Promise.resolve();
                            }

                            const subtotal = parseAmount(value);
                            const taxAmount = parseAmount(form.getFieldValue('taxAmount'));
                            const billTotal = addAmounts(subtotal, taxAmount);

                            const poTotal = parseAmount(selectedPurchaseOrder.total);
                            const billedAmount = parseAmount(selectedPurchaseOrder.billedAmount);
                            const remainingUnbilled = subtractAmounts(poTotal, billedAmount);

                            if (billTotal > remainingUnbilled + 0.01) {
                              return Promise.reject(
                                new Error(`Bill total (${formatPKR(billTotal)}) cannot exceed remaining unbilled amount (${formatPKR(remainingUnbilled)})`)
                              );
                            }

                            return Promise.resolve();
                          }
                        }
                      ]}
                    >
                      <InputNumber
                        style={{ width: '100%' }}
                        precision={2}
                        min={0}
                        max={VALIDATION.MAX_AMOUNT}
                        step={0.01}
                        placeholder="0.00"
                        onChange={() => {
                          // Re-validate when subtotal changes
                          form.validateFields(['taxAmount']).catch(() => {});
                        }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      label="Tax Amount (PKR)"
                      name="taxAmount"
                      rules={[
                        { type: 'number', min: 0, message: 'Amount must be positive' }
                      ]}
                    >
                      <InputNumber
                        style={{ width: '100%' }}
                        precision={2}
                        min={0}
                        max={VALIDATION.MAX_AMOUNT}
                        step={0.01}
                        placeholder="0.00"
                        onChange={() => {
                          // Re-validate subtotal when tax amount changes
                          form.validateFields(['subtotal']).catch(() => {});
                        }}
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item label="Total (PKR)">
                  <InputNumber
                    style={{ width: '100%' }}
                    precision={2}
                    value={
                      addAmounts(
                        parseAmount(form.getFieldValue('subtotal')),
                        parseAmount(form.getFieldValue('taxAmount'))
                      )
                    }
                    disabled
                  />
                </Form.Item>
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              {selectedVendor && vendors && (
                <Card title="Vendor Information" size="small">
                  {(() => {
                    const vendor = vendors.find(v => v.id === selectedVendor);
                    if (!vendor) return null;
                    return (
                      <div>
                        <Row gutter={[16, 8]}>
                          <Col span={12}>
                            <Text strong>Vendor Name:</Text>
                            <br />
                            {vendor.name}
                          </Col>
                          <Col span={12}>
                            <Text strong>Vendor Code:</Text>
                            <br />
                            {vendor.code}
                          </Col>
                          <Col span={12}>
                            <Text strong>Contact Person:</Text>
                            <br />
                            {vendor.contactPerson || 'N/A'}
                          </Col>
                          <Col span={12}>
                            <Text strong>Phone:</Text>
                            <br />
                            {vendor.phone || 'N/A'}
                          </Col>
                          <Col span={24}>
                            <Text strong>Address:</Text>
                            <br />
                            {vendor.address || 'N/A'}
                          </Col>
                          <Col span={12}>
                            <Text strong>Current Balance:</Text>
                            <br />
                            <Text style={{ color: '#f5222d', fontWeight: 'bold' }}>
                              {formatPKR(parseAmount(vendor.currentBalance))}
                            </Text>
                          </Col>
                        </Row>
                      </div>
                    );
                  })()}
                </Card>
              )}

              {selectedPurchaseOrder && (
                <Card
                  title={
                    <Space>
                      <ReconciliationOutlined />
                      Purchase Order: {selectedPurchaseOrder.poNumber}
                    </Space>
                  }
                  size="small"
                  style={{ marginTop: 16 }}
                >
                  <Row gutter={[16, 8]} style={{ marginBottom: 16 }}>
                    <Col span={12}>
                      <Text strong>PO Date:</Text>
                      <br />
                      {dayjs(selectedPurchaseOrder.poDate).format('DD/MM/YYYY')}
                    </Col>
                    <Col span={12}>
                      <Text strong>Status:</Text>
                      <br />
                      <span style={{
                        color: selectedPurchaseOrder.status === 'Completed' ? '#52c41a' :
                              selectedPurchaseOrder.status === 'Sent' ? '#1890ff' : '#faad14'
                      }}>
                        {selectedPurchaseOrder.status}
                      </span>
                    </Col>
                    <Col span={12}>
                      <Text strong>Total Amount:</Text>
                      <br />
                      {formatPKR(parseAmount(selectedPurchaseOrder.total))}
                    </Col>
                    <Col span={12}>
                      <Text strong>Billed Amount:</Text>
                      <br />
                      <Text style={{ color: '#faad14' }}>
                        {formatPKR(parseAmount(selectedPurchaseOrder.billedAmount))}
                      </Text>
                    </Col>
                  </Row>

                  {selectedPurchaseOrder.lineItems && selectedPurchaseOrder.lineItems.length > 0 && (
                    <>
                      <Divider style={{ margin: '12px 0' }} />
                      <Text strong style={{ display: 'block', marginBottom: 8 }}>Line Items</Text>
                      <Table
                        size="small"
                        columns={lineItemColumns}
                        dataSource={selectedPurchaseOrder.lineItems}
                        pagination={false}
                        rowKey="id"
                        scroll={{ y: 200 }}
                        summary={() => (
                          <Table.Summary>
                            <Table.Summary.Row>
                              <Table.Summary.Cell index={0} colSpan={3}>
                                <Text strong>Total</Text>
                              </Table.Summary.Cell>
                              <Table.Summary.Cell index={3} align="right">
                                <Text strong style={{ color: '#1890ff' }}>
                                  {formatPKR(parseAmount(selectedPurchaseOrder.total))}
                                </Text>
                              </Table.Summary.Cell>
                            </Table.Summary.Row>
                          </Table.Summary>
                        )}
                      />
                    </>
                  )}
                </Card>
              )}
            </Col>
          </Row>

          <Divider />

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => navigate('/app/finance/vendor-bills')}>
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={billMutation.isLoading}
                icon={<FileTextOutlined />}
              >
                Create Bill
              </Button>
            </Space>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default CreateVendorBill;
