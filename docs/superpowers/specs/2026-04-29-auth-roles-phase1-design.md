# Branch Inventory — Auth, Roles & Phase 1 Gating Design

_Date: 2026-04-29_

---

## Overview

This spec covers four interconnected changes to the branch-inventory app:

1. Replace PIN-based auth with Firebase Auth (email + password) and a role system
2. Rename "Manual Count" → "Stocktake" throughout the UI
3. Gate Transfers and Production tabs to superadmin-only during Phase 1 development
4. Pre-structure the codebase for Phase 2 (Transfers) without implementing transfer logic

These changes are a foundation layer — they do not alter any Firestore data models, collections, or inventory logic.

---

## 1. Auth System

### Approach

Replace the current PIN + localStorage system with Firebase Auth (email + password). Each user has a real Firebase Auth account. Role and branch are stored in a Firestore `users` collection, keyed by Firebase Auth UID.

### Login Flow

```
/login
  Step 1 — Choose branch: Makati | BF Homes
  Step 2 — Choose department: Kitchen | Bar | Cafe
  Step 3 — Enter email + password (Firebase Auth)
  → Session set: branch, department, role, displayName
```

Branch and department selection at steps 1–2 are UX context. The account itself is the source of truth for role and branch. Superadmin accounts have `branch: "both"` and can select either branch freely.

### Firestore — users collection

```
users/{uid}
  role:        "superadmin" | "admin" | "linecook"
  branch:      "MKT" | "BF" | "both"
  department:  "kitchen" | "bar" | "cafe" | "all"
  displayName: string   ← mirrors Firebase Auth displayName
  createdAt:   Timestamp
```

`department: "all"` is used for the superadmin account. For admin and linecook accounts, `department` restricts which department they can select at login step 2 — the login page validates that the selected department matches their account. Superadmin bypasses this check and can select any department freely.

### Role Definitions

| Role | Who | Access |
|---|---|---|
| `superadmin` | Owner (chris@theblackbean.ph) | All tabs including Transfers + Production during dev; both branches |
| `admin` | Kitchen supervisors, bar supervisors, cafe supervisors, branch managers | Full stock tab (daily view, sales sync/import, reports, manual close) + delivery receiving |
| `linecook` | Generic branch accounts (e.g. kitchen.mkt@theblackbean.ph) | Stocktake entry + delivery receiving only |

### User Accounts

Named accounts (superadmin, admin) use individual email addresses. The Firebase Auth `displayName` auto-populates `loggedBy` on all transactions — no name picker needed.

Generic linecook accounts use shared branch emails (e.g. `kitchen.mkt@theblackbean.ph`, `kitchen.bf@theblackbean.ph`). These accounts log as a branch label (e.g. "Kitchen · MKT") instead of a personal name.

**Account counts (initial setup):**
- Superadmin: 1 (owner, cross-branch)
- Kitchen admins: 3 (2 supervisors + 1 branch manager)
- Kitchen linecooks: 2 (one per branch, shared)
- Bar admins: 2 (1 supervisor per branch + 1 branch manager)
- Bar linecooks: 2 (one per branch, shared)
- Cafe admins: 5 (4 supervisors + 1 branch manager)
- Cafe linecooks: 2 (one per branch, shared)

### Removed

- `BRANCH_PINS` — deleted from `auth.ts`
- `STAFF_NAMES` — deleted from `auth.ts`
- `setStaffName()` — deleted
- "Who are you?" name selection screen — removed from department flow
- `staffName` in `StoredState` — replaced by Firebase Auth `displayName`

### auth.ts changes

`auth.ts` is updated to:
- Import Firebase Auth and expose `signInWithEmailAndPassword`, `signOut`, `onAuthStateChanged`
- Read user role/branch/displayName from `users/{uid}` after sign-in
- Expose `getSession()` returning `{ branch, department, role, displayName, uid }`
- A new `roles.ts` file holds role constants and a `hasMinRole(role, minRole)` helper

---

## 2. Rename: "Manual Count" → "Stocktake"

UI-only change. No Firestore data model changes — `countType: "manual"` remains unchanged in all existing documents and new writes.

**What changes:**
- Tab label in the stock page: "Manual Count" → "Stocktake"
- Component filename: `ManualCountTab.tsx` → `StocktakeTab.tsx` (created as part of stock page split — see Section 4)
- All user-facing strings referencing "manual count" updated to "stocktake"
- `DailyClose.countType` field value `"manual"` is **not** changed — this is a data field not a display string

---

## 3. Phase 1 Tab Gating

### Behaviour

**Line cook and admin:** Transfers and Production tabs visible in BottomNav but greyed out (muted colour, "soon" badge). `pointer-events: none` — tapping does nothing. If they navigate directly to the URL, Next.js middleware redirects them to `/stock`.

**Superadmin:** All tabs fully active. Transfers and Production pages show a "DEV — coming soon" banner inside so it's clear they are stubs, not live features.

### Implementation

**BottomNav.tsx** — each tab entry gains a `minRole` field:

```ts
{ href: "/stock",      label: "Stock",      minRole: "linecook"    }
{ href: "/transfers",  label: "Transfers",  minRole: "superadmin"  }
{ href: "/production", label: "Production", minRole: "superadmin"  }
{ href: "/history",    label: "History",    minRole: "linecook"    }
```

Tabs where `hasMinRole(session.role, tab.minRole)` is false render greyed with the "soon" badge.

**middleware.ts** — new file at project root. Reads session role and redirects `/transfers` and `/production` to `/stock` for any role below `superadmin`. Also handles redirect to `/login` when unauthenticated.

**Session cookie:** Next.js middleware runs on the edge and cannot access localStorage. After Firebase Auth sign-in, the app must write a short-lived session cookie (containing role, branch, department, displayName) that middleware can read. Firebase Admin SDK (server-side) verifies the Firebase ID token and issues the cookie on the `/api/auth/session` route. This replaces the current `localStorage`-only session entirely.

**Unlocking for Phase 2:** Change `minRole` for `/transfers` from `"superadmin"` to `"linecook"` — one-line change, gating removed for all users.

---

## 4. Code Organisation

### Stock page split

`src/app/stock/page.tsx` (~1,250 lines) is split into focused components. The page file becomes an orchestrator (~150 lines) that composes the tabs.

```
src/app/stock/
  page.tsx                ← orchestrator: session, metrics, tab state
  _components/
    DailyTab.tsx          ← past-date summary + CSV export
    StocktakeTab.tsx      ← physical count entry + review modal
    ReportsTab.tsx        ← weekly summary + CSV export
    SalesImport.tsx       ← CSV upload modal + StoreHub sync
```

Each component receives props from the orchestrator. No logic is duplicated — it is redistributed.

### Phase 2 folder pre-structure

Stub pages created now so future work has a home:

```
src/app/transfers/
  page.tsx                ← "Coming soon" placeholder (superadmin-only)
  _components/            ← empty, ready for Phase 2 components

src/app/production/
  page.tsx                ← "Coming soon" placeholder (superadmin-only)
  _components/            ← empty, ready for Phase 2 components
```

### Deleted

- `src/app/request/` — legacy pull-out requests, inactive, superseded by pull-out module
- `src/app/migrate/` — one-time Firestore migration that has already run
- `src/lib/pullout-config.ts` — hardcoded baseline quantities, replaced entirely by Phase 2 transfer logic

### Saturday cron slot updated

`vercel.json` cron for `generate-pullouts` updated from Saturday 9am to **Saturday 10am PHT** (02:00 UTC). The route becomes a stub that returns 200 with no side effects until Phase 2 logic is wired in. The cron slot is reserved so it's already scheduled when the new transfer process arrives.

---

## 5. Phase 2 Transfer — What Is Deferred

The following is explicitly out of scope for this implementation. It will be defined separately when the new pull-out process is ready:

- Pull-out form UI (what fields, what items, what quantities)
- Saturday 10am auto-submit logic — the cron submits whatever the branch has filled in; content generation is no longer from hardcoded config but from a branch-filled form
- Delivery note creation triggered by commissary approval
- Firestore security rules update for the auth gap (anonymous PIN vs Firebase Auth for shared collections)

**Clarification on cron vs client-side:** The Saturday 10am trigger remains a Vercel server-side cron — not a client-side lock. This ensures reliability regardless of whether anyone has the app open. What changes from the current flow: the cron no longer generates order content from `pullout-config.ts`; instead it submits whatever the branch has filled into their form.

---

## What Does Not Change

- All Firestore collections and document schemas
- Inventory tracking logic (`computeMetrics`, daily rollover, sales import)
- StoreHub API integration
- BF CSV/Utak import
- Daily auto-close cron (`/api/cron/rollover` at 2am PHT)
- Pull-out and delivery pages (`/pullout`, `/delivery`) — these remain unchanged in Phase 1
