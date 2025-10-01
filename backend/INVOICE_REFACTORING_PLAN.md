# Invoice Lifecycle Refactoring Plan (Receivables System)

## Executive Summary

This document provides a comprehensive refactoring plan to implement strict lifecycle management for the Invoice → Payment workflow with proper concurrency controls, data integrity guarantees, and maintainable code structure - mirroring the Purchase Order system but for receivables.

**Target Architecture:** Invoice (Draft → Sent → Partial → Paid → Overdue → Cancelled) → Payments (immutable with void support)

**Key Constraint:** Only invoices in **Draft** status can be cancelled.

---

## 1. SCHEMA ANALYSIS & IMPROVEMENTS

### 1.1 Current State Assessment

**Existing Schema (Good):**
- ✅ Proper UUID primary keys
- ✅ Status field with correct lifecycle values: "Draft", "Sent", "Partial", "Paid", "Overdue", "Cancelled"
- ✅ `paidAmount` field exists for tracking payments
- ✅ Soft delete with `deletedAt`
- ✅ Audit timestamps (`createdAt`, `updatedAt`)
- ✅ Basic relationships in place
- ✅ Comprehensive GST/VAT compliance fields (CGST, SGST, IGST)
- ✅ Installment plan support

**Critical Gaps Identified:**
- ❌ **Precision Mismatch:** Invoice.paidAmount uses DECIMAL(10,2) instead of DECIMAL(18,4)
- ❌ **Precision Mismatch:** Payment.amount uses DECIMAL(18,2) instead of DECIMAL(18,4)
- ❌ **No cancelledAt field:** Currently uses `deletedAt` and `voidReason` - needs proper soft-cancel
- ❌ **Missing Payment void fields:** No `voidedAt`, `voidReason`, `voidedBy` for immutable pattern
- ❌ **No audit trail:** Missing InvoicePaymentAudit model
- ❌ **No composite indexes** for common lifecycle queries
- ❌ **No database-level CHECK constraints** for amount validations

### 1.2 Proposed Schema Changes

```prisma
// ==================== ENHANCED INVOICE ====================

model Invoice {
  id            String    @id @default(uuid())
  invoiceNumber String    @unique
  invoiceDate   DateTime
  dueDate       DateTime
  status        String    @default("Draft") // "Draft", "Sent", "Partial", "Paid", "Overdue", "Cancelled"

  // Financial amounts - UPGRADED: Use DECIMAL(18,4) for precision consistency
  subtotal      Decimal   @db.Decimal(18, 4)  // CHANGED from (18,2)
  discountType  String?   // "Percentage", "Fixed"
  discountValue Decimal   @default(0) @db.Decimal(10, 2)

  // GST/VAT Compliance - Keep existing precision for tax rates
  taxType       String    @default("GST") // "GST", "VAT", "CGST+SGST", "IGST"
  taxRate       Decimal   @default(0) @db.Decimal(5, 2)
  taxAmount     Decimal   @default(0) @db.Decimal(18, 4)  // CHANGED from (18,2)
  cgstRate      Decimal   @default(0) @db.Decimal(5, 2)
  cgstAmount    Decimal   @default(0) @db.Decimal(18, 4)  // CHANGED from (10,2)
  sgstRate      Decimal   @default(0) @db.Decimal(5, 2)
  sgstAmount    Decimal   @default(0) @db.Decimal(18, 4)  // CHANGED from (10,2)
  igstRate      Decimal   @default(0) @db.Decimal(5, 2)
  igstAmount    Decimal   @default(0) @db.Decimal(18, 4)  // CHANGED from (10,2)

  total         Decimal   @db.Decimal(18, 4)  // CHANGED from (18,2)
  paidAmount    Decimal   @default(0) @db.Decimal(18, 4)  // CHANGED from (10,2)

  // Tax Compliance Details
  placeOfSupply String?   // State/Province for tax jurisdiction
  hsn           String?   // HSN/SAC Code
  gstinNumber   String?   // Customer's GSTIN

  // Terms
  terms         String?   @db.Text
  notes         String?   @db.Text

  // Installment support
  hasInstallment Boolean  @default(false)
  installmentPlan InstallmentPlan?

  // NEW: Soft-cancel mechanism (proper pattern)
  cancelledAt   DateTime?
  cancelReason  String?
  cancelledBy   String?
  cancelledByUser User?   @relation("InvoicesCancelled", fields: [cancelledBy], references: [id])

  // DEPRECATED: Remove voidReason (use cancelReason instead)
  // voidReason    String?  // Will be migrated to cancelReason

  // Relationships
  customerId    String
  customer      Customer  @relation(fields: [customerId], references: [id])
  items         InvoiceItem[]
  payments      Payment[]
  ledgerEntries CustomerLedger[]
  auditLogs     InvoicePaymentAudit[]

  // User tracking
  createdById   String
  createdBy     User      @relation("CreatedByUser", fields: [createdById], references: [id])

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  @@index([customerId])
  @@index([status])
  @@index([status, cancelledAt])  // NEW: For filtering active invoices
  @@index([invoiceDate])
  @@index([dueDate])              // NEW: For overdue calculations
  @@index([cancelledAt])          // NEW: For cancelled invoice queries
  @@index([deletedAt])
}

// ==================== ENHANCED PAYMENT (Customer Payments) ====================

model Payment {
  id            String    @id @default(uuid())
  paymentNumber String    @unique
  paymentDate   DateTime
  amount        Decimal   @db.Decimal(18, 4)  // CHANGED from (18,2) for consistency
  method        String    // "Cash", "Bank Transfer", "Cheque", "UPI", "Card"
  reference     String?   // Cheque number, transaction ID, UPI ref, etc.
  notes         String?

  // Relationships
  customerId    String
  customer      Customer  @relation(fields: [customerId], references: [id])
  invoiceId     String?
  invoice       Invoice?  @relation(fields: [invoiceId], references: [id])
  installmentId String?
  installment   Installment? @relation(fields: [installmentId], references: [id])

  // NEW: Void mechanism instead of delete (immutable payments)
  voidedAt      DateTime?
  voidReason    String?
  voidedBy      String?
  voidedByUser  User?     @relation("PaymentsVoided", fields: [voidedBy], references: [id])

  // User tracking
  recordedById  String
  recordedBy    User      @relation("RecordedByUser", fields: [recordedById], references: [id])

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  @@index([customerId])
  @@index([invoiceId])
  @@index([paymentDate])
  @@index([voidedAt])     // NEW: For filtering voided payments
  @@index([deletedAt])
}

// ==================== NEW: INVOICE PAYMENT AUDIT TRAIL ====================

model InvoicePaymentAudit {
  id            String    @id @default(uuid())
  invoiceId     String
  invoice       Invoice   @relation(fields: [invoiceId], references: [id])

  action        String    // "INVOICE_CREATED", "INVOICE_CANCELLED", "PAYMENT_RECORDED", "PAYMENT_VOIDED", "STATUS_CHANGED"
  paymentId     String?

  beforeState   Json?     // Snapshot before change
  afterState    Json      // Snapshot after change

  performedBy   String
  performedByUser User    @relation("InvoicePaymentAudits", fields: [performedBy], references: [id])
  performedAt   DateTime  @default(now())

  metadata      Json?     // Additional context (reason, notes, etc.)

  @@index([invoiceId])
  @@index([paymentId])
  @@index([performedAt])
  @@index([action])
}

// ==================== UPDATED USER MODEL (New Relations) ====================

model User {
  // ... existing fields ...

  // NEW relations
  invoicesCancelled      Invoice[]             @relation("InvoicesCancelled")
  paymentsVoided         Payment[]             @relation("PaymentsVoided")
  invoicePaymentAudits   InvoicePaymentAudit[] @relation("InvoicePaymentAudits")
}
```

### 1.3 Migration SQL (Prisma Migration)

```sql
-- ============================================================
-- INVOICE LIFECYCLE MIGRATION
-- Upgrades precision and adds lifecycle fields
-- ============================================================

-- Step 1: Upgrade Invoice precision to DECIMAL(18,4)
ALTER TABLE "Invoice"
  ALTER COLUMN "subtotal" TYPE DECIMAL(18,4),
  ALTER COLUMN "taxAmount" TYPE DECIMAL(18,4),
  ALTER COLUMN "cgstAmount" TYPE DECIMAL(18,4),
  ALTER COLUMN "sgstAmount" TYPE DECIMAL(18,4),
  ALTER COLUMN "igstAmount" TYPE DECIMAL(18,4),
  ALTER COLUMN "total" TYPE DECIMAL(18,4),
  ALTER COLUMN "paidAmount" TYPE DECIMAL(18,4);

-- Step 2: Add soft-cancel fields to Invoice
ALTER TABLE "Invoice"
  ADD COLUMN "cancelledAt" TIMESTAMP,
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "cancelledBy" TEXT REFERENCES "User"("id");

-- Step 3: Migrate existing voidReason to cancelReason (if any voided invoices exist)
UPDATE "Invoice"
SET "cancelReason" = "voidReason"
WHERE "voidReason" IS NOT NULL;

-- Step 4: Upgrade Payment precision to DECIMAL(18,4)
ALTER TABLE "Payment"
  ALTER COLUMN "amount" TYPE DECIMAL(18,4);

-- Step 5: Add void fields to Payment
ALTER TABLE "Payment"
  ADD COLUMN "voidedAt" TIMESTAMP,
  ADD COLUMN "voidReason" TEXT,
  ADD COLUMN "voidedBy" TEXT REFERENCES "User"("id");

-- Step 6: Add composite indexes for performance
CREATE INDEX "Invoice_status_cancelledAt_idx" ON "Invoice"("status", "cancelledAt");
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice"("dueDate");
CREATE INDEX "Invoice_cancelledAt_idx" ON "Invoice"("cancelledAt");
CREATE INDEX "Payment_voidedAt_idx" ON "Payment"("voidedAt");

-- Step 7: Add CHECK constraints for data integrity
ALTER TABLE "Payment" ADD CONSTRAINT "payment_amount_positive"
  CHECK ("amount" > 0);

-- Note: Invoice-level constraint requires aggregation, handled in application logic

-- Step 8: Create InvoicePaymentAudit table
CREATE TABLE "InvoicePaymentAudit" (
  "id" TEXT PRIMARY KEY,
  "invoiceId" TEXT NOT NULL REFERENCES "Invoice"("id"),
  "action" TEXT NOT NULL,
  "paymentId" TEXT,
  "beforeState" JSONB,
  "afterState" JSONB NOT NULL,
  "performedBy" TEXT NOT NULL REFERENCES "User"("id"),
  "performedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "metadata" JSONB
);

CREATE INDEX "InvoicePaymentAudit_invoiceId_idx" ON "InvoicePaymentAudit"("invoiceId");
CREATE INDEX "InvoicePaymentAudit_paymentId_idx" ON "InvoicePaymentAudit"("paymentId");
CREATE INDEX "InvoicePaymentAudit_performedAt_idx" ON "InvoicePaymentAudit"("performedAt");
CREATE INDEX "InvoicePaymentAudit_action_idx" ON "InvoicePaymentAudit"("action");

-- Step 9: Data validation - identify any orphaned or invalid records
-- Check for payments exceeding invoice totals (should be 0)
SELECT
  i."invoiceNumber",
  i."total",
  i."paidAmount",
  i."paidAmount" - i."total" as "overpayment"
FROM "Invoice" i
WHERE i."paidAmount" > i."total" + 0.01
  AND i."deletedAt" IS NULL;

-- Step 10: Recalculate paidAmount for all invoices (safety check)
UPDATE "Invoice" i
SET "paidAmount" = COALESCE(
  (SELECT SUM(p.amount)
   FROM "Payment" p
   WHERE p."invoiceId" = i.id
     AND p."deletedAt" IS NULL
     AND p."voidedAt" IS NULL),
  0
)
WHERE i."deletedAt" IS NULL;
```

---

## 2. CORE IMPLEMENTATION: INVOICE SERVICE

### 2.1 Invoice Lifecycle Service

**File:** `backend/src/services/invoiceService.js`

```javascript
/**
 * Invoice Lifecycle Management Service (Receivables)
 *
 * Implements strict lifecycle: Draft → Sent → Partial → Paid → Overdue → Cancelled
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
const { generateInvoiceNumber } = require('../utils/generateId');

/**
 * Valid Invoice status transitions
 */
const STATUS_TRANSITIONS = {
  'Draft': ['Sent', 'Cancelled'],
  'Sent': ['Partial', 'Paid', 'Overdue', 'Cancelled'],
  'Partial': ['Paid', 'Overdue', 'Cancelled'],
  'Paid': [], // Terminal state
  'Overdue': ['Partial', 'Paid', 'Cancelled'], // Can still receive payments
  'Cancelled': [] // Terminal state
};

/**
 * Calculate current invoice status based on payments and due date
 *
 * @param {Object} invoice - Invoice record
 * @returns {string} Calculated status
 */
function calculateInvoiceStatus(invoice) {
  // If cancelled, always return Cancelled
  if (invoice.cancelledAt) {
    return 'Cancelled';
  }

  const total = formatAmount(invoice.total);
  const paid = formatAmount(invoice.paidAmount || 0);
  const now = new Date();
  const dueDate = new Date(invoice.dueDate);

  // Check if fully paid
  if (compareAmounts(paid, total)) {
    return 'Paid';
  }

  // Check if overdue (past due date and not fully paid)
  if (dueDate < now && paid < total) {
    return 'Overdue';
  }

  // Check if partially paid
  if (paid > 0 && paid < total) {
    return 'Partial';
  }

  // Otherwise keep current status (Draft or Sent)
  return invoice.status === 'Draft' ? 'Draft' : 'Sent';
}

/**
 * Create a new Invoice
 *
 * @param {Object} data - Invoice data
 * @param {string} data.customerId - Customer ID
 * @param {Date} data.invoiceDate - Invoice date
 * @param {Date} data.dueDate - Payment due date
 * @param {Array} data.items - Array of invoice items
 * @param {number} data.subtotal - Subtotal amount
 * @param {number} data.taxAmount - Tax amount
 * @param {number} data.total - Total amount
 * @param {string} userId - User creating the invoice
 * @returns {Promise<Object>} Created invoice
 */
async function createInvoice(data, userId) {
  return withTransaction(async (tx) => {
    // Validate amounts
    const subtotal = formatAmount(data.subtotal);
    const taxAmount = formatAmount(data.taxAmount || 0);
    const total = formatAmount(data.total);

    // Verify total = subtotal + tax (allow discount logic)
    const expectedTotal = formatAmount(subtotal + taxAmount - (data.discountValue || 0));
    if (!compareAmounts(total, expectedTotal, 0.01)) {
      throw new ValidationError(
        `Total (${total}) calculation mismatch. Expected: ${expectedTotal}`
      );
    }

    // Verify customer exists
    const customer = await tx.customer.findUnique({
      where: { id: data.customerId, deletedAt: null }
    });

    if (!customer) {
      throw new ValidationError('Customer not found');
    }

    // Check credit limit (if applicable)
    if (customer.creditLimit > 0) {
      const newBalance = formatAmount(customer.currentBalance + total);
      if (newBalance > customer.creditLimit) {
        throw new ValidationError(
          `Invoice total (${total}) would exceed customer credit limit. ` +
          `Current: ${customer.currentBalance}, Limit: ${customer.creditLimit}`
        );
      }
    }

    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber();

    // Create invoice with items
    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        invoiceDate: data.invoiceDate || new Date(),
        dueDate: data.dueDate,
        status: 'Draft', // Always start as Draft

        // Financial
        subtotal,
        discountType: data.discountType || null,
        discountValue: formatAmount(data.discountValue || 0),

        // Tax
        taxType: data.taxType || 'GST',
        taxRate: data.taxRate || 0,
        taxAmount,
        cgstRate: data.cgstRate || 0,
        cgstAmount: formatAmount(data.cgstAmount || 0),
        sgstRate: data.sgstRate || 0,
        sgstAmount: formatAmount(data.sgstAmount || 0),
        igstRate: data.igstRate || 0,
        igstAmount: formatAmount(data.igstAmount || 0),

        total,
        paidAmount: 0,

        // Tax compliance
        placeOfSupply: data.placeOfSupply || null,
        hsn: data.hsn || null,
        gstinNumber: data.gstinNumber || customer.gstinNumber || null,

        // Terms
        terms: data.terms || null,
        notes: data.notes || null,

        // Installment
        hasInstallment: data.hasInstallment || false,

        customerId: data.customerId,
        createdById: userId,

        items: {
          create: data.items.map(item => ({
            itemId: item.itemId,
            quantity: item.quantity,
            unitPrice: formatAmount(item.unitPrice),
            total: formatAmount(item.total),
            description: item.description || null
          }))
        }
      },
      include: {
        customer: true,
        items: {
          include: {
            item: true
          }
        }
      }
    });

    // Create audit log
    await tx.invoicePaymentAudit.create({
      data: {
        invoiceId: invoice.id,
        action: 'INVOICE_CREATED',
        beforeState: null,
        afterState: {
          status: 'Draft',
          total: total,
          paidAmount: 0
        },
        performedBy: userId,
        metadata: {
          invoiceNumber,
          customerId: data.customerId
        }
      }
    });

    logger.info(`Invoice created: ${invoiceNumber}`, {
      invoiceId: invoice.id,
      customer: customer.name,
      total: total
    });

    return invoice;
  });
}

/**
 * Update Invoice Status
 *
 * @param {string} invoiceId - Invoice ID
 * @param {string} newStatus - New status
 * @param {string} userId - User performing the action
 * @returns {Promise<Object>} Updated invoice
 */
async function updateInvoiceStatus(invoiceId, newStatus, userId) {
  return withTransaction(async (tx) => {
    // Lock the invoice row
    const invoice = await lockForUpdate(tx, 'Invoice', invoiceId);

    // Check if cancelled
    if (invoice.cancelledAt) {
      throw new ValidationError('Cannot update status of cancelled invoice');
    }

    // Validate status transition
    const allowedTransitions = STATUS_TRANSITIONS[invoice.status] || [];

    if (!allowedTransitions.includes(newStatus)) {
      throw new ValidationError(
        `Cannot transition from ${invoice.status} to ${newStatus}. Allowed: ${allowedTransitions.join(', ')}`
      );
    }

    // Additional validations
    if (newStatus === 'Paid') {
      // Can only mark as Paid if fully paid
      if (!compareAmounts(invoice.paidAmount, invoice.total)) {
        throw new ValidationError(
          `Cannot mark as Paid. Paid amount (${invoice.paidAmount}) must equal total (${invoice.total})`
        );
      }
    }

    // Update status
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: newStatus,
        updatedAt: new Date()
      },
      include: {
        customer: true
      }
    });

    // Create audit log
    await tx.invoicePaymentAudit.create({
      data: {
        invoiceId,
        action: 'STATUS_CHANGED',
        beforeState: { status: invoice.status },
        afterState: { status: newStatus },
        performedBy: userId,
        metadata: { reason: 'Manual status update' }
      }
    });

    logger.info(`Invoice status updated: ${invoice.invoiceNumber}`, {
      invoiceId,
      oldStatus: invoice.status,
      newStatus
    });

    return updated;
  });
}

/**
 * Update Invoice (Draft only)
 *
 * @param {string} invoiceId - Invoice ID
 * @param {Object} updates - Updated data
 * @param {string} userId - User performing update
 * @returns {Promise<Object>} Updated invoice
 */
async function updateInvoice(invoiceId, updates, userId) {
  return withTransaction(async (tx) => {
    // Lock the invoice
    const invoice = await lockForUpdate(tx, 'Invoice', invoiceId);

    // Check if cancelled
    if (invoice.cancelledAt) {
      throw new ValidationError('Cannot update cancelled invoice');
    }

    // Can only update Draft invoices
    if (invoice.status !== 'Draft') {
      throw new ValidationError(
        `Cannot update invoice in ${invoice.status} status. Only Draft invoices can be edited.`
      );
    }

    // Validate amounts if provided
    if (updates.total !== undefined) {
      const subtotal = formatAmount(updates.subtotal || invoice.subtotal);
      const taxAmount = formatAmount(updates.taxAmount || invoice.taxAmount);
      const total = formatAmount(updates.total);

      if (!compareAmounts(total, subtotal + taxAmount, 0.01)) {
        throw new ValidationError('Total must equal subtotal + tax');
      }
    }

    // Delete existing items if new ones provided
    if (updates.items) {
      await tx.invoiceItem.deleteMany({
        where: { invoiceId }
      });
    }

    // Update invoice
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        invoiceDate: updates.invoiceDate || invoice.invoiceDate,
        dueDate: updates.dueDate || invoice.dueDate,
        customerId: updates.customerId || invoice.customerId,

        subtotal: updates.subtotal ? formatAmount(updates.subtotal) : undefined,
        discountType: updates.discountType,
        discountValue: updates.discountValue ? formatAmount(updates.discountValue) : undefined,

        taxAmount: updates.taxAmount ? formatAmount(updates.taxAmount) : undefined,
        cgstAmount: updates.cgstAmount ? formatAmount(updates.cgstAmount) : undefined,
        sgstAmount: updates.sgstAmount ? formatAmount(updates.sgstAmount) : undefined,
        igstAmount: updates.igstAmount ? formatAmount(updates.igstAmount) : undefined,

        total: updates.total ? formatAmount(updates.total) : undefined,

        placeOfSupply: updates.placeOfSupply,
        hsn: updates.hsn,
        gstinNumber: updates.gstinNumber,
        terms: updates.terms,
        notes: updates.notes,

        items: updates.items ? {
          create: updates.items.map(item => ({
            itemId: item.itemId,
            quantity: item.quantity,
            unitPrice: formatAmount(item.unitPrice),
            total: formatAmount(item.total),
            description: item.description
          }))
        } : undefined
      },
      include: {
        customer: true,
        items: {
          include: {
            item: true
          }
        }
      }
    });

    return updated;
  });
}

/**
 * Cancel an Invoice (soft-cancel)
 * Only Draft invoices can be cancelled
 *
 * @param {string} invoiceId - Invoice ID
 * @param {string} reason - Cancellation reason
 * @param {string} userId - User performing cancellation
 * @returns {Promise<Object>} Cancelled invoice
 */
async function cancelInvoice(invoiceId, reason, userId) {
  return withTransaction(async (tx) => {
    // Lock the invoice
    const invoice = await lockForUpdate(tx, 'Invoice', invoiceId);

    // Validate invoice can be cancelled
    if (invoice.cancelledAt) {
      throw new ValidationError('Invoice is already cancelled');
    }

    // CRITICAL: Only Draft invoices can be cancelled
    if (invoice.status !== 'Draft') {
      throw new ValidationError(
        `Cannot cancel invoice with status ${invoice.status}. Only Draft invoices can be cancelled.`
      );
    }

    if (invoice.paidAmount > 0) {
      throw new ValidationError(
        `Cannot cancel invoice with payments. Invoice has ${invoice.paidAmount} paid.`
      );
    }

    // Check if any items are linked (prevent cancelling invoices with inventory impact)
    const linkedItems = await tx.item.count({
      where: {
        invoices: {
          some: {
            invoiceId: invoiceId
          }
        }
      }
    });

    if (linkedItems > 0) {
      throw new ValidationError(
        `Cannot cancel invoice with ${linkedItems} linked inventory items. ` +
        `Remove item associations first.`
      );
    }

    // Soft-cancel the invoice
    const cancelled = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'Cancelled',
        cancelledAt: new Date(),
        cancelReason: reason,
        cancelledBy: userId
      },
      include: {
        customer: true
      }
    });

    // Reverse customer ledger entry if it exists
    const ledgerEntries = await tx.customerLedger.findMany({
      where: { invoiceId: invoiceId }
    });

    if (ledgerEntries.length > 0) {
      const customer = await tx.customer.findUnique({
        where: { id: invoice.customerId }
      });

      const newBalance = formatAmount(customer.currentBalance - invoice.total);

      await tx.customerLedger.create({
        data: {
          customerId: invoice.customerId,
          entryDate: new Date(),
          description: `Invoice ${invoice.invoiceNumber} cancelled: ${reason}`,
          debit: 0,
          credit: invoice.total,
          balance: newBalance,
          invoiceId: invoice.id
        }
      });

      // Update customer balance
      await tx.customer.update({
        where: { id: invoice.customerId },
        data: {
          currentBalance: newBalance
        }
      });
    }

    // Create audit trail
    await tx.invoicePaymentAudit.create({
      data: {
        invoiceId: invoice.id,
        action: 'INVOICE_CANCELLED',
        beforeState: {
          status: invoice.status,
          total: invoice.total,
          paidAmount: invoice.paidAmount
        },
        afterState: {
          status: 'Cancelled',
          cancelReason: reason
        },
        performedBy: userId,
        metadata: { reason }
      }
    });

    logger.info(`Invoice cancelled: ${invoice.invoiceNumber}`, {
      invoiceId,
      reason,
      total: invoice.total
    });

    return cancelled;
  });
}

/**
 * Get Invoice with computed fields
 *
 * @param {string} invoiceId - Invoice ID
 * @returns {Promise<Object>} Invoice with computed fields
 */
async function getInvoice(invoiceId) {
  const invoice = await db.prisma.invoice.findUnique({
    where: { id: invoiceId, deletedAt: null },
    include: {
      customer: true,
      items: {
        include: {
          item: true
        }
      },
      payments: {
        where: { deletedAt: null, voidedAt: null },
        orderBy: { paymentDate: 'desc' }
      }
    }
  });

  if (!invoice) {
    throw new ValidationError('Invoice not found');
  }

  // Calculate actual status based on payments and due date
  const calculatedStatus = calculateInvoiceStatus(invoice);

  // Add computed fields
  invoice.calculatedStatus = calculatedStatus;
  invoice.remainingAmount = formatAmount(invoice.total - invoice.paidAmount);
  invoice.isCancelled = !!invoice.cancelledAt;
  invoice.isOverdue = calculatedStatus === 'Overdue';
  invoice.canReceivePayment = !invoice.cancelledAt &&
                               invoice.status !== 'Cancelled' &&
                               invoice.remainingAmount > 0;
  invoice.canBeCancelled = !invoice.cancelledAt &&
                            invoice.status === 'Draft' &&
                            invoice.paidAmount === 0;

  return invoice;
}

/**
 * Auto-update overdue invoices (batch job)
 * Should be run daily via cron
 *
 * @returns {Promise<number>} Number of invoices updated
 */
async function updateOverdueInvoices() {
  const now = new Date();

  const overdueInvoices = await db.prisma.invoice.findMany({
    where: {
      status: { in: ['Sent', 'Partial'] },
      dueDate: { lt: now },
      cancelledAt: null,
      deletedAt: null,
      paidAmount: { lt: db.prisma.invoice.fields.total }
    }
  });

  let updated = 0;

  for (const invoice of overdueInvoices) {
    try {
      await db.prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'Overdue' }
      });
      updated++;
    } catch (error) {
      logger.error(`Failed to mark invoice ${invoice.invoiceNumber} as overdue`, error);
    }
  }

  logger.info(`Marked ${updated} invoices as overdue`);
  return updated;
}

module.exports = {
  createInvoice,
  updateInvoice,
  updateInvoiceStatus,
  cancelInvoice,
  getInvoice,
  calculateInvoiceStatus,
  updateOverdueInvoices,
  STATUS_TRANSITIONS
};
```

---

## 3. CUSTOMER PAYMENT SERVICE

### 3.1 Payment Management Service

**File:** `backend/src/services/customerPaymentService.js`

```javascript
/**
 * Customer Payment Management Service (Receivables)
 *
 * Implements strict rules:
 * - Payments are immutable (use void instead of delete)
 * - SUM(payments) <= invoice.total (enforced with locks)
 * - Payment void reverses all financial impacts
 * - Auto-updates invoice status based on payments
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
const { generatePaymentNumber } = require('../utils/generateId');
const { calculateInvoiceStatus } = require('./invoiceService');

/**
 * Record a customer payment against an invoice
 *
 * @param {Object} data - Payment data
 * @param {string} data.customerId - Customer ID
 * @param {string} data.invoiceId - Invoice ID
 * @param {number} data.amount - Payment amount
 * @param {string} data.method - Payment method
 * @param {Date} data.paymentDate - Payment date
 * @param {string} data.reference - Payment reference
 * @param {string} data.notes - Payment notes
 * @param {string} userId - User recording the payment
 * @returns {Promise<Object>} Created payment
 */
async function recordPayment(data, userId) {
  return withTransaction(async (tx) => {
    // 1. Lock the invoice (critical for concurrency)
    const invoice = await lockForUpdate(tx, 'Invoice', data.invoiceId);

    // 2. Validate invoice status
    if (invoice.cancelledAt) {
      throw new ValidationError('Cannot record payment for cancelled invoice');
    }

    if (invoice.status === 'Cancelled') {
      throw new ValidationError('Cannot record payment for cancelled invoice');
    }

    // 3. Validate customer matches invoice
    if (invoice.customerId !== data.customerId) {
      throw new ValidationError('Customer must match invoice customer');
    }

    // 4. Format and validate amount
    const amount = formatAmount(data.amount);

    if (amount <= 0) {
      throw new ValidationError('Payment amount must be greater than zero');
    }

    // 5. CRITICAL: Check available balance (SUM(payments) <= invoice.total)
    const currentPaid = formatAmount(invoice.paidAmount);
    const newPaid = formatAmount(currentPaid + amount);
    const total = formatAmount(invoice.total);

    if (newPaid > total + 0.01) { // Allow 1 cent tolerance
      throw new InsufficientBalanceError(
        `Payment amount (${amount}) exceeds remaining invoice balance. ` +
        `Invoice Total: ${total}, Already Paid: ${currentPaid}, Remaining: ${total - currentPaid}`,
        total - currentPaid,
        amount
      );
    }

    // 6. Generate payment number
    const paymentNumber = await generatePaymentNumber();

    // 7. Create the payment
    const payment = await tx.payment.create({
      data: {
        paymentNumber,
        paymentDate: data.paymentDate || new Date(),
        amount,
        method: data.method,
        reference: data.reference || null,
        notes: data.notes || null,
        customerId: data.customerId,
        invoiceId: data.invoiceId,
        recordedById: userId
      },
      include: {
        customer: true,
        invoice: true
      }
    });

    // 8. Update invoice paid amount
    const updatedPaidAmount = formatAmount(invoice.paidAmount + amount);

    await tx.invoice.update({
      where: { id: data.invoiceId },
      data: {
        paidAmount: updatedPaidAmount
      }
    });

    // 9. Calculate and update invoice status
    const updatedInvoice = await tx.invoice.findUnique({
      where: { id: data.invoiceId }
    });

    const newStatus = calculateInvoiceStatus(updatedInvoice);

    if (newStatus !== invoice.status) {
      await tx.invoice.update({
        where: { id: data.invoiceId },
        data: { status: newStatus }
      });
    }

    // 10. Create customer ledger entry
    const customer = await tx.customer.findUnique({
      where: { id: data.customerId }
    });

    const newBalance = formatAmount(customer.currentBalance - amount);

    await tx.customerLedger.create({
      data: {
        customerId: data.customerId,
        entryDate: data.paymentDate || new Date(),
        description: `Payment ${paymentNumber} - ${data.method}`,
        debit: 0,
        credit: amount,
        balance: newBalance,
        invoiceId: data.invoiceId
      }
    });

    // 11. Update customer balance
    await tx.customer.update({
      where: { id: data.customerId },
      data: {
        currentBalance: newBalance
      }
    });

    // 12. Create audit trail
    await tx.invoicePaymentAudit.create({
      data: {
        invoiceId: data.invoiceId,
        action: 'PAYMENT_RECORDED',
        paymentId: payment.id,
        beforeState: {
          invoiceStatus: invoice.status,
          paidAmount: invoice.paidAmount
        },
        afterState: {
          invoiceStatus: newStatus,
          paidAmount: updatedPaidAmount,
          paymentAmount: amount
        },
        performedBy: userId,
        metadata: {
          paymentNumber,
          method: data.method,
          reference: data.reference
        }
      }
    });

    logger.info(`Payment recorded: ${paymentNumber}`, {
      paymentId: payment.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: amount,
      invoiceStatus: `${invoice.status} → ${newStatus}`
    });

    return payment;
  });
}

/**
 * Void a customer payment (immutable pattern)
 * Reverses all financial impacts
 *
 * @param {string} paymentId - Payment ID
 * @param {string} reason - Void reason
 * @param {string} userId - User performing void
 * @returns {Promise<Object>} Voided payment
 */
async function voidPayment(paymentId, reason, userId) {
  return withTransaction(async (tx) => {
    // 1. Get the payment (no lock needed, payments are immutable)
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: true,
        customer: true
      }
    });

    if (!payment) {
      throw new ValidationError('Payment not found');
    }

    // 2. Validate payment can be voided
    if (payment.voidedAt) {
      throw new ValidationError('Payment is already voided');
    }

    if (payment.deletedAt) {
      throw new ValidationError('Cannot void deleted payment');
    }

    // 3. Lock the invoice
    const invoice = await lockForUpdate(tx, 'Invoice', payment.invoiceId);

    // 4. Void the payment (immutable - just mark as voided)
    const voided = await tx.payment.update({
      where: { id: paymentId },
      data: {
        voidedAt: new Date(),
        voidReason: reason,
        voidedBy: userId
      },
      include: {
        customer: true,
        invoice: true
      }
    });

    // 5. Reverse invoice paid amount
    const newPaidAmount = formatAmount(invoice.paidAmount - payment.amount);

    await tx.invoice.update({
      where: { id: payment.invoiceId },
      data: {
        paidAmount: newPaidAmount
      }
    });

    // 6. Recalculate invoice status
    const updatedInvoice = await tx.invoice.findUnique({
      where: { id: payment.invoiceId }
    });

    const newStatus = calculateInvoiceStatus(updatedInvoice);

    if (newStatus !== invoice.status) {
      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: newStatus }
      });
    }

    // 7. Reverse customer ledger entry
    const customer = await tx.customer.findUnique({
      where: { id: payment.customerId }
    });

    const newBalance = formatAmount(customer.currentBalance + payment.amount);

    await tx.customerLedger.create({
      data: {
        customerId: payment.customerId,
        entryDate: new Date(),
        description: `Payment ${payment.paymentNumber} voided: ${reason}`,
        debit: payment.amount,
        credit: 0,
        balance: newBalance,
        invoiceId: payment.invoiceId
      }
    });

    // 8. Update customer balance
    await tx.customer.update({
      where: { id: payment.customerId },
      data: {
        currentBalance: newBalance
      }
    });

    // 9. Create audit trail
    await tx.invoicePaymentAudit.create({
      data: {
        invoiceId: payment.invoiceId,
        action: 'PAYMENT_VOIDED',
        paymentId: payment.id,
        beforeState: {
          invoiceStatus: invoice.status,
          paidAmount: invoice.paidAmount
        },
        afterState: {
          invoiceStatus: newStatus,
          paidAmount: newPaidAmount,
          voidReason: reason
        },
        performedBy: userId,
        metadata: { reason }
      }
    });

    logger.info(`Payment voided: ${payment.paymentNumber}`, {
      paymentId,
      reason,
      amount: payment.amount,
      invoiceStatus: `${invoice.status} → ${newStatus}`
    });

    return voided;
  });
}

/**
 * Get payment with details
 *
 * @param {string} paymentId - Payment ID
 * @returns {Promise<Object>} Payment details
 */
async function getPayment(paymentId) {
  const payment = await db.prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      customer: true,
      invoice: true,
      recordedBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  if (!payment) {
    throw new ValidationError('Payment not found');
  }

  // Add computed fields
  payment.isVoided = !!payment.voidedAt;
  payment.canBeVoided = !payment.voidedAt && !payment.deletedAt;

  return payment;
}

module.exports = {
  recordPayment,
  voidPayment,
  getPayment
};
```

---

## 4. CONTROLLER & ROUTE UPDATES

### 4.1 Finance Controller Refactoring

**File:** `backend/src/controllers/financeController.js` (Add these new methods)

```javascript
const invoiceService = require('../services/invoiceService');
const customerPaymentService = require('../services/customerPaymentService');

/**
 * Cancel an invoice
 * POST /api/finance/invoices/:id/cancel
 */
exports.cancelInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Cancellation reason is required'
      });
    }

    const cancelled = await invoiceService.cancelInvoice(
      id,
      reason.trim(),
      req.user.id
    );

    res.json({
      success: true,
      message: 'Invoice cancelled successfully',
      data: cancelled
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Void a customer payment
 * POST /api/finance/payments/:id/void
 */
exports.voidCustomerPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Void reason is required'
      });
    }

    const voided = await customerPaymentService.voidPayment(
      id,
      reason.trim(),
      req.user.id
    );

    res.json({
      success: true,
      message: 'Payment voided successfully',
      data: voided
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get invoice with details
 * GET /api/finance/invoices/:id
 */
exports.getInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const invoice = await invoiceService.getInvoice(id);

    res.json({
      success: true,
      data: invoice
    });
  } catch (error) {
    next(error);
  }
};

/**
 * REFACTOR EXISTING: Create invoice (use invoiceService)
 * POST /api/finance/invoices
 */
exports.createInvoice = async (req, res, next) => {
  try {
    const invoice = await invoiceService.createInvoice(req.body, req.user.id);

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: invoice
    });
  } catch (error) {
    next(error);
  }
};

/**
 * REFACTOR EXISTING: Update invoice (use invoiceService)
 * PUT /api/finance/invoices/:id
 */
exports.updateInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await invoiceService.updateInvoice(id, req.body, req.user.id);

    res.json({
      success: true,
      message: 'Invoice updated successfully',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * REFACTOR EXISTING: Record payment (use customerPaymentService)
 * POST /api/finance/payments
 */
exports.recordPayment = async (req, res, next) => {
  try {
    const payment = await customerPaymentService.recordPayment(req.body, req.user.id);

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: payment
    });
  } catch (error) {
    next(error);
  }
};
```

### 4.2 Route Updates

**File:** `backend/src/routes/financeRoutes.js` (Add these routes)

```javascript
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Invoice routes
router.post('/invoices', authenticate, authorize(['Admin', 'Finance']), financeController.createInvoice);
router.get('/invoices/:id', authenticate, financeController.getInvoice);
router.put('/invoices/:id', authenticate, authorize(['Admin', 'Finance']), financeController.updateInvoice);
router.post('/invoices/:id/cancel', authenticate, authorize(['Admin', 'Finance']), financeController.cancelInvoice); // NEW

// Customer payment routes
router.post('/payments', authenticate, authorize(['Admin', 'Finance']), financeController.recordPayment);
router.get('/payments/:id', authenticate, financeController.getPayment);
router.post('/payments/:id/void', authenticate, authorize(['Admin', 'Finance']), financeController.voidCustomerPayment); // NEW
```

### 4.3 Service Index Update

**File:** `backend/src/services/index.js`

```javascript
module.exports = {
  purchaseOrderService: require('./purchaseOrderService'),
  billService: require('./billService'),
  paymentService: require('./paymentService'),
  validationService: require('./validationService'),
  financeService: require('./financeService'),
  invoiceService: require('./invoiceService'),              // NEW
  customerPaymentService: require('./customerPaymentService') // NEW
};
```

---

## 5. FRONTEND INTEGRATION

### 5.1 Invoices Page Updates

**File:** `frontend/src/pages/finance/Invoices.jsx`

**Key Changes:**

1. **Add Cancel Mutation:**
```javascript
const cancelInvoiceMutation = useMutation(
  ({ id, reason }) => axios.post(`/finance/invoices/${id}/cancel`, { reason }),
  {
    onSuccess: () => {
      message.success('Invoice cancelled successfully');
      queryClient.invalidateQueries('invoices');
      queryClient.invalidateQueries('customers');
    },
    onError: (error) => {
      message.error(error.response?.data?.message || 'Failed to cancel invoice');
    }
  }
);
```

2. **Add Cancel Handler:**
```javascript
const handleCancelInvoice = (record) => {
  let reason = '';
  Modal.confirm({
    title: 'Cancel Invoice',
    content: (
      <div>
        <p>Are you sure you want to cancel invoice <strong>{record.invoiceNumber}</strong>?</p>
        <p style={{ color: '#ff4d4f', marginTop: 12 }}>
          ⚠️ Only Draft invoices can be cancelled. This action cannot be undone.
        </p>
        <Input.TextArea
          placeholder="Enter cancellation reason (required)"
          rows={3}
          onChange={(e) => { reason = e.target.value; }}
          style={{ marginTop: 12 }}
        />
      </div>
    ),
    onOk: () => {
      if (!reason || reason.trim() === '') {
        message.error('Please provide a cancellation reason');
        return Promise.reject();
      }
      return cancelInvoiceMutation.mutateAsync({ id: record.id, reason: reason.trim() });
    },
    okText: 'Cancel Invoice',
    okButtonProps: { danger: true }
  });
};
```

3. **Update Table Columns:**
```javascript
{
  title: 'Invoice #',
  dataIndex: 'invoiceNumber',
  render: (text, record) => (
    <Space direction="vertical" size="small">
      <span style={{ color: record.cancelledAt ? '#999' : 'inherit' }}>
        {text}
      </span>
      {record.cancelledAt && <Tag color="red" size="small">CANCELLED</Tag>}
    </Space>
  )
},
{
  title: 'Total',
  dataIndex: 'total',
  render: (amount, record) => (
    <span style={{
      color: record.cancelledAt ? '#999' : 'inherit',
      textDecoration: record.cancelledAt ? 'line-through' : 'none'
    }}>
      {formatPKR(Number(amount))}
    </span>
  )
},
{
  title: 'Status',
  dataIndex: 'status',
  render: (status, record) => {
    if (record.cancelledAt) {
      return <Tag color="red">Cancelled</Tag>;
    }
    return (
      <Tag color={
        status === 'Draft' ? 'default' :
        status === 'Sent' ? 'blue' :
        status === 'Partial' ? 'orange' :
        status === 'Paid' ? 'green' :
        status === 'Overdue' ? 'red' : 'default'
      }>
        {status}
      </Tag>
    );
  }
},
{
  title: 'Actions',
  render: (_, record) => (
    <Space>
      <Button icon={<EyeOutlined />} onClick={() => handleView(record)} />
      <Button
        icon={<EditOutlined />}
        onClick={() => handleEdit(record)}
        disabled={record.status !== 'Draft' || record.cancelledAt}
      />
      <Button
        icon={<DeleteOutlined />}
        danger
        onClick={() => handleCancelInvoice(record)}
        disabled={record.status !== 'Draft' || record.cancelledAt || parseFloat(record.paidAmount || 0) > 0}
      />
    </Space>
  )
}
```

### 5.2 Payments Page Updates

**File:** `frontend/src/pages/finance/Payments.jsx`

**Key Changes:**

1. **Add Void Mutation:**
```javascript
const voidPaymentMutation = useMutation(
  ({ id, reason }) => axios.post(`/finance/payments/${id}/void`, { reason }),
  {
    onSuccess: () => {
      message.success('Payment voided successfully');
      queryClient.invalidateQueries('payments');
      queryClient.invalidateQueries('invoices');
      queryClient.invalidateQueries('customers');
    },
    onError: (error) => {
      message.error(error.response?.data?.message || 'Failed to void payment');
    }
  }
);
```

2. **Add Void Handler:**
```javascript
const handleVoidPayment = (record) => {
  let reason = '';
  Modal.confirm({
    title: 'Void Payment',
    content: (
      <div>
        <p>Are you sure you want to void payment <strong>{record.paymentNumber}</strong>?</p>
        <p style={{ color: '#ff4d4f', marginTop: 12 }}>
          ⚠️ This will reverse all financial impacts. This action cannot be undone.
        </p>
        <Input.TextArea
          placeholder="Enter void reason (required)"
          rows={3}
          onChange={(e) => { reason = e.target.value; }}
          style={{ marginTop: 12 }}
        />
      </div>
    ),
    onOk: () => {
      if (!reason || reason.trim() === '') {
        message.error('Please provide a void reason');
        return Promise.reject();
      }
      return voidPaymentMutation.mutateAsync({ id: record.id, reason: reason.trim() });
    },
    okText: 'Void Payment',
    okButtonProps: { danger: true }
  });
};
```

3. **Update Table Columns with Visual Indicators:**
```javascript
{
  title: 'Payment #',
  dataIndex: 'paymentNumber',
  render: (text, record) => (
    <Space direction="vertical" size="small">
      <span style={{ color: record.voidedAt ? '#999' : '#1890ff' }}>
        {text}
      </span>
      {record.voidedAt && <Tag color="red" size="small">VOIDED</Tag>}
    </Space>
  )
},
{
  title: 'Amount',
  dataIndex: 'amount',
  render: (amount, record) => (
    <span style={{
      color: record.voidedAt ? '#999' : '#52c41a',
      textDecoration: record.voidedAt ? 'line-through' : 'none',
      fontWeight: 500
    }}>
      {formatPKR(Number(amount))}
    </span>
  )
},
{
  title: 'Actions',
  render: (_, record) => (
    <Space>
      <Button icon={<EyeOutlined />} onClick={() => handleView(record)} />
      <Button
        icon={<DeleteOutlined />}
        danger
        onClick={() => handleVoidPayment(record)}
        disabled={record.voidedAt || record.deletedAt}
      />
    </Space>
  )
}
```

### 5.3 Customer Details Page Updates

**File:** `frontend/src/pages/inventory/Customers.jsx` (Drawer section)

**Update Invoices Tab:**
```javascript
<Tabs.TabPane tab="Invoices" key="2">
  <Table
    dataSource={selectedCustomer.invoices}
    columns={[
      {
        title: 'Invoice #',
        dataIndex: 'invoiceNumber',
        render: (text, record) => (
          <Space direction="vertical" size="small">
            <span style={{ color: record.cancelledAt ? '#999' : 'inherit' }}>
              {text}
            </span>
            {record.cancelledAt && <Tag color="red" size="small">CANCELLED</Tag>}
          </Space>
        )
      },
      {
        title: 'Date',
        dataIndex: 'invoiceDate',
        render: (date) => new Date(date).toLocaleDateString()
      },
      {
        title: 'Total',
        dataIndex: 'total',
        render: (amount, record) => (
          <span style={{
            color: record.cancelledAt ? '#999' : 'inherit',
            textDecoration: record.cancelledAt ? 'line-through' : 'none'
          }}>
            {formatPKR(parseFloat(amount))}
          </span>
        )
      },
      {
        title: 'Paid',
        dataIndex: 'paidAmount',
        render: (amount) => formatPKR(parseFloat(amount || 0))
      },
      {
        title: 'Status',
        dataIndex: 'status',
        render: (status, record) => {
          if (record.cancelledAt) {
            return <Tag color="red">Cancelled</Tag>;
          }
          return (
            <Tag color={
              status === 'Draft' ? 'default' :
              status === 'Sent' ? 'blue' :
              status === 'Partial' ? 'orange' :
              status === 'Paid' ? 'green' :
              status === 'Overdue' ? 'red' : 'default'
            }>
              {status}
            </Tag>
          );
        }
      }
    ]}
    pagination={false}
  />
</Tabs.TabPane>
```

**Update Payments Tab:**
```javascript
<Tabs.TabPane tab="Payments" key="3">
  <Table
    dataSource={selectedCustomer.payments}
    columns={[
      {
        title: 'Payment #',
        dataIndex: 'paymentNumber',
        render: (text, record) => (
          <Space direction="vertical" size="small">
            <span style={{ color: record.voidedAt ? '#999' : 'inherit' }}>
              {text}
            </span>
            {record.voidedAt && <Tag color="red" size="small">VOIDED</Tag>}
          </Space>
        )
      },
      {
        title: 'Date',
        dataIndex: 'paymentDate',
        render: (date) => new Date(date).toLocaleDateString()
      },
      {
        title: 'Amount',
        dataIndex: 'amount',
        render: (amount, record) => (
          <span style={{
            color: record.voidedAt ? '#999' : 'inherit',
            textDecoration: record.voidedAt ? 'line-through' : 'none'
          }}>
            {formatPKR(parseFloat(amount))}
          </span>
        )
      },
      {
        title: 'Method',
        dataIndex: 'method',
        render: (method, record) => (
          <span style={{ color: record.voidedAt ? '#999' : 'inherit' }}>
            {method}
          </span>
        )
      }
    ]}
    pagination={false}
  />
</Tabs.TabPane>
```

---

## 6. TESTING STRATEGY

### 6.1 Unit Tests

**File:** `backend/src/services/__tests__/invoiceService.test.js`

```javascript
describe('Invoice Service', () => {
  describe('createInvoice', () => {
    it('should create invoice in Draft status', async () => {
      // Test implementation
    });

    it('should validate total = subtotal + tax', async () => {
      // Test implementation
    });

    it('should reject if customer credit limit exceeded', async () => {
      // Test implementation
    });
  });

  describe('cancelInvoice', () => {
    it('should cancel Draft invoice with reason', async () => {
      // Test implementation
    });

    it('should reject cancelling non-Draft invoice', async () => {
      // Test implementation
    });

    it('should reject cancelling invoice with payments', async () => {
      // Test implementation
    });

    it('should reverse customer ledger on cancellation', async () => {
      // Test implementation
    });
  });

  describe('calculateInvoiceStatus', () => {
    it('should mark as Paid when fully paid', async () => {
      // Test implementation
    });

    it('should mark as Partial when partially paid', async () => {
      // Test implementation
    });

    it('should mark as Overdue when past due and unpaid', async () => {
      // Test implementation
    });
  });
});
```

**File:** `backend/src/services/__tests__/customerPaymentService.test.js`

```javascript
describe('Customer Payment Service', () => {
  describe('recordPayment', () => {
    it('should record payment and update invoice', async () => {
      // Test implementation
    });

    it('should reject overpayment', async () => {
      // Test implementation
    });

    it('should auto-update invoice status to Paid', async () => {
      // Test implementation
    });

    it('should create customer ledger entry', async () => {
      // Test implementation
    });
  });

  describe('voidPayment', () => {
    it('should void payment and reverse impacts', async () => {
      // Test implementation
    });

    it('should reject voiding already voided payment', async () => {
      // Test implementation
    });

    it('should revert invoice status correctly', async () => {
      // Test implementation
    });
  });
});
```

### 6.2 Integration Tests

```javascript
describe('Invoice Lifecycle Integration', () => {
  it('should handle concurrent payments without overpayment', async () => {
    // Create invoice with total 1000
    // Attempt 3 payments of 400 concurrently
    // Expect: Only 2 succeed (total 800), 1 rejected (would exceed 1000)
  });

  it('should handle cancel during payment race condition', async () => {
    // Create Draft invoice
    // Attempt cancel and payment concurrently
    // Expect: One fails with appropriate error
  });

  it('should correctly calculate overdue status', async () => {
    // Create invoice with past due date
    // Run updateOverdueInvoices()
    // Expect: Status changed to Overdue
  });
});
```

### 6.3 Manual Testing Checklist

**Invoice Lifecycle:**
- [ ] Create Draft invoice
- [ ] Edit Draft invoice (should work)
- [ ] Cancel Draft invoice (should work)
- [ ] Try to cancel Sent invoice (should fail)
- [ ] Send invoice (Draft → Sent)
- [ ] Try to edit Sent invoice (should fail)
- [ ] Record partial payment (Sent → Partial)
- [ ] Try to cancel Partial invoice (should fail)
- [ ] Record full payment (Partial → Paid)
- [ ] Check overdue auto-calculation

**Payment Operations:**
- [ ] Record payment within invoice total (should work)
- [ ] Try to overpay invoice (should fail)
- [ ] Void payment (should reverse all impacts)
- [ ] Try to void already voided payment (should fail)
- [ ] Check customer balance updates correctly
- [ ] Check customer ledger entries are accurate

**Concurrency Testing:**
- [ ] Create 2 simultaneous payments that would overpay
- [ ] Create payment while cancelling invoice
- [ ] Create bill while another bill is being created

**Error Handling:**
- [ ] Cancel non-existent invoice
- [ ] Payment with invalid customer
- [ ] Payment for cancelled invoice
- [ ] Void non-existent payment

---

## 7. DEPLOYMENT PLAN

### Step 1: Database Migration (Maintenance Window)
```bash
# Backup database
pg_dump your_database > backup_before_invoice_refactor.sql

# Run Prisma migration
cd backend
npx prisma migrate dev --name invoice_lifecycle_refactor

# Verify migration
npx prisma db pull
npx prisma generate
```

### Step 2: Deploy Backend
```bash
# Deploy new services
git add backend/src/services/invoiceService.js
git add backend/src/services/customerPaymentService.js

# Deploy controller updates
git add backend/src/controllers/financeController.js
git add backend/src/routes/financeRoutes.js

# Deploy and restart
npm run build
pm2 restart backend
```

### Step 3: Deploy Frontend
```bash
cd frontend
npm run build
# Deploy build to production
```

### Step 4: Verification
- [ ] Check all existing invoices loaded correctly
- [ ] Verify paidAmount calculations are accurate
- [ ] Test creating new invoice
- [ ] Test recording payment
- [ ] Test cancelling Draft invoice
- [ ] Test voiding payment
- [ ] Check audit logs are being created

### Step 5: Monitoring
- Monitor error logs for ValidationError, ConcurrencyError
- Check database locks/deadlocks
- Monitor invoice status transitions
- Verify customer balances are accurate

---

## 8. ROLLBACK PLAN

If critical issues are discovered:

```sql
-- Restore from backup
psql your_database < backup_before_invoice_refactor.sql

-- Revert code deployment
git revert <commit-hash>
pm2 restart backend
```

---

## 9. FUTURE ENHANCEMENTS

1. **Scheduled Jobs:**
   - Daily cron to run `updateOverdueInvoices()`
   - Weekly reports of overdue invoices
   - Payment reminder emails

2. **Advanced Features:**
   - Partial invoice cancellation (line item level)
   - Payment allocation across multiple invoices
   - Recurring invoices
   - Invoice templates

3. **Analytics:**
   - Days Sales Outstanding (DSO)
   - Customer payment patterns
   - Overdue aging reports

---

## 10. SUMMARY

This refactoring plan implements a robust invoice lifecycle management system with:

✅ **Strict Lifecycle Rules:** Only Draft invoices can be cancelled
✅ **Data Integrity:** SUM(payments) ≤ invoice.total enforced with locks
✅ **Immutable Payments:** Void pattern instead of deletion
✅ **Concurrency Safety:** Row-level locking with transaction retry
✅ **Precision:** DECIMAL(18,4) for all financial amounts
✅ **Audit Trail:** Complete history of all changes
✅ **Auto Status Updates:** Overdue calculation based on dueDate
✅ **Visual Feedback:** Frontend indicators for cancelled/voided records

**Key Difference from PO System:** Invoice supports automatic "Overdue" status based on dueDate, providing better receivables management.
