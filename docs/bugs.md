# Bug Log — branch-inventory

## Index

| Date | Status | Title | File |
|---|---|---|---|
| 2026-07-29 | [FIXED] `09e67e7` | Rollover drops BEG for items not in partial manual stocktake | `api/cron/rollover/route.ts` |
| 2026-07-28 | [FIXED] `35907aa` | Cancel Dispute leaves DN.receivedItems stale | `transfers/_components/OrdersContent.tsx` |
| 2026-07-07 | [FIXED] `24d2136` | Dashboard payment mix always showed 100% card | `api/storehub/dashboard/route.ts` |
| 2026-07-07 | [FIXED] `6b8e810` | BF StoreHub sync undercounts sales (`includeOnline` default) | `api/storehub/*`, `lib/storehub-mapping.ts` |
| 2026-07-02 | [FIXED] `e1a67c1`, `2efbf87` | Daily/dashboard END ignores tap-to-correct adjustments | `stock/_lib/helpers.ts`, `dashboard/_lib/variance.ts` |
| 2026-07-02 | [OPEN] | NewOrderForm auto-fill ignores tap-to-correct adjustments | `transfers/_components/OrdersContent.tsx` |

## Entry template

When logging a bug, include: **Date found**, **Fixed date + commit SHA** (or **[OPEN]**), **File(s)**, **Reported by / How found**, **Symptom**, **Root cause** (including dead-end hypotheses ruled out), **Fix**, **How to verify** (concrete command or Firestore query), optional **Backfill / Watch out / Still open**. Log [OPEN] at the moment the mechanism is confirmed — don't wait for the fix.

---

## [FIXED] Rollover drops BEG for items not included in a partial manual stocktake
**Date found:** 2026-07-29
**Fixed:** 2026-07-29 (commit `09e67e7`)
**File:** `src/app/api/cron/rollover/route.ts` (manual-close branch, lines ~156)
**Reported by:** Chris — noticed blank EXP column on MKT/dining Daily tab for July 28 desserts, then mirror symptom on July 29 beers.

### Symptom
MKT / dining showed blank EXP for desserts on 2026-07-28 (BEG=—). Next day, mirror symptom on beers/water: BEG=— on 2026-07-29 → blank EXP. Only affected the dept-item combo not covered by that day's stocktake.

### Root cause
When a `daily_close` doc exists for a department, the rollover takes the "already manually closed" branch and only carries forward items listed in `existingClose.items`. If the team stocktakes a department in shifts (e.g. beers Monday, desserts Tuesday), the un-counted items silently drop their BEG the next day — no warning, no log, just "—" until the next full count. Auto-close (no manual close doc) doesn't have this problem — it builds `itemsWithData` from prior BEGs + adjustments and carries all of them.

Trace confirmed in Firestore:
- July 27 close (Kent) = beers/water only → July 28 desserts BEG dropped
- July 28 close (Kent) = 7 desserts only → July 29 beers/water BEG dropped

### Fix
In the manual-close branch, after reading `endCounts` from `existingClose.items`, iterate items with prior BEG or adjustments yesterday that weren't in the close and fill `endCounts[item] = Math.max(0, beg + inQty - outQty)`. Same fallback formula auto-close uses. Log line now reports `filled N missing items` when this triggers.

### Backfill
July 29 MKT dining beer/water BEG seeded via `scripts/_seed-mkt-dining-beg-2026-07-29.mjs` (7 docs). Historical July 28 EXP blanks were not backfilled — cosmetic only, no math consequence.

### How to verify
Query Firestore for the day after a partial stocktake and confirm every item that had prior-day activity now has a `daily_beginning` doc:
```
where("branch","==",<BRANCH>) where("department","==",<DEPT>) where("date","==",<TODAY>)
```
Doc count should equal the set of items with (yesterday's BEG ∪ yesterday's adjustments). Also inspect rollover route log for `filled N missing items` — that's the new fallback firing.

### Watch out
- The same shape could affect any dept with sub-team stocktakes (bar shifts, kitchen prep vs line).
- Fix only kicks in on the 2am PHT rollover — for a same-day fix (e.g. team notices BEG missing this morning), the seed pattern in `_seed-mkt-dining-beg-2026-07-29.mjs` is the template.

## [OPEN] NewOrderForm auto-fill ignores tap-to-correct adjustments when computing current stock
**Date found:** 2026-07-02 (identified in tap-to-correct fix's "Still open" note)
**Status:** OPEN — deferred; team reviews order quantities before submit
**File:** `src/app/transfers/_components/OrdersContent.tsx` (`NewOrderForm`, ~line 951)

### Symptom
On new-order auto-fill, the "current stock" figure that drives auto-selected quantities is computed only from `type: "count"` adjustments, ignoring `type: "correction"`. On days when a stocktake was corrected via tap-to-correct, the suggested order quantity is based on the pre-correction count.

### Root cause
Same blindness as the fixed `computeMetrics` and `computeVarianceRows` bugs — the reducer only handles `type: "count"` for `countMap`. Correction adjustments write `type: "correction"` and are silently skipped.

### Proposed fix
Add a `correctionMap` (parallel to `countMap`) and let it override count when present, mirroring the pattern in `stock/_lib/helpers.ts` `computeMetrics` (post-2026-07-02 fix).

### Impact
Low — auto-fill is a suggestion; team reviews quantities before submitting. Would matter more once auto-submit or bulk-order features arrive.

## [FIXED] Cancel Dispute leaves DN.receivedItems stale (PO shows 0 while stock has +N)
**Date found:** 2026-07-28
**Fixed:** 2026-07-28 (commit `35907aa`)
**File:** `src/app/transfers/_components/OrdersContent.tsx` (`cancelDispute`)

### Symptom
PO-26-0726-BF001 / DN-26-0727-BF002 showed Prosciutto `Dispatched: 10, Received: 0` (status Received), but BF/Kitchen Daily Inventory showed Prosciutto with +10 in the Delivery column and branchStock incremented by 10. Real-world: team marked Prosciutto missing on receipt, then found it later and tapped "Cancel Dispute".

### Root cause
`cancelDispute()` correctly wrote a `branch_adjustments {type:"in", note:"Dispute cancelled · <poRef>"}` doc and incremented `branchStock`, but only updated the delivery note's `status` field. `receivedItems[]` was left with the original (wrong) `receivedQty: 0` values, so every downstream reader of the DN (detail view, history) permanently shows the pre-dispute quantities.

### Fix
`cancelDispute` now writes `receivedItems` alongside `status` in the same batch, setting `receivedQty = dispatchedQty` for every item (matches the semantics of "accept dispatched quantities"). Preserves any per-item `note`.

### Note
Historical DNs already in `RECEIVED` state from prior cancelled disputes will still show the stale `receivedQty`. No backfill written — Prosciutto on DN-26-0727-BF002 will remain visually wrong until manually corrected in Firestore, if desired.

## [FIXED] Dashboard payment mix always showed 100% card
**Date found:** 2026-07-07
**Fixed:** 2026-07-07 (commit `24d2136`)
**File:** `src/app/api/storehub/dashboard/route.ts`

### Symptom
Dashboard payment mix bucketed every transaction as "card".

### Root cause
The route guessed transaction-level field names (`tx.paymentMethod` / `paymentType` / `payment`) that don't exist. Per the StoreHub API doc (p.20), payment method lives in the `payments[]` array as `payments[].paymentMethod`. The empty string defaulted every tx to "card" in `normalizePayment`. Also removed nonexistent `totalAmount`/`grandTotal` amount fallbacks (`total` is the documented field).

### Note
GrabFood transactions currently normalize to "card" — if a separate GrabFood slice is wanted, extend `normalizePayment` and the paymentMix buckets. Real paymentMethod values seen: "Cash", "CreditCard", "Gcash / QRPH", "Online / Maya QR", "GrabFood".

## [FIXED] BF StoreHub sync undercounts sales — online orders excluded by API default
**Date found:** 2026-07-06 (root cause found 2026-07-07)
**Fixed:** 2026-07-07 (commit `6b8e810`)
**Files:** `src/app/api/storehub/sales/route.ts`, `src/app/api/cron/storehub-sync/route.ts`, `src/app/api/storehub/dashboard/route.ts`, `src/lib/storehub-mapping.ts`

### Symptom
BF Homes daily OUT quantities were lower than the StoreHub "Sales by SKU" report for several items (e.g. 2026-07-07: Aburi Salmon-don 3 vs 5, Adobo Flakes 1 vs 4, Clam Chowder 0 vs 4). Other items matched exactly. MKT was unaffected.

### Root cause
StoreHub's `GET /transactions` excludes online orders (GrabFood, Beep, FoodPanda, ShopeeFood) **by default** — the `includeOnline=true` query parameter must be passed explicitly (API doc p.14). BF Homes takes GrabFood orders; Makati doesn't, which is why only BF was affected. On 2026-07-07 the default query returned 42 transactions vs 66 with `includeOnline=true` (24 GRABFOOD). With the param added, all 8 spot-checked SKUs matched the POS report exactly.

Dead-end hypotheses ruled out during investigation: timezone window (from/to are PHT-based — confirmed), pagination (`page` param is ignored), result cap (wide multi-day ranges cap at exactly 100 results — real, but not the cause here; doc claims up to 5000).

### Secondary bug
`BF_MAPPING` had no entry for Clam Chowder (`APP01`), so even captured Clam Chowder sales were dropped as unmatched. Added `{ item: "Clam Chowder", linkedSkus: ["APP01"] }`.

### Fix
Appended `&includeOnline=true` to all three `/transactions` fetch sites (manual sales sync, nightly cron sync, dashboard). Removed the temporary `_debug` probes (wide-range and page=2 fetches) from the sales route.

### Watch out
- Multi-day `/transactions` queries silently truncate at 100 results — never trust a wide-range query for reconciliation.
- StoreHub transaction timestamp field is `transactionTime` (UTC), not `createdTime`.

## [FIXED] Daily tab END column ignores tap-to-correct adjustments
**Date found:** 2026-07-02  
**Fixed:** 2026-07-02 (commits `e1a67c1` — computeMetrics, `2efbf87` — dashboard variance)
**File:** `src/app/stock/_lib/helpers.ts` → `computeMetrics`

### Symptom
After a team member used tap-to-correct on a confirmed stocktake, the "Count Confirmed ✓" banner appeared and the next day's BEG column reflected the corrected value — but the END column for the corrected day still showed the original pre-correction stocktake count. Caused an irreconcilable gap: July 1 END ≠ July 2 BEG on any audit.

### Root cause
`computeMetrics` only processed `type: "count"` adjustments for `endCount`. Tap-to-correct writes a separate `type: "correction"` adjustment doc with a Firestore string auto-ID. These were never read, so corrections were invisible to the Daily tab END column, the VAR column, CSV exports, and low-stock/OOS alerts.

### Fix
Added a `latestCorrection` tracker (separate from `latestCount`) in `computeMetrics`. Corrections are applied after counts so they always win. Firestore auto-IDs are compared lexicographically via `String(adj.id)` — they're roughly time-ordered, so the latest correction wins in multi-correction edge cases.

### Also fixed (2026-07-02)
- **`src/app/dashboard/_lib/variance.ts`** — `computeVarianceRows` and `computeItemSummaries` had the same blind spot. Both now track `type: "correction"` and use corrections over counts. Dashboard END values, period variance, status, trend, and CSV exports are now correct.

### Still open
- **`src/app/transfers/_components/OrdersContent.tsx`** (`NewOrderForm`) — promoted to its own [OPEN] entry above.
