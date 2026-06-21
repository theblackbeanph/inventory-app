@AGENTS.md
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
- **BF**: StoreHub API — mapping ready in `src/lib/storehub-mapping.ts` (`BF_MAPPING`); awaiting BF store credentials from supplier before going live
- CSV/Utak import (previously BF) has been removed — `csv-mapping.ts` and `CSVImportModal.tsx` are deleted
- Both branches now show "Sync sales" button unconditionally (no more `BRANCH_POS_TYPE` conditional)
- SKU IDs are branch-specific for now (BF uses M-/B-/S-/PF-/T-/A-/EX- prefixes); unified SKU IDs across branches are a future milestone

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
- `/settings` — min role: `admin`
- All other routes (`/stock`, `/history`, `/pullout`, `/delivery`, `/dashboard`) — min role: `linecook`

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

### Catalog — Last SKU Added (2026-05-29)
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

### Recipe Database (future 3rd app — not yet built)
- Will share the same Firebase project (`commissary-dashboard-ccd7c`)
- First step before building: migrate hardcoded `RECIPES` array from commissary `src/data.ts` → Firestore `recipes` collection
- Will become source of truth for recipes, ingredient ratios, costing data
- Feeds cost-per-portion data to Phase 4 GP analysis in this app