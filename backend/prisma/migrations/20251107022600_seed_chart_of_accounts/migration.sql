-- Seed Chart of Accounts for Simplified Double-Entry System
-- This creates the minimal accounts needed for Balance Sheet and P&L reporting

-- Check if accounts already exist to make this migration idempotent
DO $$
BEGIN
  -- Only seed if Account table is empty or these specific accounts don't exist
  IF NOT EXISTS (SELECT 1 FROM "Account" WHERE code IN ('1100', '1200', '1300', '1210', '2000', '2100', '4000', '5000')) THEN

    -- ASSETS
    INSERT INTO "Account" (id, code, name, type, "openingBalance", "currentBalance", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid(), '1100', 'Cash', 'Asset', 0, 0, NOW(), NOW()),
      (gen_random_uuid(), '1200', 'Accounts Receivable', 'Asset', 0, 0, NOW(), NOW()),
      (gen_random_uuid(), '1300', 'Inventory', 'Asset', 0, 0, NOW(), NOW()),
      (gen_random_uuid(), '1210', 'Input Tax Receivable', 'Asset', 0, 0, NOW(), NOW());

    -- LIABILITIES
    INSERT INTO "Account" (id, code, name, type, "openingBalance", "currentBalance", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid(), '2000', 'Accounts Payable', 'Liability', 0, 0, NOW(), NOW()),
      (gen_random_uuid(), '2100', 'Sales Tax Payable', 'Liability', 0, 0, NOW(), NOW());

    -- INCOME
    INSERT INTO "Account" (id, code, name, type, "openingBalance", "currentBalance", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid(), '4000', 'Sales Revenue', 'Income', 0, 0, NOW(), NOW());

    -- EXPENSES
    INSERT INTO "Account" (id, code, name, type, "openingBalance", "currentBalance", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid(), '5000', 'Cost of Goods Sold', 'Expense', 0, 0, NOW(), NOW());

  END IF;
END $$;
