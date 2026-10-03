-- Stock adjustments become review requests: inventory submits (PENDING),
-- admin approves/rejects. Lot quantities only change on approval.
CREATE TYPE "AdjustmentReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "StockAdjustment"
  ADD COLUMN "status" "AdjustmentReviewStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewedByEmployeeId" INTEGER,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewNote" TEXT;

-- Rows that existed before this workflow were already applied at creation.
UPDATE "StockAdjustment" SET "status" = 'APPROVED', "reviewedAt" = "createdAt";

ALTER TABLE "StockAdjustment"
  ADD CONSTRAINT "StockAdjustment_reviewedByEmployeeId_fkey"
  FOREIGN KEY ("reviewedByEmployeeId") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "StockAdjustment_status_createdAt_idx" ON "StockAdjustment"("status", "createdAt");
