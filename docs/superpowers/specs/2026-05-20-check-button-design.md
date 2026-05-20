# Check Button — Active Order Detail

**Date:** 2026-05-20  
**Status:** Approved

## Problem

Branch staff currently rely on a printed delivery receipt to physically check off items as they verify incoming stock. This feature replaces that paper reference with a per-item checkbox in the app's active order detail view.

## Scope

Single file change: `src/app/transfers/_components/OrdersContent.tsx`  
Affected component: `ActiveDetail`

## Design

### Checkbox placement

A checkbox sits at the far left of each item row, before the item name. Tapping it toggles the checked state for that item. Tapping again unchecks it.

### Visual states

| State | Row background | Left border | Checkbox | Qty controls |
|---|---|---|---|---|
| Unchecked | `#FFF` | transparent | Empty, `#D1D5DB` border | Full opacity |
| Checked, no discrepancy | `#F0FDF4` | `#059669` | Filled green with white checkmark | Dimmed (`opacity: 0.45`) |
| Checked, with discrepancy | `#FFF5F5` | `#DC2626` (red stays dominant) | Filled green with white checkmark | Full opacity (still needs attention) |

The red discrepancy border takes visual precedence over the green checked state so staff don't miss items that need attention.

### Progress counter

A small row between the info banner and the item list shows "X of Y" checked:

```
Items checked     2 of 4
```

Rendered as a white card (same shadow as item rows). Updates live as items are checked.

Only shown when a delivery note exists (same gate as the item list).

### Confirm Receipt button

Not gated by check state. Staff can confirm receipt at any time regardless of how many items are checked. Checking is a reference aid, not a workflow gate.

### State management

- `checkedItems: Set<string>` — React `useState`, keyed by item name
- Initialized as empty `Set` when the delivery note loads
- Resets to empty if the user navigates away and returns (local state only — no Firestore writes)

## What is not changing

- The qty +/− controls and discrepancy detection logic are unchanged
- The `confirmReceipt` function and Firestore write are unchanged
- No new Firestore fields or collections
- No changes to `PullOut`, `DeliveryNote`, or any type definitions
