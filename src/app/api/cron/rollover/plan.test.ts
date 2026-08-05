import { describe, it, expect } from "vitest";
import { computeRolloverPlan, type RolloverInput, type PlanWrite } from "./plan";
import { CATALOG } from "@/lib/items";
import type {
  StockAdjustment, DailyBeginning, DailyClose, StocktakeDraft,
} from "@/lib/types";

// ── Fixtures ────────────────────────────────────────────────────────────────

const BRANCH = "MKT" as const;
const DEPT = "kitchen" as const;
const YESTERDAY = "2026-08-03";
const TODAY = "2026-08-04";

// Use real catalog items so CATALOG_MAP + deptCatalog lookups both hit
const ITEM_A = "Burger Patty";     // reorderAt: 15, portion, pc
const ITEM_B = "Adobo Flakes";     // reorderAt: 10, portion, pc

const deptCatalogKitchenMKT = CATALOG.filter(
  i => i.department === DEPT && (!i.branches || i.branches.includes(BRANCH))
);

// Deterministic id generator for tests
function makeIdGen(start = 1000) {
  let n = start;
  return () => ++n;
}

function baseInput(overrides: Partial<RolloverInput> = {}): RolloverInput {
  return {
    branch: BRANCH,
    dept: DEPT,
    yesterday: YESTERDAY,
    today: TODAY,
    adjustments: [],
    beginnings: [],
    closes: [],
    todayBeginnings: [],
    drafts: [],
    deptCatalog: deptCatalogKitchenMKT,
    clock: {
      now: 1_700_000_000_000,
      nowISO: "2026-08-04T02:00:00.000Z",
      nextAdjId: makeIdGen(),
    },
    ...overrides,
  };
}

function beg(item: string, qty: number): DailyBeginning {
  return {
    id: `${BRANCH}__${DEPT}__${item}__${YESTERDAY}`,
    branch: BRANCH, department: DEPT, item, date: YESTERDAY,
    qty, setBy: "admin", updatedAt: YESTERDAY,
  };
}

function adj(item: string, type: StockAdjustment["type"], qty: number, id = 1): StockAdjustment {
  return {
    id, branch: BRANCH, department: DEPT, date: YESTERDAY,
    item, type, qty, loggedBy: "admin",
  };
}

function draft(counts: Record<string, number>, location = "front_kitchen"): { id: string; data: StocktakeDraft } {
  return {
    id: `${BRANCH}__${DEPT}__${YESTERDAY}__${location}`,
    data: {
      id: `${BRANCH}__${DEPT}__${YESTERDAY}__${location}`,
      branch: BRANCH, department: DEPT, date: YESTERDAY, location,
      counts, savedAt: "2026-08-03T18:00:00Z", savedBy: "admin",
    },
  };
}

function close(items: Record<string, { beginning: number; inQty: number; outQty: number; expected: number; endCount: number; variance: number }>): DailyClose {
  return {
    id: `${BRANCH}__${DEPT}__${YESTERDAY}`,
    branch: BRANCH, department: DEPT, date: YESTERDAY,
    countType: "manual", closedAt: "2026-08-04T00:30:00Z",
    closedBy: "admin", isLocked: true, items,
  };
}

// Small assertion helpers
function findWrite(writes: PlanWrite[], kind: PlanWrite["kind"], predicate: (w: any) => boolean) {
  return writes.find(w => w.kind === kind && predicate(w as any));
}
function adjWrites(writes: PlanWrite[]) {
  return writes.filter(w => w.kind === "adjAutoId") as Extract<PlanWrite, { kind: "adjAutoId" }>[];
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("computeRolloverPlan", () => {
  describe("Test 1 — empty day", () => {
    it("produces no writes when there is no data at all", () => {
      const plan = computeRolloverPlan(baseInput());
      expect(plan.closeWrites).toEqual([]);
      expect(plan.draftDeletes).toEqual([]);
      expect(plan.begWrites).toEqual([]);
      expect(plan.logs).toEqual([`${BRANCH}/${DEPT}: no data, skipped`]);
    });
  });

  describe("Test 2 — full auto-close, no manual counts", () => {
    it("uses expected = beg + in - out and writes close + adj + branchStock + BEG", () => {
      const plan = computeRolloverPlan(baseInput({
        beginnings: [beg(ITEM_A, 20)],
        adjustments: [
          adj(ITEM_A, "in", 10, 1),
          adj(ITEM_A, "out", 3, 2),
        ],
      }));

      const closeSet = findWrite(plan.closeWrites, "closeSet", w => w.data.department === DEPT) as any;
      expect(closeSet).toBeTruthy();
      expect(closeSet.data.countType).toBe("system");
      expect(closeSet.data.closedBy).toBe("system");
      expect(closeSet.data.closedAt).toBe("2026-08-04T02:00:00.000Z");
      expect(closeSet.data.items[ITEM_A]).toEqual({
        beginning: 20, inQty: 10, outQty: 3,
        expected: 27, endCount: 27, variance: 0,
      });

      const adjs = adjWrites(plan.closeWrites);
      expect(adjs).toHaveLength(1);
      expect(adjs[0].data).toMatchObject({
        item: ITEM_A, type: "count", qty: 27,
        loggedBy: "system", note: "Auto-closed",
        date: YESTERDAY, branch: BRANCH, department: DEPT,
      });

      const stockWrite = findWrite(plan.closeWrites, "branchStockMerge", w => w.data.item === ITEM_A) as any;
      expect(stockWrite.data.qty).toBe(27);

      // BEG carried into today
      expect(plan.begWrites).toHaveLength(1);
      const begWrite = plan.begWrites[0] as any;
      expect(begWrite.data).toMatchObject({ item: ITEM_A, qty: 27, date: TODAY, setBy: "system" });
    });
  });

  describe("Test 3 — auto-close with manual count adj", () => {
    it("manual count wins over draft and over expected; skips auto system-count write", () => {
      const plan = computeRolloverPlan(baseInput({
        beginnings: [beg(ITEM_A, 20)],
        adjustments: [
          adj(ITEM_A, "in", 10, 1),
          adj(ITEM_A, "count", 25, 5),  // manual count — should win
        ],
        drafts: [draft({ [ITEM_A]: 99 })],  // draft ignored in favor of manual count
      }));

      const closeSet = findWrite(plan.closeWrites, "closeSet", () => true) as any;
      expect(closeSet.data.items[ITEM_A].endCount).toBe(25);
      expect(closeSet.data.items[ITEM_A].expected).toBe(30);  // 20 + 10 - 0
      expect(closeSet.data.items[ITEM_A].variance).toBe(-5);

      // No auto adj written because manual count exists
      const adjs = adjWrites(plan.closeWrites);
      expect(adjs).toHaveLength(0);

      // BEG carried at the manual count
      expect((plan.begWrites[0] as any).data.qty).toBe(25);
    });

    it("uses the count with the highest id when multiple counts exist", () => {
      const plan = computeRolloverPlan(baseInput({
        beginnings: [beg(ITEM_A, 0)],
        adjustments: [
          adj(ITEM_A, "count", 10, 1),
          adj(ITEM_A, "count", 30, 3),   // winner
          adj(ITEM_A, "count", 20, 2),
        ],
      }));
      const closeSet = findWrite(plan.closeWrites, "closeSet", () => true) as any;
      expect(closeSet.data.items[ITEM_A].endCount).toBe(30);
    });
  });

  describe("Test 4 — manual close, all items present", () => {
    it("does not write any close/adj/stock; only carries BEG from existing close", () => {
      const plan = computeRolloverPlan(baseInput({
        adjustments: [adj(ITEM_A, "in", 5, 1)],
        beginnings: [beg(ITEM_A, 10)],
        closes: [close({
          [ITEM_A]: { beginning: 10, inQty: 5, outQty: 0, expected: 15, endCount: 14, variance: -1 },
        })],
      }));

      expect(plan.closeWrites).toEqual([]);      // nothing to fill
      expect(plan.begWrites).toHaveLength(1);
      expect((plan.begWrites[0] as any).data.qty).toBe(14);  // from close.endCount

      // Log confirms no fill
      expect(plan.logs.some(l => l.includes("already closed (manual)"))).toBe(true);
      expect(plan.logs.some(l => l.includes("filled"))).toBe(false);
    });
  });

  describe("Test 5 — manual close, partial (the 2026-08-03 fix)", () => {
    it("auto-fills items in adj/beg that are missing from the manual close", () => {
      const plan = computeRolloverPlan(baseInput({
        adjustments: [
          adj(ITEM_A, "in", 5, 1),
          adj(ITEM_B, "in", 4, 2),   // ITEM_B has activity but was not in the manual close
        ],
        beginnings: [beg(ITEM_A, 10), beg(ITEM_B, 6)],
        closes: [close({
          [ITEM_A]: { beginning: 10, inQty: 5, outQty: 0, expected: 15, endCount: 15, variance: 0 },
          // ITEM_B intentionally missing
        })],
      }));

      // Merge write for the missing item
      const mergeWrite = findWrite(plan.closeWrites, "closeMerge", w => w.id.includes(YESTERDAY)) as any;
      expect(mergeWrite).toBeTruthy();
      expect(Object.keys(mergeWrite.items)).toEqual([ITEM_B]);
      expect(mergeWrite.items[ITEM_B]).toEqual({
        beginning: 6, inQty: 4, outQty: 0,
        expected: 10, endCount: 10, variance: 0,
      });

      // Auto-fill count adj with the marker used by StocktakeCompleted's AUTO chip
      const adjs = adjWrites(plan.closeWrites);
      expect(adjs).toHaveLength(1);
      expect(adjs[0].data).toMatchObject({
        item: ITEM_B, type: "count", qty: 10,
        loggedBy: "system", note: "Auto-filled (partial stocktake)",
      });

      // branchStock upsert for the filled item only
      const stockB = findWrite(plan.closeWrites, "branchStockMerge", w => w.data.item === ITEM_B) as any;
      expect(stockB.data.qty).toBe(10);
      const stockA = findWrite(plan.closeWrites, "branchStockMerge", w => w.data.item === ITEM_A);
      expect(stockA).toBeFalsy();

      // BEG carries BOTH items (ITEM_A from close, ITEM_B from fill)
      const begItems = plan.begWrites.map(w => ({ item: (w as any).data.item, qty: (w as any).data.qty }));
      expect(begItems).toContainEqual({ item: ITEM_A, qty: 15 });
      expect(begItems).toContainEqual({ item: ITEM_B, qty: 10 });
    });

    it("does nothing when the manual close covers all items with activity", () => {
      const plan = computeRolloverPlan(baseInput({
        adjustments: [adj(ITEM_A, "in", 5, 1)],
        beginnings: [beg(ITEM_A, 10)],
        closes: [close({
          [ITEM_A]: { beginning: 10, inQty: 5, outQty: 0, expected: 15, endCount: 15, variance: 0 },
        })],
      }));
      expect(plan.closeWrites).toEqual([]);
    });
  });

  describe("Test 6 — draft only (auto-close path)", () => {
    it("uses draft counts as endCount when no manual count and no adj exists", () => {
      const plan = computeRolloverPlan(baseInput({
        beginnings: [beg(ITEM_A, 5)],   // BEG exists so item enters itemsWithData
        drafts: [draft({ [ITEM_A]: 12 })],
      }));

      const closeSet = findWrite(plan.closeWrites, "closeSet", () => true) as any;
      expect(closeSet.data.items[ITEM_A]).toEqual({
        beginning: 5, inQty: 0, outQty: 0,
        expected: 5, endCount: 12, variance: 7,   // draft won
      });

      // Auto system-count adj was written at expected (5), NOT the draft count
      // (preserves current behavior — auto-closed adj records the formula value)
      const adjs = adjWrites(plan.closeWrites);
      expect(adjs).toHaveLength(1);
      expect(adjs[0].data.qty).toBe(5);
      expect(adjs[0].data.note).toBe("Auto-closed");

      // But BEG carry uses the finalEnd (draft = 12)
      expect((plan.begWrites[0] as any).data.qty).toBe(12);
    });
  });

  describe("Test 7 — waste + sales_import both count as out", () => {
    it("treats waste, sales_import, and out identically in the formula", () => {
      const plan = computeRolloverPlan(baseInput({
        beginnings: [beg(ITEM_A, 30)],
        adjustments: [
          adj(ITEM_A, "out", 5, 1),
          adj(ITEM_A, "waste", 4, 2),
          adj(ITEM_A, "sales_import", 6, 3),
        ],
      }));

      const closeSet = findWrite(plan.closeWrites, "closeSet", () => true) as any;
      expect(closeSet.data.items[ITEM_A]).toMatchObject({
        beginning: 30, inQty: 0, outQty: 15,   // 5 + 4 + 6
        expected: 15, endCount: 15,
      });
    });

    it("clamps negative expected to 0", () => {
      const plan = computeRolloverPlan(baseInput({
        beginnings: [beg(ITEM_A, 5)],
        adjustments: [adj(ITEM_A, "out", 20, 1)],
      }));
      const closeSet = findWrite(plan.closeWrites, "closeSet", () => true) as any;
      expect(closeSet.data.items[ITEM_A].expected).toBe(0);
    });
  });

  describe("Test 8 — partial close, draft-only item (Commit B fix)", () => {
    it("carries a draft-only item forward using the draft count (no BEG, no adj)", () => {
      // Prior behavior: this draft was silently dropped by partial-fill.
      // Fixed: draft-only items are included, treated as endCount with variance.
      const plan = computeRolloverPlan(baseInput({
        adjustments: [adj(ITEM_A, "in", 5, 1)],
        beginnings: [beg(ITEM_A, 10)],
        closes: [close({
          [ITEM_A]: { beginning: 10, inQty: 5, outQty: 0, expected: 15, endCount: 15, variance: 0 },
        })],
        drafts: [draft({ [ITEM_B]: 12 })],   // ITEM_B: no BEG, no adj, not in close
      }));

      // Assertion 1: count adj written with draft qty + the AUTO-chip marker
      const adjs = adjWrites(plan.closeWrites);
      expect(adjs).toHaveLength(1);
      expect(adjs[0].data).toMatchObject({
        item: ITEM_B, type: "count", qty: 12,
        loggedBy: "system", note: "Auto-filled (partial stocktake)",
      });

      // Assertion 2: branchStock upsert at draft qty (NOT 0)
      const stockWrite = findWrite(plan.closeWrites, "branchStockMerge", w => w.data.item === ITEM_B) as any;
      expect(stockWrite.data.qty).toBe(12);

      // Assertion 3: close doc merges the draft-only item with variance = draftCount
      // (intentional — surfaces "we didn't know this existed" on the dashboard)
      const mergeWrite = findWrite(plan.closeWrites, "closeMerge", () => true) as any;
      expect(mergeWrite.items[ITEM_B]).toEqual({
        beginning: 0, inQty: 0, outQty: 0,
        expected: 0, endCount: 12, variance: 12,
      });

      // BEG carry uses the draft count
      const begB = plan.begWrites.find(w => (w as any).data.item === ITEM_B) as any;
      expect(begB.data.qty).toBe(12);
    });

    it("manual count wins over draft in partial-fill path", () => {
      // Symmetry with auto-close: manual > draft > expected.
      const plan = computeRolloverPlan(baseInput({
        closes: [close({
          [ITEM_A]: { beginning: 0, inQty: 0, outQty: 0, expected: 0, endCount: 0, variance: 0 },
        })],
        adjustments: [adj(ITEM_B, "count", 7, 5)],  // manual count
        drafts: [draft({ [ITEM_B]: 12 })],           // draft (ignored)
      }));
      const adjs = adjWrites(plan.closeWrites);
      expect(adjs).toHaveLength(1);
      expect(adjs[0].data.qty).toBe(7);   // manual won
    });

    it("draft count is used when BEG + adj exist but no manual count", () => {
      const plan = computeRolloverPlan(baseInput({
        closes: [close({
          [ITEM_A]: { beginning: 0, inQty: 0, outQty: 0, expected: 0, endCount: 0, variance: 0 },
        })],
        beginnings: [beg(ITEM_B, 5)],
        adjustments: [adj(ITEM_B, "in", 3, 1)],  // expected would be 8
        drafts: [draft({ [ITEM_B]: 15 })],        // draft wins
      }));
      const mergeWrite = findWrite(plan.closeWrites, "closeMerge", () => true) as any;
      expect(mergeWrite.items[ITEM_B]).toEqual({
        beginning: 5, inQty: 3, outQty: 0,
        expected: 8, endCount: 15, variance: 7,
      });
    });
  });

  describe("Test 9 — BEG divergence overwrites and logs (OCC 2026-08-03 class of failure)", () => {
    it("overwrites a divergent today-BEG with the close endCount and writes an anomaly doc", () => {
      // Regression: OCC MKT/dining 2026-08-03 had BEG=14/setBy=Kent written
      // out-of-band before the 2am rollover. Old guard unconditionally skipped;
      // wrong value propagated for 2 days.
      const plan = computeRolloverPlan(baseInput({
        beginnings: [beg(ITEM_A, 14)],
        adjustments: [adj(ITEM_A, "out", 5, 1)],   // expected = 9
        todayBeginnings: [{
          id: `${BRANCH}__${DEPT}__${ITEM_A}__${TODAY}`,
          branch: BRANCH, department: DEPT, item: ITEM_A, date: TODAY,
          qty: 14, setBy: "Kent", updatedAt: YESTERDAY,   // out-of-band write
        }],
      }));

      // BEG overwrite fires with the close value + system attribution
      const begWrite = plan.begWrites.find(w => w.kind === "begSet" && (w as any).data.item === ITEM_A) as any;
      expect(begWrite).toBeTruthy();
      expect(begWrite.data).toMatchObject({ item: ITEM_A, qty: 9, setBy: "system", date: TODAY });

      // Anomaly doc written with the diagnostic fingerprint
      const anomalyWrite = plan.begWrites.find(w => w.kind === "anomalySet") as any;
      expect(anomalyWrite).toBeTruthy();
      expect(anomalyWrite.id).toBe(`${BRANCH}__${DEPT}__${ITEM_A}__${TODAY}`);
      expect(anomalyWrite.data).toMatchObject({
        branch: BRANCH, dept: DEPT, item: ITEM_A, date: TODAY,
        existingQty: 14, existingSetBy: "Kent", expectedQty: 9,
      });
      expect(anomalyWrite.data.detectedAt).toBe("2026-08-04T02:00:00.000Z");

      // Log line names the divergence
      expect(plan.logs.some(l => /BEG divergence for Burger Patty/.test(l))).toBe(true);
    });
  });

  describe("Test 10 — BEG agreement is preserved (no writes)", () => {
    it("skips both BEG and anomaly writes when existing today-BEG matches close", () => {
      const plan = computeRolloverPlan(baseInput({
        beginnings: [beg(ITEM_A, 14)],
        adjustments: [adj(ITEM_A, "out", 5, 1)],   // expected = 9
        todayBeginnings: [{
          id: `${BRANCH}__${DEPT}__${ITEM_A}__${TODAY}`,
          branch: BRANCH, department: DEPT, item: ITEM_A, date: TODAY,
          qty: 9, setBy: "admin", updatedAt: TODAY,   // matches close endCount
        }],
      }));
      expect(plan.begWrites.filter(w => (w as any).data.item === ITEM_A)).toEqual([]);
      expect(plan.begWrites.filter(w => w.kind === "anomalySet")).toEqual([]);
      expect(plan.logs.some(l => /divergence/.test(l))).toBe(false);
    });
  });

  describe("Test 11 — mixed BEG state (agree / diverge / no-existing)", () => {
    it("only diverging and no-existing items get BEG writes; agreement preserved untouched", () => {
      const ITEM_C = "Beef Tapa";
      const plan = computeRolloverPlan(baseInput({
        beginnings: [beg(ITEM_A, 10), beg(ITEM_B, 8), beg(ITEM_C, 5)],
        // ITEM_A expected = 10, ITEM_B expected = 8, ITEM_C expected = 5
        adjustments: [],
        todayBeginnings: [
          // ITEM_A agrees with expected — should be skipped
          { id: `${BRANCH}__${DEPT}__${ITEM_A}__${TODAY}`, branch: BRANCH, department: DEPT, item: ITEM_A, date: TODAY, qty: 10, setBy: "admin", updatedAt: TODAY },
          // ITEM_B diverges — overwrite + anomaly
          { id: `${BRANCH}__${DEPT}__${ITEM_B}__${TODAY}`, branch: BRANCH, department: DEPT, item: ITEM_B, date: TODAY, qty: 99, setBy: "Kent", updatedAt: YESTERDAY },
          // ITEM_C has no existing today-BEG — normal carry
        ],
      }));

      // ITEM_A: no writes
      const aWrites = plan.begWrites.filter(w => (w as any).data.item === ITEM_A);
      expect(aWrites).toEqual([]);

      // ITEM_B: both BEG overwrite + anomaly
      const bBeg = plan.begWrites.find(w => w.kind === "begSet" && (w as any).data.item === ITEM_B) as any;
      expect(bBeg.data.qty).toBe(8);
      const bAnomaly = plan.begWrites.find(w => w.kind === "anomalySet" && (w as any).data.item === ITEM_B) as any;
      expect(bAnomaly).toBeTruthy();
      expect(bAnomaly.data).toMatchObject({ existingQty: 99, existingSetBy: "Kent", expectedQty: 8 });

      // ITEM_C: BEG only, no anomaly
      const cBeg = plan.begWrites.find(w => w.kind === "begSet" && (w as any).data.item === ITEM_C) as any;
      expect(cBeg.data.qty).toBe(5);
      const cAnomaly = plan.begWrites.find(w => w.kind === "anomalySet" && (w as any).data.item === ITEM_C);
      expect(cAnomaly).toBeFalsy();

      // Only one anomaly in the whole plan
      expect(plan.begWrites.filter(w => w.kind === "anomalySet")).toHaveLength(1);
    });
  });

  describe("Test 12 — anomaly doc shape and idempotent ID", () => {
    it("uses branch__dept__item__today as the doc ID so re-runs overwrite in place", () => {
      const plan = computeRolloverPlan(baseInput({
        beginnings: [beg(ITEM_A, 20)],
        adjustments: [],
        todayBeginnings: [{
          id: `${BRANCH}__${DEPT}__${ITEM_A}__${TODAY}`,
          branch: BRANCH, department: DEPT, item: ITEM_A, date: TODAY,
          qty: 5, setBy: "phantom", updatedAt: YESTERDAY,
        }],
      }));
      const anomaly = plan.begWrites.find(w => w.kind === "anomalySet") as any;
      expect(anomaly.id).toBe(`${BRANCH}__${DEPT}__${ITEM_A}__${TODAY}`);
      // The data.id must equal the doc id (idempotency contract with route.ts)
      expect(anomaly.data.id).toBe(anomaly.id);
    });
  });

  describe("cross-cutting", () => {
    it("skips today's BEG when it already exists AND matches close endCount", () => {
      // Agreement path: existing today-BEG == derived endCount → no writes.
      // (Legitimate user handlers always produce this shape: BEG and close
      // written in the same batch using the same value.)
      const plan = computeRolloverPlan(baseInput({
        beginnings: [beg(ITEM_A, 10)],
        adjustments: [adj(ITEM_A, "in", 5, 1)],   // expected = 15
        todayBeginnings: [{
          id: `${BRANCH}__${DEPT}__${ITEM_A}__${TODAY}`,
          branch: BRANCH, department: DEPT, item: ITEM_A, date: TODAY,
          qty: 15, setBy: "admin", updatedAt: TODAY,
        }],
      }));
      expect(plan.begWrites).toEqual([]);
    });

    it("preserves original behavior: 'no data' dept skips draft cleanup + BEG carry", () => {
      // Original handler used `continue` on empty depts — orphan drafts remain.
      const plan = computeRolloverPlan(baseInput({
        drafts: [draft({ [ITEM_A]: 5 })],   // draft exists but no BEG, no adj
      }));
      expect(plan.closeWrites).toEqual([]);
      expect(plan.draftDeletes).toEqual([]);   // NOT cleaned up
      expect(plan.begWrites).toEqual([]);
    });

    it("collects draft doc IDs for cleanup", () => {
      const d1 = draft({ [ITEM_A]: 3 }, "front_kitchen");
      const d2 = draft({ [ITEM_B]: 4 }, "back_kitchen");
      const plan = computeRolloverPlan(baseInput({
        beginnings: [beg(ITEM_A, 3)],
        drafts: [d1, d2],
      }));
      expect(plan.draftDeletes.sort()).toEqual([d1.id, d2.id].sort());
    });

    it("filters cross-dept data out (only processes matching dept)", () => {
      const plan = computeRolloverPlan(baseInput({
        dept: "kitchen",
        beginnings: [
          beg(ITEM_A, 10),
          { ...beg(ITEM_A, 999), department: "bar" },   // wrong dept — ignored
        ],
        adjustments: [{ ...adj(ITEM_A, "in", 500, 9), department: "bar" }],  // wrong dept — ignored
      }));
      const closeSet = findWrite(plan.closeWrites, "closeSet", () => true) as any;
      expect(closeSet.data.items[ITEM_A]).toMatchObject({
        beginning: 10, inQty: 0, expected: 10,
      });
    });
  });
});
