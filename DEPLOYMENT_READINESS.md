# Deployment Readiness Review — Pallet POS

**Reviewed:** 2026-09-28 · **Target:** Hostinger KVM 1 (1 vCPU / 4 GB RAM / 50 GB NVMe, Ubuntu 24.04), Docker Compose (Postgres + NestJS API + Caddy), daily `pg_dump`
**Reviewer:** Tech Lead (consolidated from Backend, Frontend, Database, Security, DevOps/SRE, QA perspectives)
**Method:** read-only code inspection + real command execution (`npm ci`, builds, lint, tests, `prisma validate/migrate status/migrate deploy`, `npm audit`). No source file was modified during the review.

---

## 1. Executive Summary

**Readiness score: 5.5 / 10**

**Verdict: `NO-GO` (as the repo stands today)**

The *application code* is in decent shape: both apps build cleanly, 94 backend unit tests pass, migrations are clean and reproducible on an empty database, and the authentication core (argon2, refresh rotation with revocation, per-request role freshness) is above average for a project of this size. What is missing is everything that turns code into a deployable service: there is not a single Dockerfile/compose file, no CI, no health endpoint, no startup environment validation, no backup script — and the repository has **zero commits**, so there is no artifact to deploy at all. On top of that, two scripts in the repo will destroy a database if pointed at production (`prisma seed`, and the e2e test setup).

This is a **NO-GO only because blockers are open**; the blockers are additive work (roughly 3–5 days for a solo dev), not deep architectural defects. Fix Phase A below and the verdict becomes **GO WITH CONDITIONS** (conditions = Phase B).

**Findings by severity: 3 BLOCKER · 12 HIGH · 12 MEDIUM · 6 LOW (33 total)**

**Top 5 risks in plain language:**

1. **Nothing can be deployed yet.** No Dockerfile, no compose file, no Caddy config, no CI, and `git log` fails with *"your current branch 'master' does not have any commits yet"*. Any "deployment" today would be hand-copied files with no rollback path.
2. **Two scripts wipe databases.** `backend/prisma/seed.ts` deletes every business table unconditionally and creates accounts with well-known passwords; `backend/test/global-setup.ts` runs `TRUNCATE … RESTART IDENTITY CASCADE` on whatever database `DATABASE_URL` points to. Run either against production and you lose all data.
3. **Realtime is silently broken in two ways.** The SSE authorization filter uses `&&` where it needs `||`, so role-scoped events are broadcast to every connected role (`realtime.controller.ts:35-43`); and the client never reconnects after a *clean* server-side close (`useRealtimeEvents.ts:67-71`), i.e. realtime dies after every deploy until users reload.
4. **The login endpoint has no rate limiting.** `POST /api/auth/login` is internet-facing with no throttler anywhere in the dependency tree — trivial online brute force against a username/password API.
5. **Financial reports are wrong.** Revenue/net-profit aggregation never subtracts invoice-level discounts (`reports.service.ts:56-88`) and date ranges are parsed as UTC while the business runs on Africa/Cairo (`reports.service.ts:27-41`) — the owner will see overstated revenue and reports whose day boundaries are off by 2–3 hours.

---

## 2. Project Snapshot

### Detected architecture

| Item | Value | Evidence |
|---|---|---|
| Repo layout | two independent npm projects (`backend/`, `frontend/`), no root workspace, **0 git commits, no remote** | `git log` → *"does not have any commits yet"*; `git remote -v` empty; `git ls-files` = 0 |
| Backend | NestJS ^10.4, Prisma ^5.20 (CLI/client **5.22.0**), PostgreSQL, JWT + passport-jwt, argon2, class-validator | `backend/package.json` |
| Frontend | React ^19.2, Vite ^8.3, TS ~6.0, react-router-dom ^7, axios, TanStack Query, custom i18n (en/ar complete: 101/101 top-level keys, no drift) | `frontend/package.json`; i18n key diff = 0 |
| API shape | global prefix `/api`, 124 endpoints across 24 controllers, Swagger only when `NODE_ENV !== 'production'` | `backend/src/main.ts:13,38-47` |
| Realtime | in-process SSE `GET /api/realtime/events`, JWT in `Authorization` header, client uses `fetch` (not `EventSource`) | `backend/src/realtime/realtime.controller.ts:24`, `frontend/src/hooks/useRealtimeEvents.ts:57` |
| Node | v24.15.0 / npm 11.12.1 used for verification; **no `engines` field in either package.json** | `node -v` |
| Lockfiles | `backend/package-lock.json`, `frontend/package-lock.json` (present, used by `npm ci`); root `package-lock.json` is a 92-byte empty stub | — |
| Scripts (backend) | `build`, `start:prod`, `prisma:migrate`, `prisma:migrate:prod`, `prisma:seed`, `lint`, `test`, `test:e2e` | `backend/package.json:6-19` |
| Scripts (frontend) | `dev`, `build` (`tsc -b && vite build`), `lint` (oxlint), `preview` — **no `test` script** | `frontend/package.json` |
| Docker / CI / docs | **none**: no Dockerfile, no compose, no `.dockerignore`, no `.github/`, no `.env.example`, no root README (only Vite template `frontend/README.md`) | recursive file scan |
| Env files | `backend/.env` exists (13 vars, **not** git-ignored-by-root but `backend/.gitignore:3` lists `.env`; repo has no commits so nothing is tracked) | `.gitignore`, `git ls-files` |

### Verification results (real output)

| Check | Command | Result |
|---|---|---|
| Clean install (backend) | `npm ci` | ✅ **PASS** — `added 909 packages in 3m`. (First attempt **failed** with `EPERM … query_engine-windows.dll.node` because your running dev servers on :3001/:5174 locked native binaries; after stopping them, `npm ci` succeeded. This is a local Windows quirk, not a code defect — but see finding M-3 for the analogous risk on the VPS.) |
| Clean install (frontend) | `npm ci` | ✅ **PASS** — `added 207 packages` |
| Frontend typecheck + build | `npm run build` | ✅ **PASS** — `✓ 244 modules transformed … built in 2.16s`. Warning: `Some chunks are larger than 500 kB` → `dist/assets/index-*.js` = **1,943.71 kB (gzip 539.62 kB)**, one single chunk (finding M-4) |
| Backend build | `npm run build` (`nest build`) | ✅ **PASS** — `dist/main.js` produced, `dist` = 1.3 MB |
| Frontend lint | `npx oxlint` | ✅ **PASS** (exit 0) — warnings only, all pre-existing (`set-state-in-effect`, unused imports) |
| Backend lint | `npm run lint` → `eslint …` | ❌ **FAIL** — `ESLint couldn't find an eslint.config.* file`; `backend` has **no eslint in dependencies and no config file** (finding H-7) |
| Backend unit tests | `npm test` (jest, 11 suites) | ✅ **PASS** — `Test Suites: 11 passed, Tests: 94 passed, Time: 60.3 s` |
| Backend e2e tests | `npm run test:e2e` | ⛔ **NOT RUN — deliberately.** `test/global-setup.ts:39` executes `TRUNCATE TABLE … RESTART IDENTITY CASCADE` on 27 tables of the database named in `DATABASE_URL` (your dev DB `pallet_pos`). Running it would have destroyed your data (finding BLK-2) |
| Prisma schema | `npx prisma validate` | ✅ **PASS** |
| Migration status vs dev DB | `npx prisma migrate status` | ✅ **PASS** — `18 migrations found … Database schema is up to date!` |
| Migrations on an **empty** database | `prisma migrate deploy` against a scratch DB `pallet_deploy_readiness_test` | ✅ **PASS** — `All migrations have been successfully applied.` (scratch DB dropped afterwards) |
| Prod dependency audit (backend) | `npm audit --omit=dev` | ⚠️ **11 vulnerabilities (1 low, 6 moderate, 4 high)** — highs: `lodash` (code injection / prototype pollution, via `@nestjs/config` + `@nestjs/swagger`), `js-yaml` (prototype pollution, via `@nestjs/swagger`), `multer` (DoS, via `@nestjs/platform-express` → the logo-upload endpoint) |
| Prod dependency audit (frontend) | `npm audit --omit=dev` | ⚠️ **2 moderate** — `uuid` via `exceljs` (browser-side export code; low practical impact) |
| Build memory (target box) | — | ⚠️ `npm ci` + `tsc` + `vite` peaks well above 2 GB; on 4 GB / 1 vCPU **without swap the build will OOM** (runbook §6.2 adds 4 GB swap and §6.8 offers alternatives) |

**Money & data integrity (Database/Backend):** all monetary columns are `Decimal(18,2)` (`schema.prisma:336-340,362,634`, etc.), FKs are consistently indexed (70+ `@@index` blocks), there are DB-level CHECK constraints (`business_rule_constraints` migration), soft deletes are used for business entities, and invoice numbering uses a dedicated `InvoiceSequence` table. **Solid.** Gaps: totals are computed in JS float before being stored (M-7), and list endpoints do not cap `limit` (M-1).

---

## 3. Findings Table

Sorted by severity, then by effort (S < M < L).

| ID | Severity | Area | Title | Location (file:line) | Why it matters | Recommended fix | Effort |
|---|---|---|---|---|---|---|---|
| BLK-1 | 🔴 BLOCKER | DevOps | No deployment artifacts; repo has zero commits, no root `.gitignore`, no CI | repo root (`git log` → no commits); no `Dockerfile`/`compose`/`.github` anywhere | You cannot deploy, audit, or roll back what is not committed and not containerized; the planned Compose stack does not exist yet | Commit the repo (add root `.gitignore`), add multi-stage Dockerfiles + `compose.yml` + `Caddyfile` + `.dockerignore`, add a minimal CI pipeline (runbook §6.6–6.8) | M |
| BLK-2 | 🔴 BLOCKER | QA/DB | e2e test setup truncates the target database | `backend/test/global-setup.ts:39` (`TRUNCATE TABLE … RESTART IDENTITY CASCADE` ×27) | `npm run test:e2e` wipes whichever DB `DATABASE_URL` points at. One careless run on the VPS (or in future CI with prod env) = total data loss | Use a separate `TEST_DATABASE_URL`; refuse to run if `NODE_ENV=production` or if the URL host/db matches production; truncate only tables created by the test run | S |
| BLK-3 | 🔴 BLOCKER | Security/DB | Seed script deletes all data and creates well-known weak accounts | `backend/prisma/seed.ts:6-37` (deleteMany ×31), `:58-83` (admin/accountant/sales/inventory defaults), `backend/package.json:15` (`prisma:seed`) | `prisma:seed` is the natural command a deployer runs — against production it erases everything and leaves a publicly guessable admin login | Guard: refuse when `NODE_ENV=production`; require `--force`; generate a random password printed once; document "never run seed on prod" in the runbook (§6.10) | S |
| H-1 | 🟠 HIGH | Security | SSE per-event role filtering logic is inverted (`&&` instead of `||`) | `backend/src/realtime/realtime.controller.ts:35-43` | Events scoped to e.g. `[ADMIN, ACCOUNTANT]` are delivered to every connected role (SALES, INVENTORY…) because the drop condition requires *both* a role mismatch *and* an employee mismatch. `roles`-only events (7 of 9 publish sites) are effectively broadcast to all | Change to: drop when `event.roles && !includes(role)` **or** (`event.employeeIds && !includes(id)`); add a unit test for the predicate | S |
| H-2 | 🟠 HIGH | Frontend | SSE client does not reconnect after a clean server-side close | `frontend/src/hooks/useRealtimeEvents.ts:67-71` (`if (done) break;` then function ends), `:83` (`void connect()` once) | Reconnect/backoff only runs inside `catch`. A graceful server close (deploy, restart, proxy idle timeout) ends the read loop **without an error** → no realtime until the user reloads the page | After the `while` loop, if `!stopped`, schedule `connect()` with the same backoff as the error path | S |
| H-3 | 🟠 HIGH | Security | No rate limiting / lockout on `POST /api/auth/login` | `backend/src/auth/auth.controller.ts:18`; no `@nestjs/throttler` in `backend/package.json` | Internet-facing credential endpoint with no throttling = online brute force and credential stuffing; also no audit trail of failed attempts | Add `@nestjs/throttler` (e.g. 10/min per IP+username on `auth/login`, 5/min on `auth/refresh`), plus exponential backoff on repeated failures | M |
| H-4 | 🟠 HIGH | Backend | No startup environment validation; secrets can be missing/wrong until runtime; QR secret falls back to `''` | `backend/src/app.module.ts:26` (`ConfigModule.forRoot({ isGlobal: true })` — no validation), `backend/src/auth/auth.module.ts:20-22`, `backend/src/auth/auth.service.ts:72,242`, `backend/src/attendance/qr-token.service.ts:31-33` (`… \|\| ''`) | A missing `JWT_REFRESH_SECRET` only explodes when someone logs in (500s); a missing access secret fails deep inside passport; an empty-string fallback would sign attendance QRs with an empty key. Fast-fail at boot is the only safe behavior for a containerized service | Validate with a schema at boot (`joi`/`zod` + `ConfigModule.forRoot({ validate })`): require `DATABASE_URL`, `JWT_ACCESS_SECRET` (≥32 random bytes), `JWT_REFRESH_SECRET` (independent value), `ATTENDANCE_QR_SECRET`; throw and exit if absent | S |
| H-5 | 🟠 HIGH | Backend | No graceful shutdown | `backend/src/main.ts` (whole file — no `enableShutdownHooks`); `backend/src/prisma/prisma.service.ts:11-16` (`OnModuleDestroy` exists but never fires on SIGTERM without hooks) | `docker compose stop/restart` sends SIGTERM; Nest's default is to exit immediately → in-flight requests are dropped and Prisma never disconnects cleanly | `NestFactory.create(AppModule, { abortOnError: false })` + `app.enableShutdownHooks()` | S |
| H-6 | 🟠 HIGH | DevOps | No health endpoint | grep for `health`/`SIGTERM` in `backend/src` → **no matches** | Docker `healthcheck`, load-balancer probes and uptime monitors need a cheap endpoint; the closest thing today is the public `GET /api/settings/brand` (`settings.controller.ts:36`) which does not touch the DB | Add `GET /api/health` returning `{status, db: 'up'\|'down', version}` with a 503 when `$queryRaw` fails; use it in compose healthcheck and the monitor | S |
| H-7 | 🟠 HIGH | QA | Backend lint gate is broken | `backend/package.json:16` (`"lint": "eslint …"`), no `eslint` dependency, no `eslint.config.*`/`.eslintrc*` file | Real output: `ESLint couldn't find an eslint.config.* file`. There is **no static analysis** for the backend — regressions rely entirely on the 94 unit tests | Install ESLint 9 + `typescript-eslint` + flat config (mirror the existing `oxlint` rules), wire into CI | S |
| H-8 | 🟠 HIGH | Security | Frontend silently defaults a missing role to `ADMIN` | `frontend/src/lib/auth.tsx:46` and `:90` — `data.employee ?? { id: 0, name: "", username: "", role: "ADMIN" as Role }` | A malformed/ truncated login or refresh response mounts the **full admin navigation** for a user who is not an admin. Backend authorization still holds (verified: guards on every controller), so this is UI-level privilege display — but it leaks admin menu structure and invites deeper UI bugs | Fail hard when `employee` is missing; never default `role` | S |
| H-9 | 🟠 HIGH | Backend | Revenue / net-profit ignores invoice-level discounts | `backend/src/reports/reports.service.ts:56-88` (`netSales = originalSales + adjustments − returns`; no `discountAmount`/`discountPercentage`) | Revenue is overstated whenever a discount is used, while the customer report sums `currentTotal` (discount-aware) → two reports in the same dashboard disagree. This is the number the business owner will trust | Standardize all revenue math on discount-aware totals (allocate invoice discount proportionally to lines, as the refund logic already does) | M |
| H-10 | 🟠 HIGH | Backend | Report date ranges are UTC-based while the business is Africa/Cairo | `backend/src/reports/reports.service.ts:27-41` (`new Date('YYYY-MM-DD')`, `inclusiveEnd.setUTCDate(+1)`); invoices use server-local `T00:00:00` (`invoices.service.ts:13-37`) | Cairo is UTC+2/+3: "2026-09-28" starts at 21:00/22:00Z on the 27th. Early-morning sales fall outside the requested window, and three different date-range semantics coexist (reports / invoices / attendance) | One shared timezone-aware `startOfDayInTimezone`/`endOfDayInTimezone` helper driven by `AppSetting.timezone`, used everywhere | M |
| H-11 | 🟠 HIGH | Security | 4 high-severity production dependency vulnerabilities | `npm audit --omit=dev` (backend): `lodash` (via `@nestjs/config`, `@nestjs/swagger`), `js-yaml` (via `@nestjs/swagger`), `multer` (via `@nestjs/platform-express`, reachable from `POST /api/settings/logo`) | `multer` DoS is reachable on an admin-only endpoint; `lodash.template` code injection and `js-yaml` prototype pollution are lower-probability but flagged high by the registry. Shipping with known highs is hard to defend | Run non-breaking `npm audit fix` first; schedule a Nest 10→11 upgrade for the rest; drop `@nestjs/swagger` from production dependencies (it is only used behind `NODE_ENV !== 'production'`) | M |
| H-12 | 🟠 HIGH | QA | Critical flows have no tests; frontend has zero tests | `frontend/package.json` (no test script), no `*.test.*`/`*.spec.*` files in `frontend/src`; backend has 1 spec + 1 e2e for invoices only | Order lifecycle beyond invoices (change-request approvals, delivery scan, expenses validation, reports math) and the entire UI (login/refresh/role guards/SSE) are unverified. The e2e that does exist cannot currently be run safely (BLK-2) | After BLK-2: add a test DB, keep the authorization-matrix e2e (it is valuable), add Vitest smoke tests for auth + role routing | M |
| M-1 | 🟡 MEDIUM | Backend | `limit` query parameter is not capped | `backend/src/invoices/invoices.controller.ts:76-78` (`limit: limit ? parseInt(limit, 10) : 25`) → `take: limit` | A client can request `limit=1000000` and force a huge query + JSON payload — an easy memory/CPU DoS on a 1 vCPU box | Clamp `limit` to ≤100 in one place (pipe or shared helper) | S |
| M-2 | 🟡 MEDIUM | Security | Access + refresh tokens stored in `localStorage` | `frontend/src/lib/auth.tsx:59-61`, `frontend/src/lib/api.ts:13` | Any XSS becomes full account takeover (tokens readable by injected script). Accepted tradeoff in many SPAs, but worth stating | Short term: strict CSP via Caddy (§6.8) + keep the 15 m access expiry. Longer term: `httpOnly; Secure; SameSite=Strict` refresh cookie + Bearer in memory | M |
| M-3 | 🟡 MEDIUM | Backend | Unused heavy dependencies: `puppeteer` + `handlebars` | `backend/package.json:34-35`; grep across `src/`, `prisma/`, `test/` → **no usage** | `npm ci` downloads a full Chromium (~250–400 MB) on every build → wasted disk on 50 GB, wasted RAM/time on 1 vCPU, larger audit/attack surface | Remove both (PDF generation was never implemented); if kept, set `PUPPETEER_SKIP_DOWNLOAD=1` in the Dockerfile | S |
| M-4 | 🟡 MEDIUM | Frontend | Single 1.94 MB JS bundle, no code splitting | build output `dist/assets/index-*.js` = 1,943.71 kB (gzip 539.62 kB), 244 modules in one chunk | First load on a weak connection/old POS tablet pays for reports/Excel/i18n code it may never use | Route-level `React.lazy` + `Suspense` for `/admin/reports/*`, Excel export, kiosk; keep the vendor chunk separate | M |
| M-5 | 🟡 MEDIUM | Frontend | No React error boundary / global error UI | grep `ErrorBoundary|componentDidCatch|errorElement` in `frontend/src` → **no matches** | Any render-time exception blanks the whole app with a white screen — indistinguishable from "server down" for staff | Wrap `<Layout>` (and the router) in an error boundary with a "Reload / Report" fallback | S |
| M-6 | 🟡 MEDIUM | Process | The known-issues log is stale — several items marked *Open* are already fixed | `PROJECT_REFERENCE.md:251` (ISS-003), `:256` (ISS-008), `:264` (ISS-016), `:271` (ISS-023), `:273` (ISS-025) vs code: `invoice-change-requests.service.ts` `approve()` now processes all groups inside a transaction with `claimAndReload`; DTO is a class with `@IsNotEmpty`/`@ValidateNested`; `findAll` scopes by `requestedByEmployeeId` | A risk register that is wrong in both directions trains people to ignore it; meanwhile items I re-verified as genuinely open (H-9, H-10, M-1) sit below fixed ones | Re-triage the table, mark verified-fixed items, and make "update ISS log" part of every fix PR | S |
| M-7 | 🟡 MEDIUM | Backend | Totals/discounts computed with JS floating point before storage | `backend/src/invoices/invoices.service.ts:39-56,184-188` (see ISS-012) | DB is `Decimal(18,2)` but the math that produces `currentTotal`/`discountAmount` runs in binary floats, and the *stored* `discountAmount` can exceed what was actually applied | Compute in integer cents (or `Decimal.js`) and clamp stored discount to the applied value | M |
| M-8 | 🟡 MEDIUM | Backend | Attendance scan rate-limit state is an in-memory `Map` | `backend/src/attendance/attendance.service.ts:51-68` | Resets on restart; not shared across instances; buckets never expire (bounded by employee count). Acceptable for a single instance — documented single-instance design | Leave for now; move to DB/Redis only if a second API instance is ever planned | S |
| M-9 | 🟡 MEDIUM | Backend | No per-user SSE connection cap; heartbeat writes to possibly-dead sockets | `backend/src/realtime/realtime.controller.ts:48-49` | A stuck client (or a bug) can open unbounded connections on a 1 vCPU/4 GB box; each holds a response stream + interval | Cap connections per employee (e.g. 5) and close the oldest; add `response.on('error')` handling | S |
| M-10 | 🟡 MEDIUM | Security | No security headers in the app (no Helmet) | `backend/src/main.ts:22-36` (CORS + validation only) | Missing `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS, CSP. Acceptable **only if** the proxy supplies them | Since Caddy terminates TLS, add the headers in the Caddyfile (provided in §6.8) — no code change needed for launch | S |
| M-11 | 🟡 MEDIUM | DevOps | `/uploads` is served unauthenticated | `backend/src/main.ts:20` (`useStaticAssets(uploadsDir, { prefix: '/uploads' })`) | Only logos live there and filenames are `randomUUID()` + extension with path-traversal protection (`uploads.util.ts:14-23`), so impact is limited — but it is a public file store with no logging | Keep public if logos must render on the login page (they do); otherwise proxy `/uploads` through auth. Ensure the directory is a **named volume** so logos survive redeploys | S |
| M-12 | 🟡 MEDIUM | DevOps | `FRONTEND_URL` exists in `.env` but is never read by any code | grep `FRONTEND_URL` across `backend/src` + `frontend/src` → **no matches** | Dead configuration invites someone to set it and believe it does something (e.g. trusting it for CORS or redirects) | Remove it, or wire it up where intended | S |
| L-1 | 🟢 LOW | Backend | Boot logging is a bare `console.log`; no structured logs | `backend/src/main.ts:51` | Docker captures stdout fine, but plain text is harder to ship/query than JSON; no request logging middleware at all | Use the Nest `Logger` at boot; add a request logger (method/path/status/duration, **no bodies**) | S |
| L-2 | 🟢 LOW | Frontend | Third-party Google Fonts loaded at runtime | `frontend/index.html:11-18` | Adds a third-party request on every page load (privacy + availability if fonts.googleapis.com is blocked/slow) | Self-host the 4 font families under `/fonts` and drop the `<link>` | S |
| L-3 | 🟢 LOW | Docs | No root README, frontend README is the untouched Vite template, no `engines` field | `frontend/README.md:1`, no root README, `package.json` (both) | New contributors (or you in 6 months) have no run instructions; Node version is implicit | Root README with setup/run/test; `"engines": { "node": ">=20" }` in both packages | S |
| L-4 | 🟢 LOW | Repo | Root `package-lock.json` is an empty stub | `package-lock.json` (92 bytes, `"packages": {}`) | Misleading: suggests a root npm workspace that does not exist | Delete it or add a real root workspace | S |
| L-5 | 🟢 LOW | Repo | `backend/.gitignore` ignores **all** `*.js` files | `backend/.gitignore:6` (`*.js`) | Any hand-written JS utility added later would be silently untracked | Narrow the pattern (`dist/`, `coverage/`, `node_modules/`) | S |
| L-6 | 🟢 LOW | Security | Frontend: 2 moderate vulns (`uuid` via `exceljs`) | `npm audit --omit=dev` (frontend) | Advisory is a Node buffer issue; the code path runs in the browser → low practical impact | Revisit when `exceljs` publishes a fix; not launch-blocking | S |

---

## 4. Detailed Findings (BLOCKER + HIGH)

### BLK-1 — No deployment artifacts, no commits

**Evidence**
```
$ git log --oneline -5
fatal: your current branch 'master' does not have any commits yet
$ git remote -v
(no output)
$ git ls-files | Measure-Object -Line   →  0
$ <recursive scan>  Dockerfile*/compose*/.github/.env.example  →  none
```

**Risk.** Deployment readiness is not a property of code — it is a property of *reproducible artifacts*. Today the only way to deploy is to hand-copy `dist/` folders onto the VPS, which means: no rollback, no audit trail of what is running, no review of changes, and no place for CI to run. The planned three-container Compose stack (Postgres + API + Caddy) described by the owner does not exist in the repository in any form.

**Fix.** (1) Add a root `.gitignore` (at minimum `node_modules/`, `dist/`, `backend/.env`, `uploads/`), (2) make an initial commit, (3) create a private remote, (4) add the four files specified in runbook §6.6–6.8 (backend Dockerfile, frontend Dockerfile, `compose.yml`, `Caddyfile`) plus `.dockerignore`, (5) minimal CI (§6.12).

---

### BLK-2 — The e2e suite destroys the database it points at

**Evidence** — `backend/test/global-setup.ts:6-43`:
```ts
async function cleanDatabase() {
  const tablenames = ['StockConsumption', 'StockAdjustment', … 'Employee'];
  for (const tablename of tablenames) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" RESTART IDENTITY CASCADE;`);
  }
}
```
`test/jest-e2e.json` has **no** env override; `global-setup` runs a plain `new PrismaClient()` → reads `backend/.env` → `DATABASE_URL` → your live dev database `pallet_pos`. The same pattern exists in `invoice-lifecycle.e2e-spec.ts:139-160`.

**Risk.** This is the classic "test suite pointed at prod" data-loss scenario. It is *not* hypothetical: I did not run `npm run test:e2e` during this review for exactly this reason. One `DATABASE_URL=<prod> npm run test:e2e` on the VPS (or in a future CI job that inherits the server env) erases every invoice, customer and employee.

**Fix.**
```ts
// test/global-setup.ts
if (process.env.NODE_ENV === 'production' || !process.env.DATABASE_URL?.includes('test')) {
  throw new Error('Refusing to truncate a non-test database');
}
```
…plus a dedicated `TEST_DATABASE_URL` (e.g. `pallet_test`) created once on the server, and documented in CI.

---

### BLK-3 — Seed wipes data and ships weak default accounts

**Evidence** — `backend/prisma/seed.ts:6-37` (`cleanDatabase()` issues `deleteMany()` for 31 models inside one transaction), `:58-83` creates `admin / accountant / sales / inventory` with fixed, well-known passwords, `:118` a kiosk account. `backend/package.json:15` exposes it as `npm run prisma:seed`.

**Risk.** Two failure modes: (a) **data loss** — seed is destructive by design and there is no guard; (b) **takeover** — the credentials are in the repository, so anyone who can reach the login page and knows this is a "Pallet" install can try them. Together they are the single most dangerous pair of lines in the repo for a production launch.

**Fix.**
```ts
if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('Refusing to seed production'); process.exit(1);
}
// generate the admin password:
const password = process.env.ADMIN_PASSWORD ?? crypto.randomBytes(18).toString('base64url');
console.log('Created admin with password (shown once):', password);
```
For production, prefer the dedicated create-admin script in runbook §6.11 over `seed` entirely.

---

### H-1 — SSE authorization filter is logically wrong

**Evidence** — `backend/src/realtime/realtime.controller.ts:35-43`:
```ts
if (
  (event.roles && !event.roles.includes(user.role)) &&
  (event.employeeIds && !event.employeeIds.includes(user.id))
) {
  return;              // drops the event
}
if (!event.roles && !event.employeeIds) return;
response.write(...)
```

**Risk (the concept).** The intent is: *"send only if the recipient is in the target audience"*. The code drops an event only when the user fails the role check **and** fails the employee check. For an event with `roles` only (no `employeeIds`) — which is the case for `invoice.created`, `invoice.delivery.scan`, `invoice.delivered`, all `stock.receipt.*`, `invoice.change-request.created` (7 of the 9 publish sites, e.g. `invoices.service.ts:423-428`) — the second clause is `undefined`, the `&&` short-circuits to false, and the event is **sent to every connected user regardless of role**. Audience filtering for those events is effectively nonexistent.

**Concrete impact.** A SALES session receives `invoice.created` / `stock.receipt.*` / `change-request.created` events (entityId + status payload). The client reacts by invalidating queries (`useRealtimeEvents.ts:22-27`), and the subsequent REST fetches are still properly authorized server-side, so this is metadata leakage plus unauthorized cache invalidations rather than a data breach. It is still broken access control in code that claims to implement access control.

**Fix.**
```ts
const roleMiss   = event.roles      && !event.roles.includes(user.role);
const employeeMiss = event.employeeIds && !event.employeeIds.includes(user.id);
if (event.roles && event.employeeIds) { if (roleMiss && employeeMiss) return; }
else if (roleMiss || employeeMiss) return;
```
…define the intended semantics explicitly (union when both present, single dimension otherwise) and unit-test each combination.

---

### H-2 — SSE client never reconnects after a graceful close

**Evidence** — `frontend/src/hooks/useRealtimeEvents.ts:51-83`:
```ts
const connect = async () => {
  ...
  while (!stopped) {
    const { done, value } = await reader.read();
    if (done) break;          // clean EOF → loop exits → function returns
    ...
  }
}                             // ← no reconnect scheduled here
...
void connect();               // called exactly once
// reconnectTimer is only ever set inside `catch` (line 77)
```

**Risk (the concept).** `fetch` + `ReadableStream` reports an orderly server shutdown as `done: true`, *not* as an exception. Every deploy, `docker compose restart`, or proxy idle-timeout ends the stream cleanly → the code falls out of the loop and returns → nothing re-arms the connection. The only path that reconnects is a thrown error (network reset mid-stream). Result: after the first restart of the API, **no user gets realtime updates until they manually reload** — which in a POS means the kitchen/waiter screens silently stop updating, the most expensive kind of failure because nobody notices.

**Fix.** After the `while` loop: `if (!stopped) reconnectTimer = window.setTimeout(connect, reconnectDelay); reconnectDelay = Math.min(reconnectDelay*2, 10000);`. Add a visibility/online listener while you are there.

---

### H-3 — No brute-force protection on login

**Evidence** — `backend/src/auth/auth.controller.ts:18-23` (`@Post('login')` with no throttle decorator), `backend/package.json` contains no `@nestjs/throttler`, no `express-rate-limit`; the only rate limiting in the codebase is the attendance scan limiter (`attendance.service.ts:51-68`).

**Risk.** `POST /api/auth/login` will be on the public internet behind Caddy. Passwords are argon2-hashed (good — offline cracking is expensive) and employee passwords are short by policy (`create-employee.dto.ts:23` allows `MinLength(6)`), which makes *online* guessing comparatively attractive: ~10k attempts/day against a 6-character password space is a real risk, and there is currently nothing to stop it.

**Fix.** `@nestjs/throttler` registered globally with a strict override on `auth/login` (e.g. 10/min per IP, plus a per-username limiter), `retry-after` headers, and log failures. Consider requiring a password change on first login for seeded accounts.

---

### H-4 — Secrets are not validated at startup

**Evidence**
- `backend/src/app.module.ts:26` — `ConfigModule.forRoot({ isGlobal: true })`: no `validationSchema`, no `validate` function.
- `backend/src/auth/auth.module.ts:20-22` — `secret: config.get<string>('JWT_ACCESS_SECRET')` (may be `undefined`).
- `backend/src/auth/auth.service.ts:72,242` — refresh tokens signed/verified with `JWT_REFRESH_SECRET` (may be `undefined` → `jsonwebtoken` throws **at request time** → login returns 500).
- `backend/src/attendance/qr-token.service.ts:31-33` — `ATTENDANCE_QR_SECRET || JWT_ACCESS_SECRET || ''`: the last fallback is the **empty string**, an empty HMAC key.
- `backend/src/auth/jwt.strategy.ts:16` — `secretOrKey: configService.get('JWT_ACCESS_SECRET')` (fails inside passport, not at boot).

**Risk.** In a containerized deployment the failure mode matters as much as the failure: a container that crashes at boot with `MissingEnvError: JWT_ACCESS_SECRET` is caught immediately by the healthcheck; a container that boots fine and starts returning 500 on `/auth/login` at 09:00 on launch day is not. The `''` fallback is a "weak default" — today it is only reachable if *both* secrets are missing, but it is exactly the line that turns a misconfiguration into a silently-weak signature.

**Fix.** Validate at boot and exit non-zero on failure (runbook §6.7 shows the exact config); delete the `|| ''` fallback and throw instead.

---

### H-5 / H-6 — No graceful shutdown, no health endpoint

**Evidence** — grep for `enableShutdownHooks|SIGTERM` in `backend/src` → **no matches**; grep for `health` → **no matches**. `prisma.service.ts:11-16` implements `OnModuleInit`/`OnModuleDestroy`, but Nest only invokes lifecycle hooks on signals when `app.enableShutdownHooks()` is called.

**Risk.** Docker's default stop is SIGTERM + 10 s SIGKILL. Without shutdown hooks: in-flight requests are cut off mid-transaction (users see failed saves), and Prisma's connection pool is never closed (harmless on exit, but it masks the pattern). Without a health endpoint you cannot write a compose `healthcheck`, so `depends_on: condition: service_healthy` cannot be used to sequence Postgres → API → Caddy, and your uptime monitor has nothing cheap to probe.

**Fix.** `app.enableShutdownHooks()` in `main.ts`; add `GET /api/health` that runs `SELECT 1` and returns 503 on failure; wire both into compose (§6.8) and the monitor (§8).

---

### H-7 — Backend lint does not run

**Evidence**
```
$ cd backend && npx eslint "src/**/*.ts"
ESLint couldn't find an eslint.config.* file.
```
`backend/package.json` has no `eslint` in `dependencies` or `devDependencies`; no `.eslintrc*` / `eslint.config.*` exists anywhere in `backend/`.

**Risk.** The `"lint"` script looks like a gate but has never been one. For a solo dev this is the cheapest possible safety net (catches unused vars, floating promises, unsafe `any`) and it is currently missing on the side of the codebase that touches money and stock.

**Fix.** Add `eslint` + `typescript-eslint` + flat config; keep `oxlint` for the frontend; both run in CI (§6.12).

---

### H-8 — Missing `employee` payload defaults the UI role to ADMIN

**Evidence** — `frontend/src/lib/auth.tsx:46` and `:90`:
```ts
const employee = data.employee ?? { id: 0, name: "", username: "", role: "ADMIN" as Role };
```

**Risk.** If the API response is malformed (proxy error page parsed as JSON won't reach here, but a partial/alt-schema response will), the SPA believes the user is an admin: full admin sidebar, admin routes mounted, admin-only buttons visible. Backend authorization is intact (verified: every controller carries guards and `JwtStrategy.validate` re-reads role from DB per request — `jwt.strategy.ts:19-37`), so no data is exposed — but the UI will confidently show an admin shell to a non-admin, and any future code that trusts `user.role` client-side for *logic* (not just labels) becomes a vulnerability.

**Fix.** `if (!data.employee) throw new Error('Malformed login response')` in both `login` and `refreshToken`.

---

### H-9 / H-10 — Reports overstate revenue and use the wrong day boundaries

**Evidence**
```ts
// reports.service.ts:56-88
const originalSales = grossItems.reduce((t, i) => t + Number(i.price) * i.quantity, 0);
const netSales = originalSales + approvedAdjustments - approvedReturns;   // ← no discount subtraction

// reports.service.ts:27-41
const start = new Date(from);              // UTC midnight
inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() + 1);
```
Meanwhile invoice *listing* uses server-local `T00:00:00…T23:59:59.999` (`invoices.service.ts:13-37`) and attendance uses proper tz helpers (`attendance.service.ts:103-113`). The DB stores `discountAmount`/`discountPercentage` on `Invoice` (`schema.prisma:336-337`).

**Risk.** Two independent correctness bugs in the numbers the business is built on. (1) A day with 10,000 EGP of sales discounted by 20% is reported as 10,000, not 8,000 — and the customer report on the same screen shows 8,000, so the dashboard contradicts itself. (2) With Africa/Cairo at UTC+3, "September sales" silently excludes 21:00–23:59 on Aug 31 and includes 00:00–02:59 wrongly; early-morning sales (common in retail) fall out of the requested window. The refund logic *already* does discount-aware math (ISS-004 fixed) — the revenue path just never caught up.

**Fix.** (a) Compute net revenue from discount-aware totals: allocate each invoice's discount to its lines proportionally (same payment-ratio approach used for refunds), or standardize every report on `currentTotal`. (b) Introduce one timezone-aware range helper parameterized by `AppSetting.timezone` and use it in reports, invoices and expenses.

---

### H-11 — Known high-severity dependency vulnerabilities

**Evidence** — `npm audit --omit=dev` (backend): **11 vulnerabilities (1 low, 6 moderate, 4 high)**:
- `lodash` ≤4.17.23 — code injection via `_.template`, prototype pollution (via `@nestjs/config`, `@nestjs/swagger`)
- `js-yaml` 4.0.0–4.3.1 — prototype pollution + DoS (via `@nestjs/swagger`)
- `multer` ≤2.2.0 — DoS / resource exhaustion (via `@nestjs/platform-express` → `POST /api/settings/logo`)

**Risk.** `multer` is the only one with a directly reachable endpoint (admin-authenticated upload, 2 MB cap, extension+mimetype allowlist — `settings.controller.ts:76-104` — so exploitability is low but non-zero). The lodash/js-yaml issues are in the Swagger/config path; Swagger is disabled in production (`main.ts:38`) but the code is still bundled and `@nestjs/config` runs always. "4 highs in production dependencies" is also a bad look for any future audit.

**Fix.** Step 1: `npm audit fix` (non-breaking; resolves what it can). Step 2: move `@nestjs/swagger` to `devDependencies` and import it behind the existing `NODE_ENV !== 'production'` branch (or dynamic import). Step 3: schedule Nest 10 → 11 upgrade to clear `multer`/`body-parser`/`file-type`.

---

### H-12 — Test coverage does not cover what breaks

**Evidence** — measured: backend `npm test` = 11 suites / 94 tests (auth, roles guard, QR, attendance, invoices totals, change-request add/returns, reports, exception filter, customers wiring); e2e = invoice lifecycle + authorization matrix (**not run** — BLK-2). Frontend: **0 test files, no test script**.

**Gaps with the highest blast radius:** change-request approve/reject transactions (historically the bug-densest code — 5 of the last 8 critical bugs), delivery scan/deliver, stock-receipt pricing, expenses validation, report discount/timezone math (H-9/H-10 have no regression test), and everything in the browser (login/refresh/401-retry/role routing/SSE reconnect).

**Fix.** After BLK-2: dedicated test DB + `npm run test:e2e` in CI on every PR; Vitest for the frontend with smoke tests for login → role redirect → 401 refresh; regression tests written *with* the H-9/H-10 fixes.

---

## 5. Environment Variables Reference

All variables are read by the **backend** only. The frontend reads **no** runtime environment variables (verified: zero `import.meta.env` occurrences in `frontend/src`; API base URL is the relative `"/api"` in `frontend/src/lib/api.ts:5` — correct for same-origin Docker deployment).

| Variable | Used by | Required? | Purpose | Safe production example | How to generate |
|---|---|---|---|---|---|
| `DATABASE_URL` | backend (Prisma) | **Required** | Postgres connection string | `postgresql://pallet:<strong-pw>@db:5432/pallet?schema=public` | password: `openssl rand -base64 24`; user/db chosen by you |
| `JWT_ACCESS_SECRET` | backend (`auth.module.ts:20`, `jwt.strategy.ts:16`, `realtime.controller.ts:66`) | **Required** | HMAC key for access tokens (15 m) | 48+ random bytes, base64url | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | backend (`auth.service.ts:72,242`) | **Required** | **Independent** HMAC key for refresh tokens (7 d) | *different* value from the access secret | `openssl rand -base64 48` |
| `ATTENDANCE_QR_SECRET` | backend (`qr-token.service.ts:31`) | Recommended (falls back to access secret) | Signs 20-second attendance QR codes | independent random value | `openssl rand -base64 48` |
| `ATTENDANCE_QR_TTL` | backend (`qr-token.service.ts`, effective TTL const is 20 s) | Optional (default in code) | QR lifetime | `20s` | — |
| `ATTENDANCE_SCAN_RATE_LIMIT` | backend (`attendance.service.ts:35`) | Optional (default `12`) | Max scans per window per kiosk | `12` | — |
| `ATTENDANCE_SCAN_RATE_WINDOW_MS` | backend (`attendance.service.ts:39`) | Optional (default `60000`) | Rate-limit window | `60000` | — |
| `JWT_ACCESS_EXPIRATION` | backend (`auth.module.ts:22`) | Optional (default `15m`) | Access token lifetime | `15m` | — |
| `JWT_REFRESH_EXPIRATION` | backend (`auth.service.ts:243`) | Optional (default `7d`) | Refresh token lifetime | `7d` | — |
| `PORT` | backend (`main.ts:49`) | Optional (default `3001`) | API listen port (internal only) | `3001` | — |
| `NODE_ENV` | backend (`main.ts:38` — gates Swagger) | **Required in prod** | Disables Swagger, enables prod behavior | `production` | — |
| `CORS_ORIGINS` | backend (`main.ts:23`) | Recommended | Comma-separated allowed origins | `https://pos.example.com` | — |
| `FRONTEND_URL` | **nobody** (grep: no references) | Unused | — | *remove it* (finding M-12) | — |
| *(deploy-time only)* `DOMAIN`, `ACME_EMAIL` | Caddy | **Required** | TLS hostname + Let's Encrypt registration | `pos.example.com` | from your DNS registrar |
| *(deploy-time only)* `ADMIN_PASSWORD` | create-admin script (§6.11) | One-time | Initial admin password, printed once | random, ≥16 chars | `openssl rand -base64 18` |

> Never commit `backend/.env`. It is currently covered by `backend/.gitignore:3`, but the repo also needs a **root** `.gitignore` (BLK-1) once files land at the root.

---

## 6. VPS Deployment Runbook

Target: fresh Ubuntu 24.04 KVM 1 (1 vCPU, 4 GB RAM, 50 GB NVMe), single site, Docker Compose = Postgres + API + Caddy.

> **Before you start:** complete Phase A in §10 (commit the repo, fix BLK-2/BLK-3, create the Docker files in §6.6–6.8).

### 6.1 Initial server hardening (as root, then switch to your user)

```bash
adduser deploy && usermod -aG sudo deploy
# from your laptop: ssh-copy-id deploy@SERVER_IP   (then disable password auth)
su - deploy
sudo apt update && sudo apt -y upgrade

sudo tee -a /etc/ssh/sshd_config >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
EOF
sudo systemctl restart ssh

sudo apt -y install ufw fail2ban unattended-upgrades
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

sudo dpkg-reconfigure -f noninteractive unattended-upgrades   # auto security updates
sudo systemctl enable --now fail2ban
```

### 6.2 Swap (mandatory — the build will OOM without it)

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=20' | sudo tee /etc/sysctl.d/99-swap.conf && sudo sysctl --system
free -h   # must show 4Gi swap
```

### 6.3 Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy && newgrp docker
docker run --rm hello-world
```

### 6.4 DNS

Create in your registrar: `A` record `pos.example.com → SERVER_IP` (and `@ → same` if you want the apex). Wait for propagation (`dig +short pos.example.com`). Caddy will fetch Let's Encrypt certificates automatically on first boot — ports 80/443 must be reachable (handled by UFW above).

### 6.5 Clone the repository

```bash
mkdir -p ~/src && cd ~/src
git clone <YOUR_PRIVATE_GIT_REMOTE> pallet && cd pallet
```
> ⚠️ As of this review the repository has **no commits and no remote** (BLK-1). Do this first: create a root `.gitignore`, `git add -A && git commit`, push to a private GitHub/GitLab repo, then clone here.

### 6.6 Build context files to create in the repo

**`backend/Dockerfile`**
```dockerfile
# ---- build stage ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=1          # M-3: puppeteer is unused; skip Chromium
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate                 # native argon2/prisma binaries built for linux/amd64
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime stage ----
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PUPPETEER_SKIP_DOWNLOAD=1
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev \
 && npm i -g prisma@5.22.0 \            # CLI is a devDependency — install it explicitly,
 && prisma generate                      # otherwise `migrate deploy` is unavailable at runtime
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
EXPOSE 3001
CMD ["node", "dist/main"]
```
> Why the extra `prisma generate` in the runtime stage: `prisma` lives in `devDependencies` (`backend/package.json:54`), so `npm ci --omit=dev` removes it, and `@prisma/client` will not self-generate without a CLI. Copying `prisma/` (schema + migrations) in and running `generate` explicitly is the reliable pattern.

**`frontend/Dockerfile`**
```dockerfile
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build                        # tsc -b && vite build → /app/dist

FROM: caddy:2.8-alpine
COPY --from=build /app/dist /srv
```

**`.dockerignore`** (root, plus one in `backend/`):
```
node_modules
dist
.git
.env
uploads
*.md
.planning
```

**`docker-compose.yml`**
```yaml
name: pallet
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: pallet
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: pallet
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pallet -d pallet"]
      interval: 5s
      timeout: 3s
      retries: 20
    shm_size: 128mb                      # 1 vCPU: keep the shared buffer small

  api:
    build: ./backend
    restart: unless-stopped
    env_file: ./backend/.env             # see §6.7 — DATABASE_URL host must be `db`
    depends_on:
      db: { condition: service_healthy }
    volumes:
      - uploads:/app/uploads             # M-11: logos must survive redeploys
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 20s
    # no host ports: only Caddy talks to it

  caddy:
    image: caddy:2.8-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    environment:
      DOMAIN: ${DOMAIN}
      ACME_EMAIL: ${ACME_EMAIL}
    volumes:
      - ./frontend:/srv:ro               # or use the frontend image above
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      api: { condition: service_healthy }

volumes:
  pgdata:
  uploads:
  caddy_data:
  caddy_config:
```

**`Caddyfile`** (tailored to *this* codebase: global prefix `/api`, SSE, hashed assets, SPA fallback)
```
{
	email {$ACME_EMAIL}
}

{$DOMAIN} {
	encode gzip

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "no-referrer"
		Permissions-Policy "camera=(self)"      # kiosk QR scanner
		-Server
	}

	# API — flush_interval -1 is REQUIRED: without it Caddy buffers the
	# SSE stream (GET /api/realtime/events) and clients receive nothing
	# until the buffer fills, which looks like "realtime is broken".
	handle /api/* {
		reverse_proxy api:3001 {
			flush_interval -1
		}
	}

	# uploaded logo (public by design — see M-11)
	handle /uploads/* {
		reverse_proxy api:3001
	}

	# SPA
	handle {
		root * /srv
		try_files {path} /index.html
		file_server
	}

	header /assets/* Cache-Control "public, max-age=31536000, immutable"
	header /index.html Cache-Control "no-cache"
}
```

### 6.7 Production `.env` (`backend/.env` on the server — never committed)

```bash
cd ~/src/pallet && mkdir -p backend
cat > backend/.env <<EOF
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://pallet:$(openssl rand -base64 24 | tr -d '=+/' | cut -c1-24)@db:5432/pallet?schema=public
JWT_ACCESS_SECRET=$(openssl rand -base64 48)
JWT_REFRESH_SECRET=$(openssl rand -base64 48)
ATTENDANCE_QR_SECRET=$(openssl rand -base64 48)
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d
ATTENDANCE_QR_TTL=20s
ATTENDANCE_SCAN_RATE_LIMIT=12
ATTENDANCE_SCAN_RATE_WINDOW_MS=60000
CORS_ORIGINS=https://pos.example.com
EOF
chmod 600 backend/.env
```
The `DB_PASSWORD` used by `docker-compose.yml` must match the one embedded above — simplest is to put `DB_PASSWORD=<same value>` in a root `.env` next to `docker-compose.yml` (compose reads `.env` automatically for `${…}` substitution).

> Do this **after** implementing H-4 (startup validation): booting once without these values must fail fast, not half-work.

### 6.8 First deploy

```bash
cd ~/src/pallet
docker compose build --memory=3g            # cap the build so it uses swap instead of the OOM killer
docker compose up -d db
docker compose run --rm api prisma migrate deploy     # explicit, never automatic on boot
docker compose up -d                            # api + caddy
docker compose ps                              # api must become "healthy"
curl -fsS https://pos.example.com/api/health
curl -fsS https://pos.example.com/            # SPA index
```

**Running migrations safely (all future releases):**
```bash
docker compose run --rm api prisma migrate deploy
```
Rules: never `prisma migrate dev` on the server (it is for development and can generate/drop migrations); always take a `pg_dump` first if the migration is destructive; migrations in this repo are additive + constraint migrations and were verified to apply cleanly to an empty database (18/18).

### 6.9 Create the first admin user (no weak defaults)

Save as `scripts/create-admin.ts` and run it **once** (never `prisma:seed` on production — BLK-3):
```ts
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

const prisma = new PrismaClient();
async function main() {
  if (process.env.NODE_ENV !== 'production' && !process.argv.includes('--allow-dev'))
    throw new Error('set NODE_ENV=production or pass --allow-dev');
  const username = process.argv[2] ?? 'admin';
  const password = process.env.ADMIN_PASSWORD ?? crypto.randomBytes(18).toString('base64url');
  const hash = await argon2.hash(password);
  const emp = await prisma.employee.upsert({
    where: { username },
    update: { passwordHash: hash, isActive: true, role: Role.ADMIN },
    create: { name: 'Owner', username, passwordHash: hash, role: Role.ADMIN, isActive: true },
  });
  console.log(`ADMIN READY id=${emp.id} username=${username}`);
  console.log(password.length >= 16 ? 'password printed above (store in your password manager, then delete this output)' : 'WEAK PASSWORD');
}
main().finally(() => prisma.$disconnect());
```
```bash
ADMIN_PASSWORD=$(openssl rand -base64 18) docker compose run --rm -e ADMIN_PASSWORD api \
  node -e "require('ts-node/register');require('./scripts/create-admin.ts')"
# or: precompile it, or run with npx ts-node in the build stage
```
Then verify: log in once, change the password via **Settings → Change password** (`POST /api/auth/change-password` requires the current password — `auth.controller.ts:45`), and confirm the old token no longer works after logout (refresh revocation — `auth.service.ts:131-137`).

### 6.10 What must never run in production

| Command | Why |
|---|---|
| `npm run prisma:seed` | deletes every business table, creates well-known accounts (BLK-3) |
| `npm run test:e2e` | truncates 27 tables of the DB in `DATABASE_URL` (BLK-2) |
| `prisma migrate dev` | development command; can alter/drop migrations |
| `npm run lint` (backend) | currently fails anyway (H-7) |

### 6.11 Update procedure (future releases)

```bash
cd ~/src/pallet && git pull
pg_dump -Fc -d pallet -f /backups/pre-$(date +%F).dump   # §7
docker compose build api            # frontend image only if UI changed
docker compose run --rm api prisma migrate deploy
docker compose up -d api caddy
docker compose ps                   # wait for "healthy"
curl -fsS https://pos.example.com/api/health
```

### 6.12 Rollback

```bash
# code only (no migration):
git checkout <previous-tag> && docker compose build api && docker compose up -d api

# with a bad migration (restore schema+data):
docker compose stop api
pg_restore --clean --if-exists -d pallet /backups/pre-<date>.dump
git checkout <previous-tag> && docker compose build api && docker compose up -d api
```
Keep the pre-deploy dump from every release for at least 2 weeks — it is your only rollback path for schema changes.

### 6.13 Minimal CI (GitHub Actions sketch)

```yaml
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16-alpine, env: { POSTGRES_PASSWORD: test }, ports: ['5432:5432'] }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4 with: { node-version: 24, cache: npm }
      - run: npm ci                      # backend
      - run: npm run lint                # after H-7
      - run: npm run build
      - run: npm test
      - run: npx prisma migrate deploy   # against the CI database ONLY (BLK-2 guard)
      - run: npm run test:e2e
      - run: npm audit --omit=dev --audit-level=high   # fail on highs (H-11)
      - run: cd ../frontend && npm ci && npm run lint && npm run build
```

---

## 7. Backup and Recovery Plan

Nothing exists today (no scripts, no cron). Add on the VPS:

**`/usr/local/bin/pallet-backup.sh`**
```bash
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR=/backups/pallet
RETENTION_DAYS=14
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%F-%H%M)
FILE="$BACKUP_DIR/pallet-$STAMP.dump"

docker compose -f /srv/pallet/docker-compose.yml exec -T db \
  pg_dump -U pallet -d pallet -Fc > "$FILE"

gzip -9 "$FILE" && FILE="$FILE.gz"
sha256sum "$FILE" > "$FILE.sha256"
find "$BACKUP_DIR" -name 'pallet-*.gz' -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name 'pallet-*.sha256' -mtime +$RETENTION_DAYS -delete

# off-server copy — pick ONE and fill in credentials:
# rclone:  rclone copy "$FILE" b2:my-bucket/pallet/ && rclone deletefile ... older files
# scp:     scp -i ~/.ssh/backup_key "$FILE" backup@other-host:/backups/
# rsync:   rsync -av --delete "$BACKUP_DIR/" backup@other-host:/backups/pallet/
```
```bash
sudo chmod 700 /usr/local/bin/pallet-backup.sh
sudo crontab -e
# 03:15 daily; second weekly full copy off-server
15 3 * * * /usr/local/bin/pallet-backup.sh >> /var/log/pallet-backup.log 2>&1
```

**Tested restore procedure (run it — an untested backup is not a backup):**
```bash
docker compose stop api
gunzip -c /backups/pallet/pallet-YYYY-MM-DD.dump.gz > /tmp/restore.dump
docker compose exec -T db dropdb -U pallet pallet_restore_test
docker compose exec -T db createdb -U pallet pallet_restore_test
docker compose exec -T db pg_restore -U pallet -d pallet_restore_test --no-owner < /tmp/restore.dump
# verify:
docker compose exec -T db psql -U pallet -d pallet_restore_test -c \
  'SELECT count(*) FROM "Invoice"; SELECT count(*) FROM "Employee";'
# when satisfied: stop api, dropdb pallet, createdb pallet, pg_restore into pallet, start api
```

**Monthly verification checklist:** (1) a backup from the last 7 days restores into `pallet_restore_test`; (2) row counts for `Invoice`, `Employee`, `StockLot` match production within tolerance; (3) `.sha256` matches; (4) the off-server copy actually contains this month's files (`rclone ls` / `ssh ls`); (5) disk usage of `/backups` within retention (`du -sh /backups`).

---

## 8. Post-Deployment Verification

### Smoke-test checklist (run in order, right after first deploy)

1. **HTTPS** — `curl -I https://pos.example.com` → `200`, certificate valid (`curl -svI … 2>&1 | grep -i begin`), HTTP→HTTPS redirect works, `Server:` header absent (Caddy `header -Server`).
2. **Health** — `curl -fsS https://pos.example.com/api/health` → 200 with `db: "up"` (after H-6).
3. **SPA deep link** — open `https://pos.example.com/admin/invoices` directly (hard refresh) → page renders, not a 404 and not a blank screen (`try_files … /index.html`).
4. **Login** — sign in with the freshly created admin → dashboard loads; `localStorage` has `accessToken`/`refreshToken`/`user`; sidebar shows the **admin** menu only.
5. **Token refresh** — DevTools → set `accessToken` to garbage → trigger any API call → observe one `POST /api/auth/refresh`, the request retried with the new token, **no redirect to /login**.
6. **Refresh revocation** — log out, then replay the old refresh token via `POST /api/auth/refresh` → `401`.
7. **Role permissions** (create 1 user per role first):
   - SALES → cannot open `/admin/employees` (UI redirect) and `GET /api/employees` → `403`.
   - ACCOUNTANT → `POST /api/invoices` → `403`; `PATCH /api/invoices/:id/confirm` → `200`.
   - INVENTORY → `GET /api/reports/revenue` → `403`; `PATCH /api/invoices/:id/deliver` → `200`.
   - Kiosk account → only `/api/attendance/kiosk/*` and `/api/attendance/scan` allowed; `GET /api/workplaces` → `403` (RolesGuard kiosk rule, `roles.guard.ts:17-27`).
   - Direct API calls with forged IDs (IDOR): SALES `GET /api/invoices/<someone-else>` → `403` (covered by `authorization-matrix.e2e-spec.ts` — re-run it once BLK-2 is fixed).
8. **Order flow end-to-end with SSE** — two browsers (admin + sales), DevTools → EventSource/fetch stream open on `/api/realtime/events`:
   - sales creates an invoice → admin's invoice list updates **without reload**;
   - accountant confirms → sales sees the status change;
   - inventory scans/delivers → admin + accountant see it; **and a SALES session must NOT receive `stock.receipt.*` / `invoice.created` events** (this is the H-1 regression test).
9. **SSE reconnect** — `docker compose restart api`; within ~10 s the client must reconnect automatically (H-2) and the next event must arrive. Also verify heartbeats (`: heartbeat`) keep the connection alive through Caddy (no buffering — if events only arrive in bursts, `flush_interval -1` is missing).
10. **Brute-force** (after H-3) — 11 wrong passwords in a minute → `429`.
11. **Swagger off** — `https://pos.example.com/api/docs` → `404` (`NODE_ENV=production`).
12. **Uploads persist** — upload a logo, `docker compose up -d --force-recreate api`, reload → logo still present (named volume, M-11).
13. **RTL/i18n** — switch to Arabic → layout mirrors, no English leaking in the sidebar; switch back.
14. **Restart survival** — `docker compose restart` → all containers return to `healthy` without manual intervention.

### Monitoring

- **Uptime:** point UptimeRobot / Uptime Kuma (self-hosted on the same box is fine — ~50 MB) at `GET /api/health`, 1-minute interval, alert on 2 consecutive failures.
- **Logs:** `docker compose logs --since 1h api | tail -200`, `docker compose logs -f api caddy`, errors only: `docker compose logs api 2>&1 | grep -iE 'error|exception'`.
- **Disk:** `df -h /` — alert under 15%; watch `/var/lib/docker` and `/backups`.
- **RAM/swap:** `free -h` (alert if swap use > 50%), `docker stats --no-stream`.
- **DB growth:** `docker compose exec db psql -U pallet -d pallet -c "SELECT pg_size_pretty(pg_database_size('pallet'));"` weekly.
- **Log rotation:** add `"log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" }` under each service in compose — otherwise logs fill a 50 GB disk.

---

## 9. Capacity and Scaling Notes

**What this box can realistically handle.** Steady-state footprint on 4 GB: Postgres ~250–500 MB (small data), Node API ~200–400 MB (Prisma engine + V8), Caddy ~30–60 MB, Ubuntu ~400–700 MB → roughly 1.5 GB used, leaving comfortable headroom. SSE itself is cheap: each connection is one socket + one 20 s heartbeat interval. For a single retail business (5–15 staff, a few hundred invoices/day, <20 concurrent SSE connections) this VPS is **more than adequate** — the 1 vCPU is the real constraint, not RAM.

**Build is the dangerous part.** `npm ci` (especially with the unused `puppeteer`/Chromium — M-3) + `tsc` + `vite build` can exceed 2–3 GB peak. With 4 GB RAM and no swap the OOM killer will terminate the build. Mitigations in order of preference: (1) build in CI and push images (best), (2) build on the VPS with the 4 GB swap from §6.2 and `--memory` cap, (3) build on your laptop and `docker save | ssh docker load`.

**Signals it is time to upgrade:**
- `free -h` shows swap in use for more than a few minutes a day, or `docker stats` shows the API at >700 MB sustained;
- `uptime` load average ≥ 1.0 sustained on 1 vCPU (i.e. the CPU is saturated) — reports and Excel exports are the heavy hitters (they aggregate invoice items in memory, ISS-035);
- SSE connection count in the hundreds;
- Postgres data or WAL pushing disk over 70%;
- p95 API latency climbing while load stays flat (CPU-bound).

**Before running more than one API instance, three things must change:**
1. **SSE event fan-out** — `realtime.service.ts` keeps a `Set<Subscriber>` **in process** (`:15-27`); an event published by instance A never reaches a client connected to instance B. You need a shared bus (Redis pub/sub is the pragmatic choice on this stack: publish in `RealtimeService.publish`, subscribe per instance) — *or* accept single-instance and document it as done today.
2. **In-memory rate limiter** — attendance scan buckets (`attendance.service.ts:51-68`) and any future login limiter must move to Redis/DB, otherwise limits are per-instance.
3. **Sticky sessions or statelessness audit** — refresh-token state is in Postgres (good), uploads must move to shared storage or object storage (today: a local `uploads/` volume), and Postgres pool sizing (`connection_limit` in `DATABASE_URL`) must be divided across instances. Note the current default: with **no `connection_limit` set** (verified in `backend/.env`), Prisma uses `num_cpus*2+1` = **3 connections on this 1 vCPU box** — fine today; set it explicitly (e.g. 10) once you add read replicas or more instances.

---

## 10. Prioritized Action Plan

### Phase A — Blockers (must finish before any launch) ≈ 3–5 days

| # | Item | Findings | Effort |
|---|---|---|---|
| A1 | Root `.gitignore`, initial commit, private remote | BLK-1 | S |
| A2 | Create `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, `Caddyfile`, `.dockerignore` (§6.6) | BLK-1 | M |
| A3 | Guard e2e against non-test DBs + dedicated `TEST_DATABASE_URL` | BLK-2 | S |
| A4 | Guard seed (`NODE_ENV` + `--force` + random password) | BLK-3 | S |
| A5 | Startup env validation; delete the `''` secret fallback | H-4 | S |
| A6 | `app.enableShutdownHooks()` + `GET /api/health` | H-5, H-6 | S |
| A7 | Fix SSE filter logic + SSE client reconnect-on-EOF + regression tests | H-1, H-2 | S |
| A8 | Rate limit `/api/auth/login` (and `/auth/refresh`) | H-3 | M |
| A9 | Server hardening + swap + Docker + first deploy (§6.1–6.8) + backup script (§7) | runbook | M |

### Phase B — High priority (before or immediately at launch) ≈ 3–4 days

| # | Item | Findings | Effort |
|---|---|---|---|
| B1 | Fix revenue/discount math + timezone-aware report ranges + tests | H-9, H-10 | M |
| B2 | Remove frontend `role: "ADMIN"` fallback | H-8 | S |
| B3 | Working backend ESLint + minimal CI (build/lint/test/audit) | H-7, H-12 | M |
| B4 | `npm audit fix`; move `@nestjs/swagger` out of prod deps; plan Nest 11 upgrade | H-11 | M |
| B5 | Remove `puppeteer`/`handlebars`; set `PUPPETEER_SKIP_DOWNLOAD` regardless | M-3 | S |
| B6 | Cap `limit` ≤100; CSP/security headers via Caddy; confirm `/uploads` policy | M-1, M-10, M-11 | S |
| B7 | Re-triage the stale known-issues log; add update step to your workflow | M-6 | S |
| B8 | First smoke-test run (§8) incl. SSE reconnect and role matrix | — | S |

### Phase C — Post-launch improvements ≈ 1–2 weeks, spread out

| # | Item | Findings | Effort |
|---|---|---|---|
| C1 | Route-level code splitting; target < 300 kB initial JS | M-4 | M |
| C2 | React error boundary + global error UI | M-5 | S |
| C3 | Refresh token in `httpOnly` cookie (or documented XSS acceptance + CSP) | M-2 | M |
| C4 | Integer/Decimal money math; clamp stored discounts | M-7 | M |
| C5 | Structured request logging; Sentry (or GlitchTip self-hosted) for frontend+backend | L-1, — | M |
| C6 | Frontend Vitest smoke suite; e2e for change-requests/delivery | H-12 | M |
| C7 | Self-host fonts; README/`engines`; cleanup `.gitignore` oddities | L-2, L-3, L-4, L-5 | S |
| C8 | SSE connection cap; attendance limiter persistence if a 2nd instance is ever planned | M-8, M-9 | S |

---

## 11. Open Questions

1. **Project identity mismatch.** The review brief describes *"a restaurant ordering platform with a public menu, kitchen and waiter screens"*; the repository is **Pallet**, a serialized-inventory POS/invoicing system (public surface = login + brand info, staff surfaces = sales/inventory/accountant/kiosk). I reviewed what is actually in the repo. Is this the right repository, or is a restaurant module expected to be added before launch?
2. **Domain name** (needed for `DOMAIN`/`ACME_EMAIL` in §6.7) and whether the apex should also serve the app.
3. **Git remote**: no remote exists. GitHub private repo, GitLab, or a bare repo on a second host?
4. **Expected traffic / scale**: number of concurrent staff, number of outlets, invoices per day? This decides whether KVM 1 stays sufficient (§9) and whether SSE needs the shared bus now.
5. **Backup destination**: which off-server target do you have — Backblaze B2, Hetzner Storage Box, another VPS, or S3-compatible? (Determines the `rclone`/`rsync` line in §7.)
6. **Who runs migrations on release** — you by hand (recommended now) or CI/CD? If CI/CD, BLK-2's guard becomes mandatory.
7. **Payment/integrations**: any card terminal, payment gateway, e-invoice/ETA (Egyptian tax authority) integration, or email/SMS provider expected? None exists in the codebase today.
8. **`FRONTEND_URL` intent** (M-12): was it meant for CORS, PDF/email links, or is it vestigial?
9. **Kiosk hardware**: are kiosk devices on the same LAN behind the public URL? The QR/attendance flow assumes reachable HTTPS from the kiosk browser.
10. **Password policy**: employee creation allows 6-character passwords (`create-employee.dto.ts:23`) while reset requires 8 (`reset-password.dto.ts:8`). Desired minimum (recommend 12+)?
11. **Not verified:** actual behavior of Prisma `Decimal` → JSON serialization to the frontend (whether totals arrive as strings or numbers) — needs one live API call to confirm; no functional impact on launch.
12. **Not run:** backend e2e suite (destructive — BLK-2) and `npm run lint` for backend (broken — H-7). Both must be made runnable and green in CI before Phase B is complete.
