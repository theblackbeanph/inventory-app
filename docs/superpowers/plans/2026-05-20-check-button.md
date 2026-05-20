# Check Button (Active Order Detail) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-item checkbox to `ActiveDetail` so branch staff can mark items as physically verified while receiving a delivery.

**Architecture:** Pure React state (`Set<string>`) added to `ActiveDetail` in `OrdersContent.tsx`. No Firestore writes, no type changes. Checkbox sits left of each item name; a progress counter row sits between the info banner and the item list.

**Tech Stack:** React `useState`, existing inline styles, `@testing-library/react` + vitest for the one extractable helper.

---

## File Map

| File | Change |
|---|---|
| `src/app/transfers/_components/OrdersContent.tsx` | Add `checkedItems` state + checkbox UI + progress counter to `ActiveDetail` |

No new files. No other files touched.

---

### Task 1: Add `checkedItems` state to `ActiveDetail`

**Files:**
- Modify: `src/app/transfers/_components/OrdersContent.tsx` — `ActiveDetail` function (line ~286)

- [ ] **Step 1: Add the `checkedItems` state**

Inside `ActiveDetail`, after the existing `useState` declarations (around line 301), add:

```tsx
const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

function toggleChecked(itemName: string) {
  setCheckedItems(prev => {
    const next = new Set(prev);
    if (next.has(itemName)) next.delete(itemName); else next.add(itemName);
    return next;
  });
}
```

- [ ] **Step 2: Verify the app still compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/transfers/_components/OrdersContent.tsx
git commit -m "feat(orders): add checkedItems state to ActiveDetail"
```

---

### Task 2: Add the progress counter row

**Files:**
- Modify: `src/app/transfers/_components/OrdersContent.tsx` — inside the `{dn && (<>…</>)}` block in `ActiveDetail`

- [ ] **Step 1: Insert the progress counter between the info banner and the item list**

The info banner ends with `</div>` around the `"Verify each quantity received…"` text. Insert the progress row immediately after it, before the `{dn.items.map(…)}` call:

```tsx
<div style={{ background: "#FFF", borderRadius: 10, padding: "10px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
  <div style={{ fontSize: 13, color: "#555", fontWeight: 500 }}>Items checked</div>
  <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>
    {checkedItems.size} <span style={{ color: "#888", fontWeight: 400 }}>of {dn.items.length}</span>
  </div>
</div>
```

- [ ] **Step 2: Verify the app still compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/transfers/_components/OrdersContent.tsx
git commit -m "feat(orders): add checked progress counter to ActiveDetail"
```

---

### Task 3: Add checkbox and visual states to each item row

**Files:**
- Modify: `src/app/transfers/_components/OrdersContent.tsx` — the `dn.items.map(item => …)` block inside `ActiveDetail`

- [ ] **Step 1: Derive per-item checked state and compute row styles**

Inside the `.map(item => {` callback, after the existing `isDiff` declaration, add:

```tsx
const isChecked = checkedItems.has(item.item);
const rowBg     = isChecked && isDiff ? "#FFF5F5" : isChecked ? "#F0FDF4" : "#FFF";
const rowBorder = isDiff ? "4px solid #DC2626" : isChecked ? "4px solid #059669" : "4px solid transparent";
```

- [ ] **Step 2: Replace the row's existing `borderLeft` and `background` with the computed values**

Find the item row `<div>` that currently has:
```tsx
style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", borderLeft: isDiff ? "4px solid #DC2626" : "4px solid transparent" }}
```

Replace with:
```tsx
style={{ background: rowBg, borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", borderLeft: rowBorder }}
```

- [ ] **Step 3: Add the checkbox as the first child of the row's inner flex container**

The row's inner `<div>` currently opens with:
```tsx
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
```

Add the checkbox immediately inside it, before the item name `<div>`:

```tsx
<button
  onClick={() => toggleChecked(item.item)}
  aria-label={isChecked ? "Uncheck item" : "Check item"}
  style={{
    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
    border: `2px solid ${isChecked ? "#059669" : "#D1D5DB"}`,
    background: isChecked ? "#059669" : "transparent",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    padding: 0,
  }}
>
  {isChecked && (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={3}>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )}
</button>
```

- [ ] **Step 4: Dim the qty controls when an item is checked with no discrepancy**

Find the `<div style={{ display: "flex", alignItems: "center", gap: 6 }}>` that wraps the −/input/+ controls. Add `opacity` to it:

```tsx
<div style={{ display: "flex", alignItems: "center", gap: 6, opacity: isChecked && !isDiff ? 0.45 : 1 }}>
```

- [ ] **Step 5: Verify the app compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/transfers/_components/OrdersContent.tsx
git commit -m "feat(orders): add per-item check checkbox to ActiveDetail"
```

---

### Task 4: Manual verification

**Files:** none

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Navigate to Orders → Active tab**

Open the app in the browser. Sign in as a branch user. Go to `/transfers`, select the Active tab, and open a dispatched order that has a delivery note.

- [ ] **Step 3: Verify checkbox behaviour**

Check each of the following:

1. Each item row shows an empty checkbox on the left.
2. Tapping a checkbox fills it green and turns the row green (if no discrepancy).
3. Tapping it again unfills it and the row returns to white.
4. The "Items checked X of Y" counter increments/decrements correctly.
5. For a row where the received qty differs from dispatched qty (red border), tapping the checkbox fills it green but the red border stays dominant.
6. Qty controls for a checked (no-discrepancy) row appear dimmed; they are still interactive.
7. The Confirm Receipt button works normally regardless of check state.

- [ ] **Step 4: Commit if any tweaks were made during manual testing**

```bash
git add src/app/transfers/_components/OrdersContent.tsx
git commit -m "fix(orders): tweak check button styling after manual test"
```
