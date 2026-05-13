# Incomplete PO Indicators + Reprint DR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show incomplete PO indicators (ordered vs. dispatched, fulfillment %) on order cards and item rows, and add a Reprint DR button in the History detail that prints a combined dispatch + received receipt.

**Architecture:** Pure helper functions (`isIncomplete`, `fulfillmentPct`) live in a new `_lib/helpers.ts` file and are unit-tested. The print utility (`generateBranchDR`) lives in `_lib/print.ts` and mirrors the commissary app's `generateDispatchPDF` pattern (Blob + `URL.createObjectURL` — no `document.write`). All UI changes are in the existing `OrdersContent.tsx`.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest (jsdom), Firestore (no schema changes)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/app/transfers/_lib/helpers.ts` | `isIncomplete`, `fulfillmentPct` pure functions |
| Create | `src/app/transfers/_lib/helpers.test.ts` | Unit tests for the two helpers |
| Create | `src/app/transfers/_lib/print.ts` | `generateBranchDR` — Blob → new tab → print dialog |
| Modify | `src/app/transfers/_components/OrdersContent.tsx` | Import helpers + print; update list cards, ActiveDetail rows, HistoryDetail rows + Reprint DR button |

---

## Task 1: Helper functions (TDD)

**Files:**
- Create: `src/app/transfers/_lib/helpers.ts`
- Create: `src/app/transfers/_lib/helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/transfers/_lib/helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isIncomplete, fulfillmentPct } from "./helpers";
import type { DeliveryNote } from "@/lib/types";

function makeDN(items: { requestedQty: number; dispatchedQty: number }[]): DeliveryNote {
  return {
    id: "dn1", dnRef: "DN-001", poRef: "PO-001", pullOutId: "po1",
    branch: "BF", dispatchedAt: "2026-05-13", dispatchedBy: "Test",
    items: items.map((i, idx) => ({ item: `Item${idx}`, ...i, unit: "pc" })),
    status: "RECEIVED",
  };
}

describe("isIncomplete", () => {
  it("returns false when all items fully dispatched", () => {
    expect(isIncomplete(makeDN([{ requestedQty: 10, dispatchedQty: 10 }]))).toBe(false);
  });
  it("returns true when any item is short", () => {
    expect(isIncomplete(makeDN([
      { requestedQty: 10, dispatchedQty: 10 },
      { requestedQty: 5,  dispatchedQty: 3  },
    ]))).toBe(true);
  });
  it("returns false for empty items list", () => {
    expect(isIncomplete(makeDN([]))).toBe(false);
  });
});

describe("fulfillmentPct", () => {
  it("returns 100 when all items fully dispatched", () => {
    expect(fulfillmentPct(makeDN([{ requestedQty: 10, dispatchedQty: 10 }]))).toBe(100);
  });
  it("rounds correctly — 30 of 35 is 86%", () => {
    expect(fulfillmentPct(makeDN([{ requestedQty: 35, dispatchedQty: 30 }]))).toBe(86);
  });
  it("sums across multiple items", () => {
    // total: 15, sent: 13 → 86.66 → 87
    expect(fulfillmentPct(makeDN([
      { requestedQty: 10, dispatchedQty: 10 },
      { requestedQty: 5,  dispatchedQty: 3  },
    ]))).toBe(87);
  });
  it("returns 100 for empty items list", () => {
    expect(fulfillmentPct(makeDN([]))).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/christiancasino/Documents/branch-inventory
npx vitest run src/app/transfers/_lib/helpers.test.ts
```

Expected: error — `Cannot find module './helpers'`

- [ ] **Step 3: Implement helpers**

Create `src/app/transfers/_lib/helpers.ts`:

```ts
import type { DeliveryNote } from "@/lib/types";

export function isIncomplete(dn: DeliveryNote): boolean {
  return dn.items.some(i => i.dispatchedQty < i.requestedQty);
}

export function fulfillmentPct(dn: DeliveryNote): number {
  const total = dn.items.reduce((s, i) => s + i.requestedQty, 0);
  const sent  = dn.items.reduce((s, i) => s + i.dispatchedQty, 0);
  return total > 0 ? Math.round((sent / total) * 100) : 100;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/app/transfers/_lib/helpers.test.ts
```

Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/transfers/_lib/helpers.ts src/app/transfers/_lib/helpers.test.ts
git commit -m "feat(orders): add isIncomplete and fulfillmentPct helpers"
```

---

## Task 2: Incomplete indicators on list cards

**Files:**
- Modify: `src/app/transfers/_components/OrdersContent.tsx:1-6` (imports)
- Modify: `src/app/transfers/_components/OrdersContent.tsx:135-175` (list card rendering)

- [ ] **Step 1: Add import**

At the top of `OrdersContent.tsx`, add after the existing imports:

```ts
import { isIncomplete, fulfillmentPct } from "../_lib/helpers";
```

- [ ] **Step 2: Replace the list card block**

Replace the entire `{list.map(po => { ... })}` block (lines 135–175 in the original file) with:

```tsx
{list.map(po => {
  const dn = tab === "pending"
    ? undefined
    : deliveryNotes.find(d => d.pullOutId === po.id);
  const incomplete = dn ? isIncomplete(dn) : false;
  const pct        = dn && incomplete ? fulfillmentPct(dn) : 100;
  return (
    <div
      key={po.id}
      onClick={() => openDetail(po)}
      style={{
        background: "#FFF", borderRadius: 14, padding: "14px 16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)", cursor: "pointer",
        borderLeft: `4px solid ${cardBorderColor(po.status)}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{po.poRef}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {incomplete && (
            <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "3px 10px", background: "#FEF3C7", color: "#D97706" }}>
              Incomplete
            </span>
          )}
          <span style={statusBadgeStyle(po.status)}>{STATUS_LABEL[po.status]}</span>
        </div>
      </div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        {formatDay(po.requestedAt)} · {po.items.length} item{po.items.length !== 1 ? "s" : ""}
        {incomplete ? ` · ${pct}% fulfilled` : ""}
      </div>
      {tab === "active" && (
        <div style={{ marginTop: 6 }}>
          {dn ? (
            <>
              <div style={{ fontSize: 12, color: "#4338CA", fontWeight: 600 }}>{dn.dnRef}</div>
              <div style={{ fontSize: 12, color: "#4338CA" }}>Tap to confirm receipt →</div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Awaiting delivery note…</div>
          )}
        </div>
      )}
      {tab === "history" && ["DISCREPANCY", "DISPUTED"].includes(po.status) && (
        <div style={{ marginTop: 6, fontSize: 12, color: "#D97706" }}>
          Discrepancy on file — place a new order if needed
        </div>
      )}
    </div>
  );
})}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/transfers/_components/OrdersContent.tsx
git commit -m "feat(orders): show Incomplete badge and fulfillment % on list cards"
```

---

## Task 3: Ordered → Dispatched diff in ActiveDetail item rows

**Files:**
- Modify: `src/app/transfers/_components/OrdersContent.tsx` — `ActiveDetail` item row subtitle

- [ ] **Step 1: Replace the item subtitle in the ActiveDetail item map**

Find this exact block inside the `ActiveDetail` component's `dn.items.map(item => ...)`:

```tsx
<div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
  {CATALOG_MAP.get(item.item)?.packSize ?? "1 pc"} · Dispatched: <strong>{item.dispatchedQty}</strong>
</div>
```

Replace with:

```tsx
<div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
  {CATALOG_MAP.get(item.item)?.packSize ?? "1 pc"}
  {item.dispatchedQty < item.requestedQty ? (
    <>
      {" · "}
      <span>Ordered: {item.requestedQty}</span>
      {" "}
      <span style={{ color: "#D97706", fontWeight: 600 }}>→ Dispatched: {item.dispatchedQty}</span>
    </>
  ) : (
    <> · Dispatched: <strong>{item.dispatchedQty}</strong></>
  )}
</div>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/transfers/_components/OrdersContent.tsx
git commit -m "feat(orders): show ordered vs dispatched diff in active order item rows"
```

---

## Task 4: Ordered → Dispatched diff in HistoryDetail item rows

**Files:**
- Modify: `src/app/transfers/_components/OrdersContent.tsx` — `HistoryDetail` item row

- [ ] **Step 1: Replace the HistoryDetail item map block**

Find the `po.items.map(item => { ... })` inside `HistoryDetail` and replace the entire map callback with:

```tsx
{po.items.map(item => {
  const dnItem     = dn?.items.find(i => i.item === item.item);
  const ri         = dn?.receivedItems?.find(r => r.item === item.item);
  const dispatched = dnItem?.dispatchedQty;
  const requested  = dnItem?.requestedQty;
  const isShort    = dispatched !== undefined && requested !== undefined && dispatched < requested;
  return (
    <div key={item.item} style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{item.item}</div>
        {dispatched !== undefined && (
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
            {isShort ? (
              <>
                <span>Ordered: {requested}</span>
                <span style={{ color: "#D97706", fontWeight: 600, marginLeft: 4 }}>→ Dispatched: {dispatched}</span>
              </>
            ) : (
              <span>Dispatched: {dispatched}</span>
            )}
            {ri && ri.receivedQty !== dispatched && (
              <span style={{ color: "#DC2626", marginLeft: 4 }}>· Received: {ri.receivedQty}</span>
            )}
            {ri && ri.receivedQty === dispatched && (
              <span style={{ color: "#059669", marginLeft: 4 }}>· Received: {ri.receivedQty}</span>
            )}
          </div>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{item.qty}</div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{item.unit}</div>
      </div>
    </div>
  );
})}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/transfers/_components/OrdersContent.tsx
git commit -m "feat(orders): show ordered vs dispatched diff in history item rows"
```

---

## Task 5: Create generateBranchDR utility

**Files:**
- Create: `src/app/transfers/_lib/print.ts`

- [ ] **Step 1: Create the file**

Create `src/app/transfers/_lib/print.ts`:

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
}): void {
  const { poRef, dnRef, branch, dispatchedAt, receivedAt, dispatchedBy, receivedBy, items } = params;
  const branchLabel = branch === "MKT" ? "Makati" : branch === "BF" ? "BF" : branch;

  const rows = items.map((it, idx) => {
    const bg            = idx % 2 === 0 ? "#f9f9f9" : "#fff";
    const isShort       = it.dispatchedQty < it.requestedQty;
    const isDiscrepancy = it.receivedQty !== it.dispatchedQty;
    const statusText    = isDiscrepancy
      ? `DISCREPANCY (got ${it.receivedQty})`
      : isShort
        ? `SHORT ${it.requestedQty - it.dispatchedQty}`
        : "FULL";
    const statusColor = isDiscrepancy || isShort ? "#c0392b" : "#27ae60";
    const itemColor   = isShort || isDiscrepancy ? "#c0392b" : "#111";
    return [
      `<tr style="background:${bg}">`,
      `<td style="padding:10px 16px;font-size:15px;font-weight:600;border-bottom:1px solid #e0e0e0;color:${itemColor}">${it.item.toUpperCase()}</td>`,
      `<td style="padding:10px 16px;font-size:14px;text-align:right;border-bottom:1px solid #e0e0e0">${it.requestedQty} ${it.unit}</td>`,
      `<td style="padding:10px 16px;font-size:14px;text-align:right;border-bottom:1px solid #e0e0e0">${it.dispatchedQty} ${it.unit}</td>`,
      `<td style="padding:10px 16px;font-size:14px;text-align:right;border-bottom:1px solid #e0e0e0">${it.receivedQty} ${it.unit}</td>`,
      `<td style="padding:10px 16px;font-size:12px;font-weight:600;text-align:right;border-bottom:1px solid #e0e0e0;color:${statusColor}">${statusText}</td>`,
      `</tr>`,
    ].join("");
  }).join("");

  const sigLine = "border-top:2px solid #111;padding-top:8px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:.06em;margin-top:50px";

  const html = [
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>DR ${poRef}</title>`,
    `<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:40px 50px}`,
    `.hdr{text-align:center;margin-bottom:30px;padding-bottom:20px;border-bottom:3px solid #111}`,
    `.hdr h1{font-size:28px;font-weight:900;letter-spacing:.08em;margin-bottom:4px}.hdr p{font-size:14px;color:#555}`,
    `.meta{margin-bottom:28px;padding-bottom:18px;border-bottom:1px dashed #aaa}.ref{font-size:22px;font-weight:800;margin-bottom:6px}`,
    `.det{font-size:14px;color:#444;line-height:1.8}table{width:100%;border-collapse:collapse;margin-bottom:30px}`,
    `th{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#555;border-bottom:2px solid #111;padding:8px 16px;text-align:left}`,
    `th:not(:first-child){text-align:right}`,
    `.ft{margin-top:60px;display:grid;grid-template-columns:1fr 1fr;gap:60px}.sb{text-align:center}`,
    `@media print{@page{margin:15mm 18mm}}</style></head>`,
    `<body><div class="hdr"><h1>THE BLACK BEAN</h1><p>Delivery Receipt</p></div>`,
    `<div class="meta"><div class="ref">PO# ${poRef} · DN# ${dnRef}</div>`,
    `<div class="det">`,
    `<div>Branch: <strong>${branchLabel}</strong></div>`,
    `<div>Dispatched: <strong>${dispatchedAt}</strong></div>`,
    `<div>Received: <strong>${receivedAt}</strong></div>`,
    `</div></div>`,
    `<table><thead><tr><th>Item</th><th>Ordered</th><th>Dispatched</th><th>Received</th><th>Status</th></tr></thead>`,
    `<tbody>${rows}`,
    `<tr><td colspan="5" style="border-top:2px solid #111;font-size:13px;font-weight:700;padding:10px 16px;text-align:right">Total: ${items.length} item${items.length !== 1 ? "s" : ""}</td></tr>`,
    `</tbody></table>`,
    `<div class="ft">`,
    `<div class="sb"><div style="font-size:16px;font-weight:700;min-height:24px">${dispatchedBy}</div><div style="${sigLine}">Dispatched by (Commissary)</div></div>`,
    `<div class="sb"><div style="font-size:16px;font-weight:700;min-height:24px">${receivedBy}</div><div style="${sigLine}">Received by (Branch)</div></div>`,
    `</div></body></html>`,
  ].join("\n");

  const blob = new Blob([html], { type: "text/html" });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, "_blank");
  setTimeout(() => {
    if (win) win.print();
    URL.revokeObjectURL(url);
  }, 800);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/transfers/_lib/print.ts
git commit -m "feat(orders): add generateBranchDR print utility"
```

---

## Task 6: Reprint DR button in HistoryDetail

**Files:**
- Modify: `src/app/transfers/_components/OrdersContent.tsx` — `HistoryDetail` component + imports

- [ ] **Step 1: Add print import**

At the top of `OrdersContent.tsx`, add alongside the helpers import:

```ts
import { generateBranchDR } from "../_lib/print";
```

- [ ] **Step 2: Add Reprint DR button in HistoryDetail**

In the `HistoryDetail` component, add the button after the `po.notes` block and before the closing `</div>` of the padding container:

```tsx
{dn && (dn.status === "RECEIVED" || dn.status === "DISCREPANCY") && dn.receivedItems && (
  <button
    onClick={() => generateBranchDR({
      poRef:         po.poRef,
      dnRef:         dn.dnRef,
      branch:        dn.branch,
      dispatchedAt:  dn.dispatchedAt,
      receivedAt:    dn.receivedAt ?? "",
      dispatchedBy:  dn.dispatchedBy,
      receivedBy:    dn.receivedBy ?? "",
      items: dn.items.map(i => {
        const ri = dn.receivedItems!.find(r => r.item === i.item);
        return {
          item:          i.item,
          requestedQty:  i.requestedQty,
          dispatchedQty: i.dispatchedQty,
          receivedQty:   ri?.receivedQty ?? i.dispatchedQty,
          unit:          i.unit,
        };
      }),
    })}
    style={{
      width: "100%", padding: "14px 0", borderRadius: 12,
      border: "1.5px solid var(--border)", background: "#FFF",
      color: "var(--text)", fontWeight: 600, fontSize: 15, cursor: "pointer",
    }}
  >
    Reprint DR
  </button>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all existing tests + helpers tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/transfers/_components/OrdersContent.tsx
git commit -m "feat(orders): add Reprint DR button in history detail"
```
