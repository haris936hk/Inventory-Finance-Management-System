-- AlterTable: Remove unique constraint from serialNumber
-- Validation will be handled in backend code

-- Drop existing unique constraint on serialNumber
DROP INDEX IF EXISTS "Item_serialNumber_key";
