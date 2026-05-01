# Manual Delivery Tab — Design Spec
**Date:** 2026-05-01  
**Status:** Approved

---

## Overview

Add a **Delivery** sub-tab to the Stock page (between Daily and Stocktake) so staff can manually log stock received from commissary. This is a temporary feature — it will be removed when Phase 2 automated commissary transfers are built.

Three changes:
1. Add `Delivery` as a third sub-tab on the Stock page
2. New `DeliveryContent.tsx` counting screen
3. New `DeliveryReviewSheet.tsx` review overlay

---

## 1. UI Components

### Sub-tab Navigation

Stock page sub-tabs become: **Daily · Delivery · Stocktake**

The existing `subTab` state in `page.tsx` gains a third value: `"delivery"`. The tab pill renders the same way as Daily and Stocktake.

### Date Picker

- Identical to Stocktake: Yesterday / Today pill buttons, derived from `businessDatePHT()` and `addDays(today, -1)`
- Same date-change warning sheet if `deliveryCounts` is non-empty when switching dates
- Default: today (`businessDatePHT()`)

### Pending Delivery Banner

- Blue background (`#EFF6FF` / `#BFDBFE` border) when counts exist
- Text: "Pending Delivery" + subtitle "X items entered · tap to review"
- When no counts: neutral grey "No delivery started" state (non-tappable)
- Tapping opens the **Delivery Review Sheet**

### Category Filter Pills

Same All / portion / packed / loose / supplier pills as other tabs — for navigating the item list only. Does not affect Save scope.

### Item List

Same input style as Stocktake: item name, pack size, current stock level as context (`Stock: N`), numeric input field. Items with no value show `—` placeholder.

### Bottom Bar

Two buttons, always visible:
- **Save** — saves a single draft covering all entered items. Disabled when `deliveryCounts` is empty.
- **Submit (N)** — opens the Delivery Review Sheet. Disabled when N = 0.

### Delivery Review Sheet

File: `DeliveryReviewSheet.tsx`

**Header:**
- Title: "Delivery Review"
- Subtitle: `[deliveryDate] · N items received`
- ✕ close button

**Item list:**
- Each row: item name, pack size, received qty (blue), resulting stock level (`current stock + received qty`)
- **Recount** button per row: clears that item from `deliveryCounts`, stays in the review sheet

**Bottom buttons (sticky):**
- **Continue** — closes the sheet
- **Submit** — fires `handleDeliverySubmit`

### Post-Submit Behaviour

No lock. After submit:
- `deliveryCounts` resets to `{}`
- Draft doc deleted from Firestore
- Banner returns to neutral "No delivery started" state
- Staff can immediately log another delivery for the same date

---

## 2. Data Flow — `page.tsx`

### New state

```ts
// Delivery tab
const [deliveryDate, setDeliveryDate] = useState(businessDatePHT);
const [deliveryCounts, setDeliveryCounts] = useState<Record<string, string>>({});
const [showDeliveryReview, setShowDeliveryReview] = useState(false);
const [deliverySubmitLoading, setDeliverySubmitLoading] = useState(false);
const deliveryDraftsInitRef = useRef(false);
```

### New `useEffect`

Keyed on `[branch, department, deliveryDate]`:
- Resets `deliveryDraftsInitRef.current = false` at top
- Subscribes to a single doc in `deliveryDrafts` collection, keyed `${branch}__${department}__${deliveryDate}`
- On first snapshot (hydration): sets `deliveryCounts` from `draft.counts` if doc exists, then sets `deliveryDraftsInitRef.current = true`
- Subsequent snapshots: no-op (same `draftsInitRef` pattern as Stocktake)
- Returns cleanup to unsubscribe

### Date change handler

```ts
function handleDeliveryDateChange(newDate: string) {
  setDeliveryCounts({});
  setDeliveryDate(newDate);
}
```

Warning sheet handled locally inside `DeliveryContent` — same pattern as `StocktakeContent`.

### `handleDeliverySave`

```ts
async function handleDeliverySave() {
  const draftId = `${branch}__${department}__${deliveryDate}`;
  await saveDocById(COLS.deliveryDrafts, draftId, {
    id: draftId, branch, department, date: deliveryDate,
    counts: /* deliveryCounts filtered to non-empty numeric values */,
    savedAt: new Date().toISOString(),
    savedBy: session?.displayName ?? BRANCH_LABELS[branch],
  });
}
```

### `handleDeliverySubmit`

```ts
async function handleDeliverySubmit() {
  // 1. For each item in deliveryCounts with a valid positive number:
  //    write a branch_adjustments doc with type="in", qty, date=deliveryDate, branch, department, loggedBy
  // 2. Delete the deliveryDrafts doc for this date
  // 3. setDeliveryCounts({})
  // 4. setShowDeliveryReview(false)
}
```

No `dailyClose` lock check. No `branchStock` update (same as other adjustment writes — stock level is derived from adjustments).

---

## 3. Firestore

### New collection: `deliveryDrafts`

```
deliveryDrafts/{branch}__{department}__{date}
  id: string
  branch: Branch
  department: Department
  date: string           // YYYY-MM-DD
  counts: Record<string, number>
  savedAt: string
  savedBy: string
```

One doc per branch/department/date. Overwritten on each Save. Deleted on Submit.

### Adjustments written on Submit

Each entered item creates one doc in `branch_adjustments`:

```
branch_adjustments/{id}
  id: number             // Date.now() + random
  branch: Branch
  department: Department
  date: string           // deliveryDate
  item: string
  type: "in"
  qty: number
  loggedBy: string
  note: "manual delivery"
```

---

## 4. Files Changed

| File | Change |
|---|---|
| `src/app/stock/page.tsx` | Add delivery state, new `useEffect`, `handleDeliverySave`, `handleDeliverySubmit`, third sub-tab, render `DeliveryContent` + `DeliveryReviewSheet` |
| `src/app/stock/_components/DeliveryContent.tsx` | New — counting screen with date picker, banner, item list, bottom bar |
| `src/app/stock/_components/DeliveryReviewSheet.tsx` | New — review overlay |
| `src/lib/firebase.ts` | Add `deliveryDrafts: "delivery_drafts"` to `COLS` |

---

## Out of Scope

- No changes to Daily or Stocktake tabs
- No history view of past deliveries (adjustments are visible in the Daily tab)
- No per-item delivery notes or reference numbers
- No commissary integration (Phase 2)
- No role restrictions — same access as existing tabs
