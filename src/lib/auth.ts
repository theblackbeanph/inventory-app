import type { Branch, AuthState, PosType } from "./types";

// Branch PINs — change these per deployment
export const BRANCH_PINS: Record<Branch, string> = {
  MKT: "0317",
  BF:  "0317",
};

export const BRANCH_LABELS: Record<Branch, string> = {
  MKT: "Makati",
  BF:  "BF Homes",
};

export const BRANCH_POS_TYPE: Record<Branch, PosType> = {
  MKT: "storehub",
  BF:  "csv",
};

const AUTH_KEY = "branch_auth";
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

export function getSession(): AuthState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const state: AuthState = JSON.parse(raw);
    if (Date.now() - state.authedAt > SESSION_TTL) {
      localStorage.removeItem(AUTH_KEY);
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export function login(branch: Branch, pin: string): boolean {
  if (pin !== BRANCH_PINS[branch]) return false;
  const state: AuthState = { branch, authedAt: Date.now() };
  localStorage.setItem(AUTH_KEY, JSON.stringify(state));
  return true;
}

export function logout() {
  localStorage.removeItem(AUTH_KEY);
}
