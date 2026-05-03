# Auth, Roles & Phase 1 Gating — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PIN-based auth with Firebase Auth (email + password), add superadmin/admin/linecook roles, gate Transfers and Production to superadmin during Phase 1, and rename "Manual Count" to "Stocktake".

**Architecture:** Firebase Auth handles identity; a Firestore `users` collection stores role/branch/department. A server-side API route (`/api/auth/session`) exchanges the Firebase ID token for two cookies: `__session` (httpOnly Firebase session cookie, for server verification) and `__identity` (non-httpOnly JSON cookie with role/branch/dept/displayName, readable by middleware and client JS). Next.js middleware enforces route-level access control by reading `__identity`.

**Tech Stack:** Next.js 16 App Router · Firebase Client SDK v12 · firebase-admin · Vitest · TypeScript

---

## File Map

### Created
- `src/lib/roles.ts` — role constants, ordering, `hasMinRole()` helper
- `src/lib/middleware-helpers.ts` — pure `getRedirectPath()` function (testable without Next.js)
- `src/lib/firebase-admin.ts` — Firebase Admin SDK init (server-only)
- `src/app/api/auth/session/route.ts` — POST (issue cookies) + DELETE (clear cookies)
- `middleware.ts` — route protection at project root
- `src/lib/vitest.setup.ts` — Vitest setup file
- `vitest.config.ts` — Vitest config

### Modified
- `src/lib/types.ts` — update `AuthState`, add `UserDoc`
- `src/lib/auth.ts` — replace PIN system with Firebase Auth helpers
- `src/lib/firebase.ts` — remove anonymous auth, export `app`
- `src/app/login/page.tsx` — 3-step flow: branch → dept → email + password
- `src/app/department/page.tsx` — redirect to `/login` (no longer needed)
- `src/components/BottomNav.tsx` — add `minRole` gating + "soon" badge
- `src/app/stock/page.tsx` — `countedBy` from `displayName`, remove `STAFF_NAMES` import
- `src/app/stock/_components/ManualCountContent.tsx` → renamed to `StocktakeContent.tsx`
- `src/app/stock/_components/ManualCountCompleted.tsx` → renamed to `StocktakeCompleted.tsx`
- `vercel.json` — update `generate-pullouts` cron to `0 2 * * 6` (10am PHT)
- `src/app/api/cron/generate-pullouts/route.ts` — stub (no side effects until Phase 2)
- `.gitignore` — add `.superpowers/`
- `package.json` — add firebase-admin, vitest, @vitest/ui, @testing-library/react, jsdom
- `.env.local` — add Firebase Admin env vars

### Deleted
- `src/lib/pullout-config.ts`

---

## Task 1: Pre-flight cleanup

**Files:**
- Modify: `vercel.json`
- Modify: `src/app/api/cron/generate-pullouts/route.ts`
- Modify: `.gitignore`
- Delete: `src/lib/pullout-config.ts`

- [ ] **Step 1: Add `.superpowers/` to `.gitignore`**

Open `.gitignore` and add after the `# production` section:
```
# brainstorming artifacts
.superpowers/
```

- [ ] **Step 2: Update cron schedule to Saturday 10am PHT**

In `vercel.json`, change the `generate-pullouts` schedule from `"0 12 * * 6"` to `"0 2 * * 6"` (02:00 UTC = 10:00 PHT):
```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "installCommand": "npm install",
  "crons": [
    {
      "path": "/api/cron/generate-pullouts",
      "schedule": "0 2 * * 6"
    },
    {
      "path": "/api/cron/rollover",
      "schedule": "0 18 * * *"
    }
  ]
}
```

- [ ] **Step 3: Stub the generate-pullouts route**

Replace the entire contents of `src/app/api/cron/generate-pullouts/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";

// Phase 2: transfer logic not yet implemented.
// Cron slot reserved at Saturday 10am PHT (0 2 * * 6 UTC).
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, message: "Phase 2 transfer logic not yet implemented" });
}
```

- [ ] **Step 4: Delete `pullout-config.ts`**

```bash
rm src/lib/pullout-config.ts
```

Then check for any imports of it:
```bash
grep -r "pullout-config" src/
```

Remove any import lines found (the generate-pullouts route was the only consumer; it's now stubbed).

- [ ] **Step 5: Commit**

```bash
git add vercel.json .gitignore src/app/api/cron/generate-pullouts/route.ts
git rm src/lib/pullout-config.ts
git commit -m "chore: stub generate-pullouts cron, delete pullout-config, update schedule to 10am PHT"
```

---

## Task 2: Vitest setup + role system

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/vitest.setup.ts`
- Create: `src/lib/roles.ts`
- Create: `src/lib/roles.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Install test dependencies**

```bash
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Create `vitest.config.ts` at project root**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/lib/vitest.setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: Create `src/lib/vitest.setup.ts`**

```ts
import "@testing-library/jest-dom";
```

- [ ] **Step 4: Add test script to `package.json`**

In the `"scripts"` section, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write the failing test for `roles.ts`**

Create `src/lib/roles.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { hasMinRole, ROLE_ORDER } from "./roles";

describe("hasMinRole", () => {
  it("linecook satisfies linecook", () => {
    expect(hasMinRole("linecook", "linecook")).toBe(true);
  });
  it("linecook does not satisfy admin", () => {
    expect(hasMinRole("linecook", "admin")).toBe(false);
  });
  it("admin satisfies linecook", () => {
    expect(hasMinRole("admin", "linecook")).toBe(true);
  });
  it("admin satisfies admin", () => {
    expect(hasMinRole("admin", "admin")).toBe(true);
  });
  it("admin does not satisfy superadmin", () => {
    expect(hasMinRole("admin", "superadmin")).toBe(false);
  });
  it("superadmin satisfies all roles", () => {
    for (const role of ROLE_ORDER) {
      expect(hasMinRole("superadmin", role)).toBe(true);
    }
  });
});
```

- [ ] **Step 6: Run test — expect FAIL**

```bash
npm test
```

Expected: FAIL — `Cannot find module './roles'`

- [ ] **Step 7: Implement `src/lib/roles.ts`**

```ts
export const ROLE_ORDER = ["linecook", "admin", "superadmin"] as const;
export type Role = (typeof ROLE_ORDER)[number];

export function hasMinRole(userRole: Role, minRole: Role): boolean {
  return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(minRole);
}
```

- [ ] **Step 8: Run test — expect PASS**

```bash
npm test
```

Expected: all 6 tests PASS

- [ ] **Step 9: Commit**

```bash
git add vitest.config.ts src/lib/vitest.setup.ts src/lib/roles.ts src/lib/roles.test.ts package.json package-lock.json
git commit -m "feat: add role system with hasMinRole helper + vitest setup"
```

---

## Task 3: Update `types.ts`

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Replace `AuthState` and add `UserDoc`**

In `src/lib/types.ts`, replace the `AuthState` interface:
```ts
// REMOVE:
export interface AuthState {
  branch: Branch;
  department: Department;
  staffName: string;
  authedAt: number;
}
```

Replace with:
```ts
import type { Role } from "./roles";

export interface AuthState {
  branch: Branch;
  department: Department;
  displayName: string;
  role: Role;
  uid: string;
}

export interface UserDoc {
  role: Role;
  branch: Branch | "both";
  department: Department | "all";
  displayName: string;
}
```

Note: `import type { Role }` must be added at the top of the file. Since `types.ts` currently has no imports, add it as the first line.

- [ ] **Step 2: Verify the build still compiles**

```bash
npm run build
```

Expected: TypeScript errors for anything that references the old `staffName` field — note them, they will be fixed in Tasks 6–8.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: update AuthState type — replace staffName with displayName/role/uid"
```

---

## Task 4: Firebase Admin SDK

**Files:**
- Modify: `package.json`
- Create: `src/lib/firebase-admin.ts`
- Modify: `.env.local`

- [ ] **Step 1: Install firebase-admin**

```bash
npm install firebase-admin
```

- [ ] **Step 2: Add env vars to `.env.local`**

Add these three variables (values from Firebase Console → Project Settings → Service Accounts → Generate new private key):
```
FIREBASE_ADMIN_PROJECT_ID=commissary-dashboard-ccd7c
FIREBASE_ADMIN_CLIENT_EMAIL=<paste from downloaded JSON>
FIREBASE_ADMIN_PRIVATE_KEY="<paste from downloaded JSON — keep the quotes, includes \n newlines>"
```

To get these values:
1. Go to Firebase Console → `commissary-dashboard-ccd7c` project
2. Project Settings → Service Accounts
3. Click "Generate new private key" → download JSON
4. Copy `project_id`, `client_email`, `private_key` from the downloaded JSON

- [ ] **Step 3: Create `src/lib/firebase-admin.ts`**

```ts
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const adminApp =
  getApps().find((a) => a.name === "admin") ??
  initializeApp(
    {
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      }),
    },
    "admin"
  );

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
```

- [ ] **Step 4: Verify it imports without error**

```bash
npm run build
```

Expected: No new errors from `firebase-admin.ts`. If you see "Module not found: firebase-admin", run `npm install` again.

- [ ] **Step 5: Commit**

```bash
git add src/lib/firebase-admin.ts package.json package-lock.json
git commit -m "feat: add Firebase Admin SDK init"
```

Note: Do NOT commit `.env.local` — it contains secrets and is already in `.gitignore`.

---

## Task 5: Session cookie API route

**Files:**
- Create: `src/app/api/auth/session/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/auth/session/route.ts`:
```ts
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { cookies } from "next/headers";
import type { UserDoc, AuthState } from "@/lib/types";
import type { Branch, Department } from "@/lib/types";

// Must use Node.js runtime — firebase-admin does not support Edge
export const runtime = "nodejs";

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const { idToken, selectedBranch, selectedDept } = await request.json() as {
      idToken: string;
      selectedBranch: Branch;
      selectedDept: Department;
    };

    // Verify the Firebase ID token
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    // Fetch user doc from Firestore
    const userSnap = await adminDb.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      return Response.json({ error: "No user record found. Contact your admin." }, { status: 403 });
    }
    const userData = userSnap.data() as UserDoc;

    // Validate selected branch + dept against account permissions
    const branchOk = userData.branch === "both" || userData.branch === selectedBranch;
    const deptOk   = userData.department === "all" || userData.department === selectedDept;
    if (!branchOk) return Response.json({ error: `This account is not authorized for ${selectedBranch}.` }, { status: 403 });
    if (!deptOk)   return Response.json({ error: `This account is not authorized for ${selectedDept}.` }, { status: 403 });

    // Create a Firebase session cookie (survives token refresh)
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: FIVE_DAYS_MS,
    });

    // Resolve "both"/"all" → selected concrete values so AuthState always has Branch/Department
    const identity: AuthState = {
      role:        userData.role,
      branch:      selectedBranch,
      department:  selectedDept,
      displayName: userData.displayName,
      uid,
    };

    const cookieStore = await cookies();
    const cookieOpts = {
      maxAge: FIVE_DAYS_MS / 1000,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax" as const,
    };

    // __session — httpOnly, verified by Admin SDK on sensitive API routes
    cookieStore.set("__session", sessionCookie, { ...cookieOpts, httpOnly: true });

    // __identity — NOT httpOnly, readable by client JS + middleware for routing
    cookieStore.set("__identity", JSON.stringify(identity), { ...cookieOpts, httpOnly: false });

    return Response.json({ ok: true, identity });
  } catch (err) {
    console.error("Session creation failed:", err);
    return Response.json({ error: "Authentication failed" }, { status: 401 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("__session");
  cookieStore.delete("__identity");
  return Response.json({ ok: true });
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run build
```

Expected: No errors from the new route. If you see a type error on `cookies()`, check the Next.js 16 docs in `node_modules/next/dist/docs/` — the `await cookies()` pattern is the App Router standard.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/session/route.ts
git commit -m "feat: add session cookie API route (POST issue / DELETE clear)"
```

---

## Task 6: Rewrite `firebase.ts` and `auth.ts`

**Files:**
- Modify: `src/lib/firebase.ts`
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Update `firebase.ts` — remove anonymous auth, export `app`**

Replace the `signInAnonymously` call and add `app` export. The file becomes:
```ts
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  writeBatch,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBLBVqOwq6PRqNJJIQHlnsPR232Tu3ZV2s",
  authDomain: "commissary-dashboard-ccd7c.firebaseapp.com",
  projectId: "commissary-dashboard-ccd7c",
  storageBucket: "commissary-dashboard-ccd7c.firebasestorage.app",
  messagingSenderId: "430542841830",
  appId: "1:430542841830:web:06014985cd9e8e1c9b5827",
};

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const COLS = {
  branchStock:        "branch_stock",
  adjustments:        "branch_adjustments",
  pulloutReqs:        "pullout_requests",
  dailyBeginning:     "daily_beginning",
  dailyClose:         "daily_close",
  pullOuts:           "pull_outs",
  deliveryNotes:      "delivery_notes",
  invEntries:         "invEntries",
  supplierDeliveries: "supplier_deliveries",
  portioningRuns:     "portioning_runs",
  storehubUnmatched:  "storehub_unmatched",
  users:              "users",
} as const;

export async function saveDoc(col: string, item: Record<string, unknown>) {
  const ref = doc(db, col, String(item.id));
  await setDoc(ref, item);
}

export async function saveDocById(col: string, id: string, data: Record<string, unknown>) {
  const ref = doc(db, col, id);
  await setDoc(ref, data, { merge: true });
}

export async function saveBatch(col: string, items: Record<string, unknown>[]) {
  const chunks: Record<string, unknown>[][] = [];
  for (let i = 0; i < items.length; i += 400) chunks.push(items.slice(i, i + 400));
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const item of chunk) {
      const ref = doc(db, col, String(item.id));
      batch.set(ref, item);
    }
    await batch.commit();
  }
}

export {
  collection, doc, onSnapshot, setDoc, getDocs,
  query, where, orderBy, writeBatch,
};
```

- [ ] **Step 2: Rewrite `auth.ts`**

Replace the entire file:
```ts
import { getAuth, signInWithEmailAndPassword, signOut as fbSignOut } from "firebase/auth";
import { app } from "@/lib/firebase";
import type { Branch, Department, AuthState } from "@/lib/types";
import type { PosType } from "@/lib/types";

export const BRANCH_LABELS: Record<Branch, string> = {
  MKT: "Makati",
  BF:  "BF Homes",
};

export const DEPARTMENT_LABELS: Record<Department, string> = {
  kitchen: "Kitchen",
  bar:     "Bar",
  cafe:    "Cafe",
};

export const BRANCH_POS_TYPE: Record<Branch, PosType> = {
  MKT: "storehub",
  BF:  "csv",
};

// ── Cookie helpers ────────────────────────────────────────────────────────────

function readIdentityCookie(): AuthState | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)__identity=([^;]+)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1])) as AuthState;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getSession(): AuthState | null {
  return readIdentityCookie();
}

export async function signIn(
  email: string,
  password: string,
  selectedBranch: Branch,
  selectedDept: Department
): Promise<AuthState> {
  const auth = getAuth(app);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const idToken = await cred.user.getIdToken();

  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, selectedBranch, selectedDept }),
  });

  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error(error);
  }

  const { identity } = await res.json();
  return identity as AuthState;
}

export async function logout(): Promise<void> {
  const auth = getAuth(app);
  await Promise.all([
    fbSignOut(auth),
    fetch("/api/auth/session", { method: "DELETE" }),
  ]);
}
```

- [ ] **Step 3: Run the build and note any TypeScript errors**

```bash
npm run build 2>&1 | grep "error TS"
```

Expected: errors referencing `staffName` in `stock/page.tsx`, `department/page.tsx`, or other callers. These are fixed in Tasks 7–8.

- [ ] **Step 4: Commit**

```bash
git add src/lib/firebase.ts src/lib/auth.ts
git commit -m "feat: rewrite auth.ts with Firebase Auth + session cookie reading"
```

---

## Task 7: Rewrite the login page

**Files:**
- Modify: `src/app/login/page.tsx`

The new flow is one page with three visual steps: branch selection → department selection → email + password form.

- [ ] **Step 1: Replace `src/app/login/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, BRANCH_LABELS, DEPARTMENT_LABELS } from "@/lib/auth";
import type { Branch, Department } from "@/lib/types";

type Step = "branch" | "dept" | "email";
const BRANCHES: Branch[] = ["MKT", "BF"];
const DEPARTMENTS: { id: Department; desc: string }[] = [
  { id: "kitchen", desc: "Daily food inventory" },
  { id: "bar",     desc: "Daily bar inventory" },
  { id: "cafe",    desc: "Monthly cafe stock" },
];

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("branch");
  const [branch, setBranch] = useState<Branch>("MKT");
  const [department, setDepartment] = useState<Department | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickBranch(b: Branch) {
    setBranch(b);
    setStep("dept");
  }

  function pickDept(d: Department) {
    setDepartment(d);
    setStep("email");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!department) return;
    setLoading(true);
    setError(null);
    try {
      // Branch/dept validation happens server-side in /api/auth/session
      await signIn(email, password, branch, department);
      router.replace("/stock");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Check your email and password.");
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "var(--bg)", padding: "24px",
    }}>
      <div style={{ marginBottom: 48, textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.12em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
          The Black Bean
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>Branch Inventory</div>
      </div>

      {/* ── Step 1: Branch ── */}
      {step === "branch" && (
        <div style={{ width: "100%", maxWidth: 320 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16, textAlign: "center" }}>
            Select Branch
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {BRANCHES.map(b => (
              <button key={b} onClick={() => pickBranch(b)} style={{
                padding: "20px 24px", borderRadius: 16, border: "1.5px solid var(--border)",
                background: "#FFFFFF", cursor: "pointer", textAlign: "left",
                fontWeight: 700, fontSize: 17, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}>
                {BRANCH_LABELS[b]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 2: Department ── */}
      {step === "dept" && (
        <div style={{ width: "100%", maxWidth: 320 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16, textAlign: "center" }}>
            {BRANCH_LABELS[branch]} · Select Department
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {DEPARTMENTS.map(d => (
              <button key={d.id} onClick={() => pickDept(d.id)} style={{
                padding: "20px 24px", borderRadius: 16, border: "1.5px solid var(--border)",
                background: "#FFFFFF", cursor: "pointer", textAlign: "left",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{DEPARTMENT_LABELS[d.id]}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 3 }}>{d.desc}</div>
              </button>
            ))}
          </div>
          <button onClick={() => setStep("branch")} style={{ marginTop: 24, background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, padding: "4px 8px" }}>
            ← Back
          </button>
        </div>
      )}

      {/* ── Step 3: Email + Password ── */}
      {step === "email" && department && (
        <div style={{ width: "100%", maxWidth: 320 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 24, textAlign: "center" }}>
            {BRANCH_LABELS[branch]} · {DEPARTMENT_LABELS[department]}
          </div>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              style={{
                padding: "14px 16px", borderRadius: 12, border: "1.5px solid var(--border)",
                fontSize: 15, background: "#FFFFFF", outline: "none",
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                padding: "14px 16px", borderRadius: 12, border: "1.5px solid var(--border)",
                fontSize: 15, background: "#FFFFFF", outline: "none",
              }}
            />
            {error && (
              <div style={{ color: "#DC2626", fontSize: 13, fontWeight: 500 }}>{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 8, padding: "14px", borderRadius: 12, border: "none",
                background: loading ? "#9CA3AF" : "#1A1A1A", color: "#FFFFFF",
                fontWeight: 600, fontSize: 15, cursor: loading ? "default" : "pointer",
              }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
          <button onClick={() => setStep("dept")} style={{ marginTop: 20, background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, padding: "4px 8px" }}>
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: Compiles cleanly (login page no longer references removed PIN exports).

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat: rewrite login page — branch → dept → email + password flow"
```

---

## Task 8: Remove `/department` page

**Files:**
- Modify: `src/app/department/page.tsx`

The department page is no longer needed (branch + dept selection moved to login). Replace it with a redirect so any stale links don't 404.

- [ ] **Step 1: Replace `src/app/department/page.tsx` with a redirect**

```tsx
import { redirect } from "next/navigation";

export default function DepartmentPage() {
  redirect("/login");
}
```

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/department/page.tsx
git commit -m "chore: redirect /department to /login (dept selection moved to login flow)"
```

---

## Task 9: `middleware.ts`

**Files:**
- Create: `middleware.ts` at project root

- [ ] **Step 1: Write the failing middleware test**

Create `src/lib/middleware.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getRedirectPath } from "./middleware-helpers";

describe("getRedirectPath", () => {
  it("redirects unauthenticated user on any protected path", () => {
    expect(getRedirectPath(null, "/stock")).toBe("/login");
  });
  it("allows linecook to access /stock", () => {
    expect(getRedirectPath({ role: "linecook" }, "/stock")).toBeNull();
  });
  it("redirects linecook from /transfers to /stock", () => {
    expect(getRedirectPath({ role: "linecook" }, "/transfers")).toBe("/stock");
  });
  it("redirects admin from /production to /stock", () => {
    expect(getRedirectPath({ role: "admin" }, "/production")).toBe("/stock");
  });
  it("allows superadmin to access /transfers", () => {
    expect(getRedirectPath({ role: "superadmin" }, "/transfers")).toBeNull();
  });
  it("allows superadmin to access /production", () => {
    expect(getRedirectPath({ role: "superadmin" }, "/production")).toBeNull();
  });
  it("does not redirect /login (public path)", () => {
    expect(getRedirectPath(null, "/login")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test
```

Expected: FAIL — `Cannot find module './middleware-helpers'`

- [ ] **Step 3: Create `src/lib/middleware-helpers.ts`**

```ts
import type { Role } from "./roles";
import { hasMinRole } from "./roles";

interface MinimalSession {
  role: Role;
}

const PUBLIC_PATHS = ["/login"];

const ROUTE_ROLES: { prefix: string; minRole: Role }[] = [
  { prefix: "/transfers",  minRole: "superadmin" },
  { prefix: "/production", minRole: "superadmin" },
  { prefix: "/stock",      minRole: "linecook"   },
  { prefix: "/history",    minRole: "linecook"   },
  { prefix: "/pullout",    minRole: "linecook"   },
  { prefix: "/delivery",   minRole: "linecook"   },
  { prefix: "/dashboard",  minRole: "linecook"   },
];

export function getRedirectPath(
  session: MinimalSession | null,
  pathname: string
): string | null {
  // Public paths never redirect
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return null;

  // No session → go to login
  if (!session) return "/login";

  // Check route-level role requirement
  const route = ROUTE_ROLES.find((r) => pathname.startsWith(r.prefix));
  if (route && !hasMinRole(session.role, route.minRole)) return "/stock";

  return null;
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test
```

Expected: all 7 tests PASS

- [ ] **Step 5: Create `middleware.ts` at project root**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getRedirectPath } from "@/lib/middleware-helpers";

export function middleware(request: NextRequest) {
  const identityCookie = request.cookies.get("__identity")?.value;

  let session: { role: import("@/lib/roles").Role } | null = null;
  if (identityCookie) {
    try {
      session = JSON.parse(decodeURIComponent(identityCookie));
    } catch {
      // malformed cookie — treat as unauthenticated
    }
  }

  const redirectPath = getRedirectPath(session, request.nextUrl.pathname);
  if (redirectPath) {
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
```

- [ ] **Step 6: Run build**

```bash
npm run build
```

Expected: Compiles cleanly.

- [ ] **Step 7: Commit**

```bash
git add middleware.ts src/lib/middleware-helpers.ts src/lib/middleware.test.ts
git commit -m "feat: add route-protection middleware + middleware-helpers with tests"
```

---

## Task 10: BottomNav role gating

**Files:**
- Modify: `src/components/BottomNav.tsx`

- [ ] **Step 1: Replace `BottomNav.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hasMinRole } from "@/lib/roles";
import type { Role } from "@/lib/roles";

const ALL_TABS: { href: string; icon: React.FC<IconProps>; label: string; minRole: Role }[] = [
  { href: "/stock",      icon: StockIcon,      label: "Stock",      minRole: "linecook"   },
  { href: "/transfers",  icon: TransfersIcon,  label: "Transfers",  minRole: "superadmin" },
  { href: "/production", icon: ProductionIcon, label: "Production", minRole: "superadmin" },
  { href: "/dashboard",  icon: DashboardIcon,  label: "Dashboard",  minRole: "linecook"   },
];

interface IconProps { size: number; active: boolean }

export default function BottomNav() {
  const path = usePathname();
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    const session = getSession();
    if (session) setRole(session.role);
  }, []);

  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      height: "var(--nav-h)", background: "#FFFFFF",
      borderTop: "1px solid var(--border)",
      display: "flex", alignItems: "stretch",
      paddingBottom: "env(safe-area-inset-bottom)",
      zIndex: 50,
    }}>
      {ALL_TABS.map(({ href, icon: Icon, label, minRole }) => {
        const active = path.startsWith(href);
        const allowed = role !== null && hasMinRole(role, minRole);

        if (!allowed) {
          return (
            <div key={href} style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 3,
              color: "#D1D5DB", fontSize: 10, position: "relative",
              userSelect: "none",
            }}>
              <Icon size={21} active={false} />
              {label}
              <span style={{
                position: "absolute", top: 6, right: "calc(50% - 20px)",
                fontSize: 8, fontWeight: 600, background: "#F3F4F6",
                color: "#9CA3AF", borderRadius: 3, padding: "1px 4px",
                textTransform: "uppercase", letterSpacing: "0.04em",
              }}>
                soon
              </span>
            </div>
          );
        }

        return (
          <Link key={href} href={href} style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 3,
            textDecoration: "none",
            color: active ? "#1A1A1A" : "#9CA3AF",
            fontWeight: active ? 600 : 400, fontSize: 10,
            transition: "color 0.15s",
          }}>
            <Icon size={21} active={active} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function StockIcon({ size, active }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <rect x="2" y="10" width="20" height="5" rx="1" />
      <rect x="2" y="17" width="20" height="4" rx="1" />
    </svg>
  );
}

function TransfersIcon({ size, active }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12H19M19 12l-4-4M19 12l-4 4" />
      <path d="M19 6H5M5 6l4-4M5 6l4 4" />
    </svg>
  );
}

function ProductionIcon({ size, active }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h20" />
      <path d="M5 20V8l7-6 7 6v12" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function DashboardIcon({ size, active }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
```

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: Compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/components/BottomNav.tsx
git commit -m "feat: BottomNav role gating — superadmin-only tabs show 'soon' badge"
```

---

## Task 11: Fix `stock/page.tsx` + rename ManualCount → Stocktake

**Files:**
- Modify: `src/app/stock/page.tsx`
- Rename: `src/app/stock/_components/ManualCountContent.tsx` → `StocktakeContent.tsx`
- Rename: `src/app/stock/_components/ManualCountCompleted.tsx` → `StocktakeCompleted.tsx`

- [ ] **Step 1: Rename the component files**

```bash
mv src/app/stock/_components/ManualCountContent.tsx src/app/stock/_components/StocktakeContent.tsx
mv src/app/stock/_components/ManualCountCompleted.tsx src/app/stock/_components/StocktakeCompleted.tsx
```

- [ ] **Step 2: Update the export names inside each file**

In `StocktakeContent.tsx`, rename the exported function from `ManualCountContent` to `StocktakeContent`:
```bash
# Verify the export name
grep "export function" src/app/stock/_components/StocktakeContent.tsx
```
Replace `export function ManualCountContent` with `export function StocktakeContent`.

In `StocktakeCompleted.tsx`, rename `ManualCountCompleted` to `StocktakeCompleted`:
```bash
grep "export function" src/app/stock/_components/StocktakeCompleted.tsx
```
Replace `export function ManualCountCompleted` with `export function StocktakeCompleted`.

- [ ] **Step 3: Update `stock/page.tsx`**

Update all references in `src/app/stock/page.tsx`:
- Import: `ManualCountContent` → `StocktakeContent` from `"./_components/StocktakeContent"`
- Import: `ManualCountCompleted` → `StocktakeCompleted` from `"./_components/StocktakeCompleted"`
- Remove import of `STAFF_NAMES` from `@/lib/auth` (no longer exported)
- Change `countedBy` initialiser from `getSession()?.staffName ?? ""` to `getSession()?.displayName ?? ""`
- Update any tab label strings: `"manual"` display label (if any) to `"Stocktake"`

```bash
# Find all references to update
grep -n "ManualCount\|staffName\|STAFF_NAMES" src/app/stock/page.tsx
```

Make the replacements found.

- [ ] **Step 4: Search for any remaining "Manual Count" strings across the codebase**

```bash
grep -r "Manual Count\|ManualCount\|staffName\|STAFF_NAMES" src/ --include="*.tsx" --include="*.ts"
```

Fix any remaining references found.

- [ ] **Step 5: Run build**

```bash
npm run build
```

Expected: Clean build with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/stock/
git commit -m "feat: rename ManualCount → Stocktake, wire displayName into countedBy"
```

---

## Task 12: Firebase account setup (manual steps)

This task has no code. It creates the Firebase Auth accounts and Firestore `users` documents.

- [ ] **Step 1: Create Firebase Auth accounts**

In Firebase Console → Authentication → Users → Add user, create one account per staff member who needs a named login. For generic linecook accounts, create shared accounts.

Use this naming convention for emails:

| Role | Email pattern | Display Name |
|---|---|---|
| superadmin | chris@theblackbean.ph | Christian |
| Kitchen supervisor (MKT) | kitchen.sup.mkt@theblackbean.ph | [name] |
| Kitchen supervisor (BF) | kitchen.sup.bf@theblackbean.ph | [name] |
| Kitchen branch manager | kitchen.bm@theblackbean.ph | [name] |
| Bar supervisor (MKT) | bar.sup.mkt@theblackbean.ph | [name] |
| Bar supervisor (BF) | bar.sup.bf@theblackbean.ph | [name] |
| Bar branch manager | bar.bm@theblackbean.ph | [name] |
| Cafe supervisors (4) | cafe.sup.[1-4]@theblackbean.ph | [name] |
| Cafe branch manager | cafe.bm@theblackbean.ph | [name] |
| Kitchen linecook (MKT) | kitchen.mkt@theblackbean.ph | Kitchen · MKT |
| Kitchen linecook (BF) | kitchen.bf@theblackbean.ph | Kitchen · BF |
| Bar linecook (MKT) | bar.mkt@theblackbean.ph | Bar · MKT |
| Bar linecook (BF) | bar.bf@theblackbean.ph | Bar · BF |
| Cafe linecook (MKT) | cafe.mkt@theblackbean.ph | Cafe · MKT |
| Cafe linecook (BF) | cafe.bf@theblackbean.ph | Cafe · BF |

Set a temporary password for each account. Use Firebase Console to send a password reset email to named staff before they first log in.

- [ ] **Step 2: Create `users` documents in Firestore**

In Firebase Console → Firestore → `users` collection, create one document per account. Use the Firebase Auth UID as the document ID (found in Authentication → Users → click user → copy UID).

Document shape:
```json
{
  "role": "superadmin",
  "branch": "both",
  "department": "all",
  "displayName": "Christian"
}
```

For a kitchen supervisor at MKT:
```json
{
  "role": "admin",
  "branch": "MKT",
  "department": "kitchen",
  "displayName": "Jacq"
}
```

For a generic linecook at MKT kitchen:
```json
{
  "role": "linecook",
  "branch": "MKT",
  "department": "kitchen",
  "displayName": "Kitchen · MKT"
}
```

- [ ] **Step 3: Test login end-to-end**

1. Open the app locally (`npm run dev`)
2. Select Makati → Kitchen → sign in as `chris@theblackbean.ph`
3. Confirm you reach `/stock` and all tabs are active in BottomNav
4. Sign out, sign in as a linecook account
5. Confirm Transfers and Production show "soon" badge and tapping does nothing
6. Try navigating directly to `/transfers` in the browser — confirm it redirects to `/stock`

- [ ] **Step 4: Commit any final env or config tweaks**

```bash
git add .
git commit -m "chore: Firebase account setup complete — auth system live"
```

---

## Self-review checklist (run before handing off)

- [ ] `npm run build` passes with zero TypeScript errors
- [ ] `npm test` passes — all Vitest tests green
- [ ] Login flow tested manually: branch → dept → email → stock page
- [ ] Linecook account: Transfers + Production greyed; direct URL redirect confirmed
- [ ] Superadmin account: all tabs active
- [ ] Sign-out clears cookies and redirects to `/login`
- [ ] `pullout-config.ts` is deleted; no dangling imports
- [ ] `generate-pullouts` cron returns 200 with no side effects
- [ ] "Stocktake" appears everywhere "Manual Count" used to appear
- [ ] `loggedBy` field on new adjustments shows `displayName` (not old staffName)
