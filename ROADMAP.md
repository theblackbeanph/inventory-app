# Branch Inventory — Roadmap

*Last updated: 2026-04-24*

---

## Already Shipped

- Improved unmatched POS items flow — exact name/SKU, qty undeducted, persistent warning on Daily tab after import closes

---

## Phase 1 — Cleanup

- Break up `src/app/stock/page.tsx` (1,250 lines) into component files
- Remove `/request` — legacy, superseded by pull-out module
- Remove `/migrate` — one-time Firestore migration that has already run; safe to delete

---

## Phase 2 — Data Integrity

- Add mandatory "Who are you?" screen after department selection — name stored in session, auto-populates `loggedBy` everywhere
- Split staff name list per department (kitchen sees kitchen staff, bar sees bar staff, etc.)

**Dropped:**
- ~~Per-user PINs~~ — schedule provides external accountability; mandatory name selection solves the enforcement gap without the complexity
- ~~New adjustment types (transfer, comp, staff meal)~~ — comp/QC volume is low; a note on a manual adjustment is sufficient for now

---

## Phase 3 — Smarter Reporting

- Show average daily usage on pull-out review screen: 7-day avg, last 7 days sold, suggested qty based on days until next delivery. Data is already in Firestore — just not surfaced here
- Add manual "Generate this week's pull-outs" button on Pull-Out list page as a safety valve for the Saturday cron. Idempotent — skips delivery slots that already have a PO
- Weekly variance alerts and outflow breakdown by type — lower urgency, build after the above

---

## Phase 4 — POS Mapping

Full Firestore migration is deprioritized. Revisit if any of these become true:
- Menu changes become monthly or more frequent
- The person updating mappings cannot deploy code
- A third branch or POS system is added

**In the meantime:**
- Static config updates: share the pull-out file and it gets updated in `src/lib/pullout-config.ts` directly, then deploy. Target: quarterly review based on 12 weeks of actual sales data
- Move config to Firestore if updates are needed more than once a month

---

## Phase 5 — Recipe & Cost *(do not build yet)*

Signals that it's time to revisit:
- Supervisor is adjusting the same items in the same direction every week (static baseline is wrong and they're forecasting manually)
- Variance is consistently explained by commissary over/under supply after Phase 2 noise is removed

Foundation required before building: consistent unit normalization, supplier price tracking, and clean variance data from Phase 2.
