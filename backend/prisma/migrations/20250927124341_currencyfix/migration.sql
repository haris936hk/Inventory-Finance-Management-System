/*
  Warnings:

  - You are about to drop the column `deliveredBy` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `deliveryDate` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `clientAddress` on the `Item` table. All the data in the column will be lost.
  - You are about to drop the column `clientCompany` on the `Item` table. All the data in the column will be lost.
  - You are about to drop the column `clientEmail` on the `Item` table. All the data in the column will be lost.
  - You are about to drop the column `clientNIC` on the `Item` table. All the data in the column will be lost.
  - You are about to drop the column `clientName` on the `Item` table. All the data in the column will be lost.
  - You are about to drop the column `clientPhone` on the `Item` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."Item_clientPhone_idx";

-- AlterTable
ALTER TABLE "public"."Bill" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "public"."CustomerLedger" ALTER COLUMN "balance" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "public"."GSTReturn" ALTER COLUMN "totalSales" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "totalPurchases" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "public"."Installment" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "public"."InstallmentPlan" ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "public"."Invoice" DROP COLUMN "deliveredBy",
DROP COLUMN "deliveryDate",
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "public"."Item" DROP COLUMN "clientAddress",
DROP COLUMN "clientCompany",
DROP COLUMN "clientEmail",
DROP COLUMN "clientNIC",
DROP COLUMN "clientName",
DROP COLUMN "clientPhone",
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "handoverToNIC" TEXT,
ADD COLUMN     "handoverToPhone" TEXT;

-- AlterTable
ALTER TABLE "public"."Payment" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "public"."ProductModel" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "public"."PurchaseOrder" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "public"."VendorLedger" ALTER COLUMN "balance" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "public"."VendorPayment" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- CreateTable
CREATE TABLE "public"."PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(18,2) NOT NULL,
    "specifications" JSONB,
    "notes" TEXT,
    "purchaseOrderId" TEXT NOT NULL,
    "productModelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "public"."PurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_productModelId_idx" ON "public"."PurchaseOrderItem"("productModelId");

-- CreateIndex
CREATE INDEX "Item_customerId_idx" ON "public"."Item"("customerId");

-- AddForeignKey
ALTER TABLE "public"."Item" ADD CONSTRAINT "Item_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "public"."PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "public"."ProductModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
