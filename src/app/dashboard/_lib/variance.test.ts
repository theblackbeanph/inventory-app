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

import { computeItemSummaries, datesInRange } from "./variance";

describe("datesInRange", () => {
  it("returns single date when start equals end", () => {
    expect(datesInRange("2026-05-01", "2026-05-01")).toEqual(["2026-05-01"]);
  });

  it("returns sequential dates in range", () => {
    expect(datesInRange("2026-05-01", "2026-05-03")).toEqual([
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
    ]);
  });

  it("handles month boundary correctly", () => {
    expect(datesInRange("2026-04-29", "2026-05-01")).toEqual([
      "2026-04-29",
      "2026-04-30",
      "2026-05-01",
    ]);
  });
});

describe("computeItemSummaries", () => {
  const dates3 = ["2026-05-01", "2026-05-02", "2026-05-03"];

  const adj = (overrides: Partial<StockAdjustment> & { id: number; date: string; item: string; type: "count" | "in" | "out" | "waste" | "sales_import"; qty: number }): StockAdjustment => ({
    branch: "MKT",
    department: "kitchen",
    loggedBy: "admin",
    ...overrides,
  });

  const beg = (date: string, item: string, qty: number): DailyBeginning => ({
    id: `beg-${date}-${item}`,
    branch: "MKT",
    department: "kitchen",
    item,
    date,
    qty,
    setBy: "admin",
    updatedAt: "",
  });

  it("returns empty when no adjustments", () => {
    const { summaries, kpis } = computeItemSummaries([], [], dates3);
    expect(summaries).toHaveLength(0);
    expect(kpis.netVariance).toBe(0);
  });

  it("returns empty when no dates", () => {
    const adjs = [adj({ id: 1, date: "2026-05-01", item: "Salmon", type: "count", qty: 10 })];
    const { summaries } = computeItemSummaries(adjs, [], []);
    expect(summaries).toHaveLength(0);
  });

  it("aggregates period variance across multiple days for one item", () => {
    const adjs = [
      adj({ id: 1, date: "2026-05-01", item: "Salmon", type: "count", qty: 10 }),
      adj({ id: 2, date: "2026-05-02", item: "Salmon", type: "count", qty: 8 }),
    ];
    const begs = [
      beg("2026-05-01", "Salmon", 15),
      beg("2026-05-02", "Salmon", 10),
    ];
    const { summaries } = computeItemSummaries(adjs, begs, dates3);
    expect(summaries).toHaveLength(1);
    // Day 1: exp=15, actual=10 → var=-5
    // Day 2: exp=10, actual=8 → var=-2
    // periodVariance = -7
    expect(summaries[0].periodVariance).toBe(-7);
    expect(summaries[0].daysWithVariance).toBe(2);
  });

  it("skips item when periodVariance === 0", () => {
    const adjs = [adj({ id: 1, date: "2026-05-01", item: "Salmon", type: "count", qty: 15 })];
    const begs = [beg("2026-05-01", "Salmon", 15)];
    const { summaries } = computeItemSummaries(adjs, begs, dates3);
    expect(summaries).toHaveLength(0);
  });

  it("classifies critical when |periodVariance| >= 10", () => {
    const adjs = [adj({ id: 1, date: "2026-05-01", item: "Salmon", type: "count", qty: 0 })];
    const begs = [beg("2026-05-01", "Salmon", 15)];
    const { summaries } = computeItemSummaries(adjs, begs, dates3);
    expect(summaries[0].status).toBe("critical"); // -15
  });

  it("classifies watch when |periodVariance| is 3–9", () => {
    const adjs = [adj({ id: 1, date: "2026-05-01", item: "Salmon", type: "count", qty: 12 })];
    const begs = [beg("2026-05-01", "Salmon", 15)];
    const { summaries } = computeItemSummaries(adjs, begs, dates3);
    expect(summaries[0].status).toBe("watch"); // -3
  });

  it("classifies normal when |periodVariance| is 1–2", () => {
    const adjs = [adj({ id: 1, date: "2026-05-01", item: "Salmon", type: "count", qty: 14 })];
    const begs = [beg("2026-05-01", "Salmon", 15)];
    const { summaries } = computeItemSummaries(adjs, begs, dates3);
    expect(summaries[0].status).toBe("normal"); // -1
  });

  it("sorts summaries by |periodVariance| descending", () => {
    const adjs = [
      adj({ id: 1, date: "2026-05-01", item: "A", type: "count", qty: 5 }),
      adj({ id: 2, date: "2026-05-01", item: "B", type: "count", qty: 0 }),
    ];
    const begs = [
      beg("2026-05-01", "A", 15), // -10
      beg("2026-05-01", "B", 20), // -20
    ];
    const { summaries } = computeItemSummaries(adjs, begs, dates3);
    expect(summaries[0].item).toBe("B");
    expect(summaries[1].item).toBe("A");
  });

  it("factors IN and OUT movements into expected", () => {
    const adjs = [
      adj({ id: 1, date: "2026-05-01", item: "Salmon", type: "count", qty: 5 }),
      adj({ id: 2, date: "2026-05-01", item: "Salmon", type: "in", qty: 10 }),
      adj({ id: 3, date: "2026-05-01", item: "Salmon", type: "out", qty: 3 }),
    ];
    const begs = [beg("2026-05-01", "Salmon", 20)];
    const { summaries } = computeItemSummaries(adjs, begs, dates3);
    // exp = 20 + 10 - 3 = 27, actual = 5, var = -22
    expect(summaries[0].periodVariance).toBe(-22);
  });

  it("counts waste and sales_import as outflow", () => {
    const adjs = [
      adj({ id: 1, date: "2026-05-01", item: "Salmon", type: "count", qty: 5 }),
      adj({ id: 2, date: "2026-05-01", item: "Salmon", type: "waste", qty: 4 }),
      adj({ id: 3, date: "2026-05-01", item: "Salmon", type: "sales_import", qty: 6 }),
    ];
    const begs = [beg("2026-05-01", "Salmon", 20)];
    const { summaries } = computeItemSummaries(adjs, begs, dates3);
    // exp = 20 - 4 - 6 = 10, actual = 5, var = -5
    expect(summaries[0].periodVariance).toBe(-5);
  });

  it("includes days without counts as null variance in dailyRows", () => {
    const adjs = [adj({ id: 1, date: "2026-05-01", item: "Salmon", type: "count", qty: 10 })];
    const begs = [beg("2026-05-01", "Salmon", 15)];
    const { summaries } = computeItemSummaries(adjs, begs, dates3);
    expect(summaries[0].dailyRows).toHaveLength(3);
    expect(summaries[0].dailyRows[0].variance).toBe(-5);   // May 1 — counted
    expect(summaries[0].dailyRows[1].variance).toBeNull(); // May 2 — no count
    expect(summaries[0].dailyRows[2].variance).toBeNull(); // May 3 — no count
  });

  it("latestEnd is the END value from the most recent counted day", () => {
    const adjs = [
      adj({ id: 1, date: "2026-05-01", item: "Salmon", type: "count", qty: 10 }),
      adj({ id: 2, date: "2026-05-03", item: "Salmon", type: "count", qty: 6 }),
    ];
    const begs = [
      beg("2026-05-01", "Salmon", 15),
      beg("2026-05-03", "Salmon", 8),
    ];
    const { summaries } = computeItemSummaries(adjs, begs, dates3);
    expect(summaries[0].latestEnd).toBe(6); // May 3 is most recent
  });

  it("computes KPI loss, surplus and net correctly", () => {
    const adjs = [
      adj({ id: 1, date: "2026-05-01", item: "A", type: "count", qty: 0 }),
      adj({ id: 2, date: "2026-05-01", item: "B", type: "count", qty: 25 }),
    ];
    const begs = [
      beg("2026-05-01", "A", 15), // -15 loss
      beg("2026-05-01", "B", 20), // +5 surplus
    ];
    const { kpis } = computeItemSummaries(adjs, begs, dates3);
    expect(kpis.criticalCount).toBe(1); // A is critical (-15)
    expect(kpis.watchCount).toBe(1);    // B is watch (+5)
    expect(kpis.totalLoss).toBe(-15);
    expect(kpis.totalSurplus).toBe(5);
    expect(kpis.netVariance).toBe(-10);
  });

  it("sets hasInsight when daysWithVariance >= 70% of period", () => {
    const dates7 = datesInRange("2026-04-27", "2026-05-03");
    // 5 days with variance=-5, 2 days with variance=0 (counts match BEG)
    const adjs = dates7.map((d, i) =>
      adj({ id: i + 1, date: d, item: "Salmon", type: "count", qty: i === 1 || i === 5 ? 15 : 10 })
    );
    const begs = dates7.map(d => beg(d, "Salmon", 15));
    const { summaries } = computeItemSummaries(adjs, begs, dates7);
    expect(summaries[0].daysWithVariance).toBe(5);
    expect(summaries[0].hasInsight).toBe(true);
  });

  it("does not set hasInsight when fewer than 5 days in period", () => {
    const dates4 = ["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04"];
    const adjs = dates4.map((d, i) =>
      adj({ id: i + 1, date: d, item: "Salmon", type: "count", qty: 10 })
    );
    const begs = dates4.map(d => beg(d, "Salmon", 15));
    const { summaries } = computeItemSummaries(adjs, begs, dates4);
    expect(summaries[0].hasInsight).toBe(false);
  });

  it("detects better trend when variance shrinks from first to second half", () => {
    const dates4 = ["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04"];
    const adjs = [
      adj({ id: 1, date: "2026-05-01", item: "A", type: "count", qty: 0 }),  // var=-15
      adj({ id: 2, date: "2026-05-02", item: "A", type: "count", qty: 0 }),  // var=-15
      adj({ id: 3, date: "2026-05-03", item: "A", type: "count", qty: 15 }), // var=0
      adj({ id: 4, date: "2026-05-04", item: "A", type: "count", qty: 15 }), // var=0
    ];
    const begs = dates4.map(d => beg(d, "A", 15));
    const { summaries } = computeItemSummaries(adjs, begs, dates4);
    expect(summaries[0].trend).toBe("better");
  });

  it("detects worse trend when variance grows from first to second half", () => {
    const dates4 = ["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04"];
    const adjs = [
      adj({ id: 1, date: "2026-05-01", item: "A", type: "count", qty: 15 }), // var=0
      adj({ id: 2, date: "2026-05-02", item: "A", type: "count", qty: 15 }), // var=0
      adj({ id: 3, date: "2026-05-03", item: "A", type: "count", qty: 0 }),  // var=-15
      adj({ id: 4, date: "2026-05-04", item: "A", type: "count", qty: 0 }),  // var=-15
    ];
    const begs = dates4.map(d => beg(d, "A", 15));
    const { summaries } = computeItemSummaries(adjs, begs, dates4);
    expect(summaries[0].trend).toBe("worse");
  });
});
