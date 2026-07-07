import { describe, it, expect } from "vitest";
import { combineDashboards, type DashboardData } from "./combine";

function mk(over: Partial<DashboardData>): DashboardData {
  return {
    date: "2026-07-07",
    branch: "MKT",
    revenue: 0,
    txCount: 0,
    aov: 0,
    hourly: [{ hour: 7, revenue: 0 }, { hour: 8, revenue: 0 }],
    topItems: [],
    paymentMix: { card: 0, gcash: 0, cash: 0 },
    ...over,
  };
}

describe("combineDashboards", () => {
  it("sums revenue and txCount", () => {
    const c = combineDashboards(mk({ revenue: 42650, txCount: 48 }), mk({ branch: "BF", revenue: 60490, txCount: 61 }));
    expect(c.revenue).toBe(103140);
    expect(c.txCount).toBe(109);
  });

  it("recomputes AOV from totals, not average of AOVs", () => {
    // MKT: 1000 / 10 = 100 AOV. BF: 3000 / 10 = 300 AOV. Combined: 4000/20 = 200 (not 200 by luck: avg would also be 200) —
    // use asymmetric tx counts to prove it: MKT 1000/10=100, BF 300/1=300 → combined 1300/11 = 118, avg of AOVs would be 200.
    const c = combineDashboards(mk({ revenue: 1000, txCount: 10, aov: 100 }), mk({ branch: "BF", revenue: 300, txCount: 1, aov: 300 }));
    expect(c.aov).toBe(Math.round(1300 / 11));
  });

  it("returns aov 0 when combined txCount is 0", () => {
    const c = combineDashboards(mk({}), mk({ branch: "BF" }));
    expect(c.aov).toBe(0);
  });

  it("sums hourly by hour", () => {
    const a = mk({ hourly: [{ hour: 7, revenue: 100 }, { hour: 8, revenue: 200 }] });
    const b = mk({ branch: "BF", hourly: [{ hour: 7, revenue: 50 }, { hour: 8, revenue: 25 }] });
    expect(combineDashboards(a, b).hourly).toEqual([{ hour: 7, revenue: 150 }, { hour: 8, revenue: 225 }]);
  });

  it("merges topItems by name, sums qty, sorts desc, caps at 6", () => {
    const a = mk({ topItems: [{ name: "Fish & Chips", qty: 10 }, { name: "Long Black", qty: 8 }] });
    const b = mk({ branch: "BF", topItems: [
      { name: "Fish & Chips", qty: 4 }, { name: "Beef Tapa", qty: 5 }, { name: "Cobbler", qty: 3 },
      { name: "Aburi", qty: 2 }, { name: "Adobo", qty: 2 }, { name: "Arroz", qty: 1 },
    ]});
    const items = combineDashboards(a, b).topItems;
    expect(items[0]).toEqual({ name: "Fish & Chips", qty: 14 });
    expect(items[1]).toEqual({ name: "Long Black", qty: 8 });
    expect(items).toHaveLength(6);
  });

  it("recomputes paymentMix weighted by txCount", () => {
    // MKT: 10 tx, 100% cash. BF: 30 tx, 100% card. Combined: 25% cash, 75% card.
    const a = mk({ txCount: 10, paymentMix: { card: 0, gcash: 0, cash: 1 } });
    const b = mk({ branch: "BF", txCount: 30, paymentMix: { card: 1, gcash: 0, cash: 0 } });
    const mix = combineDashboards(a, b).paymentMix;
    expect(mix.cash).toBeCloseTo(0.25, 5);
    expect(mix.card).toBeCloseTo(0.75, 5);
    expect(mix.gcash).toBe(0);
  });

  it("returns zeroed paymentMix when combined txCount is 0", () => {
    const mix = combineDashboards(mk({}), mk({ branch: "BF" })).paymentMix;
    expect(mix).toEqual({ card: 0, gcash: 0, cash: 0 });
  });

  it("keeps the date and labels branch as ALL", () => {
    const c = combineDashboards(mk({}), mk({ branch: "BF" }));
    expect(c.date).toBe("2026-07-07");
    expect(c.branch).toBe("ALL");
  });
});
