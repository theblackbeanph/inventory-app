# Stocktake Tally Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a green "+" button to each stocktake item row that opens a bottom sheet where staff can type a qty-to-add; the sheet accumulates the count across multiple taps without changing the Firestore data shape.

**Architecture:** A new `TallyAddSheet` component handles the qty-entry UI. `StocktakeContent` gains local state for which item's sheet is open and a per-item tally log (session-only, never written to Firestore). On confirm, the sheet calls the existing `onCountChange` callback with the new accumulated total as a string — identical to typing in the input directly.

**Tech Stack:** React 18, TypeScript, Vitest + @testing-library/react, inline styles (no CSS modules — matches existing codebase pattern).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/app/stock/_components/TallyAddSheet.tsx` | Bottom sheet UI — qty input, running total display, confirm/cancel |
| Modify | `src/app/stock/_components/StocktakeContent.tsx` | Add "+" button per row, open/close sheet state, tally log state |
| Create | `src/app/stock/_components/__tests__/TallyAddSheet.test.tsx` | Unit tests for TallyAddSheet |

---

## Task 1: TallyAddSheet component

**Files:**
- Create: `src/app/stock/_components/TallyAddSheet.tsx`
- Create: `src/app/stock/_components/__tests__/TallyAddSheet.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/app/stock/_components/__tests__/TallyAddSheet.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TallyAddSheet } from "../TallyAddSheet";

describe("TallyAddSheet", () => {
  const baseProps = {
    itemName: "Jasmine Rice",
    packSize: "25 kg / bag",
    currentCount: 10,
    onAdd: vi.fn(),
    onClose: vi.fn(),
  };

  it("renders item name", () => {
    render(<TallyAddSheet {...baseProps} />);
    expect(screen.getByText("Jasmine Rice")).toBeInTheDocument();
  });

  it("confirm button is disabled when input is empty", () => {
    render(<TallyAddSheet {...baseProps} />);
    expect(screen.getByRole("button", { name: /add/i })).toBeDisabled();
  });

  it("confirm button is disabled when input is 0", () => {
    render(<TallyAddSheet {...baseProps} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: /add/i })).toBeDisabled();
  });

  it("shows updated running total as user types", () => {
    render(<TallyAddSheet {...baseProps} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "6" } });
    expect(screen.getByText(/10 → 16/)).toBeInTheDocument();
  });

  it("calls onAdd with parsed qty on confirm", () => {
    const onAdd = vi.fn();
    render(<TallyAddSheet {...baseProps} onAdd={onAdd} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    expect(onAdd).toHaveBeenCalledWith(6);
  });

  it("calls onClose when Cancel is tapped", () => {
    const onClose = vi.fn();
    render(<TallyAddSheet {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop is tapped", () => {
    const onClose = vi.fn();
    render(<TallyAddSheet {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("tally-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/christiancasino/Documents/branch-inventory && npx vitest run src/app/stock/_components/__tests__/TallyAddSheet.test.tsx
```

Expected: FAIL — `Cannot find module '../TallyAddSheet'`

- [ ] **Step 3: Implement TallyAddSheet**

Create `src/app/stock/_components/TallyAddSheet.tsx`:

```tsx
"use client";
import { useState } from "react";

interface TallyAddSheetProps {
  itemName: string;
  packSize: string;
  currentCount: number;
  onAdd: (qty: number) => void;
  onClose: () => void;
}

export function TallyAddSheet({ itemName, packSize, currentCount, onAdd, onClose }: TallyAddSheetProps) {
  const [input, setInput] = useState("");

  const addedQty = parseInt(input, 10);
  const isValid = !isNaN(addedQty) && addedQty > 0;
  const newTotal = isValid ? currentCount + addedQty : null;

  function handleConfirm() {
    if (!isValid) return;
    onAdd(addedQty);
  }

  return (
    <>
      <div
        data-testid="tally-backdrop"
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50 }}
      />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "#fff", borderRadius: "16px 16px 0 0",
        padding: "20px 16px 32px", zIndex: 51,
        boxShadow: "0 -4px 20px rgba(0,0,0,0.12)",
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, background: "#E5E7EB", borderRadius: 2, margin: "0 auto 16px" }} />

        {/* Header */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
          Add qty found
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 14 }}>
          {itemName}
        </div>

        {/* Input row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600, minWidth: 28 }}>
            {packSize}
          </span>
          <input
            type="number"
            inputMode="numeric"
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="0"
            style={{
              flex: 1, height: 52, border: "1.5px solid #1A1A1A",
              borderRadius: 12, fontSize: 26, fontWeight: 700,
              textAlign: "right", paddingRight: 14,
              color: "var(--text)", background: "#F9F9F9", outline: "none",
            }}
          />
        </div>

        {/* Running total */}
        <div style={{
          fontSize: 13, color: "var(--text-secondary)", marginBottom: 16,
          background: "#F9FAFB", borderRadius: 8, padding: "8px 12px",
          display: "flex", justifyContent: "space-between",
        }}>
          <span>Running total</span>
          <span style={{ fontWeight: 700, color: "var(--text)" }}>
            {newTotal !== null ? `${currentCount} → ${newTotal}` : `${currentCount}`}
          </span>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, height: 44, borderRadius: 12,
              border: "1.5px solid var(--border)", fontWeight: 700, fontSize: 15,
              background: "#fff", color: "var(--text)", cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            style={{
              flex: 2, height: 44, borderRadius: 12, border: "none",
              fontWeight: 700, fontSize: 15,
              background: isValid ? "#16A34A" : "#E5E7EB",
              color: isValid ? "#fff" : "var(--text-secondary)",
              cursor: isValid ? "pointer" : "not-allowed",
              boxShadow: isValid ? "0 2px 8px rgba(22,163,74,0.25)" : "none",
            }}
          >
            {isValid ? `+ Add ${addedQty}` : "Add"}
          </button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/christiancasino/Documents/branch-inventory && npx vitest run src/app/stock/_components/__tests__/TallyAddSheet.test.tsx
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/christiancasino/Documents/branch-inventory && git add src/app/stock/_components/TallyAddSheet.tsx src/app/stock/_components/__tests__/TallyAddSheet.test.tsx && git commit -m "feat: add TallyAddSheet component for stocktake tally counting"
```

---

## Task 2: Wire TallyAddSheet into StocktakeContent

**Files:**
- Modify: `src/app/stock/_components/StocktakeContent.tsx`

- [ ] **Step 1: Add tally state and import**

At the top of `StocktakeContent.tsx`, add the import and two new state variables inside the component function.

Replace the existing imports at line 1–5:

```tsx
"use client";
import { useState, useEffect } from "react";
import { CATALOG, LOCATIONS } from "@/lib/items";
import type { DailyMetrics, FilterTab } from "../_lib/helpers";
import { businessDatePHT, addDays } from "../_lib/helpers";
import { TallyAddSheet } from "./TallyAddSheet";
```

Inside the `StocktakeContent` function body, after the existing `useState` declarations (after line 20 `const [saveStatus, ...]`), add:

```tsx
  // Which item has the tally sheet open (null = closed)
  const [tallyItem, setTallyItem] = useState<typeof CATALOG[number] | null>(null);
  // Per-item session tally log — not persisted, purely visual feedback
  const [tallyLog, setTallyLog] = useState<Record<string, number[]>>({});

  // Clear tally log when date changes (endCounts will also be cleared by parent)
  useEffect(() => {
    setTallyLog({});
  }, [stocktakeDate]);
```

- [ ] **Step 2: Add the "+" button to each item row and render TallyAddSheet**

Replace the entire item row `<div>` (lines 108–133 in the original file — the `{items.map(item => { ... })}` block) with:

```tsx
        {items.map(item => {
          const m = metrics[item.name];
          const expected = m.beginning !== null ? m.beginning + m.inQty - m.outQty : null;
          const val = endCounts[item.name] ?? "";
          const log = tallyLog[item.name] ?? [];
          return (
            <div key={item.name} style={{ background: "#fff", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
                <button
                  onClick={() => setTallyItem(item)}
                  aria-label={`Add more ${item.name}`}
                  style={{
                    width: 40, height: 40, borderRadius: 10, border: "none",
                    background: "#16A34A", color: "#fff",
                    fontSize: 24, fontWeight: 300, lineHeight: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", flexShrink: 0,
                    boxShadow: "0 2px 6px rgba(22,163,74,0.25)",
                  }}
                >
                  +
                </button>
              </div>
              {log.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                  {log.map((qty, i) => (
                    <span key={i} style={{
                      fontSize: 11, background: "#F0FDF4", color: "#166534",
                      padding: "2px 7px", borderRadius: 20,
                      border: "1px solid #BBF7D0", fontWeight: 600,
                    }}>
                      +{qty}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
```

- [ ] **Step 3: Render TallyAddSheet and wire up the onAdd handler**

At the very bottom of the returned JSX, just before the closing `</div>` of the outer wrapper (after the date-change warning sheet block, before line 200's closing `</div>`), add:

```tsx
      {/* Tally add sheet */}
      {tallyItem && (
        <TallyAddSheet
          itemName={tallyItem.name}
          packSize={tallyItem.packSize}
          currentCount={parseInt(endCounts[tallyItem.name] ?? "0", 10) || 0}
          onAdd={(qty) => {
            const current = parseInt(endCounts[tallyItem.name] ?? "0", 10) || 0;
            onCountChange(tallyItem.name, String(current + qty));
            setTallyLog(prev => ({
              ...prev,
              [tallyItem.name]: [...(prev[tallyItem.name] ?? []), qty],
            }));
            setTallyItem(null);
          }}
          onClose={() => setTallyItem(null)}
        />
      )}
```

- [ ] **Step 4: Run the full test suite to check for regressions**

```bash
cd /Users/christiancasino/Documents/branch-inventory && npx vitest run
```

Expected: All existing tests pass, plus the 7 TallyAddSheet tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/christiancasino/Documents/branch-inventory && git add src/app/stock/_components/StocktakeContent.tsx && git commit -m "feat: wire TallyAddSheet into stocktake item rows"
```

---

## Task 3: Manual smoke test

- [ ] **Step 1: Start dev server**

```bash
cd /Users/christiancasino/Documents/branch-inventory && npm run dev
```

- [ ] **Step 2: Verify the happy path**

1. Open http://localhost:3000/stock and navigate to the Stocktake tab.
2. Tap "+" on any item — confirm the bottom sheet opens with the correct item name.
3. Type a qty (e.g. 10) — confirm the running total shows `0 → 10` and the confirm button reads `+ Add 10`.
4. Tap confirm — confirm the number input updates to 10 and a green `+10` pill appears below the row.
5. Tap "+" again on the same item, type 6 — confirm running total shows `10 → 16`, tap confirm — input is now 16, pills show `+10  +6`.
6. Manually type a number directly into the input — confirm it still works as before and the pills remain.
7. Tap the backdrop (outside the sheet) — confirm the sheet closes without changing the count.
8. Switch the date pill — confirm tally pills clear.
9. Tap Submit — confirm the review sheet shows the correct totals (no change to submit flow).
