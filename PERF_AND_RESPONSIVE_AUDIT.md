# Pallet Frontend — Performance & Responsive Audit

> Audit date: 2026-09-23  
> Scope: `frontend/src` (React 19 + Vite + Tailwind v4 + React Query installed but underused)  
> Companion doc: `PROJECT_REFERENCE.md` §8 Known Issues Log (business bugs) — this file covers **performance / network waste** and **responsive / UI-UX**.

---

## Part 1 — Unnecessary Requests & Bot-Neck (Network Waste)

### Executive summary

| Metric | Value |
|---|---|
| Total `api.*` call sites | ~110+ across ~40 files |
| Search inputs that fire **per keystroke** (no debounce) | **9+ pages** |
| Polling intervals | TopBar 30s; Kiosk QR; Attendance clock (local) |
| Pages with `AbortController` / request cancellation | **2 of ~40** (`RevenueReportPage`, `CustomerReportPage`) |
| Pages with debounce on search | **0** (only Revenue/Customer abort on change) |
| React Query adoption | Configured in `main.tsx` (`staleTime: 30s`) but used only in `useReportDetails.ts` — **every other page is raw `useEffect` + axios** |
| Double-fetch on filter change (page-reset-in-effect) | **7 report pages** + customer report |
| Hidden-tab / visibility guards on polls | **None** |

The single biggest wins: **(1) debounce all search inputs**, **(2) stop `setPage(1)` in effects causing double fetches**, **(3) adopt React Query consistently** (already installed) or at least add `AbortController` + skip-when-hidden polling.

---

### P0 — Per-keystroke fetches (no debounce) — High

Every character typed fires a full HTTP round-trip. On mobile networks this causes request storms, result flicker, and wasted backend CPU. Pattern is identical: `search` state → in `useCallback` deps → `useEffect(() => fetch(), [fetch])`.

| # | File:line | Input → Endpoint | Fix |
|---|---|---|---|
| 1 | `pages/sales/InvoiceSearch.tsx:20-56` | `query` → `GET /invoices` **and** `handleSearch` also calls `fetchInvoices()` after `setPage(1)` → **double-fetch on submit** | Debounce 300ms; submit only sets page/filters, let effect fetch once |
| 2 | `pages/sales/Customers.tsx:24-55,175` | `search` → `GET /customers` | Debounce 300ms (`useDeferredValue` or custom hook) |
| 3 | `pages/admin/Customers.tsx:39,185` | `search` → `GET /customers` | same |
| 4 | `pages/admin/Suppliers.tsx:32-54,150` | `search` → `GET /suppliers` | same |
| 5 | `pages/admin/Invoices.tsx:36,68` | `search` → `GET /invoices` | same |
| 6 | `pages/admin/Employees.tsx:35-67,221` | `search` → `GET /employees` | same |
| 7 | `pages/admin/Attendance.tsx:47` (filter state) | employee filter → `GET /attendance` | same |
| 8 | `features/reports/pages/InventoryReportPage.tsx:26,49-61` | `search` → `GET /reports/inventory` | same |
| 9 | `features/reports/pages/EmployeeSalesReportPage.tsx:74,84` | `employeeFilter` → `GET /reports/employees-sales` | same |
| 10 | `features/reports/pages/SupplierReportPage.tsx:114` | `supplierFilter` → `GET /reports/suppliers` | same |
| 11 | `features/reports/pages/ProductSalesReportPage.tsx:110,117` | category/model filters | same |
| 12 | `pages/admin/AuditHistory.tsx:213,221` | `employeeFilter`/`actionFilter` → `GET /audit/system` | same |

**Shared fix:** create `useDebouncedValue(value, 300)` or put debounce in `useCallback` deps; prefer React Query `useQuery({ queryKey, enabled })` with debounced key.

---

### P0 — Double-fetch: `setPage(1)` inside `useEffect` — High

Pattern: filter/date change → effect A fetches with **old `page`** → effect B `setPage(1)` → deps change → effect A fetches **again**. Two full API calls + loading flash every filter change.

| File:line | Evidence |
|---|---|
| `InventoryReportPage.tsx:60-61` | `useEffect(fetch)` + `useEffect(() => setPage(1), [categoryFilter, search])` |
| `ExpensesReportPage.tsx:56-58` | same |
| `EmployeeSalesReportPage.tsx:73-75` | same |
| `ProductSalesReportPage.tsx:99-101` | same |
| `ReturnsReportPage.tsx:56-58` | same |
| `SupplierReportPage.tsx:71` | same (dates) |
| `CustomerReportPage.tsx:206,214` | `setPage(1)` in effect paths |
| `sales/InvoiceSearch.tsx:52-56` | `handleSearch` calls `setPage(1)` **and** `fetchInvoices()` while effect also fetches |

**Fix:** reset page **synchronously in the onChange handler** (as list pages already do correctly: `Suppliers.tsx:150`, `sales/Customers.tsx:175`, `Invoices.tsx:68`) — never in a separate effect. Or derive `page` reset when queryKey changes in React Query.

---

### P1 — Polling without guards — Medium

| # | File:line | Interval | Problem | Fix |
|---|---|---|---|---|
| 1 | `components/TopBar.tsx:23-43` | **30s** `GET /notifications/unread-count` | Runs even when tab is hidden/minimized; no backoff; raw `setInterval`; no abort on unmount race (`setState` after unmount possible) | Guard with `document.visibilityState`; clear interval properly (already does); consider React Query `refetchIntervalInBackground: false` |
| 2 | `pages/kiosk/KioskPage.tsx:28,59,87` | QR refresh interval | Polls kiosk/me + QR; verify cleanup on unmount (line 87 `setInterval`) | Ensure `clearInterval` in effect return; pause when hidden |
| 3 | `pages/sales/Attendance.tsx:22,54` | 1s local clock | OK (local `Date`, not network) | Keep; not a network cost |

No `document.hidden` / `visibilitychange` usage anywhere in `frontend/src`.

---

### P1 — Mount fetches without `AbortController` — Medium

Unmount or rapid filter change can apply **stale responses** (out-of-order) and wasted traffic. Only 2 files abort correctly.

| File:line | Fetches | Missing |
|---|---|---|
| `lib/settings.tsx:71` | `GET /settings` | abort / cache (React Query would fix globally) |
| `pages/admin/Settings.tsx:40` | `GET /settings` | same — **duplicate of settings context fetch** |
| `pages/admin/StockPricing.tsx:28` | pending-pricing queue | abort |
| `pages/inventory/StockAdjustments.tsx:44,56` | adjustments + models (parallel, no cleanup) | abort |
| `pages/inventory/CategoriesModels.tsx:62,75` | categories + models | abort |
| `pages/inventory/InvoiceDelivery.tsx:44,57-58` | queue + detail parallel | abort |
| `pages/sales/InvoiceDetail.tsx:31-33` | invoice + audit | abort |
| `pages/admin/InvoiceDetail.tsx:55,73` | invoice + audit | abort |
| `pages/sales/Home.tsx:28-31` | **4 parallel** dashboard calls | cache; could be 1 aggregate endpoint |
| `pages/inventory/Home.tsx:126-130` | **3 parallel** | same |
| `pages/admin/Dashboard.tsx:49-50` | 2 parallel | same |
| `pages/inventory/ReceiveShipment.tsx:95-96,110` | categories + suppliers + models on category change | abort; cache categories/suppliers |
| `pages/admin/AuditHistory.tsx:107,132` | employees + audit | abort |
| Most list pages | `useEffect(fetch)` | no signal |

**Good references:** `RevenueReportPage.tsx:98,150`, `CustomerReportPage.tsx:167` — `AbortController` + pass `signal`.

---

### P2 — Duplicate / over-fetch patterns — Medium

| # | Problem | Evidence | Fix |
|---|---|---|---|
| 1 | **Settings fetched twice** — `SettingsProvider` loads `/settings` AND `Settings.tsx` loads it again on mount | `settings.tsx:71` + `admin/Settings.tsx:40` | Read from context; only re-fetch after save |
| 2 | **Home dashboards fire 3-4 parallel GETs** every visit | `sales/Home.tsx:28-31`, `inventory/Home.tsx:126-130`, `admin/Dashboard.tsx:49-50` | Backend aggregate `GET /dashboard/summary` or React Query shared cache |
| 3 | **Customers list limit=1000** on NewInvoice mount | `NewInvoice.tsx:69` | Search-as-you-type combobox with debounced `/customers?search=` |
| 4 | **Stock page loads `limit: 1000`** then filters client-side | `Stock.tsx:77-78` | Server-side filter/pagination (filters at 248-278 only slice client-side after full load) |
| 5 | **AuditHistory loads 200 employees** for a dropdown | `AuditHistory.tsx:107` | Debounced search endpoint or cache once per session |
| 6 | **Categories re-fetched** on ReceiveShipment, Stock, CategoriesModels, InventoryReport separately | multiple | Global React Query cache `['categories']` |
| 7 | **Invoice detail fetches invoice twice** in sales vs admin routes | `sales/InvoiceDetail.tsx:31` vs `admin/InvoiceDetail.tsx:55` | Shared query key by invoice id |
| 8 | React Query installed + configured but **~95% of calls bypass it** | `main.tsx:10-18` vs only `useReportDetails.ts` | Migrate list pages to `useQuery` for free dedupe/staleTime/retry |

---

### P2 — Other network/efficiency notes — Low/Medium

| # | File:line | Issue | Fix |
|---|---|---|---|
| 1 | `api.ts:55-112` | 401 refresh single-flight is good; no request de-dup for identical GETs | Optional: query-key layer via React Query |
| 2 | `main.tsx:14` | `refetchOnWindowFocus: false` globally — avoids focus storms (good) but also means no smart refresh | Keep false; use explicit invalidation on mutations |
| 3 | Report pages without abort can show **stale overwrite** when user changes date quickly | all report pages except Revenue/Customer | Add `AbortController` pattern from RevenueReportPage |
| 4 | `ExcelExportButton` / large JSON exports | full dataset in memory | stream/server-side export later |
| 5 | No `Cache-Control` / ETag handling client-side | axios defaults | optional |

---

### Part 1 — Recommended fix order (requests)

1. **Shared `useDebouncedValue(300)`** → apply to all 12+ search/filter inputs (biggest win, one hook).
2. **Remove all `setPage(1)` from effects** → reset in onChange (7 report pages + InvoiceSearch double-fetch).
3. **Add `AbortController`** to every list fetch (copy RevenueReportPage pattern) or migrate lists to React Query.
4. **TopBar unread poll:** skip when `document.visibilityState !== 'visible'`.
5. **Dedupe settings / categories / dashboard** via React Query cache or shared context.
6. **Replace `limit: 1000` dumps** (NewInvoice customers, Stock inventory-count) with server-side search/pagination.

---

## Part 2 — Responsive & UI/UX (Goal: 100% responsive, perfect UI/UX)

### Executive summary

| Metric | Value |
|---|---|
| Screen `@media` queries in entire app | **~1 real screen query** (`admin/InvoiceDetail.tsx:767 max-width:720px`); rest are print |
| Tailwind responsive prefixes (`sm:`/`md:`/`lg:`) | Almost only `TopBar` + `Sidebar` (+ Button size keys) |
| Fixed `gridTemplateColumns: "1fr 1fr"` (no collapse) | **10+ sites** |
| Page-level `padding: "32px"` stacked on `main p-6` | **16+ pages** → 56px gutters on phones |
| RTL strategy | 6 hand-picked CSS class overrides in `index.css` — physical properties leak everywhere |
| Fonts | CSS references Manrope/Sora/Noto Sans Arabic; TopBar hardcodes Cairo/Inter; **no font files loaded in `index.html`** |
| Shell on mobile | `sidebarOpen` defaults `true` + physical `ml-64` → content ~119px on 375px viewport |

**Bottom line:** the app is a **desktop-first inline-style layout** with a thin Tailwind shell. It is not mobile-ready. “100% responsive” requires a deliberate pass: shell → critical pages → RTL → typography → touch/a11y → polish.

---

### P0 — Shell (breaks mobile immediately) — Critical

| # | File:line | Problem | Fix |
|---|---|---|---|
| 1 | `Layout.tsx:46,59` | `sidebarOpen` defaults **true**; content gets `ml-64` (256px) at all widths → unusable at 375px | `useState(() => window.innerWidth >= 1024)`; apply `lg:ml-64` / `ms-64` only ≥1024px; below that drawer overlays |
| 2 | `Sidebar.tsx:119-155` | `NavLink` has **no `onClick={onClose}`** → navigating leaves drawer open over new page | Close on navigate (`onClick` or `useEffect` on `location.pathname`) |
| 3 | `Sidebar.tsx:76-84` | No body scroll-lock while drawer open (Modal has it) | Lock `document.body.overflow` when open && mobile |
| 4 | `index.css:60-68` + `Layout.tsx:59` | Physical `ml-64`/`ml-0` + RTL flip hacks | Use logical `ms-64` / CSS `margin-inline-start`; delete override table |
| 5 | `Sidebar.tsx:86-90` | `borderRight` physical → wrong edge in RTL | `borderInlineEnd` |
| 6 | `TopBar.tsx:250-305` | Logout icon-only on `<sm`, **no `aria-label`/`title`** | `aria-label={t.signOut}` + `title` |
| 7 | `TopBar.tsx:192` | Badge `-right-1` not covered by RTL overrides | logical end position or add override |
| 8 | `main.tsx:26` | `<Toaster position="top-right">` physical → wrong side in RTL | dir-aware position |

---

### P0 — Page layouts that overflow on phones — Critical/High

| # | File:line | Problem | Fix |
|---|---|---|---|
| 1 | `NewInvoice.tsx:250,692-695` | Flex row with **fixed `width: 400px`** preview panel → horizontal overflow at 375px | Stack columns below `lg`; preview collapsible; `min-width: 0` |
| 2 | `NewInvoice.tsx:598-599,767` | Line-item tables: only `overflowY`, **no `overflowX`**, fixed col widths | Wrap `overflowX: auto` + `minWidth` (pattern: `admin/InvoiceDetail.tsx:563-570`) |
| 3 | `InvoiceSearch.tsx:143` | Filters forced `1fr 1fr 1fr` | `repeat(auto-fit, minmax(160px, 1fr))` |
| 4 | Hardcoded `1fr 1fr` grids (never collapse): `PendingInvoices.tsx:194`, `InvoiceDelivery.tsx:252`, `sales/InvoiceDetail.tsx:201`, `NewInvoice.tsx:447,749`, `ChangeRequests.tsx:181`, `admin/Dashboard.tsx:128`, `Settings.tsx:150,223` | Cramped/clipped on narrow screens | `repeat(auto-fit, minmax(220px, 1fr))` — pattern already used correctly in `sales/Home.tsx:94,156` |
| 5 | 16 pages with root `padding: "32px"` on top of `Layout` `main p-6` | 56px gutters every viewport; wastes phone width | Remove page padding; own spacing in Layout: `p-4 sm:p-6` |
| 6 | Raw tables outside shared `Table` component | No scroll wrapper (shared `Table.tsx` already injects `.ui-table-wrapper { overflow-x:auto }`) | Always use `Table` or wrap manually |
| 7 | `QrDisplay.tsx:9,59-63` | Fixed 320px QR + page padding → borderline 375px | `width: min(320px, 100%); height: auto` |

---

### P1 — No responsive system (strategy gap) — Critical

| Gap | Evidence | Direction |
|---|---|---|
| Almost no breakpoints outside shell | `sm:`/`md:`/`lg:` only in TopBar/Sidebar/Button | Establish layout utilities or CSS layers; apply per page |
| Almost no screen media queries | 1 screen `@media` total | Add mobile breakpoints for critical pages first (NewInvoice, filters, Settings forms) |
| Inline styles everywhere | Pages are `style={{...}}` desktop layouts | Mix: keep design tokens as CSS vars; use Tailwind for responsive placement |
| Double spacing system | page `32px` + main `p-6` | Single source in Layout |

---

### P1 — RTL correctness (Arabic is first-class) — High

| # | File:line | Problem | Fix |
|---|---|---|---|
| 1 | `ui/Select.tsx:36-37` | `backgroundPosition: "right 12px"` + `paddingRight: 32px` physical | `inline-end` / `paddingInlineEnd` |
| 2 | `ui/Table.tsx:76-84,219-220` | Default `textAlign: "left"` inline overrides RTL CSS; sort arrows use physical margins | Default from `dir`; logical margins |
| 3 | `admin/InvoiceDetail.tsx:135` | Hardcoded `dir="rtl"` even in EN + nested `<main>` | Respect i18n dir; use `<div>` |
| 4 | `CategoriesModels.tsx:410-411` | Toggle knob `left: 22px/2px` | `insetInlineStart` |
| 5 | `index.css:56-87` | Only 6 class overrides — any new physical class breaks RTL | Rule: ban physical direction utilities; use logical properties |

---

### P1 — Typography — High

| # | Problem | Fix |
|---|---|---|
| 1 | `index.html` loads **no fonts**; CSS wants Manrope/Sora/Noto Sans Arabic/Tajawal; TopBar hardcodes Cairo/Inter → system fallback only | Load real fonts (Google or self-host); **one** stack in `index.css`; delete inline families in TopBar/ReportsLayout |
| 2 | `PageHeader` title fixed `30px` | `clamp(22px, 4vw, 30px)` |

---

### P2 — Touch targets & a11y — Medium

| # | File:line | Problem | Fix |
|---|---|---|---|
| 1 | `ui/Button.tsx:26` | `sm` minHeight 32px (row actions) | 36–40px min for touch |
| 2 | `Sidebar.tsx:167-188` | Language toggles ~26px tall | min-height 40px |
| 3 | `TopBar.tsx:250-305` | Unlabeled logout icon (also P0 above) | aria-label |
| 4 | `ui/Modal.tsx` | Escape + scroll-lock OK; **no focus trap/restore** | trap focus, return focus on close |
| 5 | `ui/Table.tsx:336-344` | Clickable `tr` with `tabIndex` but no Enter/Space handler | add `onKeyDown` |
| 6 | `Table.tsx` sticky headers | sticky `th` inside `overflow-x` wrapper without height cap → headers don't stick on page scroll | set wrapper max-height or drop sticky |

---

### P2 — Interaction / content UX — Medium/Low

| # | File:line | Problem | Fix |
|---|---|---|---|
| 1 | Part 1 search storms | Flicker + jank on mobile | Debounce (cross-listed) |
| 2 | Report `setPage(1)` effects | Loading flash on every filter | Fix with Part 1 |
| 3 | `ExcelExportButton.tsx:212`, `PrintButton.tsx:81` | Hardcoded EN strings (`"Export Excel"`, `"Preparing..."`) | i18n keys |
| 4 | `SupplierReportPage.tsx:215-216` | Hardcoded `"EGP "` vs `t.currency` | use `t.currency` |
| 5 | Two loading/empty systems | Pages use external spinner/empty; `Table` already has built-in `loading`/`emptyMessage` props unused | Standardize on Table props for table pages |
| 6 | Inconsistent page padding rhythm (60/64/80px) | visual jank | spacing token |
| 7 | Dead routes | `pages/admin/Reports.tsx` empty; `ReportsIndexPage` returns `null` | implement or remove |
| 8 | oxlint `set-state-in-effect` | widespread (DateRangePicker, reports, etc.) | derive state / key components |

---

### What already works (do not regress)

- `Table.tsx` injects horizontal scroll on shared tables.
- `admin/InvoiceDetail.tsx:563-570` + `@media (max-width:720px)` — best-in-app responsive table pattern.
- Several KPI grids already use `repeat(auto-fit, minmax(...))` (Home, Dashboard KPIs, NetProfit, Revenue, InventoryReport KPIs).
- Modal Escape + body scroll-lock.
- `EmptyState` / `LoadingSpinner` / `PageHeader` primitives exist.
- `viewport` meta present; i18n sets `dir`/`lang`.
- React Query + StrictMode configured (ready to lean on harder).

---

### Part 2 — Roadmap to “100% responsive + perfect UI/UX”

**Phase A — Shell (1 session)**  
Responsive sidebar default, close-on-navigate, scroll-lock, logical margins, Toaster RTL, logout aria-label, badge RTL.

**Phase B — Critical mobile paths (1–2 sessions)**  
NewInvoice stack + table scroll; all fixed `1fr 1fr` → `auto-fit minmax`; InvoiceSearch filters; remove double page padding; QrDisplay sizing.

**Phase C — RTL + fonts (1 session)**  
Select/Table/Toaster/badge/toggle logical properties; load real font stack; unify TopBar/Reports fonts.

**Phase D — Performance (pairs with Part 1)**  
Debounce searches; fix setPage effects; AbortController or React Query migration; TopBar visibility guard.

**Phase E — Polish & a11y**  
Touch targets 40px; focus trap; consistent empty/loading; i18n hardcoded strings; dead route cleanup; spacing tokens.

**Definition of done**  
- Usable at 375×667, 768×1024, 1280×800, 1440×900 in **AR + EN**  
- No horizontal page scroll (tables scroll inside wrappers only)  
- No search request per keystroke; no double-fetch on filter change  
- Shell behaves as drawer <1024px, fixed sidebar ≥1024px  
- Lighthouse mobile a11y ≥ 90 on main pages (or agreed threshold)

---

## Cross-reference

| Concern | Primary home |
|---|---|
| Business/data bugs (ISS-001…) | `PROJECT_REFERENCE.md` §8 |
| Request waste / bot-neck | **this file Part 1** |
| Responsive / UI-UX | **this file Part 2** |
| Stock pricing flow notes (pricing completeness, no re-price) | discussed in session; candidates to add to §8 if product wants fixes |
