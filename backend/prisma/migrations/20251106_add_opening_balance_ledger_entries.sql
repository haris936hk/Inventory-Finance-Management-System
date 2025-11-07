-- Migration: Add Opening Balance Ledger Entries for Existing Customers and Vendors
-- Date: 2025-11-06
-- Purpose: Create CustomerLedger and VendorLedger entries for existing customers/vendors
--          who have opening balances but no corresponding ledger entry

-- ====================
-- CUSTOMER OPENING BALANCE LEDGER ENTRIES
-- ====================

-- Add opening balance ledger entries for customers with opening balance but no ledger entry
INSERT INTO "CustomerLedger" (
  id,
  "customerId",
  "entryDate",
  description,
  debit,
  credit,
  balance,
  "createdAt"
)
SELECT
  gen_random_uuid() as id,
  c.id as "customerId",
  c."createdAt" as "entryDate",
  'Opening Balance' as description,
  CASE
    WHEN c."openingBalance" > 0 THEN c."openingBalance"
    ELSE 0
  END as debit,
  CASE
    WHEN c."openingBalance" < 0 THEN ABS(c."openingBalance")
    ELSE 0
  END as credit,
  c."openingBalance" as balance,
  NOW() as "createdAt"
FROM "Customer" c
WHERE c."openingBalance" != 0
  AND c."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "CustomerLedger" cl
    WHERE cl."customerId" = c.id
    AND cl.description = 'Opening Balance'
  );

-- ====================
-- VENDOR OPENING BALANCE LEDGER ENTRIES
-- ====================

-- Add opening balance ledger entries for vendors with opening balance but no ledger entry
INSERT INTO "VendorLedger" (
  id,
  "vendorId",
  "entryDate",
  description,
  debit,
  credit,
  balance,
  "createdAt"
)
SELECT
  gen_random_uuid() as id,
  v.id as "vendorId",
  v."createdAt" as "entryDate",
  'Opening Balance' as description,
  CASE
    WHEN v."openingBalance" > 0 THEN v."openingBalance"
    ELSE 0
  END as debit,
  CASE
    WHEN v."openingBalance" < 0 THEN ABS(v."openingBalance")
    ELSE 0
  END as credit,
  v."openingBalance" as balance,
  NOW() as "createdAt"
FROM "Vendor" v
WHERE v."openingBalance" != 0
  AND v."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "VendorLedger" vl
    WHERE vl."vendorId" = v.id
    AND vl.description = 'Opening Balance'
  );

-- ====================
-- VERIFICATION QUERIES
-- ====================

-- Verify customer opening balance entries created
-- Uncomment to run verification:
-- SELECT
--   c.name as customer_name,
--   c."openingBalance" as customer_opening_balance,
--   cl.description as ledger_description,
--   cl.debit as ledger_debit,
--   cl.credit as ledger_credit,
--   cl.balance as ledger_balance
-- FROM "Customer" c
-- LEFT JOIN "CustomerLedger" cl ON c.id = cl."customerId" AND cl.description = 'Opening Balance'
-- WHERE c."openingBalance" != 0 AND c."deletedAt" IS NULL
-- ORDER BY c.name;

-- Verify vendor opening balance entries created
-- Uncomment to run verification:
-- SELECT
--   v.name as vendor_name,
--   v."openingBalance" as vendor_opening_balance,
--   vl.description as ledger_description,
--   vl.debit as ledger_debit,
--   vl.credit as ledger_credit,
--   vl.balance as ledger_balance
-- FROM "Vendor" v
-- LEFT JOIN "VendorLedger" vl ON v.id = vl."vendorId" AND vl.description = 'Opening Balance'
-- WHERE v."openingBalance" != 0 AND v."deletedAt" IS NULL
-- ORDER BY v.name;

-- ====================
-- EXECUTION NOTES
-- ====================

-- To run this migration:
-- 1. Connect to your database
-- 2. Execute this SQL file
-- 3. Run the verification queries to confirm entries were created
-- 4. Verify that:
--    - All customers/vendors with opening balances have ledger entries
--    - Ledger entry balances match opening balances
--    - No duplicate opening balance entries exist

-- Safety:
-- - This migration is idempotent (can be run multiple times safely)
-- - The NOT EXISTS clause prevents duplicate entries
-- - Only affects customers/vendors with non-zero opening balances
-- - Does not modify existing ledger entries
