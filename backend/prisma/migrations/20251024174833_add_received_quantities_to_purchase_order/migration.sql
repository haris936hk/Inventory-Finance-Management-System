-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "receivedQuantities" JSONB NOT NULL DEFAULT '{}';
