const asyncHandler = require('express-async-handler');
const installmentService = require('../services/installmentService');

// @desc    Create installment plan for invoice
// @route   POST /api/installments/create-plan
// @access  Private
const createInstallmentPlan = asyncHandler(async (req, res) => {
  const { invoiceId, planData } = req.body;
  const userId = req.user.id;

  if (!invoiceId) {
    res.status(400);
    throw new Error('Invoice ID is required');
  }

  const result = await installmentService.createInstallmentPlan(invoiceId, planData, userId);

  res.status(201).json({
    success: true,
    message: 'Installment plan created successfully',
    data: result
  });
});

// @desc    Record payment for installment
// @route   POST /api/installments/:installmentId/payment
// @access  Private
const recordInstallmentPayment = asyncHandler(async (req, res) => {
  const { installmentId } = req.params;
  const paymentData = req.body;
  const userId = req.user.id;

  const result = await installmentService.recordInstallmentPayment(installmentId, paymentData, userId);

  res.json({
    success: true,
    message: 'Installment payment recorded successfully',
    data: result
  });
});

// @desc    Get installment plan details
// @route   GET /api/installments/plan/:planId
// @access  Private
const getInstallmentPlan = asyncHandler(async (req, res) => {
  const { planId } = req.params;

  const plan = await installmentService.getInstallmentPlan(planId);

  if (!plan) {
    res.status(404);
    throw new Error('Installment plan not found');
  }

  res.json({
    success: true,
    data: plan
  });
});

// @desc    Get customer installment summary
// @route   GET /api/installments/customer/:customerId/summary
// @access  Private
const getCustomerInstallmentSummary = asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  const summary = await installmentService.getCustomerInstallmentSummary(customerId);

  res.json({
    success: true,
    data: summary
  });
});

// @desc    Get overdue installments
// @route   GET /api/installments/overdue
// @access  Private
const getOverdueInstallments = asyncHandler(async (req, res) => {
  const overdueInstallments = await installmentService.getOverdueInstallments();

  res.json({
    success: true,
    count: overdueInstallments.length,
    data: overdueInstallments
  });
});

// @desc    Process late charges (admin function)
// @route   POST /api/installments/process-late-charges
// @access  Private (Admin only)
const processLateCharges = asyncHandler(async (req, res) => {
  const result = await installmentService.processLateCharges();

  res.json({
    success: true,
    message: `Processed late charges for ${result.processed} installments`,
    data: result
  });
});

// @desc    Generate installment reminders
// @route   GET /api/installments/reminders
// @access  Private
const generateInstallmentReminders = asyncHandler(async (req, res) => {
  const { daysAhead = 7 } = req.query;

  const reminders = await installmentService.generateInstallmentReminders(parseInt(daysAhead));

  res.json({
    success: true,
    count: reminders.length,
    data: reminders
  });
});

// @desc    Get installment dashboard data
// @route   GET /api/installments/dashboard
// @access  Private
const getInstallmentDashboard = asyncHandler(async (req, res) => {
  const [overdueInstallments, upcomingReminders] = await Promise.all([
    installmentService.getOverdueInstallments(),
    installmentService.generateInstallmentReminders(30)
  ]);

  // Calculate summary statistics
  const totalOverdue = overdueInstallments.reduce((sum, installment) => {
    const remaining = parseFloat(installment.amount) - parseFloat(installment.paidAmount);
    return sum + remaining;
  }, 0);

  const totalUpcoming = upcomingReminders.reduce((sum, reminder) => {
    return sum + reminder.amount;
  }, 0);

  // Group by status
  const overdueByCustomer = overdueInstallments.reduce((acc, installment) => {
    const customerId = installment.plan.invoice.customer.id;
    if (!acc[customerId]) {
      acc[customerId] = {
        customer: installment.plan.invoice.customer,
        count: 0,
        totalAmount: 0
      };
    }
    acc[customerId].count++;
    acc[customerId].totalAmount += parseFloat(installment.amount) - parseFloat(installment.paidAmount);
    return acc;
  }, {});

  const dashboard = {
    summary: {
      totalOverdueInstallments: overdueInstallments.length,
      totalOverdueAmount: totalOverdue,
      totalUpcomingInstallments: upcomingReminders.length,
      totalUpcomingAmount: totalUpcoming
    },
    recentOverdue: overdueInstallments.slice(0, 10),
    upcomingPayments: upcomingReminders.slice(0, 10),
    overdueByCustomer: Object.values(overdueByCustomer)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 10)
  };

  res.json({
    success: true,
    data: dashboard
  });
});

module.exports = {
  createInstallmentPlan,
  recordInstallmentPayment,
  getInstallmentPlan,
  getCustomerInstallmentSummary,
  getOverdueInstallments,
  processLateCharges,
  generateInstallmentReminders,
  getInstallmentDashboard
};