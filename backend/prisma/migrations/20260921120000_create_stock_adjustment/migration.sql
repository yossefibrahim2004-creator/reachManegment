-- Creates StockAdjustment in its ORIGINAL base form (source: prisma/legacy/migration.sql,
-- "V2.4 Migration", step 18) so that 20260923200000_adjustment_review, which only
-- ALTERs the table, can run on a fresh database.
--
-- Intentionally does NOT include status / reviewedByEmployeeId / reviewedAt /
-- reviewNote: those columns are added exclusively by the adjustment_review
-- migration.
--
-- Intentionally does NOT include the legacy check stock_adjustment_quantity_positive
-- (quantity > 0): adjustments are signed by design — createAdjustment only
-- rejects zero and the DTO documents negative examples — so that rule would
-- reject the supported DAMAGE/LOSS flow. It was never live on the reference
-- database. See prisma/legacy/README.md.
--
-- Every statement is guarded: databases that applied the legacy migration.sql
-- out-of-band already contain this table, this enum and these constraints.

-- CreateEnum (StockAdjustmentType was never created by any official migration)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StockAdjustmentType') THEN
    CREATE TYPE "StockAdjustmentType" AS ENUM ('DAMAGE', 'LOSS', 'FOUND', 'COUNT_CORRECTION', 'RECEIVING_CORRECTION', 'OTHER');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "StockAdjustment" (
    "id" SERIAL NOT NULL,
    "productModelId" INTEGER NOT NULL,
    "stockLotId" INTEGER,
    "employeeId" INTEGER NOT NULL,
    "type" "StockAdjustmentType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockAdjustment_productModelId_createdAt_idx" ON "StockAdjustment"("productModelId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockAdjustment_stockLotId_idx" ON "StockAdjustment"("stockLotId");
CREATE INDEX IF NOT EXISTS "StockAdjustment_employeeId_createdAt_idx" ON "StockAdjustment"("employeeId", "createdAt");

-- AddForeignKey (Prisma's <Table>_<column>_fkey convention)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockAdjustment_productModelId_fkey') THEN
    ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_productModelId_fkey"
      FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockAdjustment_stockLotId_fkey') THEN
    ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_stockLotId_fkey"
      FOREIGN KEY ("stockLotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockAdjustment_employeeId_fkey') THEN
    ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
