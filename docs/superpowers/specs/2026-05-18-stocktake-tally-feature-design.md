# Stocktake Tally Feature — Design Spec

**Date:** 2026-05-18  
**Status:** Approved  
**Scope:** Feature 1 of 2 (Tally counting during stocktake)

---

## Problem

Staff count the same SKU in multiple areas of the kitchen (dry storage, back kitchen, fridge, etc.). Currently they must mentally total all instances before typing a single number. This leads to mental arithmetic errors and requires a separate tally app or paper.

---

## Solution

Add a green "+" button next to each item's count input in the stocktake screen. Tapping it opens a familiar bottom sheet where staff type how many they found in that batch. The qty is added to the running total. Repeat per area found. The existing number input remains editable for direct entry or corrections.

---

## UI Behaviour

### Count row (StocktakeContent)
- Each item row gains a green "+" button (44×44px, `#16A34A`, same border-radius as existing inputs) to the right of the count input field.
- The existing number input is unchanged — staff can still type a number directly.

### Add Qty bottom sheet
Opens when "+" is tapped. Contains:
- Item name as heading
- Unit label + number input (same style as admin adjustment sheet)
- Running total line: `Current total: X → Y` (current count + what they're about to add)
- **Cancel** button and **"+ Add N [unit]"** confirm button
- Confirm is disabled when input is empty or zero

### After confirm
- The item's `endCounts` value updates to `current + added`
- A small session-only tally log appears below the row (e.g. `+10  +6`) as green pills — purely local React state, not persisted to Firestore
- Tally log clears when the draft is saved or the page is reloaded

---

## Data & Persistence

- **No new Firestore fields.** The final accumulated count is written as a single `qty` value in the existing `StockAdjustment` (type: `"count"`) — same as today.
- The per-session tally log (`+10 / +6`) is local React state only. It is not saved anywhere. Its only purpose is in-session UX feedback.
- The existing `onCountChange(itemName, value)` callback is reused — the sheet just calls it with `String(currentCount + addedQty)`.

---

## Components Affected

| File | Change |
|------|--------|
| `src/app/stock/_components/StocktakeContent.tsx` | Add green "+" button per row; add tally log state |
| New: `src/app/stock/_components/TallyAddSheet.tsx` | Bottom sheet for qty entry (reuses sheet styling from existing modals) |

---

## Out of Scope

- No location tracking (locations are hidden in current UI)
- No per-tap +1 mode — always opens the sheet
- No Firestore schema changes
- No changes to the review sheet or save logic

---

## Success Criteria

- Staff can accumulate a count across multiple "+" taps without losing previous entries
- Direct number input still works as before
- The final saved count is identical in shape to today's stocktake submission
- No regression to the existing save / review / submit flow
