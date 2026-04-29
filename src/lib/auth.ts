import { getAuth, signInWithEmailAndPassword, signOut as fbSignOut } from "firebase/auth";
import { getDoc, doc } from "firebase/firestore";
import { app, db } from "@/lib/firebase";
import type { Branch, Department, AuthState, UserDoc, PosType } from "@/lib/types";

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

function writeIdentityCookie(identity: AuthState): void {
  const FIVE_DAYS = 5 * 24 * 60 * 60;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "";
  document.cookie = `__identity=${encodeURIComponent(JSON.stringify(identity))}; max-age=${FIVE_DAYS}; path=/; samesite=lax${secure}`;
}

function clearIdentityCookie(): void {
  document.cookie = "__identity=; max-age=0; path=/";
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
  const uid = cred.user.uid;

  const userSnap = await getDoc(doc(db, "users", uid));
  if (!userSnap.exists()) {
    await fbSignOut(auth);
    throw new Error("No user record found. Contact your admin.");
  }
  const userData = userSnap.data() as UserDoc;

  const branchOk = userData.branch === "both" || userData.branch === selectedBranch;
  const deptOk   = userData.department === "all" || userData.department === selectedDept;
  if (!branchOk) {
    await fbSignOut(auth);
    throw new Error(`This account is not authorized for ${selectedBranch}.`);
  }
  if (!deptOk) {
    await fbSignOut(auth);
    throw new Error(`This account is not authorized for ${selectedDept}.`);
  }

  const identity: AuthState = {
    role:        userData.role,
    branch:      selectedBranch,
    department:  selectedDept,
    displayName: userData.displayName,
    uid,
  };

  writeIdentityCookie(identity);
  return identity;
}

export async function logout(): Promise<void> {
  const auth = getAuth(app);
  await fbSignOut(auth);
  clearIdentityCookie();
}
