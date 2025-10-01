# PO Billing System - Migration Guide

## Overview

This guide provides step-by-step instructions for implementing the refactored Purchase Order billing system with strict lifecycle management and concurrency controls.

**Timeline:** 5-7 days for complete implementation and testing

---

## Phase 1: Database Schema Updates (Day 1-2)

### Step 1.1: Backup Current Database

```bash
# Create backup before any changes
pg_dump -h your-host -U your-user -d your-database > backup_$(date +%Y%m%d).sql
```

### Step 1.2: Create Prisma Migration

```bash
cd backend
npx prisma migrate dev --name add_po_lifecycle_management --create-only
```

### Step 1.3: Update Prisma Schema

Edit `backend/prisma/schema.prisma` and apply the changes from `REFACTORING_PLAN.md` section 1.2:

Key changes:
- Add `billedAmount`, `lockedAt`, `lockedBy` to PurchaseOrder
- Change Bill decimal precision to DECIMAL(18,4)
- Add `cancelledAt`, `cancelReason` to Bill
- Add `voidedAt`, `voidReason`, `createdBy` to VendorPayment
- Add POBillAudit table
- Update User model with new relations

### Step 1.4: Run Migration

```bash
npx prisma migrate deploy
```

### Step 1.5: Backfill Data

```sql
-- Update existing POs with billedAmount
UPDATE "PurchaseOrder" po
SET "billedAmount" = COALESCE(
  (SELECT SUM(b.total)
   FROM "Bill" b
   WHERE b."purchaseOrderId" = po.id
     AND b."deletedAt" IS NULL
     AND b."cancelledAt" IS NULL),
  0
);

-- Set default createdBy for existing payments (use system user ID)
UPDATE "VendorPayment"
SET "createdBy" = 'YOUR-SYSTEM-USER-ID'
WHERE "createdBy" IS NULL;
```

### Step 1.6: Verify Schema

```bash
npx prisma db pull
npx prisma generate
```

---

## Phase 2: Install Utility Code (Day 2)

### Step 2.1: Create Transaction Wrapper

Create `backend/src/utils/transactionWrapper.js` with the code from `REFACTORING_PLAN.md` section 2.1.

### Step 2.2: Create Custom Error Classes

The error classes are included in transactionWrapper.js:
- `ValidationError`
- `ConcurrencyError`
- `InsufficientBalanceError`

### Step 2.3: Update Error Handler Middleware

Edit `backend/src/middleware/errorHandler.js`:

```javascript
const errorHandler = (err, req, res, next) => {
  const logger = require('../config/logger');

  let statusCode = err.statusCode || res.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Handle custom error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
  } else if (err.name === 'ConcurrencyError') {
    statusCode = 409;
  } else if (err.name === 'InsufficientBalanceError') {
    statusCode = 400;
    // Include additional context
    message = {
      error: err.message,
      available: err.available,
      required: err.required
    };
  }

  // Log error
  logger.error(`${req.method} ${req.path} - ${statusCode}`, {
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    user: req.user?.id
  });

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
```

---

## Phase 3: Implement Service Layer (Day 3-4)

### Step 3.1: Create Services

Create the following files with code from `REFACTORING_PLAN.md` and `REFACTORING_PLAN_PART2.md`:

1. `backend/src/services/purchaseOrderService.js` (Section 3.1)
2. `backend/src/services/billService.js` (Section 3.2)
3. `backend/src/services/paymentService.js` (Section 3.3)
4. `backend/src/services/validationService.js` (Section 4)

### Step 3.2: Create Service Index

Create `backend/src/services/index.js`:

```javascript
module.exports = {
  purchaseOrderService: require('./purchaseOrderService'),
  billService: require('./billService'),
  paymentService: require('./paymentService'),
  validationService: require('./validationService')
};
```

---

## Phase 4: Update Controllers & Routes (Day 4)

### Step 4.1: Create V2 Controller

Create `backend/src/controllers/financeControllerV2.js` with code from `REFACTORING_PLAN_PART2.md` section 5.

### Step 4.2: Create V2 Routes

Create `backend/src/routes/financeRoutesV2.js`:

```javascript
const express = require('express');
const router = express.Router();
const {
  createPurchaseOrder,
  updatePurchaseOrder,
  updatePurchaseOrderStatus,
  getPurchaseOrder,
  createBill,
  cancelBill,
  getBill,
  recordPayment,
  voidPayment,
  getBillPayments
} = require('../controllers/financeControllerV2');
const { protect, authorize } = require('../middleware/auth');

// Purchase Orders
router.post('/purchase-orders', protect, authorize('finance.create'), createPurchaseOrder);
router.get('/purchase-orders/:id', protect, authorize('finance.view'), getPurchaseOrder);
router.put('/purchase-orders/:id', protect, authorize('finance.edit'), updatePurchaseOrder);
router.put('/purchase-orders/:id/status', protect, authorize('finance.edit'), updatePurchaseOrderStatus);

// Bills
router.post('/bills', protect, authorize('finance.create'), createBill);
router.get('/bills/:id', protect, authorize('finance.view'), getBill);
router.post('/bills/:id/cancel', protect, authorize('finance.edit'), cancelBill);

// Payments
router.post('/payments', protect, authorize('finance.create'), recordPayment);
router.get('/bills/:billId/payments', protect, authorize('finance.view'), getBillPayments);
router.post('/payments/:id/void', protect, authorize('finance.edit'), voidPayment);

module.exports = router;
```

### Step 4.3: Register Routes

Edit `backend/src/app.js` or `backend/src/server.js`:

```javascript
// Add V2 routes (keep V1 for backward compatibility during migration)
const financeRoutesV2 = require('./routes/financeRoutesV2');
app.use('/api/v2/finance', financeRoutesV2);

// Existing V1 routes (deprecate after migration)
const financeRoutes = require('./routes/financeRoutes');
app.use('/api/finance', financeRoutes);
```

---

## Phase 5: Update Frontend (Day 5)

### Step 5.1: Update API Base URLs

Create `frontend/src/config/apiConfig.js`:

```javascript
const API_VERSION = process.env.REACT_APP_API_VERSION || 'v2';
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export const API_ENDPOINTS = {
  v1: {
    purchaseOrders: `${API_BASE_URL}/finance/purchase-orders`,
    bills: `${API_BASE_URL}/finance/vendor-bills`,
    payments: `${API_BASE_URL}/finance/vendor-payments`
  },
  v2: {
    purchaseOrders: `${API_BASE_URL}/v2/finance/purchase-orders`,
    bills: `${API_BASE_URL}/v2/finance/bills`,
    payments: `${API_BASE_URL}/v2/finance/payments`
  }
};

// Use V2 by default, fallback to V1
export const getCurrentEndpoints = () => API_ENDPOINTS[API_VERSION] || API_ENDPOINTS.v2;
```

### Step 5.2: Update Axios Calls

Update `financeController.js` calls to use V2 endpoints:

```javascript
// Before
const response = await axios.post('/finance/vendor-bills', data);

// After
import { getCurrentEndpoints } from '../../config/apiConfig';
const endpoints = getCurrentEndpoints();
const response = await axios.post(endpoints.bills, data);
```

### Step 5.3: Add Error Handling

Update frontend components to handle new error types:

```javascript
try {
  await axios.post(endpoints.bills, billData);
} catch (error) {
  const errorData = error.response?.data;

  if (errorData?.error?.available !== undefined) {
    // InsufficientBalanceError
    message.error(
      `Insufficient balance. Available: ${formatPKR(errorData.error.available)}, ` +
      `Required: ${formatPKR(errorData.error.required)}`
    );
  } else if (error.response?.status === 409) {
    // ConcurrencyError
    message.error('This record is being modified by another user. Please try again.');
  } else {
    message.error(errorData?.error || 'Operation failed');
  }
}
```

---

## Phase 6: Testing (Day 6)

### Step 6.1: Install Testing Dependencies

```bash
cd backend
npm install --save-dev jest @jest/globals supertest
```

### Step 6.2: Configure Jest

Edit `backend/package.json`:

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "jest": {
    "testEnvironment": "node",
    "coveragePathIgnorePatterns": ["/node_modules/"],
    "testMatch": ["**/tests/**/*.test.js"]
  }
}
```

### Step 6.3: Create Test Suite

Create `backend/tests/services/billService.test.js` with code from `REFACTORING_PLAN_PART2.md` section 6.1.

### Step 6.4: Run Tests

```bash
npm test
```

### Step 6.5: Manual Testing Checklist

- [ ] Create PO in Draft status
- [ ] Update PO (should work)
- [ ] Change PO to Sent status
- [ ] Try to update PO (should fail)
- [ ] Create first bill (should succeed)
- [ ] Create second bill (should succeed if total <= PO total)
- [ ] Try to create bill exceeding PO total (should fail)
- [ ] Record payment on bill (should succeed)
- [ ] Try to cancel bill with payment (should fail)
- [ ] Record full payment (bill should auto-mark as Paid)
- [ ] PO should auto-complete when fully billed
- [ ] Test concurrent bill creation (simulate with Postman)
- [ ] Void a payment (should reverse bill status)

---

## Phase 7: Deployment (Day 7)

### Step 7.1: Pre-Deployment Checklist

- [ ] All tests passing
- [ ] Database backup created
- [ ] Prisma migrations ready
- [ ] Environment variables set
- [ ] Rollback plan documented

### Step 7.2: Deployment Steps

1. **Stop Application**
   ```bash
   pm2 stop your-app
   ```

2. **Run Database Migration**
   ```bash
   cd backend
   npx prisma migrate deploy
   ```

3. **Backfill Existing Data**
   ```bash
   node scripts/backfillPOBilledAmounts.js
   ```

4. **Deploy New Code**
   ```bash
   git pull origin main
   npm install
   npx prisma generate
   ```

5. **Start Application**
   ```bash
   pm2 start your-app
   pm2 logs
   ```

### Step 7.3: Post-Deployment Verification

Run smoke tests:

```bash
# Test endpoints
curl -X GET http://your-server/api/v2/finance/purchase-orders \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check logs
tail -f /var/log/your-app.log
```

---

## Rollback Plan

If issues occur, follow these steps:

### Step 1: Stop Application
```bash
pm2 stop your-app
```

### Step 2: Revert Code
```bash
git checkout <previous-commit-hash>
npm install
```

### Step 3: Revert Database (if necessary)
```bash
# Only if schema changes are problematic
psql -h your-host -U your-user -d your-database < backup_YYYYMMDD.sql
```

### Step 4: Restart Application
```bash
pm2 start your-app
```

---

## Monitoring & Maintenance

### Key Metrics to Monitor

1. **Transaction Performance**
   - Average transaction duration
   - Lock wait times
   - Deadlock frequency

2. **Data Integrity**
   ```sql
   -- Check for PO billing discrepancies
   SELECT po.id, po."poNumber", po.total, po."billedAmount",
          COALESCE(SUM(b.total), 0) as actual_billed
   FROM "PurchaseOrder" po
   LEFT JOIN "Bill" b ON b."purchaseOrderId" = po.id
     AND b."deletedAt" IS NULL
     AND b."cancelledAt" IS NULL
   GROUP BY po.id
   HAVING po."billedAmount" != COALESCE(SUM(b.total), 0);
   ```

3. **Error Rates**
   - ConcurrencyErrors
   - InsufficientBalanceErrors
   - ValidationErrors

### Scheduled Maintenance Tasks

```javascript
// backend/scripts/integrityCheck.js
const db = require('../src/config/database');

async function runIntegrityChecks() {
  // Check PO billed amounts
  const poDiscrepancies = await db.prisma.$queryRaw`
    SELECT po.id, po."poNumber", po."billedAmount",
           COALESCE(SUM(b.total), 0) as calculated
    FROM "PurchaseOrder" po
    LEFT JOIN "Bill" b ON b."purchaseOrderId" = po.id
      AND b."deletedAt" IS NULL
      AND b."cancelledAt" IS NULL
    GROUP BY po.id
    HAVING ABS(po."billedAmount" - COALESCE(SUM(b.total), 0)) > 0.01
  `;

  if (poDiscrepancies.length > 0) {
    console.error('PO billed amount discrepancies found:', poDiscrepancies);
  }

  // Check bill paid amounts
  const billDiscrepancies = await db.prisma.$queryRaw`
    SELECT b.id, b."billNumber", b."paidAmount",
           COALESCE(SUM(p.amount), 0) as calculated
    FROM "Bill" b
    LEFT JOIN "VendorPayment" p ON p."billId" = b.id
      AND p."deletedAt" IS NULL
      AND p."voidedAt" IS NULL
    GROUP BY b.id
    HAVING ABS(b."paidAmount" - COALESCE(SUM(p.amount), 0)) > 0.01
  `;

  if (billDiscrepancies.length > 0) {
    console.error('Bill paid amount discrepancies found:', billDiscrepancies);
  }

  console.log('Integrity check complete');
}

runIntegrityChecks();
```

Run daily:
```bash
# Add to crontab
0 2 * * * cd /path/to/backend && node scripts/integrityCheck.js
```

---

## Performance Optimization

### Step 1: Add Indexes for Common Queries

```sql
-- Queries for active bills
CREATE INDEX IF NOT EXISTS "Bill_status_cancelledAt_idx"
  ON "Bill"("status", "cancelledAt") WHERE "deletedAt" IS NULL;

-- Queries for PO billing status
CREATE INDEX IF NOT EXISTS "PurchaseOrder_status_billedAmount_idx"
  ON "PurchaseOrder"("status", "billedAmount") WHERE "deletedAt" IS NULL;

-- Audit trail queries
CREATE INDEX IF NOT EXISTS "POBillAudit_performedAt_action_idx"
  ON "POBillAudit"("performedAt" DESC, "action");
```

### Step 2: Connection Pool Tuning

Edit `backend/src/config/database.js`:

```javascript
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  // Optimize connection pool for your workload
  pool: {
    min: 2,
    max: 20, // Adjust based on concurrent users (2-5 users = 10-20 connections)
    idleTimeoutMillis: 30000
  }
});

module.exports = { prisma };
```

---

## Troubleshooting

### Issue 1: Deadlocks

**Symptoms:** ConcurrencyError with "deadlock detected" message

**Solution:**
1. Check logs for conflicting operations
2. Ensure operations lock records in consistent order (always PO before Bill)
3. Reduce transaction duration
4. Add retry logic (already included in transactionWrapper)

### Issue 2: Slow Transactions

**Symptoms:** Transactions taking > 5 seconds

**Solution:**
1. Check for missing indexes
2. Verify connection pool isn't exhausted
3. Review transaction isolation level (Serializable can be slower)
4. Consider using Read Committed for read-heavy operations

### Issue 3: Amount Discrepancies

**Symptoms:** PO billedAmount doesn't match SUM(bills)

**Solution:**
1. Run integrity check script
2. Manually recalculate:
   ```sql
   UPDATE "PurchaseOrder" po
   SET "billedAmount" = (
     SELECT COALESCE(SUM(b.total), 0)
     FROM "Bill" b
     WHERE b."purchaseOrderId" = po.id
       AND b."deletedAt" IS NULL
       AND b."cancelledAt" IS NULL
   );
   ```

---

## Success Criteria

✅ **Data Integrity**
- No cases where SUM(bills) > PO.total
- No cases where SUM(payments) > bill.total
- All amounts consistent with calculations

✅ **Concurrency**
- Concurrent bill creation properly serialized
- No deadlocks under normal load (2-5 concurrent users)

✅ **Performance**
- Average transaction time < 2 seconds
- No timeouts under expected load

✅ **Functionality**
- All lifecycle transitions work correctly
- Proper error messages for invalid operations
- Audit trail captures all changes

---

## Support & Resources

- **Prisma Docs:** https://www.prisma.io/docs
- **PostgreSQL Locking:** https://www.postgresql.org/docs/current/explicit-locking.html
- **Transaction Isolation:** https://www.postgresql.org/docs/current/transaction-iso.html

## Questions?

Review the complete implementation in:
- `REFACTORING_PLAN.md` - Schema and core services
- `REFACTORING_PLAN_PART2.md` - Payment service, validation, tests

For issues, check logs at:
```bash
tail -f backend/logs/combined.log
```
