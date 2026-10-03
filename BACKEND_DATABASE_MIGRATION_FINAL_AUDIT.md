# Backend Database & Migration Final Audit

**Project:** Pallet POS — NestJS + Prisma 5.22 + PostgreSQL 16
**Date:** 2026-09-26
**Scope:** Full reconciliation of migration history, `schema.prisma`, and the PostgreSQL database; fresh-DB reproducibility; build + runtime verification.
**Objective:** The repository must be reproducible from zero using **only** the official Prisma migration history — no out-of-band SQL reliance, zero schema drift, backend builds and runs.

---

## 1. Executive summary

**Result: PASS (high confidence).**

The migration history now reproduces `schema.prisma` exactly from an empty
database: `prisma migrate deploy` applies **16/16** migrations, `migrate status`
reports *up to date*, and `prisma migrate diff` reports **"No difference
detected"** both from the dev database and from an empty shadow database built
solely from `prisma/migrations/`.

During the audit **three legacy CHECK constraints were found to contradict the
current application's business logic** (signed stock adjustments, lot pricing,
attendance correction). They were deliberately **not** ported and are documented
in `backend/prisma/legacy/README.md` — this is the only deviation from a
literal 1:1 port of the legacy `constraints.sql`, and it was made to *protect*
business logic rather than break it.

All three out-of-band SQL files were moved out of `backend/prisma/` into
`backend/prisma/legacy/` (archived, not deleted). No application source code
was modified. The backend builds, starts, and passed an end-to-end API smoke
test covering the full order → confirm → deliver lifecycle, COGS resolution,
signed adjustments, attendance kiosk flow, expenses and reports.

---

## 2. Before / after

| Dimension | Before | After |
|---|---|---|
| Dev DB origin | Shaped largely by `prisma db push`; migrations only partial | Built **only** by `prisma migrate deploy` (16/16) |
| `migrate status` | Pending / divergent migrations | *Database schema is up to date!* |
| Drift vs `schema.prisma` | Missing table (StockConsumption), missing columns, enum drift, index/nullability mismatches | `migrate diff` → **No difference detected** (dev DB and shadow DB) |
| Out-of-band SQL in `prisma/` | `migration.sql`, `constraints.sql`, `add_role.sql` present and load-bearing | Moved to `backend/prisma/legacy/` + README (superseded by migrations) |
| CHECK constraints | 2 live (partial), rest only in never-applied files; 3 legacy rules contradicted app logic | 8 app-level CHECKs, all app-consistent; contradictions documented & excluded |
| StockReceiptStatus enum | `(FINALIZED, PRICED, CANCELLED)` from init migration | `(PENDING_PRICING, PRICED, CANCELLED)` per schema + code (conditional rebuild) |
| Role enum | Missing `ACCOUNTANT` | `ACCOUNTANT` present (used by guards/seed/frontend) |
| Reproducible from zero | **No** (manual SQL required) | **Yes** (deploy → status → diff all green) |
| `prisma validate` / `generate` | — | Pass / Client v5.22.0 generated |
| `nest build` | — | Pass (exit 0) |
| Runtime | unknown | Server boots on :3001; E2E smoke: **49/49 expected behaviors** |
| Fresh-DB test | not run | Deploy 16/16, status up to date, 2× "No difference detected" |

---

## 3. Problems found (audit findings)

**Schema drift (dev DB vs schema.prisma vs migrations):**

1. `StockConsumption` table entirely missing from migration history (existed only via out-of-band `migration.sql`) — required by invoice confirmation (COGS), lot cost resolution and reports.
2. Missing invoice lifecycle columns: `confirmedAt`, `confirmedByEmployeeId`, `rejectedAt`, `rejectedByEmployeeId`, `rejectionReason`, `deliveredAt`, `deliveredByEmployeeId`, `deliveryNotes` + their FKs.
3. Missing columns: `InvoiceItem.costAtSale`, `InvoiceItem.productModelId` (+ FK), `ProductModel.isSerialized`, `ProductUnit.purchasePrice`, `StockReceipt.supplierId`, `pricedByEmployeeId`, `pricedAt` (+ FKs, NOT NULL).
4. Enum drift: `InvoiceAuditAction` (+6 values), `NotificationType` (+6), `ProductUnitStatus` missing `RESERVED`, `Role` missing `ACCOUNTANT`, `StockReceiptStatus` wrong values (`FINALIZED` unused anywhere in code; code/schema use `PENDING_PRICING`).
5. Missing indexes: `Invoice_status_idx`, `InvoiceItem_productModelId_idx`, `StockReceipt_status_idx`; obsolete `InvoiceItem_cogsStatus_idx` present in DB but not in schema.
6. `Attendance.updatedAt` had a DB default contradicting Prisma's client-managed `@updatedAt`; `Expense.description` nullable in DB but `NOT NULL` in schema/DTO.
7. `InvoiceItemUnitAssignment` FKs missing/degraded (needed `ON DELETE RESTRICT ON UPDATE CASCADE` to match schema).

**Process / repo issues:**

8. Three out-of-band SQL files (`prisma/migration.sql`, `constraints.sql`, `add_role.sql`) sat beside `schema.prisma` — the only way to build a correct DB was manual execution; `constraints.sql` was in fact **never applied** to the dev DB.
9. Legacy `constraints.sql` / `migration.sql` contained **obsolete business rules** (see §10) — a naive 1:1 port would have broken working flows.
10. `prisma migrate diff` is blind to CHECK constraints and enum value *order* — drift there can only be caught with direct `pg_catalog`/psql inspection (verified: Role enum order differs from schema.prisma; Prisma does not care).

---

## 4. Migration changes

Four corrective migrations were appended (append-only strategy; no shared
historical migration was rewritten):

| Migration | Purpose |
|---|---|
| `20260924000000_reconcile_enums` | +6 `InvoiceAuditAction`, +6 `NotificationType`, `ProductUnitStatus.RESERVED`, `Role.ACCOUNTANT`, conditional rebuild of `StockReceiptStatus` → `(PENDING_PRICING, PRICED, CANCELLED)` with safe default, guarded by `IF NOT EXISTS` / named checks |
| `20260924000001_reconcile_tables_columns` | Creates `StockConsumption` (+idx/FKs); adds invoice lifecycle columns + FKs; `InvoiceItem.costAtSale`/`productModelId`; `ProductModel.isSerialized`; `ProductUnit.purchasePrice`; `StockReceipt.supplierId`/`pricedBy*`/`pricedAt` + `SET NOT NULL` (no backfill needed — column is nullable-safe) |
| `20260924000002_reconcile_indexes_nullability` | Creates 3 missing indexes, drops obsolete `InvoiceItem_cogsStatus_idx`, `Attendance.updatedAt` DROP DEFAULT, `Expense.description` SET NOT NULL, (re)applies 4 `InvoiceItemUnitAssignment` FKs with correct actions |
| `20260924000003_business_rule_constraints` | Ports **6** app-consistent CHECK constraints from legacy `constraints.sql` |

**Same-session revisions (before final validation):** three constraints were
removed from the chain after code-level proof that they contradict current
business logic:

- `20260921100000_create_stock_lot_supplier` — dropped `stock_lot_remaining_le_received` and `stock_lot_reserved_valid` from the `StockLot` DDL.
- `20260921120000_create_stock_adjustment` — dropped `stock_adjustment_quantity_positive`.
- `20260924000003_business_rule_constraints` — dropped `attendance_checkout_after_checkin`.

Rationale for each is in §10 and in `backend/prisma/legacy/README.md`. (No git
history exists for this repo — `master` has zero commits — so editing these
files rewrote nothing shared; the dev DB was rebuilt afterwards.)

---

## 5. Database changes

Dev database `pallet_pos` was **dropped and recreated** (disposable by
authorization), then built exclusively from the migration chain.

Final verified structure (via `pg_catalog`):

- **30 tables**, **15 enums** matching `schema.prisma` (StockReceiptStatus = `PENDING_PRICING, PRICED, CANCELLED`; Role includes `ACCOUNTANT`).
- **8 CHECK constraints** (all app-consistent):

  | Table | Constraint |
  |---|---|
  | ProductModel | `product_model_min_stock_non_negative`, `product_model_reserved_valid` |
  | InvoiceItem | `invoice_item_price_non_negative`, `invoice_item_quantity_positive`, `invoice_item_requires_model_and_quantity` |
  | InvoiceReturnItem | `return_amount_non_negative` |
  | Expense | `expense_amount_non_negative` |
  | StockConsumption | `stock_consumption_quantity_positive` |

  (`product_model_reserved_valid` + `invoice_item_quantity_positive` predate this work in `20260920000000_v25_migration` and were already live everywhere.)
- **58 FKs**, all `ON UPDATE CASCADE`; only `StockAdjustment_reviewedByEmployeeId_fkey` uses `ON DELETE SET NULL` (per schema).
- **77 non-PK indexes** including both partial indexes (`attendance_one_open_per_employee` → `Attendance_employeeId_open_key`, and the pending-COGS partial index).
- `Attendance.updatedAt` has **no** DB default (client-managed); `Expense.description` is `NOT NULL`.

---

## 6. Files changed / removed

**Added — `backend/prisma/migrations/`:**
- `20260924000000_reconcile_enums/migration.sql`
- `20260924000001_reconcile_tables_columns/migration.sql`
- `20260924000002_reconcile_indexes_nullability/migration.sql`
- `20260924000003_business_rule_constraints/migration.sql`

**Added — `backend/prisma/legacy/README.md`** (supersession map + constraint-by-constraint disposition).

**Edited — existing migration files** (constraint removals + comment path fixes, §4):
- `20260921100000_create_stock_lot_supplier/migration.sql`
- `20260921120000_create_stock_adjustment/migration.sql`
- `20260924000003_business_rule_constraints/migration.sql`
- `20260924000000_reconcile_enums/migration.sql` (comments only)
- `20260924000001_reconcile_tables_columns/migration.sql` (comments only)

**Moved (not deleted) — out of `backend/prisma/` into `backend/prisma/legacy/`:**
- `migration.sql` → `legacy/migration.sql`
- `constraints.sql` → `legacy/constraints.sql`
- `add_role.sql` → `legacy/add_role.sql`

**Not touched:** `schema.prisma`, all application source under `backend/src/`,
`seed.ts`, the frontend, and historical migrations `…_init` … `…_v25_*`.

---

## 7. Commands executed (key)

```text
# structural audit (representative)
psql: pg_constraint / pg_indexes / pg_typenum / information_schema queries
grep across src for every "missing" enum value / column  → usage proof

# corrective migrations written, then:
prisma migrate deploy                 # 16/16 applied (fresh + rebuilt dev DB)
prisma migrate status                 # Database schema is up to date!
prisma migrate diff --from-url <dev> --to-schema-datamodel schema.prisma --exit-code
                                      # No difference detected.
prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel schema.prisma \
  --shadow-database-url <empty> --exit-code
                                      # No difference detected.
prisma validate                       # The schema is valid
prisma generate                       # Client v5.22.0
prisma db seed                        # 5 employees, 4 suppliers, 5 customers, 5 categories, 13 products
npm run build (nest build)            # exit 0
# runtime
npm run start:dev                     # listens on :3001
# E2E API smoke (5 roles × 49 checks) — see §9
# psql verification of runtime artifacts (§9)
# cleanup: DROP DATABASE pallet_pos_fresh_test, pallet_shadow_audit (both test artifacts, dropped)
```

---

## 8. Fresh database test (from zero)

On a brand-new empty database `pallet_pos_fresh_test`:

1. `prisma migrate deploy` → **all 16 migrations applied, no errors**
2. `prisma migrate status` → *Database schema is up to date!*
3. `prisma migrate diff --from-url <fresh> --to-schema-datamodel schema.prisma` → **No difference detected**
4. `prisma migrate diff --from-migrations … --shadow-database-url <fresh>` → **No difference detected** (chain alone ≡ schema)
5. Test database dropped afterwards.

Conclusion: a machine cloning this repo can produce a correct database with
`prisma migrate deploy` alone — no manual SQL, no `db push`.

## 11. Follow-up application audit — 2026-09-27

The follow-up system audit is documented in `FULL_SYSTEM_AUDIT.md`. No schema
or migration files were changed in this pass. Application-level repairs include
atomic invoice and stock-adjustment state transitions, post-commit delivery
notifications, the attendance correction invariant, and authenticated SSE for
invoice lifecycle synchronization.

Validation in this pass: `prisma validate`, `prisma migrate status`, and
`prisma generate` passed; backend unit tests passed (71 passed),
backend and frontend builds passed, and the invoice lifecycle E2E suite passed
(15 passed, 0 skipped). Invoice creation idempotency is now covered by the
active E2E suite. Fresh-database replay, browser-level four-role
real-time testing, and reconnect testing remain follow-up work rather than
claimed results.

---

## 9. Runtime test (smoke)

Backend built and started (`:3001`). Scripted E2E against the live API with 5
role tokens (`admin`, `sales`, `accountant`, `inventory`, `kiosk1`):

| Flow | Result |
|---|---|
| Auth: 5 logins, JWT roles (incl. `ACCOUNTANT`) | PASS |
| Catalog reads: employees, categories, suppliers, customers, product-models, inventory-count, dashboard, workplaces, settings | PASS |
| Receipt (non-serialized, qty 20) → `PENDING_PRICING` → price lot → `PRICED` (`pricedByEmployeeId`/`pricedAt` set) | PASS |
| Receipt (serialized, 2 barcodes) → price units → `PRICED` | PASS |
| **Signed adjustment `quantity = -3`** created & approved (`reviewedByEmployeeId`/`reviewedAt` set) | PASS — proves obsolete `quantity > 0` constraint is really gone |
| Invoice create (2 items: non-serialized + serialized) → reserves stock, audit `STOCK_RESERVED` → `SENT_FOR_ACCOUNTANT_REVIEW`, notification `INVOICE_PENDING_REVIEW` | PASS |
| Confirm (accountant) → `confirmedAt` set, `StockConsumption` row created, status `CONFIRMED`, audit `CONFIRMED` | PASS |
| Delivery: queue/details → scan 1 unit → over-scan of 2nd unit rejected with `SCANNED_QUANTITY_EXCEEDS_REQUIRED` (correct business rule) → deliver → `deliveredAt`, unit `SOLD`, audit `UNIT_SCANNED` + `DELIVERED` | PASS |
| Reject second invoice → reservations released, status `CANCELLED` | PASS |
| Expense category + expense create (`amount` CHECK, `description` NOT NULL) | PASS |
| Reports: revenue, **net-profit with COGS**, expenses | PASS |
| Attendance: kiosk issues QR → admin scans → row created → admin list/me-today | PASS |
| Notifications: new enum types observable (`INVOICE_PENDING_REVIEW`, `DELIVERY_PENDING`) | PASS |

**DB-evidence of runtime artifacts (psql):**

- `Invoice` rows show `confirmedAt`/`deliveredAt` populated; `CANCELLED` row for the reject path.
- `StockConsumption` created by confirm; on an **unpriced** lot → `unitCost NULL` + item `cogsStatus PENDING` (correct deferred-COGS behavior).
- Pricing that receipt afterwards auto-resolved the consumption (`unitCost 25`, `totalCost 50`) and flipped the item to `costAtSale 25`, `cogsStatus FINAL`; `net-profit.cogs` rose 500 → 550 accordingly.
- Serialized COGS: delivered unit's `purchasePrice` → `InvoiceItem.costAtSale 500`, `FINAL`.
- `ProductUnit` transitions `AVAILABLE → RESERVED/SOLD`; `InvoiceItemUnitAssignment` rows exist; `StockAdjustment` row `APPROVED` with `quantity -3`; `StockReceipt` rows carry `supplierId` and `pricedAt`.

**Score: 49/49 expected behaviors** (the script's raw counter showed 1 "FAIL",
which was a wrong test expectation — scanning more units than sold *must* be
rejected; the app returned the documented error code).

Note: the dev DB also contains additional receipts/invoices created manually
via the running frontend during this session (user testing) — data is
disposable and does not affect any finding.

---

## 10. Remaining issues

### CRITICAL
- **None.** Chain reproduces schema; backend builds and runs; no drift.

### HIGH
- **None.**

### MEDIUM
1. **`correctAttendance` checkIn-only gap** (`attendance.service.ts`): when only `checkIn` is supplied and it is moved past the existing `checkOut`, no validation runs — the app would write `checkIn > checkOut`. The legacy `attendance_checkout_after_checkin` CHECK would have converted this into a 500 instead, so it was **not** ported to preserve current behavior. Recommended fix: validate in the service (compare against `finalCheckOut`), then optionally add the constraint in a future migration.
2. **Prisma cannot manage CHECK constraints** — they are invisible to `migrate diff`, so future drift in CHECKs is only detectable via psql/`pg_constraint` (or raw SQL in migrations, which is what we now use). Keep verifying with the queries in §5 when touching constraints.
3. **Legacy files remain runnable by mistake:** `backend/prisma/legacy/*.sql` are archived but not inert. Anyone executing `legacy/constraints.sql` would re-introduce the three contradictory constraints. The folder README warns against this; consider renaming to `*.sql.do-not-run` if that becomes a concern.

### LOW
1. **Role enum value order** in the DB differs from `schema.prisma` (added last vs listed earlier). Prisma ignores enum value order (proven by `migrate diff`); cosmetic only.
2. **`InvoiceItem_cogsStatus_idx` intentionally dropped** (boolean column, not in schema; low cardinality). If a query plan ever degrades, the raw-SQL predicate index from the legacy file can be re-added via a migration.
3. **`net-profit.pendingCogsInvoicesCount`** semantics (exact invoice-counting rule) were not exhaustively asserted; unrelated to schema.
4. Historical migration comments referencing the old `prisma/…` paths were updated only in files already being edited; older headers still *historically* mention `prisma/migration.sql` (now `prisma/legacy/migration.sql`) — comment-only, harmless.

---

## 11. Business logic impact

**No application code was changed, and no intended behavior was altered.** The
migration chain was bent around the application, not vice-versa:

- **Signed stock adjustments preserved.** `CreateStockAdjustmentDto` accepts any non-zero integer (documented example `-5`); `createAdjustment` rejects only zero; `approveAdjustment` applies the signed delta with its own `>= 0` guard. Porting legacy `quantity > 0` would have made every damage/loss adjustment fail — verified live by creating and approving a `-3` adjustment.
- **Lot accounting preserved.** Positive adjustments may raise `quantityRemaining` above `quantityReceived`, and may lower it below `quantityReserved` — both states forbidden by the legacy compound checks, hence those checks were excluded. `StockConsumption.quantity > 0` was kept (always created from positive invoice quantities).
- **Deferred COGS preserved.** Consumption on an unpriced lot stays `unitCost NULL` / `PENDING` and is auto-resolved when the receipt is priced — verified end-to-end (NULL → 25/50 → `FINAL`, report cogs 500 → 550).
- **Delivery state machine preserved:** over-scanning is rejected by app rule (not by a DB constraint), delivery completes with unit assignment; subsequent scans blocked (`INVOICE_NOT_CONFIRMED` after delivery).
- **Attendance correction flows preserved** (see MEDIUM #1 — constraint omitted rather than forcing app changes).
- **Serialized-sales architecture untouched** (`productModelId + quantity` model, no unit selection at sale time).
- Enum, index, nullability and FK-action changes only bring the DB **to** what the code already expects; the E2E smoke confirms end-to-end flows (create → review → confirm → scan → deliver, receipt → pricing, adjustment approval, kiosk attendance, expenses, reports).

---

## 12. Objective verification table

| # | Objective | Method | Result | Confidence |
|---|---|---|---|---|
| 1 | Full audit of migration files vs `schema.prisma` vs DB | File reads + `pg_catalog` queries + usage greps | Done — §3 | High |
| 2 | Migration history repaired (no drift) | `migrate deploy` 16/16 + `migrate status` + `migrate diff` (dev & shadow) | **No difference detected** | **High** |
| 3 | Corrective SQL is guarded/idempotent | Every statement `IF NOT EXISTS` / named-constraint DO block / `ADD VALUE IF NOT EXISTS`; conditional enum rebuild | Done | High |
| 4 | No reliance on out-of-band SQL | 3 files archived to `prisma/legacy/` + README; `prisma/` now contains only `schema.prisma`, `seed.ts`, `migrations/`, `legacy/` | **PASS** | High |
| 5 | No hand-applied DDL required | Fresh DB built by `deploy` alone (§8) | **PASS** | High |
| 6 | `prisma validate` / `generate` | Both run | **PASS** | High |
| 7 | Backend builds | `nest build` exit 0 | **PASS** | High |
| 8 | Backend runs | Server listens on :3001; seeded logins work | **PASS** | High |
| 9 | Runtime smoke (representative endpoints, per-role auth) | 49/49 expected behaviors incl. full invoice lifecycle, COGS, adjustments, attendance, expenses, reports | **PASS** | High |
| 10 | Business logic preserved (no constraint breaks app flows) | Code-path analysis + live negative-quantity adjustment + deferred COGS resolution test | **PASS** | High |
| 11 | Legacy constraints disposition documented | `prisma/legacy/README.md` + §10 + migration comments | **PASS** | High |
| 12 | Test artifacts cleaned up | `pallet_pos_fresh_test`, `pallet_shadow_audit` dropped; only `pallet_pos` remains for this project | **PASS** | High |

**Overall: PASS** — with two documented, intentional omissions (three legacy
CHECKs excluded by design; see §4/§10) and one pre-existing app-level gap
recommended for a future code fix (MEDIUM #1).
