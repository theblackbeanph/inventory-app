import { NextRequest, NextResponse } from "next/server";
import { db, COLS, collection, doc, getDocs, query, where, writeBatch, setDoc } from "@/lib/firebase";
import { CATALOG_MAP, itemSlug, stockDocId } from "@/lib/items";
import { applyStoreHubMapping, allMappedSkus } from "@/lib/storehub-mapping";
import type { StockAdjustment } from "@/lib/types";

export const maxDuration = 30;

const BRANCH = "MKT" as const;
const DEPARTMENT = "kitchen" as const;
const BASE_URL = "https://api.storehubhq.com";

function authHeader(): string {
  return "Basic " + Buffer.from(`${process.env.STOREHUB_USERNAME}:${process.env.STOREHUB_PASSWORD}`).toString("base64");
}

async function fetchStoreHub(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`StoreHub ${path} → ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

function syncDatePHT(): string {
  const pht = new Date(Date.now() + 8 * 60 * 60 * 1000);
  if (pht.getUTCHours() < 7) pht.setUTCDate(pht.getUTCDate() - 1);
  return pht.toISOString().slice(0, 10);
}

function addUtcDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const authH = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authH !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storeId = process.env.STOREHUB_MKT_STORE_ID;
  if (!storeId) return NextResponse.json({ error: "STOREHUB_MKT_STORE_ID not configured" }, { status: 500 });

  const date = syncDatePHT();

  // Skip if already synced for this date (manual sync takes priority)
  const unmatchedDocId = `${BRANCH}__${date}`;
  const existing = await getDocs(
    query(collection(db, COLS.storehubUnmatched), where("id", "==", unmatchedDocId))
  );
  if (!existing.empty) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Already synced for this date", date });
  }

  try {
    const prevDate = addUtcDays(date, -1);
    const bizStart = new Date(`${prevDate}T23:00:00Z`).getTime(); // 7:00 AM PHT
    const bizEnd   = new Date(`${date}T18:00:00Z`).getTime();     // 2:00 AM PHT next day

    const [products, transactions] = await Promise.all([
      fetchStoreHub("/products"),
      fetchStoreHub(`/transactions?storeId=${storeId}&from=${prevDate}&to=${date}`),
    ]);

    const skuMap: Record<string, string> = {};
    const nameBySkuMap: Record<string, string> = {};
    for (const p of products as { id: string; sku?: string; name?: string }[]) {
      if (p.id && p.sku) {
        skuMap[p.id] = p.sku;
        if (p.name) nameBySkuMap[p.sku] = p.name;
      }
    }

    const soldBySkuMap: Record<string, number> = {};
    for (const tx of transactions) {
      if (tx.transactionType !== "Sale" || tx.isCancelled) continue;
      const txTime = new Date(tx.transactionTime).getTime();
      if (txTime < bizStart || txTime > bizEnd) continue;
      for (const item of tx.items ?? []) {
        if (item.itemType !== "Item" || !item.productId || item.quantity <= 0) continue;
        const sku = skuMap[item.productId];
        if (!sku) continue;
        soldBySkuMap[sku] = (soldBySkuMap[sku] ?? 0) + item.quantity;
      }
    }

    const matched = applyStoreHubMapping(soldBySkuMap);
    const unmatchedItems = Object.entries(soldBySkuMap)
      .filter(([sku]) => !allMappedSkus().has(sku))
      .map(([sku, qty]) => ({ sku, name: nameBySkuMap[sku] ?? sku, qty }));

    const batch = writeBatch(db);
    const now = Date.now();
    for (const { item, qty, rawOrders } of matched) {
      const catalogItem = CATALOG_MAP.get(item);
      if (!catalogItem) continue;
      const adjId = `storehub__${BRANCH}__${DEPARTMENT}__${date}__${itemSlug(item)}`;
      batch.set(doc(db, COLS.adjustments, adjId), {
        id: now, branch: BRANCH, department: DEPARTMENT, date, item,
        type: "sales_import", qty, loggedBy: "system (auto-sync)",
        ...(rawOrders !== undefined && { rawOrders }),
      } as StockAdjustment);
      const sid = stockDocId(BRANCH, DEPARTMENT, item);
      batch.set(doc(db, COLS.branchStock, sid), {
        id: sid, branch: BRANCH, department: DEPARTMENT, item,
        category: catalogItem.category, unit: catalogItem.unit, qty: 0,
        reorderAt: catalogItem.reorderAt,
        lastUpdated: date, lastUpdatedBy: "system (auto-sync)",
      });
    }
    await batch.commit();

    await setDoc(doc(db, COLS.storehubUnmatched, unmatchedDocId), {
      id: unmatchedDocId, branch: BRANCH, date,
      syncedAt: new Date().toISOString(),
      items: unmatchedItems,
    });

    return NextResponse.json({ ok: true, date, matched: matched.length, unmatched: unmatchedItems.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
