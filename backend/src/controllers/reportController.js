// ========== src/controllers/reportController.js ==========
const asyncHandler = require('express-async-handler');
const reportService = require('../services/reportService');

// @desc    Get dashboard KPIs
// @route   GET /api/reports/dashboard
// @access  Private
const getDashboard = asyncHandler(async (req, res) => {
  const dashboard = await reportService.getDashboardData();
  
  res.json({
    success: true,
    data: dashboard
  });
});

// @desc    Get inventory report
// @route   GET /api/reports/inventory
// @access  Private
const getInventoryReport = asyncHandler(async (req, res) => {
  const report = await reportService.getInventoryReport(req.query);
  
  res.json({
    success: true,
    data: report
  });
});

// @desc    Get financial summary
// @route   GET /api/reports/financial-summary
// @access  Private
const getFinancialSummary = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const summary = await reportService.getFinancialSummary(startDate, endDate);
  
  res.json({
    success: true,
    data: summary
  });
});

// @desc    Get sales report
// @route   GET /api/reports/sales
// @access  Private
const getSalesReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, groupBy } = req.query;
  const report = await reportService.getSalesReport(startDate, endDate, groupBy);
  
  res.json({
    success: true,
    data: report
  });
});

// @desc    Get stock valuation report
// @route   GET /api/reports/stock-valuation
// @access  Private
const getStockValuation = asyncHandler(async (req, res) => {
  const valuation = await reportService.getStockValuation();
  
  res.json({
    success: true,
    data: valuation
  });
});

// @desc    Export report to Excel
// @route   POST /api/reports/export
// @access  Private
const exportReport = asyncHandler(async (req, res) => {
  const { reportType, filters } = req.body;
  
  const file = await reportService.exportToExcel(reportType, filters);
  
  res.json({
    success: true,
    data: {
      filename: file.filename,
      url: file.url
    }
  });
});

module.exports = {
  getDashboard,
  getInventoryReport,
  getFinancialSummary,
  getSalesReport,
  getStockValuation,
  exportReport
};
