export const ROLE_ORDER = ["linecook", "admin", "superadmin"] as const;
export type Role = (typeof ROLE_ORDER)[number];

export function hasMinRole(userRole: Role, minRole: Role): boolean {
  return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(minRole);
}
