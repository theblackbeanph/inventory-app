# Variance Report — Design Spec
**Date:** 2026-05-03
**Status:** Approved

## Overview

Replace the Dashboard's fixed weekly stock summary with a Variance Report — an operational incident-tracking tool that lets managers review inventory variances, categorize them by cause, and dismiss them. The goal is fast and actionable: work through the Pending list, explain each variance, and move on.

---

## Location

`/dashboard` — the `ReportsContent.tsx` component is deleted and replaced by `VarianceReport.tsx`. The Dashboard page shell is unchanged.

---

## Layout

Two sections stacked vertically:

1. **Pending Explanation** (top, prominent) — variances with no explanation yet. Managers work this list first.
2. **Reviewed** (bottom, collapsed by default) — variances that have been explained. Expandable for auditing via a Show/Hide toggle. De-emphasized visually.

If Pending is empty, show a brief "All variances explained" message in its place.

---

## Date Range Controls

Displayed above the table as a filter bar:

- **Preset buttons:** `Last 7 days` | `Last 14 days` | `Last 30 days` — default is Last 7 days on mount
- **Custom range:** From / To date inputs (secondary option, same row as presets)
- Changing either preset or custom inputs re-fetches and re-renders immediately

---

## Table Columns

`Date | Item | Var % | Var (units) | Actual | Expected | Explanation`

- **Date** — the business date of the count (e.g., "May 2"). Sorted descending (most recent first) within each section.
- **Item** — item name
- **Var %** — color-coded: red (>30%), yellow (10–30%), green (<10%). Displayed as a pill badge.
- **Var (units)** — signed integer (e.g., -61, +4)
- **Actual** — counted quantity
- **Expected** — `dailyBeginning + totalIn - totalOut` for that date
- **Explanation** — dropdown (admin/superadmin) or plain dash (linecook/viewer)

A row appears only when:
- A `count`-type adjustment exists for that item on that date, AND
- `variance ≠ 0` (i.e., `actual ≠ expected`)

---

## Explanation Dropdown

Options (in order):
1. Counting error
2. Waste
3. Data entry error
4. Unknown

Behavior:
- Rendered only for `admin` and `superadmin` roles. All other roles see a plain "—" in this column.
- Selecting an option auto-saves — no confirm button. Optimistic UI: row moves to Reviewed immediately.
- In the Reviewed section, the saved value is shown as a static tag (not a dropdown).

---

## Roles & Permissions

| Role | Can view report | Can save explanation |
|------|----------------|----------------------|
| superadmin | ✅ | ✅ |
| admin | ✅ | ✅ |
| linecook | ✅ | ❌ |

---

## Data Model

### New collection: `variance_explanations`

**Document ID:** `{branch}__{department}__{itemSlug}__{date}`
(e.g., `MKT__kitchen__Smoked_Salmon__2026-05-02`)

**Fields:**
```
branch       string   — branch identifier (e.g., "MKT")
department   string   — department (e.g., "kitchen")
item         string   — item name
date         string   — business date (YYYY-MM-DD)
explanation  string   — one of: "Counting error" | "Waste" | "Data entry error" | "Unknown"
notes        string   — reserved for Phase 2 free-text notes (empty string for now)
savedBy      string   — Firebase Auth uid
savedAt      timestamp
```

### Existing collections used (read-only)
- `branch_adjustments` — source of count events and in/out/waste/sales_import for expected calculation
- `daily_beginning` — opening inventory per item per date

---

## Data Fetching

On mount and on every date range change:

1. Query `branch_adjustments` where `branch == branch`, `department == dept`, `date >= startDate`, `date <= endDate` — fetches all adjustment types in the range in one query
2. Query `variance_explanations` where `branch == branch`, `department == dept` — filter client-side by date range
3. Client-side: isolate count-type rows to get variance candidates; for each, sum in/out/waste/sales_import on the same date to compute `expected`; join with explanations to split Pending vs. Reviewed

All fetches are one-shot (`getDocs`), not real-time listeners — the report is a review tool, not a live dashboard.

---

## Export

A "Export CSV" button in the page header. The export:
- Includes all rows (Pending + Reviewed) for the current date range
- Filename: `variance-report-{startDate}-to-{endDate}.csv`
- Button label updates to reflect the active range: `Export CSV (Last 7 days)`
- Columns: Date, Item, Var %, Var (units), Actual, Expected, Explanation

---

## Visual States

- **Pending section background:** warm amber tint (`#fffbeb`) per row
- **Reviewed section:** de-emphasized, collapsed by default. Toggle button shows "Show ▾" / "Hide ▴"
- **Var % pill colors:**
  - High (>30%): red background (`#fee2e2`), red text
  - Medium (10–30%): amber background (`#fef3c7`), amber text
  - Low (<10%): green background (`#dcfce7`), green text
- **Empty Pending state:** "All caught up — no unexplained variances for this period." in muted text

---

## Phase 2 (Not in scope now)

- **Free-text notes field** — appears after selecting a dropdown reason; stored in `variance_explanations.notes`. No data migration needed; field is already in the schema.
- **Edit saved explanation** — allow admin/superadmin to change an already-saved explanation.

---

## Out of Scope

- Notifications or alerts when new variances appear
- Variance trending or analytics
- Per-item variance history drill-down
