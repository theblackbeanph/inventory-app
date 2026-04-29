import { NextRequest, NextResponse } from "next/server";
import { getRedirectPath } from "@/lib/middleware-helpers";
import { ROLE_ORDER } from "@/lib/roles";
import type { Role } from "@/lib/roles";

export function middleware(request: NextRequest) {
  const identityCookie = request.cookies.get("__identity")?.value;

  let session: { role: Role } | null = null;
  if (identityCookie) {
    try {
      const parsed = JSON.parse(decodeURIComponent(identityCookie));
      if (parsed && ROLE_ORDER.includes(parsed.role)) {
        session = parsed as { role: Role };
      }
    } catch {
      // malformed cookie — treat as unauthenticated
    }
  }

  const redirectPath = getRedirectPath(session, request.nextUrl.pathname);
  if (redirectPath) {
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
