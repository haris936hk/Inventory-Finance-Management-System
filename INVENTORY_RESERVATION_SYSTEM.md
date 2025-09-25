# Comprehensive Inventory Reservation System

## Overview

This document describes the complete inventory reservation system implemented for the e-commerce application. The system manages the full lifecycle of inventory items from availability to delivery, with proper race condition protection and audit trails.

## System Architecture

### Core Components

1. **Database Schema** - Enhanced with inventory lifecycle tracking
2. **Business Logic Services** - State management and lifecycle handling
3. **API Endpoints** - REST APIs for reservation management
4. **Background Services** - Automated cleanup and monitoring
5. **Race Condition Protection** - Database transactions and locking

## Inventory State Machine

The system implements a strict state machine for inventory management:

```
Available → Reserved → Sold → Delivered
     ↑         ↓
     └─────────┘ (if invoice cancelled)
```

### Valid State Transitions

| From State | To State | Trigger Event |
|------------|----------|---------------|
| Available  | Reserved | Invoice Created |
| Available  | Sold     | Direct Sale |
| Reserved   | Available | Invoice Cancelled |
| Reserved   | Sold     | Invoice Fully Paid |
| Sold       | Delivered | Item Delivered |

### Invalid Transitions

The system prevents invalid transitions such as:
- Available → Delivered (must go through Reserved/Sold)
- Delivered → Any other state (terminal state)
- Reserved → Reserved (item already reserved)

## Database Schema

### Enhanced Item Model

```sql
model Item {
  -- Core fields
  id               String    @id @default(uuid())
  serialNumber     String    @unique
  condition        String    @default("New")

  -- Enhanced inventory status tracking
  inventoryStatus  String    @default("Available") -- Available, Reserved, Sold, Delivered
  status          String    -- Physical location status
  statusHistory   Json[]    -- Legacy status array

  -- Reservation tracking
  reservedAt       DateTime?
  reservedBy       String?   -- User ID
  reservedForType  String?   -- "Invoice", "Manual"
  reservedForId    String?   -- Invoice ID or other reference
  reservationExpiry DateTime? -- For temporary reservations

  -- Relationships
  statusTracking   InventoryStatusHistory[]
  invoiceItems     InvoiceItem[]
  -- ... other existing fields
}
```

### New Status History Model

```sql
model InventoryStatusHistory {
  id            String    @id @default(uuid())
  itemId        String
  item          Item      @relation(fields: [itemId], references: [id])

  fromStatus    String?   -- Previous status (NULL for initial)
  toStatus      String    -- New status
  changeReason  String    -- INVOICE_CREATED, INVOICE_CANCELLED, etc.
  referenceType String?   -- "Invoice", "Manual", etc.
  referenceId   String?   -- Invoice ID, etc.

  changedBy     String
  changedByUser User      @relation(fields: [changedBy], references: [id])
  changeDate    DateTime  @default(now())
  notes         String?

  createdAt     DateTime  @default(now())
}
```

## Business Logic Services

### 1. InventoryLifecycleService

Main service handling inventory state transitions with race condition protection.

#### Key Methods:

- `reserveItemsForInvoice(itemIds, invoiceId, userId)` - Reserve items for invoice
- `releaseItemsForInvoiceCancellation(invoiceId, userId)` - Release reserved items
- `markItemsAsSoldForInvoice(invoiceId, userId)` - Mark items as sold
- `markItemsAsDeliveredForInvoice(invoiceId, userId, deliveryInfo)` - Mark as delivered
- `cleanupExpiredReservations()` - Clean temporary reservations

#### Race Condition Protection:

```javascript
// Example: Atomic reservation with row-level locking
return await db.transaction(async (prisma) => {
  // Lock items for update (prevents concurrent modifications)
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    orderBy: { id: 'asc' } // Consistent ordering prevents deadlocks
  });

  // Validate all items are available
  const invalidItems = items.filter(item => item.inventoryStatus !== 'Available');
  if (invalidItems.length > 0) {
    throw new Error('Items not available for reservation');
  }

  // Atomic updates
  const updates = items.map(item =>
    prisma.item.update({
      where: { id: item.id },
      data: { inventoryStatus: 'Reserved', /* ... */ }
    })
  );

  await Promise.all(updates);
  // Record audit trail...
});
```

### 2. InvoiceLifecycleService

Handles automatic inventory management based on invoice lifecycle events.

#### Key Methods:

- `handleInvoiceCreated(invoiceId, userId)` - Auto-reserve items
- `handleInvoiceCancelled(invoiceId, userId)` - Auto-release items
- `handleInvoiceFullyPaid(invoiceId, userId)` - Auto-mark as sold
- `handleInvoiceDelivered(invoiceId, userId, deliveryInfo)` - Auto-mark as delivered
- `handleStatusChange(invoiceId, oldStatus, newStatus, userId)` - Generic handler

#### Integration with FinanceService:

```javascript
// In financeService.createInvoice()
const invoice = await prisma.invoice.create({ /* invoice data */ });

// Automatically reserve items for the invoice
await invoiceLifecycleService.handleInvoiceCreated(invoice.id, userId);
```

## API Endpoints

### Inventory Lifecycle Operations

```
POST /api/inventory/lifecycle/reserve
POST /api/inventory/lifecycle/release
POST /api/inventory/lifecycle/mark-sold
POST /api/inventory/lifecycle/mark-delivered
```

### Invoice Lifecycle Management

```
GET    /api/inventory/lifecycle/invoice/:invoiceId/status
POST   /api/inventory/lifecycle/invoice/:invoiceId/transition
POST   /api/inventory/lifecycle/invoice/:invoiceId/fix-inconsistencies
```

### Status Tracking & Monitoring

```
GET    /api/inventory/lifecycle/items/status
GET    /api/inventory/lifecycle/items/history
GET    /api/inventory/lifecycle/dashboard
DELETE /api/inventory/lifecycle/cleanup-expired
```

## Error Handling & Race Conditions

### Race Condition Prevention

1. **Database Transactions** - All state changes are atomic
2. **Row-Level Locking** - Items locked during status changes
3. **Consistent Ordering** - Prevents deadlocks in batch operations
4. **Optimistic Locking** - Version-based conflict detection where needed

### Error Recovery

1. **Automatic Retries** - Transient failures retry with exponential backoff
2. **Compensation Actions** - Failed operations trigger rollback procedures
3. **Inconsistency Detection** - Background jobs identify and alert on issues
4. **Manual Fix Tools** - Admin endpoints to resolve edge cases

### Example Error Handling:

```javascript
async reserveItemsForInvoice(itemIds, invoiceId, userId) {
  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      return await this._performReservation(itemIds, invoiceId, userId);
    } catch (error) {
      if (this._isRetryableError(error) && attempt < MAX_RETRIES - 1) {
        attempt++;
        await this._delay(Math.pow(2, attempt) * 1000); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
}
```

## Invoice Lifecycle Integration

### Automatic State Management

The system automatically manages inventory based on invoice status changes:

1. **Invoice Created** → Reserve Items
2. **Invoice Cancelled** → Release Items (back to Available)
3. **Invoice Fully Paid** → Mark Items as Sold
4. **Invoice Delivered** → Mark Items as Delivered

### Example Flow:

```javascript
// 1. Invoice created with items [A, B, C]
invoice = await financeService.createInvoice(invoiceData, userId);
// → Items A, B, C automatically reserved

// 2. Invoice cancelled
await financeService.updateInvoiceStatus(invoiceId, 'Cancelled', userId);
// → Items A, B, C released back to Available

// Alternative flow:
// 2. Invoice paid in full
await financeService.recordPayment(paymentData, userId);
// → Items A, B, C marked as Sold

// 3. Invoice delivered
await financeService.updateInvoiceStatus(invoiceId, 'Delivered', userId);
// → Items A, B, C marked as Delivered
```

## Background Services

### BackgroundCleanupService

Automated maintenance tasks:

1. **Expired Reservations Cleanup** - Every 15 minutes
2. **Consistency Checks** - Every hour
3. **Daily Reports** - Every morning at 6 AM

### Consistency Monitoring

The system automatically detects:
- Orphaned reservations (reserved items without valid invoice)
- Items marked as sold but not in any invoice
- Status inconsistencies between inventory and physical location
- Long-running reservations that may need attention

## Usage Examples

### Basic Reservation Flow

```javascript
// 1. Create invoice with items
const invoice = await financeService.createInvoice({
  customerId: 'customer-123',
  items: [
    { itemId: 'item-1', unitPrice: 100 },
    { itemId: 'item-2', unitPrice: 200 }
  ],
  sessionId: 'temp-session-456' // From temporary reservation
}, userId);
// Items are automatically reserved permanently for this invoice

// 2. Customer pays
await financeService.recordPayment({
  invoiceId: invoice.id,
  amount: 300,
  method: 'Cash'
}, userId);
// Items automatically marked as Sold

// 3. Items delivered
await financeService.updateInvoiceStatus(invoice.id, 'Delivered', userId);
// Items automatically marked as Delivered
```

### Manual Inventory Operations

```javascript
// Reserve specific items manually
await inventoryLifecycleService.reserveItemsForInvoice(
  ['item-1', 'item-2'],
  'invoice-123',
  'user-456'
);

// Check invoice inventory status
const status = await invoiceLifecycleService.getInvoiceLifecycleStatus('invoice-123');

// Fix inconsistencies
await invoiceLifecycleService.fixInventoryInconsistencies('invoice-123', 'admin-user');
```

### Monitoring & Reporting

```javascript
// Get dashboard data
const dashboard = await inventoryLifecycleController.getLifecycleDashboard();

// Get item status history
const history = await inventoryLifecycleService.getItemStatusHistory(['item-1', 'item-2']);

// Manual cleanup
const cleanupResult = await backgroundCleanupService.runCleanupNow();
```

## Testing Strategy

### Unit Tests

1. **State Transition Logic** - Test all valid/invalid transitions
2. **Race Condition Scenarios** - Concurrent reservation attempts
3. **Error Recovery** - Various failure modes and recovery
4. **Edge Cases** - Boundary conditions and corner cases

### Integration Tests

1. **Full Invoice Lifecycle** - End-to-end reservation flow
2. **Payment Integration** - Status changes on payment
3. **Cleanup Jobs** - Background service functionality
4. **API Endpoints** - Complete REST API coverage

### Load Testing

1. **Concurrent Reservations** - Multiple users reserving same items
2. **High Volume Operations** - Bulk status changes
3. **Database Performance** - Query optimization under load
4. **Background Job Performance** - Cleanup efficiency at scale

## Deployment Considerations

### Database Migration

1. Run migration script: `001_add_inventory_lifecycle_system.sql`
2. Verify existing data is properly migrated
3. Test state transitions with sample data
4. Enable background cleanup service

### Performance Optimization

1. **Database Indexes** - Proper indexing on status fields
2. **Query Optimization** - Efficient status change queries
3. **Connection Pooling** - Handle concurrent transactions
4. **Monitoring** - Track performance metrics

### Monitoring & Alerts

1. **Status Change Metrics** - Track reservation/sale rates
2. **Inconsistency Alerts** - Notify on system inconsistencies
3. **Performance Monitoring** - Database and API performance
4. **Error Tracking** - Failed operations and recovery

## Security Considerations

1. **Permission Checks** - Proper authorization for all operations
2. **Audit Trail** - Complete history of all status changes
3. **Data Integrity** - Prevent unauthorized state modifications
4. **Access Control** - Role-based permissions for admin operations

## Future Enhancements

1. **Multi-warehouse Support** - Extend to multiple locations
2. **Reservation Priorities** - VIP customer reservation preferences
3. **Automated Reordering** - Trigger purchase orders on low stock
4. **Advanced Analytics** - Machine learning for demand forecasting
5. **Real-time Updates** - WebSocket-based status notifications

---

This comprehensive inventory reservation system provides robust, scalable, and reliable inventory management for e-commerce operations while maintaining data consistency and providing complete audit trails.