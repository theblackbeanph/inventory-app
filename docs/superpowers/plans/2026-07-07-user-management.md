# User Management — Settings Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a superadmin-only "Users" tab to /settings that creates Firebase Auth accounts and Firestore user docs without disrupting the current session.

**Architecture:** A secondary Firebase app instance handles account creation in isolation. The Settings page gains a tab switcher (Par Levels | Users) gated by role. Three new components handle the user list, add sheet, and edit sheet. Firestore rules are tightened before any UI ships.

**Tech Stack:** Next.js App Router, Firebase Auth (client SDK), Firestore, Vitest (unit tests for pure logic only — components are tested manually per existing project pattern)

## Global Constraints

- Secondary Firebase app must use name `"user-creator"` — checked via `getApps().find(a => a.name === "user-creator")` to avoid duplicate init
- `auth.authStateReady()` must be called before any Firestore read/write in client components
- Submit guard pattern: `useRef` is the real guard (synchronous), `disabled={loading}` is UX only — no early-return optimizations on idempotent handlers
- All Firestore rules changes require a deploy: `npx firebase-tools deploy --only firestore:rules`
- Roles: `"linecook" | "admin" | "supervisor" | "superadmin"` (from `src/lib/roles.ts`)
- Branch values: `"MKT" | "BF" | "both"` — `"both"` means all branches
- Department values: `"kitchen" | "bar" | "cafe" | "all"` — `"all"` means all departments
- `UserDoc` shape: `{ role: Role; branch: Branch | "both"; department: Department | "all"; displayName: string }`
- `COLS.users = "users"` (from `src/lib/firebase.ts`)
- House style: white cards, `var(--border)`, `var(--text-secondary)`, `var(--bg)`, bottom sheets with `borderRadius: "20px 20px 0 0"`, dark submit button `#1A1A1A`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `firestore.rules` | Lock users collection writes to superadmin only |
| Create | `src/lib/firebase-secondary.ts` | Secondary Firebase app + auth instance for user creation |
| Create | `src/app/settings/_components/AddUserSheet.tsx` | Bottom sheet form: create Firebase Auth + Firestore doc |
| Create | `src/app/settings/_components/EditUserSheet.tsx` | Bottom sheet: edit displayName/role/branch/dept or delete doc |
| Create | `src/app/settings/_components/UserManagement.tsx` | User list + wires AddUserSheet + EditUserSheet |
| Modify | `src/app/settings/page.tsx` | Tab switcher (Par Levels | Users), superadmin gate |

---

### Task 1: Lock Firestore rules for users collection

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Produces: deployed rule that rejects writes to `users/{uid}` unless caller's own doc has `role == "superadmin"`

- [ ] **Step 1: Add users rule above the catch-all**

Open `firestore.rules`. Add this block immediately before the `match /{document=**}` catch-all (around line 18):

```
// users collection — writes restricted to superadmin only
match /users/{uid} {
  allow read: if request.auth != null;
  allow write: if request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "superadmin";
}
```

Full file after change:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isKnownUser() {
      return request.auth != null && request.auth.token.email in [
        'chris@theblackbean.ph',
        'hello@theblackbean.ph',
        'kliendacasin1996@gmail.com',
        'tonixgil04@gmail.com'
      ];
    }

    match /branch_stock/{doc}          { allow read, write: if request.auth != null; }
    match /branch_adjustments/{doc}    { allow read, write: if request.auth != null; }
    match /storehub_unmatched/{doc}    { allow read, write: if request.auth != null; }
    match /daily_beginning/{doc}       { allow read, write: if request.auth != null; }
    match /daily_close/{doc}           { allow read, write: if request.auth != null; }
    match /pull_outs/{doc}             { allow read, write: if request.auth != null; }
    match /delivery_notes/{doc}        { allow read, write: if request.auth != null; }
    match /supplier_deliveries/{doc}   { allow read, write: if request.auth != null; }
    match /portioning_runs/{doc}       { allow read, write: if request.auth != null; }
    match /pullout_requests/{doc}      { allow read, write: if request.auth != null; }
    match /stocktake_drafts/{doc}      { allow read, write: if request.auth != null; }
    match /delivery_drafts/{doc}       { allow read, write: if request.auth != null; }
    match /delivery_close/{doc}        { allow read, write: if request.auth != null; }
    match /variance_explanations/{doc} { allow read, write: if request.auth != null; }
    match /parLevelSettings/{doc}      { allow read, write: if request.auth != null; }

    // users collection — writes restricted to superadmin only
    match /users/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "superadmin";
    }

    // Commissary app — writes restricted to known users only
    match /{document=**} {
      allow read: if request.auth != null;
      allow write: if isKnownUser();
    }
  }
}
```

- [ ] **Step 2: Deploy rules**

```bash
npx firebase-tools deploy --only firestore:rules
```

Expected output: `✔ firestore: released rules firestore.rules`

- [ ] **Step 3: Verify deploy succeeded**

Check the Firebase Console → Firestore → Rules tab and confirm the new `users` block appears. Full access-control verification happens in Task 6 Step 3 (admin login confirms no Users tab, then superadmin tests write access end-to-end).

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "security: lock users collection writes to superadmin only"
```

---

### Task 2: Secondary Firebase auth helper

**Files:**
- Create: `src/lib/firebase-secondary.ts`

**Interfaces:**
- Produces: `getSecondaryAuth(): Auth` — returns a stable secondary Firebase Auth instance, safe to call multiple times (idempotent init)

- [ ] **Step 1: Create the file**

```ts
// src/lib/firebase-secondary.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBLBVqOwq6PRqNJJIQHlnsPR232Tu3ZV2s",
  authDomain: "commissary-dashboard-ccd7c.firebaseapp.com",
  projectId: "commissary-dashboard-ccd7c",
  storageBucket: "commissary-dashboard-ccd7c.firebasestorage.app",
  messagingSenderId: "430542841830",
  appId: "1:430542841830:web:06014985cd9e8e1c9b5827",
};

export function getSecondaryAuth() {
  const existing = getApps().find(a => a.name === "user-creator");
  return getAuth(existing ?? initializeApp(firebaseConfig, "user-creator"));
}
```

- [ ] **Step 2: Write unit test**

```ts
// src/lib/firebase-secondary.test.ts
import { describe, it, expect } from "vitest";
import { getSecondaryAuth } from "./firebase-secondary";

describe("getSecondaryAuth", () => {
  it("returns an Auth instance", () => {
    const auth = getSecondaryAuth();
    expect(auth).toBeDefined();
    expect(auth.app.name).toBe("user-creator");
  });

  it("returns the same instance on repeated calls (no duplicate app)", () => {
    const a = getSecondaryAuth();
    const b = getSecondaryAuth();
    expect(a.app).toBe(b.app);
  });
});
```

- [ ] **Step 3: Run test**

```bash
npx vitest run src/lib/firebase-secondary.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/firebase-secondary.ts src/lib/firebase-secondary.test.ts
git commit -m "feat: add secondary Firebase auth helper for user creation"
```

---

### Task 3: AddUserSheet component

**Files:**
- Create: `src/app/settings/_components/AddUserSheet.tsx`

**Interfaces:**
- Consumes: `getSecondaryAuth()` from `src/lib/firebase-secondary.ts`; `db`, `auth`, `COLS` from `src/lib/firebase.ts`; `Role` from `src/lib/roles.ts`; `Branch`, `Department`, `UserDoc` from `src/lib/types.ts`
- Produces: `<AddUserSheet onClose={() => void} onCreated={(uid: string, doc: UserDoc & { uid: string }) => void} />`

- [ ] **Step 1: Create the component**

```tsx
// src/app/settings/_components/AddUserSheet.tsx
"use client";
import { useRef, useState } from "react";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { db, auth, COLS } from "@/lib/firebase";
import { getSecondaryAuth } from "@/lib/firebase-secondary";
import type { Role } from "@/lib/roles";
import type { Branch, Department, UserDoc } from "@/lib/types";

interface Props {
  onClose: () => void;
  onCreated: (uid: string, userDoc: UserDoc & { uid: string }) => void;
}

const ROLES: Role[]        = ["linecook", "admin", "superadmin"];
const BRANCHES             = ["MKT", "BF", "both"] as const;
const DEPARTMENTS          = ["kitchen", "bar", "cafe", "all"] as const;

const ROLE_LABELS: Record<Role, string> = {
  linecook:   "Linecook",
  admin:      "Admin",
  supervisor: "Supervisor",
  superadmin: "Superadmin",
};

export default function AddUserSheet({ onClose, onCreated }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [branch, setBranch]           = useState<Branch | "both">("MKT");
  const [department, setDepartment]   = useState<Department | "all">("kitchen");
  const [role, setRole]               = useState<Role>("linecook");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const submittingRef                 = useRef(false);

  async function handleSubmit() {
    if (submittingRef.current) return;
    setError(null);
    submittingRef.current = true;
    setLoading(true);

    let uid: string | null = null;
    try {
      await auth.authStateReady();
      const secondaryAuth = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      uid = cred.user.uid;

      const userDoc: UserDoc = { role, branch, department, displayName };
      try {
        await setDoc(doc(db, COLS.users, uid), userDoc);
      } catch {
        await signOut(secondaryAuth);
        setError("Account created but profile save failed — delete the account from Firebase Console before retrying.");
        return;
      }

      await signOut(secondaryAuth);
      onCreated(uid, { ...userDoc, uid });
    } catch (e: unknown) {
      if (uid === null) {
        const code = (e as { code?: string }).code;
        if (code === "auth/email-already-in-use") setError("An account with this email already exists.");
        else if (code === "auth/weak-password") setError("Password must be at least 6 characters.");
        else if (code === "auth/invalid-email") setError("Enter a valid email address.");
        else setError("Failed to create account. Try again.");
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  const valid = displayName.trim() && email.trim() && password.length >= 6;

  return (
    <>
      <div
        onClick={loading ? undefined : onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }}
      />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70,
        background: "#fff", borderRadius: "20px 20px 0 0",
        padding: "24px 20px 40px", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)",
        maxHeight: "90dvh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Add User</div>
          <button onClick={onClose} disabled={loading} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-secondary)", padding: 4 }}>✕</button>
        </div>

        {error && (
          <div style={{ background: "#FEF2F2", borderRadius: 10, padding: "10px 14px", color: "#DC2626", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        <Field label="Display Name">
          <input
            type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
            placeholder="e.g. Maria" style={inputStyle}
          />
        </Field>

        <Field label="Email">
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="staff@theblackbean.ph" style={inputStyle}
          />
        </Field>

        <Field label="Temporary Password">
          <input
            type="text" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Min 6 characters" style={inputStyle}
          />
        </Field>

        <Field label="Branch">
          <SegmentedControl
            options={[...BRANCHES]}
            labels={{ MKT: "Makati", BF: "BF Homes", both: "Both" }}
            value={branch}
            onChange={v => setBranch(v as Branch | "both")}
          />
        </Field>

        <Field label="Department">
          <SegmentedControl
            options={[...DEPARTMENTS]}
            labels={{ kitchen: "Kitchen", bar: "Bar", cafe: "Cafe", all: "All" }}
            value={department}
            onChange={v => setDepartment(v as Department | "all")}
          />
        </Field>

        <Field label="Role">
          <SegmentedControl
            options={ROLES}
            labels={ROLE_LABELS}
            value={role}
            onChange={v => setRole(v as Role)}
          />
        </Field>

        <button
          onClick={handleSubmit}
          disabled={loading || !valid}
          style={{
            width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
            background: valid && !loading ? "#1A1A1A" : "#E5E7EB",
            color: valid && !loading ? "#fff" : "#9CA3AF",
            fontWeight: 700, fontSize: 15, cursor: valid && !loading ? "pointer" : "default",
            marginTop: 8,
          }}
        >
          {loading ? "Creating…" : "Create User"}
        </button>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function SegmentedControl({ options, labels, value, onChange }: {
  options: string[];
  labels: Record<string, string>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          style={{
            padding: "7px 12px", borderRadius: 8, border: "1px solid",
            borderColor: value === opt ? "#1A1A1A" : "var(--border)",
            background: value === opt ? "#1A1A1A" : "#fff",
            color: value === opt ? "#fff" : "var(--text-secondary)",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          {labels[opt] ?? opt}
        </button>
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 14,
  border: "1px solid var(--border)", borderRadius: 8,
  background: "#fff", outline: "none", boxSizing: "border-box",
};
```

- [ ] **Step 2: Manual test**

Start dev server (`npm run dev`), log in as superadmin, open /settings → Users tab (Task 6 wires this — skip for now and test in Task 6).

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/_components/AddUserSheet.tsx
git commit -m "feat: add AddUserSheet component for user creation"
```

---

### Task 4: EditUserSheet component

**Files:**
- Create: `src/app/settings/_components/EditUserSheet.tsx`

**Interfaces:**
- Consumes: `db`, `COLS` from `src/lib/firebase.ts`; `Role` from `src/lib/roles.ts`; `Branch`, `Department`, `UserDoc` from `src/lib/types.ts`
- Produces: `<EditUserSheet user={{ uid: string } & UserDoc} onClose={() => void} onUpdated={(uid: string, doc: UserDoc) => void} onDeleted={(uid: string) => void} />`

- [ ] **Step 1: Create the component**

```tsx
// src/app/settings/_components/EditUserSheet.tsx
"use client";
import { useRef, useState } from "react";
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import { db, auth, COLS } from "@/lib/firebase";
import type { Role } from "@/lib/roles";
import type { Branch, Department, UserDoc } from "@/lib/types";

interface UserRow extends UserDoc { uid: string; }

interface Props {
  user: UserRow;
  onClose: () => void;
  onUpdated: (uid: string, userDoc: UserDoc) => void;
  onDeleted: (uid: string) => void;
}

const ROLES: Role[]   = ["linecook", "admin", "superadmin"];
const BRANCHES        = ["MKT", "BF", "both"] as const;
const DEPARTMENTS     = ["kitchen", "bar", "cafe", "all"] as const;

const ROLE_LABELS: Record<Role, string> = {
  linecook:   "Linecook",
  admin:      "Admin",
  supervisor: "Supervisor",
  superadmin: "Superadmin",
};

export default function EditUserSheet({ user, onClose, onUpdated, onDeleted }: Props) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [branch, setBranch]           = useState(user.branch);
  const [department, setDepartment]   = useState(user.department);
  const [role, setRole]               = useState(user.role);
  const [loading, setLoading]         = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const submittingRef                 = useRef(false);

  async function handleSave() {
    if (submittingRef.current) return;
    setError(null);
    submittingRef.current = true;
    setLoading(true);
    try {
      await auth.authStateReady();
      const updated: UserDoc = { role, branch, department, displayName };
      await setDoc(doc(db, COLS.users, user.uid), updated, { merge: true });
      onUpdated(user.uid, updated);
    } catch {
      setError("Save failed. Try again.");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setDeleting(true);
    try {
      await auth.authStateReady();
      await deleteDoc(doc(db, COLS.users, user.uid));
      onDeleted(user.uid);
    } catch {
      setError("Delete failed. Try again.");
      submittingRef.current = false;
      setDeleting(false);
    }
  }

  return (
    <>
      <div
        onClick={loading || deleting ? undefined : onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }}
      />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70,
        background: "#fff", borderRadius: "20px 20px 0 0",
        padding: "24px 20px 40px", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)",
        maxHeight: "90dvh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Edit User</div>
          <button onClick={onClose} disabled={loading || deleting} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-secondary)", padding: 4 }}>✕</button>
        </div>

        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 20 }}>{user.uid}</div>

        {error && (
          <div style={{ background: "#FEF2F2", borderRadius: 10, padding: "10px 14px", color: "#DC2626", fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <Field label="Display Name">
          <input
            type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Branch">
          <SegmentedControl
            options={[...BRANCHES]}
            labels={{ MKT: "Makati", BF: "BF Homes", both: "Both" }}
            value={branch}
            onChange={v => setBranch(v as Branch | "both")}
          />
        </Field>

        <Field label="Department">
          <SegmentedControl
            options={[...DEPARTMENTS]}
            labels={{ kitchen: "Kitchen", bar: "Bar", cafe: "Cafe", all: "All" }}
            value={department}
            onChange={v => setDepartment(v as Department | "all")}
          />
        </Field>

        <Field label="Role">
          <SegmentedControl
            options={ROLES}
            labels={ROLE_LABELS}
            value={role}
            onChange={v => setRole(v as Role)}
          />
        </Field>

        <button
          onClick={handleSave}
          disabled={loading || deleting}
          style={{
            width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
            background: loading || deleting ? "#E5E7EB" : "#1A1A1A",
            color: loading || deleting ? "#9CA3AF" : "#fff",
            fontWeight: 700, fontSize: 15,
            cursor: loading || deleting ? "default" : "pointer",
            marginTop: 8, marginBottom: 12,
          }}
        >
          {loading ? "Saving…" : "Save Changes"}
        </button>

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={loading || deleting}
            style={{
              width: "100%", padding: "13px 0", borderRadius: 12,
              border: "1px solid #FCA5A5", background: "#FFF",
              color: "#DC2626", fontWeight: 600, fontSize: 14, cursor: "pointer",
            }}
          >
            Remove Access
          </button>
        ) : (
          <div style={{ background: "#FEF2F2", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 13, color: "#DC2626", fontWeight: 600, marginBottom: 10 }}>
              Remove {user.displayName}&apos;s access? Their Firebase Auth account remains — they just can&apos;t log in.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid var(--border)", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: "#DC2626", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                {deleting ? "Removing…" : "Confirm"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function SegmentedControl({ options, labels, value, onChange }: {
  options: string[];
  labels: Record<string, string>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          style={{
            padding: "7px 12px", borderRadius: 8, border: "1px solid",
            borderColor: value === opt ? "#1A1A1A" : "var(--border)",
            background: value === opt ? "#1A1A1A" : "#fff",
            color: value === opt ? "#fff" : "var(--text-secondary)",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          {labels[opt] ?? opt}
        </button>
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 14,
  border: "1px solid var(--border)", borderRadius: 8,
  background: "#fff", outline: "none", boxSizing: "border-box",
};
```

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/_components/EditUserSheet.tsx
git commit -m "feat: add EditUserSheet component for editing and removing users"
```

---

### Task 5: UserManagement component

**Files:**
- Create: `src/app/settings/_components/UserManagement.tsx`

**Interfaces:**
- Consumes: `<AddUserSheet>` from `./AddUserSheet`; `<EditUserSheet>` from `./EditUserSheet`; `db`, `auth`, `COLS` from `src/lib/firebase.ts`; `getDocs`, `collection` from `firebase/firestore`; `UserDoc` from `src/lib/types.ts`
- Produces: `<UserManagement />` — self-contained, no props needed

Role badge colors:
- `linecook` → `{ bg: "#F3F4F6", color: "#6B7280" }`
- `admin` → `{ bg: "#EFF6FF", color: "#2563EB" }`
- `supervisor` → `{ bg: "#F5F3FF", color: "#7C3AED" }`
- `superadmin` → `{ bg: "#1A1A1A", color: "#FFFFFF" }`

- [ ] **Step 1: Create the component**

```tsx
// src/app/settings/_components/UserManagement.tsx
"use client";
import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db, auth, COLS } from "@/lib/firebase";
import type { UserDoc } from "@/lib/types";
import AddUserSheet from "./AddUserSheet";
import EditUserSheet from "./EditUserSheet";

type UserRow = UserDoc & { uid: string };

const BADGE: Record<string, { bg: string; color: string }> = {
  linecook:   { bg: "#F3F4F6", color: "#6B7280" },
  admin:      { bg: "#EFF6FF", color: "#2563EB" },
  supervisor: { bg: "#F5F3FF", color: "#7C3AED" },
  superadmin: { bg: "#1A1A1A", color: "#FFFFFF" },
};

const BRANCH_LABEL: Record<string, string> = { MKT: "Makati", BF: "BF Homes", both: "Both" };
const DEPT_LABEL:   Record<string, string> = { kitchen: "Kitchen", bar: "Bar", cafe: "Cafe", all: "All" };

export default function UserManagement() {
  const [users, setUsers]           = useState<UserRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showAdd, setShowAdd]       = useState(false);
  const [editing, setEditing]       = useState<UserRow | null>(null);

  useEffect(() => {
    async function load() {
      await auth.authStateReady();
      const snap = await getDocs(collection(db, COLS.users));
      const rows: UserRow[] = snap.docs.map(d => ({ uid: d.id, ...(d.data() as UserDoc) }));
      rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setUsers(rows);
      setLoading(false);
    }
    load();
  }, []);

  function handleCreated(uid: string, userDoc: UserDoc & { uid: string }) {
    setUsers(prev => [...prev, userDoc].sort((a, b) => a.displayName.localeCompare(b.displayName)));
    setShowAdd(false);
  }

  function handleUpdated(uid: string, userDoc: UserDoc) {
    setUsers(prev => prev.map(u => u.uid === uid ? { uid, ...userDoc } : u));
    setEditing(null);
  }

  function handleDeleted(uid: string) {
    setUsers(prev => prev.filter(u => u.uid !== uid));
    setEditing(null);
  }

  if (loading) {
    return (
      <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-secondary)", fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      {users.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-secondary)", fontSize: 14 }}>
          No users yet.
        </div>
      ) : (
        users.map((user, i) => {
          const badge = BADGE[user.role] ?? BADGE.linecook;
          return (
            <button
              key={user.uid}
              onClick={() => setEditing(user)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: "12px 16px", textAlign: "left",
                background: i % 2 === 0 ? "#FFFFFF" : "var(--bg)",
                borderBottom: "1px solid var(--border)", border: "none", cursor: "pointer",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{user.displayName}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {BRANCH_LABEL[user.branch] ?? user.branch} · {DEPT_LABEL[user.department] ?? user.department}
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                background: badge.bg, color: badge.color, textTransform: "uppercase",
                letterSpacing: "0.05em", flexShrink: 0, marginLeft: 12,
              }}>
                {user.role}
              </span>
            </button>
          );
        })
      )}

      {/* Add User footer button */}
      <div style={{
        position: "sticky", bottom: "var(--nav-h)",
        background: "#FFFFFF", borderTop: "1px solid var(--border)",
        padding: "12px 16px",
      }}>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
            background: "#1A1A1A", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer",
          }}
        >
          + Add User
        </button>
      </div>

      {showAdd && (
        <AddUserSheet onClose={() => setShowAdd(false)} onCreated={handleCreated} />
      )}
      {editing && (
        <EditUserSheet
          user={editing}
          onClose={() => setEditing(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/_components/UserManagement.tsx
git commit -m "feat: add UserManagement component — user list, add/edit/delete"
```

---

### Task 6: Wire Settings page — tab switcher + superadmin gate

**Files:**
- Modify: `src/app/settings/page.tsx`

**Interfaces:**
- Consumes: `<UserManagement />` from `./_components/UserManagement`; `hasMinRole` from `src/lib/roles.ts`; `session.role` from `getSession()`

- [ ] **Step 1: Update settings/page.tsx**

Replace the full file contents:

```tsx
// src/app/settings/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSession, BRANCH_LABELS } from "@/lib/auth";
import { hasMinRole } from "@/lib/roles";
import type { Branch } from "@/lib/types";
import type { Role } from "@/lib/roles";
import BottomNav from "@/components/BottomNav";
import ParLevelSettings from "./_components/ParLevelSettings";
import UserManagement from "./_components/UserManagement";

type Tab = "parlevel" | "users";

export default function SettingsPage() {
  const router = useRouter();
  const [branch, setBranch]         = useState<Branch | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [role, setRole]             = useState<Role | null>(null);
  const [tab, setTab]               = useState<Tab>("parlevel");

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    if (!hasMinRole(session.role, "admin")) { router.replace("/dashboard"); return; }
    setBranch(session.branch);
    setDisplayName(session.displayName);
    setRole(session.role);
  }, [router]);

  if (!branch || !role) return null;

  const isSuperadmin = role === "superadmin";

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 16px)" }}>
      {/* Header */}
      <div style={{
        background: "#FFFFFF", borderBottom: "1px solid var(--border)",
        padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <Link href="/dashboard" style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 32, height: 32, borderRadius: 8, color: "var(--text-secondary)",
          textDecoration: "none", flexShrink: 0,
        }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
            {BRANCH_LABELS[branch]}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Settings</div>
        </div>
      </div>

      {/* Tab switcher — superadmin only */}
      {isSuperadmin && (
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "#fff" }}>
          {([["parlevel", "Par Levels"], ["users", "Users"]] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "12px 0", fontSize: 13, fontWeight: 700,
                border: "none", background: "none", cursor: "pointer",
                color: tab === t ? "#1A1A1A" : "var(--text-secondary)",
                borderBottom: `2px solid ${tab === t ? "#1A1A1A" : "transparent"}`,
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {tab === "parlevel" && (
        <>
          <div style={{ padding: "16px 16px 8px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              Par Levels
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Par Level = order-up-to target · Low Alert = shows LOW badge below this qty
            </div>
          </div>
          <ParLevelSettings branch={branch} updatedBy={displayName} />
        </>
      )}

      {tab === "users" && isSuperadmin && <UserManagement />}

      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual test — full flow**

Start dev server: `npm run dev`

1. Log in as **superadmin** → go to /settings → confirm two tabs appear: "Par Levels" and "Users"
2. Click **Users** → list loads (existing users appear)
3. Tap **+ Add User** → fill form → create a test account (e.g. `test-bf@theblackbean.ph`, password `test123`, BF, kitchen, linecook)
4. Confirm new user appears in the list immediately (no page reload)
5. Tap the new user → EditUserSheet opens → change role to `admin` → Save → badge updates in list
6. Tap user again → "Remove Access" → confirm → user disappears from list
7. Log in as **admin** (non-superadmin) → go to /settings → confirm no tab switcher, Par Levels only
8. Verify test account was created in Firebase Console → Authentication → Users
9. Log in as the test account (before deletion) → confirm login works and lands on /stock
10. Confirm that after deletion (step 6), logging in with that account shows "No user record found. Contact your admin."

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat: add Users tab to settings — superadmin-only user management"
```

---

### Task 7: Deploy to production

**Files:** none

- [ ] **Step 1: Confirm clean tree on main**

```bash
git status
git branch --show-current
```

Expected: `main`, clean working tree.

- [ ] **Step 2: Push and deploy**

```bash
git push && npx vercel --prod
```

- [ ] **Step 3: Smoke test on production**

Log in as superadmin on the live app → Settings → Users → create a real BF staff account → confirm they can log in.
