-- Only one open attendance row per employee
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'attendance_one_open_per_employee'
  ) THEN
    CREATE UNIQUE INDEX attendance_one_open_per_employee
    ON "Attendance" ("employeeId")
    WHERE "checkOut" IS NULL;
  END IF;
END $$;

-- Prevent impossible negative thresholds
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_model_min_stock_non_negative'
  ) THEN
    ALTER TABLE "ProductModel"
    ADD CONSTRAINT product_model_min_stock_non_negative
    CHECK ("minStockAlert" >= 0);
  END IF;
END $$;

-- Prevent negative monetary values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_item_price_non_negative'
  ) THEN
    ALTER TABLE "InvoiceItem"
    ADD CONSTRAINT invoice_item_price_non_negative
    CHECK ("price" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_amount_non_negative'
  ) THEN
    ALTER TABLE "Expense"
    ADD CONSTRAINT expense_amount_non_negative
    CHECK ("amount" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'return_amount_non_negative'
  ) THEN
    ALTER TABLE "InvoiceReturnItem"
    ADD CONSTRAINT return_amount_non_negative
    CHECK ("refundAmount" >= 0);
  END IF;
END $$;

-- Attendance validity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_checkout_after_checkin'
  ) THEN
    ALTER TABLE "Attendance"
    ADD CONSTRAINT attendance_checkout_after_checkin
    CHECK ("checkOut" IS NULL OR "checkOut" >= "checkIn");
  END IF;
END $$;

-- StockLot: quantityRemaining must be between 0 and quantityReceived
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_lot_remaining_le_received'
  ) THEN
    ALTER TABLE "StockLot"
    ADD CONSTRAINT stock_lot_remaining_le_received
    CHECK ("quantityRemaining" >= 0 AND "quantityRemaining" <= "quantityReceived");
  END IF;
END $$;

-- StockLot: quantityReserved must be between 0 and quantityRemaining
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_lot_reserved_valid'
  ) THEN
    ALTER TABLE "StockLot"
    ADD CONSTRAINT stock_lot_reserved_valid
    CHECK ("quantityReserved" >= 0 AND "quantityReserved" <= "quantityRemaining");
  END IF;
END $$;

-- InvoiceItem: exactly one of productUnitId or (productModelId AND quantity) must be set
-- This is enforced at the application level via validation

-- StockConsumption: quantity must be positive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_consumption_quantity_positive'
  ) THEN
    ALTER TABLE "StockConsumption"
    ADD CONSTRAINT stock_consumption_quantity_positive
    CHECK ("quantity" > 0);
  END IF;
END $$;

-- StockAdjustment: quantity must be positive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_adjustment_quantity_positive'
  ) THEN
    ALTER TABLE "StockAdjustment"
    ADD CONSTRAINT stock_adjustment_quantity_positive
    CHECK ("quantity" > 0);
  END IF;
END $$;

-- v2.5: ProductModel reservedQuantity must be >= 0
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_model_reserved_valid'
  ) THEN
    ALTER TABLE "ProductModel"
    ADD CONSTRAINT product_model_reserved_valid
    CHECK ("reservedQuantity" >= 0);
  END IF;
END $$;

-- v2.5: InvoiceItem requires productModelId and quantity > 0 (replaces old XOR constraint)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_item_requires_model_and_quantity'
  ) THEN
    ALTER TABLE "InvoiceItem"
    ADD CONSTRAINT invoice_item_requires_model_and_quantity
    CHECK ("productModelId" IS NOT NULL AND "quantity" > 0);
  END IF;
END $$;

-- v2.5: InvoiceItemUnitAssignment - at most one active assignment per productUnitId
-- Enforced via partial unique index (see migration), but add check for data integrity
-- Note: The partial unique index is the primary enforcement mechanism
