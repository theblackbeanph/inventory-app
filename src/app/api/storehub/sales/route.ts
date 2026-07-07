import { NextRequest, NextResponse } from "next/server";
import { applyStoreHubMapping, allMappedSkus } from "@/lib/storehub-mapping";

export const maxDuration = 30;

const BASE_URL = "https://api.storehubhq.com";

const CREDENTIALS: Record<string, { user: string | undefined; pass: string | undefined }> = {
  MKT: { user: process.env.STOREHUB_USERNAME,    pass: process.env.STOREHUB_PASSWORD },
  BF:  { user: process.env.STOREHUB_BF_USERNAME, pass: process.env.STOREHUB_BF_PASSWORD },
};

const STORE_IDS: Record<string, string | undefined> = {
  MKT: process.env.STOREHUB_MKT_STORE_ID,
  BF:  process.env.STOREHUB_BF_STORE_ID,
};

function authHeader(branch: string): string {
  const { user, pass } = CREDENTIALS[branch] ?? CREDENTIALS.MKT;
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

async function fetchStoreHub(path: string, branch: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: authHeader(branch), Accept: "application/json" },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`StoreHub ${path} → ${res.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`StoreHub ${path} returned non-JSON: ${text.slice(0, 200)}`);
  }
}

async function buildSkuMaps(branch: string): Promise<{ skuMap: Record<string, string>; nameBySkuMap: Record<string, string> }> {
  const products: { id: string; sku?: string; name?: string }[] = await fetchStoreHub("/products", branch);
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
  const { searchParams } = new URL(request.url);
  const branch = searchParams.get("branch") ?? "MKT";
  const date   = searchParams.get("date")   ?? phtToday();

  const storeId = STORE_IDS[branch];
  if (!storeId) return NextResponse.json({ error: `StoreHub store ID not configured for branch ${branch}` }, { status: 500 });

  try {
    // StoreHub stores transactionTime in UTC. Business day runs 7am–2am PHT,
    // which in UTC is 23:00 (prev day) – 18:00 (same day). We query yesterday+today
    // in UTC so we don't miss the 7am–8am PHT window, then filter client-side.
    const prevDate = addUtcDays(date, -1);
    const bizStart = new Date(`${prevDate}T23:00:00Z`).getTime(); // 7:00 AM PHT
    const bizEnd   = new Date(`${date}T18:00:00Z`).getTime();     // 2:00 AM PHT next day

    const [{ skuMap, nameBySkuMap }, transactions] = await Promise.all([
      buildSkuMaps(branch),
      fetchStoreHub(`/transactions?storeId=${storeId}&from=${prevDate}&to=${addUtcDays(date, 1)}`, branch),
    ]);

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

    const matched = applyStoreHubMapping(soldBySkuMap, branch);
    const mappedSkus = allMappedSkus(branch);
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
