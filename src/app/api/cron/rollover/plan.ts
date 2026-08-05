import type {
  Branch,
  Department,
  StockAdjustment,
  DailyBeginning,
  DailyClose,
  DailyCloseItem,
  BranchStock,
  StocktakeDraft,
  CatalogItem,
} from "@/lib/types";
import { CATALOG_MAP, beginningDocId, stockDocId } from "@/lib/items";

// ── Plan primitives ─────────────────────────────────────────────────────────

export interface RolloverAnomaly {
  id: string;
  branch: Branch;
  dept: Department;
  item: string;
  date: string;              // the `today` value whose BEG diverged
  existingQty: number;
  existingSetBy: string;
  expectedQty: number;       // the close endCount that BEG should have matched
  detectedAt: string;        // clock.nowISO at cron run
}

export type PlanWrite =
  | { kind: "adjAutoId"; data: StockAdjustment }
  | { kind: "closeSet"; id: string; data: DailyClose }
  | { kind: "closeMerge"; id: string; items: Record<string, DailyCloseItem> }
  | { kind: "branchStockMerge"; id: string; data: BranchStock }
  | { kind: "begSet"; id: string; data: DailyBeginning }
  | { kind: "anomalySet"; id: string; data: RolloverAnomaly };

export interface RolloverPlan {
  closeWrites: PlanWrite[];        // auto-close batch OR partial-fill batch
  draftDeletes: string[];           // draft doc IDs (COLS.stocktakeDrafts)
  begWrites: PlanWrite[];           // today's dailyBeginning docs
  logs: string[];
}

export interface RolloverInput {
  branch: Branch;
  dept: Department;
  yesterday: string;
  today: string;
  adjustments: StockAdjustment[];        // yesterday, this branch, ALL depts
  beginnings: DailyBeginning[];           // yesterday, this branch, ALL depts
  closes: DailyClose[];                   // yesterday, this branch, ALL depts
  todayBeginnings: DailyBeginning[];      // today, this branch, ALL depts
  drafts: { id: string; data: StocktakeDraft }[];  // yesterday, this branch, ALL depts
  deptCatalog: CatalogItem[];             // catalog pre-filtered to this branch+dept
  clock: {
    now: number;                          // Date.now() at cron start
    nowISO: string;                       // ISO string at cron start (for closedAt)
    nextAdjId: () => number;              // returns unique numeric id per call
  };
}

// ── Pure computation ────────────────────────────────────────────────────────

export function computeRolloverPlan(input: RolloverInput): RolloverPlan {
  const { branch, dept, yesterday, today, deptCatalog, clock } = input;

  const deptAdj = input.adjustments.filter(a => a.department === dept);
  const deptBeg = input.beginnings.filter(b => b.department === dept);
  const closedDepts = new Set(input.closes.map(c => c.department));

  const logs: string[] = [];
  const closeWrites: PlanWrite[] = [];
  const draftDeletes: string[] = [];
  const begWrites: PlanWrite[] = [];

  let endCounts: Record<string, number> = {};

  if (!closedDepts.has(dept)) {
    // ── Auto-close path ────────────────────────────────────────────────────
    const itemsWithData = new Set<string>([
      ...deptBeg.map(b => b.item),
      ...deptAdj.map(a => a.item),
    ]);

    if (itemsWithData.size === 0) {
      // Behavior-preserving: original handler used `continue` here, skipping
      // draft cleanup AND BEG carry for depts with no BEG/adj. Any orphan
      // drafts remain until real activity resumes.
      logs.push(`${branch}/${dept}: no data, skipped`);
      return { closeWrites: [], draftDeletes: [], begWrites: [], logs };
    } else {
      const beginnings: Record<string, number> = {};
      for (const b of deptBeg) beginnings[b.item] = b.qty;

      // Merge draft counts for this dept (lower priority than manual count adj)
      const draftCounts: Record<string, number> = {};
      for (const { data: draft } of input.drafts) {
        if (draft.department !== dept) continue;
        for (const [item, qty] of Object.entries(draft.counts)) {
          if (!(item in draftCounts)) draftCounts[item] = qty;
        }
      }

      const latestManualCount: Record<string, { qty: number; id: number }> = {};
      const inQtyMap: Record<string, number> = {};
      const outQtyMap: Record<string, number> = {};
      for (const adj of deptAdj) {
        if (adj.type === "in") {
          inQtyMap[adj.item] = (inQtyMap[adj.item] ?? 0) + adj.qty;
        } else if (adj.type === "out" || adj.type === "waste" || adj.type === "sales_import") {
          outQtyMap[adj.item] = (outQtyMap[adj.item] ?? 0) + adj.qty;
        } else if (adj.type === "count") {
          if (!latestManualCount[adj.item] || adj.id > latestManualCount[adj.item].id) {
            latestManualCount[adj.item] = { qty: adj.qty, id: adj.id };
          }
        }
      }

      const closeItems: DailyClose["items"] = {};

      for (const itemName of itemsWithData) {
        const beg = beginnings[itemName] ?? 0;
        const inQ = inQtyMap[itemName] ?? 0;
        const outQ = outQtyMap[itemName] ?? 0;
        const expected = Math.max(0, beg + inQ - outQ);
        const manualCount = latestManualCount[itemName];
        const finalEnd = manualCount?.qty ?? draftCounts[itemName] ?? expected;
        const variance = finalEnd - expected;

        endCounts[itemName] = finalEnd;
        closeItems[itemName] = {
          beginning: beg, inQty: inQ, outQty: outQ,
          expected, endCount: finalEnd, variance,
        };

        // System count adj + branchStock only when no manual count exists.
        // Auto-close uses CATALOG_MAP (name-only, ignores branch scoping) —
        // preserve as-is; do NOT unify with partial-fill's deptCatalog lookup.
        if (!manualCount) {
          const catalogItem = CATALOG_MAP.get(itemName);
          if (catalogItem) {
            closeWrites.push({
              kind: "adjAutoId",
              data: {
                id: clock.nextAdjId(),
                branch, department: dept, date: yesterday,
                item: itemName, type: "count", qty: expected,
                loggedBy: "system", note: "Auto-closed",
              },
            });
            const sId = stockDocId(branch, dept, itemName);
            closeWrites.push({
              kind: "branchStockMerge",
              id: sId,
              data: {
                id: sId, branch, department: dept, item: itemName,
                category: catalogItem.category, unit: catalogItem.unit,
                qty: expected, reorderAt: catalogItem.reorderAt,
                lastUpdated: yesterday, lastUpdatedBy: "system",
              },
            });
          }
        }
      }

      const closeId = `${branch}__${dept}__${yesterday}`;
      closeWrites.push({
        kind: "closeSet",
        id: closeId,
        data: {
          id: closeId, branch, department: dept, date: yesterday,
          countType: "system", closedAt: clock.nowISO,
          closedBy: "system", isLocked: true, items: closeItems,
        },
      });

      logs.push(`${branch}/${dept}: auto-closed ${yesterday} (${itemsWithData.size} items)`);
    }
  } else {
    // ── Manual close (already closed) — partial-fill missing items ─────────
    const existingClose = input.closes.find(c => c.department === dept);
    if (existingClose) {
      for (const [item, data] of Object.entries(existingClose.items)) {
        endCounts[item] = data.endCount;
      }
    }

    const closedItems = new Set(Object.keys(existingClose?.items ?? {}));
    const inQtyMap: Record<string, number> = {};
    const outQtyMap: Record<string, number> = {};
    const latestManualCount: Record<string, { qty: number; id: number }> = {};
    for (const adj of deptAdj) {
      if (adj.type === "in") inQtyMap[adj.item] = (inQtyMap[adj.item] ?? 0) + adj.qty;
      else if (adj.type === "out" || adj.type === "waste" || adj.type === "sales_import") {
        outQtyMap[adj.item] = (outQtyMap[adj.item] ?? 0) + adj.qty;
      } else if (adj.type === "count") {
        if (!latestManualCount[adj.item] || adj.id > latestManualCount[adj.item].id) {
          latestManualCount[adj.item] = { qty: adj.qty, id: adj.id };
        }
      }
    }
    const beginnings: Record<string, number> = {};
    for (const b of deptBeg) beginnings[b.item] = b.qty;

    // Merge draft counts (mirrors auto-close path lines 82-89 conventions).
    const draftCounts: Record<string, number> = {};
    for (const { data: draft } of input.drafts) {
      if (draft.department !== dept) continue;
      for (const [item, qty] of Object.entries(draft.counts)) {
        if (!(item in draftCounts)) draftCounts[item] = qty;
      }
    }

    // Include draft-only items so partial stocktakes don't silently drop counts
    // for items with no BEG/adj history (new catalog items, dormant wake-ups,
    // upstream cron failures, migration residue). Priority: manual > draft > expected.
    const itemsWithData = new Set<string>([
      ...deptBeg.map(b => b.item),
      ...deptAdj.map(a => a.item),
      ...Object.keys(draftCounts),
    ]);

    let filled = 0;
    const filledCloseItems: DailyClose["items"] = {};

    for (const item of itemsWithData) {
      if (closedItems.has(item)) continue;
      const beg = beginnings[item] ?? 0;
      const inQ = inQtyMap[item] ?? 0;
      const outQ = outQtyMap[item] ?? 0;
      const expected = Math.max(0, beg + inQ - outQ);
      const manualCount = latestManualCount[item];
      const finalEnd = manualCount?.qty ?? draftCounts[item] ?? expected;
      // INTENTIONAL: variance = finalEnd - expected (matches auto-close path).
      // For draft-only items (no BEG/IN/OUT chain), variance surfaces the
      // "we didn't know this existed" signal on the dashboard. Do NOT change
      // to variance: 0 — that would suppress the anomaly this fix is meant to
      // catch. See Commit B rationale.
      const variance = finalEnd - expected;
      endCounts[item] = finalEnd;
      filled++;

      closeWrites.push({
        kind: "adjAutoId",
        data: {
          id: clock.nextAdjId(),
          branch, department: dept, date: yesterday,
          item, type: "count", qty: finalEnd,
          loggedBy: "system", note: "Auto-filled (partial stocktake)",
        },
      });

      // Partial-fill uses deptCatalog (pre-filtered by branch+dept scoping) —
      // preserve as-is; do NOT unify with auto-close's CATALOG_MAP lookup.
      const catalogItem = deptCatalog.find(c => c.name === item);
      if (catalogItem) {
        const sId = stockDocId(branch, dept, item);
        closeWrites.push({
          kind: "branchStockMerge",
          id: sId,
          data: {
            id: sId, branch, department: dept, item,
            category: catalogItem.category, unit: catalogItem.unit,
            qty: finalEnd, reorderAt: catalogItem.reorderAt,
            lastUpdated: yesterday, lastUpdatedBy: "system",
          },
        });
      }

      filledCloseItems[item] = {
        beginning: beg, inQty: inQ, outQty: outQ,
        expected, endCount: finalEnd, variance,
      };
    }

    if (filled > 0) {
      const closeId = `${branch}__${dept}__${yesterday}`;
      closeWrites.push({ kind: "closeMerge", id: closeId, items: filledCloseItems });
    }

    logs.push(
      `${branch}/${dept}: already closed (manual)${filled > 0 ? `, filled ${filled} missing items` : ""}`
    );
  }

  // ── Draft cleanup (both paths) ────────────────────────────────────────────
  const deptDraftIds = input.drafts
    .filter(d => d.data.department === dept)
    .map(d => d.id);
  if (deptDraftIds.length > 0) {
    draftDeletes.push(...deptDraftIds);
    logs.push(`${branch}/${dept}: deleted ${deptDraftIds.length} draft(s)`);
  }

  // ── BEG carry-forward (both paths) ────────────────────────────────────────
  // Guard behavior: compare pre-existing today-BEG against the source close's
  // endCount. Agreement → skip (no-op). Divergence → overwrite with the close
  // value AND write a rollover_anomalies doc so the divergence is detectable
  // from the app, not just Vercel logs.
  //
  // Why overwrite is safe: no legitimate user handler produces BEG↔close
  // divergence. handleSubmitAll / handleCorrectCount / handleAddMissingStocktakeItem
  // all write BEG atomically with the close in the same batch, using the same
  // endCount value. Divergence implies an out-of-band write (ad-hoc script,
  // Firestore Console, cross-app write, or a future bug). Preserving the
  // divergent value is the current failure mode (OCC MKT/dining 2026-08-03:
  // BEG=14 preserved against close endCount=9, propagated for 2 days).
  const todayBegByItem = new Map(
    input.todayBeginnings
      .filter(b => b.department === dept)
      .map(b => [b.item, b] as const)
  );
  let begCount = 0;
  let anomalyCount = 0;
  for (const [item, qty] of Object.entries(endCounts)) {
    const catalogItem = deptCatalog.find(c => c.name === item);
    if (!catalogItem) continue;
    const begId = beginningDocId(branch, dept, item, today);
    const existing = todayBegByItem.get(item);

    if (existing) {
      if (existing.qty === qty) continue; // agreement — leave as-is
      const anomalyId = `${branch}__${dept}__${item}__${today}`;
      begWrites.push({
        kind: "anomalySet",
        id: anomalyId,
        data: {
          id: anomalyId, branch, dept, item, date: today,
          existingQty: existing.qty,
          existingSetBy: existing.setBy,
          expectedQty: qty,
          detectedAt: clock.nowISO,
        },
      });
      logs.push(
        `${branch}/${dept}: BEG divergence for ${item} — existing ${existing.qty} (setBy=${existing.setBy}) vs close endCount ${qty}, overwriting with close value`
      );
      anomalyCount++;
    }

    begWrites.push({
      kind: "begSet",
      id: begId,
      data: {
        id: begId, branch, department: dept, item, date: today,
        qty, setBy: "system", updatedAt: today,
      },
    });
    begCount++;
  }
  if (begCount > 0) {
    logs.push(`${branch}/${dept}: carried ${begCount} beginnings → ${today}`);
  }
  if (anomalyCount > 0) {
    logs.push(`${branch}/${dept}: recorded ${anomalyCount} BEG divergence anomal${anomalyCount === 1 ? "y" : "ies"}`);
  }

  return { closeWrites, draftDeletes, begWrites, logs };
}
