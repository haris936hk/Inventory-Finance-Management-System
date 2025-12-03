// ========== src/routes/authRoutes.js ==========
const express = require('express');
const router = express.Router();
const {
  login,
  changePassword,
  getMe,
  logout
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// Public routes
router.post('/login', login);
// Refresh route removed - not needed for desktop app

// Protected routes
router.get('/me', protect, getMe);
router.post('/change-password', protect, changePassword);
router.post('/logout', protect, logout);

module.exports = router;