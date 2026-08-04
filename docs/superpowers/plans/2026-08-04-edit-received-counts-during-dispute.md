# Edit Received Counts During Dispute — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give branches a way to correct `receivedItems` on a `DISCREPANCY` order without abandoning the dispute — a new "Edit Received Counts" button on `DiscrepancyDetail` that opens a re-editable receive view.

**Architecture:** Extract the qty-adjuster + review overlay from `ActiveDetail` into a shared `<ReceiveEditor>` component; add a new `EditReceiveView` that reuses it with different chrome and a new Firestore write path. Two end-states: fully matched → same terminal state as Cancel Dispute (PO=DONE, DN=RECEIVED); still discrepant → DN's `receivedItems` updated in place while PO stays `DISCREPANCY`.

**Tech Stack:** Next.js App Router (v16, breaking changes — read `node_modules/next/dist/docs/` before writing Next-specific code), React, TypeScript, Firebase Web SDK (client-side `writeBatch`, `increment`).

## Global Constraints

- All Firestore writes must `await auth.authStateReady()` first (per `CLAUDE.md`).
- `branchStock` updates use `FieldValue.increment(delta)`; never plain `{ qty: delta }` with merge.
- `branch_adjustments` docs use `doc(collection(db, COLS.adjustments))` for auto-ID.
- `invEntries` writes on the fully-matched path mirror `cancelDispute` exactly: doc ID = `String(Date.now() + i)`, one per DN item at `dispatchedQty`.
- DN field names (locked in the design spec; commissary agent depends on them): `receivedItemsEditedAt: number`, `receivedItemsEditedBy: string`, `receivedItemsEditCount: number`.
- No Firestore rules changes; no changes to `pull_outs` writes outside the two Path definitions in this plan.
- No unit tests exist in `src/app/transfers/` — manual verification per the "Testing" step at the end. Type-check + lint are the automated gates.
- Commit after each task. Do not squash across tasks.

## File Structure

- **Create:** `src/app/transfers/_components/ReceiveEditor.tsx` — shared qty-adjuster + review overlay component
- **Modify:** `src/app/transfers/_components/OrdersContent.tsx` — refactor `ActiveDetail` to use `<ReceiveEditor>`; add `EditReceiveView`; add Edit button to `DiscrepancyDetail`; extend the amber banner text
- **Modify:** `src/lib/types.ts` — add three optional fields to `DeliveryNote`

---

## Task 1: Extract `<ReceiveEditor>` and refactor `ActiveDetail` to use it

Pure refactor. No user-visible behavior change. Reviewer gate: app still receives orders normally, all existing flows unchanged.

**Files:**
- Create: `src/app/transfers/_components/ReceiveEditor.tsx`
- Modify: `src/app/transfers/_components/OrdersContent.tsx` (`ActiveDetail`, lines 327–605)

**Interfaces:**
- Consumes: (nothing from other tasks)
- Produces: the following exported component signature that Task 2 relies on:
  ```ts
  export type ReceiveEditorProps = {
    dn: DeliveryNote;
    initialReceivedQtys: Record<string, number>;
    showCheckUX: boolean;
    infoBanner?: React.ReactNode;
    submitLabel: (hasDiscrepancy: boolean) => string;
    submitColor?: (hasDiscrepancy: boolean) => string; // defaults to red/green
    reviewTitle?: string; // defaults to "Review & Confirm"
    reviewHeaderText: (hasDiscrepancy: boolean) => { headline: string };
    reviewFooterNote: (hasDiscrepancy: boolean) => string;
    onSubmit: (receivedItems: ReceivedItem[]) => Promise<{ error?: string } | void>;
    poRef: string; // for review overlay display
  };
  export function ReceiveEditor(props: ReceiveEditorProps): React.ReactElement;
  ```

- [ ] **Step 1: Create the `ReceiveEditor.tsx` file with the extracted component**

Copy the qty-adjuster row rendering (currently `OrdersContent.tsx:436–497`), the sticky footer with the primary button (`502–516`), and the review overlay (`518–602`) into a new component. The component owns its own state:

- `receivedQtys` — initialized from `initialReceivedQtys`, re-syncs on `dn.id` change (like `ActiveDetail` does today at lines 337–341)
- `checkedItems` — a `Set<string>`, only used when `showCheckUX === true`
- `showReview` — boolean for overlay visibility
- `loading` / `error` — local state for the submit call

The `qtyBtnStyle` used at lines 481 and 491 lives in `OrdersContent.tsx` (grep for `qtyBtnStyle` to find its declaration). Duplicate it into `ReceiveEditor.tsx` (do not export it from `OrdersContent.tsx` — style objects like this are cheap; duplication is clearer than a cross-file dependency).

The submit handler wraps the parent's `onSubmit`:

```tsx
async function handleSubmit() {
  setLoading(true);
  setError("");
  const receivedItems: ReceivedItem[] = dn.items.map(i => ({
    item:          i.item,
    dispatchedQty: i.dispatchedQty,
    receivedQty:   receivedQtys[i.item] ?? i.dispatchedQty,
    unit:          i.unit,
  }));
  const result = await props.onSubmit(receivedItems);
  if (result && "error" in result && result.error) {
    setError(result.error);
    setLoading(false);
    return;
  }
  // parent has navigated away on success; no need to reset loading
}
```

The `hasDiscrepancy` computation stays: `dn.items.some(i => (receivedQtys[i.item] ?? i.dispatchedQty) !== i.dispatchedQty)`.

The review overlay header uses `reviewHeaderText(hasDiscrepancy)` for the "You are confirming receipt of" line and the subline; keep the PO ref rendering (`props.poRef`) and the item-count line unchanged. The colored header bar's background stays red on discrepancy, green otherwise, unless `submitColor` is provided (Task 2 will pass a different color scheme for the edit view).

Do NOT include the outer page chrome (the sticky header with back arrow + PO ref + status badge at lines 407–414). That stays in each caller — the extracted component is body + footer + overlay only.

- [ ] **Step 2: Refactor `ActiveDetail` to use `<ReceiveEditor>`**

Delete the qty state, adjuster rows, sticky footer button, and review overlay from `ActiveDetail`. The `confirmReceipt` function stays, but restructure it to take a `receivedItems: ReceivedItem[]` parameter (delivered by `<ReceiveEditor>`) instead of reading from local `receivedQtys`:

```tsx
async function confirmReceipt(receivedItems: ReceivedItem[]): Promise<{ error?: string } | void> {
  if (!dn) return;
  try {
    await auth.authStateReady();
    const receivedBy = auth.currentUser?.displayName || BRANCH_LABELS[branch];
    const receivedAt = todayPHT();
    const hasDiscrepancy = receivedItems.some(ri => ri.receivedQty !== ri.dispatchedQty);
    const newStatus = hasDiscrepancy ? "DISCREPANCY" : "RECEIVED";
    const batch = writeBatch(db);
    batch.update(doc(db, COLS.deliveryNotes, dn.id), { status: newStatus, receivedItems, receivedAt, receivedBy });
    batch.update(doc(db, COLS.pullOuts, po.id), { status: newStatus });

    for (const ri of receivedItems) {
      const catalogItem = CATALOG_MAP.get(ri.item);
      if (!catalogItem || ri.receivedQty <= 0) continue;
      const dept = catalogItem.department;
      const qty  = ri.receivedQty * (catalogItem.orderUnitSize ?? 1);
      batch.set(
        doc(db, COLS.branchStock, stockDocId(branch, dept, ri.item)),
        { qty: increment(qty), lastUpdated: receivedAt, lastUpdatedBy: receivedBy },
        { merge: true },
      );
      const adjRef = doc(collection(db, COLS.adjustments));
      batch.set(adjRef, {
        id: adjRef.id, branch, department: dept, date: receivedAt,
        item: ri.item, type: "in", qty, loggedBy: receivedBy,
        note: "commissary transfer",
      });
    }

    await batch.commit();
    onUpdated({ ...po, status: newStatus as PullOut["status"] });
    onBack();
  } catch {
    return { error: "Failed to confirm receipt. Try again." };
  }
}
```

The new `ActiveDetail` render is roughly:

```tsx
return (
  <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 100px)" }}>
    {/* keep the existing sticky header at lines 407–414 unchanged */}
    <StickyHeader po={po} dn={dn} onBack={onBack} />

    {!dn ? (
      <div style={{ padding: "12px 16px" }}>
        <div style={{ background: "#EFF6FF", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#1D4ED8" }}>
          Delivery note not yet available. Check back shortly.
        </div>
      </div>
    ) : (
      <ReceiveEditor
        dn={dn}
        poRef={po.poRef}
        initialReceivedQtys={Object.fromEntries(dn.items.map(i => [i.item, i.dispatchedQty]))}
        showCheckUX={true}
        infoBanner={
          <div style={{ background: "#EFF6FF", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#1D4ED8" }}>
            Verify each quantity received. Adjust if the actual count differs.
          </div>
        }
        submitLabel={hasDisc => hasDisc ? "Confirm Receipt with Discrepancy" : "Confirm Receipt — All Good"}
        reviewHeaderText={hasDisc => ({ headline: "You are confirming receipt of" })}
        reviewFooterNote={hasDisc => hasDisc ? "Commissary will be notified of the discrepancy." : "✓ All quantities match dispatch"}
        onSubmit={confirmReceipt}
      />
    )}
  </div>
);
```

Inline the `StickyHeader` — don't extract it into its own component; just leave that JSX block inline in each caller (`ActiveDetail`, `EditReceiveView`, and unchanged in `DiscrepancyDetail` / `HistoryDetail`). Extraction of the header is not in scope.

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npx next lint`

Expected: no errors. If there are errors, fix them in-place before proceeding.

- [ ] **Step 4: Manual smoke test — receive an order (all matched)**

In the local dev server:
1. Log in as a branch user.
2. Open an `DISPATCHED` order from the Active tab.
3. Verify item rows render with check boxes and +/-/input controls exactly as before.
4. Leave all quantities at dispatched, tap Confirm Receipt — All Good.
5. Verify the review overlay opens with a green header and the correct item list.
6. Tap Submit. Verify order moves to History as "Received".

- [ ] **Step 5: Manual smoke test — receive an order (with discrepancy)**

Same as Step 4 but change one item's received qty to a lower number before tapping the primary button:
1. Verify the primary button text switches to "Confirm Receipt with Discrepancy" and turns red.
2. Verify the row shows red border and red qty input styling.
3. Tap → verify review overlay has red header.
4. Submit → verify order moves to Active tab with `DISCREPANCY` status and the DN's `receivedItems` reflect the entered qty.

- [ ] **Step 6: Commit**

```bash
git add src/app/transfers/_components/ReceiveEditor.tsx src/app/transfers/_components/OrdersContent.tsx
git commit -m "refactor(transfers): extract ReceiveEditor from ActiveDetail

Pure refactor. ActiveDetail now composes the shared ReceiveEditor
component; qty adjuster rows, sticky footer, and review overlay are
moved into src/app/transfers/_components/ReceiveEditor.tsx with no
behavior changes. Sets up Task 2's EditReceiveView to reuse the same
primitive.
"
```

---

## Task 2: Add DN type fields, `EditReceiveView`, and wire from `DiscrepancyDetail`

Feature landing. Adds the "Edit Received Counts" button, the new view, the write handlers for both end-states, and the audit fields on the DN doc.

**Files:**
- Modify: `src/lib/types.ts` (extend `DeliveryNote` interface, ~line 160–173)
- Modify: `src/app/transfers/_components/OrdersContent.tsx`:
  - `DiscrepancyDetail` (starts line 609)
  - Add new `EditReceiveView` component
  - Add `"edit-dispute"` to the view state machine at the top of `OrdersContent` (search for `useState<"list"` to find the view state declaration)

**Interfaces:**
- Consumes: `<ReceiveEditor>` from Task 1 with the props signature listed there.
- Produces: (terminal — no downstream tasks)

- [ ] **Step 1: Add DN audit fields to the type**

Edit `src/lib/types.ts` — extend `DeliveryNote` with three optional fields. Update the comment above to note branch-only writes:

```ts
// Matches commissary's DeliveryNote exactly (commissary creates, branch reads + updates).
// Fields written by branch during dispute-edit flow: receivedItemsEdited{At,By,Count}.
export interface DeliveryNote {
  id: string;
  dnRef: string;
  poRef: string;
  pullOutId: string;
  branch: string;
  dispatchedAt: string;
  dispatchedBy: string;
  items: DeliveryNoteItem[];
  status: DeliveryNoteStatus;
  receivedItems?: ReceivedItem[];
  receivedAt?: string;
  receivedBy?: string;
  receivedItemsEditedAt?: number;
  receivedItemsEditedBy?: string;
  receivedItemsEditCount?: number;
}
```

- [ ] **Step 2: Add the `EditReceiveView` component**

Insert a new component in `OrdersContent.tsx` immediately after `DiscrepancyDetail` (before `HistoryDetail`). Skeleton:

```tsx
function EditReceiveView({ po, dn, branch, onBack, onUpdated }: {
  po: PullOut;
  dn: DeliveryNote;
  branch: Branch;
  onBack: () => void;
  onUpdated: (po: PullOut) => void;
}) {
  // Pre-fill from current receivedItems; fall back to dispatchedQty if a row is missing.
  const initialReceivedQtys = Object.fromEntries(
    dn.items.map(i => {
      const ri = dn.receivedItems?.find(r => r.item === i.item);
      return [i.item, ri?.receivedQty ?? i.dispatchedQty];
    }),
  );

  async function submitEdit(receivedItems: ReceivedItem[]): Promise<{ error?: string } | void> {
    try {
      await auth.authStateReady();
      const loggedBy = auth.currentUser?.displayName || BRANCH_LABELS[branch];
      const today   = todayPHT();
      const now     = Date.now();
      const poRef   = `${po.poRef} · ${dn.dnRef}`;
      const batch   = writeBatch(db);

      const fullyMatched = receivedItems.every(ri => ri.receivedQty === ri.dispatchedQty);
      const priorReceived: Record<string, number> = Object.fromEntries(
        (dn.receivedItems ?? []).map(ri => [ri.item, ri.receivedQty]),
      );

      if (fullyMatched) {
        // Path 1 — full resolution. Mirrors cancelDispute writes with edit-tracking fields.
        dn.items.forEach((it, i) => {
          batch.set(doc(db, COLS.invEntries, String(now + i)), {
            id: now + i, date: today, item: it.item, type: "out",
            qty: it.dispatchedQty,
            note: `Transfer to ${po.branch} · ${poRef} · branch edited counts during dispute`,
            loggedBy, poRef: po.poRef,
          });
        });
      }

      // Both paths: write branch_adjustments + branchStock deltas for items whose received qty CHANGED
      // from the prior stored value. Delta is (new - prior). Positive delta = "in", negative = "out".
      receivedItems.forEach(ri => {
        const prior = priorReceived[ri.item] ?? ri.dispatchedQty;
        const delta = ri.receivedQty - prior;
        if (delta === 0) return;
        const adjRef = doc(collection(db, COLS.adjustments));
        batch.set(adjRef, {
          id: adjRef.id, branch, department: "kitchen", date: today,
          item: ri.item, type: delta > 0 ? "in" : "out", qty: Math.abs(delta),
          loggedBy, note: `Dispute edit · ${po.poRef}`,
        });
        const catalogItem = CATALOG_MAP.get(ri.item);
        if (catalogItem) {
          batch.set(
            doc(db, COLS.branchStock, `${branch}_${catalogItem.department}_${ri.item}`),
            { qty: increment(delta), lastUpdated: today, lastUpdatedBy: loggedBy },
            { merge: true },
          );
        }
      });

      const dnUpdate: Partial<DeliveryNote> = {
        receivedItems,
        receivedItemsEditedAt: now,
        receivedItemsEditedBy: loggedBy,
        receivedItemsEditCount: (dn.receivedItemsEditCount ?? 0) + 1,
      };
      if (fullyMatched) {
        dnUpdate.status = "RECEIVED";
      }
      batch.update(doc(db, COLS.deliveryNotes, dn.id), dnUpdate);

      if (fullyMatched) {
        batch.update(doc(db, COLS.pullOuts, po.id), { status: "DONE", commissaryInvWritten: true });
      }

      await batch.commit();

      if (fullyMatched) {
        onUpdated({ ...po, status: "DONE" as PullOut["status"] });
        onBack(); // navigates back to list
      } else {
        // Return to DiscrepancyDetail with fresh numbers (parent's onSnapshot handles the DN update).
        onBack();
      }
    } catch {
      return { error: "Failed to save changes. Try again." };
    }
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 100px)" }}>
      <div style={{ background: "#FFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-secondary)", fontSize: 20 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{po.poRef}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Editing during dispute</div>
        </div>
        <span style={{ background: "#FEF3C7", color: "#D97706", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>EDITING</span>
      </div>

      <ReceiveEditor
        dn={dn}
        poRef={po.poRef}
        initialReceivedQtys={initialReceivedQtys}
        showCheckUX={false}
        infoBanner={
          <div style={{ background: "#FEF3C7", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#D97706" }}>
            Adjust any quantity that was recorded incorrectly. If everything matches dispatched on submit, the dispute is resolved automatically.
          </div>
        }
        submitLabel={hasDisc => hasDisc ? "Save Edited Counts (still discrepant)" : "Confirm Receipt — All Matched"}
        reviewHeaderText={hasDisc => hasDisc
          ? { headline: "Still has discrepancy — commissary will see the updated numbers" }
          : { headline: "All items match dispatched — dispute will be resolved on submit" }
        }
        reviewFooterNote={hasDisc => hasDisc
          ? "Commissary's review will refresh with your new counts."
          : "Stock will be adjusted and the order will move to Received."
        }
        onSubmit={submitEdit}
      />
    </div>
  );
}
```

Notes for the implementer:
- `Partial<DeliveryNote>` on `dnUpdate` requires TypeScript to accept the object; if `strict` mode causes a `status` narrowing issue, cast the object with `as Partial<DeliveryNote>` at the `batch.update()` call site.
- The `receivedItemsEditCount` fallback `(dn.receivedItemsEditCount ?? 0) + 1` produces the correct value for both first-edit (0 → 1) and repeat-edit cases.
- Do NOT write `receivedAt` / `receivedBy` on Path 1 here. Those fields were set on the branch's original receive; overwriting them would erase the original submission timestamp. If they're missing (e.g., an older DN), leave them missing — no backfill.

- [ ] **Step 3: Add the "Edit Received Counts" button and banner nudge to `DiscrepancyDetail`**

In `DiscrepancyDetail` (around lines 703–705 today), extend the amber banner text:

```tsx
<div style={{ background: "#FEF3C7", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#D97706" }}>
  Dispute filed — commissary has been notified and is reviewing the quantities. <strong>You can also edit your counts if the dispute was filed by mistake.</strong>
</div>
```

In the sticky footer at the bottom of `DiscrepancyDetail` (currently lines 763–779), add a new primary button ABOVE the Cancel Dispute button. The two buttons stack with 8px gap:

```tsx
<div style={{ position: "fixed", bottom: "var(--nav-h)", left: 0, right: 0, background: "#FFF", borderTop: "1px solid var(--border)", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
  <button
    onClick={() => onEditRequested()}
    style={{
      width: "100%", padding: "14px 0", borderRadius: 14,
      border: "none", background: "#111827",
      color: "#FFF", fontWeight: 700, fontSize: 15, cursor: "pointer",
    }}
  >
    ✏ Edit Received Counts
  </button>
  <button
    onClick={cancelDispute}
    disabled={loading}
    style={{ /* existing outline style unchanged */ }}
  >
    {loading ? "Cancelling…" : "Cancel Dispute — Accept Dispatched Quantities"}
  </button>
  <div style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "center", marginTop: 6 }}>
    Confirms commissary was correct. Adjusts your stock to match dispatched quantities.
  </div>
</div>
```

`DiscrepancyDetail` needs a new prop `onEditRequested: () => void` — thread it through from the parent (`OrdersContent`) that owns the view state.

- [ ] **Step 4: Wire `"edit-dispute"` into `OrdersContent`'s view state**

Find the view state at the top of `OrdersContent` (search for `useState<"list"`). It's currently a union like `"list" | "detail-pending" | "detail-active" | "detail-discrepancy" | "detail-history" | "new"` (exact variants may differ — read the current file). Add a new variant, e.g. `"detail-edit-dispute"`.

In the render switch:
1. When `view === "detail-discrepancy"`, pass `onEditRequested={() => setView("detail-edit-dispute")}` to `<DiscrepancyDetail>`.
2. Add a new case for `view === "detail-edit-dispute"` that renders `<EditReceiveView>` with the same `po`, `dn`, `branch`, `onUpdated`, and `onBack={() => setView("detail-discrepancy")}` (so still-discrepant edits return to the discrepancy view; fully-matched edits will trigger `onUpdated` + navigate via `onBack` — but `EditReceiveView` calls `onBack()` in both cases, and the DN's status change to `RECEIVED` combined with `po.status === "DONE"` will cause `DiscrepancyDetail` to no longer be valid on re-render; the parent tab-effect at `transfers/page.tsx` already resets `view` to `"list"` on tab change per the 2026-05-18 UI decision, but here we need explicit handling).

The safer pattern for fully-matched: have `EditReceiveView` call `onBack()` after `onUpdated({...po, status: "DONE"})`. The parent should intercept: when `onUpdated` fires with a status the current view can't render (i.e., `DiscrepancyDetail` when status is now `DONE`), navigate directly to `"list"` instead of the discrepancy view.

Simplest implementation: pass `onBack={() => setView("list")}` from the parent when rendering `EditReceiveView`. This means still-discrepant edits also go back to the list (not directly to `DiscrepancyDetail`) — the branch can re-tap into it from the list. This is acceptable and avoids the state-consistency footgun.

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npx next lint`

Expected: no errors. Fix in place if any surface.

- [ ] **Step 6: Manual verification per spec's Testing Notes**

Run through all 5 scenarios from the design spec (`docs/superpowers/specs/2026-08-04-edit-received-counts-during-dispute-design.md`, "Testing Notes" section):

1. **Full resolution single-item**: dispute with one wrong item → Edit → fix that item → Submit. Verify PO shows as Received, DN is `RECEIVED`, `branchStock` matches dispatched, one `branch_adjustments` doc exists with the delta and `note: "Dispute edit · <poRef>"`.
2. **Partial edit**: two wrong items, fix one, leave the other still discrepant, Submit. Verify PO stays `DISCREPANCY`, DN has updated `receivedItems`, `receivedItemsEditCount === 1`, one `branch_adjustments` doc for the fixed item only.
3. **Multiple edits**: after (2), open the PO again, edit → verify `EditReceiveView` pre-fills with the edited values (not original), fix the remaining item, Submit. Verify `receivedItemsEditCount === 2`, `receivedItemsEditedAt` updated, only the net delta from this second edit appears in `branch_adjustments`.
4. **Cancel Dispute unchanged**: on a fresh `DISCREPANCY` order, tap Cancel Dispute (not Edit). Verify the existing flow still works — PO to `DONE`, DN to `RECEIVED`, no `receivedItemsEdited*` fields written.
5. **Edit button visibility**: confirm no Edit button appears on `DISPUTED` orders (History tab), `SENT_BACK` orders (Active tab with orange banner), `RESOLVED` orders (History tab), or `DONE`/`RECEIVED` orders (History tab). Only `DISCREPANCY` shows it.

Also spot-check Firestore console: DN docs after an edit should have all three `receivedItemsEdited*` fields with plausible values.

- [ ] **Step 7: Update `docs/bugs.md`** (only if you find a bug during manual testing)

Per CLAUDE.md's Bug Log convention, log anything that surfaces during Step 6 in `docs/bugs.md`. Skip if no bugs found.

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/app/transfers/_components/OrdersContent.tsx
git commit -m "feat(transfers): edit received counts during dispute

Adds an 'Edit Received Counts' button on DiscrepancyDetail so branches
can correct a mis-keyed receive without abandoning the dispute. Two
end-states:

- Fully matched after edit: PO → DONE, DN → RECEIVED (behaviorally
  identical to Cancel Dispute, reached via explicit summary confirm).
- Still discrepant: DN.receivedItems updated in place; PO stays
  DISCREPANCY so commissary's review picks up the fresh numbers.

DN docs written by this flow get three new fields: receivedItemsEditedAt,
receivedItemsEditedBy, receivedItemsEditCount. Commissary agent uses
these for an audit note + staleness banner on their review modal
(shipped independently).

Spec: docs/superpowers/specs/2026-08-04-edit-received-counts-during-dispute-design.md
"
```
