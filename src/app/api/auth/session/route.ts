import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { cookies } from "next/headers";
import type { UserDoc, AuthState, Branch, Department } from "@/lib/types";

// Must use Node.js runtime — firebase-admin does not support Edge
export const runtime = "nodejs";

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const { idToken, selectedBranch, selectedDept } = await request.json() as {
      idToken: string;
      selectedBranch: Branch;
      selectedDept: Department;
    };

    // Verify the Firebase ID token
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    // Fetch user doc from Firestore
    const userSnap = await adminDb.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      return Response.json({ error: "No user record found. Contact your admin." }, { status: 403 });
    }
    const userData = userSnap.data() as UserDoc;

    // Validate selected branch + dept against account permissions
    const branchOk = userData.branch === "both" || userData.branch === selectedBranch;
    const deptOk   = userData.department === "all" || userData.department === selectedDept;
    if (!branchOk) return Response.json({ error: `This account is not authorized for ${selectedBranch}.` }, { status: 403 });
    if (!deptOk)   return Response.json({ error: `This account is not authorized for ${selectedDept}.` }, { status: 403 });

    // Create a Firebase session cookie (survives token refresh)
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: FIVE_DAYS_MS,
    });

    // Resolve "both"/"all" → selected concrete values so AuthState always has Branch/Department
    const identity: AuthState = {
      role:        userData.role,
      branch:      selectedBranch,
      department:  selectedDept,
      displayName: userData.displayName,
      uid,
    };

    const cookieStore = await cookies();
    const cookieOpts = {
      maxAge: FIVE_DAYS_MS / 1000,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax" as const,
    };

    // __session — httpOnly, verified by Admin SDK on sensitive API routes
    cookieStore.set("__session", sessionCookie, { ...cookieOpts, httpOnly: true });

    // __identity — NOT httpOnly, readable by client JS + middleware for routing
    cookieStore.set("__identity", JSON.stringify(identity), { ...cookieOpts, httpOnly: false });

    return Response.json({ ok: true, identity });
  } catch (err) {
    console.error("Session creation failed:", err);
    return Response.json({ error: "Authentication failed" }, { status: 401 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("__session");
  cookieStore.delete("__identity");
  return Response.json({ ok: true });
}
