# Vendor Bill Print Template Implementation Plan

## Project Overview
Create a professional, print-ready Vendor Bill template for Samhan company that provides a standardized bill format with dynamic data from the system, following the same design principles as the Purchase Order template.

---

## Requirements Gathered

### Company Information Source
- ✅ Pull from **General Settings** (`/app/settings`)
- ✅ Use existing FBR Registration field from settings (if implemented from PO plan)
- ✅ Company details: Name, Address, Email, Phone, FBR#

### Design Decisions
- ✅ **Bill-to Section** - Display vendor information as the bill recipient
- ✅ **Fixed Payment Terms** - "Payment due within 30 days. All payment inquiries should be directed to [company email from settings]"
- ✅ **Use Bill Date and Due Date** - Display both dates from vendor bill data
- ✅ **Purchase Order Reference** - Show linked PO number if available
- ✅ **Browser Print** - Use window.print() with CSS styling
- ✅ **Tax Calculation Display** - Show subtotal, tax amount, and total clearly

---

## Implementation Plan

### 1. Verify General Settings Schema

**Backend Verification:**

**File:** `backend/src/services/settingsService.js`
- Verify `companyFBR` field exists in `DEFAULT_SETTINGS.general`
- If not present, add it following the PO implementation

```javascript
general: {
  companyName: 'IMS System',
  companyAddress: '',
  companyPhone: '',
  companyEmail: '',
  companyFBR: '',        // Required for vendor bills
  language: 'en'
}
```

**Frontend Verification:**

**File:** `frontend/src/pages/settings/Settings.jsx`
- Verify FBR Registration input field exists in General Settings tab
- If not present, add it following the PO implementation

---

### 2. Create Print Template Component

**New File:** `frontend/src/pages/finance/VendorBillPrint.jsx`

**Component Structure:**
```
┌─────────────────────────────────────────────────────┐
│  SAMHAN (from settings)                             │
│  Address Line 1                                     │
│  City, Province, Postal Code                        │
│  Email | Phone                                      │
│  FBR Registration No.: XXXX-XXXXXXX-XX             │
├─────────────────────────────────────────────────────┤
│                    Vendor Bill                      │
├──────────────────────┬──────────────────────────────┤
│ BILL TO              │       BILL #      VB-001     │
│ Vendor Name          │       DATE     03/09/2025    │
│ Address Line 1       │       DUE DATE 03/10/2025    │
│ Address Line 2       │       P.O. REF    PO-1096    │
│ City, Province       │                              │
│ Pakistan             │                              │
└──────────────────────┴──────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ DESCRIPTION         │ QTY │ RATE      │    AMOUNT   │
├─────────────────────────────────────────────────────┤
│ (Dynamic line items from linked PO or manual entry) │
│ ...                                                 │
└─────────────────────────────────────────────────────┘

Payment Terms:
Payment due within 30 days. All payment inquiries 
should be directed to [company email from settings]

                              SUBTOTAL    1,880,000.00
                              TAX           282,000.00
                              TOTAL    PKR 2,162,000.00

___________________________________
Authorized Signature

___________________________________
Date

                                          Page 1 of 1
```

**Data Flow:**
1. Fetch Vendor Bill by ID (with vendor, purchaseOrder if linked)
2. Fetch Company Settings (general.companyName, address, email, phone, FBR)
3. If linked to PO, fetch PO line items; otherwise use bill description
4. Render template with all dynamic data
5. Auto-trigger browser print dialog
6. Allow print or close window

---

### 3. Create Print Styles

**New File:** `frontend/src/pages/finance/VendorBillPrint.css`

**Key Features:**
- A4 page size (210mm x 297mm)
- Clean professional borders and spacing
- Print-optimized CSS using `@media print`
- Hide browser elements (headers, footers, buttons)
- Black & white print-friendly
- Proper table formatting with borders
- Page break controls if needed
- Consistent styling with PurchaseOrderPrint.css

**CSS Structure:**
```css
/* Screen view */
.bill-print-container {
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

  .bill-print-container {
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

Add new route for vendor bill print view:
```jsx
<Route
  path="/app/finance/vendor-bills/:id/print"
  element={<VendorBillPrint />}
/>
```

---

### 5. Wire Print Buttons

**File:** `frontend/src/pages/finance/VendorBills.jsx`

**Update:** Line 449 (Print menu item)
```javascript
// FROM:
onClick: () => message.info('Print functionality coming soon')

// TO:
onClick: () => window.open(`/app/finance/vendor-bills/${record.id}/print`, '_blank')
```

**File:** `frontend/src/pages/finance/VendorBillDetails.jsx`

**Update:** Line 307 (Print button)
```javascript
// FROM:
onClick={() => message.info('Print functionality coming soon')}

// TO:
onClick={() => window.open(`/app/finance/vendor-bills/${id}/print`, '_blank')}
```

---

## Technical Details

### Data Models Used

**Bill (Vendor Bill):**
- `billNumber` - Bill number (e.g., VB-001)
- `billDate` - Bill date
- `dueDate` - Due date for payment
- `subtotal` - Subtotal amount
- `taxAmount` - Tax amount
- `total` - Total amount
- `description` - Bill description/notes
- `vendor` - Vendor relation
- `purchaseOrder` - Optional PO relation

**Vendor:**
- `name` - Vendor name
- `code` - Vendor code
- `address` - Full address
- `phone` - Contact phone
- `email` - Contact email
- `contactPerson` - Contact person name

**PurchaseOrder (if linked):**
- `poNumber` - PO number for reference
- `lineItems` - Line items relation (for detailed breakdown)

**PurchaseOrderItem (if PO linked):**
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
- `companyFBR` - FBR registration number

---

## Print Functionality Flow

```
User clicks Print button
    ↓
Open new window: /app/finance/vendor-bills/{id}/print
    ↓
Load VendorBillPrint component
    ↓
Fetch Bill data + Company settings
    ↓
If PO linked: Fetch PO line items
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

## Bill Content Logic

### When Purchase Order is Linked:
- Display PO number in header
- Show detailed line items from PO
- Use PO subtotal, tax, and total amounts
- Include PO line item descriptions, quantities, and rates

### When No Purchase Order is Linked:
- Show "Manual Entry" or no PO reference
- Display bill description as single line item
- Use bill's subtotal, tax, and total amounts
- Show description from bill.description field

### Common Elements:
- Company header information
- Vendor billing information
- Bill number, dates
- Payment terms
- Signature section
- Page numbering

---

## Testing Checklist

- [ ] Print template fetches vendor bill data correctly
- [ ] Print template fetches company settings correctly
- [ ] All dynamic fields populate with real data
- [ ] Vendor information displays correctly
- [ ] Bill with linked PO shows PO line items
- [ ] Bill without PO shows description properly
- [ ] Financial totals calculate correctly (PKR format)
- [ ] Payment terms show company email
- [ ] Print dialog opens automatically
- [ ] Print preview shows clean layout
- [ ] Print output matches design expectations
- [ ] Works with different vendor bill data sets
- [ ] Page breaks work correctly for multi-item bills
- [ ] Print buttons work from both VendorBills and VendorBillDetails pages

---

## Future Enhancements (Optional)

1. **Company Logo** - Add logo upload to settings and display in print header
2. **PDF Generation** - Add PDF download option using library like jsPDF
3. **Email Bill** - Send bill directly to vendor email
4. **Custom Templates** - Allow different print templates
5. **Digital Signature** - Add e-signature capability
6. **Print History** - Track when bills were printed
7. **Multi-Currency Support** - Handle different currencies in bills
8. **Payment Instructions** - Add custom payment instructions per vendor

---

## Files to Create/Modify

### New Files:
1. ✅ `frontend/src/pages/finance/VendorBillPrint.jsx` - Print template component
2. ✅ `frontend/src/pages/finance/VendorBillPrint.css` - Print styles

### Files to Modify:
1. ✅ `backend/src/services/settingsService.js` - Verify FBR field exists
2. ✅ `frontend/src/pages/settings/Settings.jsx` - Verify FBR input exists
3. ✅ `frontend/src/pages/finance/VendorBills.jsx` - Wire print button (line 449)
4. ✅ `frontend/src/pages/finance/VendorBillDetails.jsx` - Wire print button (line 307)
5. ✅ `frontend/src/App.jsx` - Add vendor bill print route

---

## Implementation Status

- [ ] Step 1: Verify settings schema includes FBR field
- [ ] Step 2: Create VendorBillPrint.jsx component
- [ ] Step 3: Create VendorBillPrint.css styles
- [ ] Step 4: Add print route to App.jsx
- [ ] Step 5: Wire print button in VendorBills.jsx
- [ ] Step 6: Wire print button in VendorBillDetails.jsx
- [ ] Step 7: Test with bills linked to POs
- [ ] Step 8: Test with standalone bills
- [ ] Step 9: Verify print output quality

---

## Key Differences from Purchase Order Print Plan

1. **Document Type**: Vendor Bill instead of Purchase Order
2. **Direction**: Bill TO vendor (we're billing them) vs PO FROM vendor (we're ordering from them)
3. **Content Flexibility**: Bills can be linked to POs (detailed) or standalone (description-based)
4. **Payment Terms**: Different wording focused on payment collection vs payment processing
5. **Data Source**: Uses Bill model as primary source, with optional PO reference
6. **Line Items**: Either from linked PO or from bill description field
7. **Financial Flow**: Represents money owed TO us vs money we owe

---

**Ready for implementation approval and execution.**