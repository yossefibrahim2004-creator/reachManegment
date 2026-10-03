DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CogsStatus') THEN
    CREATE TYPE "CogsStatus" AS ENUM ('PENDING', 'FINAL');
  END IF;
END $$;

ALTER TABLE "InvoiceItem"
  ADD COLUMN IF NOT EXISTS "cogsStatus" "CogsStatus" NOT NULL DEFAULT 'PENDING';

CREATE INDEX IF NOT EXISTS "InvoiceItem_cogsStatus_idx"
  ON "InvoiceItem"("cogsStatus");
