-- Creates tables/columns/foreign keys that exist in schema.prisma but were
-- only ever applied out-of-band via prisma/legacy/migration.sql ("V2.4 Migration").
--
-- Everything is guarded (IF NOT EXISTS / named-constraint checks) so it is a
-- no-op on databases that already received the out-of-band statements.
-- Dependencies (Supplier, StockLot, Employee, ProductModel, InvoiceItem,
-- Invoice) are created by earlier migrations.

-- ---------------------------------------------------------------------------
-- StockConsumption: required by invoices.service.ts (COGS recording),
-- stock-receipts.service.ts (lot cost resolution) and reports.service.ts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "StockConsumption" (
    "id" SERIAL NOT NULL,
    "invoiceItemId" INTEGER NOT NULL,
    "stockLotId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(18,2),
    "totalCost" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockConsumption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StockConsumption_invoiceItemId_idx" ON "StockConsumption"("invoiceItemId");
CREATE INDEX IF NOT EXISTS "StockConsumption_stockLotId_idx" ON "StockConsumption"("stockLotId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockConsumption_invoiceItemId_fkey') THEN
    ALTER TABLE "StockConsumption" ADD CONSTRAINT "StockConsumption_invoiceItemId_fkey"
      FOREIGN KEY ("invoiceItemId") REFERENCES "InvoiceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockConsumption_stockLotId_fkey') THEN
    ALTER TABLE "StockConsumption" ADD CONSTRAINT "StockConsumption_stockLotId_fkey"
      FOREIGN KEY ("stockLotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Invoice lifecycle (confirmation / rejection / delivery) columns.
-- Used by invoices.service.ts and invoice-delivery.service.ts.
-- ---------------------------------------------------------------------------
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "confirmedByEmployeeId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "rejectedByEmployeeId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "deliveredByEmployeeId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paymentType" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_confirmedByEmployeeId_fkey') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_confirmedByEmployeeId_fkey"
      FOREIGN KEY ("confirmedByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_rejectedByEmployeeId_fkey') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_rejectedByEmployeeId_fkey"
      FOREIGN KEY ("rejectedByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_deliveredByEmployeeId_fkey') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_deliveredByEmployeeId_fkey"
      FOREIGN KEY ("deliveredByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- InvoiceItem: COGS cost snapshot + FK for the productModelId added in
-- 20260920000000_v25_migration (that migration added the column but no FK).
-- ---------------------------------------------------------------------------
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "costAtSale" DECIMAL(18,2);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceItem_productModelId_fkey') THEN
    ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productModelId_fkey"
      FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ProductModel / ProductUnit catalog fields.
-- ---------------------------------------------------------------------------
ALTER TABLE "ProductModel" ADD COLUMN IF NOT EXISTS "isSerialized" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ProductUnit" ADD COLUMN IF NOT EXISTS "purchasePrice" DECIMAL(18,2);

-- ---------------------------------------------------------------------------
-- StockReceipt: supplier + pricing workflow fields.
-- NOTE: supplierId is NOT NULL in schema.prisma. On an empty database this
-- succeeds immediately; a legacy database containing receipts with NULL
-- supplierId must be rebuilt (development data is disposable) - no silent
-- backfill is performed on purpose.
-- ---------------------------------------------------------------------------
ALTER TABLE "StockReceipt" ADD COLUMN IF NOT EXISTS "supplierId" INTEGER;
ALTER TABLE "StockReceipt" ADD COLUMN IF NOT EXISTS "pricedByEmployeeId" INTEGER;
ALTER TABLE "StockReceipt" ADD COLUMN IF NOT EXISTS "pricedAt" TIMESTAMP(3);
ALTER TABLE "StockReceipt" ALTER COLUMN "supplierId" SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockReceipt_supplierId_fkey') THEN
    ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockReceipt_pricedByEmployeeId_fkey') THEN
    ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_pricedByEmployeeId_fkey"
      FOREIGN KEY ("pricedByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
