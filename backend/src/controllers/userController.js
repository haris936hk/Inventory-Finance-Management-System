// ========== src/controllers/userController.js ==========
const asyncHandler = require('express-async-handler');
const userService = require('../services/userService');

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
const getUsers = asyncHandler(async (req, res) => {
  const users = await userService.getAllUsers();
  
  res.json({
    success: true,
    count: users.length,
    data: users
  });
});

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private/Admin
const getUser = asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.params.id);
  
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  
  res.json({
    success: true,
    data: user
  });
});

// @desc    Create user
// @route   POST /api/users
// @access  Private/Admin
const createUser = asyncHandler(async (req, res) => {
  const user = await userService.createUser(req.body, req.user.username);
  
  res.status(201).json({
    success: true,
    data: user
  });
});

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = asyncHandler(async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body);
  
  res.json({
    success: true,
    data: user
  });
});

// @desc    Delete user (soft)
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = asyncHandler(async (req, res) => {
  await userService.deleteUser(req.params.id);
  
  res.json({
    success: true,
    message: 'User deleted successfully'
  });
});

// @desc    Restore user
// @route   POST /api/users/:id/restore
// @access  Private/Admin
const restoreUser = asyncHandler(async (req, res) => {
  const user = await userService.restoreUser(req.params.id);
  
  res.json({
    success: true,
    data: user
  });
});

// @desc    Reset user password
// @route   POST /api/users/:id/reset-password
// @access  Private/Admin
const resetPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  
  if (!newPassword || newPassword.length < 6) {
    res.status(400);
    throw new Error('Password must be at least 6 characters');
  }
  
  await userService.resetPassword(req.params.id, newPassword, req.user.username);
  
  res.json({
    success: true,
    message: 'Password reset successfully'
  });
});

module.exports = {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  restoreUser,
  resetPassword
};