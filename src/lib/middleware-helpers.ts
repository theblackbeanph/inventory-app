import type { Role } from "./roles";
import { hasMinRole } from "./roles";

interface MinimalSession {
  role: Role;
}

const PUBLIC_PATHS = ["/login"];

const ROUTE_ROLES: { prefix: string; minRole: Role }[] = [
  { prefix: "/transfers",  minRole: "staff"   },
  { prefix: "/production", minRole: "superadmin" },
  { prefix: "/stock",      minRole: "staff"   },
  { prefix: "/history",    minRole: "staff"   },
  { prefix: "/pullout",    minRole: "staff"   },
  { prefix: "/delivery",   minRole: "staff"   },
  { prefix: "/dashboard",  minRole: "staff"   },
  { prefix: "/settings",   minRole: "admin"      },
  { prefix: "/sales",      minRole: "admin" },
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
