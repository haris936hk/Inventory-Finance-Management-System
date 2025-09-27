-- Migration to convert currency fields from decimal to whole numbers
-- This migration multiplies all decimal currency values by 100 to convert to whole rupees
-- Run this BEFORE applying the schema changes

BEGIN TRANSACTION;

-- Convert PurchaseOrder currency fields (multiply by 100 to convert decimals to whole numbers)
UPDATE "PurchaseOrder" SET
  "subtotal" = "subtotal" * 100,
  "taxAmount" = "taxAmount" * 100,
  "total" = "total" * 100;

-- Convert PurchaseOrderItem currency fields
UPDATE "PurchaseOrderItem" SET
  "totalPrice" = "totalPrice" * 100;

-- Convert Invoice currency fields
UPDATE "Invoice" SET
  "subtotal" = "subtotal" * 100,
  "taxAmount" = "taxAmount" * 100,
  "total" = "total" * 100;

-- Convert InvoiceItem currency fields
UPDATE "InvoiceItem" SET
  "subtotal" = "subtotal" * 100,
  "total" = "total" * 100;

-- Convert Bill currency fields
UPDATE "Bill" SET
  "subtotal" = "subtotal" * 100,
  "total" = "total" * 100;

-- Convert Installment currency fields
UPDATE "Installment" SET
  "total" = "total" * 100;

-- Convert Payment currency fields
UPDATE "Payment" SET
  "amount" = "amount" * 100;

-- Convert VendorPayment currency fields
UPDATE "VendorPayment" SET
  "amount" = "amount" * 100;

-- Convert InstallmentPayment currency fields
UPDATE "InstallmentPayment" SET
  "totalAmount" = "totalAmount" * 100,
  "amount" = "amount" * 100;

-- Convert CustomerLedger balance fields
UPDATE "CustomerLedger" SET
  "balance" = "balance" * 100;

-- Convert VendorLedger balance fields
UPDATE "VendorLedger" SET
  "balance" = "balance" * 100;

-- Convert Customer totals
UPDATE "Customer" SET
  "totalSales" = "totalSales" * 100,
  "totalPurchases" = "totalPurchases" * 100;

COMMIT;

-- Note: After running this migration, apply the Prisma schema changes to update column types
-- The schema changes will remove the decimal places while preserving the whole number values