# Vendors Page Updates - Lifecycle Integration

## Overview

Updated the Vendors page detail drawer to properly display the new lifecycle management features including cancelled bills, voided payments, and enhanced PO status tracking.

---

## File Modified

**`frontend/src/pages/inventory/Vendors.jsx`**

---

## Changes Made

### 1. **Purchase Orders Tab** (Lines 357-399)

#### ✅ Updates:
- **Added 'Billed Amount' column** to show how much has been billed against each PO
- **Updated status color mapping** to include all new statuses:
  - `Draft` → Gray (default)
  - `Sent` → Blue
  - `Partial` → Orange (NEW)
  - `Completed` → Green
  - `Cancelled` → Red

#### 📝 Code Changes:

**Added Billed Column:**
```javascript
{
  title: 'Billed',
  dataIndex: 'billedAmount',
  key: 'billedAmount',
  render: (amount) => formatPKR(parseFloat(amount || 0))
}
```

**Updated Status Colors:**
```javascript
{
  title: 'Status',
  dataIndex: 'status',
  key: 'status',
  render: (status) => (
    <Tag color={
      status === 'Draft' ? 'default' :
      status === 'Sent' ? 'blue' :
      status === 'Partial' ? 'orange' :
      status === 'Completed' ? 'green' :
      status === 'Cancelled' ? 'red' : 'default'
    }>
      {status}
    </Tag>
  )
}
```

---

### 2. **Bills Tab** (Lines 401-465)

#### ✅ Updates:
- **Show cancelled bills** with visual indicators
- **Added 'Paid Amount' column** to track payment progress
- **Visual styling for cancelled bills**:
  - Bill number shown in gray
  - "CANCELLED" tag displayed
  - Amount shown with strikethrough
- **Status overrides** - Cancelled bills show "Cancelled" tag regardless of payment status

#### 📝 Code Changes:

**Bill Number with Cancel Indicator:**
```javascript
{
  title: 'Bill #',
  dataIndex: 'billNumber',
  key: 'billNumber',
  render: (text, record) => (
    <Space direction="vertical" size="small">
      <span style={{ color: record.cancelledAt ? '#999' : 'inherit' }}>
        {text}
      </span>
      {record.cancelledAt && <Tag color="red" size="small">CANCELLED</Tag>}
    </Space>
  )
}
```

**Total with Strikethrough:**
```javascript
{
  title: 'Total',
  dataIndex: 'total',
  key: 'total',
  render: (amount, record) => (
    <span style={{
      color: record.cancelledAt ? '#999' : 'inherit',
      textDecoration: record.cancelledAt ? 'line-through' : 'none'
    }}>
      {formatPKR(parseFloat(amount))}
    </span>
  )
}
```

**Added Paid Column:**
```javascript
{
  title: 'Paid',
  dataIndex: 'paidAmount',
  key: 'paidAmount',
  render: (amount) => formatPKR(parseFloat(amount || 0))
}
```

**Status with Cancel Override:**
```javascript
{
  title: 'Status',
  dataIndex: 'status',
  key: 'status',
  render: (status, record) => {
    if (record.cancelledAt) {
      return <Tag color="red">Cancelled</Tag>;
    }
    return (
      <Tag color={
        status === 'Paid' ? 'green' :
        status === 'Partial' ? 'orange' :
        status === 'Unpaid' ? 'blue' : 'default'
      }>
        {status}
      </Tag>
    );
  }
}
```

---

### 3. **Payments Tab** (Lines 467-516)

#### ✅ Updates:
- **Show voided payments** with visual indicators
- **Visual styling for voided payments**:
  - Payment number shown in gray
  - "VOIDED" tag displayed
  - Amount shown with strikethrough
  - Payment method shown in gray

#### 📝 Code Changes:

**Payment Number with Void Indicator:**
```javascript
{
  title: 'Payment #',
  dataIndex: 'paymentNumber',
  key: 'paymentNumber',
  render: (text, record) => (
    <Space direction="vertical" size="small">
      <span style={{ color: record.voidedAt ? '#999' : 'inherit' }}>
        {text}
      </span>
      {record.voidedAt && <Tag color="red" size="small">VOIDED</Tag>}
    </Space>
  )
}
```

**Amount with Strikethrough:**
```javascript
{
  title: 'Amount',
  dataIndex: 'amount',
  key: 'amount',
  render: (amount, record) => (
    <span style={{
      color: record.voidedAt ? '#999' : 'inherit',
      textDecoration: record.voidedAt ? 'line-through' : 'none'
    }}>
      {formatPKR(parseFloat(amount))}
    </span>
  )
}
```

**Method with Void Styling:**
```javascript
{
  title: 'Method',
  dataIndex: 'method',
  key: 'method',
  render: (method, record) => (
    <span style={{ color: record.voidedAt ? '#999' : 'inherit' }}>
      {method}
    </span>
  )
}
```

---

## Visual Improvements

### **Consistent Visual Language**

| State | Indicator | Text Color | Text Style | Tag |
|-------|-----------|------------|------------|-----|
| **Normal Bill** | - | Black | Normal | Status color |
| **Cancelled Bill** | CANCELLED tag | Gray (#999) | Strikethrough on amount | Red |
| **Normal Payment** | - | Black | Normal | - |
| **Voided Payment** | VOIDED tag | Gray (#999) | Strikethrough on amount | Red |

### **Status Color Consistency**

**Purchase Orders:**
- Draft → Gray
- Sent → Blue
- Partial → Orange
- Completed → Green
- Cancelled → Red

**Bills:**
- Unpaid → Blue
- Partial → Orange
- Paid → Green
- Cancelled → Red (override)

---

## Data Fields Expected from Backend

### **Purchase Order:**
```javascript
{
  id: string,
  poNumber: string,
  orderDate: Date,
  total: Decimal,
  billedAmount: Decimal,  // NEW - tracks how much has been billed
  status: 'Draft' | 'Sent' | 'Partial' | 'Completed' | 'Cancelled'
}
```

### **Bill:**
```javascript
{
  id: string,
  billNumber: string,
  billDate: Date,
  total: Decimal,
  paidAmount: Decimal,
  status: 'Unpaid' | 'Partial' | 'Paid',
  cancelledAt: Date | null,  // NEW - soft-cancel timestamp
  cancelReason: string | null  // NEW - cancellation reason
}
```

### **Vendor Payment:**
```javascript
{
  id: string,
  paymentNumber: string,
  paymentDate: Date,
  amount: Decimal,
  method: string,
  voidedAt: Date | null,  // NEW - void timestamp
  voidReason: string | null  // NEW - void reason
}
```

---

## Backend Integration Points

The vendor detail view fetches data via:
```javascript
const response = await axios.get(`/inventory/vendors/${record.id}`);
```

This should return vendor data with expanded relationships:
```javascript
{
  id: string,
  name: string,
  // ... other vendor fields
  purchaseOrders: PurchaseOrder[],  // includes billedAmount
  bills: Bill[],  // includes cancelledAt, paidAmount
  payments: VendorPayment[],  // includes voidedAt
  _count: {
    purchaseOrders: number,
    items: number
  }
}
```

---

## Testing Checklist

### **Purchase Orders Tab**
- [ ] View vendor with Draft PO - should show gray tag
- [ ] View vendor with Sent PO - should show blue tag
- [ ] View vendor with Partial PO - should show orange tag
- [ ] View vendor with Completed PO - should show green tag
- [ ] Verify Billed column shows correct amounts
- [ ] Verify Billed column displays PKR 0.00 for unbilled POs

### **Bills Tab**
- [ ] View vendor with normal bill - should display normally
- [ ] View vendor with cancelled bill - should show:
  - Gray bill number
  - CANCELLED tag
  - Strikethrough on amount
  - Red "Cancelled" status tag
- [ ] View vendor with partially paid bill - should show paid amount
- [ ] Verify Paid column shows correct amounts

### **Payments Tab**
- [ ] View vendor with normal payment - should display normally
- [ ] View vendor with voided payment - should show:
  - Gray payment number
  - VOIDED tag
  - Strikethrough on amount
  - Gray payment method
- [ ] Verify all payment amounts are formatted correctly

---

## User Experience Benefits

### **At-a-Glance Status**
- ✅ Users can immediately see cancelled bills without clicking through
- ✅ Voided payments are clearly marked to avoid confusion
- ✅ PO billing progress visible with billedAmount column
- ✅ Consistent color coding across all tabs

### **Data Accuracy**
- ✅ Cancelled bills still visible for audit purposes
- ✅ Voided payments remain in history
- ✅ Strikethrough clearly indicates "not counted"
- ✅ Paid amounts tracked separately from totals

### **Workflow Clarity**
- ✅ Easy to see which POs are partially billed
- ✅ Clear view of vendor payment history including voids
- ✅ Bill status always accurate (cancelled override)

---

## Summary of Changes

| Component | Change | Lines Modified |
|-----------|--------|----------------|
| **PO Tab** | Added billedAmount column + updated status colors | 357-399 |
| **Bills Tab** | Added cancel indicators + paid column | 401-465 |
| **Payments Tab** | Added void indicators | 467-516 |

**Total Lines Changed**: ~160 lines
**New Columns Added**: 3 (Billed, Paid, visual indicators)
**Visual Indicators Added**: 2 (CANCELLED, VOIDED tags)

---

## Next Steps

1. **Test with Backend**
   - Ensure backend includes `billedAmount` in PO response
   - Ensure backend includes `cancelledAt` in bill response
   - Ensure backend includes `voidedAt` in payment response

2. **Optional Enhancements**
   - Add tooltip on CANCELLED tag showing cancellation reason
   - Add tooltip on VOIDED tag showing void reason
   - Add filter to show/hide cancelled bills
   - Add filter to show/hide voided payments

---

**Status**: ✅ **COMPLETE**

**Date**: 2025-10-01

**Compatibility**: Fully compatible with new lifecycle management backend
