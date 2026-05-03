import type { Branch, Department, StockAdjustment, DailyBeginning, VarianceExplanation } from "@/lib/types";
import { itemSlug } from "@/lib/items";

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
