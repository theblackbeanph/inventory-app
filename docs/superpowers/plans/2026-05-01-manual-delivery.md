# Manual Delivery Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Delivery sub-tab to the Stock page so staff can manually log stock received from commissary, writing `type: "in"` adjustments to Firestore.

**Architecture:** Three new files (`DeliveryDraft` type, `DeliveryContent.tsx`, `DeliveryReviewSheet.tsx`) plus targeted additions to `types.ts`, `firebase.ts`, `helpers.ts`, and `page.tsx`. The delivery tab mirrors Stocktake's UX (date picker, banner, item list, Save + Submit) but has no per-location scope and no lock — multiple deliveries per day are allowed; after submit the UI resets.

**Tech Stack:** Next.js App Router, React (`useState`, `useEffect`, `useRef`, `useMemo`), Firebase Firestore v9 modular SDK, TypeScript, Vitest + jsdom.

---

## File Map

| File | Change |
|---|---|
| `src/lib/types.ts` | Add `DeliveryDraft` interface |
| `src/lib/firebase.ts` | Add `deliveryDrafts: "delivery_drafts"` to `COLS` |
| `src/app/stock/_lib/helpers.ts` | Add `"delivery"` to `SubTab` union |
| `src/app/stock/_components/DeliveryContent.tsx` | **Create** — counting screen |
| `src/app/stock/_components/DeliveryReviewSheet.tsx` | **Create** — review overlay |
| `src/app/stock/page.tsx` | Add delivery state, useEffect, handlers, sub-tab nav, render |

---

### Task 1: Types, constants, and SubTab

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/firebase.ts`
- Modify: `src/app/stock/_lib/helpers.ts`

- [ ] **Step 1: Add `DeliveryDraft` interface to `src/lib/types.ts`**

Add after the `StocktakeDraft` interface (line 187):

```ts
export interface DeliveryDraft {
  id: string;         // `${branch}__${department}__${date}`
  branch: Branch;
  department: Department;
  date: string;       // YYYY-MM-DD
  counts: Record<string, number>;
  savedAt: string;    // ISO timestamp
  savedBy: string;
}
```

- [ ] **Step 2: Add `deliveryDrafts` to `COLS` in `src/lib/firebase.ts`**

Add after `stocktakeDrafts` on line 42:

```ts
  stocktakeDrafts:    "stocktake_drafts",
  deliveryDrafts:     "delivery_drafts",
```

- [ ] **Step 3: Add `"delivery"` to `SubTab` in `src/app/stock/_lib/helpers.ts`**

Change line 4:

```ts
export type SubTab = "daily" | "delivery" | "manualcount";
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`

Expected: no TypeScript errors, build completes successfully.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/firebase.ts src/app/stock/_lib/helpers.ts
git commit -m "feat: add DeliveryDraft type, deliveryDrafts collection, delivery SubTab"
```

---

### Task 2: `DeliveryContent.tsx`

**Files:**
- Create: `src/app/stock/_components/DeliveryContent.tsx`

- [ ] **Step 1: Create `src/app/stock/_components/DeliveryContent.tsx`**

```tsx
"use client";
import { useState } from "react";
import { CATALOG } from "@/lib/items";
import type { BranchStock } from "@/lib/types";
import { businessDatePHT, addDays } from "../_lib/helpers";
import type { FilterTab } from "../_lib/helpers";

export function DeliveryContent({ items, stocks, deliveryCounts, deliveryDate, onDateChange, onCountChange, onSaveDelivery, onOpenReview }: {
  items: typeof CATALOG;
  stocks: Record<string, BranchStock>;
  deliveryCounts: Record<string, string>;
  deliveryDate: string;
  onDateChange: (date: string) => void;
  onCountChange: (item: string, val: string) => void;
  onSaveDelivery: () => Promise<void>;
  onOpenReview: () => void;
}) {
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const today = businessDatePHT();
  const yesterday = addDays(today, -1);
  const dateOptions = [
    { date: yesterday, label: "Yesterday" },
    { date: today,     label: "Today"     },
  ];

  const totalEntered = Object.values(deliveryCounts).filter(v => v !== "").length;
  const canSave = totalEntered > 0;

  function handleDatePillClick(newDate: string) {
    if (newDate === deliveryDate) return;
    if (Object.values(deliveryCounts).some(v => v !== "")) {
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

  async function handleSave() {
    setSaveStatus("saving");
    await onSaveDelivery();
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Date picker */}
      <div style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "8px 16px", display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Date:</span>
        <div style={{ display: "flex", gap: 4 }}>
          {dateOptions.map(({ date, label }) => {
            const isSelected = date === deliveryDate;
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

      {/* Pending delivery banner */}
      {totalEntered > 0 ? (
        <button onClick={onOpenReview} style={{
          width: "100%", background: "#EFF6FF", borderBottom: "1px solid #BFDBFE",
          borderTop: "none", borderLeft: "none", borderRight: "none",
          padding: "10px 16px", display: "flex", justifyContent: "space-between",
          alignItems: "center", cursor: "pointer", textAlign: "left" as const,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#1D4ED8" }}>Pending Delivery</div>
            <div style={{ fontSize: 11, color: "#3B82F6", marginTop: 2 }}>
              {totalEntered} of {items.length} items entered · tap to review
            </div>
          </div>
          <span style={{ fontSize: 16, color: "#3B82F6" }}>›</span>
        </button>
      ) : (
        <div style={{ background: "#F9FAFB", borderBottom: "1px solid var(--border)", padding: "10px 16px" }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>No delivery started</div>
        </div>
      )}

      {/* Item list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {items.map(item => {
          const currentStock = stocks[item.name]?.qty ?? null;
          const val = deliveryCounts[item.name] ?? "";
          return (
            <div key={item.name} style={{ background: "#fff", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  {item.packSize}
                  {currentStock !== null && <span> · Stock: <strong>{currentStock}</strong></span>}
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
          onClick={handleSave}
          disabled={!canSave || saveStatus === "saving"}
          style={{
            flex: 1, padding: "15px 0", borderRadius: 14,
            border: `1.5px solid ${saveStatus === "saved" ? "#16A34A" : "var(--border)"}`,
            fontWeight: 700, fontSize: 14,
            cursor: canSave && saveStatus !== "saving" ? "pointer" : "not-allowed",
            background: saveStatus === "saved" ? "#F0FDF4" : "#fff",
            color: saveStatus === "saved" ? "#16A34A" : canSave ? "var(--text)" : "var(--text-secondary)",
            transition: "background 0.2s, border-color 0.2s, color 0.2s",
          }}
        >
          {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : "Save"}
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
              <strong style={{ color: "var(--text)" }}>{totalEntered} unsaved {totalEntered !== 1 ? "entries" : "entry"}</strong>
              {" "}for {deliveryDate === today ? "today" : "yesterday"}. Switching dates will clear them.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowWarning(false)}
                style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "1.5px solid var(--border)", fontWeight: 600, fontSize: 13, background: "#fff", color: "var(--text-secondary)", cursor: "pointer" }}
              >
                Keep {deliveryDate === today ? "today" : "yesterday"}
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

- [ ] **Step 2: Verify build passes**

Run: `npm run build`

Expected: no TypeScript errors, build completes successfully.

- [ ] **Step 3: Commit**

```bash
git add src/app/stock/_components/DeliveryContent.tsx
git commit -m "feat: add DeliveryContent counting screen"
```

---

### Task 3: `DeliveryReviewSheet.tsx`

**Files:**
- Create: `src/app/stock/_components/DeliveryReviewSheet.tsx`

- [ ] **Step 1: Create `src/app/stock/_components/DeliveryReviewSheet.tsx`**

```tsx
import { CATALOG } from "@/lib/items";
import type { BranchStock } from "@/lib/types";
import { formatDate } from "../_lib/helpers";

export function DeliveryReviewSheet({ items, stocks, deliveryCounts, deliveryDate, onRecount, onConfirm, onClose, loading }: {
  items: typeof CATALOG;
  stocks: Record<string, BranchStock>;
  deliveryCounts: Record<string, string>;
  deliveryDate: string;
  onRecount: (item: string) => void;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  loading: boolean;
}) {
  const entered = items.filter(i => deliveryCounts[i.name] !== undefined && deliveryCounts[i.name] !== "");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "#fff", overflowY: "auto" }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Delivery Review</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
            {formatDate(deliveryDate)} · {entered.length} item{entered.length !== 1 ? "s" : ""} received
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: "var(--text-secondary)", cursor: "pointer", padding: "2px 6px" }}>✕</button>
      </div>

      {/* Item list */}
      <div>
        {entered.map(item => {
          const qty = Number(deliveryCounts[item.name]);
          const currentStock = stocks[item.name]?.qty ?? 0;
          const newStock = currentStock + qty;
          return (
            <div key={item.name} style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{item.packSize}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#1D4ED8" }}>+{qty}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>→ {newStock}</div>
                </div>
                <button
                  onClick={() => onRecount(item.name)}
                  style={{ padding: "5px 10px", borderRadius: 8, border: "1.5px solid var(--border)", background: "#fff", color: "var(--text-secondary)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  Recount
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom buttons */}
      <div style={{ position: "sticky", bottom: 0, background: "#fff", borderTop: "1px solid var(--border)", padding: "12px 16px 32px", display: "flex", gap: 8 }}>
        <button
          onClick={onClose}
          style={{ flex: 1, padding: "14px 0", borderRadius: 14, border: "1.5px solid var(--border)", fontWeight: 700, fontSize: 14, background: "#fff", color: "var(--text)", cursor: "pointer" }}
        >
          Continue
        </button>
        <button
          onClick={onConfirm}
          disabled={loading || entered.length === 0}
          style={{
            flex: 1, padding: "14px 0", borderRadius: 14, border: "none", fontWeight: 700, fontSize: 14,
            background: loading || entered.length === 0 ? "#E8E8E4" : "#1A1A1A",
            color: loading || entered.length === 0 ? "var(--text-secondary)" : "#fff",
            cursor: loading || entered.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Submitting..." : "Submit"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`

Expected: no TypeScript errors, build completes successfully.

- [ ] **Step 3: Commit**

```bash
git add src/app/stock/_components/DeliveryReviewSheet.tsx
git commit -m "feat: add DeliveryReviewSheet overlay"
```

---

### Task 4: Wire `page.tsx`

**Files:**
- Modify: `src/app/stock/page.tsx`

Context: `page.tsx` currently has two sub-tabs (`"daily"` and `"manualcount"`). This task wires in the delivery tab between them. The `stocks` state (already subscribed in the first `useEffect`) provides current stock levels for the delivery UI. The `deptCatalog` and `filtered` memos are already computed and can be reused.

- [ ] **Step 1: Add imports to `page.tsx`**

Update the import block at the top of `src/app/stock/page.tsx`.

Change line 8:
```ts
import type { Branch, Department, BranchStock, StockAdjustment, DailyBeginning, DailyClose, StocktakeDraft } from "@/lib/types";
```
to:
```ts
import type { Branch, Department, BranchStock, StockAdjustment, DailyBeginning, DailyClose, StocktakeDraft, DeliveryDraft } from "@/lib/types";
```

Change line 7 (add `deleteDoc`):
```ts
import { collection, onSnapshot, query, where, getDocs, writeBatch, doc, deleteDoc } from "@/lib/firebase";
```

Add to the component import block (after `StocktakeReviewSheet` import):
```ts
import { DeliveryContent } from "./_components/DeliveryContent";
import { DeliveryReviewSheet } from "./_components/DeliveryReviewSheet";
```

- [ ] **Step 2: Add delivery state variables in `page.tsx`**

After the stocktake state block (after line 53: `const draftsInitRef = useRef(false);`), add:

```ts
  // Delivery tab
  const [deliveryDate, setDeliveryDate] = useState(businessDatePHT);
  const [deliveryCounts, setDeliveryCounts] = useState<Record<string, string>>({});
  const [showDeliveryReview, setShowDeliveryReview] = useState(false);
  const [deliverySubmitLoading, setDeliverySubmitLoading] = useState(false);
  const deliveryDraftsInitRef = useRef(false);
```

- [ ] **Step 3: Add delivery `useEffect` in `page.tsx`**

After the stocktake `useEffect` (after line 131: `}, [branch, department, stocktakeDate]);`), add:

```ts
  useEffect(() => {
    if (!branch || !department) return;
    deliveryDraftsInitRef.current = false;

    const draftId = `${branch}__${department}__${deliveryDate}`;
    const draftRef = doc(db, COLS.deliveryDrafts, draftId);
    const unsub = onSnapshot(draftRef, snap => {
      if (!deliveryDraftsInitRef.current) {
        deliveryDraftsInitRef.current = true;
        if (snap.exists()) {
          const draft = snap.data() as DeliveryDraft;
          const counts: Record<string, string> = {};
          for (const [item, qty] of Object.entries(draft.counts)) {
            counts[item] = String(qty);
          }
          if (Object.keys(counts).length > 0) setDeliveryCounts(counts);
        }
      }
    });
    return () => unsub();
  }, [branch, department, deliveryDate]);
```

- [ ] **Step 4: Add delivery handlers in `page.tsx`**

After `handleStocktakeDateChange` (after line 176: `}`), add:

```ts
  function handleDeliveryDateChange(newDate: string) {
    setDeliveryCounts({});
    setDeliveryDate(newDate);
  }

  async function handleDeliverySave() {
    if (!branch || !department) return;
    const session = getSession();
    const counts: Record<string, number> = {};
    for (const [item, val] of Object.entries(deliveryCounts)) {
      if (val !== "") {
        const n = Number(val);
        if (!isNaN(n) && n >= 0) counts[item] = n;
      }
    }
    await auth.authStateReady();
    const draftId = `${branch}__${department}__${deliveryDate}`;
    await saveDocById(COLS.deliveryDrafts, draftId, {
      id: draftId, branch, department, date: deliveryDate,
      counts, savedAt: new Date().toISOString(),
      savedBy: session?.displayName ?? BRANCH_LABELS[branch],
    });
  }

  async function handleDeliverySubmit() {
    if (!branch || !department) return;
    setDeliverySubmitLoading(true);
    try {
      await auth.authStateReady();
      const loggedBy = getSession()?.displayName ?? BRANCH_LABELS[branch];
      const batch = writeBatch(db);
      const now = Date.now();
      for (const item of deptCatalog) {
        const val = deliveryCounts[item.name];
        if (val === undefined || val === "") continue;
        const qty = Number(val);
        if (isNaN(qty) || qty <= 0) continue;
        const adjRef = doc(collection(db, COLS.adjustments));
        batch.set(adjRef, {
          id: now + Math.random(), branch, department, date: deliveryDate,
          item: item.name, type: "in", qty, loggedBy, note: "manual delivery",
        });
      }
      await batch.commit();

      const draftId = `${branch}__${department}__${deliveryDate}`;
      await deleteDoc(doc(db, COLS.deliveryDrafts, draftId));

      setDeliveryCounts({});
      setShowDeliveryReview(false);
    } finally {
      setDeliverySubmitLoading(false);
    }
  }
```

- [ ] **Step 5: Update sub-tab nav in `page.tsx`**

Find the sub-tabs array (around line 302):
```ts
          {([
            { id: "daily",       label: "Daily" },
            { id: "manualcount", label: "Stocktake" },
          ] as { id: SubTab; label: string }[]).map(tab => (
```

Replace with:
```ts
          {([
            { id: "daily",       label: "Daily" },
            { id: "delivery",    label: "Delivery" },
            { id: "manualcount", label: "Stocktake" },
          ] as { id: SubTab; label: string }[]).map(tab => (
```

- [ ] **Step 6: Add `DeliveryContent` render in `page.tsx`**

After the `{subTab === "daily" && ...}` block (after line 341), add:

```tsx
      {subTab === "delivery" && (
        <DeliveryContent
          items={filtered}
          stocks={stocks}
          deliveryCounts={deliveryCounts}
          deliveryDate={deliveryDate}
          onDateChange={handleDeliveryDateChange}
          onCountChange={(item, val) => setDeliveryCounts(prev => ({ ...prev, [item]: val }))}
          onSaveDelivery={handleDeliverySave}
          onOpenReview={() => setShowDeliveryReview(true)}
        />
      )}
```

- [ ] **Step 7: Add `DeliveryReviewSheet` render in `page.tsx`**

After the `{showSubmitAll && ...}` block (after line 372), add:

```tsx
      {showDeliveryReview && (
        <DeliveryReviewSheet
          items={deptCatalog}
          stocks={stocks}
          deliveryCounts={deliveryCounts}
          deliveryDate={deliveryDate}
          onConfirm={handleDeliverySubmit}
          onRecount={item => {
            setDeliveryCounts(prev => { const n = { ...prev }; delete n[item]; return n; });
          }}
          onClose={() => setShowDeliveryReview(false)}
          loading={deliverySubmitLoading}
        />
      )}
```

- [ ] **Step 8: Verify build passes**

Run: `npm run build`

Expected: no TypeScript errors, all 17 routes build successfully.

- [ ] **Step 9: Run tests**

Run: `npx vitest run`

Expected: all existing tests pass (no regressions).

- [ ] **Step 10: Commit**

```bash
git add src/app/stock/page.tsx
git commit -m "feat: wire delivery tab into stock page"
```
