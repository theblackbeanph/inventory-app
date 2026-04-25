import { NextRequest, NextResponse } from "next/server";
import { db, COLS, writeBatch, doc, setDoc } from "@/lib/firebase";
import type { Branch, Department, StockAdjustment } from "@/lib/types";
import { CATALOG_MAP, stockDocId, itemSlug } from "@/lib/items";
import { BRANCH_LABELS } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { branch, department, today, matched, unmatched } = await request.json() as {
      branch: Branch;
      department: Department;
      today: string;
      matched: { item: string; qty: number }[];
      unmatched?: { sku: string; name: string; qty: number }[];
    };

    if (!branch || !department || !today || !Array.isArray(matched)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Deterministic doc IDs — re-syncing overwrites the previous import, no delete needed
    const batch = writeBatch(db);
    const now = Date.now();
    for (const { item, qty } of matched) {
      const catalogItem = CATALOG_MAP.get(item);
      if (!catalogItem) continue;
      const adjId = `storehub__${branch}__${department}__${today}__${itemSlug(item)}`;
      const adj: StockAdjustment = {
        id: now, branch, department, date: today, item,
        type: "sales_import", qty, loggedBy: BRANCH_LABELS[branch],
      };
      batch.set(doc(db, COLS.adjustments, adjId), adj);
      const sid = stockDocId(branch, department, item);
      batch.set(doc(db, COLS.branchStock, sid), {
        id: sid, branch, department, item, category: catalogItem.category,
        unit: catalogItem.unit, qty: 0,
        reorderAt: catalogItem.reorderAt,
        lastUpdated: today, lastUpdatedBy: BRANCH_LABELS[branch],
      });
    }
    await batch.commit();

    // Persist unmatched SKUs for the Reports tab (overwrite per branch+date, never delete)
    const unmatchedDocId = `${branch}__${today}`;
    await setDoc(doc(db, COLS.storehubUnmatched, unmatchedDocId), {
      id: unmatchedDocId, branch, date: today,
      syncedAt: new Date().toISOString(),
      items: unmatched ?? [],
    });

    return NextResponse.json({ ok: true, count: matched.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[storehub/sync] failed:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
