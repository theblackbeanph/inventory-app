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
