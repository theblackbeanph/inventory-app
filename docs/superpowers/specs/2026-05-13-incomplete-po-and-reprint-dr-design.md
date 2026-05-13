# Incomplete PO Indicators + Reprint DR

**Date:** 2026-05-13
**Scope:** branch-inventory app — `/orders` route (`src/app/transfers/`)

---

## Overview

Two related improvements to the Orders tab:

1. **Incomplete PO indicators** — when the commissary dispatches fewer items than ordered, the branch app should visually communicate the shortfall at both the card level and the item level.
2. **Reprint DR** — a button in the History tab's order detail sheet that regenerates the combined Delivery Receipt (dispatch + received quantities) using the same HTML/print pattern as the commissary app.

---

## Feature 1 — Incomplete PO Indicators

### Trigger condition

A delivery note is "incomplete" when any item has `dispatchedQty < requestedQty`. Computed once when the delivery note is loaded; no new Firestore reads required — both fields already exist on `DeliveryNoteItem`.

```ts
const isIncomplete = (dn: DeliveryNote) =>
  dn.items.some(i => i.dispatchedQty < i.requestedQty);

const fulfillmentPct = (dn: DeliveryNote) => {
  const total = dn.items.reduce((s, i) => s + i.requestedQty, 0);
  const sent  = dn.items.reduce((s, i) => s + i.dispatchedQty, 0);
  return total > 0 ? Math.round((sent / total) * 100) : 100;
};
```

### Order card (Active tab + History tab)

- Status badge row gains an orange `INCOMPLETE` pill when `isIncomplete` is true
- Item count subtitle changes from `"3 items"` to `"3 items · 86% fulfilled"` when incomplete

### Item list (inside Active order detail sheet)

- Fully fulfilled items: unchanged — `Dispatched: 30 pcs`
- Short-shipped items:
  - Show `Ordered: 35 → Dispatched: 30` (original qty muted, dispatched qty normal weight)
  - Orange `SHORT` label on that row

### History tab order detail

Same card-level indicators apply (`INCOMPLETE` pill + fulfillment %). Inside the detail sheet, item rows show the same ordered → dispatched display (read-only, no editing in History).

### Files to change

| File | Change |
|------|--------|
| `src/app/transfers/_components/OrdersContent.tsx` | Add `isIncomplete` / `fulfillmentPct` helpers; update Active card rendering, Active detail item rows, History card rendering, History detail item rows |

---

## Feature 2 — Reprint DR

### Trigger

"Reprint DR" button inside the **History tab** order detail sheet. Visible only when a `delivery_notes` doc exists for the order (`dn !== undefined`) and status is `RECEIVED` or `DISCREPANCY`.

### Output

Opens a new browser tab with formatted HTML, auto-triggers browser print dialog (same mechanism as `generateDispatchPDF` in the commissary app).

### DR layout

```
THE BLACK BEAN
Delivery Receipt
─────────────────────────────────────
PO# PO-26-YYMMDD-BF001 · DN# DN-26-YYMMDD-001
Branch: BF    Dispatched: 2026-05-13    Received: 2026-05-13
─────────────────────────────────────
Item            Ordered   Dispatched   Received   Status
CHICKEN           35 pcs    30 pcs      30 pcs    SHORT 5
EGGS              12 pcs    12 pcs      12 pcs    FULL
─────────────────────────────────────
Total: 2 items

Prepared by                 Received by
[dispatchedBy]                [receivedBy]
────────────                ────────────
Commissary                  Branch
```

- **SHORT** rows: item name and status in red
- **FULL** rows: status in green
- If `receivedQty` differs from `dispatchedQty` (discrepancy): add a fourth status value `DISCREPANCY (got X)` in red

### `generateBranchDR()` function

New utility placed in `src/app/transfers/_lib/print.ts` (new file).

```ts
export function generateBranchDR(params: {
  poRef: string;
  dnRef: string;
  branch: string;
  dispatchedAt: string;
  receivedAt: string;
  dispatchedBy: string;
  receivedBy: string;
  items: {
    item: string;
    requestedQty: number;
    dispatchedQty: number;
    receivedQty: number;
    unit: string;
  }[];
}): void
```

Opens `window.open("", "_blank")`, writes HTML, calls `win.print()` after 400ms — identical pattern to commissary's `generateDispatchPDF`.

### Data sources

All data is already available when the History detail sheet is open:

| Field | Source |
|-------|--------|
| `poRef`, `dnRef`, `branch`, `dispatchedAt`, `dispatchedBy` | `delivery_notes` doc |
| `items[].requestedQty`, `items[].dispatchedQty` | `delivery_notes` doc items |
| `receivedAt`, `receivedBy` | `delivery_notes` doc |
| `items[].receivedQty` | `delivery_notes.receivedItems[]` (matched by item name) |

### Files to change

| File | Change |
|------|--------|
| `src/app/transfers/_lib/print.ts` | New file — `generateBranchDR()` |
| `src/app/transfers/_components/OrdersContent.tsx` | Import and call `generateBranchDR`; add "Reprint DR" button in History detail sheet |

---

## Out of Scope

- Push/banner notifications when a partial delivery arrives
- PDF file download (browser print dialog is sufficient)
- Changes to Firestore schema (all required fields already exist)
- Changes to the commissary app
