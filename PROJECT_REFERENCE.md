# PROJECT_REFERENCE.md

> Permanent source of truth for the Pallet monorepo. Update this file across sessions.
> Invented or unverified behavior must be marked `NEEDS CLARIFICATION`.

---

## 1. Project Overview

**Pallet** — POS, Invoicing & Serialized Inventory Management System for an Egyptian retail business (currency EGP, timezone Africa/Cairo).

- Monorepo: `backend/` (NestJS API) + `frontend/` (React/Vite SPA) + `design.md` (product/design spec) + `.planning/plans/` (design docs such as `branding-settings-logo.md`).
- Core workflows:
  - Sales creates invoices (serialized and non-serialized lines) → Accountant reviews/confirms/rejects → Inventory scans serialized units and delivers → change requests (returns, price changes, add/remove items) are approved by Admin → reports/dashboard aggregate financial KPIs.
  - Inventory receives shipments (serialized units + non-serialized stock lots), prices them, adjusts stock, searches units by barcode.
  - Attendance via QR kiosk (check-in/out, admin corrections).
- Roles: `ADMIN`, `ACCOUNTANT`, `SALES`, `INVENTORY`, `ATTENDANCE_KIOSK` (`backend/prisma/schema.prisma:10-16`).

---

## 2. Technology Stack

### Backend (`backend/`)
| Layer | Choice |
|---|---|
| Framework | NestJS `^10.4.0` |
| ORM | Prisma `^5.20.0` (PostgreSQL) |
| Auth | JWT via `@nestjs/jwt` + `passport-jwt`; access token (default 15m via env), refresh token `7d` (`JWT_REFRESH_EXPIRATION`, `auth.service.ts:234`); password hashing `argon2` |
| Validation | Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`, implicit conversion) — `main.ts:27-36` |
| Error handling | Global `GlobalExceptionFilter` — `main.ts:14` |
| API docs | Swagger at `/api/docs`, non-production only — `main.ts:38-47` |
| Global prefix | `api` — `main.ts:13` |
| CORS | `CORS_ORIGINS` env, defaults `localhost:5173/5174`, `credentials: true` — `main.ts:22-25` |
| Port | `PORT` env, default `3001` — `main.ts:49-50` |
| File uploads | `multer` disk storage to `uploads/`, served as static `/uploads` — `main.ts:16-20`, `settings.controller.ts` |
| Present but unused | `puppeteer`, `handlebars` (PDF not implemented anywhere under `src/`) |

### Frontend (`frontend/`)
| Layer | Choice |
|---|---|
| Framework | React `^19.2.8` + Vite `^8.3.0` |
| Routing | `react-router-dom` `^7.18.4` (role-guarded routes in `App.tsx`) |
| HTTP | `axios` (single instance `frontend/src/lib/api.ts`) |
| Styling | Tailwind CSS `^4.3.3` (`@tailwindcss/vite`) + heavy inline styles |
| Notifications | `sonner` |
| Lint | `oxlint` (`npm run lint`) |
| Export | `exceljs` (client-side Excel generation, `ExcelExportButton.tsx`) |
| QR/barcode | `qrcode`, `jsqr` |
| Installed but unused | `@tanstack/react-query` (all data fetching is manual `useEffect` + `axios`) |
| i18n | Custom context (`src/i18n/context`, `en`/`ar`) — `NEEDS CLARIFICATION` on completeness |

### Tooling / Scripts
- Backend: `npm run start:dev`, `build`, `lint` (eslint), `test` (jest), `test:e2e` (jest e2e config), `prisma:migrate`, `prisma:seed`.
- Frontend: `npm run dev`, `build` (`tsc -b && vite build`), `lint` (oxlint). **No test script** — frontend has zero tests.

---

## 3. Architecture

```
Browser (React SPA)
  │  axios + JWT access token (localStorage), auto-refresh interceptor
  ▼
NestJS API  (global prefix /api, ValidationPipe, GlobalExceptionFilter, JwtAuthGuard+RolesGuard)
  │  Prisma transactions
  ▼
PostgreSQL  (pallet_pos; migrations in backend/prisma/migrations; raw SQL constraints in prisma/constraints.sql)
```

- Module registry (`backend/src/app.module.ts`): Prisma, Auth, Employees, Workplaces, Categories, ProductModels, ProductUnits, StockReceipts, Suppliers, StockItems, Customers, Invoices, InvoiceDelivery, InvoiceChangeRequests, Expenses, ExpenseCategories, Attendance, Dashboard, Reports, Notifications, Settings, Audit.
- Auth pipeline: `JwtStrategy.validate` re-reads employee from DB every request for `isActive` and role freshness (`jwt.strategy.ts:20-42`); `RolesGuard` blocks `ATTENDANCE_KIOSK` unless the endpoint explicitly lists it (`roles.guard.ts:19-27`).
- Frontend route guards in `App.tsx`: `RoleRoute`, `PublicRoute`, `KioskRoute`, `EmployeeRoute`; home redirect by role (`HomeRedirect`).
- Cross-cutting: notifications created inside/outside transactions (see Known Issues), audit logs (`InvoiceAuditLog`, `ProductUnitAuditLog`, `SystemAuditLog`), settings singleton `AppSetting` (id=1), invoice number sequence `InvoiceSequence` (id=1).

---

## 4. Data Model

Prisma schema: `backend/prisma/schema.prisma`. Raw DB constraints: `backend/prisma/constraints.sql`.

### Core entities
- **Category** → **ProductModel** (`isSerialized`, `reservedQuantity`, `minStockAlert`, soft delete `deletedAt`; unique `[categoryId, name]`).
- **ProductUnit** (serialized stock): `barcode` unique, `status: AVAILABLE | RESERVED | SOLD | DAMAGED`, `purchasePrice`, `version` (optimistic locking).
- **Supplier** → **StockReceipt** (`status: PENDING_PRICING | PRICED | CANCELLED`) → **StockReceiptItem** (links one `productUnit` per row) and **StockLot** (non-serialized: `quantityReceived/Remaining/Reserved`, `purchasePrice`).
- **StockConsumption** (per `invoiceItem` × `stockLot`, `unitCost`, `totalCost`) — COGS source.
- **StockAdjustment** (type enum, optional `stockLotId`, reason) — correction log; does **not** by itself change stock counters except when a lot is updated.
- **Customer** (`type: INDIVIDUAL | COMPANY`).
- **Invoice** → **InvoiceItem** (always `productModelId` + `quantity`; v2.5 constraint `invoice_item_requires_model_and_quantity`) → **InvoiceItemUnitAssignment** (scan-time serialized binding, reversible via `reversedAt`), **InvoicePriceAdjustment**, **InvoiceReturn** → **InvoiceReturnItem** (per `productUnit` refund).
- **InvoiceChangeRequest** (`type: EDIT | FULL_RETURN | PARTIAL_RETURN`, `status: PENDING | APPROVED | REJECTED`) → **InvoiceChangeRequestItem** (`action: ADD_ITEM | REMOVE_ITEM | CHANGE_PRICE | RETURN_ITEM`).
- **Employee** (role, `passwordHash`, single `refreshToken` hash, soft delete), **Workplace** (geofence `latitude/longitude/radiusMeters`), **Attendance** (`status` enum incl. LATE/ABSENT/EARLY_LEAVE/OVERTIME — only `PRESENT` is ever set in code).
- **Expense** / **ExpenseCategory** (soft delete `deletedAt`).
- **Notification** (types incl. LOW_STOCK with `dedupeKey` unique per employee), **IdempotencyKey** (model exists, **no code path uses it**), **InvoiceSequence**, **AppSetting**.

### Status / state machines
- Invoice: `PENDING_ACCOUNTANT → CONFIRMED → DELIVERED`; `PENDING_ACCOUNTANT → CANCELLED` (reject). No transition out of `DELIVERED`; no cancel path for `CONFIRMED`.
- ProductUnit: `AVAILABLE → SOLD` via delivery scan; sold units returned → `AVAILABLE`; `AVAILABLE ↔ DAMAGED`.
- StockReceipt: `PENDING_PRICING → PRICED`.
- Change request: `PENDING → APPROVED | REJECTED`.

---

## 5. Business Rules

| # | Rule | Where |
|---|---|---|
| 1 | Invoice totals: `subtotal = Σ price×qty`; percentage discount clamped 0–100; fixed discount ≥0; `total = max(0, subtotal − %discount − fixed)`; `originalTotal = subtotal`, `currentTotal = total`. Float (not Decimal) arithmetic in JS. | `invoices.service.ts:39-56` |
| 2 | Serialized availability = `count(AVAILABLE units) − model.reservedQuantity`; non-serialized = `Σ(quantityRemaining − quantityReserved)` across lots. Checked **outside** the create transaction. | `invoices.service.ts:95-123` |
| 3 | On create: serialize → `ProductModel.reservedQuantity += qty`; non-serialized → FIFO reserve lots by `receivedDate`; invoice status starts `PENDING_ACCOUNTANT`; number = `INV-` + zero-padded `InvoiceSequence` (`AppSetting.invoicePrefix` is **not used**). | `invoices.service.ts:133-253` |
| 4 | Confirm (accountant): for non-serialized items consume reserved lots FIFO, create `StockConsumption` with lot `purchasePrice`, set `costAtSale`/`cogsStatus=FINAL`. Serialized units untouched until scan. | `invoices.service.ts:302-406` |
| 5 | Reject: releases reservations (serialized `reservedQuantity -= qty`, non-serialized lots `quantityReserved -=`), status `CANCELLED`, requires reason (reason validation: controller-level; `NEEDS CLARIFICATION` on strict DTO). | `invoices.service.ts:408-527` |
| 6 | Delivery scan: binds specific `ProductUnit` to `InvoiceItem`, unit `AVAILABLE→RESERVED→SOLD` on deliver; all serialized line quantities must be scanned before `DELIVERED`. | `invoice-delivery` module |
| 7 | Change requests only on `CONFIRMED` or `DELIVERED` invoices; only one pending request per invoice; actions validated per type (return/remove need `invoiceItemId`+`productUnitId`; add needs model+qty and rechecks stock; price needs `invoiceItemId`+`proposedPrice ≥ 0`). `reason` presence/length is **not validated** (interface-only DTO). | `invoice-change-requests.service.ts:43-111`, `dto/invoice-change-request.types.ts` |
| 8 | Approve dispatch: if any return/remove item → return path; else if any add → add path; else if any price change → price path (mixed-action requests process **only the first matching branch**). | `invoice-change-requests.service.ts:289-304` |
| 9 | Return approval: unit must be SOLD and actively assigned; refund `= invoiceItem.price` (base price — **ignores discounts and price adjustments**); unit `SOLD→AVAILABLE` (version-checked); `currentTotal -= refundTotal`; full-vs-partial determined by `returnItems.length === invoice.items.length` (unit-count vs line-count mismatch). | `invoice-change-requests.service.ts:370-605` |
| 10 | Non-serialized items **cannot be returned** (`NON_SERIALIZED_RETURN`). | `invoice-change-requests.service.ts:403-408` |
| 11 | Price-change approval: effective price = latest adjustment `newPrice` else base `price`; creates `InvoicePriceAdjustment`; `currentTotal += Σdelta`. | `invoice-change-requests.service.ts:611-709` |
| 12 | Add-item approval: rechecks stock, reserves stock (serialized counter / FIFO lots), audits `ITEM_ADDED`, marks APPROVED — but **never creates `InvoiceItem` rows and never updates `currentTotal`**; post-approval low-stock recalc uses `addItem.productUnitId` (always null for ADD_ITEM). | `invoice-change-requests.service.ts:714-889` |
| 13 | Reports only count `DELIVERED` invoices; date range parsed as UTC `new Date(from)` with inclusive end `+1 day` (`parseAndValidateDateRange`). Revenue `netSales = originalSales + adjustments − returns` (**does not subtract invoice-level discounts**). Net profit `= netSales − expenses − COGS` (design.md states `Net sales − expenses` — **discrepancy**). | `reports.service.ts:26-89,254-308`; `design.md` §9.11 |
| 14 | Currency forced `EGP`, timezone forced `Africa/Cairo` on settings update (`currency`/`timezone` fields stripped). | `settings.service.ts:49-57` |
| 15 | Attendance: one open session per employee (partial unique index in `constraints.sql`); check-in blocked if already open or already closed today (timezone-aware day bounds); rate limit 12 scans/min per employee (in-memory Map). Geofence fields exist but are never enforced on scan. | `attendance.service.ts`, `constraints.sql` |
| 16 | Kiosk QR tokens (`QrTokenService`) issue short-lived `CHECK_IN`/`CHECK_OUT` tokens bound to workplace+kiosk; kiosk role can only hit endpoints that explicitly allow `ATTENDANCE_KIOSK`. | `attendance.service.ts:115-227` |
| 17 | Expenses: soft delete; category hard-deletes only when no expenses else soft delete; **no `amount > 0` validation in service** (DB check `expense_amount_non_negative` exists); list `endDate` applied via `lte = new Date(endDate)` (date-only → midnight, excludes most of the end day). | `expenses.service.ts`, `constraints.sql` |
| 18 | Seed (`prisma/seed.ts`) **wipes the entire database** then creates 4 role users + kiosk with well-known passwords (`admin/admin123`, etc.). | `seed.ts:6-39,53-57` |

---

## 6. API Reference

Base URL: `http://localhost:3001/api` (Swagger `/api/docs`, non-prod). All endpoints below require `Authorization: Bearer <accessToken>` unless noted. Errors: `{ code, message }` style via `GlobalExceptionFilter`. Common list shape: `{ data, meta: { page, limit, total, totalPages } }`.

### Auth (`/api/auth`)
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/auth/login` | Public | `{username,password}` → tokens + employee summary |
| POST | `/auth/refresh` | Public | `{employeeId?, refreshToken}`; if `employeeId` present, JWT expiry of refresh token is **not verified** (only argon2 hash match) |
| POST | `/auth/logout` | Authenticated | Clears stored refresh token |
| POST | `/auth/change-password` | Authenticated | Requires current password; revokes refresh token |
| GET | `/auth/profile` | Authenticated | Current employee profile |

### Employees / Workplaces
| Method | Path | Roles | Notes |
|---|---|---|---|
| CRUD | `/employees` | ADMIN | Create/update with role, password, `workplaceId`; soft delete |
| CRUD | `/workplaces` | ADMIN | Includes geofence `latitude/longitude/radiusMeters` |

### Catalog / Inventory
| Method | Path | Roles | Notes |
|---|---|---|---|
| CRUD | `/categories` | INVENTORY, ADMIN | Soft delete |
| CRUD | `/product-models` | INVENTORY, ADMIN | `isSerialized`, `minStockAlert`; delete sets `isActive=false`, `deletedAt` |
| GET | `/product-models` | Authenticated | Used by NewInvoice to list non-serialized models |
| CRUD | `/product-units` | INVENTORY, ADMIN | Receive serialized units (barcode uniqueness enforced) |
| GET | `/product-units/barcode/:barcode` | Authenticated | Unit lookup by barcode |
| GET | `/product-units/inventory-count` | Authenticated | Aggregates by model |
| CRUD | `/suppliers` | INVENTORY, ADMIN | |
| GET/POST | `/stock-items` | INVENTORY, ADMIN | Non-serialized stock views / adjustments |
| CRUD/POST | `/stock-receipts` | INVENTORY, ADMIN | Create receipt (PENDING_PRICING), price it (→ PRICED), links units + creates lots |
| POST | `/stock-adjustments` | INVENTORY, ADMIN | Type enum + optional lot; reason required |

### Customers / Invoices / Delivery
| Method | Path | Roles | Notes |
|---|---|---|---|
| CRUD | `/customers` | SALES, ADMIN, ACCOUNTANT | Soft delete |
| POST | `/invoices` | SALES, ADMIN | Create with items/discounts → `PENDING_ACCOUNTANT`, reserves stock |
| GET | `/invoices` | Authenticated (SALES sees all; `NEEDS CLARIFICATION` on scoping) | Filters: number, barcode, dates, customer, employee, status, page/limit |
| GET | `/invoices/pending-review` | ACCOUNTANT, ADMIN | Queue |
| GET | `/invoices/delivery-queue` | INVENTORY, ADMIN | CONFIRMED invoices |
| GET | `/invoices/:id` | Authenticated | Full detail incl. `consumptions.purchasePrice`, `costAtSale` (COGS visible to non-admin roles) |
| POST | `/invoices/:id/confirm` | ACCOUNTANT, ADMIN | Consumes non-serialized reservations |
| POST | `/invoices/:id/reject` | ACCOUNTANT, ADMIN | Releases reservations; reason |
| GET | `/invoices/:id/audit-log` | Authenticated | No role restriction in service/controller |
| POST | `/invoice-delivery/scan` | INVENTORY, ADMIN | Bind unit to line by barcode |
| POST | `/invoice-delivery/unscan` | INVENTORY, ADMIN | Reverse binding |
| POST | `/invoice-delivery/:id/deliver` | INVENTORY, ADMIN | Requires all serialized lines fully scanned |

### Change Requests
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/invoice-change-requests/:invoiceId` | SALES, INVENTORY | Body is TS interface, **not class-validated** → ValidationPipe whitelist/forbid bypassed for this route (`NEEDS CLARIFICATION` on controller decorator usage) |
| GET | `/invoice-change-requests` | Authenticated | Status/page/limit; **no employee scoping** — any authed user can list all requests |
| GET | `/invoice-change-requests/my` | Authenticated | Client-side filter or server filter `NEEDS CLARIFICATION` (frontend `MyRequests` fetches all then filters) |
| GET | `/invoice-change-requests/:id` | Authenticated | |
| POST | `/invoice-change-requests/:id/approve` | ADMIN | Dispatches to return/add/price transaction |
| POST | `/invoice-change-requests/:id/reject` | ADMIN | `adminNote` optional in practice (`NEEDS CLARIFICATION` on required reason) |

### Expenses / Attendance / Reports / Dashboard / Notifications / Settings / Audit
| Method | Path | Roles | Notes |
|---|---|---|---|
| CRUD | `/expenses`, `/expense-categories` | ACCOUNTANT, ADMIN | `amount` not service-validated |
| POST | `/attendance/scan` | Employee roles (kiosk issues QR) | `{employeeId, employeeRole, token}` |
| POST | `/attendance/kiosk/qr` | ATTENDANCE_KIOSK (explicit allow) | Issues CHECK_IN/CHECK_OUT token |
| GET | `/attendance` | ADMIN, etc. | Filters employee/dates/page |
| GET | `/attendance/my-today` | Authenticated | |
| GET | `/attendance/stats/:employeeId` | ADMIN | `daysAbsent = records-with-checkout` deficit (misleading, see issues) |
| POST | `/attendance/:id/correct` | ADMIN | Requires reason ≥5 chars; writes SystemAuditLog |
| GET | `/reports/revenue` \| `/expenses` \| `/net-profit` \| `/employees-sales` \| `/products-sales` \| `/returns` \| `/customers` \| `/suppliers` + `/details` variants | ADMIN (ACCOUNTANT for expenses per frontend routes) | All require `from`/`to` `YYYY-MM-DD` |
| GET | `/dashboard/summary` | Authenticated (no `@Roles` in module — `NEEDS CLARIFICATION` on guard) | KPIs: netSales, expenses, cogs, netProfit, lowStock, pending change requests |
| GET | `/notifications` | Authenticated | Paginated; mark-read endpoints |
| GET | `/settings` | Authenticated | Full settings |
| GET | `/settings/brand` | **Public** | name/address/phone/logo only |
| PATCH | `/settings` | ADMIN | Strips `currency`/`timezone`/`logoUrl` |
| POST/DELETE | `/settings/logo` | ADMIN | Multer upload PNG/JPG/WEBP/SVG |
| GET | `/audit/system` | ADMIN | Merges system/invoice/unit audit sources |
| GET | `/reports/inventory` | ADMIN | Point-in-time warehouse stock snapshot (serialized unit counts + non-serialized lot sums); filters `categoryId`/`productModelId`/`search`/`page`/`limit` (limit capped 100) |

---

## 7. Frontend Map

Entry: `frontend/src/main.tsx` → `App.tsx` routes.

| Route | Component (`frontend/src/...`) | Role | Primary API |
|---|---|---|---|
| `/login` | `pages/Login` | Public | `POST /auth/login` |
| `/kiosk/login`, `/kiosk` | `pages/kiosk/*` | ATTENDANCE_KIOSK | auth + attendance QR |
| `/` | `HomeRedirect` | by role | — |
| `/unit-search` | `pages/inventory/UnitSearch` | SALES, INVENTORY | product-units barcode |
| `/sales/new-invoice` | `pages/sales/NewInvoice` | SALES | customers, product-models, `POST /invoices` |
| `/sales/invoice-search` | `pages/sales/InvoiceSearch` | SALES | `GET /invoices` (barcode/number) |
| `/sales/invoice/:id` | `pages/sales/InvoiceDetail` | SALES | invoice detail, change requests, audit (admin-only visibility client-side) |
| `/sales/customers` | `pages/sales/Customers` | SALES | customers CRUD |
| `/sales/my-requests` | `pages/sales/MyRequests` | SALES | change requests (fetch-all + client filter) |
| `/sales/attendance` | `pages/sales/Attendance` | SALES | attendance my/today, scan |
| `/inventory/receive-shipment` | `pages/inventory/ReceiveShipment` | INVENTORY | stock-receipts |
| `/inventory/stock` | `pages/inventory/Stock` | INVENTORY | stock-items |
| `/inventory/categories-models` | `pages/inventory/CategoriesModels` | INVENTORY | categories, product-models |
| `/inventory/unit-search` | `pages/inventory/UnitSearch` | INVENTORY | product-units |
| `/inventory/delivery` | `pages/inventory/InvoiceDelivery` | INVENTORY | invoice-delivery queue/scan/deliver |
| `/inventory/stock-adjustments` | `pages/inventory/StockAdjustments` | INVENTORY | stock-adjustments |
| `/accountant/pending-invoices` | `pages/accountant/PendingInvoices` | ACCOUNTANT | pending review, confirm/reject |
| `/accountant/expenses` | `pages/accountant/Expenses` | ACCOUNTANT | expenses |
| `/admin/*` | `pages/admin/*` + `features/reports` | ADMIN | dashboard, change-requests approve/reject, invoices, employees, attendance, expenses, suppliers, customers, stock-pricing, reports, audit, settings, notifications |
| `/admin/reports/inventory` | `features/reports/pages/InventoryReportPage` | ADMIN | `GET /reports/inventory` warehouse stock snapshot (KPIs, filters, print, Excel) |
| `/reports/*` | `features/reports` | ADMIN, ACCOUNTANT | reports (index + expenses for accountant) |

State/auth: `lib/auth.tsx` (localStorage tokens, refresh interceptor in `lib/api.ts`, `hasRole`). Settings/brand: `lib/settings.tsx`. i18n: `i18n/context`. Toasts: `lib/notify.tsx` (sonner).

Notable UI implementation details:
- `NewInvoice.tsx`: scanner UI is **commented out** (lines 9–10, 386–411); non-serialized manual add form works; save payload sends `productModelId/quantity/price` per line (serialized qty forced to 1); lines with `price <= 0` are silently dropped from the POST (`validLines` filter, line 211) while still shown in UI totals.
- `ExcelExportButton.tsx` generates `.xlsx` entirely client-side via exceljs (no backend export endpoint).
- RTL/layout: `components/Layout` uses `ml-64` / `left-0` positioning (`NEEDS CLARIFICATION` on RTL completeness).

---

## 8. Known Issues Log

ID | Category | Severity | Location | Description | Suggested Fix | Status
---|---|---|---|---|---|---
ISS-001 | Logic/Business | Critical | `invoice-change-requests.service.ts` (`approveAddItemTransaction`) | Approval never creates `InvoiceItem` rows and never updates `invoice.currentTotal`; only reserves stock and writes audit/notification. Invoice appears unchanged; reserved stock leaks on later reject of unrelated requests. | Rewrote as Phase 1 (validate all items, auto-reject with zero mutations if any stock insufficient) + Phase 2 (reserve stock FIFO, create `InvoiceItem` per add, increment `currentTotal` by `Σ proposedPrice×quantity`, audit, approve). Auto-reject now happens before any reservation so no partial stock leak. | Fixed 2026-09-23 — two-phase validate-then-mutate inside one `$transaction`; regression tests in `invoice-change-requests.service.spec.ts` |
ISS-002 | Logic/Business | Critical | `invoice-change-requests.service.ts` (post-approval low-stock recalc) | Post-approval low-stock recalc reads `tx.productUnit.findUnique({ where: { id: addItem.productUnitId } })` but `ADD_ITEM` items have `productUnitId = null` → Prisma validation error aborted the whole approval transaction. | Low-stock recalc now keys off `addItem.productModelId` / planned model id, with separate paths for serialized (`productUnit.count`) and non-serialized (`stockLot.aggregate`) availability. | Fixed 2026-09-23 — same rewrite as ISS-001; test asserts `productUnit.findUnique` is never called |
ISS-003 | Logic | High | `invoice-change-requests.service.ts:289-304` | `approve()` dispatches to only one handler (return > add > price). A request containing e.g. `RETURN_ITEM` + `CHANGE_PRICE` silently skips the price change but is marked APPROVED. | Process **all** action groups sequentially in one transaction (or forbid mixed actions at create). | Open
ISS-004 | Business/Finance | High | `invoice-change-requests.service.ts` (return approval refund calc) | Refund used base `invoiceItem.price`, ignoring invoice-level `discountPercentage`/`discountAmount` and any `InvoicePriceAdjustment` effective price. Refunds over-credit on discounted invoices; `currentTotal` decrement then inconsistent with what customer paid. | Compute refund from effective line price after adjustments, then allocate invoice-level discount proportionally; store refund on each `InvoiceReturnItem` accordingly. | Fixed 2026-09-23 — payment-ratio method: effective price × (currentTotal / adjustedSubtotal); per-unit refund stored on create; tests in `invoice-change-requests.service.spec.ts` |
ISS-005 | Logic | High | `invoice-change-requests.service.ts:425-434` | `existingReturn` checks `findFirst({ invoiceItemId })` — blocks returning a **second unit of the same line** (multi-quantity line) with "Unit already returned", even though a different `productUnitId` is being returned. | Filter by `productUnitId` (or check assignment/`productUnit.status === SOLD` only). | Fixed 2026-09-23 — `existingReturn` now filters by `{ invoiceItemId, productUnitId }`; regression test covers same-line different-unit allowance |
ISS-006 | Logic | Medium | `invoice-change-requests.service.ts:527` | Full-vs-partial flag compares `returnItems.length` (unit rows) to `invoice.items.length` (line rows). For a line with quantity 2, returning 1 unit can be misclassified (and vice versa). | Compare returned quantities per line vs `InvoiceItem.quantity`, or compare distinct `invoiceItemId` sets. | Open
ISS-007 | Concurrency | High | `invoices.service.ts:95-123` vs `133-176` | Serialized/non-serialized stock availability is checked **outside** `$transaction`; reservation happens later inside it. Two concurrent creates can both pass the check and both increment `reservedQuantity`/lot reservations → oversell; non-serialized path re-checks FIFO inside tx (safer), serialized path only increments blindly. | Move availability check inside the transaction and use conditional updates (`updateMany` with `reservedQuantity` headroom) or DB-level constraints/row locks. | Fixed 2026-09-23 — authoritative checks + atomic `updateMany` (headroom conditions) inside `$transaction`; loser gets ConflictException; tests in `invoices.service.spec.ts` |
ISS-008 | Concurrency | Medium | `invoice-change-requests.service.ts:278-287` (approve), `315-324` (reject) | `status !== PENDING` check runs before the transaction; two concurrent admin actions can both pass and double-execute side effects (unit status guard mitigates returns but not add/price paths). | Perform status check + conditional `updateMany({ where: { id, status: PENDING } })` inside the transaction and abort if `count === 0`. | Open
ISS-009 | Finance/Reporting | High | `reports.service.ts:78-88` (`privateComputeRevenueData`) | Revenue/netSales = Σ(price×qty) over delivered invoice items + adjustments − returns; **never subtracts invoice-level `discountAmount`/`discountPercentage`**. Overstates revenue whenever discounts are used. Customer report (`computeCustomers`) instead sums `currentTotal` (discount-aware) → inconsistent numbers across reports. | Either include per-invoice discount allocation in revenue aggregation or standardize all reports on `currentTotal`-based net. | Open
ISS-010 | Finance | High | `reports.service.ts:304`, `design.md` §9.11 | Net profit implemented as `netSales − expenses − COGS`; design says `Net sales − expenses` and "never label as gross profit". Dashboard summary (`reports.service.ts:971`) matches the code, not the design doc. | Align code and design: confirm intended formula; if COGS subtraction is intended, update design.md; label output clearly. | Open
ISS-011 | Timezone | High | `reports.service.ts:30-40` | `new Date('YYYY-MM-DD')` = UTC midnight; inclusive end via `setUTCDate(+1)`. Africa/Cairo days start 21:00/22:00Z previous day → early-morning local sales fall outside the requested range. Invoice list uses server-local `T00:00:00`/`T23:59:59.999` (`invoices.service.ts:13-37`); attendance uses correct tz helpers (`attendance.service.ts:103-113`). Three different date-range semantics. | Reuse timezone-aware `startOfDayInTimezone`/`endOfDayInTimezone` for all report/invoice/expense ranges using `AppSetting.timezone`. | Open
ISS-012 | Finance | Medium | `invoices.service.ts:39-56, 184-188` | Totals computed with JS floating point; raw `data.discountAmount` stored even when it exceeds clamped `fixedDiscount`/subtotal (stored `discountAmount` can exceed what was actually applied to `currentTotal`). | Clamp stored discount to applied values; consider Decimal math or round to 2dp consistently. | Open
ISS-013 | Security | High | `auth.service.ts` (refreshTokens) | When `employeeId` is supplied on `/auth/refresh`, the refresh JWT was never `verifyAsync`'d — only argon2-compared to the stored hash. An expired refresh token remained usable until rotated (frontend always sends `employeeId`: `lib/auth.tsx:86-89`). | Always verify refresh token signature/expiry first, then compare hash (or drop the `employeeId` shortcut). | Fixed 2026-09-23 — `verifyAsync` always runs first; provided `employeeId` must match `payload.sub`; regression tests in `auth.service.spec.ts` |
ISS-014 | Security | Medium | `invoices.service.ts:590-647` (`findOne`), stock-receipts/stock-items queries | Any authenticated role (e.g. SALES) can read `consumptions.purchasePrice`, `costAtSale`, and unit `purchasePrice` (COGS/cost data) via invoice detail and inventory endpoints. | Restrict cost fields to `ADMIN`/`ACCOUNTANT` (role-based field projection or separate endpoint). | Open
ISS-015 | Security | Medium | `frontend/src/lib/auth.tsx:46, 90` | Malformed login/refresh response falls back to `role: "ADMIN"` client-side → UI mounts full admin navigation for a user who may not be admin (backend still enforces API authz). | Fail login/refresh hard if `employee` payload is missing; never default role. | Open
ISS-016 | Validation | High | `dto/invoice-change-request.types.ts`, `invoice-change-requests.service.ts:26-175` | Create body is a TypeScript **interface**, not a `class-validator` DTO → global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`) does not validate/stript this payload. `reason` presence/length never checked (empty reason accepted); `type` not validated against enum. | Convert to a class with `@IsEnum`, `@IsNotEmpty`, nested `ValidateNested` items DTO. | Open
ISS-017 | Validation | Medium | `invoice-change-requests.service.ts:103-110` | `CHANGE_PRICE` rejects via truthy check `!item.proposedPrice` → `proposedPrice: 0` treated as missing (`MISSING_PRICE_DATA`) even though 0 is allowed elsewhere (`INVALID_PRICE < 0`). Add-item approve path also allows `Number(undefined) → NaN` to pass `price < 0` check (`:728-731`). | Check `proposedPrice === undefined/null` explicitly; reject non-finite numbers. | Open
ISS-018 | Validation | Medium | `expenses.service.ts:62-85, 139-169` | No service-level validation that `amount > 0` or finite; negative rejected only by DB CHECK `expense_amount_non_negative` (500 instead of 400 if hit). `description`/`categoryId` edge cases unvalidated. | Add class-validator DTO with `@Min(0)` (or `@Min(0.01)`), `@IsNotEmpty` description. | Open
ISS-019 | Business/Data | Medium | `expenses.service.ts:99-103` | Filter `endDate` uses `lte = new Date('YYYY-MM-DD')` → midnight, excluding expenses dated during the end day (unlike invoices' `T23:59:59.999`). | Normalize end to end-of-day (timezone-aware). | Open
ISS-020 | Business | Medium | `invoices.service.ts:141` | Invoice numbers hardcode `INV-` prefix; `AppSetting.invoicePrefix` (`schema.prisma:677`) is stored but never read by numbering logic. | Use settings prefix in `invoiceNumber` generation. | Open
ISS-021 | Business | Medium | `invoice-change-requests.service.ts:403-408` | Non-serialized lines can never be returned/removed (`NON_SERIALIZED_RETURN` / remove requires `productUnitId`). Returns only possible for serialized delivered units. | Design decision? If unintended, implement lot-based return/consumption reversal. Mark `NEEDS CLARIFICATION` w/ product owner. | Open
ISS-022 | Business/Finance | Medium | `invoice-change-requests.service.ts` (return approval `currentTotal` update) | Return decremented `currentTotal` by full base-price refund while `currentTotal` already includes invoice discounts → totals could drift below economic reality; no guard that `currentTotal ≥ 0`. | Apply discount allocation to refunds; clamp/validate final total. | Fixed 2026-09-23 — discount-aware refund + `Math.max(0, currentTotal − refundTotal)` floor; covered by ISS-004/022 tests |
ISS-023 | Frontend/Business | Critical | `frontend/src/pages/sales/NewInvoice.tsx:9-10, 386-411` | Scanner input UI is fully commented out; `focusScanner` queries `[data-scanner-input]` which is never rendered → **serialized barcode entry impossible in New Invoice**, only non-serialized manual add works. Scan handlers (`handleScan`) are dead code. | Restore `ScannerInput` (or manual barcode input calling `handleScan`). | Open
ISS-024 | Frontend/Data integrity | High | `frontend/src/pages/sales/NewInvoice.tsx:211-221` | Save filters to `price > 0` lines only; lines shown in the cart/preview with price 0 are silently omitted from `POST /invoices` → saved invoice differs from what user reviewed. | Disable save until every visible line has `price > 0`, or prompt to remove invalid lines. | Open
ISS-025 | Security | Medium | `invoice-change-requests.service.ts:180-217` (findAll), frontend `MyRequests` | `GET /invoice-change-requests` returns **all** requests to any authenticated user (no `requestedByEmployeeId` scoping); Sales "My Requests" filters client-side → other users' request data exposed via API. | Server-side default filter to caller's employee id (admin gets explicit all). | Open
ISS-026 | Security | Low | Multiple list endpoints (`invoices`, `change-requests`, `expenses`, etc.) | `limit` query param not capped → client can request `limit=1000000` and load huge payloads. | Clamp `limit` (e.g. max 100) in DTO/pipe. | Open
ISS-027 | Security/Config | Medium | `attendance.service.ts:51-68` | Rate-limit state is an in-memory `Map` — resets on restart, not shared across instances; buckets never cleaned (slow leak per unique employeeId, bounded by employee count). | Move to Redis/DB or periodic cleanup; acceptable for single-instance MVP. | Open
ISS-028 | Security | Medium | Backend has no global rate limiting/throttling on `/auth/login` | Brute-force protection absent (only attendance scan limited). | `@nestjs/throttler` on auth endpoints. | Open
ISS-029 | Security/Config | Medium | `backend/prisma/seed.ts:53-57,109-113` | Seed creates well-known credentials (`admin/admin123`, …) and **deletes all data** unconditionally (`cleanDatabase`). Dangerous if run against production. | Guard seed behind `NODE_ENV !== 'production'`; require explicit `--force` to wipe; force password change on first login. | Open
ISS-030 | Logic | Medium | `attendance.service.ts:446-479` (`getEmployeeStats`) | `daysPresent = records with checkOut`; `daysAbsent = totalDays − daysPresent` where `totalDays = records.length` (only days **with** records). Employees with no records show 0 absent; `ABSENT` status never written anywhere. | Compute absent as calendar days in range minus days with presence; optionally generate ABSENT records. | Open
ISS-031 | Business | Medium | `attendance.service.ts` scan/check-in | `AttendanceStatus` LATE/EARLY_LEAVE/OVERTIME never assigned (always `PRESENT`); `Workplace.latitude/longitude/radiusMeters` geofence never validated on check-in (fields stored only). | Implement shift-time rules + optional geofence check, or remove unused fields. `NEEDS CLARIFICATION` whether required. | Open
ISS-032 | Design/UX | Medium | `frontend/src/components/Layout` (`ml-64`, `left-0`) | Sidebar/layout fixed left positioning not mirrored for Arabic RTL (`dir="rtl"` behavior `NEEDS CLARIFICATION`). | Use logical CSS (`ms-64`, `inset-inline-start`) and set `dir` from i18n locale. | Open
ISS-033 | Dead code | Low | `backend/src` deps `puppeteer`, `handlebars`; `IdempotencyKey` model; `AppSetting.invoicePrefix` | Unused dependencies (PDF never implemented — design likely wants invoice PDF), unused idempotency table (retry/double-submit protection absent), unused setting. Invoice creation has no idempotency key → network retry can duplicate invoices. | Implement idempotency middleware using `IdempotencyKey`; wire prefix into numbering; remove or use PDF deps. | Open
ISS-034 | Logic/Reporting | Low | `reports.service.ts:474-478` (`computeProductsSales`) | `returnedEvents += 1` per return **row** instead of returned quantity — `netUnitsSold` wrong for multi-quantity/non-serialized returns. | Sum returned quantities (track qty on return items or use line quantity). | Open
ISS-035 | Performance | Medium | `reports.service.ts` (multiple methods), `invoice-change-requests` details, supplier report `:1147-1157` | Reports load all matching invoice items/returns into memory then paginate in JS; supplier report does N+1 `stockReceipt.findUnique` per lot; `getAuditLog`/unit listings unbounded includes. | Push pagination/aggregation to SQL (`groupBy` already used in places); batch receipt number lookups. | Open
ISS-036 | Consistency | Low | `reports.service.ts:647-648, 818` vs `1059` | Employee/customer detail reports derive gross as `currentTotal + returns` while headline revenue uses undiscounted item sums → cross-report mismatch (see ISS-009). | Standardize discount handling across all report methods. | Open
ISS-037 | Data integrity | Low | `invoices.service.ts:430-434` | Reject decrements `ProductModel.reservedQuantity` without floor guard; DB CHECK `product_model_reserved_valid` (`constraints.sql:129`) will turn any double-release into a DB error (500) rather than a domain error. Also delivery-scan path can decrement reserved below intended if state machine bugs occur. | Guard with conditional update; map constraint violation to `ConflictException`. | Open
ISS-038 | Frontend | Low | `pages/sales/MyRequests`, many pages with `catch(() => {})` | Silent catch blocks swallow API errors (no user feedback); React Query installed but unused → no cache/retry/invalidations. | Surface errors via toast; adopt React Query for server state. | Open
ISS-039 | Tests | High | `backend` test suite; `frontend` | Only ~8 unit spec files + 1 e2e (`test/invoice-lifecycle.e2e-spec.ts`); no tests for change-request approval paths (where the critical bugs are), delivery, expenses validation, reports discounts, frontend has **no tests at all**. E2e includes a skipped idempotency test. | Add unit/integration tests for ISS-001…005 paths; add frontend Vitest smoke tests. | Open
ISS-040 | Validation | Low | `invoices` reject reason, change-request reject `adminNote` | Reject reason/adminNote requiredness depends on controller typing (`NEEDS CLARIFICATION`); empty rejection reasons may be stored. | Class DTO with `@IsNotEmpty()`. | Open
ISS-041 | Stock logic | Medium | `invoices.service.ts` confirm/reject non-serialized FIFO (`:325-357`, `:438-454`) | Consumption/release picks lots with `quantityReserved > 0` FIFO but not necessarily the lots reserved **by this invoice**; aggregate counters balance only if all invoices eventually resolve — incorrect attribution of `StockConsumption.stockLotId`/`unitCost` (COGS) possible when lots have different purchase prices. | Track per-invoice lot reservations (reservation table) or reserve deterministic lot ids at create time. | Open
ISS-042 | UI/Dashboard | Low | `NewInvoice` discount inputs | Discount fields accept any number; backend clamps but UI preview clamps independently (`:85-89`) — OK, but `discountAmount` sent pre-clamp (`finalDiscountAmount` is clamped — actually sent clamped at `:216`). Verify parity: frontend sends `finalDiscountAmount` (clamped to subtotal) while percentage applied on top — backend re-clamps similarly. Minor parity risk if both change. | Single source of truth for total calculation (server returns computed totals; UI echoes). | Open

### P0 Tier Summary (2026-09-23) — for stakeholders

**What was fixed (in plain language):**

1. **Approving "add item" requests now actually updates the invoice.** Previously, when an admin approved a request to add a product to an invoice, the invoice total didn't change and no line item appeared — the approval looked successful but did nothing to the bill. Now the item is added, the total is recalculated, and stock is reserved correctly.
2. **No more overselling under load.** Two cashiers creating invoices at the same moment could both "win" the last unit of stock, selling it twice. Stock is now checked and locked inside one atomic step, so the second attempt is politely rejected instead of double-selling.
3. **Returns now refund the right amount on discounted invoices.** If a customer had a 10% discount and returns one item, they are refunded what they actually paid for that item (discount share included), not the full list price. Invoice totals can no longer go negative. Also fixed: returning a second unit from the same multi-quantity line was wrongly blocked as "already returned."
4. **Expired login sessions are truly expired.** An old "refresh" login token could keep working after its expiry date. Every token is now crypturally verified for signature and expiry before access is granted.

**Also delivered (requested mid-plan):** an admin-only **Inventory Report** (`/admin/reports/inventory`) showing real stock quantities — serialized units by status, bulk stock by lot, values, low-stock highlights — with search, filters, print, and Excel export.

**Verification:** full backend unit suite **55/55** green, e2e **14 passed / 1 pre-existing skip**; frontend lint clean of new issues. All four issues marked `Fixed 2026-09-23` in §8.

**Next tier (P1):** non-serialized returns, mixed change-request approvals, reporting discount/timezone consistency, concurrent-approval race, cost-field visibility, and change-request scoping.

---

## 9. Test Coverage

Runner: Jest (`backend/jest.config.js`) — projects:
- **unit**: `rootDir: src`, testMatch `**/*.spec.ts`
- **e2e**: `test/**/*e2e-spec.ts` with global setup/teardown (`test/jest-e2e.json`, `npm run test:e2e`)

| Spec file | Focus |
|---|---|
| `src/invoices/invoices.service.spec.ts` | Totals calc, date-range helper, sequence, create/confirm paths (partial) |
| `src/reports/reports.service.spec.ts` | Report aggregation cases (partial) |
| `src/customers/customers.controller.spec.ts` | Controller wiring |
| `src/common/errors/global-exception.filter.spec.ts` | Error filter shape |
| `src/auth/roles.guard.spec.ts` | Role/kiosk restrictions |
| `src/auth/auth.service.spec.ts` | Login/refresh/password + ISS-013 refresh verification |
| `src/attendance/qr-token.service.spec.ts` | QR issue/verify |
| `src/attendance/attendance.service.spec.ts` | Check-in/out, stats |
| `src/invoice-change-requests/invoice-change-requests.service.spec.ts` | ISS-001/002 add-item approval, ISS-004/005/022 returns |
| `src/reports/reports.service.spec.ts` | Report aggregation + inventory report |
| `test/invoice-lifecycle.e2e-spec.ts` | E2E invoice lifecycle (includes skipped idempotency test — P1-8) |

**Gaps:** change-request approve/reject transactions (highest bug density), delivery scan/deliver, stock-receipt pricing, expenses validation, reports discount/timezone behavior, settings, employees, notifications; **frontend: no test runner configured**.

---

## 10. Glossary

| Term | Meaning |
|---|---|
| **Pallet** | This product: POS + invoicing + serialized inventory system. |
| **Serialized unit / ProductUnit** | A single physical item with a unique barcode and lifecycle status (AVAILABLE/RESERVED/SOLD/DAMAGED). |
| **Non-serialized / StockLot** | Bulk product tracked by quantities per received lot (`quantityReceived/Remaining/Reserved`). |
| **Reservation** | Soft hold of stock for a pending invoice (`ProductModel.reservedQuantity` for serialized; `StockLot.quantityReserved` for non-serialized), released on reject, consumed on confirm (non-serialized) or fulfilled via scan (serialized). |
| **StockConsumption** | Lot consumption row created at confirm; source of `unitCost`/`totalCost` for COGS. |
| **COGS** | Cost of goods sold: `Σ StockConsumption.totalCost` (non-serialized) + `Σ InvoiceItem.costAtSale` (serialized, `cogsStatus=FINAL`) − returned COGS. |
| **Change request** | Admin-approved modification of a CONFIRMED/DELIVERED invoice: add/remove item, price change, return. `InvoiceChangeRequest` + items. |
| **Return** | Approved removal of sold unit(s); creates `InvoiceReturn`/`InvoiceReturnItem`, refunds, restores unit to AVAILABLE, decrements `currentTotal`. |
| **Price adjustment** | `InvoicePriceAdjustment` row capturing old→new effective price without mutating `InvoiceItem.price`. |
| **Effective price** | Latest adjustment `newPrice` for a line, else base `InvoiceItem.price`. |
| **Delivery scan** | Inventory workflow binding scanned serialized units to invoice lines before marking invoice DELIVERED. |
| **Receipt pricing queue** | New stock receipts sit in `PENDING_PRICING` until purchase prices/lots are entered (Admin `stock-pricing` page). |
| **Kiosk** | `ATTENDANCE_KIOSK` employee account bound to a Workplace; issues short-lived QR tokens for check-in/out. |
| **Geofence** | Workplace `latitude/longitude/radiusMeters` — stored, not currently enforced (ISS-031). |
| **InvoiceSequence** | DB row (id=1) providing monotonic invoice numbers (`INV-000123`). |
| **IdempotencyKey** | Intended duplicate-submit protection table — currently unused (ISS-033). |
| **AppSetting** | Singleton business settings row (name, contact, logo, forced EGP/Africa-Cairo, `invoicePrefix` unused). |
| **EGP / Africa/Cairo** | Forced currency and timezone for the deployment (Egypt). |
| **NEEDS CLARIFICATION** | Behavior not fully verifiable from code alone — confirm with product owner before relying on it. |

---

*Last updated: 2026-09-23 (audit session). Keep this file in sync with code changes; add new issues to §8 with next ISS id and `Status: Open`.*
