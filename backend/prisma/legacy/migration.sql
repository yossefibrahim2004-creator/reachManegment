-- V2.4 Migration - Correct order

-- Step 1: Create new enum types
DO $$ BEGIN
  CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING_ACCOUNTANT', 'CONFIRMED', 'CANCELLED', 'DELIVERED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "StockAdjustmentType" AS ENUM ('DAMAGE', 'LOSS', 'FOUND', 'COUNT_CORRECTION', 'RECEIVING_CORRECTION', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Step 2: Add new values to existing enums
ALTER TYPE "ProductUnitStatus" ADD VALUE IF NOT EXISTS 'RESERVED';
ALTER TYPE "StockReceiptStatus" ADD VALUE IF NOT EXISTS 'PENDING_PRICING';
ALTER TYPE "StockReceiptStatus" ADD VALUE IF NOT EXISTS 'PRICED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INVOICE_PENDING_REVIEW';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INVOICE_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INVOICE_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DELIVERY_PENDING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DELIVERY_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'STOCK_PENDING_PRICING';
ALTER TYPE "InvoiceAuditAction" ADD VALUE IF NOT EXISTS 'SENT_FOR_ACCOUNTANT_REVIEW';
ALTER TYPE "InvoiceAuditAction" ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE "InvoiceAuditAction" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "InvoiceAuditAction" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "InvoiceAuditAction" ADD VALUE IF NOT EXISTS 'STOCK_RESERVED';
ALTER TYPE "InvoiceAuditAction" ADD VALUE IF NOT EXISTS 'STOCK_RESERVATION_RELEASED';

-- Step 3: Create Supplier table (must exist before StockReceipt FK)
CREATE TABLE IF NOT EXISTS "Supplier" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Supplier_name_idx" ON "Supplier"("name");
CREATE INDEX IF NOT EXISTS "Supplier_isActive_idx" ON "Supplier"("isActive");

-- Step 4: Create a default supplier for existing stock receipts
INSERT INTO "Supplier" ("name", "isActive", "createdAt", "updatedAt")
VALUES ('Unknown Supplier', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Step 5: Add supplierId to StockReceipt (nullable first)
ALTER TABLE "StockReceipt" ADD COLUMN "supplierId" INTEGER;

-- Step 6: Update existing receipts with the default supplier
UPDATE "StockReceipt" SET "supplierId" = (SELECT id FROM "Supplier" LIMIT 1) WHERE "supplierId" IS NULL;

-- Step 7: Make supplierId NOT NULL
ALTER TABLE "StockReceipt" ALTER COLUMN "supplierId" SET NOT NULL;

-- Step 8: Add FK for supplierId
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 9: Add pricing fields to StockReceipt
ALTER TABLE "StockReceipt" ADD COLUMN "pricedByEmployeeId" INTEGER;
ALTER TABLE "StockReceipt" ADD COLUMN "pricedAt" TIMESTAMP(3);
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_pricedByEmployeeId_fkey"
  FOREIGN KEY ("pricedByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 10: Add isSerialized to ProductModel
ALTER TABLE "ProductModel" ADD COLUMN "isSerialized" BOOLEAN NOT NULL DEFAULT true;

-- Step 11: Add purchasePrice to ProductUnit
ALTER TABLE "ProductUnit" ADD COLUMN "purchasePrice" DECIMAL(18,2);

-- Step 12: Add invoice lifecycle fields
ALTER TABLE "Invoice" ADD COLUMN "status" VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE "Invoice" ADD COLUMN "confirmedByEmployeeId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "rejectedByEmployeeId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "deliveredByEmployeeId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "paymentType" VARCHAR(50);

-- Step 13: Add FKs for invoice lifecycle
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_confirmedByEmployeeId_fkey"
  FOREIGN KEY ("confirmedByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_rejectedByEmployeeId_fkey"
  FOREIGN KEY ("rejectedByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_deliveredByEmployeeId_fkey"
  FOREIGN KEY ("deliveredByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 14: Make productUnitId nullable in InvoiceItem (for non-serialized lines)
ALTER TABLE "InvoiceItem" DROP CONSTRAINT "InvoiceItem_productUnitId_fkey";
ALTER TABLE "InvoiceItem" ALTER COLUMN "productUnitId" DROP NOT NULL;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productUnitId_fkey"
  FOREIGN KEY ("productUnitId") REFERENCES "ProductUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 15: Add non-serialized fields to InvoiceItem
ALTER TABLE "InvoiceItem" ADD COLUMN "productModelId" INTEGER;
ALTER TABLE "InvoiceItem" ADD COLUMN "quantity" INTEGER;
ALTER TABLE "InvoiceItem" ADD COLUMN "costAtSale" DECIMAL(18,2);
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productModelId_fkey"
  FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 16: Create StockLot table
CREATE TABLE IF NOT EXISTS "StockLot" (
    "id" SERIAL NOT NULL,
    "productModelId" INTEGER NOT NULL,
    "stockReceiptId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "quantityReceived" INTEGER NOT NULL,
    "quantityRemaining" INTEGER NOT NULL,
    "quantityReserved" INTEGER NOT NULL DEFAULT 0,
    "purchasePrice" DECIMAL(18,2),
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StockLot_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockLot_stockReceiptId_fkey" FOREIGN KEY ("stockReceiptId") REFERENCES "StockReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockLot_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_lot_remaining_le_received" CHECK ("quantityRemaining" >= 0 AND "quantityRemaining" <= "quantityReceived"),
    CONSTRAINT "stock_lot_reserved_valid" CHECK ("quantityReserved" >= 0 AND "quantityReserved" <= "quantityRemaining")
);
CREATE INDEX IF NOT EXISTS "StockLot_productModelId_idx" ON "StockLot"("productModelId");
CREATE INDEX IF NOT EXISTS "StockLot_stockReceiptId_idx" ON "StockLot"("stockReceiptId");
CREATE INDEX IF NOT EXISTS "StockLot_supplierId_idx" ON "StockLot"("supplierId");

-- Step 17: Create StockConsumption table
CREATE TABLE IF NOT EXISTS "StockConsumption" (
    "id" SERIAL NOT NULL,
    "invoiceItemId" INTEGER NOT NULL,
    "stockLotId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(18,2),
    "totalCost" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockConsumption_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StockConsumption_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "InvoiceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockConsumption_stockLotId_fkey" FOREIGN KEY ("stockLotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_consumption_quantity_positive" CHECK ("quantity" > 0)
);
CREATE INDEX IF NOT EXISTS "StockConsumption_invoiceItemId_idx" ON "StockConsumption"("invoiceItemId");
CREATE INDEX IF NOT EXISTS "StockConsumption_stockLotId_idx" ON "StockConsumption"("stockLotId");

-- Step 18: Create StockAdjustment table
CREATE TABLE IF NOT EXISTS "StockAdjustment" (
    "id" SERIAL NOT NULL,
    "productModelId" INTEGER NOT NULL,
    "stockLotId" INTEGER,
    "employeeId" INTEGER NOT NULL,
    "type" "StockAdjustmentType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StockAdjustment_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockAdjustment_stockLotId_fkey" FOREIGN KEY ("stockLotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_adjustment_quantity_positive" CHECK ("quantity" > 0)
);
CREATE INDEX IF NOT EXISTS "StockAdjustment_productModelId_createdAt_idx" ON "StockAdjustment"("productModelId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockAdjustment_stockLotId_idx" ON "StockAdjustment"("stockLotId");
CREATE INDEX IF NOT EXISTS "StockAdjustment_employeeId_createdAt_idx" ON "StockAdjustment"("employeeId", "createdAt");
