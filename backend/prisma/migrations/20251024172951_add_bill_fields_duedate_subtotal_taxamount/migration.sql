/*
  Warnings:

  - Added the required column `subtotal` to the `Bill` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "subtotal" DECIMAL(18,4) NOT NULL,
ADD COLUMN     "taxAmount" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "company" TEXT;
