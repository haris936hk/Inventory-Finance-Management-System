// ========== src/controllers/financeController.js ==========
const asyncHandler = require('express-async-handler');
const financeService = require('../services/financeService');
const purchaseOrderService = require('../services/purchaseOrderService');
const billService = require('../services/billService');
const paymentService = require('../services/paymentService');
const invoiceService = require('../services/invoiceService');
const customerPaymentService = require('../services/customerPaymentService');
const { ValidationError } = require('../utils/transactionWrapper');

// ============= CUSTOMERS =============

// @desc    Get all customers
// @route   GET /api/finance/customers
// @access  Private
const getCustomers = asyncHandler(async (req, res) => {
  const filters = {
    search: req.query.search
  };

  const customers = await financeService.getCustomers(filters);

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
  const customer = await financeService.getCustomerById(req.params.id);

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
  const customer = await financeService.createCustomer(req.body);

  res.status(201).json({
    success: true,
    data: customer
  });
});

// @desc    Update customer
// @route   PUT /api/finance/customers/:id
// @access  Private
const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await financeService.updateCustomer(req.params.id, req.body);

  res.json({
    success: true,
    data: customer
  });
});

// @desc    Get customer ledger
// @route   GET /api/finance/customers/:id/ledger
// @access  Private
const getCustomerLedger = asyncHandler(async (req, res) => {
  const ledger = await financeService.getCustomerLedger(req.params.id);

  res.json({
    success: true,
    data: ledger
  });
});

// @desc    Get vendor ledger
// @route   GET /api/finance/vendors/:id/ledger
// @access  Private
const getVendorLedger = asyncHandler(async (req, res) => {
  const ledger = await financeService.getVendorLedger(req.params.id);

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

  const invoices = await financeService.getInvoices(filters);

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
  const invoice = await financeService.getInvoiceById(req.params.id);

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
  const invoice = await financeService.createInvoice(req.body, req.user.id);

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

  const invoice = await financeService.updateInvoiceStatus(
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
  const payment = await financeService.recordPayment(req.body, req.user.id);

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

  const where = { deletedAt: null };

  if (req.query.customerId) {
    where.customerId = req.query.customerId;
  }

  if (req.query.invoiceId) {
    where.invoiceId = req.query.invoiceId;
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

// ============= CHART OF ACCOUNTS =============

// @desc    Get accounts
// @route   GET /api/finance/accounts
// @access  Private
const getAccounts = asyncHandler(async (req, res) => {
  const accounts = await financeService.getAccounts();

  res.json({
    success: true,
    count: accounts.length,
    data: accounts
  });
});

// @desc    Create account
// @route   POST /api/finance/accounts
// @access  Private
const createAccount = asyncHandler(async (req, res) => {
  const account = await financeService.createAccount(req.body);

  res.status(201).json({
    success: true,
    data: account
  });
});

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
  const purchaseOrder = await purchaseOrderService.getPurchaseOrderById(req.params.id);

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
  const bill = await billService.getBillById(req.params.id);

  if (!bill) {
    res.status(404);
    throw new Error('Vendor Bill not found');
  }

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

// ============= INSTALLMENT PLANS =============

// @desc    Create installment plan
// @route   POST /api/finance/installment-plans
// @access  Private
const createInstallmentPlan = asyncHandler(async (req, res) => {
  const db = require('../config/database');

  const {
    invoiceId,
    downPayment,
    numberOfInstallments,
    intervalType
  } = req.body;

  // Get invoice
  const invoice = await db.prisma.invoice.findUnique({
    where: { id: invoiceId }
  });

  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }

  const totalAmount = parseFloat(invoice.total);
  const remainingAmount = totalAmount - (downPayment || 0);
  const installmentAmount = remainingAmount / numberOfInstallments;

  // Calculate installment dates
  const installments = [];
  const startDate = new Date();

  for (let i = 0; i < numberOfInstallments; i++) {
    const dueDate = new Date(startDate);

    switch (intervalType) {
      case 'Monthly':
        dueDate.setMonth(dueDate.getMonth() + (i + 1));
        break;
      case 'Weekly':
        dueDate.setDate(dueDate.getDate() + ((i + 1) * 7));
        break;
      case 'Quarterly':
        dueDate.setMonth(dueDate.getMonth() + ((i + 1) * 3));
        break;
    }

    installments.push({
      installmentNumber: i + 1,
      dueDate,
      amount: installmentAmount,
      status: 'Pending'
    });
  }

  const plan = await db.prisma.installmentPlan.create({
    data: {
      totalAmount,
      downPayment: downPayment || 0,
      numberOfInstallments,
      intervalType,
      startDate,
      invoiceId,
      installments: {
        create: installments
      }
    },
    include: {
      installments: {
        orderBy: { installmentNumber: 'asc' }
      }
    }
  });

  // Update invoice
  await db.prisma.invoice.update({
    where: { id: invoiceId },
    data: { hasInstallment: true }
  });

  res.status(201).json({
    success: true,
    data: plan
  });
});

// ============= STATEMENTS & REPORTS =============

// @desc    Get customer statement
// @route   GET /api/finance/customers/:id/statement
// @access  Private
const getCustomerStatement = asyncHandler(async (req, res) => {
  const statement = await financeService.getCustomerStatement(
    req.params.id,
    req.query.dateFrom,
    req.query.dateTo
  );

  res.json({
    success: true,
    data: statement
  });
});

// @desc    Get aging report
// @route   GET /api/finance/reports/aging
// @access  Private
const getAgingReport = asyncHandler(async (req, res) => {
  const report = await financeService.getAgingReport();

  res.json({
    success: true,
    data: report
  });
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
  // Accounts
  getAccounts,
  createAccount,
  // Purchase Orders
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrder,
  updatePurchaseOrder,
  updatePurchaseOrderStatus,
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
  // Installments
  createInstallmentPlan,
  // Reports
  getCustomerStatement,
  getAgingReport
};
