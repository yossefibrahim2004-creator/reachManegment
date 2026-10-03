-- Reconciles enum drift between the migration history and schema.prisma.
--
-- These enum values/variants are used by the backend (invoices.service.ts,
-- invoice-delivery.service.ts, notifications.service.ts, attendance,
-- reports) and by the frontend, but were only ever applied out-of-band via
-- prisma/legacy/migration.sql (V2.4) and prisma/legacy/add_role.sql.
--
-- Every statement is guarded (IF NOT EXISTS / conditional rebuild) so it is
-- safe on databases that already received the out-of-band statements.

-- InvoiceAuditAction: invoice workflow + stock reservation audit trail
ALTER TYPE "InvoiceAuditAction" ADD VALUE IF NOT EXISTS 'SENT_FOR_ACCOUNTANT_REVIEW';
ALTER TYPE "InvoiceAuditAction" ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE "InvoiceAuditAction" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "InvoiceAuditAction" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "InvoiceAuditAction" ADD VALUE IF NOT EXISTS 'STOCK_RESERVED';
ALTER TYPE "InvoiceAuditAction" ADD VALUE IF NOT EXISTS 'STOCK_RESERVATION_RELEASED';

-- NotificationType: invoice workflow + stock pricing notifications
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INVOICE_PENDING_REVIEW';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INVOICE_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INVOICE_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DELIVERY_PENDING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DELIVERY_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'STOCK_PENDING_PRICING';

-- ProductUnitStatus: reservation model (invoice-delivery.service.ts, reports)
ALTER TYPE "ProductUnitStatus" ADD VALUE IF NOT EXISTS 'RESERVED';

-- Role: accountant role (was prisma/legacy/add_role.sql; used by @Roles guards,
-- seed.ts and the frontend)
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ACCOUNTANT';

-- StockReceiptStatus: 20260915231159_init created (FINALIZED, CANCELLED),
-- but schema.prisma, stock-receipts.service.ts and the frontend use the
-- pricing workflow (PENDING_PRICING -> PRICED). FINALIZED is never referenced
-- anywhere in the codebase. Rebuild only when the value set differs.
DO $$
BEGIN
  IF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumlabel)
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'StockReceiptStatus')
     IS DISTINCT FROM ARRAY['CANCELLED', 'PENDING_PRICING', 'PRICED'] THEN

    CREATE TYPE "StockReceiptStatus_new" AS ENUM ('PENDING_PRICING', 'PRICED', 'CANCELLED');
    ALTER TABLE "StockReceipt" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "StockReceipt" ALTER COLUMN "status" TYPE "StockReceiptStatus_new"
      USING ("status"::text::"StockReceiptStatus_new");
    ALTER TYPE "StockReceiptStatus" RENAME TO "StockReceiptStatus_old";
    ALTER TYPE "StockReceiptStatus_new" RENAME TO "StockReceiptStatus";
    DROP TYPE "StockReceiptStatus_old";
  END IF;
END $$;

-- schema.prisma: status StockReceiptStatus @default(PENDING_PRICING)
ALTER TABLE "StockReceipt" ALTER COLUMN "status" SET DEFAULT 'PENDING_PRICING';
