# Add Missing Items + Admin Tap-to-Correct

**Date:** 2026-05-07
**Status:** Approved

---

## Overview

Two small improvements to the completed stocktake and delivery (IN) views:

1. **Add missing items** — superadmin and admin can add items that were not counted during the original submission. Only items not already in the completed record are offered.
2. **Admin tap-to-correct** — extend the existing tap-to-correct correction flow (currently superadmin-only) to admin as well.

---

## Role Change: Tap-to-Correct

Both `StocktakeCompleted.tsx` and `DeliveryCompleted.tsx` gate the correction flow behind:

```ts
const isSuperadmin = role === "superadmin";
```

Change both to:

```ts
const canEdit = role === "superadmin" || role === "admin";
```

Replace all uses of `isSuperadmin` with `canEdit` in those two files. The hint text ("Tap any item to correct its count / quantity") also uses this flag — update it accordingly.

---

## Add Missing Items — UI

### Props additions

**`StocktakeCompleted`** receives two new optional props:
- `missingItems: string[]` — item names not yet in `dayClose.items`, sorted alphabetically
- `onAddMissing: (item: string, qty: number) => Promise<void>`

**`DeliveryCompleted`** receives two new optional props:
- `missingItems: string[]` — item names not yet in `deliveryClose.items`, sorted alphabetically
- `onAddMissing: (item: string, qty: number) => Promise<void>`

### Button

When `canEdit && missingItems.length > 0`, render an "Add missed item" button below the item list (above the tap-hint). Tapping it opens the add-missing sheet.

When `missingItems.length === 0`, do not render the button (nothing to add).

### Add-missing sheet (two-step)

**Step 1 — Pick item:**
- Full-screen bottom sheet overlaying the page
- Search input at top (filters the list as user types)
- Scrollable list of `missingItems`
- Tapping an item advances to Step 2

**Step 2 — Enter quantity:**
- Shows item name as header
- Single number input (same style as the correction sheet)
- "Save" button — disabled until qty is a valid non-negative number
- Back button returns to Step 1

Both steps share the same sheet container; Step 2 replaces Step 1's content in-place.

The sheet is implemented inline in each completed component (same pattern as the existing correction sheet). No new shared component needed — the two flows differ enough in data shape that sharing would add complexity without benefit.

---

## Add Missing Items — Data Flow

### Filtering (client-side, in `page.tsx`)

The `stocks` map (`Record<string, BranchStock>`) is already in page state. Compute missing items before passing to each completed component:

```ts
// Stocktake
const missingStocktakeItems = stocktakeDayClose
  ? Object.keys(stocks)
      .filter(item => !(item in stocktakeDayClose.items))
      .sort()
  : [];

// Delivery
const effectiveDelivery = deliveryClose ?? deliveryAdjClose;
const missingDeliveryItems = effectiveDelivery
  ? Object.keys(stocks)
      .filter(item => !(item in effectiveDelivery.items))
      .sort()
  : [];
```

### Handler: `handleAddMissingStocktakeItem(item: string, qty: number)`

Lives in `page.tsx`, passed as `onAddMissing` to `StocktakeCompleted`.

Firestore batch:
1. **`branch_adjustments`** — new doc: `{ branch, department, date: stocktakeDate, item, type: "count", qty, loggedBy }`
2. **`branch_stock`** — merge: `{ qty, lastUpdated: stocktakeDate, lastUpdatedBy: loggedBy }`
3. **`daily_close`** — merge the new item into `items`:
   - `beginning` = `stocktakeBeginnings[item] ?? 0`
   - `inQty` = sum of type `"in"` adjustments for this item in `stocktakeAdjustments`
   - `outQty` = sum of type `"out"` / `"waste"` / `"pullout"` adjustments for this item
   - `expected` = `beginning + inQty - outQty`
   - `variance` = `qty - expected`
   - Write: `{ items: { ...existing, [item]: { beginning, inQty, outQty, expected, endCount: qty, variance } } }`
4. **`daily_beginning`** (tomorrow) — merge: `{ qty, setBy: loggedBy, updatedAt: stocktakeDate }`

### Handler: `handleAddMissingDeliveryItem(item: string, qty: number)`

Lives in `page.tsx`, passed as `onAddMissing` to `DeliveryCompleted`.

Firestore batch:
1. **`branch_adjustments`** — new doc: `{ branch, department, date: deliveryDate, item, type: "in", qty, loggedBy, note: "manual delivery" }`
2. **`branch_stock`** — merge: `{ qty: currentQty + qty, lastUpdated: deliveryDate, lastUpdatedBy: loggedBy }`
   - `currentQty` = `stocks[item]?.qty ?? 0`
3. **`delivery_close`** — rewrite doc with updated items map (same pattern as `handleDeliveryCorrect`):
   - `updatedItems = { ...effective.items, [item]: qty }`

---

## Files Changed

| File | Change |
|------|--------|
| `src/app/stock/_components/StocktakeCompleted.tsx` | Replace `isSuperadmin` → `canEdit`; add missing-item sheet + props |
| `src/app/stock/_components/DeliveryCompleted.tsx` | Replace `isSuperadmin` → `canEdit`; add missing-item sheet + props |
| `src/app/stock/page.tsx` | Add `missingStocktakeItems` + `missingDeliveryItems` derivations; add `handleAddMissingStocktakeItem` + `handleAddMissingDeliveryItem`; pass new props to both completed components |

No new files. No schema changes — all writes use existing collection shapes.

---

## Edge Cases

- **`missingItems` empty**: button is hidden; no sheet rendered.
- **Qty = 0**: allowed (records a zero count, consistent with how delivery handles zero-qty items).
- **Item added twice**: impossible — once saved, the item appears in the completed doc and is excluded from `missingItems` on the next render (real-time via `onSnapshot`).
- **Auth state**: all handlers call `await auth.authStateReady()` before writing, consistent with existing handlers.
