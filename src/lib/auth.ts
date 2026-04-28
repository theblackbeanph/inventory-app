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
