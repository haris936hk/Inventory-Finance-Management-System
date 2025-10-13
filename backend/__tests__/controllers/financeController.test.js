/**
 * Finance Controller Test Suite
 *
 * Tests for financeController.js
 * Covers:
 * - HTTP request/response handling
 * - Status codes (200, 201, 400, 404, 500)
 * - Error propagation
 * - Request parameter extraction
 * - Response formatting
 */

const financeController = require('../../src/controllers/financeController');
const financeService = require('../../src/services/financeService');
const purchaseOrderService = require('../../src/services/purchaseOrderService');
const billService = require('../../src/services/billService');
const paymentService = require('../../src/services/paymentService');
const invoiceService = require('../../src/services/invoiceService');
const customerPaymentService = require('../../src/services/customerPaymentService');

// Mock all services
jest.mock('../../src/services/financeService');
jest.mock('../../src/services/purchaseOrderService');
jest.mock('../../src/services/billService');
jest.mock('../../src/services/paymentService');
jest.mock('../../src/services/invoiceService');
jest.mock('../../src/services/customerPaymentService');

describe('FinanceController', () => {

  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock request object
    mockReq = {
      params: {},
      query: {},
      body: {},
      user: { id: 'user-id', fullName: 'Test User' }
    };

    // Mock response object
    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
  });

  // ===========================
  // Customer Endpoints
  // ===========================

  describe('GET /customers', () => {

    it('should return all customers with 200 status', async () => {
      // Arrange
      const mockCustomers = [
        { id: 'customer-1', name: 'Customer A' },
        { id: 'customer-2', name: 'Customer B' }
      ];
      financeService.getCustomers.mockResolvedValue(mockCustomers);

      // Act
      await financeController.getCustomers(mockReq, mockRes);

      // Assert
      expect(financeService.getCustomers).toHaveBeenCalledWith({ search: undefined });
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        data: mockCustomers
      });
    });

    it('should pass search filter to service', async () => {
      // Arrange
      mockReq.query.search = 'John';
      financeService.getCustomers.mockResolvedValue([]);

      // Act
      await financeController.getCustomers(mockReq, mockRes);

      // Assert
      expect(financeService.getCustomers).toHaveBeenCalledWith({ search: 'John' });
    });
  });

  describe('GET /customers/:id', () => {

    it('should return single customer with 200 status', async () => {
      // Arrange
      const mockCustomer = { id: 'customer-id', name: 'Customer A' };
      mockReq.params.id = 'customer-id';
      financeService.getCustomerById.mockResolvedValue(mockCustomer);

      // Act
      await financeController.getCustomer(mockReq, mockRes);

      // Assert
      expect(financeService.getCustomerById).toHaveBeenCalledWith('customer-id');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockCustomer
      });
    });

    it('should return 404 if customer not found', async () => {
      // Arrange
      mockReq.params.id = 'nonexistent-id';
      financeService.getCustomerById.mockResolvedValue(null);

      // Act & Assert
      await expect(financeController.getCustomer(mockReq, mockRes))
        .rejects
        .toThrow('Customer not found');
      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('POST /customers', () => {

    it('should create customer with 201 status', async () => {
      // Arrange
      const customerData = { name: 'New Customer', phone: '1234567890' };
      const createdCustomer = { id: 'customer-id', ...customerData };
      mockReq.body = customerData;
      financeService.createCustomer.mockResolvedValue(createdCustomer);

      // Act
      await financeController.createCustomer(mockReq, mockRes);

      // Assert
      expect(financeService.createCustomer).toHaveBeenCalledWith(customerData);
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: createdCustomer
      });
    });
  });

  describe('PUT /customers/:id', () => {

    it('should update customer with 200 status', async () => {
      // Arrange
      const updates = { name: 'Updated Name' };
      const updatedCustomer = { id: 'customer-id', ...updates };
      mockReq.params.id = 'customer-id';
      mockReq.body = updates;
      financeService.updateCustomer.mockResolvedValue(updatedCustomer);

      // Act
      await financeController.updateCustomer(mockReq, mockRes);

      // Assert
      expect(financeService.updateCustomer).toHaveBeenCalledWith('customer-id', updates);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: updatedCustomer
      });
    });
  });

  describe('GET /customers/:id/ledger', () => {

    it('should return customer ledger', async () => {
      // Arrange
      const mockLedger = [
        { date: '2025-01-15', description: 'Invoice', debit: 10000 }
      ];
      mockReq.params.id = 'customer-id';
      financeService.getCustomerLedger.mockResolvedValue(mockLedger);

      // Act
      await financeController.getCustomerLedger(mockReq, mockRes);

      // Assert
      expect(financeService.getCustomerLedger).toHaveBeenCalledWith('customer-id');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockLedger
      });
    });
  });

  // ===========================
  // Invoice Endpoints
  // ===========================

  describe('GET /invoices', () => {

    it('should return all invoices with filters', async () => {
      // Arrange
      const mockInvoices = [{ id: 'invoice-1' }, { id: 'invoice-2' }];
      mockReq.query = {
        status: 'Paid',
        customerId: 'customer-id',
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31'
      };
      financeService.getInvoices.mockResolvedValue(mockInvoices);

      // Act
      await financeController.getInvoices(mockReq, mockRes);

      // Assert
      expect(financeService.getInvoices).toHaveBeenCalledWith({
        status: 'Paid',
        customerId: 'customer-id',
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31'
      });
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        data: mockInvoices
      });
    });
  });

  describe('GET /invoices/:id', () => {

    it('should return single invoice', async () => {
      // Arrange
      const mockInvoice = { id: 'invoice-id', invoiceNumber: 'INV-001' };
      mockReq.params.id = 'invoice-id';
      financeService.getInvoiceById.mockResolvedValue(mockInvoice);

      // Act
      await financeController.getInvoice(mockReq, mockRes);

      // Assert
      expect(financeService.getInvoiceById).toHaveBeenCalledWith('invoice-id');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockInvoice
      });
    });

    it('should return 404 if invoice not found', async () => {
      // Arrange
      mockReq.params.id = 'nonexistent-id';
      financeService.getInvoiceById.mockResolvedValue(null);

      // Act & Assert
      await expect(financeController.getInvoice(mockReq, mockRes))
        .rejects
        .toThrow('Invoice not found');
      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('POST /invoices', () => {

    it('should create invoice with 201 status', async () => {
      // Arrange
      const invoiceData = {
        customerId: 'customer-id',
        items: [{ itemId: 'item-1', price: 10000 }],
        total: 10000
      };
      const createdInvoice = { id: 'invoice-id', ...invoiceData };
      mockReq.body = invoiceData;
      financeService.createInvoice.mockResolvedValue(createdInvoice);

      // Act
      await financeController.createInvoice(mockReq, mockRes);

      // Assert
      expect(financeService.createInvoice).toHaveBeenCalledWith(invoiceData, 'user-id');
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: createdInvoice
      });
    });
  });

  describe('PUT /invoices/:id/status', () => {

    it('should update invoice status', async () => {
      // Arrange
      const updatedInvoice = { id: 'invoice-id', status: 'Sent' };
      mockReq.params.id = 'invoice-id';
      mockReq.body.status = 'Sent';
      financeService.updateInvoiceStatus.mockResolvedValue(updatedInvoice);

      // Act
      await financeController.updateInvoiceStatus(mockReq, mockRes);

      // Assert
      expect(financeService.updateInvoiceStatus).toHaveBeenCalledWith('invoice-id', 'Sent', 'user-id');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: updatedInvoice
      });
    });

    it('should return 400 if status not provided', async () => {
      // Arrange
      mockReq.params.id = 'invoice-id';
      mockReq.body = {}; // No status

      // Act & Assert
      await expect(financeController.updateInvoiceStatus(mockReq, mockRes))
        .rejects
        .toThrow('Status required');
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /invoices/:id/cancel', () => {

    it('should cancel invoice', async () => {
      // Arrange
      const cancelledInvoice = { id: 'invoice-id', cancelledAt: new Date() };
      mockReq.params.id = 'invoice-id';
      mockReq.body.reason = 'Customer request';
      invoiceService.cancelInvoice.mockResolvedValue(cancelledInvoice);

      // Act
      await financeController.cancelInvoice(mockReq, mockRes);

      // Assert
      expect(invoiceService.cancelInvoice).toHaveBeenCalledWith('invoice-id', 'Customer request', 'user-id');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Invoice cancelled successfully',
        data: cancelledInvoice
      });
    });

    it('should return 400 if reason not provided', async () => {
      // Arrange
      mockReq.params.id = 'invoice-id';
      mockReq.body = {}; // No reason

      // Act & Assert
      await expect(financeController.cancelInvoice(mockReq, mockRes))
        .rejects
        .toThrow('Cancellation reason is required');
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 if reason is empty string', async () => {
      // Arrange
      mockReq.params.id = 'invoice-id';
      mockReq.body.reason = '   '; // Empty after trim

      // Act & Assert
      await expect(financeController.cancelInvoice(mockReq, mockRes))
        .rejects
        .toThrow('Cancellation reason is required');
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  // ===========================
  // Payment Endpoints
  // ===========================

  describe('POST /payments', () => {

    it('should record payment with 201 status', async () => {
      // Arrange
      const paymentData = {
        invoiceId: 'invoice-id',
        amount: 10000,
        method: 'Cash'
      };
      const createdPayment = { id: 'payment-id', ...paymentData };
      mockReq.body = paymentData;
      financeService.recordPayment.mockResolvedValue(createdPayment);

      // Act
      await financeController.recordPayment(mockReq, mockRes);

      // Assert
      expect(financeService.recordPayment).toHaveBeenCalledWith(paymentData, 'user-id');
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: createdPayment
      });
    });
  });

  describe('POST /payments/:id/void', () => {

    it('should void payment', async () => {
      // Arrange
      const voidedPayment = { id: 'payment-id', voidedAt: new Date() };
      mockReq.params.id = 'payment-id';
      mockReq.body.reason = 'Incorrect amount';
      customerPaymentService.voidPayment.mockResolvedValue(voidedPayment);

      // Act
      await financeController.voidCustomerPayment(mockReq, mockRes);

      // Assert
      expect(customerPaymentService.voidPayment).toHaveBeenCalledWith('payment-id', 'Incorrect amount', 'user-id');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Payment voided successfully',
        data: voidedPayment
      });
    });

    it('should return 400 if reason not provided', async () => {
      // Arrange
      mockReq.params.id = 'payment-id';
      mockReq.body = {}; // No reason

      // Act & Assert
      await expect(financeController.voidCustomerPayment(mockReq, mockRes))
        .rejects
        .toThrow('Void reason is required');
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  // ===========================
  // Purchase Order Endpoints
  // ===========================

  describe('POST /purchase-orders', () => {

    it('should create purchase order with 201 status', async () => {
      // Arrange
      const poData = {
        vendorId: 'vendor-id',
        lineItems: [{ description: 'Item', quantity: 10, unitPrice: 1000 }],
        total: 10000
      };
      const createdPO = { id: 'po-id', poNumber: 'PO-001', ...poData };
      mockReq.body = poData;
      purchaseOrderService.createPurchaseOrder.mockResolvedValue(createdPO);

      // Act
      await financeController.createPurchaseOrder(mockReq, mockRes);

      // Assert
      expect(purchaseOrderService.createPurchaseOrder).toHaveBeenCalledWith(poData, 'user-id');
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: createdPO,
        message: 'Purchase Order PO-001 created successfully'
      });
    });
  });

  describe('GET /purchase-orders', () => {

    it('should return all purchase orders with filters', async () => {
      // Arrange
      const mockPOs = [{ id: 'po-1' }, { id: 'po-2' }];
      mockReq.query = {
        vendorId: 'vendor-id',
        status: 'Sent',
        include: 'lineItems'
      };
      purchaseOrderService.getPurchaseOrders.mockResolvedValue(mockPOs);

      // Act
      await financeController.getPurchaseOrders(mockReq, mockRes);

      // Assert
      expect(purchaseOrderService.getPurchaseOrders).toHaveBeenCalledWith({
        vendorId: 'vendor-id',
        status: 'Sent',
        include: 'lineItems'
      });
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        data: mockPOs
      });
    });
  });

  describe('GET /purchase-orders/:id', () => {

    it('should return single purchase order', async () => {
      // Arrange
      const mockPO = { id: 'po-id', poNumber: 'PO-001' };
      mockReq.params.id = 'po-id';
      purchaseOrderService.getPurchaseOrder.mockResolvedValue(mockPO);

      // Act
      await financeController.getPurchaseOrder(mockReq, mockRes);

      // Assert
      expect(purchaseOrderService.getPurchaseOrder).toHaveBeenCalledWith('po-id');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockPO
      });
    });

    it('should return 404 if PO not found', async () => {
      // Arrange
      mockReq.params.id = 'nonexistent-id';
      purchaseOrderService.getPurchaseOrder.mockResolvedValue(null);

      // Act & Assert
      await expect(financeController.getPurchaseOrder(mockReq, mockRes))
        .rejects
        .toThrow('Purchase Order not found');
      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('PUT /purchase-orders/:id', () => {

    it('should update purchase order', async () => {
      // Arrange
      const updates = { total: 12000 };
      const updatedPO = { id: 'po-id', ...updates };
      mockReq.params.id = 'po-id';
      mockReq.body = updates;
      purchaseOrderService.updatePurchaseOrder.mockResolvedValue(updatedPO);

      // Act
      await financeController.updatePurchaseOrder(mockReq, mockRes);

      // Assert
      expect(purchaseOrderService.updatePurchaseOrder).toHaveBeenCalledWith('po-id', updates, 'user-id');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: updatedPO,
        message: 'Purchase Order updated successfully'
      });
    });
  });

  describe('PUT /purchase-orders/:id/status', () => {

    it('should update PO status', async () => {
      // Arrange
      const updatedPO = { id: 'po-id', status: 'Sent' };
      mockReq.params.id = 'po-id';
      mockReq.body.status = 'Sent';
      purchaseOrderService.updatePurchaseOrderStatus.mockResolvedValue(updatedPO);

      // Act
      await financeController.updatePurchaseOrderStatus(mockReq, mockRes);

      // Assert
      expect(purchaseOrderService.updatePurchaseOrderStatus).toHaveBeenCalledWith('po-id', 'Sent', 'user-id');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: updatedPO,
        message: 'Purchase Order status updated to Sent'
      });
    });

    it('should throw error if status not provided', async () => {
      // Arrange
      mockReq.params.id = 'po-id';
      mockReq.body = {}; // No status

      // Act & Assert
      await expect(financeController.updatePurchaseOrderStatus(mockReq, mockRes))
        .rejects
        .toThrow('Status required');
    });
  });

  describe('GET /purchase-orders/:id/items', () => {

    it('should return PO items', async () => {
      // Arrange
      const mockItems = [{ id: 'item-1' }, { id: 'item-2' }];
      mockReq.params.id = 'po-id';
      purchaseOrderService.getPurchaseOrderItems.mockResolvedValue(mockItems);

      // Act
      await financeController.getPurchaseOrderItems(mockReq, mockRes);

      // Assert
      expect(purchaseOrderService.getPurchaseOrderItems).toHaveBeenCalledWith('po-id');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        data: mockItems
      });
    });
  });

  // ===========================
  // Vendor Bill Endpoints
  // ===========================

  describe('POST /vendor-bills', () => {

    it('should create vendor bill with 201 status', async () => {
      // Arrange
      const billData = {
        purchaseOrderId: 'po-id',
        vendorId: 'vendor-id',
        total: 50000
      };
      const createdBill = { id: 'bill-id', billNumber: 'BILL-001', ...billData };
      mockReq.body = billData;
      billService.createBill.mockResolvedValue(createdBill);

      // Act
      await financeController.createVendorBill(mockReq, mockRes);

      // Assert
      expect(billService.createBill).toHaveBeenCalledWith(billData, 'user-id');
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: createdBill,
        message: 'Bill BILL-001 created successfully'
      });
    });
  });

  describe('GET /vendor-bills', () => {

    it('should return all bills with filters', async () => {
      // Arrange
      const mockBills = [{ id: 'bill-1' }, { id: 'bill-2' }];
      mockReq.query = {
        vendorId: 'vendor-id',
        status: 'Unpaid',
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31'
      };
      billService.getBills.mockResolvedValue(mockBills);

      // Act
      await financeController.getVendorBills(mockReq, mockRes);

      // Assert
      expect(billService.getBills).toHaveBeenCalledWith({
        vendorId: 'vendor-id',
        status: 'Unpaid',
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31'
      });
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        data: mockBills
      });
    });
  });

  describe('GET /vendor-bills/:id', () => {

    it('should return single bill', async () => {
      // Arrange
      const mockBill = { id: 'bill-id', billNumber: 'BILL-001' };
      mockReq.params.id = 'bill-id';
      billService.getBill.mockResolvedValue(mockBill);

      // Act
      await financeController.getVendorBill(mockReq, mockRes);

      // Assert
      expect(billService.getBill).toHaveBeenCalledWith('bill-id');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockBill
      });
    });
  });

  describe('PUT /vendor-bills/:id', () => {

    it('should update bill', async () => {
      // Arrange
      const updates = { total: 55000 };
      const updatedBill = { id: 'bill-id', ...updates };
      mockReq.params.id = 'bill-id';
      mockReq.body = updates;
      billService.updateBill.mockResolvedValue(updatedBill);

      // Act
      await financeController.updateVendorBill(mockReq, mockRes);

      // Assert
      expect(billService.updateBill).toHaveBeenCalledWith('bill-id', updates, 'user-id');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: updatedBill,
        message: 'Bill updated successfully'
      });
    });
  });

  describe('POST /vendor-bills/:id/cancel', () => {

    it('should cancel bill', async () => {
      // Arrange
      const cancelledBill = { id: 'bill-id', cancelledAt: new Date() };
      mockReq.params.id = 'bill-id';
      mockReq.body.reason = 'Duplicate entry';
      billService.cancelBill.mockResolvedValue(cancelledBill);

      // Act
      await financeController.cancelVendorBill(mockReq, mockRes);

      // Assert
      expect(billService.cancelBill).toHaveBeenCalledWith('bill-id', 'Duplicate entry', 'user-id');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: cancelledBill,
        message: 'Bill cancelled successfully'
      });
    });

    it('should throw error if reason not provided', async () => {
      // Arrange
      mockReq.params.id = 'bill-id';
      mockReq.body = {}; // No reason

      // Act & Assert
      await expect(financeController.cancelVendorBill(mockReq, mockRes))
        .rejects
        .toThrow('Cancellation reason is required');
    });
  });

  describe('GET /vendor-bills/:billId/payments', () => {

    it('should return bill payments', async () => {
      // Arrange
      const mockPayments = [{ id: 'payment-1' }, { id: 'payment-2' }];
      mockReq.params.billId = 'bill-id';
      paymentService.getBillPayments.mockResolvedValue(mockPayments);

      // Act
      await financeController.getBillPayments(mockReq, mockRes);

      // Assert
      expect(paymentService.getBillPayments).toHaveBeenCalledWith('bill-id');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        data: mockPayments
      });
    });
  });

  // ===========================
  // Vendor Payment Endpoints
  // ===========================

  describe('POST /vendor-payments', () => {

    it('should record vendor payment with 201 status', async () => {
      // Arrange
      const paymentData = {
        billId: 'bill-id',
        vendorId: 'vendor-id',
        amount: 20000,
        method: 'Bank Transfer'
      };
      const createdPayment = { id: 'payment-id', paymentNumber: 'VPAY-001', ...paymentData };
      mockReq.body = paymentData;
      paymentService.recordPayment.mockResolvedValue(createdPayment);

      // Act
      await financeController.recordVendorPayment(mockReq, mockRes);

      // Assert
      expect(paymentService.recordPayment).toHaveBeenCalledWith(paymentData, 'user-id');
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: createdPayment,
        message: 'Payment VPAY-001 recorded successfully'
      });
    });
  });

  describe('GET /vendor-payments', () => {

    it('should return all vendor payments with filters', async () => {
      // Arrange
      const mockPayments = [{ id: 'payment-1' }, { id: 'payment-2' }];
      mockReq.query = {
        vendorId: 'vendor-id',
        billId: 'bill-id'
      };
      paymentService.getVendorPayments.mockResolvedValue(mockPayments);

      // Act
      await financeController.getVendorPayments(mockReq, mockRes);

      // Assert
      expect(paymentService.getVendorPayments).toHaveBeenCalledWith({
        vendorId: 'vendor-id',
        billId: 'bill-id'
      });
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        data: mockPayments
      });
    });
  });

  describe('POST /vendor-payments/:id/void', () => {

    it('should void vendor payment', async () => {
      // Arrange
      const voidedPayment = { id: 'payment-id', voidedAt: new Date() };
      mockReq.params.id = 'payment-id';
      mockReq.body.reason = 'Incorrect amount';
      paymentService.voidPayment.mockResolvedValue(voidedPayment);

      // Act
      await financeController.voidVendorPayment(mockReq, mockRes);

      // Assert
      expect(paymentService.voidPayment).toHaveBeenCalledWith('payment-id', 'Incorrect amount', 'user-id');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: voidedPayment,
        message: 'Payment voided successfully'
      });
    });

    it('should throw error if reason not provided', async () => {
      // Arrange
      mockReq.params.id = 'payment-id';
      mockReq.body = {}; // No reason

      // Act & Assert
      await expect(financeController.voidVendorPayment(mockReq, mockRes))
        .rejects
        .toThrow('Void reason is required');
    });
  });

  // ===========================
  // Report Endpoints
  // ===========================

  describe('GET /customers/:id/statement', () => {

    it('should return customer statement', async () => {
      // Arrange
      const mockStatement = {
        customer: { name: 'Customer A' },
        transactions: [],
        balance: 50000
      };
      mockReq.params.id = 'customer-id';
      mockReq.query = {
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31'
      };
      financeService.getCustomerStatement.mockResolvedValue(mockStatement);

      // Act
      await financeController.getCustomerStatement(mockReq, mockRes);

      // Assert
      expect(financeService.getCustomerStatement).toHaveBeenCalledWith('customer-id', '2025-01-01', '2025-01-31');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockStatement
      });
    });
  });

  describe('GET /reports/aging', () => {

    it('should return aging report', async () => {
      // Arrange
      const mockReport = {
        current: 100000,
        days30: 50000,
        days60: 25000,
        days90: 10000,
        over90: 5000
      };
      financeService.getAgingReport.mockResolvedValue(mockReport);

      // Act
      await financeController.getAgingReport(mockReq, mockRes);

      // Assert
      expect(financeService.getAgingReport).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockReport
      });
    });
  });

  // ===========================
  // Chart of Accounts Endpoints
  // ===========================

  describe('GET /accounts', () => {

    it('should return all accounts', async () => {
      // Arrange
      const mockAccounts = [
        { id: 'account-1', code: '1000', name: 'Cash' },
        { id: 'account-2', code: '1100', name: 'Accounts Receivable' }
      ];
      financeService.getAccounts.mockResolvedValue(mockAccounts);

      // Act
      await financeController.getAccounts(mockReq, mockRes);

      // Assert
      expect(financeService.getAccounts).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        data: mockAccounts
      });
    });
  });

  describe('POST /accounts', () => {

    it('should create account with 201 status', async () => {
      // Arrange
      const accountData = {
        code: '1000',
        name: 'Cash',
        type: 'Asset'
      };
      const createdAccount = { id: 'account-id', ...accountData };
      mockReq.body = accountData;
      financeService.createAccount.mockResolvedValue(createdAccount);

      // Act
      await financeController.createAccount(mockReq, mockRes);

      // Assert
      expect(financeService.createAccount).toHaveBeenCalledWith(accountData);
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: createdAccount
      });
    });
  });

  // ===========================
  // Error Handling
  // ===========================

  describe('Error Handling', () => {

    it('should propagate service errors', async () => {
      // Arrange
      mockReq.params.id = 'customer-id';
      const error = new Error('Service error');
      financeService.getCustomerById.mockRejectedValue(error);

      // Act & Assert
      await expect(financeController.getCustomer(mockReq, mockRes))
        .rejects
        .toThrow('Service error');
    });

    it('should handle ValidationError', async () => {
      // Arrange
      const { ValidationError } = require('../../src/utils/transactionWrapper');
      mockReq.body = { name: '' };
      const error = new ValidationError('Name is required');
      financeService.createCustomer.mockRejectedValue(error);

      // Act & Assert
      await expect(financeController.createCustomer(mockReq, mockRes))
        .rejects
        .toThrow('Name is required');
    });
  });
});
