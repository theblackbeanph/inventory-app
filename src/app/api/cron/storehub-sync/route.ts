import { NextRequest, NextResponse } from "next/server";
import { signInWithEmailAndPassword } from "firebase/auth";
import { db, auth, COLS, doc, writeBatch, setDoc } from "@/lib/firebase";
import { CATALOG_MAP, itemSlug, stockDocId } from "@/lib/items";
import { applyStoreHubMapping, allMappedSkus } from "@/lib/storehub-mapping";
import type { StockAdjustment } from "@/lib/types";

export const maxDuration = 30;

const BRANCHES = ["MKT", "BF"] as const;
type SyncBranch = typeof BRANCHES[number];
const DEPARTMENT = "kitchen" as const;
const BASE_URL = "https://api.storehubhq.com";

const CREDENTIALS: Record<SyncBranch, { user: string | undefined; pass: string | undefined }> = {
  MKT: { user: process.env.STOREHUB_USERNAME,    pass: process.env.STOREHUB_PASSWORD },
  BF:  { user: process.env.STOREHUB_BF_USERNAME, pass: process.env.STOREHUB_BF_PASSWORD },
};

const STORE_IDS: Record<SyncBranch, string | undefined> = {
  MKT: process.env.STOREHUB_MKT_STORE_ID,
  BF:  process.env.STOREHUB_BF_STORE_ID,
};

function authHeader(branch: SyncBranch): string {
  const { user, pass } = CREDENTIALS[branch];
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

async function fetchStoreHub(path: string, branch: SyncBranch) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: authHeader(branch), Accept: "application/json" },
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

async function syncBranch(branch: SyncBranch, date: string) {
  const storeId = STORE_IDS[branch];
  if (!storeId) return { branch, skipped: true, reason: "no store ID configured" };

  const prevDate = addUtcDays(date, -1);
  const bizStart = new Date(`${prevDate}T23:00:00Z`).getTime();
  const bizEnd   = new Date(`${date}T18:00:00Z`).getTime();

  const [products, branchTxns] = await Promise.all([
    fetchStoreHub("/products", branch),
    fetchStoreHub(`/transactions?storeId=${storeId}&from=${prevDate}&to=${date}`, branch),
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
  for (const tx of branchTxns as { transactionType: string; isCancelled: boolean; transactionTime: string; items?: { itemType: string; productId: string; quantity: number }[] }[]) {
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

  const matched = applyStoreHubMapping(soldBySkuMap, branch);
  const unmatchedItems = Object.entries(soldBySkuMap)
    .filter(([sku]) => !allMappedSkus(branch).has(sku))
    .map(([sku, qty]) => ({ sku, name: nameBySkuMap[sku] ?? sku, qty }));

  const batch = writeBatch(db);
  const now = Date.now();
  for (const { item, qty, rawOrders } of matched) {
    const catalogItem = CATALOG_MAP.get(item);
    if (!catalogItem) continue;
    const adjId = `storehub__${branch}__${DEPARTMENT}__${date}__${itemSlug(item)}`;
    batch.set(doc(db, COLS.adjustments, adjId), {
      id: now, branch, department: DEPARTMENT, date, item,
      type: "sales_import", qty, loggedBy: "system (auto-sync)",
      ...(rawOrders !== undefined && { rawOrders }),
    } as StockAdjustment);
    const sid = stockDocId(branch, DEPARTMENT, item);
    batch.set(doc(db, COLS.branchStock, sid), {
      id: sid, branch, department: DEPARTMENT, item,
      category: catalogItem.category, unit: catalogItem.unit, qty: 0,
      reorderAt: catalogItem.reorderAt,
      lastUpdated: date, lastUpdatedBy: "system (auto-sync)",
    });
  }
  await batch.commit();

  const unmatchedDocId = `${branch}__${date}`;
  await setDoc(doc(db, COLS.storehubUnmatched, unmatchedDocId), {
    id: unmatchedDocId, branch, date,
    syncedAt: new Date().toISOString(),
    items: unmatchedItems,
  });

  return { branch, matched: matched.length, unmatched: unmatchedItems.length };
}

export async function GET(request: NextRequest) {
  const authH = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authH !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SYSTEM_EMAIL || !process.env.SYSTEM_PASSWORD) {
    return NextResponse.json({ error: "SYSTEM_EMAIL / SYSTEM_PASSWORD not configured" }, { status: 500 });
  }
  await signInWithEmailAndPassword(auth, process.env.SYSTEM_EMAIL, process.env.SYSTEM_PASSWORD);

  const date = syncDatePHT();

  try {
    const results = await Promise.all(BRANCHES.map(branch => syncBranch(branch, date)));
    return NextResponse.json({ ok: true, date, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
