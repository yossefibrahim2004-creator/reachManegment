-- Reconciles index, default and foreign-key drift with schema.prisma.

-- Indexes declared in schema.prisma (@@index) but never created by a migration
CREATE INDEX IF NOT EXISTS "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX IF NOT EXISTS "InvoiceItem_productModelId_idx" ON "InvoiceItem"("productModelId");
CREATE INDEX IF NOT EXISTS "StockReceipt_status_idx" ON "StockReceipt"("status");

-- Index created by 20260920120000_add_invoice_item_cogs_status but not
-- declared in schema.prisma. It is a two-value boolean column, so PostgreSQL
-- would not use it selectively; schema.prisma is authoritative -> drop it.
DROP INDEX IF EXISTS "InvoiceItem_cogsStatus_idx";

-- Attendance.updatedAt is @updatedAt in schema.prisma (Prisma-managed, no DB
-- default); 20260922000000_attendance_kiosk_workplace gave it DEFAULT now.
ALTER TABLE "Attendance" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Expense.description is required in schema.prisma and in CreateExpenseDto
-- (@IsNotEmpty). On legacy rows containing NULL the statement fails loudly -
-- no silent backfill is performed on purpose (development data is disposable).
ALTER TABLE "Expense" ALTER COLUMN "description" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- InvoiceItemUnitAssignment foreign keys: 20260920000000_v25_migration created
-- them with ON DELETE RESTRICT but without ON UPDATE CASCADE, while every other
-- FK in this project (and Prisma's default referential action) uses
-- ON DELETE RESTRICT ON UPDATE CASCADE. Re-add only when the actions differ.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'InvoiceItemUnitAssignment_invoiceItemId_fkey'
                   AND confupdtype = 'c' AND confdeltype = 'r') THEN
    ALTER TABLE "InvoiceItemUnitAssignment" DROP CONSTRAINT IF EXISTS "InvoiceItemUnitAssignment_invoiceItemId_fkey";
    ALTER TABLE "InvoiceItemUnitAssignment" ADD CONSTRAINT "InvoiceItemUnitAssignment_invoiceItemId_fkey"
      FOREIGN KEY ("invoiceItemId") REFERENCES "InvoiceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'InvoiceItemUnitAssignment_productUnitId_fkey'
                   AND confupdtype = 'c' AND confdeltype = 'r') THEN
    ALTER TABLE "InvoiceItemUnitAssignment" DROP CONSTRAINT IF EXISTS "InvoiceItemUnitAssignment_productUnitId_fkey";
    ALTER TABLE "InvoiceItemUnitAssignment" ADD CONSTRAINT "InvoiceItemUnitAssignment_productUnitId_fkey"
      FOREIGN KEY ("productUnitId") REFERENCES "ProductUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'InvoiceItemUnitAssignment_scannedByEmployeeId_fkey'
                   AND confupdtype = 'c' AND confdeltype = 'r') THEN
    ALTER TABLE "InvoiceItemUnitAssignment" DROP CONSTRAINT IF EXISTS "InvoiceItemUnitAssignment_scannedByEmployeeId_fkey";
    ALTER TABLE "InvoiceItemUnitAssignment" ADD CONSTRAINT "InvoiceItemUnitAssignment_scannedByEmployeeId_fkey"
      FOREIGN KEY ("scannedByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'InvoiceItemUnitAssignment_reversedByEmployeeId_fkey'
                   AND confupdtype = 'c' AND confdeltype = 'r') THEN
    ALTER TABLE "InvoiceItemUnitAssignment" DROP CONSTRAINT IF EXISTS "InvoiceItemUnitAssignment_reversedByEmployeeId_fkey";
    ALTER TABLE "InvoiceItemUnitAssignment" ADD CONSTRAINT "InvoiceItemUnitAssignment_reversedByEmployeeId_fkey"
      FOREIGN KEY ("reversedByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
