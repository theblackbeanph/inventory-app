import type { Branch, Department, AuthState, PosType } from "./types";

// Staff names per department — update these to match your actual team per dept
export const STAFF_NAMES: Record<Department, string[]> = {
  kitchen: ["Jacq", "Minh", "Brian", "Joshua", "Wilfred", "MJ", "Roji", "Lady", "Mike", "John", "Dexter", "Jesryl", "Rafael"],
  bar:     ["Homer", "Eric", "Jess", "RJ", "Ivan", "Josh"],
  cafe:    ["Je", "Raniel"],
};

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
  staffName?: string;
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

// Returns full session only when department and staffName are both set
export function getSession(): AuthState | null {
  const state = readStored();
  if (!state || !state.department || !state.staffName) return null;
  return { branch: state.branch, department: state.department, staffName: state.staffName, authedAt: state.authedAt };
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
  state.staffName = undefined; // reset name when dept changes
  localStorage.setItem(AUTH_KEY, JSON.stringify(state));
}

export function setStaffName(name: string) {
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return;
  const state: StoredState = JSON.parse(raw);
  state.staffName = name;
  localStorage.setItem(AUTH_KEY, JSON.stringify(state));
}

export function logout() {
  localStorage.removeItem(AUTH_KEY);
}
