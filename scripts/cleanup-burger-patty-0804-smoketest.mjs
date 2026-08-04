// Delete the 08-04 Burger Patty +2 IN branch_adjustments doc left over from
// the 2026-08-04 edit-dispute smoke test. Reality: MKT received nothing today,
// so this doc is inflating today's IN column by 2.
//
// Safe because 08-04 daily_close has not been submitted yet — Daily view is
// computed live from beginning + adjustments, so removing the adj is enough.
//
// Usage:
//   SEED_EMAIL=... SEED_PASSWORD=... node scripts/cleanup-burger-patty-0804-smoketest.mjs
//   SEED_EMAIL=... SEED_PASSWORD=... node scripts/cleanup-burger-patty-0804-smoketest.mjs --apply

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore, collection, query, where, getDocs, writeBatch,
} from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyBLBVqOwq6PRqNJJIQHlnsPR232Tu3ZV2s",
  authDomain: "commissary-dashboard-ccd7c.firebaseapp.com",
  projectId: "commissary-dashboard-ccd7c",
});
const auth = getAuth(app);
const db = getFirestore(app);
const { SEED_EMAIL, SEED_PASSWORD } = process.env;
const APPLY = process.argv.includes("--apply");
await signInWithEmailAndPassword(auth, SEED_EMAIL, SEED_PASSWORD);

const BRANCH = "MKT", DATE = "2026-08-04", ITEM = "Burger Patty";

console.log(`\n=== CLEANUP ${ITEM} ${DATE} smoke-test IN — ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`);

const adjSnap = await getDocs(query(
  collection(db, "branch_adjustments"),
  where("branch", "==", BRANCH),
  where("date", "==", DATE),
  where("item", "==", ITEM),
  where("type", "==", "in"),
));

if (adjSnap.empty) {
  console.log(`No IN adjustments found for ${ITEM} ${BRANCH} ${DATE}. Nothing to do.`);
  process.exit(0);
}

console.log(`Found ${adjSnap.size} IN adj(s):`);
for (const d of adjSnap.docs) {
  const x = d.data();
  console.log(`  ${d.id}  qty=${x.qty}  note="${x.note ?? ""}"  loggedBy="${x.loggedBy ?? ""}"`);
}

// Match anything qty === 2 (the smoke-test signature). If there's any surprise,
// bail out — refuse to delete unexpected data.
const targets = adjSnap.docs.filter(d => d.data().qty === 2);
const others = adjSnap.docs.filter(d => d.data().qty !== 2);

if (others.length > 0) {
  console.log(`\nERROR: unexpected non-qty=2 IN adj(s) present — refusing to delete.`);
  process.exit(1);
}
if (targets.length !== 1) {
  console.log(`\nERROR: expected exactly 1 qty=2 IN adj, found ${targets.length} — refusing to delete.`);
  process.exit(1);
}

const target = targets[0];
console.log(`\n  [${APPLY ? "APPLY" : "DRY"}] delete adj ${target.id}`);

const batch = writeBatch(db);
batch.delete(target.ref);

console.log(`\n=== 1 op ===`);
if (APPLY) {
  await batch.commit();
  console.log("Committed.");
} else {
  console.log("Dry-run — no writes. Re-run with --apply.");
}
process.exit(0);
