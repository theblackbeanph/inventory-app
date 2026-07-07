# Combined Sales Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `/sales` page into a superadmin-only combined MKT+BF report with `Both · MKT · BF` toggle pills.

**Architecture:** The `/api/storehub/dashboard` route is untouched. The page fetches per-branch datasets, caches them by `branch__date`, and merges client-side via pure functions in `src/app/sales/_lib/combine.ts`. Role gating moves from `admin` to `superadmin` at all three layers (middleware, BottomNav, client guard).

**Tech Stack:** Next.js App Router (see `AGENTS.md` — read `node_modules/next/dist/docs/` before writing Next-specific code), React client components, vitest (`npm test`), TypeScript.

**Spec:** `docs/superpowers/specs/2026-07-08-combined-sales-report-design.md`

## Global Constraints

- The working tree already contains an uncommitted baseline `/sales` page (`src/app/sales/page.tsx`), a modified `src/components/BottomNav.tsx` (Sales tab, minRole `admin`), and a modified `src/lib/middleware-helpers.ts` (`/sales` → `admin`). Task 1 commits this baseline BEFORE any new work.
- Do NOT deploy. Deployment is the owner's call after review (house rule: commit to git before any `vercel --prod`, deploy from main with a clean tree).
- Do NOT touch `src/app/api/storehub/dashboard/route.ts` — it was just stabilized in production.
- Branch values are exactly `"MKT"` and `"BF"` (type `Branch` from `@/lib/types`).
- Currency display: `₱` with `toLocaleString("en-PH")` (existing `fmt` helper in page.tsx).
- All tests run with `npm test` (vitest, jsdom, `@` alias = `src/`).

---

### Task 1: Commit the baseline /sales page

The uncommitted baseline must land as its own commit so the combined-report work has a clean diff.

**Files:**
- Commit (already in working tree, do not modify): `src/app/sales/page.tsx`, `src/components/BottomNav.tsx`, `src/lib/middleware-helpers.ts`

**Interfaces:**
- Produces: baseline `/sales` page whose internals Task 2–4 modify. Key exports/shape used later: `DashboardData` interface currently declared inside `page.tsx` (moved out in Task 2), `fmt`/`fmtK`/`prevDay` helpers, `StatCard` and `HourlyChart` components.

- [ ] **Step 1: Verify tree contains exactly the expected changes**

Run: `git status --short`
Expected: ` M src/components/BottomNav.tsx`, ` M src/lib/middleware-helpers.ts`, `?? src/app/sales/` (plus untracked `.superpowers/` — do NOT stage it), nothing else unexpected.

- [ ] **Step 2: Typecheck and test**

Run: `npx tsc --noEmit && npm test`
Expected: tsc silent, all vitest suites pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/sales/page.tsx src/components/BottomNav.tsx src/lib/middleware-helpers.ts
git commit -m "feat: add /sales POS overview page (baseline, admin+)"
```

---

### Task 2: Pure merge module with tests

**Files:**
- Create: `src/app/sales/_lib/combine.ts`
- Test: `src/app/sales/_lib/combine.test.ts`
- Modify: `src/app/sales/page.tsx` (move `DashboardData` out, import it)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `export interface DashboardData` and `export function combineDashboards(a: DashboardData, b: DashboardData): DashboardData`. Task 4 imports both from `@/app/sales/_lib/combine`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/sales/_lib/combine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { combineDashboards, type DashboardData } from "./combine";

function mk(over: Partial<DashboardData>): DashboardData {
  return {
    date: "2026-07-07",
    branch: "MKT",
    revenue: 0,
    txCount: 0,
    aov: 0,
    hourly: [{ hour: 7, revenue: 0 }, { hour: 8, revenue: 0 }],
    topItems: [],
    paymentMix: { card: 0, gcash: 0, cash: 0 },
    ...over,
  };
}

describe("combineDashboards", () => {
  it("sums revenue and txCount", () => {
    const c = combineDashboards(mk({ revenue: 42650, txCount: 48 }), mk({ branch: "BF", revenue: 60490, txCount: 61 }));
    expect(c.revenue).toBe(103140);
    expect(c.txCount).toBe(109);
  });

  it("recomputes AOV from totals, not average of AOVs", () => {
    // MKT: 1000 / 10 = 100 AOV. BF: 3000 / 10 = 300 AOV. Combined: 4000/20 = 200 (not 200 by luck: avg would also be 200) —
    // use asymmetric tx counts to prove it: MKT 1000/10=100, BF 300/1=300 → combined 1300/11 = 118, avg of AOVs would be 200.
    const c = combineDashboards(mk({ revenue: 1000, txCount: 10, aov: 100 }), mk({ branch: "BF", revenue: 300, txCount: 1, aov: 300 }));
    expect(c.aov).toBe(Math.round(1300 / 11));
  });

  it("returns aov 0 when combined txCount is 0", () => {
    const c = combineDashboards(mk({}), mk({ branch: "BF" }));
    expect(c.aov).toBe(0);
  });

  it("sums hourly by hour", () => {
    const a = mk({ hourly: [{ hour: 7, revenue: 100 }, { hour: 8, revenue: 200 }] });
    const b = mk({ branch: "BF", hourly: [{ hour: 7, revenue: 50 }, { hour: 8, revenue: 25 }] });
    expect(combineDashboards(a, b).hourly).toEqual([{ hour: 7, revenue: 150 }, { hour: 8, revenue: 225 }]);
  });

  it("merges topItems by name, sums qty, sorts desc, caps at 6", () => {
    const a = mk({ topItems: [{ name: "Fish & Chips", qty: 10 }, { name: "Long Black", qty: 8 }] });
    const b = mk({ branch: "BF", topItems: [
      { name: "Fish & Chips", qty: 4 }, { name: "Beef Tapa", qty: 5 }, { name: "Cobbler", qty: 3 },
      { name: "Aburi", qty: 2 }, { name: "Adobo", qty: 2 }, { name: "Arroz", qty: 1 },
    ]});
    const items = combineDashboards(a, b).topItems;
    expect(items[0]).toEqual({ name: "Fish & Chips", qty: 14 });
    expect(items[1]).toEqual({ name: "Long Black", qty: 8 });
    expect(items).toHaveLength(6);
  });

  it("recomputes paymentMix weighted by txCount", () => {
    // MKT: 10 tx, 100% cash. BF: 30 tx, 100% card. Combined: 25% cash, 75% card.
    const a = mk({ txCount: 10, paymentMix: { card: 0, gcash: 0, cash: 1 } });
    const b = mk({ branch: "BF", txCount: 30, paymentMix: { card: 1, gcash: 0, cash: 0 } });
    const mix = combineDashboards(a, b).paymentMix;
    expect(mix.cash).toBeCloseTo(0.25, 5);
    expect(mix.card).toBeCloseTo(0.75, 5);
    expect(mix.gcash).toBe(0);
  });

  it("returns zeroed paymentMix when combined txCount is 0", () => {
    const mix = combineDashboards(mk({}), mk({ branch: "BF" })).paymentMix;
    expect(mix).toEqual({ card: 0, gcash: 0, cash: 0 });
  });

  it("keeps the date and labels branch as ALL", () => {
    const c = combineDashboards(mk({}), mk({ branch: "BF" }));
    expect(c.date).toBe("2026-07-07");
    expect(c.branch).toBe("ALL");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- combine`
Expected: FAIL — `Cannot find module './combine'` (or equivalent resolve error).

- [ ] **Step 3: Implement `combine.ts`**

Create `src/app/sales/_lib/combine.ts`:

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
}

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

  const mixKeys = ["card", "gcash", "cash"] as const;
  const paymentMix = { card: 0, gcash: 0, cash: 0 };
  if (txCount > 0) {
    for (const k of mixKeys) {
      paymentMix[k] = (a.paymentMix[k] * a.txCount + b.paymentMix[k] * b.txCount) / txCount;
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
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- combine`
Expected: all `combineDashboards` tests PASS.

- [ ] **Step 5: Move `DashboardData` out of page.tsx**

In `src/app/sales/page.tsx`: delete the local `interface DashboardData { ... }` block (lines ~11–21) and add to the imports:

```ts
import type { DashboardData } from "@/app/sales/_lib/combine";
```

- [ ] **Step 6: Typecheck and full test run**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/sales/_lib/combine.ts src/app/sales/_lib/combine.test.ts src/app/sales/page.tsx
git commit -m "feat: pure combineDashboards merge module for cross-branch sales"
```

---

### Task 3: Move the role gate to superadmin

**Files:**
- Modify: `src/lib/middleware-helpers.ts` (ROUTE_ROLES `/sales` entry)
- Modify: `src/lib/middleware.test.ts` (new cases)
- Modify: `src/components/BottomNav.tsx` (Sales tab minRole)
- Modify: `src/app/sales/page.tsx` (client guard)

**Interfaces:**
- Consumes: existing `getRedirectPath(session, pathname)` and `hasMinRole(role, minRole)`.
- Produces: `/sales` requires `superadmin` at all three layers. Task 5 verifies with curl.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe("getRedirectPath", ...)` block in `src/lib/middleware.test.ts`:

```ts
  it("redirects admin from /sales to /stock", () => {
    expect(getRedirectPath({ role: "admin" }, "/sales")).toBe("/stock");
  });
  it("redirects linecook from /sales to /stock", () => {
    expect(getRedirectPath({ role: "linecook" }, "/sales")).toBe("/stock");
  });
  it("allows superadmin to access /sales", () => {
    expect(getRedirectPath({ role: "superadmin" }, "/sales")).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify the admin case fails**

Run: `npm test -- middleware`
Expected: FAIL — `/sales` currently allows admin (`toBe("/stock")` receives `null`).

- [ ] **Step 3: Update ROUTE_ROLES**

In `src/lib/middleware-helpers.ts` change:

```ts
  { prefix: "/sales",      minRole: "admin"      },
```

to:

```ts
  { prefix: "/sales",      minRole: "superadmin" },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- middleware`
Expected: PASS.

- [ ] **Step 5: Update BottomNav and page guard**

In `src/components/BottomNav.tsx` change the Sales tab entry to:

```ts
  { href: "/sales",      icon: SalesIcon,      label: "Sales",      minRole: "superadmin" },
```

In `src/app/sales/page.tsx` auth-guard effect, change:

```ts
    if (!hasMinRole(session.role, "admin")) { router.replace("/dashboard"); return; }
```

to:

```ts
    if (!hasMinRole(session.role, "superadmin")) { router.replace("/stock"); return; }
```

- [ ] **Step 6: Typecheck and full test run**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/middleware-helpers.ts src/lib/middleware.test.ts src/components/BottomNav.tsx src/app/sales/page.tsx
git commit -m "feat: restrict /sales to superadmin at middleware, nav, and page guard"
```

---

### Task 4: Pills, per-branch fetch cache, and the Both view

**Files:**
- Modify: `src/app/sales/page.tsx`

**Interfaces:**
- Consumes: `combineDashboards`, `DashboardData` from `@/app/sales/_lib/combine` (Task 2); existing page helpers `fmt`, `fmtK`, `prevDay`, `businessDatePHT`, components `StatCard`, `HourlyChart`, `BottomNav`; `BRANCH_LABELS` from `@/lib/auth`; `Branch` from `@/lib/types`.
- Produces: final page behavior verified in Task 5. No exports consumed elsewhere.

- [ ] **Step 1: Replace state and data fetching**

In `SalesPage`, replace the `branch`/`data`/`prev` state and the fetch effect with a view + cache model. The auth-guard effect stays (it sets the session branch, which we no longer need for fetching — keep `setBranch` only to signal "auth passed"; rename for clarity):

```ts
type View = "ALL" | Branch;
const BRANCHES: Branch[] = ["MKT", "BF"];

export default function SalesPage() {
  const router = useRouter();
  const [authed, setAuthed]   = useState(false);
  const [view, setView]       = useState<View>("ALL");
  const [date, setDate]       = useState<string>(businessDatePHT());
  const [cache, setCache]     = useState<Record<string, DashboardData | null>>({});
  const [loading, setLoading] = useState(false);

  // Auth guard
  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    if (!hasMinRole(session.role, "superadmin")) { router.replace("/stock"); return; }
    setAuthed(true);
  }, [router]);

  // Fetch every (branch, date) pair the current view needs, skipping cached keys
  useEffect(() => {
    if (!authed) return;
    const branches = view === "ALL" ? BRANCHES : [view];
    const prevDate = prevDay(date);
    const needed = branches.flatMap(b => [`${b}__${date}`, `${b}__${prevDate}`])
      .filter(k => !(k in cache));
    if (needed.length === 0) return;

    setLoading(true);
    Promise.all(
      needed.map(async key => {
        const [b, d] = key.split("__");
        try {
          const r = await fetch(`/api/storehub/dashboard?branch=${b}&date=${d}`);
          const j = await r.json();
          return [key, j?.error ? null : (j as DashboardData)] as const;
        } catch {
          return [key, null] as const;
        }
      })
    )
      .then(entries => setCache(c => ({ ...c, ...Object.fromEntries(entries) })))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, view, date]);
```

Note: `cache` is intentionally omitted from the deps (it's read to skip fetches but updating it must not re-trigger the effect); the eslint suppression documents that.

- [ ] **Step 2: Derive display data**

After the effects, replace the `delta` derivation with:

```ts
  if (!authed) return null;

  const prevDate = prevDay(date);
  const get = (b: Branch, d: string) => cache[`${b}__${d}`] ?? null;

  const todayMKT = get("MKT", date), todayBF = get("BF", date);
  const prevMKT  = get("MKT", prevDate), prevBF = get("BF", prevDate);

  let data: DashboardData | null = null;
  let prev: DashboardData | null = null;
  let partialNotice: string | null = null;

  if (view === "ALL") {
    if (todayMKT && todayBF) data = combineDashboards(todayMKT, todayBF);
    else if (todayMKT || todayBF) {
      data = todayMKT ?? todayBF;
      const missing = todayMKT ? "BF" : "MKT";
      const shown   = todayMKT ? "MKT" : "BF";
      partialNotice = `${missing} data unavailable — totals show ${shown} only`;
    }
    prev = prevMKT && prevBF ? combineDashboards(prevMKT, prevBF) : null;
  } else {
    data = get(view, date);
    prev = get(view, prevDate);
  }

  const delta = data && prev
    ? ((data.revenue - prev.revenue) / (prev.revenue || 1)) * 100
    : null;
```

- [ ] **Step 3: Header — label and pills**

Replace the header's branch label line with:

```tsx
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
              {view === "ALL" ? "The Black Bean · POS" : `${BRANCH_LABELS[view]} · POS`}
            </div>
```

Below the header's flex row (still inside the sticky header div), add the pill row:

```tsx
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {(["ALL", ...BRANCHES] as View[]).map(v => {
            const active = view === v;
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  borderRadius: 999, padding: "5px 14px", fontSize: 12, cursor: "pointer",
                  fontWeight: active ? 600 : 400,
                  background: active ? "#1A1A1A" : "#FFFFFF",
                  color: active ? "#FFFFFF" : "var(--text-secondary)",
                  border: active ? "1px solid #1A1A1A" : "1px solid var(--border)",
                }}
              >
                {v === "ALL" ? "Both" : v}
              </button>
            );
          })}
        </div>
```

- [ ] **Step 4: Partial-failure notice and split sub-lines**

Above the Revenue card (inside the `{data && (...)}` block, before it), render the notice when set:

```tsx
        {partialNotice && (
          <div style={{
            background: "#FFFBEB", border: "1px solid #FDE68A",
            borderRadius: 10, padding: "10px 14px", marginBottom: 12,
            fontSize: 13, color: "#B45309",
          }}>
            {partialNotice}
          </div>
        )}
```

Revenue card: keep the delta sub-line and add a split line below it when in the full Both view:

```tsx
                sub={
                  <>
                    {delta !== null ? (
                      <span style={{ color: delta >= 0 ? "var(--good)" : "var(--critical)", fontWeight: 500 }}>
                        {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs prev day
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-secondary)" }}>no prev-day data</span>
                    )}
                    {view === "ALL" && todayMKT && todayBF && (
                      <div style={{ color: "var(--text-secondary)", marginTop: 2 }}>
                        MKT {fmt(todayMKT.revenue)} · BF {fmt(todayBF.revenue)}
                      </div>
                    )}
                  </>
                }
```

Transactions card sub:

```tsx
                sub={
                  view === "ALL" && todayMKT && todayBF
                    ? <span style={{ color: "var(--text-secondary)" }}>MKT {todayMKT.txCount} · BF {todayBF.txCount}</span>
                    : <span style={{ color: "var(--text-secondary)" }}>orders today</span>
                }
```

Section titles: "Hourly Sales" → `{view === "ALL" ? "Hourly Sales — Combined" : "Hourly Sales"}`, same pattern for "Top Items" and "Payment Mix".

- [ ] **Step 5: Typecheck, full test run, production build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all clean; build lists `/sales` as a route.

- [ ] **Step 6: Commit**

```bash
git add src/app/sales/page.tsx
git commit -m "feat: combined MKT+BF sales view with Both/MKT/BF pills"
```

---

### Task 5: End-to-end verification

**Files:**
- None created or modified (verification only).

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Role-gate verification against the production build**

```bash
npx next start -p 3111 > /tmp/next-sales-verify.log 2>&1 &
sleep 3
curl -s -o /dev/null -w "no-cookie: %{http_code} -> %{redirect_url}\n" http://localhost:3111/sales
curl -s -o /dev/null -w "admin: %{http_code} -> %{redirect_url}\n" --cookie '__identity={"role":"admin"}' http://localhost:3111/sales
curl -s -o /dev/null -w "superadmin: %{http_code}\n" --cookie '__identity={"role":"superadmin"}' http://localhost:3111/sales
kill %1
```

Expected: `no-cookie: 307 -> .../login`, `admin: 307 -> .../stock`, `superadmin: 200`.

- [ ] **Step 2: Merge sanity check against live API data**

The local server proxies to the same StoreHub env vars, so fetch both branches for yesterday and verify combined figures by hand:

```bash
curl -s "https://inventory.theblackbean.ph/api/storehub/dashboard?branch=MKT&date=<yesterday>" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['revenue'], d['txCount'])"
curl -s "https://inventory.theblackbean.ph/api/storehub/dashboard?branch=BF&date=<yesterday>"  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['revenue'], d['txCount'])"
```

Expected: the Both view's Revenue/Transactions equal the two sums (verify in the browser step below).

- [ ] **Step 3: Browser check (requires the owner or a superadmin session)**

Start `npm run dev`, log in as superadmin, open `/sales`:
- Lands on **Both** with combined totals and `MKT … · BF …` split lines under Revenue and Transactions
- Tapping **MKT**/**BF** shows the single-branch view; tapping between pills does not refetch (network tab: no duplicate `/api/storehub/dashboard` calls for cached keys)
- Changing the date fetches the new date's data
- As an admin user, the Sales tab is greyed out and `/sales` redirects to `/stock`

- [ ] **Step 4: Report ready for deploy**

Do NOT deploy. Report verification results to the owner; deployment happens on their say-so (from main, clean tree, `vercel --prod`).
