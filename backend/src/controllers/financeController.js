// ========== src/controllers/financeController.js ==========
const asyncHandler = require('express-async-handler');
const customerService = require('../services/customerService');
const ledgerService = require('../services/ledgerService');
const purchaseOrderService = require('../services/purchaseOrderService');
const billService = require('../services/billService');
const paymentService = require('../services/paymentService');
const invoiceService = require('../services/invoiceService');
const customerPaymentService = require('../services/customerPaymentService');
const financialReportsService = require('../services/financialReportsService');
const pdfService = require('../services/pdfService');
const { ValidationError } = require('../utils/transactionWrapper');

// ============= CUSTOMERS =============

// @desc    Get all customers
// @route   GET /api/finance/customers
// @access  Private
const getCustomers = asyncHandler(async (req, res) => {
  const filters = {
    search: req.query.search
  };

  const customers = await customerService.getCustomers(filters);

  res.json({
    success: true,
    count: customers.length,
    data: customers
  });
});

// @desc    Get single customer
// @route   GET /api/finance/customers/:id
// @access  Private
const getCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.getCustomerById(req.params.id);

  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }

  res.json({
    success: true,
    data: customer
  });
});

// @desc    Create customer
// @route   POST /api/finance/customers
// @access  Private
const createCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.createCustomer(req.body);

  res.status(201).json({
    success: true,
    data: customer
  });
});

// @desc    Update customer
// @route   PUT /api/finance/customers/:id
// @access  Private
const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.updateCustomer(req.params.id, req.body);

  res.json({
    success: true,
    data: customer
  });
});

// @desc    Get customer ledger
// @route   GET /api/finance/customers/:id/ledger
// @access  Private
const getCustomerLedger = asyncHandler(async (req, res) => {
  const ledger = await ledgerService.getCustomerLedger(req.params.id);

  res.json({
    success: true,
    data: ledger
  });
});

// @desc    Get vendor ledger
// @route   GET /api/finance/vendors/:id/ledger
// @access  Private
const getVendorLedger = asyncHandler(async (req, res) => {
  const ledger = await ledgerService.getVendorLedger(req.params.id);

  res.json({
    success: true,
    data: ledger
  });
});

// ============= INVOICES =============

// @desc    Get all invoices
// @route   GET /api/finance/invoices
// @access  Private
const getInvoices = asyncHandler(async (req, res) => {
  const filters = {
    status: req.query.status,
    customerId: req.query.customerId,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo
  };

  const invoices = await invoiceService.getInvoices(filters);

  res.json({
    success: true,
    count: invoices.length,
    data: invoices
  });
});

// @desc    Get single invoice
// @route   GET /api/finance/invoices/:id
// @access  Private
const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getInvoice(req.params.id);

  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }

  res.json({
    success: true,
    data: invoice
  });
});

// @desc    Create invoice
// @route   POST /api/finance/invoices
// @access  Private
const createInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.createInvoice(req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: invoice
  });
});

// @desc    Update invoice status
// @route   PUT /api/finance/invoices/:id/status
// @access  Private
const updateInvoiceStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!status) {
    res.status(400);
    throw new Error('Status required');
  }

  const invoice = await invoiceService.updateInvoiceStatus(
    req.params.id,
    status,
    req.user.id
  );

  res.json({
    success: true,
    data: invoice
  });
});

// @desc    Cancel invoice
// @route   POST /api/finance/invoices/:id/cancel
// @access  Private
const cancelInvoice = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  if (!reason || reason.trim() === '') {
    res.status(400);
    throw new Error('Cancellation reason is required');
  }

  const cancelled = await invoiceService.cancelInvoice(
    req.params.id,
    reason.trim(),
    req.user.id
  );

  res.json({
    success: true,
    message: 'Invoice cancelled successfully',
    data: cancelled
  });
});

// ============= PAYMENTS =============

// @desc    Record payment
// @route   POST /api/finance/payments
// @access  Private
const recordPayment = asyncHandler(async (req, res) => {
  const payment = await customerPaymentService.recordPayment(req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: payment
  });
});

// @desc    Get payments
// @route   GET /api/finance/payments
// @access  Private
const getPayments = asyncHandler(async (req, res) => {
  const db = require('../config/database');

  const where = { deletedAt: null, voidedAt: null };

  if (req.query.customerId) {
    where.customerId = req.query.customerId;
  }

  if (req.query.invoiceId) {
    where.invoiceId = req.query.invoiceId;
  }

  // Date range filter
  if (req.query.startDate || req.query.endDate) {
    where.paymentDate = {};
    if (req.query.startDate) {
      where.paymentDate.gte = new Date(req.query.startDate);
    }
    if (req.query.endDate) {
      where.paymentDate.lte = new Date(req.query.endDate);
    }
  }

  // Payment method filter
  if (req.query.method) {
    where.method = req.query.method;
  }

  // Search filter (customer name or payment number)
  if (req.query.search) {
    where.OR = [
      {
        paymentNumber: {
          contains: req.query.search,
          mode: 'insensitive'
        }
      },
      {
        customer: {
          name: {
            contains: req.query.search,
            mode: 'insensitive'
          }
        }
      }
    ];
  }

  const payments = await db.prisma.payment.findMany({
    where,
    include: {
      customer: true,
      invoice: true,
      recordedBy: {
        select: {
          fullName: true
        }
      }
    },
    orderBy: { paymentDate: 'desc' }
  });

  res.json({
    success: true,
    count: payments.length,
    data: payments
  });
});

// @desc    Void customer payment
// @route   POST /api/finance/payments/:id/void
// @access  Private
const voidCustomerPayment = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  if (!reason || reason.trim() === '') {
    res.status(400);
    throw new Error('Void reason is required');
  }

  const voided = await customerPaymentService.voidPayment(
    req.params.id,
    reason.trim(),
    req.user.id
  );

  res.json({
    success: true,
    message: 'Payment voided successfully',
    data: voided
  });
});

// ============= CHART OF ACCOUNTS (REMOVED - Not Required) =============
// Chart of Accounts functionality has been removed as it's not required for current business needs
// If needed in future, implement in dedicated accountingController.js

// ============= PURCHASE ORDERS =============

// @desc    Create purchase order
// @route   POST /api/finance/purchase-orders
// @access  Private
const createPurchaseOrder = asyncHandler(async (req, res) => {
  const purchaseOrder = await purchaseOrderService.createPurchaseOrder(req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: purchaseOrder,
    message: `Purchase Order ${purchaseOrder.poNumber} created successfully`
  });
});

// @desc    Get purchase orders
// @route   GET /api/finance/purchase-orders
// @access  Private
const getPurchaseOrders = asyncHandler(async (req, res) => {
  const filters = {
    vendorId: req.query.vendorId,
    status: req.query.status,
    include: req.query.include
  };

  const purchaseOrders = await purchaseOrderService.getPurchaseOrders(filters);

  res.json({
    success: true,
    count: purchaseOrders.length,
    data: purchaseOrders
  });
});

// @desc    Get single purchase order
// @route   GET /api/finance/purchase-orders/:id
// @access  Private
const getPurchaseOrder = asyncHandler(async (req, res) => {
  const purchaseOrder = await purchaseOrderService.getPurchaseOrder(req.params.id);

  if (!purchaseOrder) {
    res.status(404);
    throw new Error('Purchase Order not found');
  }

  res.json({
    success: true,
    data: purchaseOrder
  });
});

// @desc    Update purchase order
// @route   PUT /api/finance/purchase-orders/:id
// @access  Private
const updatePurchaseOrder = asyncHandler(async (req, res) => {
  const purchaseOrder = await purchaseOrderService.updatePurchaseOrder(
    req.params.id,
    req.body,
    req.user.id
  );

  res.json({
    success: true,
    data: purchaseOrder,
    message: 'Purchase Order updated successfully'
  });
});

// @desc    Update purchase order status
// @route   PUT /api/finance/purchase-orders/:id/status
// @access  Private
const updatePurchaseOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!status) {
    throw new ValidationError('Status required');
  }

  const purchaseOrder = await purchaseOrderService.updatePurchaseOrderStatus(
    req.params.id,
    status,
    req.user.id
  );

  res.json({
    success: true,
    data: purchaseOrder,
    message: `Purchase Order status updated to ${status}`
  });
});

// @desc    Get inventory items linked to a purchase order
// @route   GET /api/finance/purchase-orders/:id/items
// @access  Private
const getPurchaseOrderItems = asyncHandler(async (req, res) => {
  const items = await purchaseOrderService.getPurchaseOrderItems(req.params.id);

  res.json({
    success: true,
    count: items.length,
    data: items
  });
});

// ============= VENDOR BILLS =============

// @desc    Get all vendor bills
// @route   GET /api/finance/vendor-bills
// @access  Private
const getVendorBills = asyncHandler(async (req, res) => {
  const filters = {
    vendorId: req.query.vendorId,
    status: req.query.status,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo
  };

  const bills = await billService.getBills(filters);

  res.json({
    success: true,
    count: bills.length,
    data: bills
  });
});

// @desc    Get single vendor bill
// @route   GET /api/finance/vendor-bills/:id
// @access  Private
const getVendorBill = asyncHandler(async (req, res) => {
  const bill = await billService.getBill(req.params.id);

  res.json({
    success: true,
    data: bill
  });
});

// @desc    Create vendor bill
// @route   POST /api/finance/vendor-bills
// @access  Private
const createVendorBill = asyncHandler(async (req, res) => {
  const bill = await billService.createBill(req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: bill,
    message: `Bill ${bill.billNumber} created successfully`
  });
});

// @desc    Update vendor bill
// @route   PUT /api/finance/vendor-bills/:id
// @access  Private
const updateVendorBill = asyncHandler(async (req, res) => {
  const bill = await billService.updateBill(req.params.id, req.body, req.user.id);

  res.json({
    success: true,
    data: bill,
    message: 'Bill updated successfully'
  });
});

// @desc    Cancel vendor bill
// @route   POST /api/finance/vendor-bills/:id/cancel
// @access  Private
const cancelVendorBill = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  if (!reason) {
    throw new ValidationError('Cancellation reason is required');
  }

  const bill = await billService.cancelBill(req.params.id, reason, req.user.id);

  res.json({
    success: true,
    data: bill,
    message: 'Bill cancelled successfully'
  });
});

// @desc    Update vendor bill status (deprecated - status changes automatically)
// @route   PUT /api/finance/vendor-bills/:id/status
// @access  Private
const updateVendorBillStatus = asyncHandler(async (req, res) => {
  const db = require('../config/database');
  const { status } = req.body;

  if (!status) {
    res.status(400);
    throw new Error('Status required');
  }

  const validStatuses = ['Unpaid', 'Partial', 'Paid'];
  if (!validStatuses.includes(status)) {
    res.status(400);
    throw new Error('Invalid status');
  }

  const bill = await db.prisma.bill.update({
    where: { id: req.params.id },
    data: { status },
    include: {
      vendor: true
    }
  });

  res.json({
    success: true,
    data: bill,
    message: `Bill status updated to ${status}`
  });
});

// @desc    Get bill payments
// @route   GET /api/finance/vendor-bills/:billId/payments
// @access  Private
const getBillPayments = asyncHandler(async (req, res) => {
  const payments = await paymentService.getBillPayments(req.params.billId);

  res.json({
    success: true,
    count: payments.length,
    data: payments
  });
});

// ============= VENDOR PAYMENTS =============

// @desc    Get all vendor payments
// @route   GET /api/finance/vendor-payments
// @access  Private
const getVendorPayments = asyncHandler(async (req, res) => {
  const filters = {
    vendorId: req.query.vendorId,
    billId: req.query.billId
  };

  const payments = await paymentService.getVendorPayments(filters);

  res.json({
    success: true,
    count: payments.length,
    data: payments
  });
});

// @desc    Record vendor payment
// @route   POST /api/finance/vendor-payments
// @access  Private
const recordVendorPayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.recordPayment(req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: payment,
    message: `Payment ${payment.paymentNumber} recorded successfully`
  });
});

// @desc    Void vendor payment
// @route   POST /api/finance/vendor-payments/:id/void
// @access  Private
const voidVendorPayment = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  if (!reason) {
    throw new ValidationError('Void reason is required');
  }

  const payment = await paymentService.voidPayment(req.params.id, reason, req.user.id);

  res.json({
    success: true,
    data: payment,
    message: 'Payment voided successfully'
  });
});

// ============= STATEMENTS & REPORTS =============

// @desc    Get customer statement
// @route   GET /api/finance/customers/:id/statement
// @access  Private
const getCustomerStatement = asyncHandler(async (req, res) => {
  const statement = await ledgerService.getCustomerStatement(
    req.params.id,
    req.query.dateFrom,
    req.query.dateTo
  );

  res.json({
    success: true,
    data: statement
  });
});

// @desc    Get aging report (Accounts Receivable Aging)
// @route   GET /api/finance/reports/aging
// @access  Private
const getAgingReport = asyncHandler(async (req, res) => {
  const { asOfDate = new Date().toISOString().split('T')[0] } = req.query;

  // Use comprehensive financialReportsService instead of old financeService.getAgingReport()
  const report = await financialReportsService.generateAccountsReceivableAging(
    new Date(asOfDate)
  );

  res.json({
    success: true,
    data: report
  });
});

// ============= PDF GENERATION =============

// @desc    Generate invoice PDF
// @route   GET /api/finance/invoices/:id/pdf
// @access  Private
const generateInvoicePDF = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getInvoice(req.params.id);

  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }

  const { buffer } = await pdfService.generateInvoice(invoice);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice_${invoice.invoiceNumber}.pdf"`);
  res.send(buffer);
});

// @desc    Generate purchase order PDF
// @route   GET /api/finance/purchase-orders/:id/pdf
// @access  Private
const generatePurchaseOrderPDF = asyncHandler(async (req, res) => {
  const purchaseOrder = await purchaseOrderService.getPurchaseOrder(req.params.id);

  if (!purchaseOrder) {
    res.status(404);
    throw new Error('Purchase order not found');
  }

  const { buffer } = await pdfService.generatePurchaseOrder(purchaseOrder);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="purchase_order_${purchaseOrder.poNumber}.pdf"`);
  res.send(buffer);
});

// @desc    Generate vendor bill PDF
// @route   GET /api/finance/vendor-bills/:id/pdf
// @access  Private
const generateVendorBillPDF = asyncHandler(async (req, res) => {
  const bill = await billService.getBill(req.params.id);

  if (!bill) {
    res.status(404);
    throw new Error('Vendor bill not found');
  }

  const { buffer } = await pdfService.generateVendorBill(bill);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="vendor_bill_${bill.billNumber}.pdf"`);
  res.send(buffer);
});

module.exports = {
  // Customers
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  getCustomerLedger,
  // Vendors
  getVendorLedger,
  // Invoices
  getInvoices,
  getInvoice,
  createInvoice,
  updateInvoiceStatus,
  cancelInvoice,
  // Payments
  recordPayment,
  getPayments,
  voidCustomerPayment,
  // Accounts (REMOVED - Not required)
  // Purchase Orders
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrder,
  updatePurchaseOrder,
  updatePurchaseOrderStatus,
  getPurchaseOrderItems,
  // Vendor Bills
  getVendorBills,
  getVendorBill,
  createVendorBill,
  updateVendorBill,
  cancelVendorBill,
  updateVendorBillStatus,
  getBillPayments,
  // Vendor Payments
  getVendorPayments,
  recordVendorPayment,
  voidVendorPayment,
  // Reports
  getCustomerStatement,
  getAgingReport,
  // PDF Generation
  generateInvoicePDF,
  generatePurchaseOrderPDF,
  generateVendorBillPDF
};
