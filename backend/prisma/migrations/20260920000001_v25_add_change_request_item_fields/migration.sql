-- AlterTable
ALTER TABLE "InvoiceChangeRequestItem" ADD COLUMN "productModelId" INTEGER,
ADD COLUMN "quantity" INTEGER;

-- CreateIndex
CREATE INDEX "InvoiceChangeRequestItem_productModelId_idx" ON "InvoiceChangeRequestItem"("productModelId");
