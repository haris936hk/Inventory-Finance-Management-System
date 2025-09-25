-- ========== Migration: Add Inventory Lifecycle System ==========
-- This migration adds comprehensive inventory lifecycle management
-- to support the complete e-commerce reservation system

-- Add new fields to Item table for inventory status tracking
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "inventoryStatus" TEXT NOT NULL DEFAULT 'Available';
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "reservedAt" TIMESTAMP(3);
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "reservedBy" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "reservedForType" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "reservedForId" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "reservationExpiry" TIMESTAMP(3);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "Item_inventoryStatus_idx" ON "Item"("inventoryStatus");
CREATE INDEX IF NOT EXISTS "Item_reservedForId_idx" ON "Item"("reservedForId");
CREATE INDEX IF NOT EXISTS "Item_reservationExpiry_idx" ON "Item"("reservationExpiry");

-- Create InventoryStatusHistory table for audit trail
CREATE TABLE IF NOT EXISTS "InventoryStatusHistory" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "changeReason" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "changedBy" TEXT NOT NULL,
    "changeDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryStatusHistory_pkey" PRIMARY KEY ("id")
);

-- Add foreign key relationships
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryStatusHistory_itemId_fkey') THEN
        ALTER TABLE "InventoryStatusHistory" ADD CONSTRAINT "InventoryStatusHistory_itemId_fkey"
        FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryStatusHistory_changedBy_fkey') THEN
        ALTER TABLE "InventoryStatusHistory" ADD CONSTRAINT "InventoryStatusHistory_changedBy_fkey"
        FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- Add indexes for InventoryStatusHistory
CREATE INDEX IF NOT EXISTS "InventoryStatusHistory_itemId_idx" ON "InventoryStatusHistory"("itemId");
CREATE INDEX IF NOT EXISTS "InventoryStatusHistory_referenceType_referenceId_idx" ON "InventoryStatusHistory"("referenceType", "referenceId");
CREATE INDEX IF NOT EXISTS "InventoryStatusHistory_changeDate_idx" ON "InventoryStatusHistory"("changeDate");
CREATE INDEX IF NOT EXISTS "InventoryStatusHistory_toStatus_idx" ON "InventoryStatusHistory"("toStatus");

-- Update existing items to have proper inventory status based on current status
UPDATE "Item"
SET "inventoryStatus" = CASE
    WHEN "status" = 'Sold' THEN 'Sold'
    WHEN "status" = 'Delivered' THEN 'Delivered'
    ELSE 'Available'
END
WHERE "deletedAt" IS NULL AND "inventoryStatus" = 'Available';

-- Add delivery fields to Invoice table
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "deliveryDate" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "deliveredBy" TEXT;

-- Create ItemReservation table if it doesn't exist (for temporary reservations)
CREATE TABLE IF NOT EXISTS "ItemReservation" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "reservedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,

    CONSTRAINT "ItemReservation_pkey" PRIMARY KEY ("id")
);

-- Add foreign key relationships for ItemReservation
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItemReservation_itemId_fkey') THEN
        ALTER TABLE "ItemReservation" ADD CONSTRAINT "ItemReservation_itemId_fkey"
        FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItemReservation_reservedBy_fkey') THEN
        ALTER TABLE "ItemReservation" ADD CONSTRAINT "ItemReservation_reservedBy_fkey"
        FOREIGN KEY ("reservedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- Add indexes for ItemReservation
CREATE INDEX IF NOT EXISTS "ItemReservation_itemId_idx" ON "ItemReservation"("itemId");
CREATE INDEX IF NOT EXISTS "ItemReservation_sessionId_idx" ON "ItemReservation"("sessionId");
CREATE INDEX IF NOT EXISTS "ItemReservation_reservedBy_idx" ON "ItemReservation"("reservedBy");
CREATE INDEX IF NOT EXISTS "ItemReservation_expiresAt_idx" ON "ItemReservation"("expiresAt");

-- Create unique constraint for item-session combination
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItemReservation_itemId_sessionId_key') THEN
        ALTER TABLE "ItemReservation" ADD CONSTRAINT "ItemReservation_itemId_sessionId_key"
        UNIQUE ("itemId", "sessionId");
    END IF;
END $$;

-- Create a view for easy inventory status reporting
CREATE OR REPLACE VIEW "InventoryStatusReport" AS
SELECT
    i."id",
    i."serialNumber",
    i."inventoryStatus",
    i."status" as "physicalStatus",
    i."reservedAt",
    i."reservedForType",
    i."reservedForId",
    i."outboundDate",
    c."name" as "categoryName",
    m."name" as "modelName",
    comp."name" as "companyName",
    ru."fullName" as "reservedByUser",
    latest_change."changeDate" as "lastStatusChange"
FROM "Item" i
LEFT JOIN "ProductCategory" c ON i."categoryId" = c."id"
LEFT JOIN "ProductModel" m ON i."modelId" = m."id"
LEFT JOIN "Company" comp ON m."companyId" = comp."id"
LEFT JOIN "User" ru ON i."reservedBy" = ru."id"
LEFT JOIN LATERAL (
    SELECT "changeDate"
    FROM "InventoryStatusHistory" h
    WHERE h."itemId" = i."id"
    ORDER BY h."changeDate" DESC
    LIMIT 1
) latest_change ON true
WHERE i."deletedAt" IS NULL;