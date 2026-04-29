/**
 * One-time script: writes Firestore `users` docs.
 *
 * 1. Get UIDs from Firebase Console → Authentication → Users
 * 2. Run:
 *    SEED_PASSWORD=xxx CHRIS_UID=xxx KLIEN_UID=xxx KITCHEN_UID=xxx node scripts/seed-users.mjs
 */

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const { SEED_PASSWORD, CHRIS_UID, KLIEN_UID, KITCHEN_UID } = process.env;
const missing = ["SEED_PASSWORD", "CHRIS_UID", "KLIEN_UID", "KITCHEN_UID"].filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")}`);
  console.error("Usage: SEED_PASSWORD=xxx CHRIS_UID=xxx KLIEN_UID=xxx KITCHEN_UID=xxx node scripts/seed-users.mjs");
  process.exit(1);
}

const app = initializeApp({
  apiKey: "AIzaSyBLBVqOwq6PRqNJJIQHlnsPR232Tu3ZV2s",
  authDomain: "commissary-dashboard-ccd7c.firebaseapp.com",
  projectId: "commissary-dashboard-ccd7c",
  storageBucket: "commissary-dashboard-ccd7c.firebasestorage.app",
  messagingSenderId: "430542841830",
  appId: "1:430542841830:web:06014985cd9e8e1c9b5827",
});

const auth = getAuth(app);
const db = getFirestore(app);

await signInWithEmailAndPassword(auth, "chris@theblackbean.ph", SEED_PASSWORD);

const USERS = [
  { uid: CHRIS_UID,   data: { role: "superadmin", branch: "both", department: "all",     displayName: "Christian" } },
  { uid: KLIEN_UID,   data: { role: "admin",       branch: "both", department: "all",     displayName: "Klien"     } },
  { uid: KITCHEN_UID, data: { role: "linecook",     branch: "MKT",  department: "kitchen", displayName: "Kitchen"   } },
];

for (const { uid, data } of USERS) {
  await setDoc(doc(db, "users", uid), data);
  console.log(`✓ ${uid} → role=${data.role}`);
}

console.log("\nDone.");
process.exit(0);
