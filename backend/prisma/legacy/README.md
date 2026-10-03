# Legacy out-of-band SQL (archived — do not apply)

These three files used to sit directly in `backend/prisma/` and were applied to
databases by hand (or never applied at all). They must **not** be run anymore.
The official Prisma migration history in `../migrations/` now reproduces every
effect these files had, and `prisma migrate deploy` is the only supported way to
build a database.

| File | What it did | Where it lives now |
|---|---|---|
| `migration.sql` | "V2.4" mega-script: Supplier, StockLot, StockAdjustment, adjustments FKs, enums, invoice/lifecycle columns… | `20260921100000_create_stock_lot_supplier`, `20260921120000_create_stock_adjustment`, `20260923200000_adjustment_review`, `20260924000000_reconcile_enums`, `20260924000001_reconcile_tables_columns`, `20260924000002_reconcile_indexes_nullability` |
| `add_role.sql` | Added the `ACCOUNTANT` role to the `Role` enum | `20260924000000_reconcile_enums` (`Role: add ACCOUNTANT`) |
| `constraints.sql` | Business-rule CHECK constraints + one partial unique index | Partial index → already covered by `Attendance_employeeId_open_key` (`20260922000000_attendance_kiosk_workplace`). CHECKs → see below. |

## constraints.sql — constraint-by-constraint disposition

Ported to `20260924000003_business_rule_constraints` (each is enforced
identically by DTO validators / service guards, so the DB can never reject a
write the application intends to allow):

- `product_model_min_stock_non_negative` — `@Min(0)` on create *and* update DTO.
- `invoice_item_price_non_negative` — `@Min(0)` on `CreateInvoiceDto` + service
  rejects `price < 0`; change requests re-validate `proposedPrice < 0`.
- `expense_amount_non_negative` — `@Min(0.01)` on the expense DTO.
- `return_amount_non_negative` — `refundAmount = effectivePrice ×
  paymentRatio`, both factors `>= 0`.
- `stock_consumption_quantity_positive` — consumption rows are always created
  from positive invoice-item quantities.
- `invoice_item_requires_model_and_quantity` — redundant with the live
  `NOT NULL` + `invoice_item_quantity_positive` (`20260920000000_v25_migration`).

**Deliberately NOT ported** (each would reject a flow the current application
allows, or duplicates an index):

- `stock_adjustment_quantity_positive` (`quantity > 0`) — adjustments are
  **signed by design**: `CreateStockAdjustmentDto` documents a negative example
  (`-5`), `createAdjustment` only rejects zero, and `approveAdjustment` applies
  the signed delta to the lot.
- `stock_lot_remaining_le_received` — `approveAdjustment` adds positive
  adjustments (`FOUND`, `COUNT_CORRECTION`, …) to `quantityRemaining` without
  touching `quantityReceived`, so remaining may legitimately exceed received.
- `stock_lot_reserved_valid` — `approveAdjustment` lowers `quantityRemaining`
  without touching `quantityReserved`; with this check a negative adjustment on
  a lot with reservations would crash invoice confirmation.
- `attendance_checkout_after_checkin` — `correctAttendance` validates
  check-out vs check-in only when `checkOut` is supplied; a checkIn-only
  correction past the existing check-out is accepted by the app today, so the
  DB constraint would turn that into a 500. (App-side gap documented in the
  final audit report.)
- `attendance_one_open_per_employee` — duplicate of the partial unique index
  `Attendance_employeeId_open_key` created by
  `20260922000000_attendance_kiosk_workplace` (same table, same predicate).

The two checks that predate this work and were already live on every existing
database — `product_model_reserved_valid` and `invoice_item_quantity_positive`
(`20260920000000_v25_migration`) — stay untouched.
