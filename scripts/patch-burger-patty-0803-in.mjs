// Patch 2026-08-03 Burger Patty IN to reflect true dispatched qty (39, not 37).
// - Mutates the existing "commissary transfer" branch_adjustments doc: qty 37 → 39.
// - Rewrites daily_close.items["Burger Patty"] with corrected inQty + live outQty (16)
//   and recomputed expected/variance.
//
// Does NOT touch branch_stock (Burger Patty already correct from Path 2 smoke test).
// Does NOT delete or add adjustments.
//
// Usage:
//   SEED_EMAIL=... SEED_PASSWORD=... node scripts/patch-burger-patty-0803-in.mjs
//   SEED_EMAIL=... SEED_PASSWORD=... node scripts/patch-burger-patty-0803-in.mjs --apply

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore, collection, doc, getDoc, query, where, getDocs, writeBatch,
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

const BRANCH = "MKT", DEPT = "kitchen", DATE = "2026-08-03", ITEM = "Burger Patty";
const NEW_IN = 39;

console.log(`\n=== PATCH ${ITEM} ${DATE} IN → ${NEW_IN} — ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`);

const batch = writeBatch(db);

// 1) Locate the "commissary transfer" IN adjustment for 08-03
const adjSnap = await getDocs(query(
  collection(db, "branch_adjustments"),
  where("branch", "==", BRANCH),
  where("date", "==", DATE),
  where("item", "==", ITEM),
  where("type", "==", "in"),
));
const transferAdj = adjSnap.docs.find(d => (d.data().note || "").includes("commissary transfer"));
if (!transferAdj) { console.log(`ERROR: no "commissary transfer" IN adj found for ${ITEM} ${DATE}`); process.exit(1); }
const oldQty = transferAdj.data().qty;
console.log(`  [${APPLY ? "APPLY" : "DRY"}] adj ${transferAdj.id}: qty ${oldQty} → ${NEW_IN}`);
batch.update(transferAdj.ref, { qty: NEW_IN });

// 2) Recompute daily_close.items[Burger Patty] using live 08-03 sums
const dcRef = doc(db, "daily_close", `${BRANCH}__${DEPT}__${DATE}`);
const dcSnap = await getDoc(dcRef);
if (!dcSnap.exists()) { console.log(`ERROR: daily_close doc missing`); process.exit(1); }
const dc = dcSnap.data();
const bpBefore = dc.items?.[ITEM];
console.log(`  BEFORE dailyClose.items["${ITEM}"] = ${JSON.stringify(bpBefore)}`);

// Live OUT for 08-03 Burger Patty = sum of sales_import + waste + count-adj OUTs (excl. type "count" which is END).
const outSnap = await getDocs(query(
  collection(db, "branch_adjustments"),
  where("branch", "==", BRANCH),
  where("date", "==", DATE),
  where("item", "==", ITEM),
));
let liveOut = 0;
for (const d of outSnap.docs) {
  const x = d.data();
  if (x.type === "sales_import" || x.type === "waste" || x.type === "out") liveOut += x.qty;
}
const beg = bpBefore?.beginning ?? 5;
const endCount = bpBefore?.endCount ?? 28;
const newExpected = beg + NEW_IN - liveOut;
const newVariance = endCount - newExpected;
const bpAfter = { beginning: beg, inQty: NEW_IN, outQty: liveOut, expected: newExpected, endCount, variance: newVariance };
console.log(`  AFTER  dailyClose.items["${ITEM}"] = ${JSON.stringify(bpAfter)}`);
batch.update(dcRef, { [`items.${ITEM}`]: bpAfter });

console.log(`\n=== 2 ops ===`);
if (APPLY) {
  await batch.commit();
  console.log("Committed.");
} else {
  console.log("Dry-run — no writes. Re-run with --apply.");
}
process.exit(0);
