# Purchase Order Billing System - Complete Refactoring Plan

## Executive Summary

This document provides a comprehensive refactoring plan to implement strict lifecycle management for the Purchase Order → Bill → Payment workflow with proper concurrency controls, data integrity guarantees, and maintainable code structure.

**Target Architecture:** PO (Draft → Sent → Partial → Completed) → Bills (multiple allowed) → Payments (immutable)

---

## 1. SCHEMA ANALYSIS & IMPROVEMENTS

### 1.1 Current State Assessment

**Existing Schema (Good):**
- ✅ Proper UUID primary keys
- ✅ DECIMAL(18,2) for financial amounts (good precision)
- ✅ Soft delete with `deletedAt`
- ✅ Audit timestamps (`createdAt`, `updatedAt`)
- ✅ Basic relationships in place

**Critical Gaps Identified:**
- ❌ No `billedAmount` tracking on PurchaseOrder
- ❌ No `cancelledAt` soft-cancel field for Bills
- ❌ Missing database-level CHECK constraints for amount validations
- ❌ No unique indexes to prevent race conditions
- ❌ Bill.paidAmount uses DECIMAL(10,2) instead of DECIMAL(18,2) (precision mismatch)
- ❌ No computed/materialized columns for aggregations
- ❌ Missing composite indexes for common queries

### 1.2 Proposed Schema Changes

```prisma
// ==================== ENHANCED PURCHASE ORDER ====================

model PurchaseOrder {
  id            String    @id @default(uuid())
  poNumber      String    @unique
  orderDate     DateTime
  expectedDate  DateTime?
  status        String    @default("Draft") // "Draft", "Sent", "Partial", "Completed", "Cancelled"

  // Financial amounts - CRITICAL: Use DECIMAL(18,4) for better precision
  subtotal      Decimal   @db.Decimal(18, 4)
  taxAmount     Decimal   @default(0) @db.Decimal(18, 4)
  total         Decimal   @db.Decimal(18, 4)

  // NEW: Track billed amount to enforce SUM(bills) <= PO.total
  billedAmount  Decimal   @default(0) @db.Decimal(18, 4)

  // NEW: Lock mechanism for concurrent bill creation
  lockedAt      DateTime?
  lockedBy      String?   // Session/user ID that holds the lock

  // Relationships
  vendorId      String
  vendor        Vendor    @relation(fields: [vendorId], references: [id])
  lineItems     PurchaseOrderItem[]
  items         Item[]
  bills         Bill[]    // One PO can have MULTIPLE bills

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  @@index([vendorId])
  @@index([status])
  @@index([status, deletedAt]) // Composite for common queries
  @@index([orderDate])
  @@index([deletedAt])
  @@index([lockedAt]) // For lock cleanup queries
}

// ==================== ENHANCED BILL ====================

model Bill {
  id            String    @id @default(uuid())
  billNumber    String    @unique
  billDate      DateTime
  dueDate       DateTime?
  status        String    @default("Unpaid") // "Unpaid", "Partial", "Paid"

  // Financial - FIXED: Use consistent DECIMAL(18,4) precision
  subtotal      Decimal   @db.Decimal(18, 4)
  taxAmount     Decimal   @default(0) @db.Decimal(18, 4)
  total         Decimal   @db.Decimal(18, 4)
  paidAmount    Decimal   @default(0) @db.Decimal(18, 4) // CHANGED from DECIMAL(10,2)

  // NEW: Soft-cancel instead of hard delete
  cancelledAt   DateTime?
  cancelReason  String?   // Why was this bill cancelled

  // NEW: Lock for concurrent payment processing
  lockedAt      DateTime?
  lockedBy      String?

  // Relationships
  vendorId      String
  vendor        Vendor    @relation(fields: [vendorId], references: [id])
  purchaseOrderId String  // CHANGED: Make REQUIRED (bill must belong to PO)
  purchaseOrder PurchaseOrder @relation(fields: [purchaseOrderId], references: [id])
  payments      VendorPayment[]
  ledgerEntries VendorLedger[]

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime? // Keep for compatibility, but use cancelledAt for soft-cancel

  @@index([vendorId])
  @@index([purchaseOrderId])
  @@index([status])
  @@index([status, cancelledAt]) // Composite for active bills
  @@index([billDate])
  @@index([cancelledAt])
  @@index([deletedAt])
  @@index([lockedAt])
}

// ==================== ENHANCED VENDOR PAYMENT ====================

model VendorPayment {
  id            String    @id @default(uuid())
  paymentNumber String    @unique
  paymentDate   DateTime
  amount        Decimal   @db.Decimal(18, 4) // CHANGED for precision
  method        String    // "Cash", "Bank Transfer", "Cheque"
  reference     String?
  notes         String?

  // Relationships
  vendorId      String
  vendor        Vendor    @relation(fields: [vendorId], references: [id])
  billId        String    // CHANGED: Make REQUIRED (payment must be against a bill)
  bill          Bill      @relation(fields: [billId], references: [id])

  // NEW: Payment approval workflow (optional)
  approvedAt    DateTime?
  approvedBy    String?

  // NEW: Track who created the payment
  createdBy     String
  createdByUser User      @relation("VendorPaymentsCreated", fields: [createdBy], references: [id])

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime? // Payments should NEVER be deleted, only voided

  // NEW: Void mechanism instead of delete
  voidedAt      DateTime?
  voidReason    String?
  voidedBy      String?

  @@index([vendorId])
  @@index([billId])
  @@index([paymentDate])
  @@index([deletedAt])
  @@index([voidedAt])
}

// ==================== NEW: AUDIT TRAIL ====================

model POBillAudit {
  id              String    @id @default(uuid())
  purchaseOrderId String
  purchaseOrder   PurchaseOrder @relation(fields: [purchaseOrderId], references: [id])

  action          String    // "BILL_CREATED", "BILL_CANCELLED", "PAYMENT_RECORDED", "STATUS_CHANGED"
  billId          String?
  paymentId       String?

  beforeState     Json?     // Snapshot before change
  afterState      Json      // Snapshot after change

  performedBy     String
  performedByUser User      @relation("POBillAudits", fields: [performedBy], references: [id])
  performedAt     DateTime  @default(now())

  metadata        Json?     // Additional context

  @@index([purchaseOrderId])
  @@index([billId])
  @@index([performedAt])
  @@index([action])
}
```

### 1.3 Migration SQL (Prisma Migration)

```sql
-- Step 1: Add new columns to PurchaseOrder
ALTER TABLE "PurchaseOrder"
  ADD COLUMN "billedAmount" DECIMAL(18,4) DEFAULT 0 NOT NULL,
  ADD COLUMN "lockedAt" TIMESTAMP,
  ADD COLUMN "lockedBy" TEXT;

-- Step 2: Change Bill precision and add new columns
ALTER TABLE "Bill"
  ALTER COLUMN "paidAmount" TYPE DECIMAL(18,4),
  ALTER COLUMN "subtotal" TYPE DECIMAL(18,4),
  ALTER COLUMN "taxAmount" TYPE DECIMAL(18,4),
  ALTER COLUMN "total" TYPE DECIMAL(18,4),
  ADD COLUMN "cancelledAt" TIMESTAMP,
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "lockedAt" TIMESTAMP,
  ADD COLUMN "lockedBy" TEXT,
  ALTER COLUMN "purchaseOrderId" SET NOT NULL; -- Make PO required

-- Step 3: Change VendorPayment precision and add new columns
ALTER TABLE "VendorPayment"
  ALTER COLUMN "amount" TYPE DECIMAL(18,4),
  ADD COLUMN "approvedAt" TIMESTAMP,
  ADD COLUMN "approvedBy" TEXT,
  ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN "voidedAt" TIMESTAMP,
  ADD COLUMN "voidReason" TEXT,
  ADD COLUMN "voidedBy" TEXT,
  ALTER COLUMN "billId" SET NOT NULL; -- Make bill required

-- Step 4: Backfill billedAmount for existing POs
UPDATE "PurchaseOrder" po
SET "billedAmount" = COALESCE(
  (SELECT SUM(b.total)
   FROM "Bill" b
   WHERE b."purchaseOrderId" = po.id
     AND b."deletedAt" IS NULL
     AND b."cancelledAt" IS NULL),
  0
);

-- Step 5: Add composite indexes
CREATE INDEX "PurchaseOrder_status_deletedAt_idx" ON "PurchaseOrder"("status", "deletedAt");
CREATE INDEX "Bill_status_cancelledAt_idx" ON "Bill"("status", "cancelledAt");
CREATE INDEX "Bill_purchaseOrderId_cancelledAt_idx" ON "Bill"("purchaseOrderId", "cancelledAt");

-- Step 6: Add CHECK constraints (optional, for extra safety)
ALTER TABLE "Bill" ADD CONSTRAINT "bill_amounts_valid"
  CHECK ("paidAmount" >= 0 AND "paidAmount" <= "total" + 0.01); -- Allow 1 cent tolerance

ALTER TABLE "Bill" ADD CONSTRAINT "bill_total_valid"
  CHECK ("total" = "subtotal" + "taxAmount");

-- Step 7: Create audit table
CREATE TABLE "POBillAudit" (
  "id" TEXT PRIMARY KEY,
  "purchaseOrderId" TEXT NOT NULL REFERENCES "PurchaseOrder"("id"),
  "action" TEXT NOT NULL,
  "billId" TEXT,
  "paymentId" TEXT,
  "beforeState" JSONB,
  "afterState" JSONB NOT NULL,
  "performedBy" TEXT NOT NULL REFERENCES "User"("id"),
  "performedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "metadata" JSONB
);

CREATE INDEX "POBillAudit_purchaseOrderId_idx" ON "POBillAudit"("purchaseOrderId");
CREATE INDEX "POBillAudit_performedAt_idx" ON "POBillAudit"("performedAt");
```

---

## 2. CORE IMPLEMENTATION: TRANSACTION PATTERNS

### 2.1 Transaction Wrapper Utility

**File:** `backend/src/utils/transactionWrapper.js`

```javascript
/**
 * Transaction wrapper utilities for safe concurrent operations
 */

const db = require('../config/database');
const logger = require('../config/logger');

/**
 * Custom error classes for better error handling
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

class ConcurrencyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConcurrencyError';
    this.statusCode = 409;
  }
}

class InsufficientBalanceError extends Error {
  constructor(message, available, required) {
    super(message);
    this.name = 'InsufficientBalanceError';
    this.statusCode = 400;
    this.available = available;
    this.required = required;
  }
}

/**
 * Execute a function within a Prisma transaction with retry logic
 *
 * @param {Function} callback - Async function that receives Prisma transaction client
 * @param {Object} options - Transaction options
 * @param {number} options.maxRetries - Maximum number of retries on deadlock (default: 3)
 * @param {number} options.timeout - Transaction timeout in ms (default: 10000)
 * @param {boolean} options.isolationLevel - Isolation level (default: Serializable)
 * @returns {Promise<any>} Result from callback
 */
async function withTransaction(callback, options = {}) {
  const {
    maxRetries = 3,
    timeout = 10000,
    isolationLevel = 'Serializable'
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await db.prisma.$transaction(
        async (tx) => {
          // Set transaction isolation level
          if (isolationLevel === 'Serializable') {
            await tx.$executeRaw`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`;
          }

          return await callback(tx);
        },
        {
          maxWait: 5000, // Max wait to get a connection
          timeout: timeout
        }
      );
    } catch (error) {
      lastError = error;

      // Check if error is due to serialization/deadlock
      const isDeadlock = error.code === '40001' ||
                        error.code === '40P01' ||
                        error.message?.includes('deadlock') ||
                        error.message?.includes('could not serialize');

      if (isDeadlock && attempt < maxRetries) {
        logger.warn(`Transaction deadlock detected, retry ${attempt}/${maxRetries}`, {
          error: error.message
        });

        // Exponential backoff: 100ms, 200ms, 400ms
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
        continue;
      }

      // Re-throw if not a deadlock or max retries exceeded
      throw error;
    }
  }

  throw new ConcurrencyError(
    `Transaction failed after ${maxRetries} attempts due to concurrent modifications`
  );
}

/**
 * Acquire a row-level lock on a record using SELECT ... FOR UPDATE
 *
 * @param {Object} tx - Prisma transaction client
 * @param {string} table - Table name
 * @param {string} id - Record ID to lock
 * @param {number} timeout - Lock timeout in seconds (default: 5)
 * @returns {Promise<Object>} Locked record
 */
async function lockForUpdate(tx, table, id, timeout = 5) {
  // PostgreSQL: Use SELECT ... FOR UPDATE with NOWAIT or timeout
  const result = await tx.$queryRawUnsafe(
    `SELECT * FROM "${table}" WHERE id = $1 FOR UPDATE NOWAIT`,
    id
  );

  if (!result || result.length === 0) {
    throw new ValidationError(`Record not found in ${table} with id ${id}`);
  }

  return result[0];
}

/**
 * Acquire application-level advisory lock
 * This is useful for serializing certain operations
 *
 * @param {Object} tx - Prisma transaction client
 * @param {string} lockKey - Unique lock key
 * @returns {Promise<boolean>} True if lock acquired
 */
async function acquireAdvisoryLock(tx, lockKey) {
  // Convert string to integer hash for pg_advisory_xact_lock
  const lockId = hashStringToInt(lockKey);

  // Try to acquire advisory lock (auto-released at transaction end)
  const result = await tx.$queryRaw`
    SELECT pg_try_advisory_xact_lock(${lockId}) as locked
  `;

  return result[0].locked;
}

/**
 * Simple string hash function (for advisory locks)
 */
function hashStringToInt(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Validate and compare decimal amounts with tolerance
 *
 * @param {Decimal|number|string} amount1
 * @param {Decimal|number|string} amount2
 * @param {number} tolerance - Allowed difference (default: 0.0001 for DECIMAL(18,4))
 * @returns {boolean} True if amounts are equal within tolerance
 */
function compareAmounts(amount1, amount2, tolerance = 0.0001) {
  const diff = Math.abs(parseFloat(amount1) - parseFloat(amount2));
  return diff <= tolerance;
}

/**
 * Safely add decimal amounts
 */
function addAmounts(...amounts) {
  return amounts.reduce((sum, amount) => {
    return sum + (parseFloat(amount) || 0);
  }, 0);
}

/**
 * Format amount to fixed precision for storage
 */
function formatAmount(amount, precision = 4) {
  return parseFloat(parseFloat(amount).toFixed(precision));
}

module.exports = {
  withTransaction,
  lockForUpdate,
  acquireAdvisoryLock,
  ValidationError,
  ConcurrencyError,
  InsufficientBalanceError,
  compareAmounts,
  addAmounts,
  formatAmount
};
```

---

## 3. BUSINESS LOGIC: PO LIFECYCLE SERVICE

### 3.1 Purchase Order Service

**File:** `backend/src/services/purchaseOrderService.js`

```javascript
/**
 * Purchase Order Lifecycle Management Service
 *
 * Implements strict lifecycle: Draft → Sent → Partial → Completed
 * with proper concurrency controls and data integrity
 */

const db = require('../config/database');
const logger = require('../config/logger');
const {
  withTransaction,
  lockForUpdate,
  ValidationError,
  ConcurrencyError,
  InsufficientBalanceError,
  compareAmounts,
  addAmounts,
  formatAmount
} = require('../utils/transactionWrapper');
const { generatePONumber } = require('../utils/generateId');

/**
 * Valid PO status transitions
 */
const STATUS_TRANSITIONS = {
  'Draft': ['Sent', 'Cancelled'],
  'Sent': ['Partial', 'Completed', 'Cancelled'],
  'Partial': ['Completed', 'Cancelled'],
  'Completed': [], // Terminal state
  'Cancelled': [] // Terminal state
};

/**
 * Create a new Purchase Order
 *
 * @param {Object} data - PO data
 * @param {string} data.vendorId - Vendor ID
 * @param {Date} data.orderDate - Order date
 * @param {Date} data.expectedDate - Expected delivery date
 * @param {Array} data.lineItems - Array of line items
 * @param {number} data.subtotal - Subtotal amount
 * @param {number} data.taxAmount - Tax amount
 * @param {number} data.total - Total amount
 * @returns {Promise<Object>} Created PO
 */
async function createPurchaseOrder(data) {
  return withTransaction(async (tx) => {
    // Validate amounts
    const subtotal = formatAmount(data.subtotal);
    const taxAmount = formatAmount(data.taxAmount || 0);
    const total = formatAmount(data.total);

    // Verify total = subtotal + tax
    if (!compareAmounts(total, subtotal + taxAmount)) {
      throw new ValidationError(
        `Total (${total}) must equal subtotal (${subtotal}) + tax (${taxAmount})`
      );
    }

    // Verify line items sum to subtotal
    const lineItemsTotal = data.lineItems.reduce((sum, item) => {
      return sum + formatAmount(item.totalPrice);
    }, 0);

    if (!compareAmounts(lineItemsTotal, subtotal)) {
      throw new ValidationError(
        `Line items total (${lineItemsTotal}) must equal subtotal (${subtotal})`
      );
    }

    // Verify vendor exists
    const vendor = await tx.vendor.findUnique({
      where: { id: data.vendorId, deletedAt: null }
    });

    if (!vendor) {
      throw new ValidationError('Vendor not found');
    }

    // Generate PO number
    const poNumber = await generatePONumber();

    // Create PO with line items
    const purchaseOrder = await tx.purchaseOrder.create({
      data: {
        poNumber,
        orderDate: data.orderDate || new Date(),
        expectedDate: data.expectedDate || null,
        status: 'Draft', // Always start as Draft
        subtotal,
        taxAmount,
        total,
        billedAmount: 0, // Initialize to 0
        vendorId: data.vendorId,
        lineItems: {
          create: data.lineItems.map(item => ({
            productModelId: item.productModelId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: formatAmount(item.unitPrice),
            totalPrice: formatAmount(item.totalPrice),
            specifications: item.specifications || {},
            notes: item.notes || null
          }))
        }
      },
      include: {
        vendor: true,
        lineItems: {
          include: {
            productModel: {
              include: {
                category: true,
                company: true
              }
            }
          }
        }
      }
    });

    logger.info(`PO created: ${poNumber}`, {
      poId: purchaseOrder.id,
      vendor: vendor.name,
      total: total
    });

    return purchaseOrder;
  });
}

/**
 * Update Purchase Order Status
 *
 * @param {string} poId - PO ID
 * @param {string} newStatus - New status
 * @param {string} userId - User performing the action
 * @returns {Promise<Object>} Updated PO
 */
async function updatePurchaseOrderStatus(poId, newStatus, userId) {
  return withTransaction(async (tx) => {
    // Lock the PO row
    const po = await lockForUpdate(tx, 'PurchaseOrder', poId);

    // Validate status transition
    const allowedTransitions = STATUS_TRANSITIONS[po.status] || [];

    if (!allowedTransitions.includes(newStatus)) {
      throw new ValidationError(
        `Cannot transition from ${po.status} to ${newStatus}. Allowed: ${allowedTransitions.join(', ')}`
      );
    }

    // Additional validations
    if (newStatus === 'Completed') {
      // Can only complete if fully billed
      if (!compareAmounts(po.billedAmount, po.total)) {
        throw new ValidationError(
          `Cannot complete PO. Billed amount (${po.billedAmount}) must equal total (${po.total})`
        );
      }
    }

    // Update status
    const updated = await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: newStatus,
        updatedAt: new Date()
      },
      include: {
        vendor: true
      }
    });

    // Create audit log
    await tx.pOBillAudit.create({
      data: {
        purchaseOrderId: poId,
        action: 'STATUS_CHANGED',
        beforeState: { status: po.status },
        afterState: { status: newStatus },
        performedBy: userId,
        metadata: { reason: 'Manual status update' }
      }
    });

    logger.info(`PO status updated: ${po.poNumber}`, {
      poId,
      oldStatus: po.status,
      newStatus
    });

    return updated;
  });
}

/**
 * Update Purchase Order (Draft only)
 *
 * @param {string} poId - PO ID
 * @param {Object} updates - Updated data
 * @returns {Promise<Object>} Updated PO
 */
async function updatePurchaseOrder(poId, updates) {
  return withTransaction(async (tx) => {
    // Lock the PO
    const po = await lockForUpdate(tx, 'PurchaseOrder', poId);

    // Can only update Draft POs
    if (po.status !== 'Draft') {
      throw new ValidationError(
        `Cannot update PO in ${po.status} status. Only Draft POs can be edited.`
      );
    }

    // Validate amounts if provided
    if (updates.total !== undefined) {
      const subtotal = formatAmount(updates.subtotal || po.subtotal);
      const taxAmount = formatAmount(updates.taxAmount || po.taxAmount);
      const total = formatAmount(updates.total);

      if (!compareAmounts(total, subtotal + taxAmount)) {
        throw new ValidationError('Total must equal subtotal + tax');
      }
    }

    // Delete existing line items if new ones provided
    if (updates.lineItems) {
      await tx.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: poId }
      });
    }

    // Update PO
    const updated = await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        orderDate: updates.orderDate || po.orderDate,
        expectedDate: updates.expectedDate,
        vendorId: updates.vendorId || po.vendorId,
        subtotal: updates.subtotal ? formatAmount(updates.subtotal) : undefined,
        taxAmount: updates.taxAmount ? formatAmount(updates.taxAmount) : undefined,
        total: updates.total ? formatAmount(updates.total) : undefined,
        lineItems: updates.lineItems ? {
          create: updates.lineItems.map(item => ({
            productModelId: item.productModelId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: formatAmount(item.unitPrice),
            totalPrice: formatAmount(item.totalPrice),
            specifications: item.specifications || {},
            notes: item.notes
          }))
        } : undefined
      },
      include: {
        vendor: true,
        lineItems: {
          include: {
            productModel: {
              include: {
                category: true,
                company: true
              }
            }
          }
        }
      }
    });

    return updated;
  });
}

/**
 * Get Purchase Order with computed fields
 *
 * @param {string} poId - PO ID
 * @returns {Promise<Object>} PO with computed fields
 */
async function getPurchaseOrder(poId) {
  const po = await db.prisma.purchaseOrder.findUnique({
    where: { id: poId, deletedAt: null },
    include: {
      vendor: true,
      lineItems: {
        include: {
          productModel: {
            include: {
              category: true,
              company: true
            }
          }
        }
      },
      bills: {
        where: {
          deletedAt: null,
          cancelledAt: null
        },
        include: {
          _count: {
            select: { payments: true }
          }
        }
      }
    }
  });

  if (!po) {
    throw new ValidationError('Purchase Order not found');
  }

  // Add computed fields
  po.remainingAmount = formatAmount(po.total - po.billedAmount);
  po.canCreateBill = po.status !== 'Cancelled' &&
                     po.status !== 'Completed' &&
                     po.remainingAmount > 0;

  return po;
}

module.exports = {
  createPurchaseOrder,
  updatePurchaseOrder,
  updatePurchaseOrderStatus,
  getPurchaseOrder,
  STATUS_TRANSITIONS
};
```

---

### 3.2 Bill Service (with Concurrency Control)

**File:** `backend/src/services/billService.js`

```javascript
/**
 * Bill Management Service
 *
 * Implements strict rules:
 * - Multiple bills can be created against a PO
 * - SUM(bills) <= PO.total (enforced with locks)
 * - Only unpaid bills can be cancelled
 * - Bill status auto-updates based on payments
 */

const db = require('../config/database');
const logger = require('../config/logger');
const {
  withTransaction,
  lockForUpdate,
  ValidationError,
  ConcurrencyError,
  InsufficientBalanceError,
  compareAmounts,
  addAmounts,
  formatAmount
} = require('../utils/transactionWrapper');
const { generateBillNumber } = require('../utils/generateId');

/**
 * Create a bill against a Purchase Order
 *
 * @param {Object} data - Bill data
 * @param {string} data.purchaseOrderId - PO ID
 * @param {string} data.vendorId - Vendor ID
 * @param {Date} data.billDate - Bill date
 * @param {Date} data.dueDate - Due date
 * @param {number} data.subtotal - Subtotal
 * @param {number} data.taxAmount - Tax amount
 * @param {number} data.total - Total amount
 * @param {string} userId - User creating the bill
 * @returns {Promise<Object>} Created bill
 */
async function createBill(data, userId) {
  return withTransaction(async (tx) => {
    // 1. Lock the Purchase Order (critical for concurrency)
    const po = await lockForUpdate(tx, 'PurchaseOrder', data.purchaseOrderId);

    // 2. Validate PO status
    if (po.status === 'Cancelled') {
      throw new ValidationError('Cannot create bill for cancelled Purchase Order');
    }

    if (po.status === 'Completed') {
      throw new ValidationError('Cannot create bill for completed Purchase Order');
    }

    // 3. Validate vendor matches PO
    if (po.vendorId !== data.vendorId) {
      throw new ValidationError('Vendor must match Purchase Order vendor');
    }

    // 4. Format and validate amounts
    const subtotal = formatAmount(data.subtotal);
    const taxAmount = formatAmount(data.taxAmount || 0);
    const total = formatAmount(data.total);

    if (!compareAmounts(total, subtotal + taxAmount)) {
      throw new ValidationError(
        `Bill total (${total}) must equal subtotal (${subtotal}) + tax (${taxAmount})`
      );
    }

    // 5. CRITICAL: Check available balance (SUM(bills) <= PO.total)
    const currentBilledAmount = formatAmount(po.billedAmount);
    const newBilledAmount = formatAmount(currentBilledAmount + total);
    const poTotal = formatAmount(po.total);

    if (newBilledAmount > poTotal + 0.01) { // Allow 1 cent tolerance
      throw new InsufficientBalanceError(
        `Bill total (${total}) exceeds remaining PO balance. ` +
        `PO Total: ${poTotal}, Already Billed: ${currentBilledAmount}, Available: ${poTotal - currentBilledAmount}`,
        poTotal - currentBilledAmount,
        total
      );
    }

    // 6. Generate bill number
    const billNumber = await generateBillNumber();

    // 7. Create the bill
    const bill = await tx.bill.create({
      data: {
        billNumber,
        billDate: data.billDate || new Date(),
        dueDate: data.dueDate || null,
        status: 'Unpaid',
        subtotal,
        taxAmount,
        total,
        paidAmount: 0,
        vendorId: data.vendorId,
        purchaseOrderId: data.purchaseOrderId
      },
      include: {
        vendor: true,
        purchaseOrder: true
      }
    });

    // 8. Update PO billed amount and status
    const updatedBilledAmount = formatAmount(po.billedAmount + total);
    let newPOStatus = po.status;

    // Auto-transition to Partial if first bill created
    if (po.status === 'Sent' && updatedBilledAmount > 0) {
      newPOStatus = 'Partial';
    }

    // Auto-transition to Completed if fully billed
    if (compareAmounts(updatedBilledAmount, po.total)) {
      newPOStatus = 'Completed';
    }

    await tx.purchaseOrder.update({
      where: { id: data.purchaseOrderId },
      data: {
        billedAmount: updatedBilledAmount,
        status: newPOStatus
      }
    });

    // 9. Create vendor ledger entry
    const vendor = await tx.vendor.findUnique({
      where: { id: data.vendorId }
    });

    const newVendorBalance = formatAmount(vendor.currentBalance + total);

    await tx.vendorLedger.create({
      data: {
        vendorId: data.vendorId,
        entryDate: data.billDate || new Date(),
        description: `Bill ${billNumber}`,
        debit: total,
        credit: 0,
        balance: newVendorBalance,
        billId: bill.id
      }
    });

    // 10. Update vendor balance
    await tx.vendor.update({
      where: { id: data.vendorId },
      data: {
        currentBalance: newVendorBalance
      }
    });

    // 11. Create audit trail
    await tx.pOBillAudit.create({
      data: {
        purchaseOrderId: data.purchaseOrderId,
        action: 'BILL_CREATED',
        billId: bill.id,
        beforeState: {
          poStatus: po.status,
          billedAmount: po.billedAmount
        },
        afterState: {
          poStatus: newPOStatus,
          billedAmount: updatedBilledAmount,
          billTotal: total
        },
        performedBy: userId,
        metadata: {
          billNumber,
          vendorId: data.vendorId
        }
      }
    });

    logger.info(`Bill created: ${billNumber}`, {
      billId: bill.id,
      poNumber: po.poNumber,
      amount: total,
      poStatus: `${po.status} → ${newPOStatus}`
    });

    return bill;
  });
}

/**
 * Cancel a bill (soft-cancel)
 * Only unpaid bills can be cancelled
 *
 * @param {string} billId - Bill ID
 * @param {string} reason - Cancellation reason
 * @param {string} userId - User performing cancellation
 * @returns {Promise<Object>} Cancelled bill
 */
async function cancelBill(billId, reason, userId) {
  return withTransaction(async (tx) => {
    // 1. Lock the bill
    const bill = await lockForUpdate(tx, 'Bill', billId);

    // 2. Validate bill can be cancelled
    if (bill.cancelledAt) {
      throw new ValidationError('Bill is already cancelled');
    }

    if (bill.status !== 'Unpaid') {
      throw new ValidationError(
        `Cannot cancel bill with status ${bill.status}. Only unpaid bills can be cancelled.`
      );
    }

    if (bill.paidAmount > 0) {
      throw new ValidationError(
        `Cannot cancel bill with payments. Bill has ${bill.paidAmount} paid.`
      );
    }

    // 3. Lock the PO
    const po = await lockForUpdate(tx, 'PurchaseOrder', bill.purchaseOrderId);

    // 4. Soft-cancel the bill
    const cancelled = await tx.bill.update({
      where: { id: billId },
      data: {
        cancelledAt: new Date(),
        cancelReason: reason
      },
      include: {
        vendor: true,
        purchaseOrder: true
      }
    });

    // 5. Update PO billed amount
    const newBilledAmount = formatAmount(po.billedAmount - bill.total);
    let newPOStatus = po.status;

    // Revert from Completed if needed
    if (po.status === 'Completed' && newBilledAmount < po.total) {
      newPOStatus = 'Partial';
    }

    // Revert from Partial if all bills cancelled
    if (po.status === 'Partial' && newBilledAmount === 0) {
      newPOStatus = 'Sent';
    }

    await tx.purchaseOrder.update({
      where: { id: bill.purchaseOrderId },
      data: {
        billedAmount: newBilledAmount,
        status: newPOStatus
      }
    });

    // 6. Reverse vendor ledger entry
    const vendor = await tx.vendor.findUnique({
      where: { id: bill.vendorId }
    });

    const newVendorBalance = formatAmount(vendor.currentBalance - bill.total);

    await tx.vendorLedger.create({
      data: {
        vendorId: bill.vendorId,
        entryDate: new Date(),
        description: `Bill ${bill.billNumber} cancelled: ${reason}`,
        debit: 0,
        credit: bill.total,
        balance: newVendorBalance,
        billId: bill.id
      }
    });

    // 7. Update vendor balance
    await tx.vendor.update({
      where: { id: bill.vendorId },
      data: {
        currentBalance: newVendorBalance
      }
    });

    // 8. Create audit trail
    await tx.pOBillAudit.create({
      data: {
        purchaseOrderId: bill.purchaseOrderId,
        action: 'BILL_CANCELLED',
        billId: bill.id,
        beforeState: {
          billStatus: bill.status,
          poStatus: po.status,
          billedAmount: po.billedAmount
        },
        afterState: {
          billStatus: 'Cancelled',
          poStatus: newPOStatus,
          billedAmount: newBilledAmount
        },
        performedBy: userId,
        metadata: { reason }
      }
    });

    logger.info(`Bill cancelled: ${bill.billNumber}`, {
      billId,
      reason,
      refundedToPO: bill.total
    });

    return cancelled;
  });
}

/**
 * Update bill status based on payments
 * Internal helper, called by payment service
 *
 * @param {Object} tx - Transaction client
 * @param {string} billId - Bill ID
 * @returns {Promise<string>} New status
 */
async function updateBillStatus(tx, billId) {
  const bill = await tx.bill.findUnique({
    where: { id: billId }
  });

  if (!bill) {
    throw new ValidationError('Bill not found');
  }

  let newStatus = 'Unpaid';

  if (compareAmounts(bill.paidAmount, bill.total)) {
    newStatus = 'Paid';
  } else if (bill.paidAmount > 0) {
    newStatus = 'Partial';
  }

  if (newStatus !== bill.status) {
    await tx.bill.update({
      where: { id: billId },
      data: { status: newStatus }
    });
  }

  return newStatus;
}

/**
 * Get bill with computed fields
 *
 * @param {string} billId - Bill ID
 * @returns {Promise<Object>} Bill with computed fields
 */
async function getBill(billId) {
  const bill = await db.prisma.bill.findUnique({
    where: { id: billId, deletedAt: null },
    include: {
      vendor: true,
      purchaseOrder: true,
      payments: {
        where: { deletedAt: null, voidedAt: null },
        orderBy: { paymentDate: 'desc' }
      }
    }
  });

  if (!bill) {
    throw new ValidationError('Bill not found');
  }

  // Add computed fields
  bill.remainingAmount = formatAmount(bill.total - bill.paidAmount);
  bill.isCancelled = !!bill.cancelledAt;
  bill.canBePaid = !bill.cancelledAt && bill.remainingAmount > 0;
  bill.canBeCancelled = !bill.cancelledAt && bill.status === 'Unpaid' && bill.paidAmount === 0;

  return bill;
}

module.exports = {
  createBill,
  cancelBill,
  updateBillStatus,
  getBill
};
```

This is a comprehensive start to the refactoring plan. Due to length constraints, I'll continue with the payment service, validation layer, and testing strategy in the next response.

Would you like me to continue with:
1. Payment Service implementation
2. Validation layer
3. Controller updates
4. Testing strategy
5. Complete migration guide

Let me know which sections you'd like me to prioritize!
