# Full System Audit

**Project:** Pallet POS
**Audit date:** 2026-09-27
**Environment:** Local development only; database `pallet_pos` on local PostgreSQL

## Executive Summary

The repository has a sound NestJS + Prisma + React structure and the migration chain is currently up to date. The prior database reconciliation report documents a reproducible 16-migration chain and no schema drift. This pass found and repaired four application-level concurrency/consistency defects and added authenticated real-time synchronization for the invoice workflow.

Fixed in this pass:

- Invoice confirmation and rejection are now single-winner state transitions inside the transaction.
- Invoice delivery is now a single-winner transition, including invoices without serialized lines.
- Delivery and scan low-stock/delivery notifications no longer execute through the base Prisma client inside an open transaction; they run after commit.
- Stock-adjustment approval/rejection now has conditional pending-state transitions.
- `correctAttendance` now rejects a corrected check-in later than an existing check-out.
- Added authenticated, role-filtered SSE with reconnecting frontend consumption and targeted invoice-view refreshes.
- Fixed E2E teardown leakage for expense categories.

Important remaining limitations are documented rather than hidden: notification events are not yet emitted for every notification-producing subsystem, and isolated browser-context concurrency testing was limited by the shared localStorage behavior of the integrated browser runner.

## Architecture

- **Frontend:** React 19, TypeScript, Vite, React Router, Axios, TanStack Query, custom component system and i18n.
- **Backend:** NestJS 10, global validation pipe, global safe exception filter, JWT access/refresh authentication, role guard, Prisma service.
- **Database:** PostgreSQL with Prisma schema and 16 official migrations. The existing migration audit reports 30 tables, 15 enums, 58 foreign keys, indexes, and application-consistent checks.
- **Real-time:** New in-process authenticated SSE endpoint at `/api/realtime/events`. It uses the access-token `Authorization` header, checks the active employee in the database, filters events by role or employee ID, sends heartbeats, and cleans up on disconnect. This is appropriate for the current single-instance development architecture; cross-instance propagation would require a broker or shared event layer.
- **Authorization:** JWT strategy refreshes active status and current role from the database on every request. `RolesGuard` enforces endpoint roles and isolates kiosk accounts.

## Database Audit

The prior `BACKEND_DATABASE_MIGRATION_FINAL_AUDIT.md` records the database reconciliation and is consistent with the current checks:

- `npx prisma validate`: PASS.
- `npx prisma migrate status`: PASS; 16 migrations found and database up to date.
- `npx prisma generate`: PASS after releasing a Windows query-engine file lock held by duplicate local backend processes.
- No migration or schema files were changed in this pass.
- No destructive database operation was performed in this pass by the agent. The E2E harness did reset the identified disposable local development database as part of its existing setup.

The official migration chain remains authoritative. Archived SQL under `backend/prisma/legacy/` remains documented as historical and must not be applied manually.

## Backend Audit

### Transactions and concurrency

Invoice lifecycle state transitions previously relied on a pre-transaction status read and an unconditional later write. The repaired paths now use `updateMany` with the expected status inside the transaction and reject when no row is claimed. This guarantees one successful confirmer/rejecter/deliverer under concurrent requests; later mutations roll back if stock or audit work fails.

Serialized scanning already used a versioned `AVAILABLE -> RESERVED` update. Its notification work was moved after the transaction. Delivery uses conditional `RESERVED -> SOLD` unit updates and now conditionally claims `CONFIRMED -> DELIVERED` before processing, preventing duplicate delivery of non-serialized invoices.

Stock adjustment review now conditionally claims `PENDING -> APPROVED/REJECTED`. Attendance retains the partial unique open-attendance index and now validates the final effective check-in/check-out pair during correction.

### Validation and errors

The global exception filter maps known Prisma errors to safe structured responses and hides internal errors behind configured messages. DTO validation is enabled globally with whitelist and forbidden-property rejection. Existing source still contains `any` in several reports, audit helpers, tests, and UI code; this was not broadly rewritten because it requires a larger type-contract pass.

### Business logic

The E2E flow passed serialized and non-serialized invoice paths, COGS resolution, signed adjustments, attendance, expenses, and reports. The serialized workflow remains product-model/quantity based at sale creation and physical-unit based only during delivery.

## Frontend Audit

TanStack Query is configured globally but most screens still use Axios plus local effects. The new realtime hook invalidates invoice/notification query keys and dispatches a local event for legacy Axios screens. Accountant pending invoices, admin invoice list, and inventory delivery queue now refresh from relevant lifecycle events without page reloads.

The production build passes. Lint completes with warning-level findings, including unused imports, effect state updates, and missing hook dependencies in pre-existing screens. Bundle output is approximately 1.9 MB minified and Vite reports a chunk-size warning; code splitting remains a performance follow-up.

## Multi-User and Real-Time Audit

Verified by code and focused tests:

- Database-backed role freshness and per-endpoint authorization.
- Conditional invoice and adjustment transitions.
- Serialized unit version checks and unique barcode constraints.
- Realtime endpoint rejects unauthenticated access and returns `200` with a ready frame for a valid development account.
- Frontend reconnect loop uses exponential backoff up to 10 seconds and aborts cleanly on unmount.

Not fully verified in this pass:

- Four isolated browser contexts executing the full sales/accountant/inventory/admin sequence.
- Duplicate event behavior across multiple tabs.
- Full network interruption with missed-event resynchronization in isolated browser contexts.
- Cross-process or cross-instance event propagation.

The current reconnect path reconnects and invalidates current caches, which provides resynchronization for screens using the new hook. Browser smoke testing forced three SSE attempts to abort during a Sales page reload; the authenticated page remained usable and the hook continued its retry loop. Broader Axios screens still need the hook or React Query migration to receive targeted updates.

## Security Audit

Positive findings:

- JWT signature and expiry are checked on refresh; active status and current role are re-read from the database.
- SSE requires a bearer token and active employee lookup; clients cannot choose a user or room identifier.
- Kiosk access is explicitly isolated by role.
- Global errors do not expose Prisma stacks or secrets to normal API clients.
- Prisma parameterization is used for raw report queries through tagged query APIs.

Remaining items:

- Access and refresh tokens are stored in browser localStorage, which increases impact of an XSS defect; an HttpOnly cookie migration is a security improvement requiring coordinated frontend/backend work.
- No distributed rate limiter was found; the attendance limiter is process-local.
- Invoice creation now supports `Idempotency-Key`; the existing unique `IdempotencyKey` model prevents duplicate submissions and returns the stored response for a completed request.

## Performance Audit

Existing audit findings remain relevant: most list pages bypass React Query, some searches fetch per keystroke, several effects can double-fetch after page resets, and some endpoints allow broad page limits. The touched realtime path avoids aggressive polling and does not broadcast unauthorized events. Frontend lint also identifies effect-driven render churn.

## Dead Code Audit

No uncertain application module was deleted. The legacy SQL was already archived by the prior migration audit. Existing duplicate inventory-count logic and broad `any` usage were retained because removing them safely requires API-contract and UI migration work. The E2E teardown defect was corrected because it was directly evidenced by the failing suite.

## Exact File Change Report

| Path | Change | Reason | Risk | Verification |
|---|---|---|---|---|
| `backend/src/realtime/realtime.service.ts` | Added event subscriber/publisher | In-process post-commit event transport | Low; process-local by design | Backend build; runtime SSE smoke |
| `backend/src/realtime/realtime.controller.ts` | Added authenticated SSE endpoint | Multi-user synchronization without polling | Medium; single-instance only | `401` invalid login; `200` ready frame valid login |
| `backend/src/realtime/realtime.module.ts` | Added module and JWT configuration | Register realtime transport | Low | Backend build |
| `backend/src/app.module.ts` | Registered realtime module | Activate endpoint | Low | Backend build |
| `backend/src/invoices/invoices.module.ts` | Imported realtime module | Inject publisher | Low | Backend build/tests |
| `backend/src/invoices/invoices.service.ts` | Atomic confirm/reject; post-commit events | Prevent duplicate transitions and stale clients | Medium | Unit suite; E2E suite; build |
| `backend/src/invoice-delivery/invoice-delivery.module.ts` | Imported realtime module | Inject publisher | Low | Backend build |
| `backend/src/invoice-delivery/invoice-delivery.service.ts` | Atomic delivery; moved notifications; events | Prevent duplicate delivery and pre-commit side effects | Medium | Build; E2E suite |
| `backend/src/stock-items/stock-items.service.ts` | Atomic adjustment review | Prevent double approval/rejection | Medium | Backend build |
| `backend/src/attendance/attendance.service.ts` | Enforced final time ordering | Repair known correction defect | Low | Attendance tests |
| `backend/src/attendance/attendance.service.spec.ts` | Added regression test | Lock in correction invariant | Low | 12 tests passed |
| `frontend/src/hooks/useRealtimeEvents.ts` | Added streaming/reconnect/refresh hooks | Consume authorized server events | Medium | Frontend build |
| `frontend/src/components/Layout.tsx` | Mounted realtime connection | Keep employee screens synchronized | Low | Frontend build |
| `frontend/src/pages/accountant/PendingInvoices.tsx` | Refresh on invoice events | Accountant sees new/processed invoices | Low | Frontend build |
| `frontend/src/pages/admin/Invoices.tsx` | Refresh on invoice lifecycle events | Admin list freshness | Low | Frontend build |
| `frontend/src/pages/inventory/InvoiceDelivery.tsx` | Refresh queue/details on delivery events | Inventory workflow freshness | Low | Frontend build |
| `backend/test/invoice-lifecycle.e2e-spec.ts` | Cleans expenses/categories in teardown | Restore test isolation | Low | E2E: 15 passed |

## Validation Matrix

| Check | Result |
|---|---|
| Fresh database migration | NOT RE-RUN in this pass; prior migration audit documents PASS |
| Migration status | PASS |
| Prisma validation | PASS |
| Prisma generation | PASS |
| Backend unit tests | PASS: 10 suites, 71 passed |
| Backend build | PASS |
| Frontend build | PASS |
| Frontend lint | PASS with warning-level findings |
| Backend startup | PASS: listening on `:3001` |
| Database connectivity | PASS: Prisma status and E2E |
| API authentication smoke | PASS: valid login `201`, invalid login `401` |
| Realtime authorization smoke | PASS: valid SSE `200` ready frame; invalid token rejected |
| Business flow | PASS: E2E 15 passed |
| Serialized inventory flow | PASS: E2E |
| Non-serialized inventory flow | PASS: E2E |
| Multi-user concurrency | PARTIAL: concurrent invoice and idempotency tests passed; isolated browser identity matrix not run |
| Realtime synchronization | PARTIAL: backend/frontend path built and endpoint smoke-tested; browser event propagation not run |
| Notification synchronization | PARTIAL: persistence and existing notification tests; full realtime notification matrix not run |
| Reconnect synchronization | PARTIAL: browser retry smoke observed 3 forced SSE aborts; full missed-event test not run |
| Security audit | PASS for reviewed request paths; residual findings documented |
| Remaining migration drift | NO evidence in current status; fresh diff not re-run |
| Remaining critical issues | NO known critical issue from executed checks |
| Remaining high issues | YES: broad realtime adoption and browser-level concurrency verification remain |
| Remaining medium issues | YES: frontend lint warnings, localStorage token model, process-local rate limiting |

## Final Assessment

The repository is in a materially stronger and more deterministic state: database migrations are current, core lifecycle races are guarded, invoice creation is idempotent, the known attendance correction defect is fixed, and authorized invoice/stock/change-request events can synchronize connected clients without refreshes. It is not accurate to call the system fully production-ready yet because broad screen adoption, fresh-database replay in this pass, and browser-level multi-user/reconnect verification remain incomplete.

## Follow-up delta — 2026-09-27

- Activated and passed the existing duplicate-invoice E2E test: `15 passed, 0 skipped`.
- Added `globalSetup` to `backend/test/jest-e2e.json`; this fixed stale development idempotency data leaking between E2E runs.
- Added post-commit events for stock receipt creation/pricing and invoice change-request creation.
- Frontend admin stock-pricing and change-request queues now refresh from those events.
- Backend and frontend builds pass after the follow-up changes.
- Browser smoke: Admin, Sales, and Inventory reached authenticated home screens; forced SSE aborts triggered the frontend retry loop while the Sales session remained usable.

Additional files changed in the follow-up:

| Path | Change | Reason | Verification |
|---|---|---|---|
| `backend/src/invoices/invoices.controller.ts` | Accepts `Idempotency-Key` | Expose duplicate-request contract | Backend build; E2E |
| `backend/src/invoices/invoices.service.ts` | Claims, stores, and replays idempotent invoice responses | Prevent duplicate invoice creation | Unit tests; E2E |
| `backend/test/jest-e2e.json` | Enables existing global setup | Prevent stale database state | Isolated and full E2E |
| `backend/src/stock-receipts/stock-receipts.module.ts` | Imports realtime module | Publish stock events | Backend build |
| `backend/src/stock-receipts/stock-receipts.service.ts` | Publishes post-commit receipt/pricing events | Synchronize pricing queue | Backend build |
| `backend/src/invoice-change-requests/invoice-change-requests.module.ts` | Imports realtime module | Publish change-request events | Backend build |
| `backend/src/invoice-change-requests/invoice-change-requests.service.ts` | Publishes post-commit creation event | Synchronize admin queue | Backend build |
| `frontend/src/hooks/useRealtimeEvents.ts` | Invalidates stock/change-request caches | Keep shared state fresh | Frontend build |
| `frontend/src/pages/admin/StockPricing.tsx` | Refreshes on stock events | Remove manual refresh dependency | Frontend build |
| `frontend/src/pages/admin/ChangeRequests.tsx` | Refreshes on change-request events | Remove manual refresh dependency | Frontend build |
