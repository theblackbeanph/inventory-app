import type { Branch, Department, AuthState, PosType } from "./types";

// Branch PINs — change these per deployment
export const BRANCH_PINS: Record<Branch, string> = {
  MKT: "0317",
  BF:  "0317",
};

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

const AUTH_KEY = "branch_auth";
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface StoredState {
  branch: Branch;
  department?: Department;
  authedAt: number;
}

function readStored(): StoredState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const state: StoredState = JSON.parse(raw);
    if (Date.now() - state.authedAt > SESSION_TTL) {
      localStorage.removeItem(AUTH_KEY);
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

// Returns branch session even if department hasn't been selected yet
export function getBranchSession(): { branch: Branch; authedAt: number } | null {
  const state = readStored();
  if (!state) return null;
  return { branch: state.branch, authedAt: state.authedAt };
}

// Returns full session only when department is also set
export function getSession(): AuthState | null {
  const state = readStored();
  if (!state || !state.department) return null;
  return { branch: state.branch, department: state.department, authedAt: state.authedAt };
}

export function login(branch: Branch, pin: string): boolean {
  if (pin !== BRANCH_PINS[branch]) return false;
  const state: StoredState = { branch, authedAt: Date.now() };
  localStorage.setItem(AUTH_KEY, JSON.stringify(state));
  return true;
}

export function setDepartment(department: Department) {
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return;
  const state: StoredState = JSON.parse(raw);
  state.department = department;
  localStorage.setItem(AUTH_KEY, JSON.stringify(state));
}

export function logout() {
  localStorage.removeItem(AUTH_KEY);
}
