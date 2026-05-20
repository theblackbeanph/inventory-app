# Confirm Receipt Summary Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only summary overlay between the "Confirm Receipt" button and the actual Firestore write, so staff can review all items before finalising.

**Architecture:** Add a `showReview` boolean state to `ActiveDetail`. The existing Confirm button sets it to `true` instead of calling `confirmReceipt()` directly. A full-screen overlay (same `position: fixed; inset: 0` pattern as `NewOrderForm`'s review sheet) renders when `showReview` is `true`, showing a receipt card with all items, Back and Submit buttons. Submit calls the existing `confirmReceipt()` unchanged.

**Tech Stack:** React `useState`, existing inline styles

---

## File Map

| File | Change |
|---|---|
| `src/app/transfers/_components/OrdersContent.tsx` | Add `showReview` state + overlay JSX + rewire Confirm button in `ActiveDetail` |

---

### Task 1: Add `showReview` state and rewire the Confirm button

**Files:**
- Modify: `src/app/transfers/_components/OrdersContent.tsx`

- [ ] **Step 1: Add `showReview` state after the existing `checkedItems` state (line ~303)**

```tsx
const [showReview,   setShowReview]   = useState(false);
```

The full state block should now read:

```tsx
const [loading,      setLoading]      = useState(false);
const [error,        setError]        = useState("");
const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
const [showReview,   setShowReview]   = useState(false);
```

- [ ] **Step 2: Change the Confirm button's `onClick` to open the overlay instead of submitting**

Find the existing Confirm button (around line 466):

```tsx
<button
  onClick={confirmReceipt}
  disabled={loading}
  style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: hasDiscrepancy ? "#DC2626" : "#059669", color: "#FFF", fontWeight: 700, fontSize: 16, cursor: "pointer" }}
>
  {loading ? "Saving…" : hasDiscrepancy ? "Confirm Receipt with Discrepancy" : "Confirm Receipt — All Good"}
</button>
```

Replace with:

```tsx
<button
  onClick={() => setShowReview(true)}
  style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: hasDiscrepancy ? "#DC2626" : "#059669", color: "#FFF", fontWeight: 700, fontSize: 16, cursor: "pointer" }}
>
  {hasDiscrepancy ? "Confirm Receipt with Discrepancy" : "Confirm Receipt — All Good"}
</button>
```

- [ ] **Step 3: Verify the app still compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/transfers/_components/OrdersContent.tsx
git commit -m "feat(orders): add showReview state and rewire confirm button"
```

---

### Task 2: Add the summary overlay

**Files:**
- Modify: `src/app/transfers/_components/OrdersContent.tsx`

- [ ] **Step 1: Add the overlay just before the closing `</div>` of the `ActiveDetail` return (after the `{dn && (…)}` bottom bar block, before the final `</div>`)**

The current end of the `ActiveDetail` return looks like:

```tsx
      {dn && (
        <div style={{ position: "fixed", bottom: "var(--nav-h)", left: 0, right: 0, ... }}>
          ...
        </div>
      )}
    </div>
  );
}
```

Insert the overlay block between the bottom bar and the closing `</div>`:

```tsx
      {showReview && dn && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "#FFF", overflowY: "auto", display: "flex", flexDirection: "column" }}>

          {/* header */}
          <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)", background: "#FFF", position: "sticky", top: 0, zIndex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Review & Confirm</div>
          </div>

          {/* scrollable body */}
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>

            {/* receipt card */}
            <div style={{ background: "#FFF", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>

              {/* coloured header band */}
              <div style={{ background: hasDiscrepancy ? "#DC2626" : "#059669", padding: "14px 16px", color: "#FFF" }}>
                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 2 }}>You are confirming receipt of</div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{po.poRef}</div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                  {dn.dnRef} · {dn.items.length} item{dn.items.length !== 1 ? "s" : ""}
                  {hasDiscrepancy ? ` · ${itemsWithDiscrepancy.length} discrepancy` : ""}
                </div>
              </div>

              {/* item rows */}
              <div style={{ padding: "4px 0" }}>
                {dn.items.map((item, idx) => {
                  const receivedQty = receivedQtys[item.item] ?? item.dispatchedQty;
                  const isDisc      = receivedQty !== item.dispatchedQty;
                  return (
                    <div
                      key={item.item}
                      style={{
                        background:   isDisc ? "#FEF2F2" : "#FFF",
                        borderLeft:   isDisc ? "3px solid #DC2626" : "3px solid transparent",
                        padding:      "11px 16px",
                        borderBottom: idx < dn.items.length - 1 ? "1px solid #F3F3F0" : "none",
                        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{item.item}</div>
                        {isDisc && (
                          <div style={{ fontSize: 11, color: "#DC2626", fontWeight: 500, marginTop: 2 }}>
                            Expected {item.dispatchedQty} · received {receivedQty}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: isDisc ? "#DC2626" : "var(--text)" }}>
                          {receivedQty}{" "}
                          <span style={{ fontWeight: 400, fontSize: 12, color: isDisc ? "#DC2626" : "#888" }}>{item.unit}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* footer note inside card */}
              <div style={{
                background:  hasDiscrepancy ? "#FEF2F2" : "#F0FDF4",
                padding:     "10px 16px",
                fontSize:    12,
                color:       hasDiscrepancy ? "#DC2626" : "#059669",
                fontWeight:  500,
                borderTop:   "1px solid var(--border)",
              }}>
                {hasDiscrepancy
                  ? "Commissary will be notified of the discrepancy."
                  : "✓ All quantities match dispatch"}
              </div>
            </div>

            {/* caption */}
            <div style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", marginTop: 14 }}>
              Stock will be added to your inventory once submitted.
            </div>
          </div>

          {/* bottom bar — Back + Submit */}
          <div style={{ padding: "12px 16px calc(var(--nav-h) + 12px)", background: "#FFF", borderTop: "1px solid var(--border)" }}>
            {error && (
              <div style={{ background: "#FEF2F2", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#DC2626", marginBottom: 8 }}>{error}</div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setShowReview(false)}
              style={{ flex: 1, padding: "15px 0", borderRadius: 14, border: "1.5px solid var(--border)", background: "#FFF", color: "var(--text)", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
            >
              Back
            </button>
            <button
              onClick={confirmReceipt}
              disabled={loading}
              style={{ flex: 2, padding: "15px 0", borderRadius: 14, border: "none", background: hasDiscrepancy ? "#DC2626" : "#059669", color: "#FFF", fontWeight: 700, fontSize: 15, cursor: loading ? "not-allowed" : "pointer" }}
            >
              {loading ? "Submitting…" : "Submit"}
            </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 2: Verify the app still compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/transfers/_components/OrdersContent.tsx
git commit -m "feat(orders): add confirm receipt summary overlay"
```

---

### Task 3: Manual verification

**Files:** none

- [ ] **Step 1: Seed a test order**

```bash
SEED_EMAIL=chris@theblackbean.ph SEED_PASSWORD=TBB@TheBlackBean node scripts/seed-test-order.mjs
```

- [ ] **Step 2: Open the app and navigate to Orders → Active tab**

Open `http://localhost:3000`, sign in as BF, go to `/transfers` → Active tab, tap `PO-TEST-CHECKBTN`.

- [ ] **Step 3: Verify the flow**

Check each of the following:

1. Tapping "Confirm Receipt with Discrepancy" opens the summary overlay — no Firestore write yet
2. The overlay header band is red (because Beef Tapa is short)
3. Cobbler and Burger Patty rows show their qty normally; Beef Tapa row is red with "Expected 8 · received 6"
4. The footer note says "Commissary will be notified of the discrepancy."
5. Tapping **Back** closes the overlay and returns to the editable detail view — all qty inputs still intact
6. Tapping **Submit** fires the write, navigates back to the list, and the order moves to history
7. Adjust all qtys to match dispatched, then tap Confirm again — the overlay header band should be green, footer note "✓ All quantities match dispatch", Submit button green

- [ ] **Step 4: Clean up test data**

```bash
SEED_EMAIL=chris@theblackbean.ph SEED_PASSWORD=TBB@TheBlackBean DELETE=true node scripts/seed-test-order.mjs
```

- [ ] **Step 5: Commit any tweaks made during manual testing**

```bash
git add src/app/transfers/_components/OrdersContent.tsx
git commit -m "fix(orders): tweak confirm summary after manual test"
```
