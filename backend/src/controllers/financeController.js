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
  const { lineItems = [], ...purchaseOrderData } = req.body;

  const purchaseOrder = await db.prisma.purchaseOrder.create({
    data: {
      poNumber,
      orderDate: purchaseOrderData.orderDate || new Date(),
      expectedDate: purchaseOrderData.expectedDate,
      status: purchaseOrderData.status || 'Draft',
      subtotal: purchaseOrderData.subtotal,
      taxAmount: purchaseOrderData.taxAmount || 0,
      total: purchaseOrderData.total,
      vendorId: purchaseOrderData.vendorId,
      lineItems: {
        create: lineItems.map(item => ({
          productModelId: item.productModelId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          specifications: item.specifications || {},
          notes: item.notes
        }))
      }
    },
    include: {
      vendor: true,
      lineItems: {
        include: {
          productModel: {
            include: {
              category: true,
              company: true
            }
          }
        }
      }
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
          lineItems: true
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

// @desc    Get single purchase order
// @route   GET /api/finance/purchase-orders/:id
// @access  Private
const getPurchaseOrder = asyncHandler(async (req, res) => {
  const db = require('../config/database');

  const purchaseOrder = await db.prisma.purchaseOrder.findUnique({
    where: {
      id: req.params.id,
      deletedAt: null
    },
    include: {
      vendor: true,
      lineItems: {
        include: {
          productModel: {
            include: {
              category: true,
              company: true
            }
          }
        }
      }
    }
  });

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
  const db = require('../config/database');

  const purchaseOrder = await db.prisma.purchaseOrder.update({
    where: { id: req.params.id },
    data: {
      orderDate: req.body.orderDate,
      expectedDate: req.body.expectedDate,
      status: req.body.status,
      subtotal: req.body.subtotal,
      taxAmount: req.body.taxAmount || 0,
      total: req.body.total,
      vendorId: req.body.vendorId
    },
    include: {
      vendor: true
    }
  });

  res.json({
    success: true,
    data: purchaseOrder
  });
});

// @desc    Update purchase order status
// @route   PUT /api/finance/purchase-orders/:id/status
// @access  Private
const updatePurchaseOrderStatus = asyncHandler(async (req, res) => {
  const db = require('../config/database');
  const { status } = req.body;

  if (!status) {
    res.status(400);
    throw new Error('Status required');
  }

  const validStatuses = ['Draft', 'Sent', 'Partial', 'Completed', 'Cancelled'];
  if (!validStatuses.includes(status)) {
    res.status(400);
    throw new Error('Invalid status');
  }

  const purchaseOrder = await db.prisma.purchaseOrder.update({
    where: { id: req.params.id },
    data: { status },
    include: {
      vendor: true
    }
  });

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
  const db = require('../config/database');

  const where = { deletedAt: null };

  if (req.query.vendorId) {
    where.vendorId = req.query.vendorId;
  }

  if (req.query.status) {
    where.status = req.query.status;
  }

  if (req.query.dateFrom && req.query.dateTo) {
    where.billDate = {
      gte: new Date(req.query.dateFrom),
      lte: new Date(req.query.dateTo)
    };
  }

  const bills = await db.prisma.bill.findMany({
    where,
    include: {
      vendor: true,
      purchaseOrder: true,
      _count: {
        select: {
          payments: true
        }
      }
    },
    orderBy: { billDate: 'desc' }
  });

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
  const db = require('../config/database');

  const bill = await db.prisma.bill.findUnique({
    where: {
      id: req.params.id,
      deletedAt: null
    },
    include: {
      vendor: true,
      purchaseOrder: {
        include: {
          items: {
            include: {
              model: {
                include: {
                  category: true,
                  company: true
                }
              }
            }
          }
        }
      },
      payments: {
        orderBy: { paymentDate: 'desc' }
      },
      ledgerEntries: {
        orderBy: { entryDate: 'desc' }
      }
    }
  });

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
  const db = require('../config/database');
  const { generateBillNumber } = require('../utils/generateId');

  const billNumber = await generateBillNumber();

  const bill = await db.prisma.bill.create({
    data: {
      billNumber,
      billDate: new Date(req.body.billDate),
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
      status: req.body.status || 'Unpaid',
      subtotal: parseFloat(req.body.subtotal),
      taxAmount: parseFloat(req.body.taxAmount) || 0,
      total: parseFloat(req.body.total),
      vendorId: req.body.vendorId,
      purchaseOrderId: req.body.purchaseOrderId || null
    },
    include: {
      vendor: true,
      purchaseOrder: true
    }
  });

  // Create vendor ledger entry
  await db.prisma.vendorLedger.create({
    data: {
      vendorId: req.body.vendorId,
      entryDate: new Date(req.body.billDate),
      description: `Bill ${billNumber}`,
      debit: parseFloat(req.body.total),
      credit: 0,
      balance: 0, // This should be calculated properly in a real scenario
      billId: bill.id
    }
  });

  // Update vendor balance
  await db.prisma.vendor.update({
    where: { id: req.body.vendorId },
    data: {
      currentBalance: {
        increment: parseFloat(req.body.total)
      }
    }
  });

  res.status(201).json({
    success: true,
    data: bill
  });
});

// @desc    Update vendor bill
// @route   PUT /api/finance/vendor-bills/:id
// @access  Private
const updateVendorBill = asyncHandler(async (req, res) => {
  const db = require('../config/database');

  const bill = await db.prisma.bill.update({
    where: { id: req.params.id },
    data: {
      billDate: req.body.billDate ? new Date(req.body.billDate) : undefined,
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
      status: req.body.status,
      subtotal: req.body.subtotal ? parseFloat(req.body.subtotal) : undefined,
      taxAmount: req.body.taxAmount ? parseFloat(req.body.taxAmount) : undefined,
      total: req.body.total ? parseFloat(req.body.total) : undefined,
      vendorId: req.body.vendorId
    },
    include: {
      vendor: true,
      purchaseOrder: true
    }
  });

  res.json({
    success: true,
    data: bill
  });
});

// @desc    Update vendor bill status
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

// ============= VENDOR PAYMENTS =============

// @desc    Get all vendor payments
// @route   GET /api/finance/vendor-payments
// @access  Private
const getVendorPayments = asyncHandler(async (req, res) => {
  const db = require('../config/database');

  const where = { deletedAt: null };

  if (req.query.vendorId) {
    where.vendorId = req.query.vendorId;
  }

  if (req.query.billId) {
    where.billId = req.query.billId;
  }

  const payments = await db.prisma.vendorPayment.findMany({
    where,
    include: {
      vendor: true,
      bill: true
    },
    orderBy: { paymentDate: 'desc' }
  });

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
  const db = require('../config/database');
  const { generatePaymentNumber } = require('../utils/generateId');

  const paymentNumber = await generatePaymentNumber('VPAY');

  const payment = await db.prisma.vendorPayment.create({
    data: {
      paymentNumber,
      paymentDate: new Date(req.body.paymentDate),
      amount: parseFloat(req.body.amount),
      method: req.body.method,
      reference: req.body.reference || null,
      notes: req.body.notes || null,
      vendorId: req.body.vendorId,
      billId: req.body.billId || null
    },
    include: {
      vendor: true,
      bill: true
    }
  });

  // Update bill paid amount if payment is against a specific bill
  if (req.body.billId) {
    const bill = await db.prisma.bill.findUnique({
      where: { id: req.body.billId }
    });

    const newPaidAmount = parseFloat(bill.paidAmount) + parseFloat(req.body.amount);
    const newStatus = newPaidAmount >= parseFloat(bill.total) ? 'Paid' : 'Partial';

    await db.prisma.bill.update({
      where: { id: req.body.billId },
      data: {
        paidAmount: newPaidAmount,
        status: newStatus
      }
    });
  }

  // Update vendor balance
  await db.prisma.vendor.update({
    where: { id: req.body.vendorId },
    data: {
      currentBalance: {
        decrement: parseFloat(req.body.amount)
      }
    }
  });

  res.status(201).json({
    success: true,
    data: payment
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
  // Payments
  recordPayment,
  getPayments,
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
  updateVendorBillStatus,
  // Vendor Payments
  getVendorPayments,
  recordVendorPayment,
  // Installments
  createInstallmentPlan,
  // Reports
  getCustomerStatement,
  getAgingReport
};