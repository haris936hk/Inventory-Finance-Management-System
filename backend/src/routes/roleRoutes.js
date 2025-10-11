// ========== src/routes/roleRoutes.js ==========
const express = require('express');
const router = express.Router();
const { getRoles, getRole } = require('../controllers/roleController');
const { protect, hasPermission } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Get all roles (admin only)
router.get('/', hasPermission(['roles.view']), getRoles);

// Get specific role (admin only)
router.get('/:id', hasPermission(['roles.view']), getRole);

module.exports = router;
