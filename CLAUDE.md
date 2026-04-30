@AGENTS.md
## App Context

My current app state, architecture, and feature tracker are in Notion.
Read this page before starting any task:
https://www.notion.so/Inventory-App-Context-34cd0e7b27b6807d8866e68d368c8ed6

After any session where a feature is completed, a bug is fixed, or the architecture changes — update the Notion context page:
- Add a bullet under "Recent Changes" with today's date and what was built
- Move features from "In Progress" → "Live" if applicable
- Add any new technical debt to "Known Issues"
- Remove resolved items from "Open Questions"

---

## Key Architectural Decisions

### Build Phase Priority (solo developer — sequential)
1. **Phase 1 — MVP: Inventory only** — currently live (stock view, adjustments, StoreHub/CSV import, daily close/cron, dashboard)
2. **Phase 2 — Transfers integration** — NEXT PRIORITY (branch pull-out requests ↔ commissary Orders tab)
3. **Phase 3 — Production** (supplier deliveries, portioning — built but out of MVP scope)
4. **Phase 4 — Food Cost / GP Analysis** (depends on Recipe Database being built first)

### Sales Import — Both Branches Are LIVE
- **MKT**: StoreHub API (`/api/storehub/sales` + `/api/storehub/sync`)
- **BF**: CSV upload from **Utak POS** — ALREADY FULLY BUILT, do not re-implement
  - `src/lib/csv-mapping.ts` — `parseSalesCSV()` + `applyCsvMapping()` — 31 items mapped
  - `src/app/stock/_components/CSVImportModal.tsx` — full UI modal
  - Gated by `BRANCH_POS_TYPE.BF === "csv"` in `src/lib/auth.ts` ✅

### Phase 2 Transfer Flow Design (agreed 2026-04-28)
- **Branch-only initiation**: all pull-out requests MUST come from the branch (`pull_outs` collection)
- **Commissary fulfills only**: they review, confirm, dispatch — they cannot initiate sends
- **On Phase 2 launch**: the commissary app's manual `pullOuts` creation flow will be DISABLED
- **Discrepancy handling**: commissary adjusts their inventory + notifies branch; branch re-requests if replacement needed; no auto-replacement sends from commissary
- **Cutover strategy**: 1-week shadow mode (Orders tab visible but old flow still active), then hard disable

### Auth — Resolved 2026-04-29
- Branch now uses: **email/password Firebase Auth** — role system (superadmin/admin/linecook), `__identity` cookie, route-protection middleware
- Commissary uses: **email/password Firebase Auth**
- Firestore security rules updated (`firestore.rules`) — branch collections open to any authenticated user, commissary writes restricted to known emails
- Phase 2 can proceed: both apps use proper Firebase Auth, shared collections are accessible to both
- **`auth` is exported from `src/lib/firebase.ts`** — any client component that writes to Firestore must `await auth.authStateReady()` before the write, otherwise Firebase Auth may not have restored its session yet and the write will be rejected with PERMISSION_DENIED

### Recipe Database (future 3rd app — not yet built)
- Will share the same Firebase project (`commissary-dashboard-ccd7c`)
- First step before building: migrate hardcoded `RECIPES` array from commissary `src/data.ts` → Firestore `recipes` collection
- Will become source of truth for recipes, ingredient ratios, costing data
- Feeds cost-per-portion data to Phase 4 GP analysis in this app