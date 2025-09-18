// ========== src/routes/userRoutes.js ==========
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect, hasPermission } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// User management (admin only)
router.get('/', hasPermission(['users.view']), userController.getUsers);
router.get('/:id', hasPermission(['users.view']), userController.getUser);
router.post('/', hasPermission(['users.create']), userController.createUser);
router.put('/:id', hasPermission(['users.edit']), userController.updateUser);
router.delete('/:id', hasPermission(['users.delete']), userController.deleteUser);
router.post('/:id/restore', hasPermission(['users.edit']), userController.restoreUser);
router.post('/:id/reset-password', hasPermission(['users.edit']), userController.resetPassword);

module.exports = router;