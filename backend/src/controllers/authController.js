// ========== src/controllers/authController.js ==========
const asyncHandler = require('express-async-handler');
const authService = require('../services/authService');

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400);
    throw new Error('Please provide username and password');
  }

  const result = await authService.login(username, password);

  res.json({
    success: true,
    ...result
  });
});

// @desc    Refresh token
// @route   POST /api/auth/refresh
// @access  Public
const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    res.status(400);
    throw new Error('Refresh token required');
  }

  const result = await authService.refreshToken(refreshToken);

  res.json({
    success: true,
    ...result
  });
});

// @desc    Change password
// @route   POST /api/auth/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    res.status(400);
    throw new Error('Please provide old and new password');
  }

  if (newPassword.length < 6) {
    res.status(400);
    throw new Error('Password must be at least 6 characters');
  }

  const result = await authService.changePassword(
    req.user.id,
    oldPassword,
    newPassword
  );

  res.json({
    success: true,
    ...result
  });
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      fullName: req.user.fullName,
      email: req.user.email,
      role: req.user.role.name,
      permissions: req.user.role.permissions
    }
  });
});

// @desc    Logout (client-side token removal)
// @route   POST /api/auth/logout
// @access  Private
const logout = asyncHandler(async (req, res) => {
  // In a JWT setup, logout is handled client-side by removing tokens
  // Optionally, you can maintain a token blacklist in Redis/DB
  
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = {
  login,
  refresh,
  changePassword,
  getMe,
  logout
};
