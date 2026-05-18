@AGENTS.md
## App Context

My current app state, architecture, and feature tracker are in Notion.
Read this page before starting any task:
https://www.notion.so/Inventory-App-Context-34cd0e7b27b6807d8866e68d368c8ed6

---

## Key Architectural Decisions

### Build Phase Priority (solo developer — sequential)
1. **Phase 1 — MVP: Inventory only** — currently live (stock view, adjustments, StoreHub/CSV import, daily close/cron, dashboard)
2. **Phase 2 — Transfers integration** — NEXT PRIORITY (branch pull-out requests ↔ commissary Orders tab)
3. **Phase 3 — Production** (supplier deliveries, portioning — built but out of MVP scope)
4. **Phase 4 — Food Cost / GP Analysis** (depends on Recipe Database being built first)

### Sales Import — Both Branches Are LIVE
- **MKT**: StoreHub API (`/api/storehub/sales` + `/api/storehub/sync`)
- **BF**: CSV upload from **Utak POS** — ALREADY FULLY BUILT, do not re-implement
  - `src/lib/csv-mapping.ts` — `parseSalesCSV()` + `applyCsvMapping()` — 31 items mapped
  - `src/app/stock/_components/CSVImportModal.tsx` — full UI modal
  - Gated by `BRANCH_POS_TYPE.BF === "csv"` in `src/lib/auth.ts` ✅

### Phase 2 Transfer Flow Design (agreed 2026-04-28)
- **Branch-only initiation**: all pull-out requests MUST come from the branch (`pull_outs` collection)
- **Commissary fulfills only**: they review, confirm, dispatch — they cannot initiate sends
- **On Phase 2 launch**: the commissary app's manual `pullOuts` creation flow will be DISABLED
- **Discrepancy handling**: commissary adjusts their inventory + notifies branch; branch re-requests if replacement needed; no auto-replacement sends from commissary
- **Cutover strategy**: cutover is complete — old commissary manual pull-out flow removed; ActionSheet Pull Out is now the only commissary entry point

### Business Date vs. Calendar Date
- **`businessDatePHT()`** in `src/app/stock/_lib/helpers.ts` — use this (not `todayPHT()`) for all stocktake writes and queries
- Before 2am PHT, the active business day is still yesterday — matches the rollover cron schedule (`0 18 * * *` UTC = 02:00 PHT)
- `todayPHT()` flips at midnight PHT; `businessDatePHT()` flips at 2am PHT
- All stock page state, Firestore queries, and `handleSubmitAll` use `businessDatePHT()`

### Update Banner
- `src/components/UpdateBanner.tsx` — polls `/api/version` every 5 minutes
- Compares `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` baked into the client bundle vs. the live server response
- Shows a sticky "please refresh" banner when a new deployment is detected
- Skipped entirely in local dev (SHA = `"dev"`)

### Auth — Resolved 2026-04-29
- Branch now uses: **email/password Firebase Auth** — role system (superadmin/admin/linecook), `__identity` cookie, route-protection middleware
- Commissary uses: **email/password Firebase Auth**
- Firestore security rules updated (`firestore.rules`) — branch collections open to any authenticated user, commissary writes restricted to known emails
- Phase 2 can proceed: both apps use proper Firebase Auth, shared collections are accessible to both
- **`auth` is exported from `src/lib/firebase.ts`** — any client component that writes to Firestore must `await auth.authStateReady()` before the write, otherwise Firebase Auth may not have restored its session yet and the write will be rejected with PERMISSION_DENIED

### Role Permissions
- **superadmin**: full access — all branches/departments, access to `/orders` and `/production`
- **admin**: branch/department-scoped — daily inventory, stocktake submit/review, delivery entries, sales import (CSV/StoreHub), pull-out requests, tap-to-correct confirmed stocktake/delivery counts, access to `/orders`
- **linecook**: branch/department-scoped — view inventory, enter stocktake counts, view orders and receive stock; cannot create new orders

### Route Access
- `/orders` — min role: `linecook` (all users can view/receive; creating new orders requires `admin+`)
- `/production` — min role: `superadmin`
- All other routes (`/stock`, `/history`, `/pullout`, `/delivery`, `/dashboard`) — min role: `linecook`

### Stocktake Count Correction (2026-05-06)
- Admin and superadmin can tap any item in a confirmed (`isLocked: true`) stocktake to correct its count
- Bottom sheet shows current vs new count; saving writes a single Firestore batch: `branchStock`, `dailyClose.items` (recalculates variance), `dailyBeginning` for tomorrow, new `adjustment` doc with `type: "correction"`
- Scoped to today and yesterday only (inherits stocktake date picker limitation)
- Component: `src/app/stock/_components/StocktakeCompleted.tsx`, handler: `handleCorrectCount` in `src/app/stock/page.tsx`

### Stock Page — UI Decisions (2026-05-18)
- **Location filter pills removed**: Front Kitchen / Back Kitchen / Storage pills are hidden across all stock sub-tabs (Daily, Delivery, Stocktake). `categoryFilter` is permanently `"all"`. The location data on catalog items is preserved in case this is re-enabled later.
- **Reset button removed**: no longer needed post-trial. `ResetModal` component still exists but is not imported or used.
- **Delivery list excludes commissary items**: `commissary: true` items are filtered out of `DeliveryContent` via `deliveryItems` computed in `stock/page.tsx`. These items come in automatically via the Orders flow. Only non-commissary items remain: Burrata, Clam Chowder, Sourdough, Focaccia, Pandesal, Potato Buns, Brioche Loaf. The "missing items" list in `DeliveryCompleted` is filtered the same way.
- **Orders tab auto-back**: switching tabs (Pending/Active/History) in `transfers/page.tsx` now resets `view` to `"list"` inside `OrdersContent` via a `useEffect` on the `tab` prop.

### Recipe Database (future 3rd app — not yet built)
- Will share the same Firebase project (`commissary-dashboard-ccd7c`)
- First step before building: migrate hardcoded `RECIPES` array from commissary `src/data.ts` → Firestore `recipes` collection
- Will become source of truth for recipes, ingredient ratios, costing data
- Feeds cost-per-portion data to Phase 4 GP analysis in this app