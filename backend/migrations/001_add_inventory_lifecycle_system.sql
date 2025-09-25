-- ========== Migration: Add Inventory Lifecycle System ==========
-- This migration adds comprehensive inventory lifecycle management
-- to support the complete e-commerce reservation system

-- Add new fields to Item table for inventory status tracking
ALTER TABLE "Item"
ADD COLUMN "inventoryStatus" TEXT NOT NULL DEFAULT 'Available',
ADD COLUMN "reservedAt" TIMESTAMP,
ADD COLUMN "reservedBy" TEXT,
ADD COLUMN "reservedForType" TEXT,
ADD COLUMN "reservedForId" TEXT,
ADD COLUMN "reservationExpiry" TIMESTAMP;

-- Add indexes for performance
CREATE INDEX "Item_inventoryStatus_idx" ON "Item"("inventoryStatus");
CREATE INDEX "Item_reservedForId_idx" ON "Item"("reservedForId");
CREATE INDEX "Item_reservationExpiry_idx" ON "Item"("reservationExpiry");

-- Create InventoryStatusHistory table for audit trail
CREATE TABLE "InventoryStatusHistory" (
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
ALTER TABLE "InventoryStatusHistory" ADD CONSTRAINT "InventoryStatusHistory_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryStatusHistory" ADD CONSTRAINT "InventoryStatusHistory_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add indexes for InventoryStatusHistory
CREATE INDEX "InventoryStatusHistory_itemId_idx" ON "InventoryStatusHistory"("itemId");
CREATE INDEX "InventoryStatusHistory_referenceType_referenceId_idx" ON "InventoryStatusHistory"("referenceType", "referenceId");
CREATE INDEX "InventoryStatusHistory_changeDate_idx" ON "InventoryStatusHistory"("changeDate");
CREATE INDEX "InventoryStatusHistory_toStatus_idx" ON "InventoryStatusHistory"("toStatus");

-- Update existing items to have proper inventory status based on current status
UPDATE "Item"
SET "inventoryStatus" = CASE
    WHEN "status" = 'Sold' THEN 'Sold'
    WHEN "status" = 'Delivered' THEN 'Delivered'
    ELSE 'Available'
END
WHERE "deletedAt" IS NULL;

-- Add delivery fields to Invoice table
ALTER TABLE "Invoice"
ADD COLUMN "deliveryDate" TIMESTAMP,
ADD COLUMN "deliveredBy" TEXT;

-- Create initial history entries for existing items
INSERT INTO "InventoryStatusHistory" ("id", "itemId", "fromStatus", "toStatus", "changeReason", "changedBy", "notes")
SELECT
    gen_random_uuid(),
    "id",
    NULL,
    "inventoryStatus",
    'SYSTEM_MIGRATION',
    (SELECT "id" FROM "User" WHERE "username" = 'admin' LIMIT 1),
    'Initial status from migration'
FROM "Item"
WHERE "deletedAt" IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN "Item"."inventoryStatus" IS 'Inventory lifecycle status: Available, Reserved, Sold, Delivered';
COMMENT ON COLUMN "Item"."reservedAt" IS 'Timestamp when item was reserved';
COMMENT ON COLUMN "Item"."reservedBy" IS 'User ID who reserved the item';
COMMENT ON COLUMN "Item"."reservedForType" IS 'Type of document: Invoice, Manual, etc.';
COMMENT ON COLUMN "Item"."reservedForId" IS 'ID of the document (Invoice ID, etc.)';
COMMENT ON COLUMN "Item"."reservationExpiry" IS 'When temporary reservation expires (NULL for permanent)';

COMMENT ON TABLE "InventoryStatusHistory" IS 'Audit trail for all inventory status changes';
COMMENT ON COLUMN "InventoryStatusHistory"."changeReason" IS 'Reason for status change: INVOICE_CREATED, INVOICE_CANCELLED, INVOICE_PAID, etc.';

-- Create a view for easy inventory status reporting
CREATE VIEW "InventoryStatusReport" AS
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

COMMENT ON VIEW "InventoryStatusReport" IS 'Comprehensive view for inventory status reporting and analysis';