export interface DashboardData {
  date: string;
  branch: string;
  revenue: number;
  txCount: number;
  aov: number;
  hourly: { hour: number; revenue: number }[];
  topItems: { name: string; qty: number }[];
  paymentMix: { card: number; gcash: number; cash: number };
  soldBySku?: Record<string, number>;
  grabFood?: { revenue: number; txCount: number; aov: number };
}

export function combineDashboards(a: DashboardData, b: DashboardData): DashboardData {
  const revenue = a.revenue + b.revenue;
  const txCount = a.txCount + b.txCount;

  const hourlyMap = new Map<number, number>();
  for (const { hour, revenue: r } of [...a.hourly, ...b.hourly]) {
    hourlyMap.set(hour, (hourlyMap.get(hour) ?? 0) + r);
  }
  const hourly = [...hourlyMap.entries()]
    .sort(([h1], [h2]) => h1 - h2)
    .map(([hour, r]) => ({ hour, revenue: r }));

  const itemMap = new Map<string, number>();
  for (const { name, qty } of [...a.topItems, ...b.topItems]) {
    itemMap.set(name, (itemMap.get(name) ?? 0) + qty);
  }
  const topItems = [...itemMap.entries()]
    .map(([name, qty]) => ({ name, qty }))
    .sort((x, y) => y.qty - x.qty)
    .slice(0, 6);

  // soldBySku: sum quantities per SKU across both branches
  const skuAccum = new Map<string, number>();
  for (const [sku, qty] of Object.entries(a.soldBySku ?? {})) {
    skuAccum.set(sku, (skuAccum.get(sku) ?? 0) + qty);
  }
  for (const [sku, qty] of Object.entries(b.soldBySku ?? {})) {
    skuAccum.set(sku, (skuAccum.get(sku) ?? 0) + qty);
  }
  const soldBySku = Object.fromEntries(skuAccum);

  // grabFood: sum revenue + txCount, recompute aov
  const grabFoodRevenue = (a.grabFood?.revenue ?? 0) + (b.grabFood?.revenue ?? 0);
  const grabFoodCount   = (a.grabFood?.txCount ?? 0) + (b.grabFood?.txCount ?? 0);
  const grabFood = {
    revenue: grabFoodRevenue,
    txCount: grabFoodCount,
    aov: grabFoodCount ? Math.round(grabFoodRevenue / grabFoodCount) : 0,
  };

  // paymentMix: weight by dine-in txCount (GrabFood excluded from paymentCounts)
  const mixKeys = ["card", "gcash", "cash"] as const;
  const paymentMix = { card: 0, gcash: 0, cash: 0 };
  const aDineIn = a.txCount - (a.grabFood?.txCount ?? 0);
  const bDineIn = b.txCount - (b.grabFood?.txCount ?? 0);
  const totalDineIn = aDineIn + bDineIn;
  if (totalDineIn > 0) {
    for (const k of mixKeys) {
      paymentMix[k] = (a.paymentMix[k] * aDineIn + b.paymentMix[k] * bDineIn) / totalDineIn;
    }
  }

  return {
    date: a.date,
    branch: "ALL",
    revenue,
    txCount,
    aov: txCount ? Math.round(revenue / txCount) : 0,
    hourly,
    topItems,
    paymentMix,
    soldBySku,
    grabFood,
  };
}
