# Stocktake UI Redesign — Design Spec
**Date:** 2026-05-01  
**Status:** Approved

---

## Overview

Three changes to the Stocktake tab:

1. Replace per-location progress pills with a single "Pending Stocktake" banner + a review sheet
2. Add a date picker (yesterday / today) so staff can submit a stocktake the following day
3. Delete the "Grilled Cheese" catalog entry (consolidated into Tomato Soup)

---

## 1. UI Components

### Date Picker

- Rendered at the very top of the Stocktake tab content area (below the category filter pills)
- Two pill buttons: **Yesterday (YYYY-MM-DD)** and **Today (YYYY-MM-DD)**
- Default: today (`businessDatePHT()`)
- If `endCounts` is empty when the user taps the other date, switch immediately
- If `endCounts` is non-empty, show the **date-change warning sheet** before switching

**Date-change warning sheet** — bottom sheet overlay:
- Title: "Change date to [new date]?"
- Body: "You have X unsaved counts for [current date]. Switching dates will clear them."
- Buttons: "Keep [current date]" (dismiss) · "Clear & Switch" (clear `endCounts`, set new date)

### Pending Stocktake Banner

- Rendered below the date picker, above the item list
- Amber background (`#FFF7ED` / `#FED7AA` border) when counts exist
- Text: "⏳ Pending Stocktake" + subtitle "X of Y items counted · tap to review"
- When no counts: show a neutral grey "No stocktake started" state (non-tappable)
- Tapping opens the **Stocktake Review Sheet**

### Bottom Bar

Two buttons, always visible:
- **Save** — secondary (white, bordered). Saves a draft for the active location filter to Firestore. Disabled when the category filter is set to "All" (no specific location selected). Same behavior as the old "Save [Location]" button, just relabeled.
- **Submit (N)** — primary (black). Opens the Stocktake Review Sheet. Disabled (greyed) when N = 0.

Both the banner tap and the Submit button open the same Review Sheet.

### Stocktake Review Sheet (replaces `SubmitAllModal`)

Renamed file: `StocktakeReviewSheet.tsx`

**Header:**
- Title: "Stocktake Review"
- Subtitle: "[stocktakeDate] · N items counted"
- ✕ close button (closes sheet, no changes)
- Location progress pills removed from here

**Item list:**
- Each row: item name, pack size, expected qty, counted qty, variance (coloured: green ✓ / amber + / red −)
- **Recount** button per row: clears that item from `endCounts` and closes the review sheet so the user can re-enter the value inline in the list

**Bottom buttons (sticky):**
- **Continue Stocktake** — closes the sheet
- **Submit** — fires `handleSubmitAll`

---

## 2. Data Flow — `page.tsx`

### New state

```ts
const [stocktakeDate, setStocktakeDate] = useState(businessDatePHT);
const [pendingDate, setPendingDate] = useState<string | null>(null);   // date awaiting confirmation
const [showDateWarning, setShowDateWarning] = useState(false);
// Separate state for stocktake tab's Firestore data
const [stocktakeAdjustments, setStocktakeAdjustments] = useState<StockAdjustment[]>([]);
const [stocktakeBeginnings, setStocktakeBeginnings] = useState<Record<string, number>>({});
const [stocktakeDayClose, setStocktakeDayClose] = useState<DailyClose | null>(null);
```

### New `useEffect`

A second `useEffect` keyed on `[branch, department, stocktakeDate]` subscribes to:
- `adjustments` where `date == stocktakeDate` → `stocktakeAdjustments`
- `dailyBeginning` where `date == stocktakeDate` → `stocktakeBeginnings`
- `dailyClose` where `date == stocktakeDate` → `stocktakeDayClose`
- `stocktakeDrafts` where `date == stocktakeDate` → `drafts` (moves here from the current single `useEffect`)

The existing `useEffect` retains subscriptions for the daily tab (`adjustments`, `beginnings`, `dayClose` all keyed to `businessDatePHT()` at mount, unchanged).

### Derived state

```ts
const stocktakeMetrics = useMemo(
  () => computeMetrics(deptCatalog, stocktakeAdjustments, stocktakeBeginnings),
  [deptCatalog, stocktakeAdjustments, stocktakeBeginnings]
);
```

`stocktakeMetrics` replaces `dailyMetrics` everywhere it's used in the Stocktake tab and in `handleSubmitAll`.

### Write functions

- `handleSaveLocation` uses `stocktakeDate` (not `today`)
- `handleSubmitAll` uses `stocktakeDate` for all writes: adjustments, branchStock, dailyClose, dailyBeginning (tomorrow = `addDays(stocktakeDate, 1)`)
- Locked check: `stocktakeDayClose?.isLocked` (not `dayClose?.isLocked`)

### Date change handler

```ts
function handleStocktakeDateChange(newDate: string) {
  if (Object.values(endCounts).some(v => v !== "")) {
    // show warning sheet
    setPendingDate(newDate);
    setShowDateWarning(true);
  } else {
    setStocktakeDate(newDate);
    draftsInitRef.current = false; // allow draft re-hydration for new date
  }
}

function confirmDateSwitch() {
  setEndCounts({});
  setStocktakeDate(pendingDate);
  draftsInitRef.current = false;
  setShowDateWarning(false);
}
```

---

## 3. Catalog Change

**Delete** from `src/lib/items.ts`:

```ts
{ name: "Grilled Cheese", category: "packed", unit: "pc", reorderAt: 3, packSize: "1 pc", department: "kitchen", location: "front_kitchen" },
```

No Firestore cleanup required. Historical documents referencing this item are unaffected.

---

## Files Changed

| File | Change |
|---|---|
| `src/app/stock/page.tsx` | Add `stocktakeDate` state + second `useEffect`, new `stocktakeMetrics`, update write functions, pass new props |
| `src/app/stock/_components/StocktakeContent.tsx` | Replace pills with date picker + banner, update bottom bar |
| `src/app/stock/_components/SubmitAllModal.tsx` | Rename → `StocktakeReviewSheet.tsx`, update header, Recount behavior, bottom buttons |
| `src/lib/items.ts` | Delete Grilled Cheese entry |

---

## Out of Scope

- No changes to the Daily tab
- No changes to how drafts are structured in Firestore
- No historical data cleanup for Grilled Cheese
- No multi-day date range (only yesterday / today)
