-- Add composite index for faster customer invoice queries in RecordPayment page
-- This index optimizes queries like: SELECT * FROM Invoice WHERE customerId = ? AND status IN ('Sent', 'Partial', 'Overdue')

CREATE INDEX IF NOT EXISTS "Invoice_customerId_status_idx"
ON "Invoice"("customerId", "status")
WHERE "deletedAt" IS NULL;

-- Verify index was created
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'Invoice'
  AND indexname = 'Invoice_customerId_status_idx';
