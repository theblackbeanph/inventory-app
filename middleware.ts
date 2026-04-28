import { NextRequest, NextResponse } from "next/server";
import { getRedirectPath } from "@/lib/middleware-helpers";

export function middleware(request: NextRequest) {
  const identityCookie = request.cookies.get("__identity")?.value;

  let session: { role: import("@/lib/roles").Role } | null = null;
  if (identityCookie) {
    try {
      session = JSON.parse(decodeURIComponent(identityCookie));
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
