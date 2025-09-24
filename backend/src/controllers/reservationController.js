// ========== src/controllers/reservationController.js ==========
const asyncHandler = require('express-async-handler');
const reservationService = require('../services/reservationService');

// @desc    Get grouped available items
// @route   GET /api/inventory/items/grouped
// @access  Private
const getGroupedAvailableItems = asyncHandler(async (req, res) => {
  const filters = {
    categoryId: req.query.categoryId,
    modelId: req.query.modelId,
    condition: req.query.condition
  };

  const groupedItems = await reservationService.getGroupedAvailableItems(filters);

  res.json({
    success: true,
    count: groupedItems.length,
    data: groupedItems
  });
});

// @desc    Reserve specific items manually
// @route   POST /api/inventory/items/reserve
// @access  Private
const reserveSpecificItems = asyncHandler(async (req, res) => {
  const { itemIds, reason, expiryMinutes } = req.body;

  if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
    res.status(400);
    throw new Error('Item IDs array is required');
  }

  const reservation = await reservationService.reserveItems(
    itemIds,
    req.user.id,
    reason,
    expiryMinutes
  );

  res.status(201).json({
    success: true,
    data: reservation
  });
});

// @desc    Auto-assign items based on preferences
// @route   POST /api/inventory/items/auto-assign
// @access  Private
const autoAssignItems = asyncHandler(async (req, res) => {
  const { groupKey, quantity, assignmentPreference } = req.body;

  if (!groupKey || !quantity) {
    res.status(400);
    throw new Error('Group key and quantity are required');
  }

  const result = await reservationService.autoAssignItems(
    groupKey,
    quantity,
    assignmentPreference,
    req.user.id
  );

  res.status(201).json({
    success: true,
    data: result
  });
});

// @desc    Get reservations by session
// @route   GET /api/inventory/reservations/:sessionId
// @access  Private
const getReservationsBySession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const reservations = await reservationService.getReservationsBySession(sessionId);

  res.json({
    success: true,
    count: reservations.length,
    data: reservations
  });
});

// @desc    Release reservations
// @route   DELETE /api/inventory/reservations/:sessionId
// @access  Private
const releaseReservations = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const result = await reservationService.releaseReservations(sessionId, req.user.id);

  res.json({
    success: true,
    message: `Released ${result.count} reservations`,
    data: result
  });
});

// @desc    Extend reservation
// @route   PUT /api/inventory/reservations/:sessionId/extend
// @access  Private
const extendReservation = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { additionalMinutes = 30 } = req.body;

  const result = await reservationService.extendReservation(sessionId, additionalMinutes);

  res.json({
    success: true,
    message: 'Reservation extended',
    data: result
  });
});

// @desc    Cleanup expired reservations (admin only)
// @route   DELETE /api/inventory/reservations/expired
// @access  Private (Admin)
const cleanupExpiredReservations = asyncHandler(async (req, res) => {
  const result = await reservationService.cleanupExpiredReservations();

  res.json({
    success: true,
    message: `Cleaned up ${result.count} expired reservations`,
    data: result
  });
});

module.exports = {
  getGroupedAvailableItems,
  reserveSpecificItems,
  autoAssignItems,
  getReservationsBySession,
  releaseReservations,
  extendReservation,
  cleanupExpiredReservations
};