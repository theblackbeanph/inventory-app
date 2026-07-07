import { NextRequest, NextResponse } from "next/server";

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

const CORS = { "Access-Control-Allow-Origin": "*" };

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...CORS, "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "Content-Type" },
  });
}

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
  return JSON.parse(text);
}

function phtToday(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addUtcDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function phtHour(utcMs: number): number {
  return new Date(utcMs + 8 * 60 * 60 * 1000).getUTCHours();
}

// Normalize StoreHub payment strings → card / gcash / cash.
// If field names are wrong this will default everything to "card" — check
// console output on first run to find the real field and value shape.
function normalizePayment(raw: string | undefined): "card" | "gcash" | "cash" {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("gcash") || s.includes("maya") || s.includes("ewallet") || s.includes("qr")) return "gcash";
  if (s.includes("cash")) return "cash";
  return "card";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const branch = searchParams.get("branch") ?? "MKT";
  const date   = searchParams.get("date")   ?? phtToday();

  const storeId = STORE_IDS[branch];
  if (!storeId) {
    return NextResponse.json(
      { error: `StoreHub store ID not configured for branch ${branch}` },
      { status: 500, headers: CORS }
    );
  }

  try {
    const prevDate = addUtcDays(date, -1);
    const bizStart = new Date(`${prevDate}T23:00:00Z`).getTime(); // 7:00 AM PHT
    const bizEnd   = new Date(`${date}T18:00:00Z`).getTime();     // 2:00 AM PHT next day

    const [products, transactions] = await Promise.all([
      fetchStoreHub("/products", branch),
      // includeOnline=true is required — StoreHub excludes online orders (GrabFood, Beep, etc.) by default
      fetchStoreHub(`/transactions?storeId=${storeId}&from=${prevDate}&to=${date}&includeOnline=true`, branch),
    ]);

    const skuMap: Record<string, string> = {};
    const nameBySkuMap: Record<string, string> = {};
    for (const p of products as { id: string; sku?: string; name?: string }[]) {
      if (p.id && p.sku) {
        skuMap[p.id] = p.sku;
        if (p.name) nameBySkuMap[p.sku] = p.name;
      }
    }

    let totalRevenue = 0;
    let txCount = 0;
    const hourlySales: Record<number, number> = {};
    const soldBySku: Record<string, number> = {};
    const paymentCounts: Record<"card" | "gcash" | "cash", number> = { card: 0, gcash: 0, cash: 0 };

    for (const tx of transactions as Record<string, unknown>[]) {
      if (tx["transactionType"] !== "Sale" || tx["isCancelled"]) continue;
      const txTime = new Date(tx["transactionTime"] as string).getTime();
      if (txTime < bizStart || txTime > bizEnd) continue;

      // ⚠️ totalAmount / paymentMethod: guessed field names — verify on first run.
      // Check the console output below for the real keys if revenue shows as 0.
      if (process.env.NODE_ENV === "development" && txCount === 0) {
        console.log("[storehub/dashboard] sample tx keys:", Object.keys(tx));
        console.log("[storehub/dashboard] sample tx:", JSON.stringify(tx).slice(0, 500));
      }

      const amount = ((tx["totalAmount"] ?? tx["grandTotal"] ?? tx["total"] ?? 0) as number);
      const paymentRaw = ((tx["paymentMethod"] ?? tx["paymentType"] ?? tx["payment"] ?? "") as string);

      totalRevenue += amount;
      txCount++;

      const hour = phtHour(txTime);
      hourlySales[hour] = (hourlySales[hour] ?? 0) + amount;
      paymentCounts[normalizePayment(paymentRaw)]++;

      for (const item of (tx["items"] ?? []) as { itemType: string; productId: string; quantity: number }[]) {
        if (item.itemType !== "Item" || !item.productId || item.quantity <= 0) continue;
        const sku = skuMap[item.productId];
        if (!sku) continue;
        soldBySku[sku] = (soldBySku[sku] ?? 0) + item.quantity;
      }
    }

    // Hourly array covering the business day window (7am–7pm display range)
    const hourly = Array.from({ length: 13 }, (_, i) => ({
      hour: i + 7,
      revenue: Math.round(hourlySales[i + 7] ?? 0),
    }));

    // Top 6 items by raw units sold, using StoreHub product names
    const topItems = Object.entries(soldBySku)
      .map(([sku, qty]) => ({ name: nameBySkuMap[sku] ?? sku, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 6);

    const paymentTotal = txCount || 1;
    const paymentMix = {
      card:  Math.round((paymentCounts.card  / paymentTotal) * 100) / 100,
      gcash: Math.round((paymentCounts.gcash / paymentTotal) * 100) / 100,
      cash:  Math.round((paymentCounts.cash  / paymentTotal) * 100) / 100,
    };

    return NextResponse.json(
      {
        date,
        branch,
        revenue: Math.round(totalRevenue),
        txCount,
        aov: txCount ? Math.round(totalRevenue / txCount) : 0,
        hourly,
        topItems,
        paymentMix,
      },
      { headers: CORS }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502, headers: CORS });
  }
}
