# Bug Log — branch-inventory

## [FIXED] BF StoreHub sync undercounts sales — online orders excluded by API default
**Date found:** 2026-07-06 (root cause found 2026-07-07)
**Fixed:** 2026-07-07
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
**Fixed:** 2026-07-02  
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
- **`src/app/transfers/_components/OrdersContent.tsx`** (`NewOrderForm`) — auto-fill prefill ignores corrections when computing current stock for order quantity suggestions. Minor — team reviews quantities before submitting.
