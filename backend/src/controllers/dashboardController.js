const asyncHandler = require('express-async-handler');
const dashboardService = require('../services/dashboardService');

/**
 * @desc    Get comprehensive dashboard statistics
 * @route   GET /api/reports/dashboard
 * @access  Private
 */
const getDashboardStats = asyncHandler(async (req, res) => {
  const stats = await dashboardService.getDashboardStats();

  res.json({
    success: true,
    data: stats,
  });
});

/**
 * @desc    Get monthly revenue trend
 * @route   GET /api/reports/dashboard/revenue-trend
 * @access  Private
 */
const getRevenueTrend = asyncHandler(async (req, res) => {
  const { months = 6 } = req.query;
  const trend = await dashboardService.getMonthlyRevenueTrend(parseInt(months));

  res.json({
    success: true,
    data: trend,
  });
});

/**
 * @desc    Get inventory status breakdown
 * @route   GET /api/reports/dashboard/inventory-status
 * @access  Private
 */
const getInventoryStatusBreakdown = asyncHandler(async (req, res) => {
  const breakdown = await dashboardService.getInventoryStatusBreakdown();

  res.json({
    success: true,
    data: breakdown,
  });
});

module.exports = {
  getDashboardStats,
  getRevenueTrend,
  getInventoryStatusBreakdown,
};
