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

// Build productId → SKU map from the full product list
async function buildSkuMap(): Promise<Record<string, string>> {
  const products: { id: string; sku?: string }[] = await fetchStoreHub("/products");
  const map: Record<string, string> = {};
  for (const p of products) {
    if (p.id && p.sku) map[p.id] = p.sku;
  }
  return map;
}

export async function GET(request: NextRequest) {
  const storeId = process.env.STOREHUB_MKT_STORE_ID;
  if (!storeId) return NextResponse.json({ error: "StoreHub store ID not configured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? phtToday();

  try {
    const [skuMap, transactions] = await Promise.all([
      buildSkuMap(),
      fetchStoreHub(`/transactions?storeId=${storeId}&from=${date}&to=${date}`),
    ]);

    // Aggregate qty sold per SKU — Sales only, not cancelled, items only
    const soldBySkuMap: Record<string, number> = {};
    const soldBySkuName: Record<string, { name: string; qty: number }> = {};

    for (const tx of transactions) {
      if (tx.transactionType !== "Sale" || tx.isCancelled) continue;
      for (const item of tx.items ?? []) {
        if (item.itemType !== "Item" || !item.productId || item.quantity <= 0) continue;
        const sku = skuMap[item.productId];
        if (!sku) continue;
        soldBySkuMap[sku] = (soldBySkuMap[sku] ?? 0) + item.quantity;
        if (!soldBySkuName[sku]) soldBySkuName[sku] = { name: "", qty: 0 };
        soldBySkuName[sku].qty += item.quantity;
      }
    }

    const matched = applyStoreHubMapping(soldBySkuMap);

    // Unmatched: sold SKUs not referenced in any mapping entry
    const mappedSkus = allMappedSkus();
    const unmatchedSkus = Object.entries(soldBySkuMap)
      .filter(([sku]) => !mappedSkus.has(sku))
      .map(([sku, qty]) => ({ sku, qty }));

    return NextResponse.json({ date, matched, unmatchedSkus });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

function phtToday(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
