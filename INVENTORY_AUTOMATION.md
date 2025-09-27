# Inventory Management Automation System

## Overview

The inventory management system now follows proper business automation principles. Inventory status is automatically managed based on business events, while physical status is manually tracked for location purposes.

## Dual Status System

### 1. **Inventory Status (Automated Business Logic)**
- **Available**: Default state, item can be sold
- **Reserved**: Automatically set when invoice is created in Draft status
- **Sold**: Automatically set when invoice status changes to Sent/Paid
- **Delivered**: Automatically set when delivery process is completed

### 2. **Physical Status (Manual Location Tracking)**
- **In Store**: Item is in the store/warehouse
- **In Hand**: Item is with a staff member
- **In Lab**: Item is being tested/repaired
- **Handover**: Item is in transit/being transported

## Automation Workflows

### Invoice Creation Process
```
1. User creates invoice (Draft status)
   ↓
2. System automatically:
   - Sets item.inventoryStatus = "Reserved"
   - Links item.customerId to invoice customer
   - Creates inventory movement record
   - Creates status history entry
```

### Invoice Processing
```
1. Invoice status changes from Draft → Sent/Paid
   ↓
2. System automatically:
   - Sets item.inventoryStatus = "Sold"
   - Updates item.sellingPrice from invoice
   - Sets item.outboundDate = invoice.paidDate
   - Creates inventory movement record
```

### Delivery Process
```
1. User clicks "Process Delivery" (only shown for Sold items)
   ↓
2. User fills handover details in DeliveryProcessModal
   ↓
3. System automatically:
   - Sets item.inventoryStatus = "Delivered"
   - Sets item.status = "Delivered" (physical status)
   - Saves handover details (handoverTo, handoverDate, etc.)
   - Creates inventory movement record
```

## Required Backend API Endpoints

### Status Update Endpoint
```
PUT /inventory/items/{serialNumber}/status
{
  "status": "In Hand",           // Physical status only
  "notes": "Taken for demo"      // Optional notes
}
```

### Delivery Process Endpoint
```
PUT /inventory/items/{serialNumber}/delivery
{
  "handoverTo": "John Doe",
  "handoverToPhone": "03001234567",
  "handoverToNIC": "1234567890123",
  "handoverDate": "2024-01-15T10:00:00Z",
  "handoverDetails": "Delivered via courier service",
  "deliveryMethod": "Courier Service"
}
```

### Automatic Status Changes (Backend Logic)
These should be triggered automatically by backend services:

**Invoice Creation:**
```javascript
// When invoice is created
await updateItemStatus(itemId, {
  inventoryStatus: 'Reserved',
  customerId: invoice.customerId,
  reservedAt: new Date(),
  reservedForType: 'Invoice',
  reservedForId: invoice.id
});
```

**Invoice Payment:**
```javascript
// When invoice is paid/sent
await updateItemStatus(itemId, {
  inventoryStatus: 'Sold',
  sellingPrice: invoiceItem.unitPrice,
  outboundDate: new Date()
});
```

## Frontend Components

### 1. UpdateStatusModal (Redesigned)
- **Focus**: Physical location tracking only
- **Inventory Status**: Read-only display with automation info
- **Customer Info**: Shows linked customer (read-only)
- **Manual Override**: Only allows Available → Reserved for manual holds

### 2. DeliveryProcessModal (New)
- **Purpose**: Complete delivery workflow
- **Triggers**: Only shown for items with inventoryStatus = "Sold"
- **Automation**: Automatically sets status to "Delivered" on completion

### 3. Enhanced ItemDetails
- Shows both status types clearly
- "Process Delivery" button for sold items
- Complete handover information display
- Movement history with automation tracking

## Business Rules

### Status Transitions
```
Available → Reserved (via invoice creation)
Reserved → Sold (via invoice payment)
Sold → Delivered (via delivery process)
```

### Manual Overrides
- Users can only manually reserve Available items
- Physical status can always be updated for location tracking
- Delivery process requires sold status

### Data Integrity
- Customer information comes from invoice relationship
- Selling price comes from invoice, not manual entry
- All status changes create audit trail entries
- Movement tracking records all automated changes

## Benefits

1. **Automation**: Reduces manual data entry and errors
2. **Consistency**: Status always reflects actual business state
3. **Audit Trail**: Complete tracking of all changes
4. **Efficiency**: Streamlined workflows for common operations
5. **Accuracy**: Customer data comes from invoice source of truth

## Implementation Notes

- Frontend validates business rules before API calls
- Backend enforces all automation logic
- Database triggers can ensure consistency
- Audit logging captures all automated changes
- Error handling preserves data integrity