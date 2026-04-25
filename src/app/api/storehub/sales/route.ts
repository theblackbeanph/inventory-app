import { NextRequest, NextResponse } from "next/server";
import { applyStoreHubMapping, allMappedSkus } from "@/lib/storehub-mapping";

const BASE_URL = "https://api.storehubhq.com";

function authHeader(): string {
  const user = process.env.STOREHUB_USERNAME;
  const pass = process.env.STOREHUB_PASSWORD;
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

async function fetchStoreHub(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`StoreHub ${path} → ${res.status}`);
  return res.json();
}

// Build productId → SKU map and SKU → product name map from the full product list
async function buildSkuMaps(): Promise<{ skuMap: Record<string, string>; nameBySkuMap: Record<string, string> }> {
  const products: { id: string; sku?: string; name?: string }[] = await fetchStoreHub("/products");
  const skuMap: Record<string, string> = {};
  const nameBySkuMap: Record<string, string> = {};
  for (const p of products) {
    if (p.id && p.sku) {
      skuMap[p.id] = p.sku;
      if (p.name) nameBySkuMap[p.sku] = p.name;
    }
  }
  return { skuMap, nameBySkuMap };
}

export async function GET(request: NextRequest) {
  const storeId = process.env.STOREHUB_MKT_STORE_ID;
  if (!storeId) return NextResponse.json({ error: "StoreHub store ID not configured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? phtToday();

  try {
    // StoreHub stores transactionTime in UTC. MKT's business day runs 7am–2am PHT,
    // which in UTC is 23:00 (prev day) – 18:00 (same day). We query yesterday+today
    // in UTC so we don't miss the 7am–8am PHT window, then filter client-side.
    const prevDate = addUtcDays(date, -1);
    const bizStart = new Date(`${prevDate}T23:00:00Z`).getTime(); // 7:00 AM PHT
    const bizEnd   = new Date(`${date}T18:00:00Z`).getTime();     // 2:00 AM PHT next day

    const [{ skuMap, nameBySkuMap }, transactions] = await Promise.all([
      buildSkuMaps(),
      fetchStoreHub(`/transactions?storeId=${storeId}&from=${prevDate}&to=${date}`),
    ]);

    // Aggregate qty sold per SKU — Sales only, not cancelled, items only, within PHT business day
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

    // Unmatched: sold SKUs not referenced in any mapping entry
    const mappedSkus = allMappedSkus();
    const unmatchedSkus = Object.entries(soldBySkuMap)
      .filter(([sku]) => !mappedSkus.has(sku))
      .map(([sku, qty]) => ({ sku, name: nameBySkuMap[sku] ?? sku, qty }));

    return NextResponse.json({ date, matched, unmatchedSkus });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

function phtToday(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addUtcDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
