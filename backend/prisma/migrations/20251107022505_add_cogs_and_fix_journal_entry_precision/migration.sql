-- Add COGS (Cost of Goods Sold) field to Invoice table
ALTER TABLE "Invoice" ADD COLUMN "cogs" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- Update JournalEntry precision from DECIMAL(10,2) to DECIMAL(18,4)
ALTER TABLE "JournalEntry" ALTER COLUMN "debit" TYPE DECIMAL(18,4);
ALTER TABLE "JournalEntry" ALTER COLUMN "credit" TYPE DECIMAL(18,4);
