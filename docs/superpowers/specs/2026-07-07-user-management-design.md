# User Management — Settings Tab

**Date:** 2026-07-07  
**Scope:** branch-inventory app  
**Status:** Approved

---

## Goal

Allow the superadmin to create and manage Firebase Auth user accounts directly from the app, without needing the Firebase Console or a seed script.

---

## Access

- Settings page gains a tab switcher: **Par Levels** | **Users**
- The Users tab renders only when `session.role === "superadmin"`
- Admin and linecook users see Settings exactly as today (no tab switcher visible)
- Route-level guard stays at `admin+` — the tab-level guard handles the superadmin restriction

---

## Architecture

### Secondary Firebase App Instance
User creation uses a second `FirebaseApp` instance (`initializeApp(firebaseConfig, "user-creator")`) so the superadmin session is never disrupted. After creating the Auth account, the secondary instance signs itself out. The primary app and `__identity` cookie are untouched.

### Data Written
For each new user:
1. Firebase Auth account (email + password) — created via secondary app
2. Firestore `users/{uid}` doc: `{ role, branch, department, displayName }`

No additional Firestore collections needed.

---

## Components

### `settings/page.tsx` (modified)
- Read `session.role` in the `useEffect`
- If superadmin: render `<TabSwitcher tabs={["Par Levels", "Users"]} />` and conditionally render `<UserManagement />` or `<ParLevelSettings />`
- If not superadmin: render existing layout unchanged

### `settings/_components/UserManagement.tsx` (new)
Responsible for the full Users tab. Two sub-sections:

**User list:**
- On mount: `getDocs(collection(db, "users"))` — loads all user docs
- Each row: display name, role badge (color-coded), branch pill, department
- Tapping a row opens `<EditUserSheet>` for that user

**Add User button:**
- Fixed at bottom (same pattern as Settings footer)
- Opens `<AddUserSheet>`

### `settings/_components/AddUserSheet.tsx` (new)
Bottom sheet form with fields:
- Display Name (text)
- Email (email input)
- Temporary Password (text, min 6 chars)
- Branch: `MKT` | `BF` | `Both` (segmented control)
- Department: `kitchen` | `bar` | `cafe` | `All` (segmented control)
- Role: `linecook` | `admin` | `superadmin` (segmented control)

On submit:
1. Guard: `submittingRef.current` (useRef pattern)
2. `createUserWithEmailAndPassword(secondaryAuth, email, password)`
3. `setDoc(doc(db, "users", uid), { role, branch, department, displayName })`
4. `await secondaryAuth.signOut()`
5. Refresh user list, close sheet, show success state

Error handling: display inline error message within the sheet (auth errors: email already in use, weak password, etc.)

### `settings/_components/EditUserSheet.tsx` (new)
Bottom sheet for editing an existing user. Fields:
- Display Name (editable)
- Branch, Department, Role (segmented controls)

Email and password are NOT editable here (Firebase Console for password resets). On save: `setDoc` with merge. On delete: `deleteDoc(doc(db, "users", uid))` — removes Firestore doc only (Firebase Auth account remains, user just can't log in meaningfully).

---

## Role Badge Colors
- `linecook` — gray (`#6B7280` bg muted)
- `admin` — blue (`#2563EB`)
- `superadmin` — dark (`#1A1A1A`)

---

## Firestore Rules
No changes needed. The `users` collection is already readable/writable by any authenticated user per current rules.

---

## Secondary Firebase App — Implementation Note
```ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { firebaseConfig } from "@/lib/firebase";

function getSecondaryAuth() {
  const existing = getApps().find(a => a.name === "user-creator");
  return getAuth(existing ?? initializeApp(firebaseConfig, "user-creator"));
}
```

---

## Out of Scope
- Password reset from within the app (use Firebase Console)
- Deleting Firebase Auth accounts (Firestore doc deletion is sufficient — user loses access)
- User avatars / photos
- Email verification flow
