import { describe, it, expect } from "vitest";
import { isIncomplete, fulfillmentPct } from "./helpers";
import type { DeliveryNote } from "@/lib/types";

function makeDN(items: { requestedQty: number; dispatchedQty: number }[]): DeliveryNote {
  return {
    id: "dn1", dnRef: "DN-001", poRef: "PO-001", pullOutId: "po1",
    branch: "BF", dispatchedAt: "2026-05-13", dispatchedBy: "Test",
    items: items.map((i, idx) => ({ item: `Item${idx}`, ...i, unit: "pc" })),
    status: "RECEIVED",
  };
}

describe("isIncomplete", () => {
  it("returns false when all items fully dispatched", () => {
    expect(isIncomplete(makeDN([{ requestedQty: 10, dispatchedQty: 10 }]))).toBe(false);
  });
  it("returns true when any item is short", () => {
    expect(isIncomplete(makeDN([
      { requestedQty: 10, dispatchedQty: 10 },
      { requestedQty: 5,  dispatchedQty: 3  },
    ]))).toBe(true);
  });
  it("returns false for empty items list", () => {
    expect(isIncomplete(makeDN([]))).toBe(false);
  });
});

describe("fulfillmentPct", () => {
  it("returns 100 when all items fully dispatched", () => {
    expect(fulfillmentPct(makeDN([{ requestedQty: 10, dispatchedQty: 10 }]))).toBe(100);
  });
  it("rounds correctly — 30 of 35 is 86%", () => {
    expect(fulfillmentPct(makeDN([{ requestedQty: 35, dispatchedQty: 30 }]))).toBe(86);
  });
  it("sums across multiple items", () => {
    // total: 15, sent: 13 → 86.66 → 87
    expect(fulfillmentPct(makeDN([
      { requestedQty: 10, dispatchedQty: 10 },
      { requestedQty: 5,  dispatchedQty: 3  },
    ]))).toBe(87);
  });
  it("returns 100 for empty items list", () => {
    expect(fulfillmentPct(makeDN([]))).toBe(100);
  });
});
