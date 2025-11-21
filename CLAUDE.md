# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Inventory & Finance Management System designed for automating inventory control operations, streamlining financial processes, managing customer and vendor accounts, and providing comprehensive reporting capabilities. The system is built as an Electron desktop application with a React frontend and Node.js/Express backend.

**Target Market**: Pakistan (PKR currency, Asia/Karachi timezone, DD/MM/YYYY date format)

## Architecture

### Full Stack Structure
- **Frontend**: React 18 with Ant Design UI components, running in Electron for desktop app distribution
- **Backend**: Node.js with Express.js REST API
- **Database**: PostgreSQL via Supabase with Prisma ORM
- **State Management**: Zustand for React state management
- **Authentication**: JWT-based authentication with role-based access control

### Backend Architecture Pattern (Service-Controller-Route)

The backend follows a strict three-layer architecture:

1. **Routes** (`src/routes/`): Define API endpoints and apply middleware (auth, permissions)
2. **Controllers** (`src/controllers/`): Handle HTTP requests/responses, input validation, format responses
3. **Services** (`src/services/`): Contain business logic, database operations, transaction management

**Important**: Controllers NEVER contain business logic. All business logic, validations, and database operations belong in services.

### Key Backend Services

#### Financial Services
- **`invoiceService.js`**: Invoice CRUD operations
- **`invoiceLifecycleService.js`**: Automated inventory status updates based on invoice lifecycle events
  - `handleInvoiceCreated()` - Reserves items
  - `handleInvoiceCancelled()` - Releases items
  - `handleInvoiceFullyPaid()` - Marks items as sold
  - `handleInvoiceDelivered()` - Marks items as delivered

- **`purchaseOrderService.js`**: PO lifecycle management with status transitions
  - Status flow: Draft → Sent → Partial → Paid → Delivered
  - Enforces business rules and validations
  - Tracks `billedAmount` and `receivedQuantities`

- **`billService.js`**: Vendor bill management with strict validation
  - Validates `SUM(bills.total) <= PO.total` with row-level locks
  - Only unpaid bills with no payments can be cancelled or updated
  - Auto-updates PO status based on billed amount

- **`paymentService.js`**: Vendor payment processing (immutable)
  - Payments are immutable once created (never modified)
  - Uses void pattern instead of deletion
  - Validates payment amount <= remaining balance
  - Atomically updates bill.paidAmount and vendor.currentBalance

- **`customerPaymentService.js`**: Customer payment processing
  - Similar immutability and void pattern as vendor payments
  - Updates invoice.paidAmount and customer.currentBalance

#### Inventory Services
- **`inventoryService.js`**: Inventory CRUD operations
- **`inventoryLifecycleService.js`**: Inventory state machine management
  - Implements strict state transitions: Available → Reserved → Sold → Delivered
  - Validates state transitions before allowing changes
  - Creates `InventoryStatusHistory` audit trail for every transition
  - Provides cleanup for expired temporary reservations

- **`reservationService.js`**: Temporary item reservation system
  - Creates time-limited reservations with `sessionId` grouping
  - Supports FIFO, LIFO, HIGHEST_COST, LOWEST_COST assignment preferences
  - Prevents double-reservation with unique constraints
  - Provides `getGroupedAvailableItems()` for UI selection

#### Supporting Services
- **`ledgerService.js`**: Customer and vendor ledger operations
- **`customerService.js`**: Customer account management
- **`financialReportsService.js`**: Financial reporting and analytics
- **`pdfService.js`**: PDF generation for invoices, POs, and bills
- **`dashboardService.js`**: Dashboard statistics and metrics
- **`authService.js`**: User authentication and JWT management
- **`userService.js`**: User CRUD operations
- **`roleService.js`**: Role and permission management
- **`settingsService.js`**: System settings management
- **`reportService.js`**: Report generation
- **`importExportService.js`**: Excel import/export functionality

### Frontend Architecture

- **Layouts**:
  - `PublicLayout`: Login and public-facing pages
  - `PrivateLayout`: Authenticated app with sidebar navigation

- **Pages**: Organized by feature domains
  - `inventory/`: Item management, barcode scanning, status tracking
  - `finance/`: Invoices, payments, customers, vendors, POs, bills
  - `reports/`: Financial and inventory reports
  - `settings/`: User settings, roles, system configuration

- **Components**: Reusable UI components
  - Modals, forms, tables (Ant Design based)
  - Custom components for barcode scanning, file uploads

- **Stores**: Zustand stores for client state
  - `authStore.js`: Authentication state, user info, permissions

- **Routing**: React Router v6 with nested routes under `/app/*`

### Key Directories

```
frontend/
├── src/
│   ├── pages/           # Main application pages
│   ├── components/      # Reusable React components
│   ├── stores/          # Zustand state stores
│   ├── layouts/         # Layout components
│   ├── api/             # Axios API clients
│   └── utils/           # Helper functions

backend/
├── src/
│   ├── controllers/     # Route handlers (HTTP layer)
│   ├── services/        # Business logic layer
│   ├── routes/          # API route definitions
│   ├── middleware/      # Express middleware
│   ├── config/          # Configuration (DB, logger, constants)
│   ├── utils/           # Utility functions
│   └── prisma/
│       └── schema.prisma  # Database schema
```

## Database Schema Deep Dive

### Core Entities

#### User Management
- **User**: System users with role-based permissions
  - `isActive`: Soft disable users
  - `lastLogin`: Tracks last authentication
  - Relations to all audit trails (invoices, payments, status changes)

- **Role**: Roles with JSON permissions array
  - `permissions`: JSON array of permission strings (e.g., ["inventory.view", "finance.create"])
  - Flexible permission system for granular access control

#### Product Catalog
- **ProductCategory**: Top-level categorization
  - `code`: Used in serial number generation (e.g., "LB" for Lithium Battery)
  - `specTemplate`: JSON schema defining required/optional specs for items

- **Company**: Manufacturers/brands
  - Normalized reference for product models

- **ProductModel**: Specific product models
  - Unique constraint on `(name, companyId)`
  - Links to category and company
  - Referenced by items and PO line items

#### Inventory Management

**Item** (Complete field breakdown):

```javascript
{
  // Identification
  id: String (UUID)
  serialNumber: String (unique, mandatory)
  condition: "New" | "Used"

  // Dual Status System
  status: String           // Physical location: "In Store", "In Lab", "Handover", "Sold", "Delivered"
  inventoryStatus: String  // Availability state: "Available", "Reserved", "Sold", "Delivered"
  statusHistory: Json[]    // Legacy array (now replaced by InventoryStatusHistory table)
  repaired: String?        // "No", "Yes", "Returned" (for "In Lab" items)

  // Reservation Tracking
  reservedAt: DateTime?
  reservedBy: String?           // User ID
  reservedForType: String?      // "Invoice", "PurchaseOrder"
  reservedForId: String?        // Document ID
  reservationExpiry: DateTime?  // For temporary reservations

  // Specifications
  specifications: Json?    // Flexible JSON: {voltage: "48V", cells: 16, bms: "Supported"}

  // Purchase Information
  purchasePrice: Decimal(10,2)?
  purchaseDate: DateTime?
  inboundDate: DateTime       // When item arrived in inventory

  // Sale Information
  sellingPrice: Decimal(10,2)?
  outboundDate: DateTime?     // When item left inventory

  // Customer Relationship
  customerId: String?

  // Handover Details (for delivered items)
  handoverTo: String?         // External recipient name
  handoverToNIC: String?      // National ID
  handoverToPhone: String?    // Contact number
  handoverBy: String?         // Internal employee name
  handoverById: String?       // User ID
  handoverDetails: String?    // Transport/delivery details
  handoverDate: DateTime?

  // Foreign Keys
  categoryId: String          // Required
  modelId: String            // Required
  vendorId: String?          // Optional
  purchaseOrderId: String?   // Optional link to PO
  createdById: String        // Required (audit)

  // Soft Delete
  deletedAt: DateTime?
}
```

**Inventory State Machine** (`inventoryLifecycleService.js`):

```
Valid Transitions:
  Available → Reserved     (when invoice created)
  Available → Sold         (direct sale, rare)
  Reserved → Available     (when invoice cancelled)
  Reserved → Sold          (when invoice paid)
  Sold → Delivered         (when physically delivered)
  Delivered → [TERMINAL]   (no further transitions)
```

The `validateStatusTransition()` function enforces these rules strictly.

**InventoryStatusHistory**: Complete audit trail
- Captures: `fromStatus`, `toStatus`, `changeReason`, `referenceType`, `referenceId`
- `changeReason` enum: INVOICE_CREATED, INVOICE_CANCELLED, INVOICE_PAID, INVOICE_DELIVERED, MANUAL, SYSTEM_CLEANUP
- Indexed on `itemId`, `referenceType/referenceId`, `changeDate`

#### Customer & Vendor Management

**Customer**:
```javascript
{
  id, name, email, phone (unique), address, nic, company,
  creditLimit: Decimal(10,2),
  openingBalance: Decimal(10,2),  // Starting balance
  currentBalance: Decimal(10,2),  // Running balance (updated on invoice/payment)
  deletedAt: DateTime?
}
```

**Vendor**:
```javascript
{
  id, name, code (unique), contactPerson, email, phone, address,
  taxNumber: String?,
  paymentTerms: String?,  // "Net 30", "Due on Receipt"
  openingBalance: Decimal(10,2),
  currentBalance: Decimal(10,2),  // Amount owed TO vendor
  deletedAt: DateTime?
}
```

Both track financial balances:
- **Customer balance**: Amount customer OWES us (increased by invoices, decreased by payments)
- **Vendor balance**: Amount we OWE vendor (increased by bills, decreased by payments)

### Financial System

#### Purchase Order System

**PurchaseOrder**:
```javascript
{
  id, poNumber (unique), orderDate, expectedDate,
  status: "Draft" | "Sent" | "Partial" | "Paid" | "Delivered" | "Cancelled",

  // Financial (DECIMAL(18,4) for precision)
  subtotal: Decimal(18,4),
  taxAmount: Decimal(18,4),
  total: Decimal(18,4),
  billedAmount: Decimal(18,4),  // SUM of all active bill totals

  // Inventory tracking
  receivedQuantities: Json,  // {lineItemId: receivedCount}

  vendorId: String,
  deletedAt: DateTime?
}
```

**Status Transitions** (enforced in `purchaseOrderService.js`):
```
Draft → Sent      (manual: PO sent to vendor)
Sent → Partial    (automatic: first bill created)
Partial → Paid    (automatic: billedAmount == total)
Paid → Delivered  (automatic: all line items received in inventory)
Any → Cancelled   (manual: before Paid)
```

**PurchaseOrderItem**: Line items (what to order, not actual serial numbers)
```javascript
{
  id,
  description: String,      // "48V 100Ah Lithium Battery"
  quantity: Int,
  unitPrice: Decimal(10,2),
  totalPrice: Decimal(18,2),
  specifications: Json?,    // Expected specs
  notes: String?,
  purchaseOrderId: String,
  productModelId: String,   // What model to order
}
```

**Bill**:
```javascript
{
  id, billNumber (unique), billDate, dueDate?,
  status: "Unpaid" | "Partial" | "Paid",

  // Financial (DECIMAL(18,4))
  subtotal: Decimal(18,4),
  taxAmount: Decimal(18,4),
  total: Decimal(18,4),
  paidAmount: Decimal(18,4),

  // Soft-cancel mechanism
  cancelledAt: DateTime?,
  cancelReason: String?,

  vendorId: String,
  purchaseOrderId: String?,
  deletedAt: DateTime?
}
```

**Critical Validation** (`billService.js:42-89`):
```javascript
// CRITICAL: Prevent overbilling a PO
const newBilledAmount = currentBilledAmount + billTotal;
if (newBilledAmount > po.total + 0.01) {  // 1 cent tolerance
  throw new InsufficientBalanceError(
    `Bill total (${total}) exceeds remaining PO balance`,
    po.total - currentBilledAmount,  // available
    total                             // required
  );
}
```

This uses row-level locks (`lockForUpdate`) to prevent race conditions when multiple bills are created simultaneously.

#### Sales & Invoicing System

**Invoice**:
```javascript
{
  id, invoiceNumber (unique), invoiceDate, dueDate,
  status: "Draft" | "Sent" | "Partial" | "Paid" | "Overdue" | "Cancelled",

  // Financial (DECIMAL(18,4))
  subtotal: Decimal(18,4),
  discountType: "Percentage" | "Fixed",
  discountValue: Decimal(10,2),
  taxType: "GST" | "VAT",
  taxRate: Decimal(5,2),      // e.g., 18.00 for 18%
  taxAmount: Decimal(18,4),
  total: Decimal(18,4),
  paidAmount: Decimal(18,4),

  terms: Text?,
  notes: Text?,

  // Soft-cancel mechanism
  cancelledAt: DateTime?,
  cancelReason: String?,
  cancelledBy: String?,

  customerId: String,
  createdById: String,
  deletedAt: DateTime?
}
```

**InvoiceItem**: Links invoice to actual inventory items
```javascript
{
  id,
  quantity: Int,             // Usually 1 for serialized items
  unitPrice: Decimal(10,2),
  total: Decimal(10,2),
  description: String?,
  invoiceId: String,
  itemId: String,            // Specific serial number
}
```

#### Payment System (Immutable Pattern)

**Payment** (Customer payments):
```javascript
{
  id, paymentNumber (unique), paymentDate,
  amount: Decimal(18,4),
  method: "Cash" | "Bank Transfer" | "Cheque" | "UPI" | "Card",
  reference: String?,  // Cheque number, transaction ID, etc.
  notes: String?,

  customerId: String,
  invoiceId: String?,

  // Void mechanism (NEVER delete payments)
  voidedAt: DateTime?,
  voidReason: String?,
  voidedBy: String?,

  recordedById: String,
  deletedAt: DateTime?
}
```

**VendorPayment** (Vendor payments):
```javascript
{
  id, paymentNumber (unique), paymentDate,
  amount: Decimal(18,4),
  method: "Cash" | "Bank Transfer" | "Cheque",
  reference: String?,
  notes: String?,

  vendorId: String,
  billId: String?,

  // Void mechanism
  voidedAt: DateTime?,
  voidReason: String?,
  voidedBy: String?,

  createdBy: String?,
  deletedAt: DateTime?
}
```

**Payment Validation** (`paymentService.js:66-73`):
```javascript
// CRITICAL: Prevent overpayment
const remainingBalance = billTotal - currentPaidAmount;
if (paymentAmount > remainingBalance + 0.01) {  // 1 cent tolerance
  throw new InsufficientBalanceError(
    `Payment amount (${paymentAmount}) exceeds remaining bill balance`,
    remainingBalance,
    paymentAmount
  );
}
```

#### Ledger System

**CustomerLedger**: Running balance ledger
```javascript
{
  id,
  entryDate: DateTime,
  description: String,         // "Invoice INV-001" or "Payment PAY-001"
  debit: Decimal(10,2),       // Increases customer balance (invoices)
  credit: Decimal(10,2),      // Decreases customer balance (payments)
  balance: Decimal(18,2),     // Running balance after this entry
  customerId: String,
  invoiceId: String?,
}
```

**VendorLedger**: Similar structure for vendors
```javascript
{
  id, entryDate, description,
  debit: Decimal(10,2),       // Decreases vendor balance (payments)
  credit: Decimal(10,2),      // Increases vendor balance (bills)
  balance: Decimal(18,2),
  vendorId: String,
  billId: String?,
}
```

**Important**: Ledger entries are created automatically by services (billService, paymentService, etc.). Controllers/routes should never directly create ledger entries.

#### General Ledger (Account & JournalEntry)

**Account**: Chart of accounts for double-entry bookkeeping
```javascript
{
  id,
  code: String (unique),      // "1000", "4100"
  name: String,               // "Cash", "Sales Revenue"
  type: "Asset" | "Liability" | "Income" | "Expense" | "Equity",
  parentId: String?,          // Hierarchical structure
  openingBalance: Decimal(10,2),
  currentBalance: Decimal(10,2),
  deletedAt: DateTime?
}
```

**JournalEntry**: Double-entry transactions
```javascript
{
  id,
  entryDate: DateTime,
  reference: String?,         // "INV-001", "PO-001"
  description: String,
  accountId: String,
  debit: Decimal(10,2),
  credit: Decimal(10,2),

  // Source tracking
  sourceType: "Invoice" | "Bill" | "Payment" | "Manual",
  sourceId: String?,

  deletedAt: DateTime?
}
```

### Audit Trail System

#### InvoicePaymentAudit
Tracks complete invoice and payment lifecycle:
```javascript
{
  id,
  invoiceId: String,
  action: "INVOICE_CREATED" | "INVOICE_CANCELLED" | "PAYMENT_RECORDED" |
          "PAYMENT_VOIDED" | "STATUS_CHANGED",
  paymentId: String?,

  beforeState: Json?,         // Snapshot before change
  afterState: Json,           // Snapshot after change

  performedBy: String,        // User ID
  performedAt: DateTime,

  metadata: Json?             // Additional context
}
```

#### POBillAudit
Tracks PO, bill, and vendor payment lifecycle:
```javascript
{
  id,
  purchaseOrderId: String,
  action: "BILL_CREATED" | "BILL_CANCELLED" | "PAYMENT_RECORDED" |
          "PAYMENT_VOIDED" | "STATUS_CHANGED",
  billId: String?,
  paymentId: String?,

  beforeState: Json?,
  afterState: Json,

  performedBy: String,
  performedAt: DateTime,

  metadata: Json?
}
```

These audit tables provide complete traceability for all financial operations.

### Reservation System Deep Dive

**ItemReservation**: Temporary reservation table
```javascript
{
  id,
  itemId: String,
  sessionId: String,          // Groups multiple items reserved together
  reservedBy: String,         // User ID
  reason: "INVOICE_CREATION" | "MANUAL_HOLD",
  reservedAt: DateTime,
  expiresAt: DateTime,        // Auto-cleanup after expiry

  // Optional document reference
  referenceType: "Invoice" | "PurchaseOrder",
  referenceId: String?,

  // Unique constraint on (itemId, sessionId)
}
```

**How Reservations Work**:
1. User starts creating invoice → Frontend calls `POST /api/inventory/reservations`
2. Service checks items are Available → Creates reservations with `sessionId`
3. Items marked as `inventoryStatus = "Reserved"` with `reservedForType = "Invoice"`
4. If invoice creation fails or cancelled → Reservations deleted, items back to Available
5. If invoice created successfully → Reservations remain until invoice is finalized
6. Expired reservations cleaned up by background job

## Transaction Management & Concurrency Control

### Transaction Wrapper Utilities (`src/utils/transactionWrapper.js`)

The system uses sophisticated transaction management to handle concurrent operations safely.

#### withTransaction()
Wraps Prisma transactions with retry logic for deadlock scenarios:
```javascript
await withTransaction(async (tx) => {
  // Your transactional code here
  // Automatic retry on deadlock (up to 3 attempts with exponential backoff)
}, {
  maxRetries: 3,
  timeout: 10000,
  isolationLevel: 'Serializable'
});
```

**Features**:
- Automatic deadlock detection (PostgreSQL error codes 40001, 40P01)
- Exponential backoff: 100ms → 200ms → 400ms
- Configurable isolation level (default: Serializable)
- Timeout protection (default: 10 seconds)

#### lockForUpdate()
Acquires row-level lock using `SELECT ... FOR UPDATE NOWAIT`:
```javascript
const po = await lockForUpdate(tx, 'PurchaseOrder', poId);
// Now po is locked for the duration of the transaction
// Other transactions trying to lock will immediately fail (NOWAIT)
```

**Why NOWAIT**: Prevents long wait times. If lock can't be acquired, fail fast and retry at application level.

**Lock Ordering**: Always lock in consistent order to prevent deadlocks:
```javascript
// billService.js always locks PO first, then bill
const po = await lockForUpdate(tx, 'PurchaseOrder', purchaseOrderId);
const bill = await lockForUpdate(tx, 'Bill', billId);
```

#### Custom Error Classes

**ValidationError** (400):
- Business logic violations
- "Cannot create bill for cancelled PO"
- "Invoice not found"

**ConcurrencyError** (409):
- Transaction conflicts after retries exhausted
- "This record is being modified by another user. Please try again."

**InsufficientBalanceError** (400):
- Special error with structured data
- Contains `available` and `required` amounts
- Used for overbilling, overpayment scenarios

#### Decimal Precision Utilities

**formatAmount(amount, precision=4)**:
```javascript
formatAmount(10.123456789, 4)  // Returns: 10.1235
```

**compareAmounts(amount1, amount2, tolerance=0.0001)**:
```javascript
compareAmounts(10.1234, 10.1235)  // Returns: true (within tolerance)
```

**Why tolerance?**: Floating-point arithmetic can introduce tiny errors. Tolerance of 0.0001 (1 cent for 4 decimal places) handles this.

**addAmounts(...amounts)**:
```javascript
addAmounts(10.12, 20.34, 30.56)  // Returns: 61.02
```

## Critical Business Rules

### Invoice Lifecycle Flow

```
1. Draft Invoice Created
   └─> No inventory changes yet

2. Invoice Finalized (status = "Sent")
   └─> invoiceLifecycleService.handleInvoiceCreated()
       └─> inventoryLifecycleService.reserveItemsForInvoice()
           └─> Items: Available → Reserved
           └─> Set: reservedForType="Invoice", reservedForId=invoiceId
           └─> Create InventoryStatusHistory records

3. Payment Recorded
   └─> customerPaymentService.recordPayment()
       └─> Update invoice.paidAmount
       └─> If fully paid → invoiceLifecycleService.handleInvoiceFullyPaid()
           └─> inventoryLifecycleService.markItemsAsSoldForInvoice()
               └─> Items: Reserved → Sold
               └─> Set: status="Sold", outboundDate=now

4. Invoice Marked as Delivered
   └─> invoiceLifecycleService.handleInvoiceDelivered()
       └─> inventoryLifecycleService.markItemsAsDeliveredForInvoice()
           └─> Items: Sold → Delivered
           └─> Set: status="Delivered", handoverDate=now
           └─> Record handover details

5. Invoice Cancelled
   └─> invoiceLifecycleService.handleInvoiceCancelled()
       └─> inventoryLifecycleService.releaseItemsForInvoiceCancellation()
           └─> Items: Reserved → Available
           └─> Clear: reservedForType, reservedForId
```

**Key Points**:
- State transitions are automatic based on invoice status
- All transitions create audit trail in InventoryStatusHistory
- Cancelled invoices can only release Reserved items (can't unsell Sold items)

### Purchase Order Lifecycle Flow

```
1. Draft PO Created
   └─> status = "Draft"
   └─> Can be edited/deleted freely

2. PO Sent to Vendor
   └─> Manual: updatePurchaseOrderStatus(poId, "Sent")
   └─> status = "Sent"
   └─> No longer editable

3. First Bill Created Against PO
   └─> billService.createBill()
       ├─> lockForUpdate(PO)  // Prevent race conditions
       ├─> Validate: bill.vendorId == po.vendorId
       ├─> Validate: bill.total <= (po.total - po.billedAmount)
       ├─> Create bill
       ├─> Update: po.billedAmount += bill.total
       └─> Auto-update: status = "Partial"

4. PO Fully Billed
   └─> When po.billedAmount == po.total
   └─> Auto-update: status = "Paid"

5. Items Received in Inventory
   └─> When items added with purchaseOrderId reference
   └─> Update: po.receivedQuantities = {lineItemId: count}
   └─> If all line items received → Auto-update: status = "Delivered"

6. Bill Cancelled
   └─> billService.cancelBill()
       ├─> Validate: bill.status == "Unpaid"
       ├─> Validate: bill.paidAmount == 0
       ├─> Set: bill.cancelledAt, bill.cancelReason
       ├─> Update: po.billedAmount -= bill.total
       ├─> Reverse vendor ledger entry
       └─> May revert PO status (Paid → Partial or Partial → Sent)
```

**Key Validations**:
- `SUM(active bills) <= PO.total` strictly enforced with locks
- Only unpaid bills with zero payments can be cancelled
- Bills can only be created against POs in Sent/Partial status

### Payment Processing Rules

#### Customer Payments

```javascript
// paymentService.js flow
1. Lock invoice (prevent concurrent payments)
2. Validate: paymentAmount <= (invoice.total - invoice.paidAmount)
3. Create Payment record (immutable)
4. Update: invoice.paidAmount += paymentAmount
5. Update invoice status:
   - If paidAmount == total → status = "Paid"
   - Else if paidAmount > 0 → status = "Partial"
6. Update: customer.currentBalance -= paymentAmount
7. Create CustomerLedger entry (credit)
8. If invoice fully paid → Trigger inventory lifecycle (Reserve → Sold)
9. Create InvoicePaymentAudit record
```

#### Vendor Payments

```javascript
// Similar flow for vendor payments
1. Lock bill
2. Validate: paymentAmount <= (bill.total - bill.paidAmount)
3. Create VendorPayment record (immutable)
4. Update: bill.paidAmount += paymentAmount
5. Update bill status
6. Update: vendor.currentBalance -= paymentAmount (we owe less)
7. Create VendorLedger entry (credit)
8. Create POBillAudit record
```

#### Voiding Payments

Payments are NEVER deleted. Instead:
```javascript
1. Set: payment.voidedAt = now
2. Set: payment.voidReason = reason
3. Set: payment.voidedBy = userId
4. Reverse: invoice/bill.paidAmount -= payment.amount
5. Update invoice/bill status
6. Reverse: customer/vendor.currentBalance
7. Create reverse ledger entry
8. Create audit trail
```

### Decimal Precision Rules

**All monetary fields use DECIMAL(18,4)**:
- 18 total digits
- 4 decimal places
- Supports values up to 99,999,999,999,999.9999

**Why 4 decimal places?**:
- Supports fractional currency units
- Accurate tax calculations
- Prevents rounding errors in financial calculations

**Always use utility functions**:
```javascript
// BAD
const total = subtotal + taxAmount;  // May have floating-point errors

// GOOD
const total = formatAmount(subtotal + taxAmount);

// BAD
if (amount1 === amount2) { ... }  // Fails due to floating-point

// GOOD
if (compareAmounts(amount1, amount2)) { ... }  // Uses tolerance
```

### Soft Delete Pattern

**Models with soft delete** (deletedAt: DateTime?):
- User, Role, ProductCategory, Company, ProductModel
- Item, Customer, Vendor
- Account, PurchaseOrder, Bill, Invoice
- Payment, VendorPayment

**Models with special soft-cancel**:
- **Invoice**: `cancelledAt`, `cancelReason`, `cancelledBy`
- **Bill**: `cancelledAt`, `cancelReason`
- **Payment**: `voidedAt`, `voidReason`, `voidedBy`
- **VendorPayment**: `voidedAt`, `voidReason`, `voidedBy`

**Important**: Always filter `deletedAt: null` in queries unless specifically including deleted records.

Database helper provides convenience methods:
```javascript
await db.softDelete('Invoice', invoiceId);
await db.restore('Invoice', invoiceId);
```

## Middleware & Authentication

### Authentication Middleware (`src/middleware/auth.js`)

#### protect
Main authentication middleware:
```javascript
router.use(protect);  // All routes require authentication
```

**Flow**:
1. Extract JWT from `Authorization: Bearer <token>` header
2. Verify JWT with `JWT_SECRET`
3. Look up user in database (active users only)
4. Attach user object to `req.user`
5. Update user's `lastLogin` timestamp

**req.user structure**:
```javascript
{
  id, username, fullName, email, roleId,
  role: {
    name: "Admin" | "Inventory Operator" | "Financial Operator",
    permissions: ["inventory.view", "finance.create", ...]
  }
}
```

#### hasPermission(requiredPermissions)
Permission-based authorization:
```javascript
router.post('/invoices',
  protect,
  hasPermission(['finance.create']),
  controller.createInvoice
);
```

Checks if user has ALL required permissions.

#### hasRole(allowedRoles)
Role-based authorization:
```javascript
router.delete('/users/:id',
  protect,
  hasRole(['Admin']),
  controller.deleteUser
);
```

**Permission Examples**:
- `inventory.view`, `inventory.create`, `inventory.edit`, `inventory.delete`
- `finance.view`, `finance.create`, `finance.edit`, `finance.delete`
- `reports.view`, `settings.edit`

### Error Handler Middleware (`src/middleware/errorHandler.js`)

Centralized error handling with proper logging and status codes:

**Custom Error Handling**:
- `ValidationError` → 400
- `ConcurrencyError` → 409 ("This record is being modified by another user")
- `InsufficientBalanceError` → 400 (includes `available` and `required` in response)

**Prisma Error Codes**:
- `P2002` (unique constraint) → 400 "Duplicate value"
- `P2025` (not found) → 404 "Record not found"

**PostgreSQL Deadlock Codes**:
- `40001`, `40P01` → 409 "Transaction conflict detected. Please retry."

**Error Response Format**:
```javascript
{
  success: false,
  message: "Error message here",
  stack: "..." // Only in development
}
```

**For InsufficientBalanceError**:
```javascript
{
  success: false,
  error: {
    message: "Payment exceeds remaining balance",
    available: 1000.00,
    required: 1500.00
  }
}
```

## Database Configuration (`src/config/database.js`)

### Database Class

Singleton wrapper around PrismaClient:

**Features**:
- Query logging in development
- Error event logging
- Transaction helpers with custom timeout
- Soft delete helpers

**Methods**:
```javascript
// Connection
await db.connect();
await db.disconnect();

// Transactions
await db.transaction(async (prisma) => {
  // Your queries here
});

// Soft delete helpers
await db.softDelete('Invoice', invoiceId);
await db.restore('Invoice', invoiceId);

// Find with soft delete filter
const items = await db.findMany('Item', {
  where: { categoryId: '...' },
  includeDeleted: false  // Default: excludes deleted
});
```

**Transaction Configuration**:
- `maxWait`: 10000ms (time to wait for connection)
- `timeout`: 15000ms (transaction timeout)

## Development Commands

### Backend (run from `backend/` directory)
```bash
npm run dev          # Development server with nodemon
npm start            # Production server
npm test             # Run Jest tests

# Database operations
npm run db:migrate   # Run Prisma migrations
npm run db:push      # Push schema changes to database (dev only)
npm run db:seed      # Seed database with initial data
npm run db:studio    # Open Prisma Studio GUI
npm run db:reset     # Reset database (drop all data + migrate)
```

### Frontend (run from `frontend/` directory)
```bash
npm start            # React development server
npm run build        # Build React app for production

# Electron desktop app
npm run electron-dev # Run Electron in development
npm run electron     # Run Electron in production
npm run dist         # Build Electron installer
npm run pack         # Package without installer
```

## Environment Configuration

### Backend Environment Variables (`.env`)
```bash
# Database
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."  # For migrations

# Supabase (optional, if using Supabase features)
SUPABASE_URL="https://..."
SUPABASE_ANON_KEY="..."

# Authentication
JWT_SECRET="your-secret-key-here"
JWT_EXPIRY="24h"

# Server
PORT=3001
NODE_ENV="development" # or "production"

# Logging
LOG_LEVEL="info"  # debug, info, warn, error
```

### Frontend Environment Variables (`.env`)
```bash
REACT_APP_API_URL="http://localhost:3001/api"
```

### System Constants (`src/config/constants.js`)
```javascript
{
  CURRENCY: "PKR",
  CURRENCY_SYMBOL: "Rs.",
  TIMEZONE: "Asia/Karachi",
  DATE_FORMAT: "DD/MM/YYYY",
  DATETIME_FORMAT: "DD/MM/YYYY HH:mm:ss",
  COUNTRY: "Pakistan",

  // Payment methods
  PAYMENT_METHODS: ["Cash", "Bank Transfer", "Cheque", "UPI", "Card"],

  // Item conditions
  ITEM_CONDITIONS: ["New", "Used"],

  // Status enums (must match database)
  ITEM_STATUS: ["In Store", "In Lab", "Handover", "Sold", "Delivered"],
  INVENTORY_STATUS: ["Available", "Reserved", "Sold", "Delivered"],
  INVOICE_STATUS: ["Draft", "Sent", "Partial", "Paid", "Overdue", "Cancelled"],
  PO_STATUS: ["Draft", "Sent", "Partial", "Paid", "Delivered", "Cancelled"],
  BILL_STATUS: ["Unpaid", "Partial", "Paid"]
}
```

## Technology Stack

### Frontend Dependencies
```json
{
  "react": "^18.0.0",
  "react-router-dom": "^6.0.0",
  "antd": "^5.0.0",                    // UI component library
  "axios": "^1.0.0",                   // HTTP client
  "@tanstack/react-query": "^3.0.0",  // Server state management
  "zustand": "^4.0.0",                 // Client state management
  "electron": "^25.0.0",               // Desktop app framework
  "@ericblade/quagga2": "^1.0.0",     // Barcode scanner
  "recharts": "^2.0.0",                // Charts
  "dayjs": "^1.11.0",                  // Date manipulation
  "xlsx": "^0.18.0"                    // Excel file handling
}
```

### Backend Dependencies
```json
{
  "express": "^4.18.0",
  "@prisma/client": "^5.0.0",
  "jsonwebtoken": "^9.0.0",
  "bcryptjs": "^2.4.3",
  "winston": "^3.8.0",                 // Logging
  "helmet": "^7.0.0",                  // Security headers
  "cors": "^2.8.5",
  "express-rate-limit": "^6.0.0",     // Rate limiting
  "express-async-handler": "^1.2.0",  // Async error handling
  "multer": "^1.4.0",                  // File uploads
  "exceljs": "^4.3.0",                 // Excel generation
  "moment-timezone": "^0.5.0",
  "uuid": "^9.0.0"
}
```

### Dev Dependencies
```json
{
  "nodemon": "^2.0.0",
  "jest": "^29.0.0",
  "supertest": "^6.3.0",
  "@testing-library/react": "^14.0.0",
  "prisma": "^5.0.0",
  "eslint": "^8.0.0"
}
```

## Development Best Practices

### When Working with Services

1. **Always use transactions for multi-step operations**:
   ```javascript
   return withTransaction(async (tx) => {
     // All database operations here
   });
   ```

2. **Lock records when reading before update**:
   ```javascript
   const invoice = await lockForUpdate(tx, 'Invoice', invoiceId);
   // Now safe to update based on current values
   ```

3. **Use utility functions for decimal arithmetic**:
   ```javascript
   const total = formatAmount(subtotal + taxAmount);
   if (compareAmounts(paidAmount, total)) { ... }
   ```

4. **Validate state transitions**:
   ```javascript
   inventoryLifecycleService.validateStatusTransition(fromStatus, toStatus);
   ```

5. **Create audit trails for financial operations**:
   ```javascript
   await tx.invoicePaymentAudit.create({
     data: {
       invoiceId, action, beforeState, afterState,
       performedBy: userId
     }
   });
   ```

### When Working with Controllers

1. **Keep controllers thin** - delegate to services
2. **Use asyncHandler** for automatic error handling
3. **Validate permissions** with middleware, not in controller
4. **Return consistent response format**:
   ```javascript
   res.json({
     success: true,
     data: result,
     message: "Optional message"
   });
   ```

### When Working with Prisma Schema

1. **Always use DECIMAL(18,4)** for monetary values
2. **Add indexes** for frequently queried fields
3. **Use `@@unique` constraints** to prevent duplicates
4. **Document relationships clearly** with relation names
5. **Run migrations** after schema changes: `npm run db:migrate`

### Testing Approach

1. **Unit tests** for services with complex logic
2. **Integration tests** for API endpoints
3. **Transaction tests** for concurrency scenarios
4. **Test error cases** especially ValidationError, InsufficientBalanceError

Example test structure:
```javascript
describe('billService.createBill', () => {
  it('should create bill within PO limit', async () => {
    // Test happy path
  });

  it('should reject bill exceeding PO total', async () => {
    // Test InsufficientBalanceError
  });

  it('should handle concurrent bill creation', async () => {
    // Test race conditions with locks
  });
});
```

## Common Pitfalls & Solutions

### Pitfall 1: Floating-Point Arithmetic Errors
```javascript
// WRONG
const total = 100.1 + 200.2;  // May be 300.30000000000004

// RIGHT
const total = formatAmount(100.1 + 200.2);  // 300.3000
```

### Pitfall 2: Comparing Decimal Values
```javascript
// WRONG
if (amount === expectedAmount) { ... }  // May fail

// RIGHT
if (compareAmounts(amount, expectedAmount)) { ... }
```

### Pitfall 3: Forgetting Soft Delete Filter
```javascript
// WRONG
const items = await prisma.item.findMany();  // Includes deleted

// RIGHT
const items = await prisma.item.findMany({
  where: { deletedAt: null }
});
```

### Pitfall 4: Race Conditions in Financial Operations
```javascript
// WRONG
const po = await prisma.purchaseOrder.findUnique({ where: { id } });
const newBilledAmount = po.billedAmount + billTotal;
await prisma.purchaseOrder.update({ ... });  // Race condition!

// RIGHT
return withTransaction(async (tx) => {
  const po = await lockForUpdate(tx, 'PurchaseOrder', id);
  const newBilledAmount = formatAmount(po.billedAmount + billTotal);
  await tx.purchaseOrder.update({ ... });
});
```

### Pitfall 5: Modifying Immutable Records
```javascript
// WRONG
await prisma.payment.update({
  where: { id },
  data: { amount: newAmount }  // Payments are immutable!
});

// RIGHT
await paymentService.voidPayment(id, reason, userId);
// Then create new payment if needed
```

### Pitfall 6: Direct Status Updates Without Lifecycle
```javascript
// WRONG
await prisma.invoice.update({
  where: { id },
  data: { status: 'Paid' }  // Doesn't trigger inventory updates!
});

// RIGHT
await invoiceLifecycleService.handleInvoiceFullyPaid(id, userId);
```

## Architecture Diagrams

### Invoice Flow
```
User Creates Invoice
        ↓
invoiceService.createInvoice()
        ↓
invoiceLifecycleService.handleInvoiceCreated()
        ↓
inventoryLifecycleService.reserveItemsForInvoice()
        ↓
Items: Available → Reserved
        ↓
User Records Payment
        ↓
customerPaymentService.recordPayment()
        ↓
invoiceLifecycleService.handleInvoiceFullyPaid()
        ↓
inventoryLifecycleService.markItemsAsSoldForInvoice()
        ↓
Items: Reserved → Sold
```

### Purchase Order Flow
```
User Creates Draft PO
        ↓
purchaseOrderService.createPurchaseOrder()
        ↓
PO Status: Draft
        ↓
User Sends PO → Status: Sent
        ↓
Vendor Sends Bill
        ↓
billService.createBill()
  ├─ Lock PO
  ├─ Validate: bill.total <= (PO.total - PO.billedAmount)
  ├─ Create Bill
  ├─ Update PO.billedAmount
  └─ Auto-update: PO Status → Partial
        ↓
More Bills Until Fully Billed
        ↓
Auto-update: PO Status → Paid
        ↓
Items Received in Inventory
        ↓
Auto-update: PO Status → Delivered
```

## Quick Reference

### Common Query Patterns

**Get active invoices with customer**:
```javascript
await prisma.invoice.findMany({
  where: {
    deletedAt: null,
    cancelledAt: null,
    status: { in: ['Sent', 'Partial'] }
  },
  include: {
    customer: true,
    items: {
      include: { item: true }
    }
  },
  orderBy: { invoiceDate: 'desc' }
});
```

**Get items available for reservation**:
```javascript
await prisma.item.findMany({
  where: {
    status: 'In Store',
    inventoryStatus: 'Available',
    deletedAt: null
  },
  include: {
    category: true,
    model: { include: { company: true } }
  }
});
```

**Get bill with payment history**:
```javascript
await prisma.bill.findUnique({
  where: { id: billId },
  include: {
    vendor: true,
    purchaseOrder: true,
    payments: {
      where: { voidedAt: null },
      orderBy: { paymentDate: 'desc' }
    }
  }
});
```

### Status Enum Values

| Entity | Status Field | Possible Values |
|--------|-------------|----------------|
| Item | `status` | In Store, In Lab, Handover, Sold, Delivered |
| Item | `inventoryStatus` | Available, Reserved, Sold, Delivered |
| Invoice | `status` | Draft, Sent, Partial, Paid, Overdue, Cancelled |
| PurchaseOrder | `status` | Draft, Sent, Partial, Paid, Delivered, Cancelled |
| Bill | `status` | Unpaid, Partial, Paid |

### Service Responsibilities Matrix

| Service | Create | Update | Delete | Lifecycle | Transactions |
|---------|--------|--------|--------|-----------|--------------|
| invoiceService | ✓ | ✓ | ✓ | - | ✓ |
| invoiceLifecycleService | - | - | - | ✓ | ✓ |
| inventoryLifecycleService | - | ✓ | - | ✓ | ✓ |
| billService | ✓ | ✓ | ✓ (soft) | - | ✓ |
| paymentService | ✓ | - | - (void) | - | ✓ |
| reservationService | ✓ | - | ✓ | - | ✓ |

---

## Additional Notes

- The system prioritizes **data integrity** over performance in financial operations
- All financial operations use **pessimistic locking** to prevent race conditions
- **Immutability** is enforced for payments (void instead of delete/update)
- **Audit trails** are comprehensive - every financial operation is tracked
- **State machines** prevent invalid transitions in inventory and document lifecycles
- **Soft deletes** preserve data for auditing and compliance
- **Decimal precision** prevents rounding errors in financial calculations
- **Transaction retry logic** handles concurrent access gracefully

When in doubt, follow the existing patterns in the codebase. Services should handle all business logic, controllers should be thin HTTP handlers, and database operations should always be wrapped in transactions with proper locking.

---

## Recent Critical Fixes Applied (2025-01-21)

### Data Integrity & Consistency Improvements

The following 28 critical and moderate issues were identified and fixed to ensure data integrity, consistency, and proper transaction handling:

#### Phase 1: Critical Transaction & Balance Fixes ✅
1. **Invoice Creation Ledger Entry** - Invoices now create `CustomerLedger` entries and update `customer.currentBalance` on creation
2. **Invoice Cancellation Balance Reversal** - Cancellations unconditionally reverse customer balance (no conditional check)
3. **Inventory Status Update Inside Transaction** - `markItemsAsSoldForInvoice()` now called INSIDE payment transaction for atomicity

#### Phase 2: Ledger Consistency Fixes ✅
4. **Vendor Ledger Excludes Cancelled Bills** - Added `cancelledAt: null` filter to vendor ledger queries
5. **Vendor Ledger Excludes Voided Payments** - Added `voidedAt: null` filter to vendor payment queries
6. **Decimal Precision Throughout** - Replaced all `parseFloat()` with `formatAmount()` for proper DECIMAL(18,4) handling
7. **Vendor Ledger Sort Order** - Changed from `createdAt` to `billDate` for chronological accuracy

#### Phase 3: State Machine & Lifecycle Fixes ✅
8. **Invalid "Under Repair" Status Removed** - Changed to use "Available" (only valid inventoryStatus values)
9. **InventoryStatusHistory for Handovers** - Added proper audit trail records for handover operations
10. **Deprecated Legacy statusHistory JSON** - Stopped updating JSON field, using `InventoryStatusHistory` table only

#### Phase 4: Transaction Boundaries ✅
11. **updateItemStatus Wrapped in Transaction** - Multi-step handover operations now atomic
12. **updateRepairedStatus with Lock** - Added transaction wrapper to prevent race conditions
13. **bulkCreateItems in Transaction** - All items created atomically (all or nothing)

#### Phase 5: Invoice Business Logic Fixes ✅
14. **Relaxed Cancellation Rules** - Can now cancel Sent/Overdue invoices if unpaid (not just Draft)
15. **Fixed updateOverdueInvoices Syntax** - Replaced invalid Prisma field comparison with in-memory filter
16. **Release Old Items on Update** - Invoice item updates now release previously reserved items

#### Phase 6: Concurrency & Locking Fixes ✅
17. **Customer Lock for Credit Limit** - Added `lockForUpdate()` to prevent race conditions on credit limit checks
18. **Distributed Lock for Batch Job** - PostgreSQL advisory lock prevents concurrent `updateOverdueInvoices` execution

#### Phase 7: Moderate Issues Fixes ✅
19. **Negative Total Validation** - Added check to prevent invoices with negative totals
20. **Stock Summary by inventoryStatus** - Fixed to use `inventoryStatus` instead of physical `status`
21. **Auto-Update PO on Delivery** - PO status auto-updates to "Delivered" when all items received
22. **Audit Trail Completeness** - All status changes now create `InventoryStatusHistory` records

### Key Improvements Summary

**Transaction Safety**:
- All multi-step operations wrapped in transactions
- Row-level locks prevent race conditions
- Distributed locks prevent duplicate batch jobs

**Ledger Accuracy**:
- Customer/vendor balances updated on invoice/bill creation AND cancellation
- Cancelled bills and voided payments excluded from ledger
- Decimal precision maintained throughout (no floating-point errors)

**State Machine Integrity**:
- Only valid inventoryStatus values used (Available, Reserved, Sold, Delivered)
- All state transitions create audit trails
- Legacy JSON statusHistory deprecated

**Business Logic Correctness**:
- Inventory updates atomic with payments (no orphaned states)
- Items released when invoice updated/cancelled
- PO status auto-updates based on delivery completion

### Testing Recommendations

After these fixes, the following should be tested:

1. **Concurrent Operations**: Multiple users creating invoices for same customer
2. **Ledger Reconciliation**: `getCustomerLedger()` vs `customer.currentBalance` should match
3. **Payment Atomicity**: Failed inventory updates should rollback entire payment
4. **Invoice Cancellation**: Unpaid Sent/Overdue invoices should be cancellable
5. **Credit Limit**: Concurrent invoice creation should not exceed credit limit

---

## Purchase Order Lifecycle Fixes Applied

A comprehensive data integrity audit of the Purchase Order lifecycle identified and fixed **15 critical and moderate issues** across vendor ledger consistency, transaction atomicity, race conditions, and business logic validation.

### Issues Fixed by Phase

#### Phase 1: Critical Vendor Ledger Fixes (4 changes) ✅
1. **Vendor Ledger Balance Calculation** (paymentService.js:122-148, 247-274)
   - **Issue**: Ledger balance calculated AFTER balance update using `decrement`, resulting in incorrect balance stored in ledger
   - **Fix**: Fetch vendor BEFORE balance update, calculate new balance explicitly, use correct new balance in ledger entry

2. **Replace `decrement` with Explicit Calculation** (paymentService.js:127-134, 252-260)
   - **Issue**: Using Prisma's `decrement` operator is unsafe under concurrent transactions (lost updates)
   - **Fix**: Read vendor with lock, compute new balance with formatAmount(), update with explicit value

3. **parseFloat → formatAmount in billService** (billService.js:115, 141, 222-227, 245-283)
   - **Issue**: Multiple locations use `parseFloat()` causing decimal precision errors
   - **Fix**: Use `formatAmount()` throughout for DECIMAL(18,4) precision

4. **parseFloat → formatAmount in purchaseOrderService** (purchaseOrderService.js:327, 387-396)
   - **Issue**: `parseFloat()` in computed fields for remainingAmount
   - **Fix**: Use `formatAmount()` for all amount calculations

#### Phase 2: PO Cancellation & Validation (3 changes) ✅
5. **Add cancelPurchaseOrder() Function** (purchaseOrderService.js:290-382)
   - **Issue**: No dedicated cancellation function with validations
   - **Fix**: Added function with checks for: status (only Draft/Sent), no bills exist, no items received, creates audit trail

6. **Fix Status Transitions** (purchaseOrderService.js:29-36)
   - **Issue**: 'Partial' status allowed transition to 'Cancelled', violating business rule (cannot cancel if bills exist)
   - **Fix**: Removed 'Cancelled' from Partial state transitions

7. **Add Received Items Check to Bill Cancellation** (billService.js:232-245)
   - **Issue**: Bill cancellation only checked for payments, not received items
   - **Fix**: Added validation to prevent bill cancellation if items have been received in inventory for the PO

#### Phase 3: Inventory Receipt Atomicity (3 changes) ✅
8. **Wrap bulkCreateItemsFromPO in Single Transaction** (inventoryService.js:960-1111)
   - **Issue**: Items created one-by-one in separate transactions, PO updated separately, causing potential inconsistency
   - **Fix**: Wrapped entire operation in single transaction - all items + PO update together (all or nothing)
   - **Benefit**: Prevents orphaned items if process crashes mid-operation

9. **Add Received Quantity Validation** (inventoryService.js:998-1024)
   - **Issue**: No validation that received quantities don't exceed ordered quantities per line item
   - **Fix**: Pre-calculate totals, validate received <= ordered for each line item before creating items

10. **Require Bill Before Item Receipt** (inventoryService.js:983-990)
    - **Issue**: Allowed 'Sent' status for item receipt (items could arrive before bills)
    - **Fix**: Only allow 'Paid' or 'Partial' status, ensuring bill created (vendor balance increased) BEFORE items received

#### Phase 4: Bill Update Handling (1 change) ✅
11. **Prohibit Bill Amount Updates** (billService.js:485-512)
    - **Issue**: Allowed updating bill amounts without updating PO.billedAmount or vendor ledger
    - **Fix**: Added validation to prohibit subtotal/tax/total updates, recommend cancel + new bill for corrections

#### Phase 5: Business Logic Validation (2 changes) ✅
12. **Validate PO Status in Payment** (paymentService.js:54-67)
    - **Issue**: Could record payments for bills from cancelled POs
    - **Fix**: Added check that bill's PO is not cancelled before accepting payment

13. **Fix updateBillStatus parseFloat** (billService.js:363)
    - **Issue**: Used `parseFloat()` for status calculation
    - **Fix**: Use `formatAmount()` for decimal precision

#### Phase 6: Documentation & Cleanup (2 changes) ✅
14. **Add PO Lifecycle Comments** (purchaseOrderService.js:1-39)
    - Added comprehensive documentation explaining expected flow, business rules, status transitions, data integrity enforcements

15. **Update CLAUDE.md** (this section)
    - Documented all 15 fixes with context and impact

### Files Modified (4 total)
- `backend/src/services/paymentService.js` (5 fixes)
- `backend/src/services/billService.js` (5 fixes)
- `backend/src/services/purchaseOrderService.js` (3 fixes)
- `backend/src/services/inventoryService.js` (3 fixes)

### Key Improvements Summary

**Vendor Ledger Accuracy**:
- Ledger balance now correctly reflects vendor.currentBalance after each transaction
- No more `decrement`/`increment` operations - all explicit calculations
- DECIMAL(18,4) precision maintained throughout (no floating-point errors)

**Transaction Atomicity**:
- Inventory receipt now fully atomic (all items + PO update in single transaction)
- Payment + vendor balance + ledger entry all atomic
- Crash during operations results in clean rollback

**Race Condition Prevention**:
- PO locked during bill creation (prevents SUM(bills) > PO.total)
- Bill locked during payment (prevents SUM(payments) > bill.total)
- Explicit balance calculation prevents lost updates from concurrent transactions

**Business Rule Enforcement**:
- PO can only be cancelled in Draft/Sent (no bills, no items)
- Bill cannot be cancelled if items received
- Bill amounts cannot be updated (maintain audit trail)
- Items can only be received after bills created (vendor balance increases first)
- Received quantities cannot exceed ordered quantities

**Data Consistency**:
- All amount calculations use formatAmount()
- Vendor ledger updated atomically with bill creation/cancellation
- PO status auto-updates based on bills and deliveries

### Testing Recommendations

After these Purchase Order fixes, test:

1. **Concurrent Bill Creation**: Multiple users creating bills against same PO simultaneously
2. **Vendor Ledger Reconciliation**: `getVendorLedger()` vs `vendor.currentBalance` should match
3. **Inventory Receipt Atomicity**: Crash during bulkCreateItemsFromPO should rollback all items
4. **PO Cancellation**: Should only work in Draft/Sent, fail if bills or items exist
5. **Bill Cancellation**: Should fail if items have been received
6. **Over-Receipt Prevention**: Attempting to receive more items than ordered should fail
7. **Bill Before Items**: Attempting to receive items in 'Sent' status should fail

### Known Limitation: receivedQuantities JSON Field

**Issue**: The `receivedQuantities` field in PurchaseOrder uses JSON storage with read-modify-write pattern. While Phase 3 fixes mitigate race conditions by wrapping in transaction, the JSON approach is still suboptimal.

**Recommendation**: Migrate to a proper `PurchaseOrderReceipt` table:
```prisma
model PurchaseOrderReceipt {
  id              String   @id
  purchaseOrderId String
  lineItemId      String
  quantityReceived Int
  receivedDate     DateTime
  receivedBy       String
}
```

This provides:
- Atomic increment operations
- Full audit trail of each receipt
- Better query performance
- Easier reporting

This migration should be a separate focused task with its own database migration.

---
