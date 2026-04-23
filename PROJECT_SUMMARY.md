# Branch Inventory Management System — Project Summary

> Generated: 2026-04-24

---

## 1. Project Overview

A real-time branch inventory tracker for The Black Bean's two branches (MKT and BF Homes). It handles daily stock monitoring, manual physical counts, POS sales auto-deduction, commissary pull-out ordering, and delivery receipt confirmation — all backed by Firestore with a Next.js frontend.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.4 (App Router) |
| UI | React 19.2.4 + TypeScript 5 + Tailwind CSS 4 |
| Database | Firebase Firestore (real-time, shared commissary project) |
| Deployment | Vercel (with cron jobs) |
| POS Integrations | Utak CSV (BF) / StoreHub API (MKT) |

---

## 3. Directory Structure

```
/src
  /app
    /api/cron/rollover          → Daily auto-close cron (2 AM PHT)
    /api/cron/generate-pullouts → Weekly auto-PO cron (Saturday 9 AM PHT)
    /api/storehub/sales         → StoreHub API bridge
    /login                      → PIN-based auth
    /department                 → Department selection
    /stock                      → Main inventory hub (Daily, Manual Count, Reports tabs)
    /history                    → Adjustment log
    /pullout                    → Pull-out order management
    /delivery                   → Delivery receipt & discrepancy
    /request                    → Legacy pull-out requests (phasing out)
    /migrate                    → One-time data migration utility
  /components
    BottomNav.tsx               → Sticky footer navigation
  /lib
    types.ts                    → All TypeScript interfaces
    firebase.ts                 → Firestore init, collection refs, batch helpers
    auth.ts                     → PIN auth, session management, localStorage
    items.ts                    → Product catalog (50+ items) + slug helpers
    csv-mapping.ts              → BF Utak CSV → commissary item mapping
    storehub-mapping.ts         → MKT StoreHub SKU → commissary item mapping
    pullout-config.ts           → Baseline pull-out quantities + PO/DN formatters
```

---

## 4. Data Models

All interfaces defined in `src/lib/types.ts`.

### Core Enumerations

```ts
Branch:       "MKT" | "BF"
Department:   "kitchen" | "bar" | "cafe"
ItemCategory: "portion" | "packed" | "loose" | "supplier"
```

### CatalogItem

Product definition from `src/lib/items.ts`.

| Field | Type | Description |
|---|---|---|
| `id` | string | URL-safe slug (e.g. `"cobbler"`) |
| `name` | string | Display name |
| `unit` | `"pc" \| "g" \| "pack"` | Unit of measure |
| `reorderAt` | number | Low-stock threshold |
| `packSize` | number? | Units per pack (for pack-unit items) |
| `department` | Department[] | Which depts carry this item |
| `category` | ItemCategory | Classification |

### BranchStock

Current live stock level. Firestore collection: `branchStock`.

| Field | Type | Description |
|---|---|---|
| `id` | string | `"${branch}__${dept}__${itemSlug}"` |
| `branch` | Branch | |
| `department` | Department | |
| `itemId` | string | Catalog slug |
| `qty` | number | Current on-hand quantity |
| `updatedAt` | Timestamp | |

### StockAdjustment

Immutable transaction log. Firestore collection: `branch_adjustments`.

| Field | Type | Description |
|---|---|---|
| `id` | string | Timestamp-based |
| `branch` | Branch | |
| `department` | Department | |
| `date` | string | `"YYYY-MM-DD"` |
| `item` | string | Catalog slug |
| `type` | `"in" \| "out" \| "waste" \| "count" \| "sales_import"` | Transaction type |
| `qty` | number | Quantity (always positive; type determines direction) |
| `loggedBy` | string | User name |
| `note` | string? | Optional reason/note |
| `source` | `"csv" \| "storehub"` ? | For sales_import entries |

### DailyBeginning

Opening inventory carry-forward. Firestore collection: `dailyBeginning`.

| Field | Type | Description |
|---|---|---|
| `id` | string | `"${branch}__${dept}__${item}__${date}"` |
| `branch` | Branch | |
| `department` | Department | |
| `item` | string | Catalog slug |
| `date` | string | `"YYYY-MM-DD"` |
| `qty` | number | Opening qty for that day |

### DailyClose

Locked end-of-day record. Firestore collection: `dailyClose`.

| Field | Type | Description |
|---|---|---|
| `id` | string | `"${branch}__${dept}__${date}"` |
| `branch` | Branch | |
| `department` | Department | |
| `date` | string | `"YYYY-MM-DD"` |
| `isLocked` | boolean | Prevents further manual count changes |
| `countType` | `"manual" \| "system"` | How it was closed |
| `countedBy` | string? | Person who performed the count |
| `items` | Record\<itemSlug, DailyCloseItem\> | Per-item summary |

**DailyCloseItem** (nested):

| Field | Type |
|---|---|
| `beginning` | number |
| `inQty` | number |
| `outQty` | number |
| `expected` | number |
| `endCount` | number |
| `variance` | number |

### PullOut

Commissary stock order. Firestore collection: `pullOuts`.

| Field | Type | Description |
|---|---|---|
| `id` | string | Auto-generated |
| `po_number` | string | `"PO-26-MMDD-BF001"` |
| `type` | `"AUTO" \| "MANUAL"` | |
| `branch` | Branch | |
| `delivery_day` | string | `"YYYY-MM-DD"` |
| `status` | `"PENDING_REVIEW" \| "CONFIRMED" \| "PREPARING" \| "DISPATCHED" \| "COMPLETED" \| "CANCELLED"` | |
| `items` | PullOutItem[] | |
| `created_at` | Timestamp | |
| `confirmed_at` | Timestamp? | |
| `confirmed_by` | string? | |
| `delivery_note_id` | string? | Linked DN |

**PullOutItem** (nested):

| Field | Type |
|---|---|
| `item_name` | string |
| `item_class` | `"A" \| "B" \| "C"` |
| `calculated_qty` | number |
| `confirmed_qty` | number |
| `unit` | `"pc" \| "g" \| "pack"` |

### DeliveryNote

Delivery receipt. Firestore collection: `deliveryNotes`.

| Field | Type | Description |
|---|---|---|
| `id` | string | Auto-generated |
| `dn_number` | string | `"DN-26-MMDD-BF001"` |
| `pull_out_id` | string | Linked PO |
| `po_number` | string | |
| `branch` | Branch | |
| `status` | `"PENDING" \| "IN_TRANSIT" \| "RECEIVED" \| "DISCREPANCY" \| "CANCELLED"` | |
| `items` | DeliveryNoteItem[] | |
| `dispatched_at` | Timestamp? | |
| `received_at` | Timestamp? | |
| `received_by` | string? | |
| `has_discrepancy` | boolean | |
| `discrepancy_notes` | string? | |
| `commissary_notified` | boolean | |

**DeliveryNoteItem** (nested):

| Field | Type |
|---|---|
| `item_name` | string |
| `unit` | string |
| `dispatched_qty` | number |
| `received_qty` | number |
| `discrepancy` | number |

---

## 5. Firestore Collections Reference

| Collection | Purpose |
|---|---|
| `branchStock` | Current live qty per item/branch/dept |
| `branch_adjustments` | Immutable transaction log (all adjustment types) |
| `dailyBeginning` | Opening inventory carry-forward per day |
| `dailyClose` | Locked end-of-day summary per branch/dept/date |
| `pullOuts` | Pull-out orders (AUTO and MANUAL) |
| `deliveryNotes` | Delivery receipts linked to pull-outs |
| `pullout_requests` | Legacy requests (phasing out) |
| `invEntries` | Commissary discrepancy log (written by branch app) |

---

## 6. Inventory Tracking Logic

### Metrics Computation (`computeMetrics` in `src/app/stock/page.tsx`)

For each item in the active branch/dept/date:

```
beginning = DailyBeginning.qty for today (carry-forward from yesterday's endCount)
inQty     = sum of all "in" adjustments today
outQty    = sum of "out" + "waste" + "sales_import" adjustments today
endCount  = qty from the latest "count" adjustment (manual physical count)
expected  = beginning + inQty - outQty
variance  = endCount - expected
```

Low-stock status is derived from `BranchStock.qty` vs `CatalogItem.reorderAt`.

### Manual Count Workflow

1. Counter selects their name and enters physical counts per item.
2. **Review modal** shows expected vs. actual count; variances > 1 are flagged red.
3. Flagged items can be marked for recount (excluded from the save).
4. On **Confirm**:
   - Writes a `"count"` type `StockAdjustment` for each item with its final count.
   - Updates `BranchStock.qty` to the final count.
   - Creates a locked `DailyClose` record (`isLocked: true`, `countType: "manual"`).
   - Writes `DailyBeginning` records for tomorrow carrying forward each `endCount`.
5. Draft counts are persisted to `localStorage` (`counts_${branch}_${dept}_${today}`) on every keystroke and cleared after save.

### Sales Import — Auto-Deduction

**BF (CSV/Utak):**
- User uploads Utak POS daily export CSV.
- Parser reads "Item" and "Count" columns; applies a 3× tray multiplier for "TRAY"/"PARTY" keywords.
- Maps POS dish names → commissary items via `CSV_MAPPING` (`src/lib/csv-mapping.ts`).
- Writes `sales_import` adjustments; replaces any prior import for that day to avoid duplicates.
- Unmatched POS items are returned for user review.

**MKT (StoreHub API):**
- User triggers "Sync sales" in the stock page.
- API bridge (`/api/storehub/sales`) fetches the day's transactions and product list from `api.storehubhq.com`.
- Maps `productId → SKU → commissary item` via `STOREHUB_MAPPING` (`src/lib/storehub-mapping.ts`).
- Aggregates quantities per commissary item; writes `sales_import` adjustments.
- Returns `{unmatchedSkus}` for user review.

### Daily Auto-Rollover Cron (`/api/cron/rollover` — runs 2 AM PHT)

For each branch/dept that has **not** been manually closed:
1. Calculates expected end count (`beg + in - out`) from today's adjustments.
2. Writes a system `"count"` adjustment if no manual count exists.
3. Creates a `DailyClose` record with `countType: "system"`.
4. Carries all end counts forward as the next day's `DailyBeginning`.

---

## 7. Pull-Out & Delivery Workflow

### Pull-Out Configuration (`src/lib/pullout-config.ts`)

- **PULLOUT_CONFIG**: Hard-coded baseline quantities per item per delivery slot.
- **Delivery slots**: `BF_MON`, `BF_THU`, `MKT_MON`, `MKT_WED`, `MKT_FRI`.
- **Item classes**: A (high priority), B (medium), C (low).
- Source data: "April 2026 validated data from Knowledge Database - Validation.xlsx".
- These are **static baselines** reviewed quarterly — not dynamically calculated from demand.

### Weekly Auto-Generation Cron (`/api/cron/generate-pullouts` — runs Saturday 9 AM PHT)

1. Calculates all delivery slot dates for the coming week.
2. For each slot, reads baseline qtys from `PULLOUT_CONFIG`.
3. Creates `PullOut` documents with `type: "AUTO"` and `status: "PENDING_REVIEW"`.
4. PO numbers formatted as `PO-YY-MMDD-BF001` / `PO-YY-MMDD-MKT001`.

### Confirmation & Dispatch

1. Kitchen supervisor reviews AUTO pull-outs in `/pullout`.
2. Adjusts `confirmed_qty` per item as needed.
3. Clicks **Confirm Pull-Out** → creates a `DeliveryNote` with `status: "PENDING"` and `dispatched_qty = confirmed_qty`.

### Delivery Receipt (`/delivery`)

1. On delivery day, staff selects the delivery note and enters received quantities.
2. System computes discrepancies (`dispatched_qty - received_qty`).
3. If any discrepancy exists, `status` becomes `"DISCREPANCY"` and `has_discrepancy: true`.
4. Discrepancy notes are written to `invEntries` for the commissary app to reconcile.

---

## 8. Reporting

### Daily Tab (stock page)

- Select any past date → view summary table: **Item | BEG | IN | OUT | EXP | END | VAR**
- Toggle "Variances only" to filter to items with variance ≠ 0.
- Export as CSV: `inventory-${BRANCH}-${date}.csv`.

### Reports Tab — Weekly Summary (stock page)

- Covers Monday–Sunday for the selected week.
- Columns: **Item | Mon BEG | Total IN | Total OUT | Expected End | Actual Count | Weekly Variance**
- Footer: count of "X of 7 days manually counted".
- Export as CSV: `weekly-${BRANCH}-${weekStart}.csv`.

### History Tab (`/history`)

- Real-time adjustment log grouped by date, searchable by item name.
- Shows: type badge (IN/OUT/WASTE/COUNT/SALES), item, quantity (±), optional note.
- Covers all adjustment types across the active branch/dept.

---

## 9. Authentication & Session Management

| Aspect | Detail |
|---|---|
| Method | 4-digit PIN (frontend only, no backend validation) |
| Storage | `localStorage` as `branch_auth` |
| TTL | 24 hours (auto-logout on stale token) |
| Session scope | Branch set independently of department |
| Full access | Requires both branch + department in session |
| Branch PINs | Hardcoded in `src/lib/auth.ts` (both currently "0317") |

`getSession()` returns `{branch, dept, authedAt}` and redirects to `/login` if missing or expired.  
`getBranchSession()` returns branch-only (used on the department selection page).

---

## 10. External Services & Environment Variables

### StoreHub API

- Base URL: `https://api.storehubhq.com`
- Auth: HTTP Basic (username:password)
- Endpoints used:
  - `GET /products` — list all products with SKUs
  - `GET /transactions?storeId=...&from=DATE&to=DATE` — daily sales
- Env vars: `STOREHUB_USERNAME`, `STOREHUB_PASSWORD`, `STOREHUB_MKT_STORE_ID`

### Vercel Cron

- Cron routes protected by `Authorization: Bearer ${CRON_SECRET}`
- `vercel.json`:
  ```json
  {
    "crons": [
      { "path": "/api/cron/rollover",          "schedule": "0 2 * * *"  },
      { "path": "/api/cron/generate-pullouts", "schedule": "0 9 * * 6"  }
    ]
  }
  ```

---

## 11. Navigation Structure

```
/login
  └─ PIN auth → /department (dept selection)
       └─ /stock (main hub)
            ├─ Daily tab         → past-date summary + CSV export
            ├─ Manual Count tab  → physical count entry + review modal
            └─ Reports tab       → weekly summary + CSV export

/history     → adjustment log (all depts)
/pullout     → pull-out order list + detail + manual creation
/delivery    → delivery receipt + discrepancy recording
/request     → legacy pull-out requests (inactive)
```

**BottomNav** (72px sticky footer) shows: Stock · Pull Out · Delivery · History.  
Pull Out and Delivery tabs are visible to kitchen only.

---

## 12. Key Files Quick Reference

| File | Purpose |
|---|---|
| `src/lib/types.ts` | All TypeScript interfaces |
| `src/lib/firebase.ts` | Firestore init, collection refs, `saveBatch` helper |
| `src/lib/auth.ts` | PIN auth, session read/write, 24hr TTL |
| `src/lib/items.ts` | CATALOG array + `getItemById` / `getItemBySlug` |
| `src/lib/csv-mapping.ts` | BF Utak POS → commissary item mapping |
| `src/lib/storehub-mapping.ts` | MKT StoreHub SKU → commissary item mapping |
| `src/lib/pullout-config.ts` | Static baseline pull-out qtys + PO/DN number formatters |
| `src/app/stock/page.tsx` | Main hub (~1250 lines): all tabs + modals + metrics |
| `src/app/pullout/page.tsx` | Pull-out list, detail view, manual PO creation |
| `src/app/delivery/page.tsx` | Delivery receipt + discrepancy workflow |
| `src/app/history/page.tsx` | Adjustment log with search |
| `src/app/api/cron/rollover/route.ts` | Daily auto-close logic |
| `src/app/api/cron/generate-pullouts/route.ts` | Weekly auto-PO generation |
| `src/app/api/storehub/sales/route.ts` | StoreHub API proxy |
| `src/components/BottomNav.tsx` | Sticky footer navigation |

---

## 13. Known Limitations

- **No dynamic recipe costing**: Pull-out quantities are static baselines, not computed from consumption rates or selling prices.
- **Frontend-only auth**: Branch PINs are in client-side code; no role-based access control.
- **No cross-branch reads**: Each branch session only sees its own data.
- **CSV parsing is BF-only**: MKT migrated fully to StoreHub; CSV module may be removed.
- **Discrepancy handling is one-way**: Branch records discrepancies in `invEntries`; commissary must manually reconcile — no automatic stock adjustment back to commissary.
- **Legacy `/request` module**: Not actively used; superseded by the pull-out module.
- **No recipe → cost linkage**: The system tracks quantities but does not calculate cost-of-goods from recipes.
