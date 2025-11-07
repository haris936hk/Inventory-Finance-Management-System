-- AddOpeningBalanceLedgerEntries
-- This migration adds opening balance entries to CustomerLedger and VendorLedger
-- for existing customers and vendors that have opening balances but no ledger entries.

-- Add opening balance ledger entries for customers with opening balance but no ledger entry
-- This ensures all customers have a complete ledger history from day 1
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
  gen_random_uuid() AS id,
  c.id AS "customerId",
  c."createdAt" AS "entryDate",
  'Opening Balance' AS description,
  CASE
    WHEN c."openingBalance" > 0 THEN c."openingBalance"
    ELSE 0
  END AS debit,
  CASE
    WHEN c."openingBalance" < 0 THEN ABS(c."openingBalance")
    ELSE 0
  END AS credit,
  c."openingBalance" AS balance,
  NOW() AS "createdAt"
FROM "Customer" c
WHERE c."openingBalance" != 0
  AND c."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "CustomerLedger" cl
    WHERE cl."customerId" = c.id
    AND cl.description = 'Opening Balance'
  );

-- Add opening balance ledger entries for vendors with opening balance but no ledger entry
-- This ensures all vendors have a complete ledger history from day 1
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
  gen_random_uuid() AS id,
  v.id AS "vendorId",
  v."createdAt" AS "entryDate",
  'Opening Balance' AS description,
  CASE
    WHEN v."openingBalance" > 0 THEN v."openingBalance"
    ELSE 0
  END AS debit,
  CASE
    WHEN v."openingBalance" < 0 THEN ABS(v."openingBalance")
    ELSE 0
  END AS credit,
  v."openingBalance" AS balance,
  NOW() AS "createdAt"
FROM "Vendor" v
WHERE v."openingBalance" != 0
  AND v."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "VendorLedger" vl
    WHERE vl."vendorId" = v.id
    AND vl.description = 'Opening Balance'
  );

-- Log the results
DO $$
DECLARE
  customer_count INTEGER;
  vendor_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO customer_count
  FROM "CustomerLedger"
  WHERE description = 'Opening Balance';

  SELECT COUNT(*) INTO vendor_count
  FROM "VendorLedger"
  WHERE description = 'Opening Balance';

  RAISE NOTICE 'Opening balance migration completed:';
  RAISE NOTICE '  - Customer opening balance entries: %', customer_count;
  RAISE NOTICE '  - Vendor opening balance entries: %', vendor_count;
END $$;
