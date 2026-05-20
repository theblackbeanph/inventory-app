# Confirm Receipt Summary Screen

**Date:** 2026-05-20  
**Status:** Approved

## Problem

The existing "Confirm Receipt" button in `ActiveDetail` fires the Firestore write immediately on tap, with no review step. Staff need a chance to see a clean summary of what they're submitting before it becomes final.

## Scope

Single file change: `src/app/transfers/_components/OrdersContent.tsx`  
Affected component: `ActiveDetail`

## Design

### Trigger

Tapping "Confirm Receipt — All Good" or "Confirm Receipt with Discrepancy" opens the summary overlay. No Firestore write happens at this point.

### Summary overlay

A full-screen white overlay (same pattern as `NewOrderForm`'s `showReview` sheet — `position: fixed; inset: 0; z-index: 70; background: #fff; overflow-y: auto`).

**Header:** "Review & Confirm" title, no back arrow (Back button is in the bottom bar).

**Receipt card:** A rounded card with a colored header band:
- Green (`#059669`) when no discrepancies
- Red (`#DC2626`) when one or more discrepancies

Header band text:
- Line 1: "You are confirming receipt of"
- Line 2: `po.poRef` (bold)
- Line 3: `dn.dnRef · N items` (+ "· X discrepancy" if applicable)

**Item rows:** One row per `dn.items` entry, read-only (no qty controls).
- Normal item: item name left, received qty right
- Discrepancy item: light red background (`#FEF2F2`), red left border (`3px solid #DC2626`), item name + "Expected X · received Y" subtitle in red, received qty in red on the right

**Footer note inside card:**
- No discrepancies: green background, "✓ All quantities match dispatch"
- Discrepancies: red background, "Commissary will be notified of the discrepancy."

**Caption below card:** "Stock will be added to your inventory once submitted." (12px, `#9CA3AF`, centred)

### Bottom bar

Two buttons side by side:
- **Back** (flex: 1) — outline style, dismisses the overlay, returns to the editable detail view. No data changes.
- **Submit** (flex: 2) — filled, green or red matching the card header. Fires the existing `confirmReceipt()` function unchanged.

### State management

Add `showReview: boolean` to `ActiveDetail` via `useState(false)`.

- Existing "Confirm Receipt" button → sets `showReview(true)` instead of calling `confirmReceipt()`
- Back button → sets `showReview(false)`
- Submit button → calls `confirmReceipt()` (existing function, no changes)
- `loading` state during submit disables the Submit button and shows "Submitting…" label, same as today

## What is not changing

- `confirmReceipt()` function and all Firestore writes are unchanged
- The discrepancy detection logic (`hasDiscrepancy`, `itemsWithDiscrepancy`) is unchanged
- No new Firestore fields, collections, or type definitions
- The existing "Confirm Receipt" bottom bar (with discrepancy warning text) is preserved — the button just gets a new `onClick` that shows the overlay instead of submitting directly
