export interface DashboardData {
  date: string;
  branch: string;
  revenue: number;
  txCount: number;
  aov: number;
  hourly: { hour: number; revenue: number }[];
  topItems: { name: string; qty: number }[];
  paymentMix: { card: number; gcash: number; cash: number };
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

  const mixKeys = ["card", "gcash", "cash"] as const;
  const paymentMix = { card: 0, gcash: 0, cash: 0 };
  if (txCount > 0) {
    for (const k of mixKeys) {
      paymentMix[k] = (a.paymentMix[k] * a.txCount + b.paymentMix[k] * b.txCount) / txCount;
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
  };
}
