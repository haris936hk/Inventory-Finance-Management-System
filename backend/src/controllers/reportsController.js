const asyncHandler = require('express-async-handler');
const financialReportsService = require('../services/financialReportsService');

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

// @desc    Get Financial Dashboard Summary
// @route   GET /api/reports/financial-summary
// @access  Private
const getFinancialSummary = asyncHandler(async (req, res) => {
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
      operating: 0, // Would need cash flow data
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

// @desc    Export Report to PDF/Excel
// @route   POST /api/reports/export
// @access  Private
const exportReport = asyncHandler(async (req, res) => {
  const { reportType, format, parameters } = req.body;

  // Validate inputs
  if (!reportType || !format) {
    res.status(400);
    throw new Error('Report type and format are required');
  }

  let reportData;

  switch (reportType) {
    case 'profit-loss':
      reportData = await financialReportsService.generateProfitLossStatement(
        parameters.startDate,
        parameters.endDate
      );
      break;
    case 'balance-sheet':
      reportData = await financialReportsService.generateBalanceSheet(parameters.asOfDate);
      break;
    case 'cash-flow':
      reportData = await financialReportsService.generateCashFlowStatement(
        parameters.startDate,
        parameters.endDate
      );
      break;
    case 'ar-aging':
      reportData = await financialReportsService.generateAccountsReceivableAging(
        new Date(parameters.asOfDate)
      );
      break;
    default:
      res.status(400);
      throw new Error('Invalid report type');
  }

  // For now, return the data (implement actual export later)
  res.json({
    success: true,
    message: `${reportType} report exported as ${format}`,
    data: reportData
  });
});

module.exports = {
  getProfitLossStatement,
  getBalanceSheet,
  getCashFlowStatement,
  getAccountsReceivableAging,
  getGSTReport,
  getFinancialSummary,
  exportReport
};