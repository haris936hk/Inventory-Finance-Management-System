-- Fix InvoiceItem decimal precision to match Invoice model
-- Change from DECIMAL(10,2) to DECIMAL(18,4) for consistency and prevent rounding errors

-- Update unitPrice column precision
ALTER TABLE "InvoiceItem" ALTER COLUMN "unitPrice" TYPE DECIMAL(18,4);

-- Update total column precision
ALTER TABLE "InvoiceItem" ALTER COLUMN "total" TYPE DECIMAL(18,4);
