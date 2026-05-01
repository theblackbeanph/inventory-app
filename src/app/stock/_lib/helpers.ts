import type { StockAdjustment } from "@/lib/types";
import { CATALOG, LOCATIONS } from "@/lib/items";

export type SubTab = "daily" | "delivery" | "manualcount";
export type FilterTab = "all" | typeof LOCATIONS[number]["id"];

export interface DailyMetrics {
  beginning: number | null;
  inQty: number;
  outQty: number;      // pack-based — used for EXP formula
  salesOrders: number; // raw POS order count from sales_import — display only, does not feed EXP
  endCount: number | null;
}

export const CATEGORY_FILTERS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  ...LOCATIONS.map(l => ({ id: l.id as FilterTab, label: l.label })),
];

export function matchesFilter(item: typeof CATALOG[number], filter: FilterTab): boolean {
  if (filter === "all") return true;
  return item.location === filter;
}

export function todayPHT(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Business date: before 2am PHT, the active business day is still yesterday (matches cron cutoff)
export function businessDatePHT(): string {
  const pht = new Date(Date.now() + 8 * 60 * 60 * 1000);
  if (pht.getUTCHours() < 2) pht.setUTCDate(pht.getUTCDate() - 1);
  return pht.toISOString().slice(0, 10);
}

// Business date for StoreHub sync: before 7 AM PHT, the active business day is still yesterday
export function syncDatePHT(): string {
  const pht = new Date(Date.now() + 8 * 60 * 60 * 1000);
  if (pht.getUTCHours() < 7) pht.setUTCDate(pht.getUTCDate() - 1);
  return pht.toISOString().slice(0, 10);
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
    metrics[item.name] = { beginning: beginnings[item.name] ?? null, inQty: 0, outQty: 0, salesOrders: 0, endCount: null };
  }
  const latestCount: Record<string, { qty: number; id: number }> = {};
  for (const adj of adjustments) {
    if (!metrics[adj.item]) continue;
    const m = metrics[adj.item];
    if (adj.type === "in") {
      m.inQty += adj.qty;
    } else if (adj.type === "out" || adj.type === "waste") {
      m.outQty += adj.qty;
    } else if (adj.type === "sales_import") {
      m.outQty += adj.qty; // qty is always pack-based
      if (adj.rawOrders !== undefined) m.salesOrders += adj.rawOrders;
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
