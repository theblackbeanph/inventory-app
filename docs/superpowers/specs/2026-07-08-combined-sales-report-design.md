# Combined Sales Report — Design

**Date:** 2026-07-08
**Status:** Approved (mockup reviewed in visual companion)

## Problem

The `/sales` page (built 2026-07-08, not yet deployed) shows POS sales for the session's branch only. The owner wants one report covering both branches — per-branch-only views don't serve the owner's question: "how did the business do today, and how do the branches compare?"

## Decisions (from brainstorm)

1. **Superadmin-only.** Branch admins and linecooks do not get access. Rationale: cross-branch sales is owner-level information; branch teams have StoreHub BackOffice.
2. **Toggle pills** `Both · MKT · BF` in the header, defaulting to **Both**. Tapping a branch pill shows the existing single-branch view unchanged.
3. **Per-branch split lines** in the Both view under Revenue (`MKT ₱42,650 · BF ₱60,490`) and Transactions (`MKT 48 · BF 61`).
4. **Client-side combine** (Approach 1). The `/api/storehub/dashboard` route is untouched; the page fetches per-branch and merges.

## Access control

- `middleware-helpers.ts` `ROUTE_ROLES`: `/sales` minRole `admin` → `superadmin`
- `BottomNav.tsx` Sales tab: minRole `admin` → `superadmin` (renders greyed-out "soon" for lower roles, same as Production)
- `sales/page.tsx` client guard: `hasMinRole(session.role, "superadmin")`, redirect to `/stock` otherwise (same destination the middleware uses)

## UI

Header: branch label line becomes `The Black Bean · POS` in Both view (branch label in single-branch views); pill row `Both · MKT · BF` below the title, active pill dark (`#1A1A1A`), inactive white with border — matching existing tab-pill styling in the app. Date picker unchanged (`businessDatePHT()` default and max).

Both view reuses the existing card layout with combined data:
- **Revenue card**: combined total, delta vs combined prev day, split sub-line
- **Transactions / Avg Order cards**: combined tx count with split sub-line; AOV recomputed
- **Hourly Sales** ("Hourly Sales — Combined"): single gold line of per-hour sums
- **Top Items — Combined**: merged by item name, quantities summed, re-sorted, top 6
- **Payment Mix — Combined**: recomputed from weighted counts

Single-branch views: existing page rendering, unchanged.

## Data flow

On date or pill change, fetch in parallel (only what's needed):
- Both view: `(MKT, BF) × (date, prevDate)` — 4 requests
- Branch view: `(branch) × (date, prevDate)` — 2 requests

Cache responses in component state keyed by `branch__date` to avoid refetching when toggling pills within the same date.

### Merge rules (Both view)

| Metric | Rule |
|---|---|
| revenue, txCount | sum |
| aov | total revenue ÷ total tx (never average of AOVs) |
| hourly | per-hour sum of both branches' `hourly` arrays |
| topItems | merge by `name`, sum `qty`, sort desc, take 6 |
| paymentMix | per-branch `mix × txCount` → summed counts → normalize by combined tx |
| delta | combined revenue vs combined prev-day revenue |

## Errors & edge cases

- **One branch fails to load**: render the other branch's data with an inline amber notice ("MKT data unavailable — totals show BF only"). Combined cards reflect loaded data only.
- **Prev-day fetch fails**: hide the delta (existing behavior).
- **Item-name collisions across branches merge intentionally** — unified SKU naming makes cross-branch names consistent.
- **Divide-by-zero**: combined `txCount === 0` → AOV 0, payment mix all 0 (existing guards).

## Out of scope (deliberately)

- Server-side `branch=ALL` endpoint (graduate later if the view earns usage)
- GrabFood as a separate payment-mix slice (parked from the payment-method fix)
- Dual-line per-branch hourly chart (branch comparison is one pill-tap away)
- Firestore caching of summaries

## Files touched

- `src/app/sales/page.tsx` — pills, merge logic, split lines, per-branch fetch/cache
- `src/components/BottomNav.tsx` — Sales tab minRole
- `src/lib/middleware-helpers.ts` — `/sales` minRole

## Testing

- `middleware-helpers` unit tests (vitest exists): `/sales` blocked for admin/linecook, allowed for superadmin
- Merge functions extracted as pure functions in the page module and unit-tested: AOV recompute, top-item merge, payment-mix weighting, hourly sum
- Manual: production build + curl role-gate checks (no cookie → /login, admin → /stock, superadmin → 200); browser check of Both/MKT/BF pills against live data
