# Stocktake UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-location stocktake progress pills with a single banner + review sheet, add a yesterday/today date picker, and delete the Grilled Cheese catalog entry.

**Architecture:** `StocktakeContent` gains a date picker and banner; a new `StocktakeReviewSheet` replaces `SubmitAllModal`; `page.tsx` adds a second Firestore `useEffect` keyed on `stocktakeDate` so all stocktake queries (adjustments, beginnings, dailyClose, drafts) track the selected date independently of the daily tab.

**Tech Stack:** Next.js App Router, React, Firestore (Firebase v9 modular SDK), TypeScript, Vitest + jsdom

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/items.ts` | Modify | Remove Grilled Cheese catalog entry |
| `src/app/stock/_components/StocktakeReviewSheet.tsx` | Create | Full-screen review overlay (replaces SubmitAllModal) |
| `src/app/stock/_components/SubmitAllModal.tsx` | Delete | Replaced by StocktakeReviewSheet |
| `src/app/stock/_components/StocktakeContent.tsx` | Rewrite | Date picker, banner, updated bottom bar |
| `src/app/stock/page.tsx` | Modify | stocktakeDate state, second useEffect, stocktakeMetrics, new handlers |

---

## Task 1: Delete Grilled Cheese

**Files:**
- Modify: `src/lib/items.ts:45`

- [ ] **Step 1: Remove the entry**

Open `src/lib/items.ts`. Line 45 is:
```ts
  { name: "Grilled Cheese",          category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
```
Delete this line entirely.

- [ ] **Step 2: Verify type check passes**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/items.ts
git commit -m "chore: remove Grilled Cheese from catalog (consolidated into Tomato Soup)"
```

---

## Task 2: Create StocktakeReviewSheet

**Files:**
- Create: `src/app/stock/_components/StocktakeReviewSheet.tsx`

This replaces `SubmitAllModal`. Key differences:
- No location progress pills in the header
- Subtitle shows `stocktakeDate`
- Bottom has two buttons: "Continue Stocktake" (closes) + "Submit" (fires confirm)
- "Recount" calls `onRecount(item)` which in `page.tsx` clears the value and closes the sheet

- [ ] **Step 1: Create the file**

Create `src/app/stock/_components/StocktakeReviewSheet.tsx` with this content:

```tsx
"use client";
import { CATALOG } from "@/lib/items";
import type { DailyMetrics } from "../_lib/helpers";

export function StocktakeReviewSheet({ items, metrics, endCounts, stocktakeDate, onRecount, onConfirm, onClose, loading }: {
  items: typeof CATALOG;
  metrics: Record<string, DailyMetrics>;
  endCounts: Record<string, string>;
  stocktakeDate: string;
  onRecount: (item: string) => void;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  loading: boolean;
}) {
  const rows = items
    .filter(item => endCounts[item.name] !== undefined && endCounts[item.name] !== "")
    .map(item => {
      const m = metrics[item.name];
      const expected = m.beginning !== null ? m.beginning + m.inQty - m.outQty : null;
      const count = Number(endCounts[item.name]);
      const variance = expected !== null ? count - expected : null;
      return { item, expected, count, variance };
    });

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "#fff", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Stocktake Review</div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-secondary)", padding: 4 }}>✕</button>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
            {stocktakeDate} · {rows.length} item{rows.length !== 1 ? "s" : ""} counted
          </div>
        </div>

        <div style={{ flex: 1, padding: "0 0 100px" }}>
          {rows.map(({ item, expected, count, variance }) => {
            const isBig = variance !== null && Math.abs(variance) > 1;
            return (
              <div key={item.name} style={{
                padding: "12px 16px", borderBottom: "1px solid var(--border)",
                background: isBig ? "#FFF7ED" : "#fff",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      {item.packSize} · Expected: {expected ?? "—"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{count}</div>
                      {variance !== null && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: variance === 0 ? "#16A34A" : variance > 0 ? "#D97706" : "#DC2626" }}>
                          {variance > 0 ? `+${variance}` : variance === 0 ? "✓" : String(variance)}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => onRecount(item.name)}
                      style={{ padding: "5px 10px", borderRadius: 8, border: "1.5px solid var(--border)", background: "#fff", color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    >
                      Recount
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "40px 16px", fontSize: 14 }}>No items counted yet.</div>
          )}
        </div>

        <div style={{ position: "sticky", bottom: 0, padding: "12px 16px 32px", background: "#fff", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: "15px 0", borderRadius: 14,
              border: "1.5px solid var(--border)", fontWeight: 700, fontSize: 14,
              cursor: "pointer", background: "#fff", color: "var(--text)",
            }}
          >
            Continue Stocktake
          </button>
          <button
            disabled={loading || rows.length === 0}
            onClick={onConfirm}
            style={{
              flex: 1, padding: "15px 0", borderRadius: 14, border: "none",
              fontWeight: 700, fontSize: 16, cursor: rows.length > 0 && !loading ? "pointer" : "not-allowed",
              background: rows.length > 0 ? "#1A1A1A" : "#E8E8E4",
              color: rows.length > 0 ? "#fff" : "var(--text-secondary)",
            }}
          >
            {loading ? "Saving…" : "Submit"}
          </button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify no type errors in the new file**

```bash
npx tsc --noEmit
```
Expected: any errors will be in `page.tsx` (still importing the old modal) — that's fine for now. No errors should originate from `StocktakeReviewSheet.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add src/app/stock/_components/StocktakeReviewSheet.tsx
git commit -m "feat: add StocktakeReviewSheet component"
```

---

## Task 3: Rewrite StocktakeContent

**Files:**
- Rewrite: `src/app/stock/_components/StocktakeContent.tsx`

New features:
- Date picker (two pill buttons: Yesterday / Today) at the top
- Date-change warning bottom sheet (local state — gating calls to `onDateChange`)
- "Pending Stocktake" banner replaces location pills
- Bottom bar: **Save** (disabled when filter is "all") + **Submit (N)** (opens review)

The component no longer receives `onSubmitAll` — it receives `onOpenReview` instead. It also receives `stocktakeDate` and `onDateChange`.

- [ ] **Step 1: Overwrite StocktakeContent.tsx**

Replace the entire file with:

```tsx
"use client";
import { useState } from "react";
import { CATALOG, LOCATIONS } from "@/lib/items";
import type { DailyMetrics, FilterTab } from "../_lib/helpers";
import { businessDatePHT, addDays } from "../_lib/helpers";

export function StocktakeContent({ items, metrics, endCounts, currentFilter, stocktakeDate, onDateChange, onCountChange, onSaveLocation, onOpenReview }: {
  items: typeof CATALOG;
  metrics: Record<string, DailyMetrics>;
  endCounts: Record<string, string>;
  currentFilter: FilterTab;
  stocktakeDate: string;
  onDateChange: (date: string) => void;
  onCountChange: (item: string, val: string) => void;
  onSaveLocation: (location: string) => void;
  onOpenReview: () => void;
}) {
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const today = businessDatePHT();
  const yesterday = addDays(today, -1);
  const dateOptions = [
    { date: yesterday, label: "Yesterday" },
    { date: today,     label: "Today"     },
  ];

  const totalEntered = Object.values(endCounts).filter(v => v !== "").length;
  const activeLocation = currentFilter !== "all" ? LOCATIONS.find(l => l.id === currentFilter) ?? null : null;
  const canSave = activeLocation !== null && items.some(i => i.location === activeLocation.id && endCounts[i.name] !== undefined && endCounts[i.name] !== "");

  function handleDatePillClick(newDate: string) {
    if (newDate === stocktakeDate) return;
    if (Object.values(endCounts).some(v => v !== "")) {
      setPendingDate(newDate);
      setShowWarning(true);
    } else {
      onDateChange(newDate);
    }
  }

  function confirmSwitch() {
    if (pendingDate) onDateChange(pendingDate);
    setPendingDate(null);
    setShowWarning(false);
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Date picker */}
      <div style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "8px 16px", display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Date:</span>
        <div style={{ display: "flex", gap: 4 }}>
          {dateOptions.map(({ date, label }) => {
            const isSelected = date === stocktakeDate;
            return (
              <button key={date} onClick={() => handleDatePillClick(date)} style={{
                padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                background: isSelected ? "#1A1A1A" : "#F3F4F6",
                color: isSelected ? "#fff" : "var(--text-secondary)",
                border: `1.5px solid ${isSelected ? "#1A1A1A" : "var(--border)"}`,
                cursor: "pointer",
              }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pending stocktake banner */}
      {totalEntered > 0 ? (
        <button onClick={onOpenReview} style={{
          width: "100%", background: "#FFF7ED", borderBottom: "1px solid #FED7AA",
          borderTop: "none", borderLeft: "none", borderRight: "none",
          padding: "10px 16px", display: "flex", justifyContent: "space-between",
          alignItems: "center", cursor: "pointer", textAlign: "left" as const,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#92400E" }}>⏳ Pending Stocktake</div>
            <div style={{ fontSize: 11, color: "#B45309", marginTop: 2 }}>
              {totalEntered} of {items.length} items counted · tap to review
            </div>
          </div>
          <span style={{ fontSize: 16, color: "#B45309" }}>›</span>
        </button>
      ) : (
        <div style={{ background: "#F9FAFB", borderBottom: "1px solid var(--border)", padding: "10px 16px" }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>No stocktake started</div>
        </div>
      )}

      {/* Item list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {items.map(item => {
          const m = metrics[item.name];
          const expected = m.beginning !== null ? m.beginning + m.inQty - m.outQty : null;
          const val = endCounts[item.name] ?? "";
          return (
            <div key={item.name} style={{ background: "#fff", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  {item.packSize}
                  {expected !== null && <span> · Expected: <strong>{expected}</strong></span>}
                </div>
              </div>
              <input
                type="number"
                inputMode="numeric"
                value={val}
                placeholder="—"
                onChange={e => onCountChange(item.name, e.target.value)}
                style={{
                  width: 72, padding: "8px 10px", fontSize: 16, fontWeight: 700,
                  textAlign: "right", border: "1.5px solid",
                  borderColor: val !== "" ? "#1A1A1A" : "var(--border)",
                  borderRadius: 10, outline: "none",
                  background: "var(--bg)", color: "var(--text)",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Bottom bar */}
      <div style={{ position: "fixed", bottom: "calc(var(--nav-h) + 12px)", left: 0, right: 0, padding: "0 16px", zIndex: 30, display: "flex", gap: 8 }}>
        <button
          onClick={() => activeLocation && onSaveLocation(activeLocation.id)}
          disabled={!canSave}
          style={{
            flex: 1, padding: "15px 0", borderRadius: 14,
            border: "1.5px solid var(--border)", fontWeight: 700, fontSize: 14,
            cursor: canSave ? "pointer" : "not-allowed",
            background: "#fff",
            color: canSave ? "var(--text)" : "var(--text-secondary)",
          }}
        >
          Save
        </button>
        <button
          onClick={onOpenReview}
          disabled={totalEntered === 0}
          style={{
            flex: 2, padding: "15px 0", borderRadius: 14, border: "none",
            fontWeight: 700, fontSize: 16, cursor: totalEntered > 0 ? "pointer" : "not-allowed",
            background: totalEntered > 0 ? "#1A1A1A" : "#E8E8E4",
            color: totalEntered > 0 ? "#fff" : "var(--text-secondary)",
            boxShadow: totalEntered > 0 ? "0 4px 16px rgba(0,0,0,0.15)" : "none",
          }}
        >
          Submit ({totalEntered})
        </button>
      </div>

      {/* Date-change warning sheet */}
      {showWarning && pendingDate && (
        <>
          <div onClick={() => setShowWarning(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50 }} />
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderRadius: "16px 16px 0 0", padding: "20px 16px 32px", zIndex: 51, boxShadow: "0 -4px 20px rgba(0,0,0,0.12)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
              Change date to {pendingDate === today ? "today" : "yesterday"}?
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>
              You have{" "}
              <strong style={{ color: "var(--text)" }}>{totalEntered} unsaved count{totalEntered !== 1 ? "s" : ""}</strong>
              {" "}for {stocktakeDate === today ? "today" : "yesterday"}. Switching dates will clear them.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowWarning(false)}
                style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "1.5px solid var(--border)", fontWeight: 600, fontSize: 13, background: "#fff", color: "var(--text-secondary)", cursor: "pointer" }}
              >
                Keep {stocktakeDate === today ? "today" : "yesterday"}
              </button>
              <button
                onClick={confirmSwitch}
                style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "none", fontWeight: 700, fontSize: 13, background: "#DC2626", color: "#fff", cursor: "pointer" }}
              >
                Clear &amp; Switch
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the file has no internal type errors**

```bash
npx tsc --noEmit 2>&1 | grep StocktakeContent
```
Expected: no errors from `StocktakeContent.tsx` (errors from `page.tsx` about the old props are expected and will be fixed in Task 4)

- [ ] **Step 3: Commit**

```bash
git add src/app/stock/_components/StocktakeContent.tsx
git commit -m "feat: stocktake banner + date picker in StocktakeContent"
```

---

## Task 4: Wire everything in page.tsx

**Files:**
- Modify: `src/app/stock/page.tsx`
- Delete: `src/app/stock/_components/SubmitAllModal.tsx`

This is the integration task. It:
1. Adds `stocktakeDate` state and the three new Firestore state variables
2. Adds a second `useEffect` subscribed to `stocktakeDate` that handles all four stocktake queries (adjustments, beginnings, dailyClose, drafts) — the draft subscription moves here from the first `useEffect`
3. Computes `stocktakeMetrics` separately from `dailyMetrics`
4. Adds `handleStocktakeDateChange`
5. Updates `handleSaveLocation` and `handleSubmitAll` to use `stocktakeDate`
6. Switches the locked check to `stocktakeDayClose`
7. Swaps `SubmitAllModal` for `StocktakeReviewSheet` and passes updated props to both components

- [ ] **Step 1: Update imports**

At the top of `src/app/stock/page.tsx`, replace:
```ts
import { SubmitAllModal } from "./_components/SubmitAllModal";
```
with:
```ts
import { StocktakeReviewSheet } from "./_components/StocktakeReviewSheet";
```

- [ ] **Step 2: Add stocktake-specific state variables**

Find the existing `// Stocktake tab` state block (around line 44):
```ts
  // Stocktake tab
  const [endCounts, setEndCounts] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, StocktakeDraft>>({});
  const [showSubmitAll, setShowSubmitAll] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const draftsInitRef = useRef(false);
```

Replace it with:
```ts
  // Stocktake tab
  const [stocktakeDate, setStocktakeDate] = useState(businessDatePHT);
  const [stocktakeAdjustments, setStocktakeAdjustments] = useState<StockAdjustment[]>([]);
  const [stocktakeBeginnings, setStocktakeBeginnings] = useState<Record<string, number>>({});
  const [stocktakeDayClose, setStocktakeDayClose] = useState<DailyClose | null>(null);
  const [endCounts, setEndCounts] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, StocktakeDraft>>({});
  const [showSubmitAll, setShowSubmitAll] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const draftsInitRef = useRef(false);
```

- [ ] **Step 3: Remove the draft subscription from the first useEffect**

Inside the first `useEffect` (the one that starts with `const session = getSession()`), find and delete the entire draft subscription block:

```ts
    const draftQ = query(collection(db, COLS.stocktakeDrafts), where("branch", "==", b), where("department", "==", dept), where("date", "==", businessDatePHT()));
    const unsubDrafts = onSnapshot(draftQ, snap => {
      const map: Record<string, StocktakeDraft> = {};
      snap.docs.forEach(d => { const dr = d.data() as StocktakeDraft; map[dr.location] = dr; });
      // Populate endCounts from drafts on first load only
      if (!draftsInitRef.current) {
        draftsInitRef.current = true;
        const counts: Record<string, string> = {};
        for (const dr of Object.values(map)) {
          for (const [item, qty] of Object.entries(dr.counts)) {
            counts[item] = String(qty);
          }
        }
        if (Object.keys(counts).length > 0) setEndCounts(counts);
      }
      setDrafts(map);
    });
```

Also update the `return` cleanup at the bottom of that same `useEffect` from:
```ts
    return () => { unsubStock(); unsubAdj(); unsubBeg(); unsubClose(); unsubDrafts(); };
```
to:
```ts
    return () => { unsubStock(); unsubAdj(); unsubBeg(); unsubClose(); };
```

- [ ] **Step 4: Add the second useEffect for stocktake-specific subscriptions**

Insert this new `useEffect` immediately after the first one (after the closing `}, [router]);` line):

```ts
  useEffect(() => {
    if (!branch || !department) return;
    draftsInitRef.current = false;

    const adjQ = query(collection(db, COLS.adjustments), where("branch", "==", branch), where("department", "==", department), where("date", "==", stocktakeDate));
    const unsubAdj = onSnapshot(adjQ, snap => setStocktakeAdjustments(snap.docs.map(d => d.data() as StockAdjustment)));

    const begQ = query(collection(db, COLS.dailyBeginning), where("branch", "==", branch), where("department", "==", department), where("date", "==", stocktakeDate));
    const unsubBeg = onSnapshot(begQ, snap => {
      const map: Record<string, number> = {};
      snap.docs.forEach(d => { const beg = d.data() as DailyBeginning; map[beg.item] = beg.qty; });
      setStocktakeBeginnings(map);
    });

    const closeQ = query(collection(db, COLS.dailyClose), where("branch", "==", branch), where("department", "==", department), where("date", "==", stocktakeDate));
    const unsubClose = onSnapshot(closeQ, snap => {
      setStocktakeDayClose(snap.empty ? null : snap.docs[0].data() as DailyClose);
    });

    const draftQ = query(collection(db, COLS.stocktakeDrafts), where("branch", "==", branch), where("department", "==", department), where("date", "==", stocktakeDate));
    const unsubDrafts = onSnapshot(draftQ, snap => {
      const map: Record<string, StocktakeDraft> = {};
      snap.docs.forEach(d => { const dr = d.data() as StocktakeDraft; map[dr.location] = dr; });
      if (!draftsInitRef.current) {
        draftsInitRef.current = true;
        const counts: Record<string, string> = {};
        for (const dr of Object.values(map)) {
          for (const [item, qty] of Object.entries(dr.counts)) {
            counts[item] = String(qty);
          }
        }
        if (Object.keys(counts).length > 0) setEndCounts(counts);
      }
      setDrafts(map);
    });

    return () => { unsubAdj(); unsubBeg(); unsubClose(); unsubDrafts(); };
  }, [branch, department, stocktakeDate]);
```

- [ ] **Step 5: Add stocktakeMetrics**

Find the existing `useMemo` lines (around line 137):
```ts
  const dailyMetrics = useMemo(() => computeMetrics(deptCatalog, adjustments, beginnings), [deptCatalog, adjustments, beginnings]);
  const summaryMetrics = useMemo(() => computeMetrics(deptCatalog, summaryAdj, summaryBeg), [deptCatalog, summaryAdj, summaryBeg]);
```

Add a third line immediately after:
```ts
  const stocktakeMetrics = useMemo(() => computeMetrics(deptCatalog, stocktakeAdjustments, stocktakeBeginnings), [deptCatalog, stocktakeAdjustments, stocktakeBeginnings]);
```

- [ ] **Step 6: Add handleStocktakeDateChange**

Find `async function handleSaveLocation` and insert this function just before it:

```ts
  function handleStocktakeDateChange(newDate: string) {
    setEndCounts({});
    draftsInitRef.current = false;
    setStocktakeDate(newDate);
  }
```

- [ ] **Step 7: Update handleSaveLocation to use stocktakeDate**

Inside `handleSaveLocation`, find:
```ts
    const draftId = `${branch}__${department}__${today}__${location}`;
    await saveDocById(COLS.stocktakeDrafts, draftId, {
      id: draftId, branch, department, date: today, location,
```
Replace with:
```ts
    const draftId = `${branch}__${department}__${stocktakeDate}__${location}`;
    await saveDocById(COLS.stocktakeDrafts, draftId, {
      id: draftId, branch, department, date: stocktakeDate, location,
```

- [ ] **Step 8: Update handleSubmitAll to use stocktakeDate and stocktakeMetrics**

Inside `handleSubmitAll`, find:
```ts
      const submittedToday = businessDatePHT();
```
Replace with:
```ts
      const submittedToday = stocktakeDate;
```

Then find:
```ts
        const m = dailyMetrics[item.name];
```
Replace with:
```ts
        const m = stocktakeMetrics[item.name];
```

- [ ] **Step 9: Update the locked check and StocktakeCompleted render**

Find:
```tsx
        dayClose?.isLocked
          ? <StocktakeCompleted dayClose={dayClose} />
```
Replace with:
```tsx
        stocktakeDayClose?.isLocked
          ? <StocktakeCompleted dayClose={stocktakeDayClose} />
```

- [ ] **Step 10: Update StocktakeContent props in the render**

Find:
```tsx
          : <StocktakeContent
              items={filtered}
              metrics={dailyMetrics}
              endCounts={endCounts}
              drafts={drafts}
              currentFilter={categoryFilter}
              onCountChange={(item, val) => setEndCounts(prev => ({ ...prev, [item]: val }))}
              onSaveLocation={handleSaveLocation}
              onSubmitAll={() => setShowSubmitAll(true)}
            />
```
Replace with:
```tsx
          : <StocktakeContent
              items={filtered}
              metrics={stocktakeMetrics}
              endCounts={endCounts}
              currentFilter={categoryFilter}
              stocktakeDate={stocktakeDate}
              onDateChange={handleStocktakeDateChange}
              onCountChange={(item, val) => setEndCounts(prev => ({ ...prev, [item]: val }))}
              onSaveLocation={handleSaveLocation}
              onOpenReview={() => setShowSubmitAll(true)}
            />
```

- [ ] **Step 11: Replace SubmitAllModal with StocktakeReviewSheet**

Find the entire `{showSubmitAll && (` block:
```tsx
      {showSubmitAll && (
        <SubmitAllModal
          items={deptCatalog}
          metrics={dailyMetrics}
          endCounts={endCounts}
          drafts={drafts}
          onConfirm={handleSubmitAll}
          onRecount={item => {
            setEndCounts(prev => { const n = { ...prev }; delete n[item]; return n; });
            setShowSubmitAll(false);
          }}
          onClose={() => setShowSubmitAll(false)}
          loading={submitLoading}
        />
      )}
```
Replace with:
```tsx
      {showSubmitAll && (
        <StocktakeReviewSheet
          items={deptCatalog}
          metrics={stocktakeMetrics}
          endCounts={endCounts}
          stocktakeDate={stocktakeDate}
          onConfirm={handleSubmitAll}
          onRecount={item => {
            setEndCounts(prev => { const n = { ...prev }; delete n[item]; return n; });
            setShowSubmitAll(false);
          }}
          onClose={() => setShowSubmitAll(false)}
          loading={submitLoading}
        />
      )}
```

- [ ] **Step 12: Delete SubmitAllModal.tsx**

```bash
rm src/app/stock/_components/SubmitAllModal.tsx
```

- [ ] **Step 13: Full type check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 14: Run the dev server and manually verify**

```bash
npm run dev
```

Open `http://localhost:3000` and verify:
1. Stocktake tab shows date picker (Yesterday / Today) at the top
2. Entering a count shows the amber "Pending Stocktake" banner with the correct count
3. Tapping the banner or the Submit button opens the Stocktake Review sheet
4. Review sheet header shows the correct date and item count
5. "Recount" in the review clears that item's value and closes the sheet
6. "Continue Stocktake" closes the sheet without changes
7. "Submit" fires the submit and completes normally
8. "Save" button is disabled when filter is "All", enabled when a location filter is selected and at least one item in that location has a value
9. Switching dates when counts exist shows the warning sheet; "Keep" dismisses it; "Clear & Switch" clears counts and switches the date
10. Switching dates when no counts are entered switches immediately
11. Grilled Cheese no longer appears in the item list

- [ ] **Step 15: Commit**

```bash
git add src/app/stock/page.tsx src/app/stock/_components/StocktakeContent.tsx
git commit -m "feat: stocktake date picker, banner, and review sheet"
```

---

## Summary

Four commits total:
1. `chore: remove Grilled Cheese from catalog`
2. `feat: add StocktakeReviewSheet component`
3. `feat: stocktake banner + date picker in StocktakeContent`
4. `feat: stocktake date picker, banner, and review sheet` (page.tsx wiring)
