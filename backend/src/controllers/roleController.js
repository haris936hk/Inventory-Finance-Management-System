// ========== src/controllers/roleController.js ==========
const asyncHandler = require('express-async-handler');
const roleService = require('../services/roleService');

// @desc    Get all roles
// @route   GET /api/roles
// @access  Private/Admin
const getRoles = asyncHandler(async (req, res) => {
  const roles = await roleService.getAllRoles();

  res.json({
    success: true,
    count: roles.length,
    data: roles
  });
});

// @desc    Get single role
// @route   GET /api/roles/:id
// @access  Private/Admin
const getRole = asyncHandler(async (req, res) => {
  const role = await roleService.getRoleById(req.params.id);

  if (!role) {
    res.status(404);
    throw new Error('Role not found');
  }

  res.json({
    success: true,
    data: role
  });
});

module.exports = {
  getRoles,
  getRole
};
