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

// ─── v2: per-item aggregated types ───────────────────────────────────────────

export interface DailyRow {
  date: string;
  beg: number;
  totalIn: number;
  totalOut: number;
  exp: number;           // beg + totalIn - totalOut
  end: number | null;    // null when no count adjustment exists for that day
  variance: number | null; // end - exp, null when end is null
}

export type ItemStatus = "critical" | "watch" | "normal";
export type TrendDirection = "better" | "worse" | "stable";

export interface ItemSummary {
  item: string;
  periodVariance: number;     // sum of non-null daily variances
  periodVarPct: number;       // |periodVariance / totalExpOnCountDays| * 100
  daysWithVariance: number;   // count of days where variance !== null && !== 0
  totalDays: number;          // length of the date range
  trend: TrendDirection;
  status: ItemStatus;
  latestEnd: number | null;   // END from most recent counted day
  dailyRows: DailyRow[];      // one entry per date in the range (for drill-down)
  hasInsight: boolean;        // true when recurring variance on ≥70% of days (and ≥5 day period)
}

export interface KpiSummary {
  criticalCount: number;
  watchCount: number;
  normalCount: number;
  totalLoss: number;     // sum of negative period variances
  totalSurplus: number;  // sum of positive period variances
  netVariance: number;   // totalLoss + totalSurplus
}

// ─── v2: helpers ─────────────────────────────────────────────────────────────

export function datesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let current = startDate;
  while (current <= endDate) {
    dates.push(current);
    const [y, m, d] = current.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    current = next.toISOString().slice(0, 10);
  }
  return dates;
}

function classifyStatus(absVariance: number): ItemStatus {
  if (absVariance >= 10) return "critical";
  if (absVariance >= 3) return "watch";
  return "normal";
}

function computeTrend(dailyRows: DailyRow[]): TrendDirection {
  const variances = dailyRows.map(r => r.variance ?? 0);
  if (variances.length < 4) return "stable";
  const mid = Math.floor(variances.length / 2);
  const firstHalf = variances.slice(0, mid);
  const secondHalf = variances.slice(variances.length - mid);
  const avgAbs = (arr: number[]) =>
    arr.reduce((s, v) => s + Math.abs(v), 0) / arr.length;
  const diff = avgAbs(secondHalf) - avgAbs(firstHalf);
  if (diff < -0.5) return "better";
  if (diff > 0.5) return "worse";
  return "stable";
}

// ─── v2: main aggregation ────────────────────────────────────────────────────

export function computeItemSummaries(
  adjustments: StockAdjustment[],
  beginnings: DailyBeginning[],
  allDates: string[],
): { summaries: ItemSummary[]; kpis: KpiSummary } {
  const empty: KpiSummary = {
    criticalCount: 0, watchCount: 0, normalCount: 0,
    totalLoss: 0, totalSurplus: 0, netVariance: 0,
  };
  if (allDates.length === 0) return { summaries: [], kpis: empty };

  // beginning lookup: `${item}|${date}` → qty
  const begMap = new Map<string, number>();
  for (const b of beginnings) {
    begMap.set(`${b.item}|${b.date}`, b.qty);
  }

  // group adjustments by item → date → adj[]
  const itemDateAdjs = new Map<string, Map<string, StockAdjustment[]>>();
  const itemsWithCounts = new Set<string>();

  for (const adj of adjustments) {
    if (!itemDateAdjs.has(adj.item)) itemDateAdjs.set(adj.item, new Map());
    const dateMap = itemDateAdjs.get(adj.item)!;
    if (!dateMap.has(adj.date)) dateMap.set(adj.date, []);
    dateMap.get(adj.date)!.push(adj);
    if (adj.type === "count") itemsWithCounts.add(adj.item);
  }

  const summaries: ItemSummary[] = [];

  for (const item of itemsWithCounts) {
    const dateAdjs = itemDateAdjs.get(item) ?? new Map();
    const dailyRows: DailyRow[] = [];

    for (const date of allDates) {
      const adjs = dateAdjs.get(date) ?? [];
      const beg = begMap.get(`${item}|${date}`) ?? 0;
      let totalIn = 0, totalOut = 0;
      let latestCount: StockAdjustment | null = null;

      for (const adj of adjs) {
        if (adj.type === "in") {
          totalIn += adj.qty;
        } else if (adj.type === "out" || adj.type === "waste" || adj.type === "sales_import") {
          totalOut += adj.qty;
        } else if (adj.type === "count") {
          if (!latestCount || adj.id > latestCount.id) latestCount = adj;
        }
      }

      const exp = beg + totalIn - totalOut;
      const end = latestCount ? latestCount.qty : null;
      const variance = end !== null ? end - exp : null;
      dailyRows.push({ date, beg, totalIn, totalOut, exp, end, variance });
    }

    // aggregate
    let periodVariance = 0, daysWithVariance = 0, totalExpOnCountDays = 0;
    let latestEnd: number | null = null;

    for (const row of dailyRows) {
      if (row.variance !== null) {
        periodVariance += row.variance;
        if (row.variance !== 0) daysWithVariance++;
        totalExpOnCountDays += row.exp;
        latestEnd = row.end; // last iterated = most recent (allDates is ordered)
      }
    }

    if (periodVariance === 0) continue;

    const absVariance = Math.abs(periodVariance);
    const periodVarPct =
      totalExpOnCountDays > 0 ? (absVariance / totalExpOnCountDays) * 100 : 0;
    const status = classifyStatus(absVariance);
    const trend = computeTrend(dailyRows);
    const hasInsight =
      allDates.length >= 5 &&
      daysWithVariance >= Math.ceil(allDates.length * 0.7);

    summaries.push({
      item,
      periodVariance,
      periodVarPct,
      daysWithVariance,
      totalDays: allDates.length,
      trend,
      status,
      latestEnd,
      dailyRows,
      hasInsight,
    });
  }

  // sort by |periodVariance| descending
  summaries.sort((a, b) => Math.abs(b.periodVariance) - Math.abs(a.periodVariance));

  // compute KPIs
  let criticalCount = 0, watchCount = 0, normalCount = 0;
  let totalLoss = 0, totalSurplus = 0;

  for (const s of summaries) {
    if (s.status === "critical") criticalCount++;
    else if (s.status === "watch") watchCount++;
    else normalCount++;
    if (s.periodVariance < 0) totalLoss += s.periodVariance;
    else totalSurplus += s.periodVariance;
  }

  return {
    summaries,
    kpis: { criticalCount, watchCount, normalCount, totalLoss, totalSurplus, netVariance: totalLoss + totalSurplus },
  };
}

// ─── v2: CSV export ───────────────────────────────────────────────────────────

export function exportItemSummariesCsv(
  summaries: ItemSummary[],
  startDate: string,
  endDate: string,
  branchLabel: string,
): void {
  const header = ["Item", "Status", "Period Var", "Var %", "Days w/ Var", "Total Days", "Trend", "Latest END"];
  const csvRows = summaries.map(s => {
    const sign = s.periodVariance > 0 ? "+" : "";
    return [
      s.item,
      s.status,
      `${sign}${s.periodVariance}`,
      `${sign}${Math.round(s.periodVarPct)}%`,
      s.daysWithVariance,
      s.totalDays,
      s.trend,
      s.latestEnd ?? "",
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
