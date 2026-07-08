# Sales Dashboard — Food Cost & Channel Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Projected Food Cost card (theoretical expense vs revenue, 30% target) and a Sales Channel card (GrabFood vs dine-in split) to the `/sales` page.

**Architecture:** Extend `DashboardData` with two optional fields (`soldBySku`, `grabFood`), expose them from the existing dashboard API route, add a new `/api/recipe-costs` route that reads the Firestore `recipes` collection server-side, and render two new cards in `page.tsx` that compute food cost % client-side.

**Tech Stack:** Next.js 15 App Router, TypeScript, Firebase client SDK (auth + Firestore), Vitest

## Global Constraints

- All new `DashboardData` fields must be **optional** — in-session cache may hold pre-deploy entries
- Guard every use of `soldBySku?` and `grabFood?` with `?.` or `?? fallback`
- House style: white cards, `border: 1px solid var(--border)`, `borderRadius: 12`, gold accent `#C8A96E`
- Color coding: green `#16A34A` < 30%, amber `#D97706` 30–33%, red `#DC2626` > 33%
- GrabFood channel color: `#00B140`
- `FOOD_CATEGORIES` exact strings must match Firestore `recipes` docs — NOT POS category names
- Auth for `/api/recipe-costs`: `signInWithEmailAndPassword(auth, SYSTEM_EMAIL, SYSTEM_PASSWORD)` — same pattern as cron routes
- Test runner: `npx vitest run` (or `npm test`)
- Deploy-day note: Card % in payment mix will drop on deploy as GrabFood is removed from `paymentCounts` — expected and correct

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/app/sales/_lib/combine.ts` | Modify | Add `soldBySku?`, `grabFood?` to `DashboardData`; update `combineDashboards` |
| `src/app/sales/_lib/combine.test.ts` | Modify | Tests for new combine logic |
| `src/app/api/storehub/dashboard/route.ts` | Modify | Expose `soldBySku`, track `grabFood`, exclude GrabFood from `paymentCounts` |
| `src/app/api/recipe-costs/route.ts` | Create | Firestore read → pos_sku→food_cost map, 5-min cache |
| `src/app/sales/page.tsx` | Modify | Fetch cost map, compute food cost %, render two new cards |

---

## Task 1: Extend DashboardData and combineDashboards

**Files:**
- Modify: `src/app/sales/_lib/combine.ts`
- Modify: `src/app/sales/_lib/combine.test.ts`

**Interfaces:**
- Produces: `DashboardData` with optional `soldBySku?: Record<string, number>` and `grabFood?: { revenue: number; txCount: number; aov: number }` — consumed by Tasks 2 and 4

- [ ] **Step 1: Write failing tests for soldBySku merge**

Add to `src/app/sales/_lib/combine.test.ts` after the existing tests:

```ts
describe("combineDashboards — new fields", () => {
  it("merges soldBySku by summing qty per SKU", () => {
    const a = mk({ soldBySku: { "S1": 5, "66": 3 } });
    const b = mk({ branch: "BF", soldBySku: { "S1": 2, "M1": 7 } });
    expect(combineDashboards(a, b).soldBySku).toEqual({ "S1": 7, "66": 3, "M1": 7 });
  });

  it("handles missing soldBySku on either side", () => {
    const a = mk({ soldBySku: { "S1": 5 } });
    const b = mk({ branch: "BF" }); // no soldBySku
    expect(combineDashboards(a, b).soldBySku).toEqual({ "S1": 5 });
  });

  it("returns empty soldBySku when both missing", () => {
    expect(combineDashboards(mk({}), mk({ branch: "BF" })).soldBySku).toEqual({});
  });

  it("combines grabFood revenue and txCount, recomputes aov", () => {
    const a = mk({ grabFood: { revenue: 5000, txCount: 10, aov: 500 } });
    const b = mk({ branch: "BF", grabFood: { revenue: 3000, txCount: 6, aov: 500 } });
    const c = combineDashboards(a, b);
    expect(c.grabFood?.revenue).toBe(8000);
    expect(c.grabFood?.txCount).toBe(16);
    expect(c.grabFood?.aov).toBe(500);
  });

  it("handles missing grabFood on either side", () => {
    const a = mk({ grabFood: { revenue: 4000, txCount: 8, aov: 500 } });
    const b = mk({ branch: "BF" }); // no grabFood
    const c = combineDashboards(a, b);
    expect(c.grabFood?.revenue).toBe(4000);
    expect(c.grabFood?.txCount).toBe(8);
  });

  it("returns zeroed grabFood when both missing", () => {
    const c = combineDashboards(mk({}), mk({ branch: "BF" }));
    expect(c.grabFood).toEqual({ revenue: 0, txCount: 0, aov: 0 });
  });

  it("weights paymentMix by dine-in txCount (not total txCount)", () => {
    // MKT: 10 total tx, 4 GrabFood → 6 dine-in, 100% card on dine-in
    // BF: 10 total tx, 2 GrabFood → 8 dine-in, 100% cash on dine-in
    // Combined dine-in: 14 tx → card = 6/14 ≈ 0.4286, cash = 8/14 ≈ 0.5714
    const a = mk({ txCount: 10, grabFood: { revenue: 0, txCount: 4, aov: 0 }, paymentMix: { card: 1, gcash: 0, cash: 0 } });
    const b = mk({ branch: "BF", txCount: 10, grabFood: { revenue: 0, txCount: 2, aov: 0 }, paymentMix: { card: 0, gcash: 0, cash: 1 } });
    const mix = combineDashboards(a, b).paymentMix;
    expect(mix.card).toBeCloseTo(6 / 14, 5);
    expect(mix.cash).toBeCloseTo(8 / 14, 5);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/christiancasino/Documents/branch-inventory && npx vitest run src/app/sales/_lib/combine.test.ts
```

Expected: multiple FAIL — `soldBySku` and `grabFood` do not exist yet.

- [ ] **Step 3: Extend DashboardData type**

In `src/app/sales/_lib/combine.ts`, add the two optional fields to the `DashboardData` interface:

```ts
export interface DashboardData {
  date: string;
  branch: string;
  revenue: number;
  txCount: number;
  aov: number;
  hourly: { hour: number; revenue: number }[];
  topItems: { name: string; qty: number }[];
  paymentMix: { card: number; gcash: number; cash: number };
  soldBySku?: Record<string, number>;
  grabFood?: { revenue: number; txCount: number; aov: number };
}
```

- [ ] **Step 4: Update combineDashboards**

Replace the `combineDashboards` function body in `src/app/sales/_lib/combine.ts` with:

```ts
export function combineDashboards(a: DashboardData, b: DashboardData): DashboardData {
  const revenue = a.revenue + b.revenue;
  const txCount = a.txCount + b.txCount;

  const hourlyMap = new Map<number, number>();
  for (const { hour, revenue: r } of [...a.hourly, ...b.hourly]) {
    hourlyMap.set(hour, (hourlyMap.get(hour) ?? 0) + r);
  }
  const hourly = [...hourlyMap.entries()]
    .sort(([h1], [h2]) => h1 - h2)
    .map(([hour, r]) => ({ hour, revenue: r }));

  const itemMap = new Map<string, number>();
  for (const { name, qty } of [...a.topItems, ...b.topItems]) {
    itemMap.set(name, (itemMap.get(name) ?? 0) + qty);
  }
  const topItems = [...itemMap.entries()]
    .map(([name, qty]) => ({ name, qty }))
    .sort((x, y) => y.qty - x.qty)
    .slice(0, 6);

  // soldBySku: sum quantities per SKU across both branches
  const skuAccum = new Map<string, number>();
  for (const [sku, qty] of Object.entries(a.soldBySku ?? {})) {
    skuAccum.set(sku, (skuAccum.get(sku) ?? 0) + qty);
  }
  for (const [sku, qty] of Object.entries(b.soldBySku ?? {})) {
    skuAccum.set(sku, (skuAccum.get(sku) ?? 0) + qty);
  }
  const soldBySku = Object.fromEntries(skuAccum);

  // grabFood: sum revenue + txCount, recompute aov
  const grabFoodRevenue = (a.grabFood?.revenue ?? 0) + (b.grabFood?.revenue ?? 0);
  const grabFoodCount   = (a.grabFood?.txCount ?? 0) + (b.grabFood?.txCount ?? 0);
  const grabFood = {
    revenue: grabFoodRevenue,
    txCount: grabFoodCount,
    aov: grabFoodCount ? Math.round(grabFoodRevenue / grabFoodCount) : 0,
  };

  // paymentMix: weight by dine-in txCount (GrabFood excluded from paymentCounts)
  const mixKeys = ["card", "gcash", "cash"] as const;
  const paymentMix = { card: 0, gcash: 0, cash: 0 };
  const aDineIn = a.txCount - (a.grabFood?.txCount ?? 0);
  const bDineIn = b.txCount - (b.grabFood?.txCount ?? 0);
  const totalDineIn = aDineIn + bDineIn;
  if (totalDineIn > 0) {
    for (const k of mixKeys) {
      paymentMix[k] = (a.paymentMix[k] * aDineIn + b.paymentMix[k] * bDineIn) / totalDineIn;
    }
  }

  return {
    date: a.date,
    branch: "ALL",
    revenue,
    txCount,
    aov: txCount ? Math.round(revenue / txCount) : 0,
    hourly,
    topItems,
    paymentMix,
    soldBySku,
    grabFood,
  };
}
```

- [ ] **Step 5: Run all combine tests to confirm they pass**

```bash
cd /Users/christiancasino/Documents/branch-inventory && npx vitest run src/app/sales/_lib/combine.test.ts
```

Expected: all tests PASS — including the existing payment mix tests (they don't set `grabFood`, so `aDineIn = txCount`, weighting unchanged).

- [ ] **Step 6: Commit**

```bash
cd /Users/christiancasino/Documents/branch-inventory
git add src/app/sales/_lib/combine.ts src/app/sales/_lib/combine.test.ts
git commit -m "feat: add soldBySku and grabFood fields to DashboardData and combineDashboards"
```

---

## Task 2: Extend Dashboard API Route

**Files:**
- Modify: `src/app/api/storehub/dashboard/route.ts`

**Interfaces:**
- Consumes: `DashboardData` with `soldBySku?` and `grabFood?` from Task 1
- Produces: JSON response now includes `soldBySku: Record<string, number>` and `grabFood: { revenue, txCount, aov }`. `paymentCounts` excludes GrabFood transactions.

- [ ] **Step 1: Declare grabFood accumulators before the transaction loop**

In `src/app/api/storehub/dashboard/route.ts`, locate the existing declarations just before the `for (const tx of transactions ...)` loop:

```ts
let totalRevenue = 0;
let txCount = 0;
const hourlySales: Record<number, number> = {};
const soldBySku: Record<string, number> = {};
const paymentCounts: Record<"card" | "gcash" | "cash", number> = { card: 0, gcash: 0, cash: 0 };
```

Replace with (adds two new accumulators):

```ts
let totalRevenue = 0;
let txCount = 0;
let grabFoodRevenue = 0;
let grabFoodCount = 0;
const hourlySales: Record<number, number> = {};
const soldBySku: Record<string, number> = {};
const paymentCounts: Record<"card" | "gcash" | "cash", number> = { card: 0, gcash: 0, cash: 0 };
```

- [ ] **Step 2: Split GrabFood from dine-in in the transaction loop**

Inside the loop, find the existing payment handling (currently just `paymentCounts[normalizePayment(paymentRaw)]++`). Replace it with:

```ts
const isGrabFood = paymentRaw.toLowerCase().includes('grab');

if (isGrabFood) {
  grabFoodRevenue += amount;
  grabFoodCount++;
  // GrabFood excluded from paymentCounts — shown in the channel card instead
} else {
  paymentCounts[normalizePayment(paymentRaw)]++;
}
```

- [ ] **Step 3: Fix paymentMix denominator and add new fields to response**

Find the block that computes `paymentMix` and builds the JSON response. Update it to use `dineInTxCount` as the denominator and add `soldBySku` + `grabFood` to the response:

```ts
const dineInTxCount = txCount - grabFoodCount;
const paymentTotal = dineInTxCount || 1;
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
    soldBySku,
    grabFood: {
      revenue: Math.round(grabFoodRevenue),
      txCount: grabFoodCount,
      aov: grabFoodCount ? Math.round(grabFoodRevenue / grabFoodCount) : 0,
    },
  },
  { headers: CORS }
);
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/christiancasino/Documents/branch-inventory && npm run build 2>&1 | tail -20
```

Expected: build succeeds with no type errors. Fix any errors before continuing.

- [ ] **Step 5: Commit**

```bash
cd /Users/christiancasino/Documents/branch-inventory
git add src/app/api/storehub/dashboard/route.ts
git commit -m "feat: expose soldBySku and grabFood in dashboard API, exclude GrabFood from payment mix"
```

---

## Task 3: New /api/recipe-costs Route

**Files:**
- Create: `src/app/api/recipe-costs/route.ts`

**Interfaces:**
- Produces: `GET /api/recipe-costs` → `{ skuCostMap: Record<string, number>, uncostedCount: number }` — consumed by Task 4

- [ ] **Step 1: Create the route file**

Create `src/app/api/recipe-costs/route.ts`:

```ts
import { NextResponse } from "next/server";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getDocs, collection } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export const revalidate = 300; // 5-minute cache

const FOOD_CATEGORIES = new Set([
  'Brunch Plates',
  'Mains',
  'Pasta & Flatbread',
  'Rice Bowls',
  'Sandwiches',
  'Starters',
]);

export async function GET() {
  if (!process.env.SYSTEM_EMAIL || !process.env.SYSTEM_PASSWORD) {
    return NextResponse.json(
      { error: "SYSTEM_EMAIL / SYSTEM_PASSWORD not configured" },
      { status: 500 }
    );
  }

  try {
    await signInWithEmailAndPassword(
      auth,
      process.env.SYSTEM_EMAIL,
      process.env.SYSTEM_PASSWORD
    );

    const snap = await getDocs(collection(db, "recipes"));
    const skuCostMap: Record<string, number> = {};
    let uncostedCount = 0;

    for (const docSnap of snap.docs) {
      const r = docSnap.data();
      if (r.recipe_type !== "LINE" || !FOOD_CATEGORIES.has(r.category)) continue;
      if (r.pos_sku && typeof r.food_cost === "number" && r.food_cost > 0) {
        skuCostMap[r.pos_sku as string] = r.food_cost as number;
      } else {
        uncostedCount++;
      }
    }

    return NextResponse.json({ skuCostMap, uncostedCount });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/christiancasino/Documents/branch-inventory && npm run build 2>&1 | tail -20
```

Expected: build succeeds. Fix any type errors before continuing.

- [ ] **Step 3: Smoke-test the route in dev**

```bash
cd /Users/christiancasino/Documents/branch-inventory && npm run dev
```

In a second terminal:
```bash
curl http://localhost:3000/api/recipe-costs | python3 -m json.tool | head -30
```

Expected: JSON with `skuCostMap` (object of SKU → number) and `uncostedCount` (number). If you get `{ error: "..." }`, check the error message — likely auth or Firestore rules.

- [ ] **Step 4: Verify pos_sku alignment**

While dev is running, open the sales page in the browser for today's date. Open DevTools console. The diagnostic log (added in Task 4) will show the match rate. For now, confirm the route returns a non-empty `skuCostMap` and note the SKU format (e.g. `"66"`, `"S1"`) for comparison in Task 4.

- [ ] **Step 5: Commit**

```bash
cd /Users/christiancasino/Documents/branch-inventory
git add src/app/api/recipe-costs/route.ts
git commit -m "feat: add /api/recipe-costs route — Firestore food cost map with 5-min cache"
```

---

## Task 4: Sales Page — Fetch Cost Map and Render Cards

**Files:**
- Modify: `src/app/sales/page.tsx`

**Interfaces:**
- Consumes:
  - `DashboardData.soldBySku?: Record<string, number>` (Task 1)
  - `DashboardData.grabFood?: { revenue: number; txCount: number; aov: number }` (Task 1)
  - `GET /api/recipe-costs` → `{ skuCostMap: Record<string, number>, uncostedCount: number }` (Task 3)

- [ ] **Step 1: Add cost map state and fetch**

In `src/app/sales/page.tsx`, add three new state variables alongside the existing ones (after `const [loading, setLoading] = useState(false)`):

```ts
const [costMap, setCostMap]           = useState<Record<string, number>>({});
const [uncostedCount, setUncostedCount] = useState(0);
const [costMapLoaded, setCostMapLoaded] = useState(false);
```

Add a new `useEffect` after the existing auth `useEffect`, before the data-fetching one:

```ts
useEffect(() => {
  fetch("/api/recipe-costs")
    .then(r => r.json())
    .then((j: { skuCostMap?: Record<string, number>; uncostedCount?: number }) => {
      setCostMap(j.skuCostMap ?? {});
      setUncostedCount(j.uncostedCount ?? 0);
    })
    .catch(() => { /* leave costMap empty — cards show ₱0 gracefully */ })
    .finally(() => setCostMapLoaded(true));
}, []); // fetch once on mount — cost map applies across all dates and branches
```

- [ ] **Step 2: Add helper functions for food cost computation**

Add these helpers near the top of the component function body, after the existing `delta` computation and before the `return`:

```ts
function computeFoodCost(d: DashboardData | null): number {
  if (!d?.soldBySku) return 0;
  return Object.entries(d.soldBySku).reduce(
    (sum, [sku, qty]) => sum + (costMap[sku] ?? 0) * qty,
    0
  );
}

function foodCostColor(pct: number): string {
  if (pct < 30) return "#16A34A";
  if (pct <= 33) return "#D97706";
  return "#DC2626";
}

function foodCostBg(pct: number): string {
  if (pct < 30) return "#DCFCE7";
  if (pct <= 33) return "#FEF9C3";
  return "#FEE2E2";
}
```

- [ ] **Step 3: Compute derived food cost values**

Add these derived values in the render body, after `const delta = ...` and before `return (`:

```ts
const projectedFoodCost = computeFoodCost(data);
const foodCostPct = data && data.revenue > 0
  ? (projectedFoodCost / data.revenue) * 100
  : null;

// Per-branch (only meaningful when view === ALL and both loaded)
const mktFoodCost = view === "ALL" && todayMKT ? computeFoodCost(todayMKT) : null;
const bfFoodCost  = view === "ALL" && todayBF  ? computeFoodCost(todayBF)  : null;
const mktFoodPct  = mktFoodCost !== null && todayMKT && todayMKT.revenue > 0
  ? (mktFoodCost / todayMKT.revenue) * 100 : null;
const bfFoodPct   = bfFoodCost !== null && todayBF && todayBF.revenue > 0
  ? (bfFoodCost / todayBF.revenue) * 100 : null;

// Diagnostic log — remove before prod deploy
if (costMapLoaded && data?.soldBySku) {
  const soldSkus = Object.keys(data.soldBySku);
  const matched = soldSkus.filter(s => s in costMap);
  console.log(`Food cost SKU match: ${matched.length}/${soldSkus.length}`);
}
```

- [ ] **Step 4: Add the FoodCostCard component**

Add a new local component above `SalesPage` (after `StatCard`):

```tsx
function FoodCostCard({
  projectedCost,
  pct,
  revenue,
  mktCost,
  mktPct,
  bfCost,
  bfPct,
  uncosted,
  showBranches,
  loaded,
}: {
  projectedCost: number;
  pct: number | null;
  revenue: number;
  mktCost: number | null;
  mktPct: number | null;
  bfCost: number | null;
  bfPct: number | null;
  uncosted: number;
  showBranches: boolean;
  loaded: boolean;
}) {
  const TARGET = 30;
  const color  = pct !== null ? foodCostColor(pct) : "#9CA3AF";
  const bg     = pct !== null ? foodCostBg(pct)    : "#F5F5F2";
  const barPct = pct !== null ? Math.min(pct / TARGET, 1.2) * 100 : 0; // cap at 120% of target width

  if (!loaded) {
    return (
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 12, borderLeft: "3px solid #C8A96E",
        padding: "14px 16px", marginBottom: 10,
        opacity: 0.5,
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
          Projected Food Cost
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 12, borderLeft: "3px solid #C8A96E",
      padding: "14px 16px", marginBottom: 10,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 4 }}>
            Projected Food Cost
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            ₱{Math.round(projectedCost).toLocaleString("en-PH")}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
            of ₱{revenue.toLocaleString("en-PH")} revenue
          </div>
        </div>
        {pct !== null && (
          <div style={{ textAlign: "right" }}>
            <div style={{
              background: bg, color, fontSize: 18, fontWeight: 800,
              padding: "4px 12px", borderRadius: 8, letterSpacing: "-0.02em",
            }}>
              {pct.toFixed(1)}%
            </div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>target: {TARGET}%</div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {pct !== null && (
        <>
          <div style={{ height: 6, background: "var(--bg)", borderRadius: 3, overflow: "visible", position: "relative", marginBottom: 5 }}>
            <div style={{
              height: "100%", width: `${Math.min(barPct, 100)}%`,
              background: color, borderRadius: 3,
            }} />
            {/* target line at the 30%/TARGET position = barPct 100% = full bar */}
            <div style={{
              position: "absolute", top: -4, left: `${(TARGET / (TARGET * 1.2)) * 100}%`,
              width: 2, height: 14, background: "#9CA3AF", borderRadius: 1,
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-secondary)", marginBottom: showBranches || uncosted > 0 ? 10 : 0 }}>
            <span>0%</span>
            <span>▲ {TARGET}% target</span>
            <span>{(TARGET * 1.2).toFixed(0)}%</span>
          </div>
        </>
      )}

      {/* Per-branch mini cards */}
      {showBranches && (mktCost !== null || bfCost !== null) && (
        <div style={{ display: "flex", gap: 8, marginBottom: uncosted > 0 ? 10 : 0 }}>
          {[
            { label: "MKT", cost: mktCost, pct: mktPct },
            { label: "BF",  cost: bfCost,  pct: bfPct  },
          ].map(({ label, cost, pct: p }) => (
            <div key={label} style={{ flex: 1, background: "var(--bg)", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
                {label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {cost !== null ? `₱${Math.round(cost).toLocaleString("en-PH")}` : "—"}
              </div>
              {p !== null && (
                <div style={{ fontSize: 10, fontWeight: 500, color: foodCostColor(p) }}>
                  {p.toFixed(1)}%
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Uncosted warning */}
      {uncosted > 0 && (
        <div style={{ fontSize: 11, color: "#D97706" }}>
          ⚠ {uncosted} item{uncosted !== 1 ? "s" : ""} uncosted — cost may be understated
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Add the ChannelCard component**

Add immediately after `FoodCostCard`:

```tsx
function ChannelCard({ data }: { data: DashboardData }) {
  const grabRevenue  = data.grabFood?.revenue  ?? 0;
  const grabCount    = data.grabFood?.txCount  ?? 0;
  const grabAov      = data.grabFood?.aov      ?? 0;
  const dineRevenue  = data.revenue - grabRevenue;
  const dineCount    = data.txCount - grabCount;
  const dineAov      = dineCount ? Math.round(dineRevenue / dineCount) : 0;
  const total        = data.revenue || 1;

  const rows = [
    { label: "Dine-in / Walk-in", color: "#1A1A1A", revenue: dineRevenue, count: dineCount, aov: dineAov },
    { label: "GrabFood",          color: "#00B140", revenue: grabRevenue,  count: grabCount,  aov: grabAov  },
  ];

  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 12, padding: "14px 16px", marginBottom: 12,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 10 }}>
        Sales Channel
      </div>

      {rows.map((row, i) => (
        <div key={row.label} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: i === 0 ? "0 0 8px" : "8px 0 0",
          borderBottom: i === 0 ? "1px solid var(--bg)" : "none",
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: row.color, flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{row.label}</div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>₱{row.revenue.toLocaleString("en-PH")}</div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
              {row.count} orders · avg ₱{row.aov.toLocaleString("en-PH")}
            </div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", minWidth: 36, textAlign: "right" }}>
            {((row.revenue / total) * 100).toFixed(1)}%
          </div>
        </div>
      ))}

      {/* Proportion bar */}
      <div style={{ marginTop: 12, height: 5, background: "var(--bg)", borderRadius: 3, overflow: "hidden", display: "flex", gap: 2 }}>
        <div style={{ height: "100%", width: `${(dineRevenue / total) * 100}%`, background: "#1A1A1A", borderRadius: 2 }} />
        <div style={{ height: "100%", width: `${(grabRevenue / total) * 100}%`, background: "#00B140", borderRadius: 2 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 10, color: "var(--text-secondary)" }}>
        <span>Dine-in</span>
        <span>GrabFood</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Insert the cards into the page JSX**

In the `return (...)` of `SalesPage`, find the existing layout inside `{data && ( <> ... </> )}`. 

Insert `<FoodCostCard>` **between** the Tx+AOV grid and the hourly chart:

```tsx
{/* Food Cost */}
<FoodCostCard
  projectedCost={projectedFoodCost}
  pct={foodCostPct}
  revenue={data.revenue}
  mktCost={mktFoodCost}
  mktPct={mktFoodPct}
  bfCost={bfFoodCost}
  bfPct={bfFoodPct}
  uncosted={uncostedCount}
  showBranches={view === "ALL" && !!todayMKT && !!todayBF}
  loaded={costMapLoaded}
/>
```

Insert `<ChannelCard>` **between** the hourly chart card and the Top Items + Payment Mix grid:

```tsx
{/* Sales Channel */}
<ChannelCard data={data} />
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd /Users/christiancasino/Documents/branch-inventory && npm run build 2>&1 | tail -20
```

Expected: build succeeds with no type errors.

- [ ] **Step 8: Run full test suite**

```bash
cd /Users/christiancasino/Documents/branch-inventory && npm test
```

Expected: all tests pass.

- [ ] **Step 9: Manual QA in dev**

```bash
cd /Users/christiancasino/Documents/branch-inventory && npm run dev
```

Open `http://localhost:3000/sales` and verify:

1. **Food Cost card** loads (skeleton → data), shows ₱ amount, % badge, progress bar with target line
2. **Color coding** — if today's food cost is < 30%, badge is green; try checking a high-revenue day where it might differ
3. **MKT/BF mini-cards** appear when "Both" is selected and both branches loaded
4. **Uncosted warning** only appears if `uncostedCount > 0`
5. **Console log** shows `Food cost SKU match: X/Y` — investigate any unmatched SKUs and update `pos_sku` values in the recipe DB if needed
6. **Channel card** shows Dine-in and GrabFood rows with correct ₱ split and proportion bar
7. **Payment Mix card** no longer includes GrabFood — Card % should be lower than before (expected)
8. Switch between MKT / BF / Both tabs — all cards update correctly

- [ ] **Step 10: Remove diagnostic log**

Once SKU alignment is confirmed, remove the `console.log` block added in Step 3:

```ts
// DELETE these lines:
if (costMapLoaded && data?.soldBySku) {
  const soldSkus = Object.keys(data.soldBySku);
  const matched = soldSkus.filter(s => s in costMap);
  console.log(`Food cost SKU match: ${matched.length}/${soldSkus.length}`);
}
```

- [ ] **Step 11: Final build check**

```bash
cd /Users/christiancasino/Documents/branch-inventory && npm run build 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 12: Commit**

```bash
cd /Users/christiancasino/Documents/branch-inventory
git add src/app/sales/page.tsx
git commit -m "feat: add food cost and sales channel cards to sales dashboard"
```

---

## Self-Review

**Spec coverage:**
- ✅ `soldBySku?` and `grabFood?` added to `DashboardData` as optional — Task 1
- ✅ `combineDashboards` updated for both fields, payment mix weighted by dine-in txCount — Task 1
- ✅ Dashboard API exposes `soldBySku`, tracks `grabFood`, excludes GrabFood from `paymentCounts` — Task 2
- ✅ `paymentMix` denominator fixed to `dineInTxCount` — Task 2
- ✅ `/api/recipe-costs` route with auth, `FOOD_CATEGORIES` filter, `revalidate: 300` — Task 3
- ✅ Cost map fetched once on mount — Task 4
- ✅ Food cost % computed with color coding at 30% / 33% thresholds — Task 4
- ✅ Per-branch MKT/BF mini-cards in ALL view — Task 4
- ✅ `uncostedCount` warning shown conditionally — Task 4
- ✅ Skeleton loading state until `costMapLoaded` — Task 4
- ✅ Channel card with dine-in / GrabFood split, proportion bar — Task 4
- ✅ Diagnostic log gated on `costMapLoaded && data?.soldBySku`, removed before prod — Task 4
- ✅ Deploy-day note about Card % drop — included in Global Constraints

**Type consistency:**
- `DashboardData.soldBySku` → `Record<string, number>` — consistent across Tasks 1, 2, 4
- `DashboardData.grabFood` → `{ revenue: number; txCount: number; aov: number }` — consistent across Tasks 1, 2, 4
- `computeFoodCost(d: DashboardData | null): number` — defined and used in Task 4 only, no cross-task confusion
- `foodCostColor(pct: number): string` / `foodCostBg(pct: number): string` — defined and used in Task 4 only
