@AGENTS.md
## Firestore Rules — IMPORTANT

**Editing `firestore.rules` does NOT auto-deploy.** After every change to `firestore.rules`, you MUST run:
```
npx firebase-tools deploy --only firestore:rules
```
before considering the task done. Failing to do this means the new rules are never enforced and features that depend on them will silently fail with PERMISSION_DENIED.

> The Firestore database and rules are **shared across all Black Bean apps** (commissary, branch-inventory, and future Recipe DB). A rules change in any one app must be deployed here and applies to all apps.

---

## App Context

My current app state, architecture, and feature tracker are in Notion.
Read this page before starting any task:
https://www.notion.so/Inventory-App-Context-34cd0e7b27b6807d8866e68d368c8ed6

---

## Key Architectural Decisions

### Build Phase Priority (solo developer — sequential)
1. **Phase 1 — MVP: Inventory only** — currently live (stock view, adjustments, StoreHub/CSV import, daily close/cron, dashboard)
2. **Phase 2 — Transfers integration** — currently live (branch pull-out requests ↔ commissary Orders tab, live since 2026-05-09)
3. **Phase 3 — Production** — NEXT PRIORITY (built but needs RAW_MATERIALS config before usable; supplier deliveries, portioning)
4. **Phase 4 — Food Cost / GP Analysis** (depends on Recipe Database being built first)

### Sales Import — Both Branches Use StoreHub API
- **MKT**: StoreHub API (`/api/storehub/sales` + `/api/storehub/sync`)
- **BF**: StoreHub API — live; mapping in `src/lib/storehub-mapping.ts` (`BF_MAPPING`); credentials set in Vercel env (`STOREHUB_BF_USERNAME`, `STOREHUB_BF_PASSWORD`, `STOREHUB_BF_STORE_ID`)
- CSV/Utak import (previously BF) has been removed — `csv-mapping.ts` and `CSVImportModal.tsx` are deleted
- Both branches show "Sync sales" button unconditionally (no more `BRANCH_POS_TYPE` conditional)
- BF uses unified SKU prefixes: MAIN, BREAK, PARTY, SW, PSTA, EXT (party trays deduct qty:3; PARTY03 Breakfast Sampler deducts qty:2). MKT is migrating to the same scheme — some new SKUs (e.g. PSTA11) are already shared across both stores.

### Phase 2 Transfer Flow Design (agreed 2026-04-28)
- **Branch-only initiation**: all pull-out requests MUST come from the branch (`pull_outs` collection)
- **Commissary fulfills only**: they review, confirm, dispatch — they cannot initiate sends
- **On Phase 2 launch**: the commissary app's manual `pullOuts` creation flow will be DISABLED
- **Discrepancy handling**: commissary adjusts their inventory + notifies branch; branch re-requests if replacement needed; no auto-replacement sends from commissary
- **Cutover strategy**: cutover is complete — old commissary manual pull-out flow removed; ActionSheet Pull Out is now the only commissary entry point

### Cron Jobs (2026-07-14 / 2026-07-19)
> **Vercel crons are defined in `vercel.json` but NEVER fire on the Hobby plan. All cron routes must be registered on cron-job.org.**

#### StoreHub Auto Sync (job ID: 8090135)
- **Schedule**: daily at **1:00 AM PHT (17:00 UTC)**
- **Endpoint**: `GET /api/cron/storehub-sync` — no auth required
- **Date logic**: `syncDatePHT()` returns yesterday's PHT date. At 1am PHT, "yesterday" = the full business day that just closed. Do NOT change this.
- **Firestore writes**: `branch_adjustments` docs with `type: "sales_import"` and `loggedBy: "system (auto-sync)"`. Doc ID pattern: `storehub__{branch}__kitchen__{date}__{itemSlug}`. Also writes `storehubUnmatched/{branch}__{date}` with unmatched SKUs.
- **Verification**: query `branch_adjustments` where `loggedBy == "system (auto-sync)"` and `date == <yesterday>` — if docs exist, the sync ran.

#### Daily Rollover (job ID: 8117880)
- **Schedule**: daily at **2:00 AM PHT (18:00 UTC)** — 1 hour after storehub-sync
- **Endpoint**: `GET /api/cron/rollover` — no auth required
- **What it does**: for each branch/dept, if no manual stocktake was submitted for yesterday → auto-closes with expected values (BEG + IN - OUT), then carries end counts as today's `dailyBeginning`. If a manual stocktake was already submitted, it just reads its end counts and carries them forward.
- **Why it matters**: the manual stocktake submit also writes next-day `dailyBeginning`, so on days when the team does a stocktake the rollover is redundant. But if a stocktake is skipped, the rollover is the only thing that propagates BEG to the next day. Without this job, skipping one night = all dashes in BEG the next morning.
- **Verification**: check for a `dailyClose` doc `{branch}__{dept}__{yesterday}` with `countType: "system"` — if present, the auto-close ran.
- **cron-job.org API key**: stored in macOS Keychain (service: `cronjob-org`, account: `chris@theblackbean.ph`)
- **Manual trigger**: `curl -X GET https://inventory.theblackbean.ph/api/cron/storehub-sync` — syncs yesterday PHT

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
- Branch now uses: **email/password Firebase Auth** — role system (superadmin/admin/staff), `__identity` cookie, route-protection middleware
- Commissary uses: **email/password Firebase Auth**
- Firestore security rules updated (`firestore.rules`) — branch collections open to any authenticated user, commissary writes restricted to known emails
- Phase 2 can proceed: both apps use proper Firebase Auth, shared collections are accessible to both
- **`auth` is exported from `src/lib/firebase.ts`** — any client component that writes to Firestore must `await auth.authStateReady()` before the write, otherwise Firebase Auth may not have restored its session yet and the write will be rejected with PERMISSION_DENIED

### Role Permissions
- **superadmin**: full access — all branches/departments, access to `/orders`, `/production`, and `/sales` (both-branch view)
- **admin**: branch/department-scoped — daily inventory, stocktake submit/review, delivery entries, sales import (CSV/StoreHub), pull-out requests, tap-to-correct confirmed stocktake/delivery counts, access to `/orders` and `/sales` (own branch only — branch switcher pills hidden)
- **staff**: branch/department-scoped — view inventory, enter stocktake counts, view orders and receive stock; cannot create new orders
- Role string in Firestore and code is `"staff"` (renamed from `"linecook"` on 2026-07-19). Display label is "Staff".

### Route Access
- `/orders` — min role: `staff` (all users can view/receive; creating new orders requires `admin+`)
- `/production` — min role: `superadmin`
- `/settings` — min role: `admin`
- `/sales` — min role: `admin`; superadmin sees both-branch switcher, admin sees their assigned branch only (view locked, no pills)
- All other routes (`/stock`, `/history`, `/pullout`, `/delivery`, `/dashboard`) — min role: `staff`

### Stocktake Count Correction (2026-05-06)
- Admin and superadmin can tap any item in a confirmed (`isLocked: true`) stocktake to correct its count
- Bottom sheet shows current vs new count; saving writes a single Firestore batch: `branchStock`, `dailyClose.items` (recalculates variance), `dailyBeginning` for tomorrow, new `adjustment` doc with `type: "correction"`
- Scoped to today and yesterday only (inherits stocktake date picker limitation)
- Component: `src/app/stock/_components/StocktakeCompleted.tsx`, handler: `handleCorrectCount` in `src/app/stock/page.tsx`

### Stocktake Auto-Save (2026-06-11)
- Counts are auto-saved to `localStorage` 800ms after each keystroke — device-local, no cross-user interference
- Key: `stocktake_counts__${branch}__${department}__${date}`
- On load, localStorage is merged with Firestore drafts (localStorage wins — it holds the most recent unsaved state)
- A green **"Auto-saved"** badge appears in the header (beside Sync/Import buttons) for 2s after each save, only while on the Stocktake tab
- localStorage key is cleared on successful final submit
- Implementation: auto-save `useEffect` in `stock/page.tsx`; status prop passed to `StocktakeContent`

### Delivery — Multiple Deliveries Per Day (2026-06-11)
- Removed the one-per-day lock: a **"+ New Delivery"** button appears in `DeliveryCompleted`, allowing additional delivery entries
- Each new delivery accumulates into the running total (`deliveryAdjClose` quantities sum across all submissions for the day)
- `effectiveDelivery` now prefers `deliveryAdjClose` over `deliveryClose` — `deliveryAdjClose` is always live/accurate (computed from real adjustments), `deliveryClose` is a snapshot that can go stale after multiple submits
- `handleDeliveryCorrect` and `handleAddMissingDeliveryItem` use the same `deliveryAdjClose ?? deliveryClose` priority
- `deliveryClose` doc is written with merged (cumulative) items on each submit to stay roughly in sync

### Stock Page — UI Decisions (2026-05-18)
- **Location filter pills removed**: Front Kitchen / Back Kitchen / Storage pills are hidden across all stock sub-tabs (Daily, Delivery, Stocktake). `categoryFilter` is permanently `"all"`. The location data on catalog items is preserved in case this is re-enabled later.
- **Reset button removed**: no longer needed post-trial. `ResetModal` component still exists but is not imported or used.
- **Delivery list excludes commissary items**: `commissary: true` items are filtered out of `DeliveryContent` via `deliveryItems` computed in `stock/page.tsx`. These items come in automatically via the Orders flow. Only non-commissary items remain: Burrata, Clam Chowder, Sourdough, Focaccia, Pandesal, Potato Buns, Brioche Loaf. The "missing items" list in `DeliveryCompleted` is filtered the same way.
- **Orders tab auto-back**: switching tabs (Pending/Active/History) in `transfers/page.tsx` now resets `view` to `"list"` inside `OrdersContent` via a `useEffect` on the `tab` prop.

### Catalog — BF-Specific Items (2026-06-21)
- **Porkchop** — `packed`, 1 pc, `branches: ["BF"]`, no `commissary: true` — sourced from supplier at BF (same cut as MKT's Tomahawk Porkchop but tracked separately; deducted by StoreHub SKU M08)
- **Tomahawk Porkchop** — now `branches: ["MKT"]` only — commissary-sourced for MKT
- Items restricted to MKT only (`branches: ["MKT"]`): House Vinaigrette, Kimchi, Maple Syrup, Marinara Sauce, Marinara Sauce (Blend), Truffle Pasta Sauce, Tomahawk Porkchop
- BF StoreHub mapping: `BF_MAPPING` in `src/lib/storehub-mapping.ts` — party trays deduct qty:3; Breakfast Sampler (T03) deducts qty:2

### Catalog — Last Added (2026-07-19): Dining Department
- **New department**: `"dining"` added to `Department` type and `DEPARTMENT_LABELS`. New location: `"dining"`.
- **23 dining items** added to `src/lib/items.ts` — commissary desserts, supplier desserts, Engkanto beers, Bubu Bars (BF only).
- **`orderUnit` / `orderUnitSize`** — two new optional fields on `CatalogItem`:
  - `orderUnit`: display unit for ordering (e.g. `"tray"`, `"cake"`, `"case"`)
  - `orderUnitSize`: how many stock units per order unit (e.g. 1 tray = 12 pcs)
  - Used in `OrdersContent.tsx` auto-IN: `qty = receivedQty × (orderUnitSize ?? 1)` — branch stock is incremented in stock units, not order units
  - Only affects the commissary transfer receive flow; supplier deliveries are entered manually in stock units

### Dining — Transfer Conversion (commissary desserts)
- Tiramisu is ordered in **trays**, tracked in **pcs** (slices). 1 tray = 12 pcs.
- Commissary tracks in trays; branch tracks in pcs. Transfer doc carries the tray qty. Branch auto-IN multiplies: `trays × 12 = pcs added`.
- Same pattern for all commissary desserts with `orderUnit`/`orderUnitSize` set.

### Dining — Mascarpone (loose pack, commissary-supplied)
- `Classic Tiramisu Mascarpone` and `Hojicha Tiramisu Mascarpone` — `category: "loose"`, `unit: "pack"`, `packSize: "1kg"`, `ordersPerPack: 12`, `commissary: true`
- Deducted via StoreHub sales (same pattern as kitchen loose items): DSRT02 → Classic Tiramisu Mascarpone at `ordersPerPack: 12`; DSRT08 (whole tray, qty:12) also deducts 1 jar.
- 1 jar = 12 tiramisu servings. Branch stocks jars, deduction accumulates per slice sold.

### Dining — Carrot Cake Naming (two suppliers, same product)
- **BF**: `"Carrot Cake"` — Flour Jar supplier, SKU `DSRT04`
- **MKT**: `"Oventime Carrot Cake"` — Oventime supplier, SKU `DSRT04-01`
- Different names required because `CATALOG_MAP` keys by item name — same name would cause one branch to silently shadow the other.
- Whole cake: DSRT09 → `"Carrot Cake"` (BF mapping only); no whole variant for MKT.

### Catalog — Previous Notable Addition (2026-05-29)
- **Ube Halaya** — `loose`, 500g pack, `ordersPerPack: 7`, reorder at 2, back kitchen, commissary-supplied, all branches
- MKT StoreHub mapping: SKUs `S3` (Ube Grilled Cheese) + `70` (Tomahawk Porkchop dish)
- Reference: Portion Guide L-018, MKT Item Mapping #50

### Par Levels & Settings (2026-06-20)
- **Two distinct fields on `CatalogItem`**: `reorderAt` (low stock alert — shows LOW badge) and `parLevel` (order-up-to target — used for auto-fill)
- **All 33 commissary pc items** updated in `src/lib/items.ts` with MKT values from CSV (previously all flat `10`)
- **Firestore overrides**: `parLevelSettings/{branch}` — `{ items: Record<string, { parLevel, alertAt }>, updatedAt, updatedBy }`. Firestore values take precedence over catalog defaults. Rule: any authenticated user can read/write.
- **Settings page**: `src/app/settings/page.tsx` + `src/app/settings/_components/ParLevelSettings.tsx`. Accessible via gear icon in Dashboard header (admin+ only). Per-branch — MKT and BF stored independently.
- **BF par levels**: not yet set. BF admin should open Settings and save their values.

### Auto-Fill Order Form (2026-06-20)
- On `NewOrderForm` mount: fetches `parLevelSettings/{branch}`, `dailyBeginning` (today), and `branch_adjustments` (today) in parallel
- **Stock formula**: `dailyBeginning + inQty - outQty` (mirrors EXP in stock page). If `count` adjustment exists today, uses that endCount instead. Do NOT use `branchStock.qty` as base — it is incremented by deliveries and would double-count.
- **Auto-select logic**: pc items where `parLevel - currentStock > 0` → pre-checked with `ceil(gap / 5) * 5`
- **Pack items**: stock is computed and displayed but never auto-selected — team selects manually
- Source banner shown: "today's stocktake count" / "latest expected (synced sales)" / "last known stock"
- All `auth.authStateReady()` calls must precede any Firestore read in this flow

### Active Order Detail — Receiving UX (2026-05-20)
- **Per-item check button**: checkbox on the left of each item row in `ActiveDetail` (`OrdersContent.tsx`). Tapping toggles a green checked state. Checked + no discrepancy → green row, dimmed qty controls. Checked + discrepancy → light red row, red border stays dominant. Progress counter ("Items checked X of Y") shown between the info banner and item list. State is local (`useState<Set<string>>`) — resets if user navigates away. No Firestore writes.
- **Confirm receipt summary**: tapping "Confirm Receipt" opens a full-screen overlay (`showReview` state) instead of immediately writing to Firestore. Overlay shows a receipt card with colored header (green = all good, red = discrepancy), read-only item list, discrepancy items highlighted with "Expected X · received Y", footer note, and **Back** / **Submit** buttons. Submit fires the existing `confirmReceipt()` unchanged.

### Dispute Resolution Flow (2026-06-21, UI updated 2026-06-26)
- **Status state machine**: `DISCREPANCY → DISPUTED → SENT_BACK → RESOLVED` (also `DONE` for no-dispute path)
- **`DISCREPANCY`**: branch confirmed receipt with wrong quantities — commissary sees the modal to review
- **`DISPUTED`**: commissary submitted a counter (per-item adjusted quantities) → escalated to superadmin
- **`SENT_BACK`**: superadmin returned the dispute to commissary to re-edit; commissary sees orange "↩ SENT BACK" card with "Re-edit Dispute" button
- **`RESOLVED`**: superadmin approved the final quantities; inventory adjusted atomically; `dispute_notices` doc written for branch
- **Cancel Dispute** (`DiscrepancyDetail` in `OrdersContent.tsx`): branch cancels dispute and accepts dispatched quantities. Batch-writes: commissary `invEntries` for ALL items using `dispatchedQty`, `branch_adjustments`, `branch_stock` increment for discrepancy items only, delivery note → `"RECEIVED"`, pull_out → `"DONE"` with `commissaryInvWritten: true`
- **Resolution notice** (`transfers/page.tsx`): onSnapshot on `dispute_notices` filtered by branch + `branchAcknowledged == false`. Shows sticky dark banner; bottom sheet displays superadmin note + corrected items table (delta green/red). Dismiss writes `branchAcknowledged: true` + `branchAcknowledgedAt`
- **Firestore**: `dispute_notices` collection — `{ poRef, pullOutId, branch, resolvedAt, resolvedBy, superadminNote, correctedItems[], branchAcknowledged, branchAcknowledgedAt? }`. Pre-computed at resolution time (denormalized snapshot). `COLS.disputeNotices = "dispute_notices"` in `src/lib/firebase.ts`
- **`branch_stock` updates**: always use `FieldValue.increment(delta)` — never plain `{ qty: delta }` with merge, which overwrites instead of adding

### Orders Tab — UI Decisions (2026-06-26)
- **Tab placement**: `DISCREPANCY` stays in the **Active** tab (not History) — dispute is still unresolved, so it should remain visible as an action item. Active tab count badge includes both `DISPATCHED` and `DISCREPANCY`.
- **`DISCREPANCY` detail view**: opens `DiscrepancyDetail` (not `ActiveDetail`) — read-only view showing a status banner, discrepancy items highlighted at top, all items below, and only the "Cancel Dispute" button. No qty adjusters or "Confirm Receipt" button.
- **`DISCREPANCY` card subtext** (Active tab): "Dispute filed — pending commissary review" (amber)
- **`DISPUTED` card subtext** (History tab): "Escalated — pending admin decision" (purple)
- **`DONE` label**: displays as **"Received"** — `DONE` is the outcome of cancelling a dispute; from the branch's perspective the stock was still received, so the label should match `RECEIVED`
- **List sort order**: all three tabs (Pending, Active, History) sort newest-first by document `id` (which is `String(Date.now())` at creation)
- **History card description line**: shows the DN ref (e.g. `DN-26-0626-MKT001`) instead of the order date, followed by item count and fulfillment %. Falls back to the order date if no DN exists.

### Waste Tab — History & Export (2026-06-26)
- **History window**: loads the past 30 days of waste adjustments on page mount (up from 14). Uses per-date equality queries to avoid a composite index — 30 parallel `getDocs` calls, one per date.
- **Export Waste (90 days)** button appears at the bottom of the History subtab. Fetches 90 days of waste adjustments (90 parallel `getDocs`), filters `type === "waste"`, sorts newest-first, and triggers a CSV download named `waste-{branch}-{department}-90d.csv`.
- CSV columns: `date, item, qty, reason, logged_by`
- Handler: `handleExportWaste` in `src/app/stock/page.tsx`; button + loading state in `src/app/stock/_components/WasteContent.tsx` (`onExport` prop)

### Bug Log
- All known bugs and fixes are tracked in `docs/bugs.md`. Update this file whenever a bug is found or fixed.

### Correction Blindness — Fixed (2026-07-02)
- **What it was**: tap-to-correct writes `type: "correction"` adjustments (Firestore string auto-IDs). Both `computeMetrics` and the dashboard variance functions only read `type: "count"`, so corrections were invisible — END column showed pre-correction values while BEG for the next day was already correct, causing an irreconcilable audit gap.
- **Fixed in `computeMetrics`** (`src/app/stock/_lib/helpers.ts`): Daily tab END/VAR columns and CSV export now reflect corrections. Corrections are tracked separately and applied after counts so they always win. String comparison used for IDs (`String(adj.id)`) since correction docs use Firestore auto-ID strings.
- **Fixed in dashboard variance** (`src/app/dashboard/_lib/variance.ts`): same fix applied to `computeVarianceRows` and `computeItemSummaries`. Dashboard END values, period variance, status, trend, and CSV exports now reflect corrections.
- **Still open in NewOrderForm**: auto-fill prefill ignores `type: "correction"` when computing current stock for order quantity suggestions. Minor gap — team reviews before submitting.

### Recipe Database (future 3rd app — not yet built)
- Will share the same Firebase project (`commissary-dashboard-ccd7c`)
- First step before building: migrate hardcoded `RECIPES` array from commissary `src/data.ts` → Firestore `recipes` collection
- Will become source of truth for recipes, ingredient ratios, costing data
- Feeds cost-per-portion data to Phase 4 GP analysis in this app