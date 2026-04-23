import type { StockAdjustment } from "@/lib/types";
import { CATALOG } from "@/lib/items";

export type SubTab = "daily" | "manualcount" | "reports";
export type FilterTab = "all" | "commissary_pc" | "commissary_loose" | "supplier";

export interface DailyMetrics {
  beginning: number | null;
  inQty: number;
  outQty: number;
  endCount: number | null;
}

export const CATEGORY_FILTERS: { id: FilterTab; label: string }[] = [
  { id: "all",              label: "All" },
  { id: "commissary_pc",    label: "Commissary (pc)" },
  { id: "commissary_loose", label: "Commissary (loose)" },
  { id: "supplier",         label: "Supplier" },
];

export function matchesFilter(item: typeof CATALOG[number], filter: FilterTab): boolean {
  if (filter === "all") return true;
  if (filter === "commissary_pc") return item.category === "portion" || item.category === "packed";
  if (filter === "commissary_loose") return item.category === "loose";
  if (filter === "supplier") return item.category === "supplier";
  return true;
}

export function todayPHT(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekMonday(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function formatDate(date: string): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-PH", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}

export function computeMetrics(
  catalog: typeof CATALOG,
  adjustments: StockAdjustment[],
  beginnings: Record<string, number>,
): Record<string, DailyMetrics> {
  const metrics: Record<string, DailyMetrics> = {};
  for (const item of catalog) {
    metrics[item.name] = { beginning: beginnings[item.name] ?? null, inQty: 0, outQty: 0, endCount: null };
  }
  const latestCount: Record<string, { qty: number; id: number }> = {};
  for (const adj of adjustments) {
    if (!metrics[adj.item]) continue;
    const m = metrics[adj.item];
    if (adj.type === "in") {
      m.inQty += adj.qty;
    } else if (adj.type === "out" || adj.type === "waste" || adj.type === "sales_import") {
      m.outQty += adj.qty;
    } else if (adj.type === "count") {
      if (!latestCount[adj.item] || adj.id > latestCount[adj.item].id) {
        latestCount[adj.item] = { qty: adj.qty, id: adj.id };
      }
    }
  }
  for (const [item, { qty }] of Object.entries(latestCount)) {
    if (metrics[item]) metrics[item].endCount = qty;
  }
  return metrics;
}
