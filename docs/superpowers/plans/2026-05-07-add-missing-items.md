# Add Missing Items + Admin Tap-to-Correct Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow superadmin and admin to add items missed during stocktake/delivery submission, and extend tap-to-correct from superadmin-only to admin as well.

**Architecture:** Three files change. The two completed-view components (`StocktakeCompleted`, `DeliveryCompleted`) get new props and an inline two-step sheet. Two new Firestore batch handlers live in `page.tsx`, which also derives the missing-item lists from existing state and passes them down.

**Tech Stack:** Next.js (App Router), React, Firebase Firestore (writeBatch), TypeScript, Vitest + jsdom

---

## File Map

| File | Change |
|------|--------|
| `src/app/stock/_components/StocktakeCompleted.tsx` | `isSuperadmin` → `canEdit`; add `missingItems`/`onAddMissing` props; add two-step sheet |
| `src/app/stock/_components/DeliveryCompleted.tsx` | `isSuperadmin` → `canEdit`; add `missingItems`/`onAddMissing` props; add two-step sheet |
| `src/app/stock/page.tsx` | Add two handlers; derive missing-item lists; pass new props |

---

## Task 1: Admin tap-to-correct

**Files:**
- Modify: `src/app/stock/_components/StocktakeCompleted.tsx`
- Modify: `src/app/stock/_components/DeliveryCompleted.tsx`

- [ ] **Step 1: Update StocktakeCompleted.tsx**

  Open `src/app/stock/_components/StocktakeCompleted.tsx`. Make these changes:

  Line 19 — replace:
  ```ts
  const isSuperadmin = role === "superadmin";
  ```
  with:
  ```ts
  const canEdit = role === "superadmin" || role === "admin";
  ```

  Line 61 — replace:
  ```ts
  onClick={isSuperadmin ? () => openCorrection(item, data.endCount) : undefined}
  ```
  with:
  ```ts
  onClick={canEdit ? () => openCorrection(item, data.endCount) : undefined}
  ```

  Line 69 — replace:
  ```ts
  cursor: isSuperadmin ? "pointer" : "default",
  ```
  with:
  ```ts
  cursor: canEdit ? "pointer" : "default",
  ```

  Line 87 — replace:
  ```ts
  {isSuperadmin && (
  ```
  with:
  ```ts
  {canEdit && (
  ```

- [ ] **Step 2: Update DeliveryCompleted.tsx**

  Open `src/app/stock/_components/DeliveryCompleted.tsx`. Make these changes:

  Line 21 — replace:
  ```ts
  const isSuperadmin = role === "superadmin";
  ```
  with:
  ```ts
  const canEdit = role === "superadmin" || role === "admin";
  ```

  Line 61 — replace:
  ```ts
  onClick={isSuperadmin ? () => openCorrection(item, qty) : undefined}
  ```
  with:
  ```ts
  onClick={canEdit ? () => openCorrection(item, qty) : undefined}
  ```

  Line 69 — replace:
  ```ts
  cursor: isSuperadmin ? "pointer" : "default",
  ```
  with:
  ```ts
  cursor: canEdit ? "pointer" : "default",
  ```

  Line 80 — replace:
  ```ts
  {isSuperadmin && (
  ```
  with:
  ```ts
  {canEdit && (
  ```

- [ ] **Step 3: Verify no remaining `isSuperadmin` references**

  Run:
  ```bash
  grep -n "isSuperadmin" src/app/stock/_components/StocktakeCompleted.tsx src/app/stock/_components/DeliveryCompleted.tsx
  ```
  Expected: no output.

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/stock/_components/StocktakeCompleted.tsx src/app/stock/_components/DeliveryCompleted.tsx
  git commit -m "feat: extend tap-to-correct to admin role"
  ```

---

## Task 2: Add missing-item sheet to StocktakeCompleted

**Files:**
- Modify: `src/app/stock/_components/StocktakeCompleted.tsx`

This adds a two-step bottom sheet: Step 1 = searchable item list, Step 2 = quantity input.

- [ ] **Step 1: Add new props to the interface**

  At the top of `StocktakeCompleted.tsx`, update the `Props` interface:

  ```ts
  interface Props {
    dayClose: DailyClose;
    role?: string | null;
    onCorrect?: (item: string, newQty: number) => Promise<void>;
    missingItems?: string[];
    onAddMissing?: (item: string, qty: number) => Promise<void>;
  }
  ```

  Update the function signature to destructure the new props:
  ```ts
  export function StocktakeCompleted({ dayClose, role, onCorrect, missingItems = [], onAddMissing }: Props) {
  ```

- [ ] **Step 2: Add sheet state variables**

  After the existing `const [saving, setSaving] = useState(false);` line, add:

  ```ts
  // Add-missing sheet state
  const [showAddMissing, setShowAddMissing] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addSelected, setAddSelected] = useState<string | null>(null);
  const [addQty, setAddQty] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  ```

- [ ] **Step 3: Add sheet helper functions**

  After the existing `closeSheet` function, add:

  ```ts
  function openAddMissing() {
    setShowAddMissing(true);
    setAddSearch("");
    setAddSelected(null);
    setAddQty("");
  }

  function closeAddMissing() {
    setShowAddMissing(false);
    setAddSearch("");
    setAddSelected(null);
    setAddQty("");
  }

  async function handleAddMissingSave() {
    if (!addSelected || !onAddMissing) return;
    const qty = Number(addQty);
    if (isNaN(qty) || qty < 0 || addQty.trim() === "") return;
    setAddSaving(true);
    try {
      await onAddMissing(addSelected, qty);
      closeAddMissing();
    } finally {
      setAddSaving(false);
    }
  }

  const filteredMissing = missingItems.filter(item =>
    item.toLowerCase().includes(addSearch.toLowerCase())
  );
  ```

- [ ] **Step 4: Add the "Add missed item" button**

  After the closing `</div>` of the item list (after the `rows.map(...)` block) and before the `{canEdit && (` hint text block, add:

  ```tsx
  {canEdit && missingItems.length > 0 && (
    <div style={{ padding: "12px 16px" }}>
      <button
        onClick={openAddMissing}
        style={{
          width: "100%", padding: "12px 0", borderRadius: 12,
          border: "1.5px dashed #16A34A", background: "#F0FDF4",
          color: "#15803D", fontWeight: 600, fontSize: 14, cursor: "pointer",
        }}
      >
        + Add missed item
      </button>
    </div>
  )}
  ```

- [ ] **Step 5: Add the two-step sheet JSX**

  After the existing correction sheet closing `</>` and before the final `</div>`, add:

  ```tsx
  {/* Add-missing sheet */}
  {showAddMissing && (
    <>
      <div onClick={closeAddMissing} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }} />
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70, background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)", maxHeight: "80dvh", display: "flex", flexDirection: "column" }}>
        {addSelected === null ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Add missed item</div>
            <input
              type="text"
              placeholder="Search items…"
              value={addSearch}
              onChange={e => setAddSearch(e.target.value)}
              autoFocus
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--border)", fontSize: 14, marginBottom: 12, boxSizing: "border-box", outline: "none" }}
            />
            <div style={{ overflowY: "auto", flex: 1 }}>
              {filteredMissing.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13, padding: "24px 0" }}>No items found</div>
              ) : (
                filteredMissing.map(item => (
                  <div
                    key={item}
                    onClick={() => { setAddSelected(item); setAddQty(""); }}
                    style={{ padding: "14px 4px", borderBottom: "1px solid var(--border)", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
                  >
                    {item}
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <button
              onClick={() => setAddSelected(null)}
              style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 8 }}
            >
              ← Back
            </button>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Add missed item</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>{addSelected}</div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>Count</div>
              <input
                type="number"
                inputMode="decimal"
                value={addQty}
                onChange={e => setAddQty(e.target.value)}
                autoFocus
                style={{ width: "100%", fontSize: 22, fontWeight: 700, border: "2px solid #1A1A1A", borderRadius: 10, padding: "10px 14px", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={closeAddMissing}
                style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1.5px solid var(--border)", background: "#fff", color: "var(--text-secondary)", fontWeight: 600, fontSize: 15, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddMissingSave}
                disabled={addSaving || addQty.trim() === "" || Number(addQty) < 0}
                style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "none", background: addSaving ? "#ccc" : "#15803D", color: "#fff", fontWeight: 700, fontSize: 15, cursor: addSaving ? "default" : "pointer" }}
              >
                {addSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )}
  ```

- [ ] **Step 6: Type-check**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```
  Expected: no errors in `StocktakeCompleted.tsx`.

- [ ] **Step 7: Commit**

  ```bash
  git add src/app/stock/_components/StocktakeCompleted.tsx
  git commit -m "feat: add missed item sheet to StocktakeCompleted"
  ```

---

## Task 3: Add missing-item sheet to DeliveryCompleted

**Files:**
- Modify: `src/app/stock/_components/DeliveryCompleted.tsx`

Identical pattern to Task 2, with delivery-specific labels and green replaced with blue.

- [ ] **Step 1: Add new props to the interface**

  Update the `Props` interface:

  ```ts
  interface Props {
    deliveryClose: DeliveryClose;
    role?: string | null;
    onCorrect?: (item: string, newQty: number) => Promise<void>;
    missingItems?: string[];
    onAddMissing?: (item: string, qty: number) => Promise<void>;
  }
  ```

  Update the function signature:
  ```ts
  export function DeliveryCompleted({ deliveryClose, role, onCorrect, missingItems = [], onAddMissing }: Props) {
  ```

- [ ] **Step 2: Add sheet state variables**

  After `const [saving, setSaving] = useState(false);`, add:

  ```ts
  const [showAddMissing, setShowAddMissing] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addSelected, setAddSelected] = useState<string | null>(null);
  const [addQty, setAddQty] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  ```

- [ ] **Step 3: Add sheet helper functions**

  After `closeSheet`, add:

  ```ts
  function openAddMissing() {
    setShowAddMissing(true);
    setAddSearch("");
    setAddSelected(null);
    setAddQty("");
  }

  function closeAddMissing() {
    setShowAddMissing(false);
    setAddSearch("");
    setAddSelected(null);
    setAddQty("");
  }

  async function handleAddMissingSave() {
    if (!addSelected || !onAddMissing) return;
    const qty = Number(addQty);
    if (isNaN(qty) || qty < 0 || addQty.trim() === "") return;
    setAddSaving(true);
    try {
      await onAddMissing(addSelected, qty);
      closeAddMissing();
    } finally {
      setAddSaving(false);
    }
  }

  const filteredMissing = missingItems.filter(item =>
    item.toLowerCase().includes(addSearch.toLowerCase())
  );
  ```

- [ ] **Step 4: Add the "Add missed item" button**

  After the closing `</div>` of the `rows.map(...)` block and before the `{canEdit && (` hint text block, add:

  ```tsx
  {canEdit && missingItems.length > 0 && (
    <div style={{ padding: "12px 16px" }}>
      <button
        onClick={openAddMissing}
        style={{
          width: "100%", padding: "12px 0", borderRadius: 12,
          border: "1.5px dashed #1D4ED8", background: "#EFF6FF",
          color: "#1D4ED8", fontWeight: 600, fontSize: 14, cursor: "pointer",
        }}
      >
        + Add missed item
      </button>
    </div>
  )}
  ```

- [ ] **Step 5: Add the two-step sheet JSX**

  After the existing correction sheet closing `</>` and before the final `</div>`:

  ```tsx
  {/* Add-missing sheet */}
  {showAddMissing && (
    <>
      <div onClick={closeAddMissing} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }} />
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70, background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)", maxHeight: "80dvh", display: "flex", flexDirection: "column" }}>
        {addSelected === null ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Add missed item</div>
            <input
              type="text"
              placeholder="Search items…"
              value={addSearch}
              onChange={e => setAddSearch(e.target.value)}
              autoFocus
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--border)", fontSize: 14, marginBottom: 12, boxSizing: "border-box", outline: "none" }}
            />
            <div style={{ overflowY: "auto", flex: 1 }}>
              {filteredMissing.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13, padding: "24px 0" }}>No items found</div>
              ) : (
                filteredMissing.map(item => (
                  <div
                    key={item}
                    onClick={() => { setAddSelected(item); setAddQty(""); }}
                    style={{ padding: "14px 4px", borderBottom: "1px solid var(--border)", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
                  >
                    {item}
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <button
              onClick={() => setAddSelected(null)}
              style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 8 }}
            >
              ← Back
            </button>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Add missed item</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>{addSelected}</div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>Quantity</div>
              <input
                type="number"
                inputMode="decimal"
                value={addQty}
                onChange={e => setAddQty(e.target.value)}
                autoFocus
                style={{ width: "100%", fontSize: 22, fontWeight: 700, border: "2px solid #1A1A1A", borderRadius: 10, padding: "10px 14px", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={closeAddMissing}
                style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1.5px solid var(--border)", background: "#fff", color: "var(--text-secondary)", fontWeight: 600, fontSize: 15, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddMissingSave}
                disabled={addSaving || addQty.trim() === "" || Number(addQty) < 0}
                style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "none", background: addSaving ? "#ccc" : "#1D4ED8", color: "#fff", fontWeight: 700, fontSize: 15, cursor: addSaving ? "default" : "pointer" }}
              >
                {addSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )}
  ```

- [ ] **Step 6: Type-check**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```
  Expected: no errors in `DeliveryCompleted.tsx`.

- [ ] **Step 7: Commit**

  ```bash
  git add src/app/stock/_components/DeliveryCompleted.tsx
  git commit -m "feat: add missed item sheet to DeliveryCompleted"
  ```

---

## Task 4: Handlers and prop wiring in page.tsx

**Files:**
- Modify: `src/app/stock/page.tsx`

- [ ] **Step 1: Add `handleAddMissingStocktakeItem` handler**

  Add this function after `handleCorrectCount` (after line 446) in `page.tsx`:

  ```ts
  async function handleAddMissingStocktakeItem(item: string, qty: number) {
    if (!branch || !department || !stocktakeDayClose) return;
    await auth.authStateReady();
    const loggedBy = getSession()?.displayName ?? BRANCH_LABELS[branch];
    const closeId = `${branch}__${department}__${stocktakeDate}`;

    const beginning = stocktakeBeginnings[item] ?? 0;
    const inQty = stocktakeAdjustments
      .filter(a => a.item === item && a.type === "in")
      .reduce((sum, a) => sum + a.qty, 0);
    const outQty = stocktakeAdjustments
      .filter(a => a.item === item && (a.type === "out" || a.type === "waste" || a.type === "pullout"))
      .reduce((sum, a) => sum + a.qty, 0);
    const expected = beginning + inQty - outQty;
    const variance = qty - expected;

    const batch = writeBatch(db);

    const adjRef = doc(collection(db, COLS.adjustments));
    batch.set(adjRef, {
      id: adjRef.id, branch, department, date: stocktakeDate,
      item, type: "count", qty, loggedBy,
    });

    batch.set(doc(db, COLS.branchStock, stockDocId(branch, department, item)), {
      qty, lastUpdated: stocktakeDate, lastUpdatedBy: loggedBy,
    }, { merge: true });

    const updatedItems = {
      ...stocktakeDayClose.items,
      [item]: { beginning, inQty, outQty, expected, endCount: qty, variance },
    };
    batch.set(doc(db, COLS.dailyClose, closeId), { items: updatedItems }, { merge: true });

    const tomorrow = addDays(stocktakeDate, 1);
    batch.set(doc(db, COLS.dailyBeginning, beginningDocId(branch, department, item, tomorrow)), {
      qty, setBy: loggedBy, updatedAt: stocktakeDate,
    }, { merge: true });

    await batch.commit();
  }
  ```

- [ ] **Step 2: Add `handleAddMissingDeliveryItem` handler**

  Add this function after `handleDeliveryCorrect` (after line 488):

  ```ts
  async function handleAddMissingDeliveryItem(item: string, qty: number) {
    if (!branch || !department) return;
    const effective = deliveryClose ?? deliveryAdjClose;
    if (!effective) return;
    await auth.authStateReady();
    const loggedBy = getSession()?.displayName ?? BRANCH_LABELS[branch];
    const closeId = `${branch}__${department}__${deliveryDate}`;

    const currentQty = stocks[item]?.qty ?? 0;
    const batch = writeBatch(db);

    const adjRef = doc(collection(db, COLS.adjustments));
    batch.set(adjRef, {
      id: adjRef.id, branch, department, date: deliveryDate,
      item, type: "in", qty, loggedBy, note: "manual delivery",
    });

    batch.set(doc(db, COLS.branchStock, stockDocId(branch, department, item)), {
      qty: currentQty + qty, lastUpdated: deliveryDate, lastUpdatedBy: loggedBy,
    }, { merge: true });

    const updatedItems = { ...effective.items, [item]: qty };
    batch.set(doc(db, COLS.deliveryClose, closeId), {
      id: closeId, branch, department, date: effective.date,
      items: updatedItems, closedAt: effective.closedAt, closedBy: effective.closedBy,
    });

    await batch.commit();
  }
  ```

- [ ] **Step 3: Derive missing-item lists**

  Find the line `if (!branch || !department) return null;` in `page.tsx`. Directly above it, add:

  ```ts
  const missingStocktakeItems = stocktakeDayClose
    ? Object.keys(stocks).filter(item => !(item in stocktakeDayClose.items)).sort()
    : [];

  const effectiveDelivery = deliveryClose ?? deliveryAdjClose;
  const missingDeliveryItems = effectiveDelivery
    ? Object.keys(stocks).filter(item => !(item in effectiveDelivery.items)).sort()
    : [];
  ```

- [ ] **Step 4: Pass new props to DeliveryCompleted**

  Find the `<DeliveryCompleted` render (around line 565). It currently looks like:
  ```tsx
  ? <DeliveryCompleted deliveryClose={deliveryClose ?? deliveryAdjClose!} role={role} onCorrect={handleDeliveryCorrect} />
  ```

  Replace with:
  ```tsx
  ? <DeliveryCompleted
      deliveryClose={deliveryClose ?? deliveryAdjClose!}
      role={role}
      onCorrect={handleDeliveryCorrect}
      missingItems={missingDeliveryItems}
      onAddMissing={handleAddMissingDeliveryItem}
    />
  ```

- [ ] **Step 5: Pass new props to StocktakeCompleted**

  Find the `<StocktakeCompleted` render (around line 580). It currently looks like:
  ```tsx
  ? <StocktakeCompleted dayClose={stocktakeDayClose} role={role} onCorrect={handleCorrectCount} />
  ```

  Replace with:
  ```tsx
  ? <StocktakeCompleted
      dayClose={stocktakeDayClose}
      role={role}
      onCorrect={handleCorrectCount}
      missingItems={missingStocktakeItems}
      onAddMissing={handleAddMissingStocktakeItem}
    />
  ```

- [ ] **Step 6: Type-check the whole project**

  ```bash
  npx tsc --noEmit 2>&1 | head -40
  ```
  Expected: no errors.

- [ ] **Step 7: Run existing tests**

  ```bash
  npx vitest run
  ```
  Expected: all tests pass (no changes to tested files).

- [ ] **Step 8: Commit**

  ```bash
  git add src/app/stock/page.tsx
  git commit -m "feat: wire add-missing-item handlers and props in page"
  ```

---

## Task 5: Manual verification

- [ ] **Step 1: Start dev server**

  ```bash
  npm run dev
  ```

- [ ] **Step 2: Test admin tap-to-correct**

  Log in as an admin user. Navigate to stock → stocktake tab on a date that has a completed stocktake. Tap any item. Confirm the correction sheet opens and saving works.

  Repeat for the delivery (IN) tab on a date with a completed delivery.

- [ ] **Step 3: Test add-missed-item (stocktake)**

  On a completed stocktake that has at least one item missing from the count (a `branch_stock` item not in `daily_close.items`), tap "Add missed item". Confirm:
  - Sheet opens with only missing items listed
  - Search filters the list
  - Tapping an item advances to Step 2
  - Back button returns to Step 1
  - Saving with a valid count: closes the sheet, item appears in the confirmed list, Firestore `daily_close.items` + `branch_stock` + `daily_beginning` (tomorrow) + new `branch_adjustments` doc all updated correctly

- [ ] **Step 4: Test add-missed-item (delivery)**

  On a completed delivery with at least one item not in `delivery_close.items`, tap "Add missed item". Confirm:
  - Sheet opens with only missing items
  - Saving: closes sheet, item appears in confirmed list, `delivery_close.items` + `branch_stock` updated, new "in" `branch_adjustments` doc created

- [ ] **Step 5: Test button hidden when nothing missing**

  Open a completed stocktake where every `branch_stock` item was counted. Confirm the "Add missed item" button does not appear.

- [ ] **Step 6: Test linecook sees no edit controls**

  Log in as linecook. Open a completed stocktake. Confirm no tap cursor, no correction sheet, no "Add missed item" button.
