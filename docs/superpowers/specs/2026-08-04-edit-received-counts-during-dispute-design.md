# Edit Received Counts During Dispute — Design

**Date**: 2026-08-04
**Status**: Design approved, pending spec review
**Scope**: `branch-inventory` app only. Commissary-side updates coordinated separately.

## Problem

When a branch confirms receipt with incorrect quantities, the pull-out moves to `DISCREPANCY` and a dispute is filed. From that point, `DiscrepancyDetail` (`src/app/transfers/_components/OrdersContent.tsx`) offers only one action: **Cancel Dispute — Accept Dispatched Quantities**, which auto-receives the order at the commissary's dispatched values.

There is no path to edit the branch's `receivedItems` mid-dispute. On 2026-08-03 the team filed a dispute because of a miskey on one item, then tapped Cancel Dispute expecting to correct the count — instead the order was auto-received at dispatched values and closed. Recovery required a manual stock adjustment.

## Goal

Give the branch a way to correct their `receivedItems` while a dispute is still under commissary review, without abandoning or falsely resolving the dispute.

## Non-Goals

- Editing after commissary has entered a counter (`DISPUTED`) or after superadmin has bounced it back (`SENT_BACK`). Those states carry a formal counter-proposal from the commissary side; letting the branch silently mutate the underlying receivedItems invalidates it.
- Post-hoc correction on `DONE` / `RECEIVED` / `RESOLVED` orders. Those already have tap-to-correct alternatives at the stock-page level.
- Changes to Cancel Dispute — it remains the "accept dispatched quantities" escape hatch.
- Any commissary-side UI or logic change. Chris is coordinating that separately.

## State Machine

Trigger: `PullOut.status === "DISCREPANCY"` only.

Two end-states from the Edit action:

- **Fully matched after edit** (all `receivedQty === dispatchedQty`): PO → `DONE`, DN → `RECEIVED`. Same terminal state as Cancel Dispute today, reached via an explicit summary confirm. Dispute effectively self-resolves.
- **Still discrepant after edit**: PO stays `DISCREPANCY`, DN's `receivedItems` updated in place. Commissary's onSnapshot picks up the fresh numbers when they open the review modal.

No other status transitions are added or changed.

## UI

### `DiscrepancyDetail` footer

Two buttons stacked, new one on top:

- **Primary (new)**: `"Edit Received Counts"` — solid dark background (matches other primary CTAs in the app), reuses existing button height/padding.
- **Secondary (existing)**: `"Cancel Dispute — Accept Dispatched Quantities"` — unchanged outline style.

### Discoverability nudge

The existing amber "Dispute filed — commissary is reviewing" banner in `DiscrepancyDetail` is extended:

> Dispute filed — commissary is reviewing. **You can edit your counts if this was filed by mistake.**

No tooltip, no separate onboarding.

### `EditReceiveView`

Tapping "Edit Received Counts" swaps `DiscrepancyDetail` for a new `EditReceiveView` (rendered within the same `OrdersContent` view state machine, e.g. `view === "edit-dispute"`).

- **Header**: PO ref + amber `"Editing during dispute"` tag; back arrow returns to `DiscrepancyDetail` without writing anything.
- **Body**: reuses the shared qty-adjuster (see Component Reuse below), pre-filled with each item's current `receivedQty` from the DN.
- **Per-item hint**: when a row's value changes to match `dispatchedQty`, show a small green `"✓ Now matches dispatched (was N)"` line beneath the item name.
- **Footer**: single **"Confirm Receipt"** button (green, primary).

### Review overlay

Tapping "Confirm Receipt" opens the same `showReview` overlay pattern used by `ActiveDetail`:

- **Green header** if all items now match dispatched: `"✓ All items match dispatched — Dispute will be resolved on submit"`
- **Red header** if still discrepant: `"⚠ Still has discrepancy — Commissary will see the updated numbers"`
- **Item list**: each item's final `receivedQty`; items whose value changed since the last save show a small `"Corrected: OLD → NEW"` line in green.
- **Footer**: `Back` (returns to the editor) and `Submit` (commits the batch).

## Data Model

### `deliveryNotes` doc — new fields

```ts
{
  // ...existing fields
  receivedItemsEditedAt?: number;   // epoch ms of most recent edit
  receivedItemsEditedBy?: string;   // displayName or branch label
  receivedItemsEditCount?: number;  // increments each edit, starts at 1
}
```

These fields are only written by the new edit flow. Absence = never edited (default read state).

### No new collections

No `dispute_edit_history` doc. If the same order is edited multiple times, only the latest values are retained; the `receivedItemsEditCount` tells commissary how many revisions happened.

## Firestore Writes

Both submit paths use a single `writeBatch`.

### Path 1: Fully matched (all `receivedQty === dispatchedQty`)

Mirrors the current `cancelDispute` writes exactly, with additional edit-tracking fields on the DN and different note strings.

- For each DN item: `invEntries` out-entry at `dispatchedQty` with note `"Transfer to {branch} · {poRef} · branch edited counts during dispute"`.
- For each item whose `receivedQty` changed from the pre-edit value: `branch_adjustments` in/out doc with `note: "Dispute edit · {po.poRef}"` and `branchStock` `increment(delta)` write.
- `deliveryNotes/{dn.id}`:
  - `status: "RECEIVED"`
  - `receivedItems: [<final values, all matching dispatched>]`
  - `receivedItemsEditedAt: Date.now()`
  - `receivedItemsEditedBy: <loggedBy>`
  - `receivedItemsEditCount: (existing || 0) + 1`
- `pullOuts/{po.id}`: `status: "DONE"`, `commissaryInvWritten: true`
- On commit: `onUpdated({ ...po, status: "DONE" })`, then `onBack()`.

### Path 2: Still discrepant

- For each item whose `receivedQty` changed: `branch_adjustments` in/out doc with `note: "Dispute edit · {po.poRef}"` and `branchStock` `increment(delta)` write.
  - Rationale: the branch's stock should reflect their newly-declared received qty, same as it did for the original receive.
- `deliveryNotes/{dn.id}`:
  - `receivedItems: [<final values>]`
  - `receivedItemsEditedAt: Date.now()`
  - `receivedItemsEditedBy: <loggedBy>`
  - `receivedItemsEditCount: (existing || 0) + 1`
  - `status` unchanged (stays whatever it was, typically `"DISCREPANCY"` on the DN side)
- `pullOuts/{po.id}`: no write (status stays `DISCREPANCY`).
- No `invEntries` writes — commissary's ledger already reflects the original dispatch; nothing on the commissary side is settled yet.
- On commit: navigate back to `DiscrepancyDetail` with the fresh numbers shown.

### Firestore rules

The DN update fields (`receivedItemsEditedAt`, `receivedItemsEditedBy`, `receivedItemsEditCount`) are additive on an already-writable doc; existing rules that allow branch users to update `deliveryNotes` and `receivedItems` cover them without change. `pullOuts`, `branch_adjustments`, `branch_stock`, and `invEntries` writes reuse the exact patterns from `cancelDispute` — no rule changes needed.

## Component Reuse

Extract a shared `<ReceiveEditor>` component from `ActiveDetail`.

- **What moves in**: the per-item qty-adjuster rows and the `showReview` summary overlay.
- **Props**: `items`, `dnItems` (dispatched reference), `initialReceivedItems`, `submitLabel`, `onSubmit(finalReceivedItems)`.
- **What stays out**: the write handlers themselves. `ActiveDetail` keeps its `confirmReceipt` function; the new `EditReceiveView` gets its own `editDuringDispute` function. Both are passed as `onSubmit`.
- **File**: `src/app/transfers/_components/ReceiveEditor.tsx` (new).

**Why extract vs. add a mode prop**: `OrdersContent.tsx` is already 900+ lines. A mode flag would fan out into every render branch and every write path. Extraction keeps each component's responsibility explicit — `ActiveDetail` handles first receive, `EditReceiveView` handles dispute-time edit, and the qty-adjuster UI is a single shared building block. It also makes the two write handlers easy to compare when future dispute-flow changes need parity between them.

**Scope of the extraction**: the refactor is limited to what's needed to add `EditReceiveView`. No other consolidation of `OrdersContent.tsx`. No test additions beyond what already exists.

## Audit Trail

Answered by the three DN fields above. `receivedItemsEditCount > 0` is the signal that this DN was revised during dispute; timestamp and editor identify when and by whom. If commissary or a superadmin ever needs to see the pre-edit values, they're still in the commissary's `invEntries` (from the original dispatch) and in the branch's `branch_adjustments` (each edit writes deltas). No dedicated history-viewer UI.

## Out of Scope / Deferred

- Displaying `receivedItemsEditCount` / `receivedItemsEditedBy` in the branch UI. (Commissary may want this in their review modal — Chris will handle.)
- Multi-editor conflict handling. If two branch users open the same DISCREPANCY order and both edit, the later Submit wins. Not worth solving until it happens.
- Undo. If the branch edits then wants to revert, they either edit again or (if they'd already fully resolved) file a new stock adjustment.

## Testing Notes

Manual test cases before shipping:

1. File a dispute with one item wrong; open the disputed order; tap Edit; correct the one item back to dispatched; submit → verify PO shows as Received, DN is RECEIVED, `branchStock` matches, one `branch_adjustments` doc exists with the delta.
2. Same as (1) but with two items wrong: edit one correctly, leave the other still discrepant, submit → verify PO stays DISCREPANCY, DN has updated receivedItems, `receivedItemsEditCount === 1`.
3. Edit an order, submit still-discrepant, then edit again → verify `receivedItemsEditCount === 2`, `receivedItemsEditedAt` updated, only the net delta from the second edit lands in `branch_adjustments`.
4. Confirm Cancel Dispute still works unchanged on a DISCREPANCY order.
5. Confirm no Edit button appears on DISPUTED, SENT_BACK, RESOLVED, or DONE orders.
