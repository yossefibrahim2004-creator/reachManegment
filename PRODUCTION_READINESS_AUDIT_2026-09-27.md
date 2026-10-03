# Pallet POS Production-Readiness Audit

**Audit date:** 2026-09-27
**Scope:** Current repository state, backend, frontend, Prisma schema/migrations, tests, runtime configuration, auth, concurrency, realtime, scale, and security.
**Method:** Static trace of current code plus current Prisma validation/status, backend build, frontend build, and 71/71 backend unit tests. Prior E2E results were treated as historical evidence, not proof of production readiness.

## Verdict

**NO-GO for production scale-up.**

The application compiles and the migration chain is currently up to date, but several confirmed correctness and authorization defects remain. The most serious are:

1. Authenticated non-admin users can access sensitive invoice, change-request, stock-receipt, and product-unit read endpoints because controller methods have no `@Roles` restriction.
2. Concurrent change-request approval/rejection and creation can apply financial/inventory effects more than once.
3. Concurrent `unscanBarcode` calls can increment `ProductModel.reservedQuantity` twice while only releasing one physical unit.
4. Concurrent receipt pricing can overwrite cost data and transition the same receipt multiple times.
5. The refresh-token design stores one token per employee, so logging in or refreshing on one device invalidates another device's session.
6. The realtime transport is process-local and lossy; horizontal scaling, load balancing, deploys, and reconnects can leave clients stale.
7. Several reports and audit endpoints load entire historical result sets into application memory despite exposing pagination.

These are production blockers even though the current unit tests pass.

## Findings

### CRITICAL-01: Sensitive read endpoints lack authorization

**Location:** `backend/src/invoices/invoices.controller.ts` methods `findAll`, `findOne`, and `getAuditLog`; `backend/src/invoice-change-requests/invoice-change-requests.controller.ts` methods `findAll` and `findOne`; `backend/src/stock-receipts/stock-receipts.controller.ts` methods `findAll` and `findOne`; `backend/src/product-units/product-units.controller.ts` methods `getInventoryCount`, `findByBarcode`, and audit methods.

**Problem:** These controllers use `JwtAuthGuard` and `RolesGuard`, but several read methods have no `@Roles`. `RolesGuard` allows any authenticated user when no roles are declared. A Sales, Accountant, or Inventory user can therefore enumerate data outside their workflow, including invoice/customer data, invoice audit history, change requests, receipt supplier/pricing data, serial/barcode history, and inventory counts.

**Scale impact:** As employee count and invoice volume grow, this becomes a cross-role data disclosure and IDOR surface, not merely a UI issue. Any authenticated token can iterate IDs and retrieve records.

**Severity:** Critical.

**Fix:** Define an explicit role matrix at every controller method. At minimum: invoice detail/search should be limited to roles that need it; invoice audit should be Admin or explicitly approved roles; change-request listing/details should be Admin plus requester-scoped Sales/Inventory logic; stock receipts and product-unit audit should be Inventory/Admin; enforce requester ownership in the service where applicable. Add authorization tests for every role and endpoint.

**Verification:** Authenticate as each role and assert `403` for unauthorized endpoints and that allowed users cannot fetch unrelated private entities by ID.

### CRITICAL-02: Change-request creation and review are not single-winner

**Location:** `backend/src/invoice-change-requests/invoice-change-requests.service.ts:create` around line 28; `approve` around line 298; `reject` around line 339; approval transactions around lines 417, 706, and 829.

**Problem:** `create` checks for a pending request before entering its transaction, but the schema has no unique partial constraint for one pending request per invoice. Two concurrent callers can both pass the check and create pending requests. `approve` and `reject` read `status` before the transaction and then use unconditional `update` calls. The approval implementations mutate invoice items, reservations, units, returns, totals, and audit logs before unconditionally marking the request approved.

**Scale impact:** Two admins reviewing the same request can double-release/reserve stock, create duplicate returns or price adjustments, and change invoice totals twice. Two Sales/Inventory submissions can create competing requests and duplicate work.

**Severity:** Critical.

**Fix:** Add a database-enforced pending-request uniqueness strategy, preferably a partial unique index on `InvoiceChangeRequest(invoiceId) WHERE status = 'PENDING'`. Claim review with `updateMany({ where: { id, status: PENDING } })` inside the transaction and abort unless count is one. Re-read all mutable invoice/unit/lot state inside that transaction. Add an idempotency key for request creation.

**Verification:** Run two simultaneous create requests and two simultaneous approvals/rejections against the same record; assert exactly one request/state transition and exactly one financial/inventory effect.

### CRITICAL-03: Concurrent unscan can corrupt reserved quantity

**Location:** `backend/src/invoice-delivery/invoice-delivery.service.ts:251` (`unscanBarcode`), especially lines 289-306.

**Problem:** The assignment is read outside the transaction. Inside the transaction, the assignment is updated unconditionally, `ProductUnit.updateMany` checks `RESERVED` but its `count` is ignored, and `ProductModel.reservedQuantity` is incremented unconditionally. Two requests can target the same assignment: the first changes the unit to `AVAILABLE`; the second still updates the assignment and increments the model reservation even though its unit update affects zero rows.

**Scale impact:** Repeated scanner clicks, retries, or two inventory tabs can inflate model reservations and make future sales incorrectly fail for insufficient stock. Physical unit state and aggregate reservation state diverge.

**Severity:** Critical.

**Fix:** Claim the assignment with `updateMany({ where: { id, reversedAt: null } })`; require count one. Atomically update the unit with `status=RESERVED` and version, require count one, and increment the aggregate only after both claims succeed in the same transaction. Use typed payloads instead of `any` for the target assignment/item.

**Verification:** Fire concurrent unscan requests for the same invoice/unit and assert one success, one conflict, one active/reversed assignment, one available unit, and one aggregate increment.

### HIGH-04: Receipt pricing has a stale status check and unconditional transition

**Location:** `backend/src/stock-receipts/stock-receipts.service.ts:259` (`priceReceipt`), status check before the transaction and `tx.stockReceipt.update` around line 373.

**Problem:** Two admins can both observe `PENDING_PRICING`, then both update unit/lot prices, resolve consumptions, recalculate COGS, and finally set the receipt to `PRICED`. There is no conditional `PENDING_PRICING` claim and no idempotency key. Different submitted prices can produce last-writer-wins financial data.

**Scale impact:** COGS and profit reports can change based on request timing, and duplicate pricing submissions can create inconsistent cost snapshots across sold units and stock lots.

**Severity:** High.

**Fix:** Claim the receipt in the transaction with a conditional `updateMany` or lock. Validate every price row belongs to the receipt inside the transaction. Make pricing idempotent by receipt plus request key, or return the stored result for a repeated request.

**Verification:** Concurrently price one receipt with conflicting values; assert one winner, one conflict, stable COGS, and one terminal transition.

### HIGH-05: Single refresh token per employee breaks multi-device sessions

**Location:** `backend/prisma/schema.prisma:model Employee` (`refreshToken` scalar); `backend/src/auth/auth.service.ts:login` and `refreshTokens`; `backend/src/employees/employees.service.ts:updateRefreshToken`.

**Problem:** Login and refresh overwrite one hashed refresh token on the Employee row. A second browser/device login invalidates the first device's refresh token. Logout on one device clears the token for all devices.

**Scale impact:** Employees working across a POS terminal, office browser, and mobile/tablet will be randomly logged out or receive refresh failures. This contradicts the multi-device requirement and produces avoidable support incidents.

**Severity:** High.

**Fix:** Add a session/refresh-token table with token hash, employee ID, device/session ID, created/last-used/expiry/revoked timestamps, and per-session logout. Hash and compare the presented token; revoke all sessions only for password reset/deactivation.

**Verification:** Login the same employee from two browsers, refresh both repeatedly, log out one, and assert the other remains valid.

### HIGH-06: Realtime SSE is single-instance and lossy

**Location:** `backend/src/realtime/realtime.service.ts`; `backend/src/realtime/realtime.controller.ts`; `frontend/src/hooks/useRealtimeEvents.ts`.

**Problem:** Subscribers are kept in an in-memory `Set`. Events disappear when a process restarts, when a client is disconnected, or when traffic is routed to another backend instance. There is no event ID, replay cursor, durable outbox, broker, or authoritative resync request. The frontend invalidates React Query keys, but most screens use raw Axios/local state and do not subscribe to the local event hook.

**Scale impact:** Load balancing can send mutation requests to instance A and SSE connections to instance B, so clients never receive events. Deploys and reconnects can silently miss invoice, stock, notification, and attendance changes. A large number of SSE clients can also create unbounded per-process socket and write pressure without backpressure/connection limits.

**Severity:** High.

**Fix:** For a single instance, add event IDs, bounded connection limits, write-error cleanup, and a reconnect resync endpoint. For horizontal scale, use a transactional outbox plus Redis Streams/PostgreSQL LISTEN/NOTIFY with replay semantics, or another shared broker. On reconnect, fetch authoritative changed entities since a cursor. Migrate all shared-state screens to React Query or an event-aware store.

**Verification:** Run two backend instances behind a proxy, mutate through one, connect SSE to the other, restart an instance, disconnect clients, and assert no permanent stale state.

### HIGH-07: Sensitive mutation endpoints lack idempotency beyond invoices

**Location:** `backend/src/stock-receipts/stock-receipts.controller.ts:priceReceipt`; `backend/src/invoice-change-requests/invoice-change-requests.controller.ts:create`; adjustment create/review controllers; delivery scan/deliver endpoints.

**Problem:** Only invoice creation accepts `Idempotency-Key`. Stock receipt pricing, change-request creation, receipt creation, expense creation, and other retry-sensitive operations rely on frontend button state and state checks. A network retry can duplicate a change request, expense, receipt, or notification. State checks alone are not idempotency for create operations.

**Scale impact:** Mobile/network retries and double-clicks are common with multiple employees. Duplicate financial or inventory records are difficult to reconcile after the fact.

**Severity:** High.

**Fix:** Define an operation-specific idempotency contract. Use a shared idempotency table keyed by employee, operation, and client key, storing status/result. Add unique business constraints where possible and claim the key before mutation. Do not reuse invoice semantics blindly for operations with different response lifecycles.

**Verification:** Replay each dangerous POST/PATCH with the same key and with no key under timeout/retry conditions; assert deterministic results and no duplicate side effects.

### HIGH-08: Reports and audit endpoints defeat pagination in memory

**Location:** `backend/src/reports/reports.service.ts:computeEmployeesSales`, `computeProductsSales`, report detail methods around lines 580-880, and `computeInventory` around line 1190; `backend/src/audit/audit.service.ts:findAll` around line 41.

**Problem:** Several report methods call `findMany` without `take`, aggregate in Node, then slice arrays after all matching historical rows are loaded. `computeInventory` loads all product models and all unit groups/lots before slicing. Audit queries load all invoice logs, product-unit logs, and receipts, merge/sort them in memory, and only then paginate.

**Scale impact:** At 100x historical volume, a single admin report can consume large heap, hold many Prisma objects, saturate DB connections, and trigger GC pauses or process OOM. Pagination gives the appearance of bounded work but does not bound database or memory work.

**Severity:** High.

**Fix:** Push grouping, sorting, counts, and pagination into PostgreSQL. Use `groupBy`/SQL views/materialized aggregates where appropriate. For audit, use a unified append-only audit table or keyset pagination across sources. Add bounded hard maximums and reject oversized detail exports; stream exports asynchronously.

**Verification:** Load-test reports with synthetic 100x and 1000x rows, record query plans, heap, latency, and connection utilization. Require p95 and memory budgets.

### HIGH-09: User-controlled pagination has inconsistent/no hard caps

**Location:** `backend/src/invoices/invoices.service.ts:findAll`, `backend/src/stock-receipts/stock-receipts.service.ts:findAll`, `backend/src/notifications/notifications.service.ts:findAll`, employee/customer/product/attendance services, and report controllers.

**Problem:** Many services use caller-provided `limit` directly or only apply a minimum. `AuditService` uses `Math.max(1, rawLimit)` with no maximum. Several controller query parameters are converted with `parseInt` and passed through. This permits very large result sets and expensive includes.

**Scale impact:** An authenticated user can intentionally or accidentally request hundreds of thousands of rows and create database/heap/CPU pressure. It also makes normal frontend behavior unpredictable as data grows.

**Severity:** High.

**Fix:** Centralize bounded pagination DTOs with `@IsInt`, `@Min`, `@Max`, positive page validation, and keyset pagination for high-volume feeds. Enforce limits again in services, not only controllers.

**Verification:** Test limits 0, negative, NaN, 100,000, and omitted; assert bounded SQL `take` and stable error responses.

### HIGH-10: Authentication has no meaningful login/refresh rate limiting

**Location:** `backend/src/auth/auth.controller.ts`, `backend/src/auth/auth.service.ts`, and `backend/src/attendance/attendance.service.ts`.

**Problem:** Rate limiting exists only for attendance scans and is process-local. Login, refresh, password reset, SSE connection creation, and expensive report endpoints have no rate limit. The local attendance map is lost on restart and is not shared between instances.

**Scale impact:** Password spraying, refresh abuse, SSE connection exhaustion, and report scraping can consume CPU/database capacity or compromise accounts.

**Severity:** High.

**Fix:** Add a distributed rate limiter at the edge/API layer keyed by IP, username, employee, and endpoint, with progressive login backoff and audit alerts. Apply connection quotas and authorization to SSE. Keep attendance limits as defense in depth, not the primary control.

**Verification:** Security test repeated login/refresh/SSE/report requests from multiple clients and verify rate limits work consistently across instances.

### HIGH-11: Browser tokens in localStorage amplify XSS impact

**Location:** `frontend/src/lib/auth.tsx:17-117`, `frontend/src/lib/api.ts:12-101`.

**Problem:** Access and refresh tokens are readable by any script executing in the origin. A single XSS or compromised third-party script can exfiltrate long-lived refresh credentials and impersonate employees from another device.

**Scale impact:** POS browsers often remain logged in for long periods, making token theft materially worse than a short-lived page session. One compromised Sales terminal can expose the employee account until refresh revocation.

**Severity:** High.

**Fix:** Move refresh tokens to Secure, HttpOnly, SameSite cookies; keep access tokens in memory with short expiry; add CSRF protection for cookie-authenticated mutations, strict CSP, dependency auditing, and no unsafe HTML injection. Revoke sessions server-side.

**Verification:** XSS simulation in development/staging, cookie flags inspection, CSRF tests, CSP report-only then enforcement, and refresh-token theft attempt from page JavaScript.

### HIGH-12: Invoice/change-request authorization is not requester-scoped

**Location:** `backend/src/invoice-change-requests/invoice-change-requests.controller.ts` and `InvoiceChangeRequestsService.findAll/findOne`; `backend/src/invoices/invoices.controller.ts` invoice detail routes.

**Problem:** Even where a method is intended for a role, service queries return global records without filtering by requesting employee or permitted business scope. Combined with missing method roles, a user can enumerate other employees' requests and invoices.

**Scale impact:** Data exposure grows linearly with invoice and customer history and can expose prices, customer identity, audit details, and rejection reasons across teams.

**Severity:** High.

**Fix:** Establish explicit visibility policy: Admin global; Accountant only accounting workflow; Sales only own invoices/requests unless business rules say otherwise; Inventory only delivery/stock data. Apply the policy in Prisma `where` clauses and test IDOR attempts.

**Verification:** Cross-role matrix tests for list, detail, audit, and entity IDs.

### MEDIUM-13: Attendance check-in still relies on read-before-create despite index behavior

**Location:** `backend/src/attendance/attendance.service.ts:checkIn` around line 244.

**Problem:** The code performs open/today checks then creates. The prior migration report says a partial unique index exists, which protects duplicate open rows, but the same-day closed check has no database constraint. Concurrent requests can race around the “already completed today” check and create multiple closed-day records if another path closes/creates around the same boundary.

**Scale impact:** Duplicate attendance rows corrupt daily summaries, payroll calculations, and correction workflows.

**Severity:** Medium.

**Fix:** Encode the business rule as a database constraint/index where possible, or claim a per-employee/day attendance record with an atomic upsert/lock. Define timezone/day identity explicitly.

**Verification:** Concurrent check-in/check-out tests across the Cairo day boundary.

### MEDIUM-14: Notification realtime coverage is incomplete

**Location:** `backend/src/notifications/notifications.service.ts`; callers in change requests, stock adjustments, expenses, attendance, and low-stock flows.

**Problem:** Notifications persist, but there is no notification-specific event publication in the notification service. Current events cover invoice, stock receipt, and change-request creation only. Approval/rejection notifications, low-stock resolution, attendance, expenses, adjustment review, and read/unread changes are not consistently broadcast. The frontend TopBar still polls every 30 seconds.

**Scale impact:** Users see stale badges/queues, duplicate polling load, and delayed approvals as staff count grows. Realtime behavior depends on incidental invoice events rather than the notification transaction.

**Severity:** Medium.

**Fix:** Emit notification events after commit from a transactional outbox, including employee ID and notification ID, or publish from every post-commit caller. Use targeted cache updates and unread-count updates; remove polling once reconnect resync is reliable.

**Verification:** For every notification type, create/resolve/read it from one session and assert only authorized recipient sessions update.

### MEDIUM-15: Report detail endpoints are unbounded exports disguised as API reads

**Location:** `backend/src/reports/reports.service.ts:getExpenseReportDetails`, `getEmployeeSalesReportDetails`, `getProductSalesReportDetails`, `getReturnsReportDetails`, `getCustomerReportDetails`, and `getSupplierReportDetails`.

**Problem:** These methods return all matching invoices/expenses/returns/receipts and nested items with no pagination, export job, or hard row cap.

**Scale impact:** One report click can load years of invoices and nested line items into Nest memory and then into a browser, freezing both sides.

**Severity:** Medium/High.

**Fix:** Make details paginated/keyset-based; make full export an asynchronous streamed job with authorization, row limits, and audit logging.

**Verification:** Synthetic historical dataset and browser memory/latency test.

### MEDIUM-16: High-risk `any` usage weakens API and mutation safety

**Location:** `backend/src/invoices/invoices.service.ts` serialized/non-serialized model arrays; `backend/src/invoice-change-requests/invoice-change-requests.service.ts` approval methods; `backend/src/audit/audit.service.ts`; `backend/src/reports/reports.service.ts`; `backend/src/customers/customers.service.ts`; `backend/src/invoice-delivery/invoice-delivery.service.ts`.

**Problem:** The search found 231 `any`-related matches across production and test code, including untyped request payloads, Prisma where objects, report rows, change-request items, and assignment targets. Not all matches are type declarations, but several are on financial/inventory paths.

**Scale impact:** Type drift between DTOs, Prisma results, and frontend contracts can become silent financial or authorization bugs during feature growth. It also makes concurrency fixes harder to review.

**Severity:** Medium.

**Fix:** Replace mutation-path `any` first with Prisma payload types and discriminated unions; use typed `Prisma.*WhereInput`; remove test casts as contracts are stabilized.

**Verification:** Enable stricter TypeScript settings in a separate CI job and add compile-time contract tests.

### LOW-17: Duplicate inventory implementations

**Location:** `backend/src/product-units/product-units.service.ts:getInventoryCount`; `backend/src/stock-items/stock-items.service.ts:getInventoryCount`; `backend/src/reports/reports.service.ts:computeInventory`.

**Problem:** Three implementations calculate inventory from units/lots with different response shapes and query strategies. This invites semantic drift in availability, reserved quantities, low-stock thresholds, and stock value.

**Scale impact:** Different screens and reports can disagree during high activity, leading to operational decisions based on inconsistent numbers.

**Severity:** Low/Medium.

**Fix:** Create one typed inventory read model/query service with explicit snapshot semantics; have all endpoints compose it and share tests.

**Verification:** Golden dataset comparing all inventory endpoints across serialized, bulk, reserved, sold, damaged, and adjusted states.

### LOW-18: Frontend bundle and data-fetch architecture are not scale-efficient

**Location:** `frontend/src/features/reports/components/ExcelExportButton.tsx` imports `exceljs` eagerly; 31 page files contain direct Axios calls; only five screen components use `useRealtimeRefresh`.

**Problem:** ExcelJS is included in the initial bundle even though export is an explicit report action. Most screens use local `useEffect` + Axios instead of shared query caching. Search/filter requests and page resets can trigger repeated requests, while many screens do not react to realtime events.

**Scale impact:** Initial load is approximately 1.93 MB minified, slower on POS terminals/mobile networks. Repeated requests multiply backend load with employee count, and stale screens cause manual refreshes or incorrect operator decisions.

**Severity:** Low/Medium.

**Fix:** Dynamic-import ExcelJS on click, code-split report routes, migrate list/detail screens to shared query keys, debounce search, cancel stale requests, and attach event invalidation to every shared workflow.

**Verification:** Lighthouse/network budget, request-count tests per filter change, and multi-tab cache/event tests.

## Confirmed Strengths

- Prisma schema validates and migration status reports 16 migrations up to date in the current development database.
- Current backend build passes, frontend build passes, and the backend unit suite reports 71/71 passing tests.
- Invoice confirm/reject/deliver and stock-adjustment approval now contain conditional state claims.
- Serialized scan uses a versioned unit update and unique barcode storage.
- Raw report SQL observed in `ReportsService` uses tagged Prisma `$queryRaw` templates; no direct string concatenation SQL injection was found in reviewed queries.
- Global error filtering hides stack traces from normal responses.

These strengths do not offset the Critical/High findings above.

## Verification Results

| Check | Current result |
|---|---|
| Prisma validate | PASS |
| Prisma migration status | PASS; 16 migrations, up to date |
| Backend build | PASS |
| Backend unit tests | PASS; 10 suites, 71 tests |
| Frontend build | PASS; Vite reports a >500 kB chunk warning |
| Fresh migration replay | Not rerun in this audit |
| Real concurrent DB load | Not proven by mocked unit tests; required before release |
| Four isolated browser identities | Not proven; integrated runner shares localStorage |
| Multi-instance realtime | Not tested; architecture is currently process-local |
| XSS/CSRF/security load testing | Not performed |
| EXPLAIN plans at 100x/1000x data | Not performed |

## Prioritized Fix Order

### Before any production scale-up

1. Close the authorization/IDOR gaps and add a complete role/visibility matrix.
2. Fix change-request create/approve/reject races, unscan double-apply, and receipt-pricing races with database claims/constraints.
3. Replace single employee refresh tokens with per-session refresh-token records.
4. Add bounded pagination and rewrite report/audit/detail queries to paginate in SQL.
5. Add distributed login/report/SSE rate limiting and connection quotas.
6. Replace in-process SSE with an outbox/replay-capable transport before running multiple backend instances.
7. Move refresh tokens to HttpOnly cookies and enforce CSP/CSRF protections.

### Immediately after blockers

8. Add idempotency to receipt, change-request, expense, and other retry-sensitive mutations.
9. Complete notification event coverage and reconnect resync.
10. Consolidate inventory read logic and remove high-risk `any` from financial/mutation paths.
11. Dynamic-import ExcelJS and migrate the remaining high-frequency screens to React Query.
12. Add load, chaos, multi-tab, multi-browser, and database-failure tests to CI/staging.

## What Static Audit Could Not Prove

- Actual PostgreSQL lock contention, deadlocks, query plans, and p95 latency under realistic invoice volume.
- Whether deployment uses one or multiple backend instances, a proxy, sticky sessions, or container restarts.
- SSE behavior under thousands of connections, client backpressure, proxy buffering, and deploy reconnect storms.
- Browser XSS exploitability, CSP effectiveness, CSRF behavior, and token exfiltration in a staging browser.
- Cross-device refresh-token behavior under the current single-token design with real browser timing.
- Exact business permission policy for every role where the code currently leaves reads unrestricted; the security risk is confirmed, but the desired allow-list requires product confirmation.

## Final Verdict

**NO-GO.** The system is suitable for continued development and controlled internal testing, but not for a growing multi-employee production deployment until the Critical and High findings are fixed and verified with real concurrent load, authorization matrix tests, and multi-instance/reconnect testing.
