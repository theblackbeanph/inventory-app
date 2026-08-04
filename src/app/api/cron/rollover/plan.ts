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

export type PlanWrite =
  | { kind: "adjAutoId"; data: StockAdjustment }
  | { kind: "closeSet"; id: string; data: DailyClose }
  | { kind: "closeMerge"; id: string; items: Record<string, DailyCloseItem> }
  | { kind: "branchStockMerge"; id: string; data: BranchStock }
  | { kind: "begSet"; id: string; data: DailyBeginning };

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
  const todayBegItems = new Set(
    input.todayBeginnings.filter(b => b.department === dept).map(b => b.item)
  );

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
    for (const adj of deptAdj) {
      if (adj.type === "in") inQtyMap[adj.item] = (inQtyMap[adj.item] ?? 0) + adj.qty;
      else if (adj.type === "out" || adj.type === "waste" || adj.type === "sales_import") {
        outQtyMap[adj.item] = (outQtyMap[adj.item] ?? 0) + adj.qty;
      }
    }
    const beginnings: Record<string, number> = {};
    for (const b of deptBeg) beginnings[b.item] = b.qty;

    // NOTE: draft-only items (no BEG, no adj) are intentionally excluded here
    // to preserve current behavior. Commit B adds them; see Test 8.
    const itemsWithData = new Set<string>([
      ...deptBeg.map(b => b.item),
      ...deptAdj.map(a => a.item),
    ]);

    let filled = 0;
    const filledCloseItems: DailyClose["items"] = {};

    for (const item of itemsWithData) {
      if (closedItems.has(item)) continue;
      const beg = beginnings[item] ?? 0;
      const inQ = inQtyMap[item] ?? 0;
      const outQ = outQtyMap[item] ?? 0;
      const expected = Math.max(0, beg + inQ - outQ);
      endCounts[item] = expected;
      filled++;

      closeWrites.push({
        kind: "adjAutoId",
        data: {
          id: clock.nextAdjId(),
          branch, department: dept, date: yesterday,
          item, type: "count", qty: expected,
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
            qty: expected, reorderAt: catalogItem.reorderAt,
            lastUpdated: yesterday, lastUpdatedBy: "system",
          },
        });
      }

      filledCloseItems[item] = {
        beginning: beg, inQty: inQ, outQty: outQ,
        expected, endCount: expected, variance: 0,
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
  let begCount = 0;
  for (const [item, qty] of Object.entries(endCounts)) {
    if (todayBegItems.has(item)) continue;
    const catalogItem = deptCatalog.find(c => c.name === item);
    if (!catalogItem) continue;
    const begId = beginningDocId(branch, dept, item, today);
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

  return { closeWrites, draftDeletes, begWrites, logs };
}
