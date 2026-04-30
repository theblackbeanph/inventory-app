import { NextRequest, NextResponse } from "next/server";
import { db, COLS, collection, getDocs, query, where, writeBatch, doc } from "@/lib/firebase";
import type { Branch, Department, StockAdjustment, DailyBeginning, DailyClose, StocktakeDraft } from "@/lib/types";
import { CATALOG, CATALOG_MAP, beginningDocId, stockDocId } from "@/lib/items";

const BRANCHES: Branch[] = ["MKT", "BF"];
const DEPARTMENTS: Department[] = ["kitchen", "bar", "cafe"];

function phtToday(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = phtToday();
  const yesterday = addDays(today, -1);
  const nowISO = new Date().toISOString();
  const log: string[] = [];

  for (const branch of BRANCHES) {
    // Fetch all of yesterday's data for this branch in parallel
    const [adjSnap, begSnap, closeSnap, todayBegSnap, draftSnap] = await Promise.all([
      getDocs(query(collection(db, COLS.adjustments),    where("branch", "==", branch), where("date", "==", yesterday))),
      getDocs(query(collection(db, COLS.dailyBeginning), where("branch", "==", branch), where("date", "==", yesterday))),
      getDocs(query(collection(db, COLS.dailyClose),     where("branch", "==", branch), where("date", "==", yesterday))),
      getDocs(query(collection(db, COLS.dailyBeginning), where("branch", "==", branch), where("date", "==", today))),
      getDocs(query(collection(db, COLS.stocktakeDrafts), where("branch", "==", branch), where("date", "==", yesterday))),
    ]);

    const allAdj  = adjSnap.docs.map(d => d.data() as StockAdjustment);
    const allBeg  = begSnap.docs.map(d => d.data() as DailyBeginning);
    const closedDepts = new Set(closeSnap.docs.map(d => (d.data() as DailyClose).department));

    // Build today's existing beginnings by dept → item set
    const todayBegByDept: Record<string, Set<string>> = {};
    for (const d of todayBegSnap.docs) {
      const b = d.data() as DailyBeginning;
      if (!todayBegByDept[b.department]) todayBegByDept[b.department] = new Set();
      todayBegByDept[b.department].add(b.item);
    }

    for (const dept of DEPARTMENTS) {
      const deptAdj = allAdj.filter(a => a.department === dept);
      const deptBeg = allBeg.filter(b => b.department === dept);
      const deptCatalog = CATALOG.filter(i => i.department === dept && (!i.branches || i.branches.includes(branch)));
      const todayBegItems = todayBegByDept[dept] ?? new Set<string>();

      let endCounts: Record<string, number> = {};

      if (!closedDepts.has(dept)) {
        // ── Auto-close: no manual confirm happened ──────────────────────────
        const itemsWithData = new Set([
          ...deptBeg.map(b => b.item),
          ...deptAdj.map(a => a.item),
        ]);

        if (itemsWithData.size === 0) {
          log.push(`${branch}/${dept}: no data, skipped`);
          continue;
        }

        const beginnings: Record<string, number> = {};
        for (const b of deptBeg) beginnings[b.item] = b.qty;

        // Merge draft counts for this dept (lower priority than explicit count adjustments)
        const draftCounts: Record<string, number> = {};
        for (const draftDoc of draftSnap.docs) {
          const draft = draftDoc.data() as StocktakeDraft;
          if (draft.department !== dept) continue;
          for (const [item, qty] of Object.entries(draft.counts)) {
            if (!(item in draftCounts)) draftCounts[item] = qty;
          }
        }

        // Tally adjustments per item
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
        const batch = writeBatch(db);
        const now = Date.now();

        for (const itemName of itemsWithData) {
          const beg     = beginnings[itemName] ?? 0;
          const inQ     = inQtyMap[itemName]   ?? 0;
          const outQ    = outQtyMap[itemName]   ?? 0;
          const expected = Math.max(0, beg + inQ - outQ);
          const manualCount = latestManualCount[itemName];
          const finalEnd = manualCount?.qty ?? draftCounts[itemName] ?? expected;
          const variance = finalEnd - expected;

          endCounts[itemName] = finalEnd;
          closeItems[itemName] = { beginning: beg, inQty: inQ, outQty: outQ, expected, endCount: finalEnd, variance };

          // Write system count adj only when no manual count exists
          if (!manualCount) {
            const catalogItem = CATALOG_MAP.get(itemName);
            if (catalogItem) {
              const adjRef = doc(collection(db, COLS.adjustments));
              batch.set(adjRef, {
                id: now + Math.random(), branch, department: dept, date: yesterday,
                item: itemName, type: "count", qty: expected,
                loggedBy: "system", note: "Auto-closed",
              } as StockAdjustment);

              const sId = stockDocId(branch, dept, itemName);
              batch.set(doc(db, COLS.branchStock, sId), {
                id: sId, branch, department: dept, item: itemName,
                category: catalogItem.category, unit: catalogItem.unit,
                qty: expected, reorderAt: catalogItem.reorderAt,
                lastUpdated: yesterday, lastUpdatedBy: "system",
              }, { merge: true });
            }
          }
        }

        // Write daily_close record
        const closeId = `${branch}__${dept}__${yesterday}`;
        batch.set(doc(db, COLS.dailyClose, closeId), {
          id: closeId, branch, department: dept, date: yesterday,
          countType: "system", closedAt: nowISO,
          closedBy: "system", isLocked: true, items: closeItems,
        } as DailyClose);

        await batch.commit();
        log.push(`${branch}/${dept}: auto-closed ${yesterday} (${itemsWithData.size} items)`);

      } else {
        // ── Already manually closed — read endCounts from existing record ──
        const existingClose = closeSnap.docs
          .map(d => d.data() as DailyClose)
          .find(c => c.department === dept);
        if (existingClose) {
          for (const [item, data] of Object.entries(existingClose.items)) {
            endCounts[item] = data.endCount;
          }
        }
        log.push(`${branch}/${dept}: already closed (manual)`);
      }

      // ── Clean up any leftover draft docs for this dept ──────────────────
      const deptDraftDocs = draftSnap.docs.filter(d => (d.data() as StocktakeDraft).department === dept);
      if (deptDraftDocs.length > 0) {
        const delBatch = writeBatch(db);
        for (const draftDoc of deptDraftDocs) delBatch.delete(draftDoc.ref);
        await delBatch.commit();
        log.push(`${branch}/${dept}: deleted ${deptDraftDocs.length} draft(s)`);
      }

      // ── Carry forward: write today's BEG from yesterday's end counts ──────
      const begBatch = writeBatch(db);
      let begCount = 0;
      for (const [item, qty] of Object.entries(endCounts)) {
        if (todayBegItems.has(item)) continue; // already set, don't overwrite
        const catalogItem = deptCatalog.find(c => c.name === item);
        if (!catalogItem) continue;
        const begId = beginningDocId(branch, dept, item, today);
        begBatch.set(doc(db, COLS.dailyBeginning, begId), {
          id: begId, branch, department: dept, item, date: today,
          qty, setBy: "system", updatedAt: today,
        } as DailyBeginning);
        begCount++;
      }
      if (begCount > 0) {
        await begBatch.commit();
        log.push(`${branch}/${dept}: carried ${begCount} beginnings → ${today}`);
      }
    }
  }

  return NextResponse.json({ ok: true, yesterday, today, log });
}
