-- Allow quantity-based returns for non-serialized lines (Fix 2):
-- InvoiceReturnItem.productUnitId becomes nullable and a quantity column is added.
ALTER TABLE "InvoiceReturnItem" ALTER COLUMN "productUnitId" DROP NOT NULL;
ALTER TABLE "InvoiceReturnItem" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
