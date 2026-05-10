# Orders Tab Redesign — Branch Inventory App

**Date:** 2026-05-10  
**Status:** Approved  

## Problem

The current "Transfers" tab splits a single order lifecycle across two separate sub-tabs — Pull Outs and Deliveries. Branch staff must mentally track a pull-out request in one place, then switch to the Deliveries tab when the order arrives for receipt confirmation. This is friction that doesn't exist in the commissary app, where one unified "Orders" tab tracks each order from request to completion.

The goal is to make the branch app's Orders tab seamless with the commissary's: same tab name, same sub-tab structure (Pending / Active / History), same mental model.

## Design

### Page

- **Route:** `/transfers` (unchanged — no redirect needed)
- **Title:** "Orders" (was "Transfers")
- **BottomNav label:** "Orders" (was "Transfers")

### Sub-tabs

| Sub-tab | PO statuses shown | Badge |
|---|---|---|
| Pending | PENDING_REVIEW | count when > 0 |
| Active | DISPATCHED | count when > 0 |
| History | RECEIVED, DONE, CANCELLED, REJECTED, DISCREPANCY, DISPUTED | none |

### Data architecture

`OrdersPage` (page.tsx) owns both Firestore `onSnapshot` listeners:
- `pull_outs` filtered by `branch == session.branch`
- `delivery_notes` filtered by `branch == session.branch`

Both arrays are passed as props to `OrdersContent`. This matches the commissary's pattern (App.tsx → OrdersTab) and eliminates any render-before-data race between the two collections.

### Card designs

**Pending card**
- Left border: amber
- Shows: PO ref (bold), branch · date · item count
- Badge: PENDING REVIEW (amber)
- Tap → PendingDetail: items list + Cancel Request button

**Active card**
- Left border: blue
- Shows: PO ref (bold), branch · date · item count
- DN ref shown inline below the PO ref (if DN not yet found, show "Awaiting delivery note…" — graceful fallback for the brief window between PO status flip and DN creation)
- Sub-line: "Tap to confirm receipt →"
- Badge: DISPATCHED (blue)
- Tap → ActiveDetail: receipt confirmation flow (qty inputs per item, Confirm Receipt button). If DN not yet available, show a loading state instead of the confirmation form.

**History card**
- Left border: green (RECEIVED/DONE), gray (CANCELLED/REJECTED), amber (DISCREPANCY), purple (DISPUTED)
- Shows: PO ref, branch · date, DN ref if present
- Badge: actual terminal status
- DISCREPANCY / DISPUTED cards show a note: "Discrepancy on file — place a new order if needed"
- Tap → HistoryDetail: read-only view of order and outcome

### Detail views

**PendingDetail** (same logic as current PullOutDetail)
- Items list with qty and unit
- Cancel Request button — sets status to CANCELLED
- Only shown when status is PENDING_REVIEW

**ActiveDetail** (same logic as current DeliveryDetail)
- Items list with dispatched qty (from DN) and editable received qty inputs
- Discrepancy warning if any qty differs
- Confirm Receipt button — atomic batch write:
  - `delivery_notes/{dnId}` → status: RECEIVED or DISCREPANCY, receivedItems, receivedAt, receivedBy
  - `pull_outs/{poId}` → status: RECEIVED or DISCREPANCY

**HistoryDetail**
- Read-only items list
- Shows dispatched vs received quantities if DN exists
- No actions

### New order form

Same as current NewManualPullOut — item search, qty stepper, notes field, Submit button. FAB (+) shown on Pending and Active sub-tabs only (not History).

### Discrepancy / Disputed handling

Branch is passive. These statuses land in History. The card surface shows a note directing them to place a new order if replacement is needed. No branch-side action required.

## File changes

### Modified
- `src/app/transfers/page.tsx` — lifts both onSnapshot listeners, passes props to OrdersContent, updates title and sub-tabs to Pending / Active / History
- `src/components/BottomNav.tsx` — label "Transfers" → "Orders"

### New
- `src/app/transfers/_components/OrdersContent.tsx` — unified render component receiving `pullOuts[]` and `deliveryNotes[]` as props; contains PendingDetail, ActiveDetail, HistoryDetail, NewOrder form

### Deleted
- `src/app/transfers/_components/PullOutsContent.tsx`
- `src/app/transfers/_components/DeliveriesContent.tsx`

## Out of scope

- Route rename (`/transfers` stays)
- Any changes to Firestore data model or security rules
- Role-gating (all authenticated users see all orders for their branch)
- Commissary-side changes
