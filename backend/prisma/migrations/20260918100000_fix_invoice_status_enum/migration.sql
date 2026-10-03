-- Ensure the enum exists before converting the column type.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InvoiceStatus') THEN
    CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING_ACCOUNTANT', 'CONFIRMED', 'CANCELLED', 'DELIVERED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'Invoice' AND column_name = 'status'
  ) THEN
    ALTER TABLE "Invoice"
      ADD COLUMN "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING_ACCOUNTANT';
  ELSE
    ALTER TABLE "Invoice"
      ALTER COLUMN "status" DROP DEFAULT;

    ALTER TABLE "Invoice"
      ALTER COLUMN "status" TYPE "InvoiceStatus" USING "status"::text::"InvoiceStatus";

    ALTER TABLE "Invoice"
      ALTER COLUMN "status" SET DEFAULT 'PENDING_ACCOUNTANT';
  END IF;
END $$;
