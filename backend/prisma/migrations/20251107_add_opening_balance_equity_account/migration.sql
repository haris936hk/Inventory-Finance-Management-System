-- Add Opening Balance Equity Account
-- This account is used to track opening balances for customers and vendors
-- Account code 3900 is standard for "Opening Balance Equity" in accounting systems

DO $$
BEGIN
  -- Check if the account already exists
  IF NOT EXISTS (SELECT 1 FROM "Account" WHERE code = '3900') THEN
    -- EQUITY
    INSERT INTO "Account" (id, code, name, type, "openingBalance", "currentBalance", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid(), '3900', 'Opening Balance Equity', 'Equity', 0, 0, NOW(), NOW());

    RAISE NOTICE 'Created Opening Balance Equity account (3900)';
  ELSE
    RAISE NOTICE 'Opening Balance Equity account (3900) already exists';
  END IF;
END $$;
