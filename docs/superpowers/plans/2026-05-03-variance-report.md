# Variance Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Dashboard's fixed weekly stock summary with a date-range Variance Report that lets managers explain inventory variances and track them as Pending or Reviewed.

**Architecture:** A new `VarianceReport` component fetches adjustments + daily beginnings + explanations in three parallel Firestore queries, computes variance rows in a pure helper function, and writes explanations to a new `variance_explanations` collection on dropdown select. The Dashboard page is the only consumer.

**Tech Stack:** Next.js (App Router), Firebase Firestore, Vitest, TypeScript, inline styles (existing pattern)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/types.ts` | Add `VarianceExplanation` interface and `ExplanationReason` type |
| Modify | `src/lib/firebase.ts` | Add `varianceExplanations` to COLS |
| Modify | `firestore.rules` | Allow read/write on `variance_explanations` |
| Create | `src/app/dashboard/_lib/variance.ts` | Pure computation: `computeVarianceRows`, `buildExplanationDocId`, `exportVarianceCsv` |
| Create | `src/app/dashboard/_lib/variance.test.ts` | Vitest tests for variance computation logic |
| Create | `src/app/dashboard/_components/VarianceReport.tsx` | Full UI component (date controls, two-section table, save explanation) |
| Modify | `src/app/dashboard/page.tsx` | Swap `ReportsContent` for `VarianceReport`; pass `role` |
| Delete | `src/app/stock/_components/ReportsContent.tsx` | No longer used |

---

## Task 1: Types, COLS, and Firestore Rules

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/firebase.ts`
- Modify: `firestore.rules`

- [ ] **Step 1: Add `ExplanationReason` and `VarianceExplanation` to `src/lib/types.ts`**

  Append after the `DailyClose` interface (end of file):

  ```typescript
  export type ExplanationReason = "Counting error" | "Waste" | "Data entry error" | "Unknown";

  export interface VarianceExplanation {
    id: string;          // `${branch}__${department}__${itemSlug(item)}__${date}`
    branch: Branch;
    department: Department;
    item: string;
    date: string;        // YYYY-MM-DD
    explanation: ExplanationReason;
    notes: string;       // Phase 2 free-text — always "" for now
    savedBy: string;     // Firebase Auth uid
    savedAt: string;     // ISO timestamp
  }
  ```

- [ ] **Step 2: Add `varianceExplanations` to COLS in `src/lib/firebase.ts`**

  In the `COLS` object (around line 44), add after `deliveryDrafts`:

  ```typescript
  varianceExplanations: "variance_explanations",
  ```

  Full updated COLS:
  ```typescript
  export const COLS = {
    branchStock:            "branch_stock",
    adjustments:            "branch_adjustments",
    pulloutReqs:            "pullout_requests",
    dailyBeginning:         "daily_beginning",
    dailyClose:             "daily_close",
    pullOuts:               "pull_outs",
    deliveryNotes:          "delivery_notes",
    invEntries:             "invEntries",
    supplierDeliveries:     "supplier_deliveries",
    portioningRuns:         "portioning_runs",
    storehubUnmatched:      "storehub_unmatched",
    stocktakeDrafts:        "stocktake_drafts",
    deliveryDrafts:         "delivery_drafts",
    varianceExplanations:   "variance_explanations",
    users:                  "users",
  } as const;
  ```

- [ ] **Step 3: Add Firestore security rule for `variance_explanations`**

  In `firestore.rules`, add this line alongside the other branch collection rules (after the `stocktake_drafts` line):

  ```
  match /variance_explanations/{doc} { allow read, write: if request.auth != null; }
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  ```bash
  cd /Users/christiancasino/Documents/branch-inventory && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/christiancasino/Documents/branch-inventory
  git add src/lib/types.ts src/lib/firebase.ts firestore.rules
  git commit -m "feat: add VarianceExplanation type, COLS entry, and Firestore rule"
  ```

---

## Task 2: Pure Variance Computation Logic + Tests

**Files:**
- Create: `src/app/dashboard/_lib/variance.ts`
- Create: `src/app/dashboard/_lib/variance.test.ts`

- [ ] **Step 1: Write failing tests in `src/app/dashboard/_lib/variance.test.ts`**

  Create the test file first. The module it imports doesn't exist yet — the test run in Step 2 will fail with "Cannot find module './variance'", which confirms TDD is working.

  _(Test code is shown in Step 3 below — write that file now, skip ahead to read it, then come back to Step 2.)_

- [ ] **Step 2: Run tests — expect FAIL**

  ```bash
  cd /Users/christiancasino/Documents/branch-inventory && npx vitest run src/app/dashboard/_lib/variance.test.ts
  ```
  Expected: FAIL — `Cannot find module './variance'`

- [ ] **Step 3: Create `src/app/dashboard/_lib/variance.ts`**

  ```typescript
  import type { Branch, Department, StockAdjustment, DailyBeginning, VarianceExplanation, ExplanationReason } from "@/lib/types";
  import { itemSlug } from "@/lib/items";
  import { BRANCH_LABELS } from "@/lib/auth";

  export interface VarianceRow {
    date: string;         // YYYY-MM-DD
    item: string;
    actual: number;       // count qty
    expected: number;     // dailyBeginning + totalIn - totalOut
    variance: number;     // actual - expected
    variancePct: number;  // Math.abs(variance / expected * 100), 0 when expected === 0
    docId: string;        // variance_explanations document ID
  }

  export function buildExplanationDocId(
    branch: Branch,
    department: Department,
    item: string,
    date: string,
  ): string {
    return `${branch}__${department}__${itemSlug(item)}__${date}`;
  }

  export function computeVarianceRows(
    adjustments: StockAdjustment[],
    beginnings: DailyBeginning[],
    branch: Branch,
    department: Department,
  ): VarianceRow[] {
    // beginning lookup: `${item}|${date}` -> qty
    const begMap = new Map<string, number>();
    for (const b of beginnings) {
      begMap.set(`${b.item}|${b.date}`, b.qty);
    }

    // group adjustments by date+item, tracking counts and movement totals
    const groups = new Map<string, {
      date: string;
      item: string;
      counts: StockAdjustment[];
      totalIn: number;
      totalOut: number;
    }>();

    for (const adj of adjustments) {
      const key = `${adj.date}|${adj.item}`;
      if (!groups.has(key)) {
        groups.set(key, { date: adj.date, item: adj.item, counts: [], totalIn: 0, totalOut: 0 });
      }
      const g = groups.get(key)!;
      if (adj.type === "count") {
        g.counts.push(adj);
      } else if (adj.type === "in") {
        g.totalIn += adj.qty;
      } else if (adj.type === "out" || adj.type === "waste" || adj.type === "sales_import") {
        g.totalOut += adj.qty;
      }
    }

    const rows: VarianceRow[] = [];
    for (const g of groups.values()) {
      if (g.counts.length === 0) continue;
      // Use the count with the highest id — matches existing behavior in ReportsContent
      const countAdj = g.counts.reduce((best, a) => (a.id > best.id ? a : best));
      const actual = countAdj.qty;
      const beginning = begMap.get(`${g.item}|${g.date}`) ?? 0;
      const expected = beginning + g.totalIn - g.totalOut;
      const variance = actual - expected;
      if (variance === 0) continue;
      const variancePct = expected !== 0 ? Math.abs((variance / expected) * 100) : 0;
      rows.push({
        date: g.date,
        item: g.item,
        actual,
        expected,
        variance,
        variancePct,
        docId: buildExplanationDocId(branch, department, g.item, g.date),
      });
    }

    // Most recent first
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return rows;
  }

  export function exportVarianceCsv(
    rows: VarianceRow[],
    explanations: Map<string, VarianceExplanation>,
    startDate: string,
    endDate: string,
    branchLabel: string,
  ): void {
    const header = ["Date", "Item", "Var %", "Var (units)", "Actual", "Expected", "Explanation"];
    const csvRows = rows.map(r => {
      const expl = explanations.get(r.docId);
      const sign = r.variance > 0 ? "+" : "";
      return [
        r.date,
        r.item,
        `${sign}${Math.round(r.variancePct)}%`,
        `${sign}${r.variance}`,
        r.actual,
        r.expected,
        expl?.explanation ?? "",
      ];
    });
    const csv = [header, ...csvRows]
      .map(row => row.map(v => `"${v}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `variance-report-${branchLabel}-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  ```

- [ ] **Step 4: Write the test file `src/app/dashboard/_lib/variance.test.ts`**

  ```typescript
  import { describe, it, expect } from "vitest";
  import { computeVarianceRows, buildExplanationDocId } from "./variance";
  import type { StockAdjustment, DailyBeginning } from "@/lib/types";

  const BASE_ADJ: StockAdjustment = {
    id: 1, branch: "MKT", department: "kitchen",
    date: "2026-05-01", item: "Smoked Salmon",
    type: "count", qty: 17, loggedBy: "admin",
  };

  const BASE_BEG: DailyBeginning = {
    id: "x", branch: "MKT", department: "kitchen",
    item: "Smoked Salmon", date: "2026-05-01",
    qty: 78, setBy: "admin", updatedAt: "",
  };

  describe("computeVarianceRows", () => {
    it("returns a row when count differs from expected", () => {
      const rows = computeVarianceRows([BASE_ADJ], [BASE_BEG], "MKT", "kitchen");
      expect(rows).toHaveLength(1);
      expect(rows[0].actual).toBe(17);
      expect(rows[0].expected).toBe(78);
      expect(rows[0].variance).toBe(-61);
    });

    it("filters out rows where variance is 0", () => {
      const adj = { ...BASE_ADJ, qty: 78 };
      const rows = computeVarianceRows([adj], [BASE_BEG], "MKT", "kitchen");
      expect(rows).toHaveLength(0);
    });

    it("uses the count with the highest id when multiple counts exist", () => {
      const adj1 = { ...BASE_ADJ, id: 1, qty: 10 };
      const adj2 = { ...BASE_ADJ, id: 3, qty: 20 };
      const adj3 = { ...BASE_ADJ, id: 2, qty: 15 };
      const beg = { ...BASE_BEG, qty: 0 };
      const rows = computeVarianceRows([adj1, adj2, adj3], [beg], "MKT", "kitchen");
      expect(rows[0].actual).toBe(20);
    });

    it("factors in totalIn and totalOut when computing expected", () => {
      const count = { ...BASE_ADJ, qty: 5 };
      const inAdj: StockAdjustment = { ...BASE_ADJ, id: 2, type: "in", qty: 10 };
      const outAdj: StockAdjustment = { ...BASE_ADJ, id: 3, type: "out", qty: 3 };
      const beg = { ...BASE_BEG, qty: 20 };
      const rows = computeVarianceRows([count, inAdj, outAdj], [beg], "MKT", "kitchen");
      expect(rows[0].expected).toBe(27); // 20 + 10 - 3
      expect(rows[0].variance).toBe(-22); // 5 - 27
    });

    it("counts waste and sales_import as outflow", () => {
      const count = { ...BASE_ADJ, qty: 5 };
      const waste: StockAdjustment  = { ...BASE_ADJ, id: 2, type: "waste", qty: 4 };
      const sales: StockAdjustment  = { ...BASE_ADJ, id: 3, type: "sales_import", qty: 6 };
      const beg = { ...BASE_BEG, qty: 20 };
      const rows = computeVarianceRows([count, waste, sales], [beg], "MKT", "kitchen");
      expect(rows[0].expected).toBe(10); // 20 - 4 - 6
    });

    it("defaults beginning to 0 when no dailyBeginning record exists", () => {
      const rows = computeVarianceRows([BASE_ADJ], [], "MKT", "kitchen");
      expect(rows[0].expected).toBe(0);
      expect(rows[0].variance).toBe(17);
    });

    it("sorts rows by date descending", () => {
      const adj1 = { ...BASE_ADJ, date: "2026-04-28", qty: 5 };
      const adj2 = { ...BASE_ADJ, date: "2026-05-01", qty: 5 };
      const adj3 = { ...BASE_ADJ, date: "2026-04-30", qty: 5 };
      const rows = computeVarianceRows([adj1, adj2, adj3], [], "MKT", "kitchen");
      expect(rows[0].date).toBe("2026-05-01");
      expect(rows[1].date).toBe("2026-04-30");
      expect(rows[2].date).toBe("2026-04-28");
    });

    it("produces correct variancePct", () => {
      // expected = 78, actual = 17, variance = -61, pct = 61/78 * 100 ≈ 78.2
      const rows = computeVarianceRows([BASE_ADJ], [BASE_BEG], "MKT", "kitchen");
      expect(rows[0].variancePct).toBeCloseTo(78.2, 0);
    });
  });

  describe("buildExplanationDocId", () => {
    it("builds the correct doc id", () => {
      expect(buildExplanationDocId("MKT", "kitchen", "Smoked Salmon", "2026-05-02"))
        .toBe("MKT__kitchen__Smoked_Salmon__2026-05-02");
    });

    it("strips special characters from item name", () => {
      expect(buildExplanationDocId("BF", "kitchen", "Marinara Sauce (Blend)", "2026-05-01"))
        .toBe("BF__kitchen__Marinara_Sauce_Blend__2026-05-01");
    });
  });
  ```

- [ ] **Step 5: Run tests — expect PASS**

  ```bash
  cd /Users/christiancasino/Documents/branch-inventory && npx vitest run src/app/dashboard/_lib/variance.test.ts
  ```
  Expected: all 9 tests pass.

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/christiancasino/Documents/branch-inventory
  git add src/app/dashboard/_lib/variance.ts src/app/dashboard/_lib/variance.test.ts
  git commit -m "feat: variance computation logic and tests"
  ```

---

## Task 3: VarianceReport Component

**Files:**
- Create: `src/app/dashboard/_components/VarianceReport.tsx`

- [ ] **Step 1: Create the directory**

  ```bash
  mkdir -p /Users/christiancasino/Documents/branch-inventory/src/app/dashboard/_components
  ```

- [ ] **Step 2: Create `src/app/dashboard/_components/VarianceReport.tsx`**

  ```tsx
  "use client";
  import { useState, useEffect, useMemo, useCallback } from "react";
  import { db, COLS, getDocs, query, collection, where, doc, setDoc } from "@/lib/firebase";
  import { auth } from "@/lib/firebase";
  import type { Branch, Department, StockAdjustment, DailyBeginning, VarianceExplanation, ExplanationReason } from "@/lib/types";
  import { addDays, todayPHT, formatDate } from "@/app/stock/_lib/helpers";
  import { computeVarianceRows, exportVarianceCsv, type VarianceRow } from "@/app/dashboard/_lib/variance";
  import { hasMinRole } from "@/lib/roles";
  import type { Role } from "@/lib/roles";
  import { BRANCH_LABELS } from "@/lib/auth";

  const EXPLANATION_OPTIONS = [
    "Counting error",
    "Waste",
    "Data entry error",
    "Unknown",
  ] as const;

  type Preset = 7 | 14 | 30;

  function presetRange(days: Preset): { start: string; end: string } {
    const end = todayPHT();
    return { start: addDays(end, -(days - 1)), end };
  }

  function VarPctBadge({ variancePct, variance }: { variancePct: number; variance: number }) {
    const sign = variance > 0 ? "+" : "";
    const label = `${sign}${Math.round(variancePct)}%`;
    let bg = "#dcfce7", color = "#16a34a";
    if (variancePct > 30) { bg = "#fee2e2"; color = "#dc2626"; }
    else if (variancePct >= 10) { bg = "#fef3c7"; color = "#d97706"; }
    return (
      <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 5, background: bg, color, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
        {label}
      </span>
    );
  }

  function VarianceTable({
    rows, explanations, canEdit, onSave, isPending,
  }: {
    rows: VarianceRow[];
    explanations: Map<string, VarianceExplanation>;
    canEdit: boolean;
    onSave: (docId: string, item: string, date: string, reason: ExplanationReason) => Promise<void>;
    isPending: boolean;
  }) {
    return (
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff", borderRadius: 10, overflow: "hidden" }}>
          <thead>
            <tr style={{ background: "var(--bg)" }}>
              {["Date", "Item", "Var %", "Var (units)", "Actual", "Expected", "Explanation"].map(h => (
                <th key={h} style={{
                  padding: "8px 10px", fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.08em", color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  textAlign: h === "Item" || h === "Explanation" ? "left" : "center",
                  whiteSpace: "nowrap", borderBottom: "1px solid var(--border)",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const expl = explanations.get(row.docId);
              const muted = !isPending;
              return (
                <tr key={row.docId} style={{ borderBottom: "1px solid var(--border)", background: isPending ? "#fffbeb" : "#fff" }}>
                  <td style={{ padding: "10px 10px", whiteSpace: "nowrap", color: muted ? "#94a3b8" : "inherit" }}>
                    {formatDate(row.date)}
                  </td>
                  <td style={{ padding: "10px 10px", fontWeight: muted ? 500 : 600, whiteSpace: "nowrap", color: muted ? "#94a3b8" : "#0f172a" }}>
                    {row.item}
                  </td>
                  <td style={{ padding: "10px 6px", textAlign: "center" }}>
                    <VarPctBadge variancePct={row.variancePct} variance={row.variance} />
                  </td>
                  <td style={{ padding: "10px 6px", textAlign: "center", fontWeight: 600, color: row.variance < 0 ? "#dc2626" : "#16a34a" }}>
                    {row.variance > 0 ? `+${row.variance}` : row.variance}
                  </td>
                  <td style={{ padding: "10px 6px", textAlign: "center", color: muted ? "#94a3b8" : "inherit" }}>{row.actual}</td>
                  <td style={{ padding: "10px 6px", textAlign: "center", color: muted ? "#94a3b8" : "inherit" }}>{row.expected}</td>
                  <td style={{ padding: "10px 10px" }}>
                    {isPending && canEdit ? (
                      <select
                        defaultValue=""
                        onChange={e => {
                          if (e.target.value) {
                            onSave(row.docId, row.item, row.date, e.target.value as ExplanationReason);
                          }
                        }}
                        style={{ padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, color: "#374151", background: "#fff", maxWidth: 185, cursor: "pointer" }}
                      >
                        <option value="">Select reason…</option>
                        {EXPLANATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : expl ? (
                      <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b", background: "#f1f5f9", padding: "3px 9px", borderRadius: 5, display: "inline-block" }}>
                        {expl.explanation}
                      </span>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  export function VarianceReport({ branch, department, role }: {
    branch: Branch;
    department: Department;
    role: Role;
  }) {
    const canEdit = hasMinRole(role, "admin");

    const [preset, setPreset] = useState<Preset>(7);
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [usingCustom, setUsingCustom] = useState(false);

    const { startDate, endDate } = useMemo(() => {
      if (usingCustom && customStart && customEnd) {
        return { startDate: customStart, endDate: customEnd };
      }
      const r = presetRange(preset);
      return { startDate: r.start, endDate: r.end };
    }, [preset, usingCustom, customStart, customEnd]);

    const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
    const [beginnings, setBeginnings] = useState<DailyBeginning[]>([]);
    const [explanations, setExplanations] = useState<Map<string, VarianceExplanation>>(new Map());
    const [loading, setLoading] = useState(false);
    const [reviewedOpen, setReviewedOpen] = useState(false);

    const fetchData = useCallback(async () => {
      setLoading(true);
      await auth.authStateReady();
      const [adjSnap, begSnap, explSnap] = await Promise.all([
        getDocs(query(
          collection(db, COLS.adjustments),
          where("branch", "==", branch),
          where("department", "==", department),
          where("date", ">=", startDate),
          where("date", "<=", endDate),
        )),
        getDocs(query(
          collection(db, COLS.dailyBeginning),
          where("branch", "==", branch),
          where("department", "==", department),
          where("date", ">=", startDate),
          where("date", "<=", endDate),
        )),
        getDocs(query(
          collection(db, COLS.varianceExplanations),
          where("branch", "==", branch),
          where("department", "==", department),
        )),
      ]);
      setAdjustments(adjSnap.docs.map(d => d.data() as StockAdjustment));
      setBeginnings(begSnap.docs.map(d => d.data() as DailyBeginning));
      const explMap = new Map<string, VarianceExplanation>();
      explSnap.docs.forEach(d => {
        const e = d.data() as VarianceExplanation;
        if (e.date >= startDate && e.date <= endDate) explMap.set(e.id, e);
      });
      setExplanations(explMap);
      setLoading(false);
    }, [branch, department, startDate, endDate]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const allRows = useMemo(
      () => computeVarianceRows(adjustments, beginnings, branch, department),
      [adjustments, beginnings, branch, department],
    );

    const pendingRows = allRows.filter(r => !explanations.has(r.docId));
    const reviewedRows = allRows.filter(r => explanations.has(r.docId));

    async function saveExplanation(docId: string, item: string, date: string, reason: ExplanationReason) {
      const uid = auth.currentUser?.uid ?? "";
      const explDoc: VarianceExplanation = {
        id: docId, branch, department, item, date,
        explanation: reason, notes: "",
        savedBy: uid, savedAt: new Date().toISOString(),
      };
      setExplanations(prev => new Map(prev).set(docId, explDoc)); // optimistic
      await setDoc(doc(db, COLS.varianceExplanations, docId), explDoc);
    }

    const presetLabel = usingCustom
      ? `${startDate} to ${endDate}`
      : `Last ${preset} days`;

    return (
      <div style={{ padding: "12px 16px" }}>
        {/* Filter bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {([7, 14, 30] as Preset[]).map(d => (
            <button
              key={d}
              onClick={() => { setPreset(d); setUsingCustom(false); }}
              style={{
                padding: "6px 14px", borderRadius: 6, border: "1px solid", fontSize: 13,
                fontWeight: 500, cursor: "pointer",
                background: !usingCustom && preset === d ? "#0f172a" : "#fff",
                color:      !usingCustom && preset === d ? "#fff"    : "#475569",
                borderColor: !usingCustom && preset === d ? "#0f172a" : "#cbd5e1",
              }}
            >
              Last {d} days
            </button>
          ))}
          <div style={{ width: 1, height: 24, background: "#e2e8f0", margin: "0 4px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>From</span>
            <input
              type="date"
              value={customStart || startDate}
              onChange={e => { setCustomStart(e.target.value); setUsingCustom(true); }}
              style={{ padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, color: "#475569", width: 140 }}
            />
            <span style={{ fontSize: 12, color: "#94a3b8" }}>To</span>
            <input
              type="date"
              value={customEnd || endDate}
              onChange={e => { setCustomEnd(e.target.value); setUsingCustom(true); }}
              style={{ padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, color: "#475569", width: 140 }}
            />
          </div>
          <button
            onClick={() => exportVarianceCsv(allRows, explanations, startDate, endDate, BRANCH_LABELS[branch])}
            style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", color: "#475569", display: "flex", alignItems: "center", gap: 6 }}
          >
            ↓ Export CSV ({presetLabel})
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "48px 0", fontSize: 14 }}>Loading…</div>
        ) : (
          <>
            {/* Pending section */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#b45309" }}>
                  ⚠ Pending Explanation
                </span>
                {pendingRows.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#fef3c7", color: "#b45309" }}>
                    {pendingRows.length} item{pendingRows.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              {pendingRows.length === 0 ? (
                <div style={{ background: "#fff", borderRadius: 10, border: "1px dashed #e2e8f0", padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                  All caught up — no unexplained variances for this period.
                </div>
              ) : (
                <VarianceTable rows={pendingRows} explanations={explanations} canEdit={canEdit} onSave={saveExplanation} isPending />
              )}
            </div>

            {/* Reviewed section (collapsed by default) */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b" }}>
                  ✓ Reviewed
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#f1f5f9", color: "#64748b" }}>
                  {reviewedRows.length} item{reviewedRows.length !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={() => setReviewedOpen(o => !o)}
                  style={{ marginLeft: "auto", background: "none", border: "1px solid #e2e8f0", color: "#64748b", fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 5, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                >
                  {reviewedOpen ? "Hide" : "Show"}
                  <span style={{ display: "inline-block", transform: reviewedOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
                </button>
              </div>
              {reviewedOpen && (
                reviewedRows.length === 0 ? (
                  <div style={{ background: "#fff", borderRadius: 10, border: "1px dashed #e2e8f0", padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                    No reviewed variances for this period.
                  </div>
                ) : (
                  <div style={{ opacity: 0.8 }}>
                    <VarianceTable rows={reviewedRows} explanations={explanations} canEdit={false} onSave={saveExplanation} isPending={false} />
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  cd /Users/christiancasino/Documents/branch-inventory && npx tsc --noEmit
  ```
  Expected: no errors.

  > **If Firestore throws a "missing index" error on first browser run:** The `branch_adjustments` and `daily_beginning` queries now include a date range, which requires a composite index on `(branch, department, date)`. Follow the link Firestore prints in the browser console to create both indexes (takes ~1 minute). You only need to do this once per collection.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/christiancasino/Documents/branch-inventory
  git add src/app/dashboard/_components/VarianceReport.tsx
  git commit -m "feat: VarianceReport component"
  ```

---

## Task 4: Wire into Dashboard + Delete ReportsContent

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Delete: `src/app/stock/_components/ReportsContent.tsx`

- [ ] **Step 1: Replace `src/app/dashboard/page.tsx`**

  ```tsx
  "use client";
  import { useEffect, useState } from "react";
  import { useRouter } from "next/navigation";
  import { getSession, BRANCH_LABELS, DEPARTMENT_LABELS } from "@/lib/auth";
  import type { Branch, Department } from "@/lib/types";
  import type { Role } from "@/lib/roles";
  import BottomNav from "@/components/BottomNav";
  import { VarianceReport } from "@/app/dashboard/_components/VarianceReport";

  export default function DashboardPage() {
    const router = useRouter();
    const [branch, setBranch] = useState<Branch | null>(null);
    const [department, setDept] = useState<Department | null>(null);
    const [role, setRole] = useState<Role | null>(null);

    useEffect(() => {
      const session = getSession();
      if (!session) { router.replace("/login"); return; }
      setBranch(session.branch);
      setDept(session.department);
      setRole(session.role);
    }, [router]);

    if (!branch || !department || !role) return null;

    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 16px)" }}>
        {/* Header */}
        <div style={{ background: "#FFFFFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
            {BRANCH_LABELS[branch]} · {DEPARTMENT_LABELS[department]}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Dashboard</div>
        </div>

        {/* Variance Report */}
        <div style={{ padding: "16px 16px 8px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
            Variance Report
          </div>
        </div>
        <VarianceReport branch={branch} department={department} role={role} />

        <BottomNav />
      </div>
    );
  }
  ```

- [ ] **Step 2: Delete `ReportsContent.tsx`**

  ```bash
  rm /Users/christiancasino/Documents/branch-inventory/src/app/stock/_components/ReportsContent.tsx
  ```

- [ ] **Step 3: Verify no remaining imports of ReportsContent**

  ```bash
  cd /Users/christiancasino/Documents/branch-inventory && grep -r "ReportsContent" src/
  ```
  Expected: no output.

- [ ] **Step 4: Run full type check and tests**

  ```bash
  cd /Users/christiancasino/Documents/branch-inventory && npx tsc --noEmit && npx vitest run
  ```
  Expected: 0 type errors, all tests pass.

- [ ] **Step 5: Start dev server and verify in browser**

  ```bash
  cd /Users/christiancasino/Documents/branch-inventory && npm run dev
  ```

  Open `http://localhost:3000`, log in, navigate to Dashboard. Verify:
  - "Variance Report" heading visible
  - Preset buttons (Last 7 / 14 / 30 days) work and re-fetch
  - Custom date inputs work
  - Pending section shows rows with amber background
  - Explanation dropdown visible for admin/superadmin; "—" for linecook
  - Selecting a reason moves the row to Reviewed immediately
  - Reviewed section starts collapsed; Show/Hide toggle works
  - Export CSV downloads a file named `variance-report-{branch}-{start}-to-{end}.csv`
  - If Firestore shows an index error in the browser console, follow the link to create the composite index

- [ ] **Step 6: Final commit**

  ```bash
  cd /Users/christiancasino/Documents/branch-inventory
  git add src/app/dashboard/page.tsx
  git commit -m "feat: wire VarianceReport into Dashboard, remove ReportsContent"
  ```

---

## Firestore Index Note

The queries on `branch_adjustments` and `daily_beginning` now filter by `branch + department + date (range)`. Firestore requires a composite index for each. If the first browser run logs an index error, click the console link to auto-create the index in Firebase Console. Indexes take ~1 minute to build. You need to create one for each collection:

- `branch_adjustments`: fields `branch ASC, department ASC, date ASC`
- `daily_beginning`: fields `branch ASC, department ASC, date ASC`
