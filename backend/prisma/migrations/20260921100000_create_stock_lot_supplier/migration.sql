-- Prerequisite for 20260921120000_create_stock_adjustment.
--
-- Supplier and StockLot were created directly on the database by the out-of-band
-- file prisma/legacy/migration.sql ("V2.4 Migration"), so they never entered the
-- official migration history. StockAdjustment.stockLotId references StockLot,
-- and StockLot.supplierId references Supplier, so both tables must exist in the
-- chain before StockAdjustment can be created.
--
-- Every statement is guarded: databases that already applied the legacy
-- migration.sql out-of-band already contain these objects and must be
-- unaffected when this migration runs.
--
-- Intentionally WITHOUT the legacy compound CHECKs stock_lot_remaining_le_received
-- and stock_lot_reserved_valid: current business logic legitimately produces
-- states they forbid (approveAdjustment raises quantityRemaining above
-- quantityReceived on positive adjustments, and lowers it below
-- quantityReserved on negative adjustments), and neither check was ever live
-- on the reference database. See prisma/legacy/README.md.

-- CreateTable
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

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Supplier_name_idx" ON "Supplier"("name");
CREATE INDEX IF NOT EXISTS "Supplier_isActive_idx" ON "Supplier"("isActive");

-- CreateTable
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
    CONSTRAINT "StockLot_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockLot_productModelId_idx" ON "StockLot"("productModelId");
CREATE INDEX IF NOT EXISTS "StockLot_stockReceiptId_idx" ON "StockLot"("stockReceiptId");
CREATE INDEX IF NOT EXISTS "StockLot_supplierId_idx" ON "StockLot"("supplierId");

-- AddForeignKey (only relevant if the table already existed without them)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockLot_productModelId_fkey') THEN
    ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_productModelId_fkey"
      FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockLot_stockReceiptId_fkey') THEN
    ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_stockReceiptId_fkey"
      FOREIGN KEY ("stockReceiptId") REFERENCES "StockReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockLot_supplierId_fkey') THEN
    ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
