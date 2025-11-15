// ========== src/controllers/reportController.js ==========
const asyncHandler = require('express-async-handler');
const financialReportsService = require('../services/financialReportsService');

// @desc    Get dashboard KPIs
// @route   GET /api/reports/dashboard
// @access  Private
const getDashboard = asyncHandler(async (req, res) => {
  const dashboard = await financialReportsService.getDashboardData();

  res.json({
    success: true,
    data: dashboard
  });
});

// ===================== COMPREHENSIVE FINANCIAL REPORTS =====================

// @desc    Generate Profit & Loss Statement
// @route   GET /api/reports/profit-loss
// @access  Private
const getProfitLossStatement = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    res.status(400);
    throw new Error('Start date and end date are required');
  }

  const report = await financialReportsService.generateProfitLossStatement(startDate, endDate);

  res.json({
    success: true,
    data: report
  });
});

// @desc    Generate Balance Sheet
// @route   GET /api/reports/balance-sheet
// @access  Private
const getBalanceSheet = asyncHandler(async (req, res) => {
  const { asOfDate = new Date().toISOString().split('T')[0] } = req.query;

  const report = await financialReportsService.generateBalanceSheet(asOfDate);

  res.json({
    success: true,
    data: report
  });
});

// @desc    Generate Cash Flow Statement
// @route   GET /api/reports/cash-flow
// @access  Private
const getCashFlowStatement = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    res.status(400);
    throw new Error('Start date and end date are required');
  }

  const report = await financialReportsService.generateCashFlowStatement(startDate, endDate);

  res.json({
    success: true,
    data: report
  });
});

// @desc    Generate Accounts Receivable Aging Report
// @route   GET /api/reports/accounts-receivable-aging
// @access  Private
const getAccountsReceivableAging = asyncHandler(async (req, res) => {
  const { asOfDate = new Date().toISOString().split('T')[0] } = req.query;

  const report = await financialReportsService.generateAccountsReceivableAging(new Date(asOfDate));

  res.json({
    success: true,
    data: report
  });
});

// @desc    Generate GST Report
// @route   GET /api/reports/gst
// @access  Private
const getGSTReport = asyncHandler(async (req, res) => {
  const { year, month } = req.query;

  if (!year || !month) {
    res.status(400);
    throw new Error('Year and month are required');
  }

  const report = await financialReportsService.generateGSTReport(parseInt(year), parseInt(month));

  res.json({
    success: true,
    data: report
  });
});

// @desc    Get Enhanced Financial Dashboard Summary
// @route   GET /api/reports/financial-dashboard
// @access  Private
const getFinancialDashboard = asyncHandler(async (req, res) => {
  const { period = 'month' } = req.query;

  let startDate, endDate;
  const now = new Date();

  if (period === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = now;
  } else if (period === 'quarter') {
    const quarterStart = Math.floor(now.getMonth() / 3) * 3;
    startDate = new Date(now.getFullYear(), quarterStart, 1);
    endDate = now;
  } else if (period === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = now;
  }

  // Get key financial metrics
  const [profitLoss, balanceSheet, arAging] = await Promise.all([
    financialReportsService.generateProfitLossStatement(
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    ),
    financialReportsService.generateBalanceSheet(endDate.toISOString().split('T')[0]),
    financialReportsService.generateAccountsReceivableAging(endDate)
  ]);

  const summary = {
    period: { startDate, endDate, type: period },
    revenue: {
      total: profitLoss.summary.grossRevenue,
      growth: 0 // Calculate growth vs previous period
    },
    profit: {
      gross: profitLoss.summary.grossProfit,
      net: profitLoss.summary.netIncome,
      margin: profitLoss.summary.netProfitMargin
    },
    cashFlow: {
      operating: 0,
      available: balanceSheet.assets.current.cash
    },
    receivables: {
      total: arAging.summary.total,
      overdue: arAging.summary.days31to60 + arAging.summary.days61to90 + arAging.summary.over90,
      overduePercentage: arAging.statistics.overduePercentage
    },
    inventory: {
      value: balanceSheet.assets.current.inventory
    }
  };

  res.json({
    success: true,
    data: summary
  });
});

// @desc    Generate Vendor Bills Aging Report
// @route   GET /api/reports/vendor-bills-aging
// @access  Private
const getVendorBillsAging = asyncHandler(async (req, res) => {
  const { asOfDate = new Date().toISOString().split('T')[0] } = req.query;

  const report = await financialReportsService.generateVendorBillsAging(new Date(asOfDate));

  res.json({
    success: true,
    data: report
  });
});

// @desc    Generate Inventory Turnover Report
// @route   GET /api/reports/inventory-turnover
// @access  Private
const getInventoryTurnover = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    res.status(400);
    throw new Error('Start date and end date are required');
  }

  const report = await financialReportsService.generateInventoryTurnoverReport(startDate, endDate);

  res.json({
    success: true,
    data: report
  });
});

// @desc    Generate Gross Profit Margin Report
// @route   GET /api/reports/gross-profit-margin
// @access  Private
const getGrossProfitMargin = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    res.status(400);
    throw new Error('Start date and end date are required');
  }

  const report = await financialReportsService.generateGrossProfitMarginReport(startDate, endDate);

  res.json({
    success: true,
    data: report
  });
});

// @desc    Get Trial Balance (all accounts with debit/credit balances)
// @route   GET /api/reports/trial-balance
// @access  Private
const getTrialBalance = asyncHandler(async (req, res) => {
  const { asOfDate = new Date().toISOString().split('T')[0] } = req.query;

  const report = await financialReportsService.generateTrialBalance(new Date(asOfDate));

  res.json({
    success: true,
    data: report
  });
});

module.exports = {
  getDashboard,
  getProfitLossStatement,
  getBalanceSheet,
  getCashFlowStatement,
  getAccountsReceivableAging,
  getGSTReport,
  getFinancialDashboard,
  getVendorBillsAging,
  getInventoryTurnover,
  getGrossProfitMargin,
  getTrialBalance
};
