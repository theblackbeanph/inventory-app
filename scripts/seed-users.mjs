/**
 * One-time script: creates Firestore `users` docs for existing Firebase Auth accounts.
 * Run from the worktree root:
 *   node --env-file=.env.local scripts/seed-users.mjs
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "commissary-dashboard-ccd7c",
});

const auth = getAuth(app);
const db = getFirestore(app);

const USERS = [
  {
    email: "chris@theblackbean.ph",
    doc: { role: "superadmin", branch: "both", department: "all", displayName: "Christian" },
  },
  {
    email: "kliendacasin1996@gmail.com",
    doc: { role: "admin", branch: "both", department: "all", displayName: "Klien" },
  },
  {
    email: "theblackbean.legazpi@gmail.com",
    doc: { role: "linecook", branch: "MKT", department: "kitchen", displayName: "Kitchen" },
  },
];

for (const { email, doc } of USERS) {
  const user = await auth.getUserByEmail(email);
  await db.collection("users").doc(user.uid).set(doc);
  console.log(`✓ ${email} → uid=${user.uid} role=${doc.role}`);
}

console.log("\nDone. All user docs written to Firestore.");
process.exit(0);
