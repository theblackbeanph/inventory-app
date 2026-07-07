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
- Admin users see Settings exactly as today (no tab switcher visible)
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
- If not superadmin: render existing layout unchanged (Par Levels only, no tab switcher)

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

**Partial failure handling:** If step 2 succeeds but step 3 fails, surface an explicit inline error: "Account created but profile save failed — delete the account from Firebase Console before retrying." This prevents silent ghost accounts that block re-creation with the same email.

Error handling for other cases: inline error message within the sheet (email already in use, weak password, network failure, etc.)

### `settings/_components/EditUserSheet.tsx` (new)
Bottom sheet for editing an existing user. Fields:
- Display Name (editable)
- Branch, Department, Role (segmented controls)

Email and password are NOT editable here (use Firebase Console for password resets). On save: `setDoc` with merge. On delete: `deleteDoc(doc(db, "users", uid))` — removes Firestore doc only (Firebase Auth account remains).

---

## Role Badge Colors
- `linecook` — gray (`#6B7280` bg muted)
- `admin` — blue (`#2563EB`)
- `superadmin` — dark (`#1A1A1A`)

---

## Firestore Rules — REQUIRED BEFORE SHIPPING

**Cross-app note:** `firestore.rules` in branch-inventory is the single deploy point for all three apps (commissary, branch-inventory, Recipe DB). The commissary app does not read or write the `users` collection, so this change is safe to deploy without coordinating across apps.

The `users` collection currently falls under the catch-all `match /{document=**}` rule, which allows writes only to `isKnownUser()` (4 hardcoded emails). This guards against unknown accounts but not role escalation by a known staff member — a linecook with DevTools could `setDoc` their own `users/{uid}` doc and promote themselves to superadmin.

**Required rule:** Add an explicit `users` match above the catch-all, locking writes to superadmin role only via a Firestore `get()` lookup:

```
match /users/{uid} {
  allow read: if request.auth != null;
  allow write: if request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "superadmin";
}
```

This must be deployed (`npx firebase-tools deploy --only firestore:rules`) before the Users tab ships.

---

## Auth Flow — Missing Firestore Doc (delete safety)

When a user's Firestore doc is deleted (but their Firebase Auth account remains), they can re-authenticate and receive a new `__identity` cookie. The existing `loginUser` function in `src/lib/auth.ts` reads the `users/{uid}` doc immediately after sign-in — if the doc is missing, it throws and the login fails. Verify during implementation that this path returns the user to the login screen with a clear error, not a broken state.

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
- Deleting Firebase Auth accounts (Firestore doc deletion is sufficient — user loses access on next login attempt)
- User avatars / photos
- Email verification flow
