# Bug Log — branch-inventory

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

### Not yet fixed (same root cause, different files)
- **`src/app/dashboard/_lib/variance.ts`** — `computeVarianceRows` and `computeItemSummaries` have their own adjustment loops; also ignore `type: "correction"`. Dashboard variance report still shows pre-correction END values.
- **`src/app/transfers/_components/OrdersContent.tsx`** (`NewOrderForm`) — auto-fill prefill ignores corrections when computing current stock for order quantity suggestions.
