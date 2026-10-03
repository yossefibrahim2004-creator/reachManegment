-- v2.5 Migration: Serial-Blind Sales / Delivery-Time Scanning
-- This migration implements the pool reservation model for serialized products
-- and adds delivery-time scanning with InvoiceItemUnitAssignment

-- 1. Add new enum values
ALTER TYPE "InvoiceAuditAction" ADD VALUE IF NOT EXISTS 'UNIT_SCANNED';
ALTER TYPE "InvoiceAuditAction" ADD VALUE IF NOT EXISTS 'UNIT_SCAN_REVERSED';
ALTER TYPE "ProductUnitAuditAction" ADD VALUE IF NOT EXISTS 'ALLOCATED_TO_INVOICE';
ALTER TYPE "ProductUnitAuditAction" ADD VALUE IF NOT EXISTS 'ALLOCATION_RELEASED';

-- 2. Add missing InvoiceItem columns required by the v2.5 model
ALTER TABLE "InvoiceItem"
  ADD COLUMN IF NOT EXISTS "productModelId" INTEGER,
  ADD COLUMN IF NOT EXISTS "quantity" INTEGER;

-- 3. Add reservedQuantity column to ProductModel
ALTER TABLE "ProductModel" ADD COLUMN IF NOT EXISTS "reservedQuantity" INTEGER NOT NULL DEFAULT 0;

-- 4. Create InvoiceItemUnitAssignment table
CREATE TABLE IF NOT EXISTS "InvoiceItemUnitAssignment" (
  "id" SERIAL PRIMARY KEY,
  "invoiceItemId" INTEGER NOT NULL,
  "productUnitId" INTEGER NOT NULL,
  "scannedByEmployeeId" INTEGER NOT NULL,
  "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt" TIMESTAMP(3),
  "reversedByEmployeeId" INTEGER,
  CONSTRAINT "InvoiceItemUnitAssignment_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "InvoiceItem"("id") ON DELETE RESTRICT,
  CONSTRAINT "InvoiceItemUnitAssignment_productUnitId_fkey" FOREIGN KEY ("productUnitId") REFERENCES "ProductUnit"("id") ON DELETE RESTRICT,
  CONSTRAINT "InvoiceItemUnitAssignment_scannedByEmployeeId_fkey" FOREIGN KEY ("scannedByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT,
  CONSTRAINT "InvoiceItemUnitAssignment_reversedByEmployeeId_fkey" FOREIGN KEY ("reversedByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "InvoiceItemUnitAssignment_invoiceItemId_idx" ON "InvoiceItemUnitAssignment"("invoiceItemId");
CREATE INDEX IF NOT EXISTS "InvoiceItemUnitAssignment_productUnitId_idx" ON "InvoiceItemUnitAssignment"("productUnitId");

-- Partial unique index: at most one active (non-reversed) assignment per productUnitId
CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceItemUnitAssignment_productUnitId_active_unique"
  ON "InvoiceItemUnitAssignment"("productUnitId")
  WHERE "reversedAt" IS NULL;

-- 5. Migrate existing serialized InvoiceItems
-- For each InvoiceItem with productUnitId, set productModelId from the unit, quantity = 1
-- and create an InvoiceItemUnitAssignment record

-- First, update productModelId for serialized items that have productUnitId
UPDATE "InvoiceItem"
SET "productModelId" = pu."productModelId"
FROM "ProductUnit" pu
WHERE "InvoiceItem"."productUnitId" = pu."id"
  AND "InvoiceItem"."productModelId" IS NULL;

-- Set quantity = 1 for serialized items that have productUnitId but no quantity
UPDATE "InvoiceItem"
SET "quantity" = 1
WHERE "productUnitId" IS NOT NULL
  AND "quantity" IS NULL;

-- Create InvoiceItemUnitAssignment records for existing serialized items
INSERT INTO "InvoiceItemUnitAssignment" ("invoiceItemId", "productUnitId", "scannedByEmployeeId", "scannedAt")
SELECT ii."id", ii."productUnitId", i."employeeId", i."date"
FROM "InvoiceItem" ii
JOIN "Invoice" i ON ii."invoiceId" = i."id"
WHERE ii."productUnitId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 6. Make productModelId and quantity NOT NULL (after data migration)
ALTER TABLE "InvoiceItem" ALTER COLUMN "productModelId" SET NOT NULL;
ALTER TABLE "InvoiceItem" ALTER COLUMN "quantity" SET NOT NULL;

-- 7. Drop productUnitId column from InvoiceItem
ALTER TABLE "InvoiceItem" DROP COLUMN IF EXISTS "productUnitId";

-- 8. Add check constraints
-- ProductModel.reservedQuantity >= 0 (only meaningful when isSerialized = true, but enforce at DB level)
ALTER TABLE "ProductModel" ADD CONSTRAINT "product_model_reserved_valid" CHECK ("reservedQuantity" >= 0);

-- InvoiceItem: productModelId required and quantity > 0 (already enforced by NOT NULL, but add explicit CHECK)
-- Note: productModelId NOT NULL already enforced above
-- quantity > 0
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "invoice_item_quantity_positive" CHECK ("quantity" > 0);

-- 9. Drop index on InvoiceItem.productUnitId (no longer exists)
DROP INDEX IF EXISTS "InvoiceItem_productUnitId_idx";

-- 10. Drop the old XOR constraint logic (was application-level, but remove any stale CHECK if exists)
-- No explicit CHECK constraint existed in DB for XOR, but ensure productUnitId is gone

-- 11. Update Employee table - no schema changes needed (relations handled by Prisma)