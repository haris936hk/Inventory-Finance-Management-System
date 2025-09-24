// ========== src/controllers/financeController.js ==========
const asyncHandler = require('express-async-handler');
const financeService = require('../services/financeService');

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
  const db = require('../config/database');
  const { generatePONumber } = require('../utils/generateId');
  
  const poNumber = await generatePONumber();
  
  const purchaseOrder = await db.prisma.purchaseOrder.create({
    data: {
      poNumber,
      orderDate: req.body.orderDate || new Date(),
      expectedDate: req.body.expectedDate,
      status: req.body.status || 'Draft',
      subtotal: req.body.subtotal,
      taxAmount: req.body.taxAmount || 0,
      total: req.body.total,
      vendorId: req.body.vendorId
    },
    include: {
      vendor: true
    }
  });
  
  res.status(201).json({
    success: true,
    data: purchaseOrder
  });
});

// @desc    Get purchase orders
// @route   GET /api/finance/purchase-orders
// @access  Private
const getPurchaseOrders = asyncHandler(async (req, res) => {
  const db = require('../config/database');
  
  const where = { deletedAt: null };
  
  if (req.query.vendorId) {
    where.vendorId = req.query.vendorId;
  }
  
  if (req.query.status) {
    where.status = req.query.status;
  }
  
  const purchaseOrders = await db.prisma.purchaseOrder.findMany({
    where,
    include: {
      vendor: true,
      _count: {
        select: {
          items: true
        }
      }
    },
    orderBy: { orderDate: 'desc' }
  });
  
  res.json({
    success: true,
    count: purchaseOrders.length,
    data: purchaseOrders
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
  // Invoices
  getInvoices,
  getInvoice,
  createInvoice,
  updateInvoiceStatus,
  // Payments
  recordPayment,
  getPayments,
  // Accounts
  getAccounts,
  createAccount,
  // Purchase Orders
  createPurchaseOrder,
  getPurchaseOrders,
  // Installments
  createInstallmentPlan,
  // Reports
  getCustomerStatement,
  getAgingReport
};