const express = require('express');
const {
  createInstallmentPlan,
  recordInstallmentPayment,
  getInstallmentPlan,
  getCustomerInstallmentSummary,
  getOverdueInstallments,
  processLateCharges,
  generateInstallmentReminders,
  getInstallmentDashboard
} = require('../controllers/installmentController');

const { protect } = require('../middleware/authMiddleware');
const { checkPermission } = require('../middleware/permissionMiddleware');

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Installment Plan Management
router.post('/create-plan',
  checkPermission('finance.create'),
  createInstallmentPlan
);

router.get('/plan/:planId',
  checkPermission('finance.view'),
  getInstallmentPlan
);

// Payment Processing
router.post('/:installmentId/payment',
  checkPermission('finance.edit'),
  recordInstallmentPayment
);

// Customer Management
router.get('/customer/:customerId/summary',
  checkPermission('finance.view'),
  getCustomerInstallmentSummary
);

// Monitoring and Reports
router.get('/overdue',
  checkPermission('finance.view'),
  getOverdueInstallments
);

router.get('/reminders',
  checkPermission('finance.view'),
  generateInstallmentReminders
);

router.get('/dashboard',
  checkPermission('finance.view'),
  getInstallmentDashboard
);

// Administrative Functions
router.post('/process-late-charges',
  checkPermission('finance.admin'),
  processLateCharges
);

module.exports = router;