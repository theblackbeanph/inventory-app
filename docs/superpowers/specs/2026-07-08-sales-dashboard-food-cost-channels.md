# Sales Dashboard — Food Cost & Channel Breakdown
**Date:** 2026-07-08
**Status:** Approved for implementation

## Overview

Two owner-facing additions to the `/sales` page:
1. **Projected Food Cost** — theoretical food expense vs revenue, with 30% target color-coding and per-branch breakdown
2. **Sales Channel** — GrabFood vs dine-in split by revenue, order count, and AOV

Party Trays deferred — will be added to the recipe DB as line recipes later, at which point the cost map picks them up automatically.

---

## 1. Data Model Changes

### `DashboardData` (`src/app/sales/_lib/combine.ts`)

Two new **optional** fields:

```ts
soldBySku?: Record<string, number>   // full StoreHub SKU → qty sold map
grabFood?: { revenue: number; txCount: number; aov: number }
```

Optional because in-session cache may hold entries fetched before the deploy. Guard every use site with `?.` or a fallback.

### `combineDashboards` updates

- `soldBySku`: merge by summing quantities per SKU key across both branches
- `grabFood`: sum `revenue` and `txCount`; recompute `aov = txCount ? Math.round(revenue / txCount) : 0`

---

## 2. Dashboard API Route Changes

**File:** `src/app/api/storehub/dashboard/route.ts`

### `soldBySku` — expose the existing map

`soldBySku` is already computed in the transaction loop. Add it to the JSON response as-is. No new computation needed.

### `grabFood` — track in the transaction loop

In the per-transaction loop, before incrementing `paymentCounts`:

```ts
const isGrabFood = paymentRaw.toLowerCase().includes('grab')

if (isGrabFood) {
  grabFoodRevenue += amount
  grabFoodCount++
  // do NOT increment paymentCounts — GrabFood excluded from payment mix
} else {
  paymentCounts[normalizePayment(paymentRaw)]++
}
```

Payment mix (`paymentCounts`) only reflects dine-in/walk-in transactions after this change. This is intentional and more useful — the channel card handles GrabFood separately.

**Deploy-day behavior change:** Card % in the payment mix will decrease on deploy as GrabFood transactions are removed from the count — this is expected and correct, not a data issue.

Add to response:
```ts
grabFood: {
  revenue: Math.round(grabFoodRevenue),
  txCount: grabFoodCount,
  aov: grabFoodCount ? Math.round(grabFoodRevenue / grabFoodCount) : 0,
}
```

---

## 3. New Route — `/api/recipe-costs`

**File:** `src/app/api/recipe-costs/route.ts`

### Purpose
Returns a `pos_sku → food_cost` map for all costed food LINE recipes. Cached 5 minutes. Used by the sales page to compute projected food expense.

### Auth
Same pattern as cron routes — sign in with system credentials before touching Firestore:
```ts
await signInWithEmailAndPassword(auth, process.env.SYSTEM_EMAIL!, process.env.SYSTEM_PASSWORD!)
```
Fails fast with 500 if `SYSTEM_EMAIL` or `SYSTEM_PASSWORD` is missing from env.

### Food category filter

```ts
const FOOD_CATEGORIES = new Set([
  'Brunch Plates',
  'Mains',
  'Pasta & Flatbread',
  'Rice Bowls',
  'Sandwiches',
  'Starters',
])
```

These are the exact category strings stored in the Firestore `recipes` collection. **Do not use POS category names** — they differ (e.g. POS says "All-Day Breakfast", recipe DB says "Brunch Plates").

### Logic

1. `getDocs(collection(db, 'recipes'))` — full collection fetch, client-side filter. Intentional and acceptable at current recipe count (~80–100 docs total). If the collection grows significantly, adding a `where('recipe_type', '==', 'LINE')` server-side constraint is trivial.
2. Filter: `recipe_type === 'LINE'` AND `category` in `FOOD_CATEGORIES`
3. For each matching recipe:
   - If `pos_sku` is non-null AND `food_cost` is a positive number → add to `skuCostMap`
   - Otherwise → increment `uncostedCount`
4. Return `{ skuCostMap, uncostedCount }`

### Response shape
```ts
{
  skuCostMap: Record<string, number>  // pos_sku → food_cost (₱ per portion)
  uncostedCount: number               // food LINE recipes missing pos_sku or food_cost
}
```

### Caching
```ts
export const revalidate = 300  // 5-minute Next.js cache
```

### pos_sku alignment — must verify before ship

`soldBySku` keys are StoreHub product SKU strings (e.g. `"66"`, `"S1"`, `"M1"`).
`skuCostMap` keys are `pos_sku` values from Firestore recipe docs.

These must match exactly (same string, same casing) for the multiplication to work. A mismatch is silent — the item contributes ₱0 to food cost with no error, and `uncostedCount` won't catch it (the recipe has a `pos_sku`, it just doesn't match any sold SKU).

**Verification step:** Add a diagnostic log in `page.tsx` in the derived computation block — gated on `costMapLoaded && data?.soldBySku` so it runs once per branch/date combination when both pieces are available:
```ts
// temporary — remove before prod
if (costMapLoaded && data?.soldBySku) {
  const soldSkus = Object.keys(data.soldBySku)
  const matched = soldSkus.filter(s => s in costMap)
  console.log(`Food cost SKU match: ${matched.length}/${soldSkus.length}`)
}
```
Fix any mismatches in the recipe DB (update `pos_sku` values) before deploying.

---

## 4. Sales Page Changes

**File:** `src/app/sales/page.tsx`

### Cost map fetch

Fetch `/api/recipe-costs` **once on mount** — not per-date, not per-branch. The cost map applies across all dates and branches.

```ts
const [costMap, setCostMap] = useState<Record<string, number>>({})
const [uncostedCount, setUncostedCount] = useState(0)
const [costMapLoaded, setCostMapLoaded] = useState(false)

useEffect(() => {
  fetch('/api/recipe-costs')
    .then(r => r.json())
    .then(j => {
      setCostMap(j.skuCostMap ?? {})
      setUncostedCount(j.uncostedCount ?? 0)
    })
    .finally(() => setCostMapLoaded(true))
}, []) // empty dep array — fetch once
```

### Food cost computation

```ts
const projectedFoodCost = Object.entries(data.soldBySku ?? {})
  .reduce((sum, [sku, qty]) => sum + (costMap[sku] ?? 0) * qty, 0)

const foodCostPct = data.revenue > 0
  ? (projectedFoodCost / data.revenue) * 100
  : null
```

### Color coding (30% target)

| Range | Color | Meaning |
|---|---|---|
| < 30% | Green `#16A34A` | Under target |
| 30–33% | Amber `#D97706` | At/near target |
| > 33% | Red `#DC2626` | Over target |

### New cards — placement

Insert between the existing Tx+AOV grid and the hourly chart:

1. **Projected Food Cost card** (full width, gold left accent)
   - Primary: `₱{projectedFoodCost}` with `{foodCostPct}%` badge (color-coded)
   - Progress bar with 30% target line marked
   - Per-branch row (MKT / BF) when `view === 'ALL'` and both branches loaded
   - Uncosted items counter — only show if `uncostedCount > 0`
   - Show skeleton/loading state until `costMapLoaded && data`

2. **Sales Channel card** (full width) — insert between hourly chart and top items
   - Two rows: Dine-in and GrabFood
   - Each row: channel name · ₱ revenue · order count · avg order · % of total
   - Proportion bar (dark for dine-in, `#00B140` for GrabFood)
   - Dine-in = `{ revenue: data.revenue - (data.grabFood?.revenue ?? 0), txCount: data.txCount - (data.grabFood?.txCount ?? 0) }`

### Per-branch food cost (ALL view)

When `view === 'ALL'` and both `todayMKT` and `todayBF` are loaded, compute food cost independently per branch and show MKT/BF mini-cards below the main %. Use each branch's `soldBySku` against the same shared `costMap`.

---

## 5. Out of Scope

- **Beverage cost card** — deferred; add `BEVERAGE_CATEGORIES` constant and second card when recipe DB has drink costs
- **Party Tray cost** — deferred; will auto-resolve when Party Tray line recipes are added to recipe DB with `pos_sku` + `food_cost`
- **Real-time intra-day refresh** — not needed; food cost is a snapshot view, page-load freshness is sufficient
- **soldBySku payload size** — noted as a future concern if latency budgets are introduced; no action now

---

## 6. Files Changed

| File | Change |
|---|---|
| `src/app/sales/_lib/combine.ts` | Add `soldBySku?`, `grabFood?` to `DashboardData`; update `combineDashboards` |
| `src/app/api/storehub/dashboard/route.ts` | Expose `soldBySku`, track `grabFood`, exclude GrabFood from `paymentCounts` |
| `src/app/api/recipe-costs/route.ts` | New route — Firestore read, cost map, 5-min cache |
| `src/app/sales/page.tsx` | Fetch cost map, compute food cost %, render two new cards |
