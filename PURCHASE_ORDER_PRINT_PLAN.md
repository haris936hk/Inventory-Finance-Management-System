# Purchase Order Print Template Implementation Plan

## Project Overview
Create a professional, print-ready Purchase Order template for Samhan company that matches the provided PO.pdf design with dynamic data from the system.

---

## Requirements Gathered

### Company Information Source
- ✅ Pull from **General Settings** (`/app/settings`)
- ✅ Add FBR Registration field to settings
- ✅ Company details: Name, Address, Email, Phone, FBR#

### Design Decisions
- ✅ **Remove "Ship To" section** - Not needed in the system
- ✅ **Fixed Payment Terms** - "All general requests regarding payment must be addressed to [company email from settings]"
- ✅ **No custom delivery date field** - Use existing orderDate from PO
- ✅ **Vendor replaces Supplier** - Use vendor information from database
- ✅ **Browser Print** - Use window.print() with CSS styling

---

## Implementation Plan

### 1. Update General Settings Schema

**Backend Changes:**

**File:** `backend/src/services/settingsService.js`
- Add `companyFBR` field to `DEFAULT_SETTINGS.general`
- Update validation to allow optional FBR field

```javascript
general: {
  companyName: 'IMS System',
  companyAddress: '',
  companyPhone: '',
  companyEmail: '',
  companyFBR: '',        // NEW FIELD
  language: 'en'
}
```

**Frontend Changes:**

**File:** `frontend/src/pages/settings/Settings.jsx`
- Add FBR Registration input field in General Settings tab
- Display in both edit and view modes

```jsx
<Form.Item
  label="FBR Registration No."
  name={['general', 'companyFBR']}
>
  <Input placeholder="Enter FBR registration number" />
</Form.Item>
```

---

### 2. Create Print Template Component

**New File:** `frontend/src/pages/finance/PurchaseOrderPrint.jsx`

**Component Structure:**
```
┌─────────────────────────────────────────────────────┐
│  SAMHAN (from settings)                             │
│  Address Line 1                                     │
│  City, Province, Postal Code                        │
│  Email | Phone                                      │
│  FBR Registration No.: XXXX-XXXXXXX-XX             │
├─────────────────────────────────────────────────────┤
│                  Purchase Order                     │
├──────────────────────┬──────────────────────────────┤
│ VENDOR               │          P.O.      1096      │
│ Vendor Name          │          DATE   03/09/2025   │
│ Address Line 1       │                              │
│ Address Line 2       │                              │
│ City, Province       │                              │
│ Pakistan             │                              │
└──────────────────────┴──────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ PRODUCT/SERVICE │ DESCRIPTION │ QTY │ RATE │ AMOUNT │
├─────────────────────────────────────────────────────┤
│ (Dynamic line items from PO)                        │
│ ...                                                 │
└─────────────────────────────────────────────────────┘

Payment Terms:
All general requests regarding payment must be
addressed to [company email from settings]

                              SUBTOTAL    1,880,000.00
                              TAX           282,000.00
                              TOTAL    PKR 2,162,000.00

___________________________________
Approved By

___________________________________
Date

                                          Page 1 of 1
```

**Data Flow:**
1. Fetch Purchase Order by ID (with vendor, lineItems)
2. Fetch Company Settings (general.companyName, address, email, phone, FBR)
3. Render template with all dynamic data
4. Auto-trigger browser print dialog
5. Allow print or close window

---

### 3. Create Print Styles

**New File:** `frontend/src/pages/finance/PurchaseOrderPrint.css`

**Key Features:**
- A4 page size (210mm x 297mm)
- Clean professional borders and spacing
- Print-optimized CSS using `@media print`
- Hide browser elements (headers, footers, buttons)
- Black & white print-friendly
- Proper table formatting with borders
- Page break controls if needed

**CSS Structure:**
```css
/* Screen view */
.print-container {
  max-width: 210mm;
  margin: 20px auto;
  padding: 20px;
  background: white;
}

/* Print view */
@media print {
  @page {
    size: A4;
    margin: 15mm;
  }

  .print-container {
    margin: 0;
    padding: 0;
  }

  .no-print {
    display: none !important;
  }
}
```

---

### 4. Update Routing

**File:** `frontend/src/App.jsx` (or main routing file)

Add new route for print view:
```jsx
<Route
  path="/app/finance/purchase-orders/:id/print"
  element={<PurchaseOrderPrint />}
/>
```

---

### 5. Wire Print Buttons

**File:** `frontend/src/pages/finance/PurchaseOrders.jsx`

**Update:** Line 353 (Print menu item)
```javascript
// FROM:
onClick: () => message.info('Print functionality coming soon')

// TO:
onClick: () => window.open(`/app/finance/purchase-orders/${record.id}/print`, '_blank')
```

**File:** `frontend/src/pages/finance/PurchaseOrderDetails.jsx`

Add or update Print button to use same logic:
```javascript
<Button
  icon={<PrinterOutlined />}
  onClick={() => window.open(`/app/finance/purchase-orders/${id}/print`, '_blank')}
>
  Print
</Button>
```

---

## Technical Details

### Data Models Used

**PurchaseOrder:**
- `poNumber` - PO number
- `orderDate` - Order date
- `expectedDate` - Expected delivery date (optional)
- `subtotal` - Subtotal amount
- `taxAmount` - Tax amount
- `total` - Total amount
- `vendor` - Vendor relation
- `lineItems` - Line items relation

**Vendor:**
- `name` - Vendor name
- `code` - Vendor code
- `address` - Full address
- `phone` - Contact phone
- `email` - Contact email
- `contactPerson` - Contact person name

**PurchaseOrderItem (lineItems):**
- `description` - Product/Service description
- `quantity` - Quantity
- `unitPrice` - Unit price/rate
- `totalPrice` - Line total amount
- `specifications` - Product specs (JSON)
- `notes` - Additional notes

**SystemSettings (general):**
- `companyName` - Samhan company name
- `companyAddress` - Company address
- `companyEmail` - Company email
- `companyPhone` - Company phone
- `companyFBR` - FBR registration number (NEW)

---

## Print Functionality Flow

```
User clicks Print button
    ↓
Open new window: /app/finance/purchase-orders/{id}/print
    ↓
Load PurchaseOrderPrint component
    ↓
Fetch PO data + Company settings
    ↓
Render print template with data
    ↓
Auto-trigger: window.print()
    ↓
User prints or cancels
    ↓
Close window (optional)
```

---

## Testing Checklist

- [ ] Settings page displays FBR field correctly
- [ ] FBR field saves and loads from database
- [ ] Print template fetches PO data correctly
- [ ] Print template fetches company settings correctly
- [ ] All dynamic fields populate with real data
- [ ] Vendor information displays correctly
- [ ] Line items table renders properly
- [ ] Financial totals calculate correctly (PKR format)
- [ ] Payment terms show company email
- [ ] Print dialog opens automatically
- [ ] Print preview shows clean layout
- [ ] Print output matches design expectations
- [ ] Works with different PO data sets
- [ ] Page breaks work correctly for multi-page POs

---

## Future Enhancements (Optional)

1. **Company Logo** - Add logo upload to settings and display in print header
2. **PDF Generation** - Add PDF download option using library like jsPDF
3. **Email PO** - Send PO directly to vendor email
4. **Custom Templates** - Allow different print templates
5. **Digital Signature** - Add e-signature capability
6. **Print History** - Track when POs were printed

---

## Files to Create/Modify

### New Files:
1. ✅ `frontend/src/pages/finance/PurchaseOrderPrint.jsx` - Print template component
2. ✅ `frontend/src/pages/finance/PurchaseOrderPrint.css` - Print styles

### Files to Modify:
1. ✅ `backend/src/services/settingsService.js` - Add FBR field
2. ✅ `frontend/src/pages/settings/Settings.jsx` - Add FBR input
3. ✅ `frontend/src/pages/finance/PurchaseOrders.jsx` - Wire print button
4. ✅ `frontend/src/pages/finance/PurchaseOrderDetails.jsx` - Wire print button
5. ✅ `frontend/src/App.jsx` - Add print route

---

## Implementation Status

- [ ] Step 1: Update settings schema (backend + frontend)
- [ ] Step 2: Create PurchaseOrderPrint.jsx component
- [ ] Step 3: Create PurchaseOrderPrint.css styles
- [ ] Step 4: Add print route to App.jsx
- [ ] Step 5: Wire print buttons in PurchaseOrders.jsx
- [ ] Step 6: Wire print button in PurchaseOrderDetails.jsx
- [ ] Step 7: Test with real data
- [ ] Step 8: Verify print output quality

---

**Ready for implementation approval from user.**
