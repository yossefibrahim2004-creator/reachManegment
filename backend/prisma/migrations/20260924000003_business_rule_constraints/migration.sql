-- Business-rule CHECK constraints ported from the out-of-band file
-- prisma/legacy/constraints.sql (never applied automatically) so a fresh
-- database reproduces them from the official migration history alone.
--
-- Every ported rule is enforced identically by the application on all code
-- paths (DTO validators and/or service guards), so the database can never
-- reject a write the app intends to allow.
--
-- Guarded by constraint name: constraints created by earlier official
-- migrations (product_model_reserved_valid, invoice_item_quantity_positive)
-- are NOT repeated here.
--
-- Deliberately NOT ported from constraints.sql — each would reject a flow the
-- current application allows, or duplicates an existing index
-- (full rationale in prisma/legacy/README.md):
--   * stock_adjustment_quantity_positive  — adjustments are signed by design.
--   * stock_lot_remaining_le_received     — positive adjustments raise
--     quantityRemaining without touching quantityReceived.
--   * stock_lot_reserved_valid            — adjustments lower
--     quantityRemaining without touching quantityReserved.
--   * attendance_checkout_after_checkin   — correctAttendance accepts a
--     checkIn-only correction past the existing checkOut (no app validation
--     on that path).
--   * attendance_one_open_per_employee    — duplicate of the partial unique
--     index Attendance_employeeId_open_key (20260922000000).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_model_min_stock_non_negative') THEN
    ALTER TABLE "ProductModel" ADD CONSTRAINT product_model_min_stock_non_negative CHECK ("minStockAlert" >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_item_price_non_negative') THEN
    ALTER TABLE "InvoiceItem" ADD CONSTRAINT invoice_item_price_non_negative CHECK ("price" >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_amount_non_negative') THEN
    ALTER TABLE "Expense" ADD CONSTRAINT expense_amount_non_negative CHECK ("amount" >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'return_amount_non_negative') THEN
    ALTER TABLE "InvoiceReturnItem" ADD CONSTRAINT return_amount_non_negative CHECK ("refundAmount" >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_consumption_quantity_positive') THEN
    ALTER TABLE "StockConsumption" ADD CONSTRAINT stock_consumption_quantity_positive CHECK ("quantity" > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_item_requires_model_and_quantity') THEN
    ALTER TABLE "InvoiceItem" ADD CONSTRAINT invoice_item_requires_model_and_quantity
      CHECK ("productModelId" IS NOT NULL AND "quantity" > 0);
  END IF;
END $$;
