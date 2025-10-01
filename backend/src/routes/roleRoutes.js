// ========== src/routes/roleRoutes.js ==========
const express = require('express');
const router = express.Router();
const { getRoles, getRole } = require('../controllers/roleController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

router.get('/', getRoles);
router.get('/:id', getRole);

module.exports = router;
