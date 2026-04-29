import { NextRequest, NextResponse } from "next/server";

// Phase 2: transfer logic not yet implemented.
// Cron slot reserved at Saturday 10am PHT (0 2 * * 6 UTC).
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, message: "Phase 2 transfer logic not yet implemented" });
}
