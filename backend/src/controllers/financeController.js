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

// @desc    Update invoice
// @route   PUT /api/finance/invoices/:id
// @access  Private
const updateInvoice = asyncHandler(async (req, res) => {
  const invoice = await financeService.updateInvoice(req.params.id, req.body, req.user.id);

  res.json({
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
    // Handle multiple status values separated by comma
    const statuses = Array.isArray(req.query.status)
      ? req.query.status
      : req.query.status.split(',').map(s => s.trim());

    if (statuses.length === 1) {
      where.status = statuses[0];
    } else {
      where.status = { in: statuses };
    }
  }

  // Fetch purchase orders with related data
  const purchaseOrders = await db.prisma.purchaseOrder.findMany({
    where,
    include: {
      vendor: true,
      lineItems: true,
      bills: {
        include: {
          payments: true
        }
      },
      _count: {
        select: {
          lineItems: true,
          bills: true
        }
      }
    },
    orderBy: { orderDate: 'desc' }
  });

  // Calculate payment status for each purchase order
  const purchaseOrdersWithPaymentStatus = purchaseOrders.map(po => {
    const totalBilled = po.bills.reduce((sum, bill) => sum + parseFloat(bill.total), 0);
    const totalPaid = po.bills.reduce((sum, bill) => {
      const billPaidAmount = bill.payments.reduce((paymentSum, payment) =>
        paymentSum + parseFloat(payment.amount), 0
      );
      return sum + billPaidAmount;
    }, 0);
    const poTotal = parseFloat(po.total);

    let paymentStatus = 'Unbilled';
    if (totalBilled > 0) {
      if (totalPaid === 0) {
        paymentStatus = 'Unpaid';
      } else if (totalPaid >= totalBilled) {
        paymentStatus = 'Fully Paid';
      } else {
        paymentStatus = 'Partially Paid';
      }
    }

    return {
      ...po,
      paymentSummary: {
        totalBilled: totalBilled,
        totalPaid: totalPaid,
        outstanding: totalBilled - totalPaid,
        paymentStatus: paymentStatus,
        billingProgress: poTotal > 0 ? (totalBilled / poTotal) * 100 : 0,
        paymentProgress: totalBilled > 0 ? (totalPaid / totalBilled) * 100 : 0
      }
    };
  });

  // Filter out fully billed POs if requested
  let filteredPurchaseOrders = purchaseOrdersWithPaymentStatus;
  if (req.query.excludeFullyBilled === 'true') {
    filteredPurchaseOrders = purchaseOrdersWithPaymentStatus.filter(po => {
      const totalBilled = po.paymentSummary.totalBilled;
      const poTotal = parseFloat(po.total);
      return totalBilled < poTotal; // Only show POs that are not fully billed
    });
  }

  res.json({
    success: true,
    count: filteredPurchaseOrders.length,
    data: filteredPurchaseOrders
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
      },
      bills: {
        include: {
          payments: true
        }
      },
      _count: {
        select: {
          lineItems: true,
          bills: true
        }
      }
    }
  });

  if (!purchaseOrder) {
    res.status(404);
    throw new Error('Purchase Order not found');
  }

  // Calculate payment summary for the single purchase order
  const totalBilled = purchaseOrder.bills.reduce((sum, bill) => sum + parseFloat(bill.total), 0);

  console.log(`\n=== DEBUGGING PURCHASE ORDER ${purchaseOrder.poNumber} ===`);
  console.log(`PO Total: ${purchaseOrder.total}`);
  console.log(`Number of Bills: ${purchaseOrder.bills.length}`);

  let totalPaidFromPaidAmountField = 0;

  const totalPaid = purchaseOrder.bills.reduce((sum, bill) => {
    console.log(`\n--- Bill: ${bill.billNumber} ---`);
    console.log(`Bill Total: ${bill.total}`);
    console.log(`Bill paidAmount field: ${bill.paidAmount}`);
    console.log(`Number of payments: ${bill.payments.length}`);

    totalPaidFromPaidAmountField += parseFloat(bill.paidAmount || 0);

    const billPaidAmount = bill.payments.reduce((paymentSum, payment) => {
      console.log(`  Payment: ${payment.amount} (${payment.paymentDate}) - ${payment.paymentNumber}`);
      return paymentSum + parseFloat(payment.amount);
    }, 0);

    console.log(`Bill paid from payments sum: ${billPaidAmount}`);
    console.log(`Bill paidAmount field: ${bill.paidAmount}`);

    return sum + billPaidAmount;
  }, 0);

  console.log(`\n=== TOTALS ===`);
  console.log(`Total Billed: ${totalBilled}`);
  console.log(`Total Paid (from payments): ${totalPaid}`);
  console.log(`Total Paid (from paidAmount fields): ${totalPaidFromPaidAmountField}`);
  console.log(`==================\n`);
  const poTotal = parseFloat(purchaseOrder.total);

  let paymentStatus = 'Unbilled';
  if (totalBilled > 0) {
    if (totalPaid === 0) {
      paymentStatus = 'Unpaid';
    } else if (totalPaid >= totalBilled) {
      paymentStatus = 'Fully Paid';
    } else {
      paymentStatus = 'Partially Paid';
    }
  }

  const purchaseOrderWithPaymentStatus = {
    ...purchaseOrder,
    paymentSummary: {
      totalBilled: totalBilled,
      totalPaid: totalPaid,
      outstanding: totalBilled - totalPaid,
      paymentStatus: paymentStatus,
      billingProgress: poTotal > 0 ? (totalBilled / poTotal) * 100 : 0,
      paymentProgress: totalBilled > 0 ? (totalPaid / totalBilled) * 100 : 0
    }
  };

  res.json({
    success: true,
    data: purchaseOrderWithPaymentStatus
  });
});

// @desc    Update purchase order
// @route   PUT /api/finance/purchase-orders/:id
// @access  Private
const updatePurchaseOrder = asyncHandler(async (req, res) => {
  const db = require('../config/database');

  // First, get the current purchase order to check its status
  const currentPO = await db.prisma.purchaseOrder.findUnique({
    where: { id: req.params.id },
    select: { status: true }
  });

  if (!currentPO) {
    res.status(404);
    throw new Error('Purchase Order not found');
  }

  // Only allow editing if the current status is "Draft"
  if (currentPO.status !== 'Draft') {
    res.status(400);
    throw new Error('Purchase Orders can only be edited when in Draft status');
  }

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

  // Get current purchase order to check its status
  const currentPO = await db.prisma.purchaseOrder.findUnique({
    where: { id: req.params.id },
    select: { status: true }
  });

  if (!currentPO) {
    res.status(404);
    throw new Error('Purchase Order not found');
  }

  // Special validation for cancellation - only allow cancelling Draft purchase orders
  if (status === 'Cancelled' && currentPO.status !== 'Draft') {
    res.status(400);
    throw new Error('Purchase Orders can only be cancelled when in Draft status');
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
      payments: {
        select: {
          amount: true
        }
      }
    },
    orderBy: { billDate: 'desc' }
  });

  // Calculate paid amounts for consistent data
  const billsWithPaidAmounts = bills.map(bill => {
    const calculatedPaidAmount = bill.payments.reduce((sum, payment) =>
      sum + parseFloat(payment.amount), 0
    );

    // Update status based on calculated paid amount
    let calculatedStatus = 'Unpaid';
    if (calculatedPaidAmount > 0) {
      calculatedStatus = calculatedPaidAmount >= parseFloat(bill.total) ? 'Paid' : 'Partial';
    }

    return {
      ...bill,
      paidAmount: calculatedPaidAmount,
      status: calculatedStatus,
      payments: undefined // Remove payments array from response for list view
    };
  });

  res.json({
    success: true,
    count: billsWithPaidAmounts.length,
    data: billsWithPaidAmounts
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

  // Calculate paid amount from payments
  const calculatedPaidAmount = bill.payments.reduce((sum, payment) =>
    sum + parseFloat(payment.amount), 0
  );

  // Update status based on calculated paid amount
  let calculatedStatus = 'Unpaid';
  if (calculatedPaidAmount > 0) {
    calculatedStatus = calculatedPaidAmount >= parseFloat(bill.total) ? 'Paid' : 'Partial';
  }

  // Return bill with calculated values
  const billWithCalculatedValues = {
    ...bill,
    paidAmount: calculatedPaidAmount,
    status: calculatedStatus
  };

  res.json({
    success: true,
    data: billWithCalculatedValues
  });
});

// @desc    Create vendor bill
// @route   POST /api/finance/vendor-bills
// @access  Private
const createVendorBill = asyncHandler(async (req, res) => {
  const db = require('../config/database');
  const { generateBillNumber } = require('../utils/generateId');

  // Validate purchase order total if purchase order is selected
  if (req.body.purchaseOrderId) {
    const purchaseOrder = await db.prisma.purchaseOrder.findUnique({
      where: { id: req.body.purchaseOrderId },
      include: {
        bills: {
          where: { deletedAt: null }
        }
      }
    });

    if (!purchaseOrder) {
      res.status(400);
      throw new Error('Purchase order not found');
    }

    const billTotal = parseFloat(req.body.total);
    const poTotal = parseFloat(purchaseOrder.total);

    // Check if new bill total exceeds PO total
    if (billTotal > poTotal) {
      res.status(400);
      throw new Error(`Bill total (${billTotal.toFixed(2)}) cannot exceed purchase order total (${poTotal.toFixed(2)})`);
    }

    // Check if cumulative bills would exceed PO total
    const totalAlreadyBilled = purchaseOrder.bills.reduce((sum, bill) =>
      sum + parseFloat(bill.total), 0
    );
    const newCumulativeTotal = totalAlreadyBilled + billTotal;

    if (newCumulativeTotal > poTotal) {
      res.status(400);
      throw new Error(`Cannot create bill. Total billed amount (${newCumulativeTotal.toFixed(2)}) would exceed purchase order total (${poTotal.toFixed(2)}). Already billed: ${totalAlreadyBilled.toFixed(2)}`);
    }

    // Check if PO is already fully billed
    if (totalAlreadyBilled >= poTotal) {
      res.status(400);
      throw new Error(`Cannot create bill. Purchase order is already fully billed (${totalAlreadyBilled.toFixed(2)} of ${poTotal.toFixed(2)})`);
    }
  }

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
      paidAmount: 0,
      vendorId: req.body.vendorId,
      purchaseOrderId: req.body.purchaseOrderId || null
    },
    include: {
      vendor: true,
      purchaseOrder: true
    }
  });

  // Get vendor's current balance for ledger calculation
  const vendor = await db.prisma.vendor.findUnique({
    where: { id: req.body.vendorId }
  });

  const billAmount = parseFloat(req.body.total);
  const newBalance = parseFloat(vendor.currentBalance) + billAmount;

  // Create vendor ledger entry with calculated balance
  await db.prisma.vendorLedger.create({
    data: {
      vendorId: req.body.vendorId,
      entryDate: new Date(req.body.billDate),
      description: `Bill ${billNumber}`,
      debit: billAmount,
      credit: 0,
      balance: newBalance,
      billId: bill.id
    }
  });

  // Update vendor balance
  await db.prisma.vendor.update({
    where: { id: req.body.vendorId },
    data: {
      currentBalance: newBalance
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

  // Get current bill to check if purchase order is being used
  const currentBill = await db.prisma.bill.findUnique({
    where: { id: req.params.id },
    include: { purchaseOrder: true }
  });

  if (!currentBill) {
    res.status(404);
    throw new Error('Bill not found');
  }

  // Only allow editing of unpaid bills
  if (currentBill.status !== 'Unpaid') {
    res.status(400);
    throw new Error('Only unpaid bills can be edited. Bills with payments cannot be modified.');
  }

  // Use purchase order from current bill or new one if being updated
  const purchaseOrderId = req.body.purchaseOrderId !== undefined ? req.body.purchaseOrderId : currentBill.purchaseOrderId;

  // Validate purchase order total if purchase order is selected
  if (purchaseOrderId) {
    const purchaseOrder = await db.prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: {
        bills: {
          where: {
            deletedAt: null,
            id: { not: req.params.id } // Exclude current bill from calculation
          }
        }
      }
    });

    if (!purchaseOrder) {
      res.status(400);
      throw new Error('Purchase order not found');
    }

    const billTotal = req.body.total ? parseFloat(req.body.total) : parseFloat(currentBill.total);
    const poTotal = parseFloat(purchaseOrder.total);

    // Check if new bill total exceeds PO total
    if (billTotal > poTotal) {
      res.status(400);
      throw new Error(`Bill total (${billTotal.toFixed(2)}) cannot exceed purchase order total (${poTotal.toFixed(2)})`);
    }

    // Check if cumulative bills would exceed PO total (excluding current bill)
    const totalAlreadyBilled = purchaseOrder.bills.reduce((sum, bill) =>
      sum + parseFloat(bill.total), 0
    );
    const newCumulativeTotal = totalAlreadyBilled + billTotal;

    if (newCumulativeTotal > poTotal) {
      res.status(400);
      throw new Error(`Cannot update bill. Total billed amount (${newCumulativeTotal.toFixed(2)}) would exceed purchase order total (${poTotal.toFixed(2)}). Already billed by other bills: ${totalAlreadyBilled.toFixed(2)}`);
    }
  }

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

  // Validate payment amount against bill balance if billId is provided
  if (req.body.billId) {
    const bill = await db.prisma.bill.findUnique({
      where: { id: req.body.billId }
    });

    if (!bill) {
      res.status(400);
      throw new Error('Bill not found');
    }

    const paymentAmount = parseFloat(req.body.amount);
    const billTotal = parseFloat(bill.total);
    const paidAmount = parseFloat(bill.paidAmount) || 0;
    const remainingBalance = billTotal - paidAmount;

    if (paymentAmount > remainingBalance) {
      res.status(400);
      throw new Error(`Payment amount (${paymentAmount.toFixed(2)}) cannot exceed remaining bill balance (${remainingBalance.toFixed(2)})`);
    }
  }

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
      where: { id: req.body.billId },
      include: {
        payments: true
      }
    });

    // Calculate total paid amount from all payments (new payment already included)
    const totalPaidAmount = bill.payments.reduce((sum, payment) =>
      sum + parseFloat(payment.amount), 0
    );

    const newStatus = totalPaidAmount >= parseFloat(bill.total) ? 'Paid' :
      totalPaidAmount > 0 ? 'Partial' : 'Unpaid';

    await db.prisma.bill.update({
      where: { id: req.body.billId },
      data: {
        paidAmount: totalPaidAmount,
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

// @desc    Fix vendor bill paid amounts (cleanup utility)
// @route   PUT /api/finance/vendor-bills/fix-paid-amounts
// @access  Private
const fixVendorBillPaidAmounts = asyncHandler(async (req, res) => {
  const db = require('../config/database');

  // Get all bills with their payments
  const bills = await db.prisma.bill.findMany({
    where: { deletedAt: null },
    include: {
      payments: true
    }
  });

  let fixedCount = 0;

  for (const bill of bills) {
    // Calculate correct paid amount from payments
    const calculatedPaidAmount = bill.payments.reduce((sum, payment) =>
      sum + parseFloat(payment.amount), 0
    );

    // Calculate correct status
    const calculatedStatus = calculatedPaidAmount >= parseFloat(bill.total) ? 'Paid' :
      calculatedPaidAmount > 0 ? 'Partial' : 'Unpaid';

    // Update if values don't match
    if (parseFloat(bill.paidAmount || 0) !== calculatedPaidAmount || bill.status !== calculatedStatus) {
      await db.prisma.bill.update({
        where: { id: bill.id },
        data: {
          paidAmount: calculatedPaidAmount,
          status: calculatedStatus
        }
      });
      fixedCount++;
    }
  }

  res.json({
    success: true,
    message: `Fixed paid amounts for ${fixedCount} vendor bills`,
    fixedCount
  });
});

// @desc    Debug purchase order payment data
// @route   GET /api/finance/debug/purchase-order/:poNumber
// @access  Private
const debugPurchaseOrderPayments = asyncHandler(async (req, res) => {
  const db = require('../config/database');

  console.log(`\n=== DEBUG: Purchase Order ${req.params.poNumber} ===`);

  const purchaseOrder = await db.prisma.purchaseOrder.findFirst({
    where: {
      poNumber: req.params.poNumber,
      deletedAt: null
    },
    include: {
      vendor: true,
      bills: {
        include: {
          payments: true
        }
      }
    }
  });

  if (!purchaseOrder) {
    return res.status(404).json({ error: 'Purchase order not found' });
  }

  console.log(`PO Total: ${purchaseOrder.total}`);
  console.log(`Number of Bills: ${purchaseOrder.bills.length}`);

  let totalBilled = 0;
  let totalPaidFromPayments = 0;
  let totalPaidFromPaidAmountField = 0;

  purchaseOrder.bills.forEach((bill, index) => {
    console.log(`\n--- Bill ${index + 1}: ${bill.billNumber} ---`);
    console.log(`Bill Total: ${bill.total}`);
    console.log(`Bill paidAmount field: ${bill.paidAmount}`);
    console.log(`Number of payments: ${bill.payments.length}`);

    totalBilled += parseFloat(bill.total);
    totalPaidFromPaidAmountField += parseFloat(bill.paidAmount || 0);

    let billPaidFromPayments = 0;
    bill.payments.forEach((payment, pIndex) => {
      console.log(`  Payment ${pIndex + 1}: ${payment.amount} (${payment.paymentDate})`);
      billPaidFromPayments += parseFloat(payment.amount);
    });

    totalPaidFromPayments += billPaidFromPayments;
    console.log(`Bill paid from payments sum: ${billPaidFromPayments}`);
    console.log(`Bill paidAmount field: ${bill.paidAmount}`);
  });

  console.log(`\n=== TOTALS ===`);
  console.log(`Total Billed: ${totalBilled}`);
  console.log(`Total Paid (from payments): ${totalPaidFromPayments}`);
  console.log(`Total Paid (from paidAmount fields): ${totalPaidFromPaidAmountField}`);
  console.log(`==================\n`);

  const debugData = {
    poNumber: purchaseOrder.poNumber,
    poTotal: purchaseOrder.total,
    bills: purchaseOrder.bills.map(bill => ({
      billNumber: bill.billNumber,
      billTotal: bill.total,
      paidAmountField: bill.paidAmount,
      payments: bill.payments.map(p => ({
        amount: p.amount,
        date: p.paymentDate,
        paymentNumber: p.paymentNumber
      })),
      paymentsSum: bill.payments.reduce((sum, p) => sum + parseFloat(p.amount), 0)
    })),
    totals: {
      totalBilled,
      totalPaidFromPayments,
      totalPaidFromPaidAmountField
    }
  };

  res.json({
    success: true,
    data: debugData
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
  updateInvoice,
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
  fixVendorBillPaidAmounts,
  // Debug
  debugPurchaseOrderPayments,
  // Vendor Payments
  getVendorPayments,
  recordVendorPayment,
  // Installments
  createInstallmentPlan,
  // Reports
  getCustomerStatement,
  getAgingReport
};