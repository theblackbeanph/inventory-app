// Reset PO-26-0803-MKT001 back to DISCREPANCY state so the new edit-dispute
// feature can be smoke-tested end-to-end on real data.
//
// This UNDOES the effects of cancelDispute (executed 2026-08-04):
//   1. Deletes 4 compensating branch_adjustments on 2026-08-04.
//   2. Reverses the branchStock deltas from those adjustments.
//   3. Deletes all invEntries written by cancelDispute (poRef match + note match).
//   4. Reverts DN.receivedItems for the 4 disputed items to their pre-cancel values,
//      and sets DN.status back to DISCREPANCY.
//   5. Reverts PO.status to DISCREPANCY and clears commissaryInvWritten.
//
// Does NOT touch:
//   - Original 2026-08-03 "commissary transfer" IN adjustments (those stay as-is).
//   - Original branchStock deltas from confirmReceipt (still baked in).
//   - Yesterday's daily_close snapshot.
//
// Usage:
//   SEED_EMAIL=... SEED_PASSWORD=... node scripts/reset-po-mkt-0803-for-smoketest.mjs
//   SEED_EMAIL=... SEED_PASSWORD=... node scripts/reset-po-mkt-0803-for-smoketest.mjs --apply

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore, collection, doc, query, where, getDocs,
  writeBatch, increment, deleteField,
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

const PO_REF = "PO-26-0803-MKT001";
const DN_REF = "DN-26-0803-MKT001";
const BRANCH = "MKT";
const CANCEL_DATE = "2026-08-04";

// Pre-cancel receivedItems for the 4 disputed items (what the branch actually reported).
const PRE_CANCEL_RECEIVED = {
  "Burger Patty":       { receivedQty: 37, dispatchedQty: 39, unit: "pc" },
  "Au Jus":             { receivedQty: 20, dispatchedQty: 25, unit: "pc" },
  "Bacon Jam":          { receivedQty: 25, dispatchedQty: 15, unit: "pc" },
  "Caramelized Onion":  { receivedQty: 15, dispatchedQty: 25, unit: "pc" },
};

// branchStock delta REVERSALS (opposite sign of what cancelDispute applied).
const STOCK_REVERSALS = [
  { item: "Burger Patty",      department: "kitchen", delta: -2  }, // undo +2 IN
  { item: "Au Jus",            department: "kitchen", delta: -5  }, // undo +5 IN
  { item: "Bacon Jam",         department: "kitchen", delta: +10 }, // undo -10 OUT
  { item: "Caramelized Onion", department: "kitchen", delta: -10 }, // undo +10 IN
];

function log(action, detail) {
  console.log(`  [${APPLY ? "APPLY" : "DRY  "}] ${action}  ${detail}`);
}

console.log(`\n=== RESET PLAN for ${PO_REF} / ${DN_REF} — ${APPLY ? "APPLY MODE" : "DRY-RUN"} ===\n`);

const batch = writeBatch(db);
let ops = 0;

// ─── 1) Compensating branch_adjustments (2026-08-04) ─────────────────────────
console.log("--- 1) Delete compensating branch_adjustments (2026-08-04) ---");
const compAdjItems = STOCK_REVERSALS.map(r => r.item);
for (const item of compAdjItems) {
  const snap = await getDocs(query(
    collection(db, "branch_adjustments"),
    where("branch", "==", BRANCH),
    where("date", "==", CANCEL_DATE),
    where("item", "==", item),
  ));
  const matches = snap.docs.filter(d => (d.data().note || "").includes("Dispute cancelled"));
  if (matches.length === 0) {
    console.log(`  WARN: no matching adj found for ${item}`);
    continue;
  }
  if (matches.length > 1) {
    console.log(`  WARN: ${matches.length} matches for ${item} — will delete all`);
  }
  for (const m of matches) {
    const x = m.data();
    log("DEL adj", `id=${m.id} ${item} [${x.type}] qty=${x.qty} note="${x.note}"`);
    batch.delete(m.ref); ops++;
  }
}

// ─── 2) Reverse branchStock deltas ───────────────────────────────────────────
console.log("\n--- 2) Reverse branchStock deltas ---");
for (const { item, department, delta } of STOCK_REVERSALS) {
  const id = `${BRANCH}_${department}_${item}`;
  log("STK inc", `${id} increment(${delta})`);
  batch.set(
    doc(db, "branch_stock", id),
    { qty: increment(delta), lastUpdated: CANCEL_DATE, lastUpdatedBy: "reset-script" },
    { merge: true },
  );
  ops++;
}

// ─── 3) Delete invEntries from cancelDispute ─────────────────────────────────
console.log("\n--- 3) Delete invEntries from cancelDispute (poRef match + note match) ---");
const invSnap = await getDocs(query(
  collection(db, "invEntries"),
  where("poRef", "==", PO_REF),
));
const invMatches = invSnap.docs.filter(d => (d.data().note || "").includes("branch cancelled dispute"));
console.log(`  Found ${invMatches.length} invEntries to delete.`);
for (const d of invMatches) {
  const x = d.data();
  log("DEL inv", `id=${d.id} ${x.item} [${x.type}] qty=${x.qty} date=${x.date}`);
  batch.delete(d.ref); ops++;
}

// ─── 4) Revert DN.receivedItems + status ─────────────────────────────────────
console.log("\n--- 4) Revert DN.receivedItems + status ---");
const dnSnap = await getDocs(query(collection(db, "delivery_notes"), where("dnRef", "==", DN_REF)));
if (dnSnap.empty) {
  console.log(`  ERROR: DN ${DN_REF} not found — aborting.`);
  process.exit(1);
}
const dnDoc = dnSnap.docs[0];
const dnData = dnDoc.data();
const revertedReceivedItems = (dnData.receivedItems || []).map(ri => {
  const pre = PRE_CANCEL_RECEIVED[ri.item];
  if (pre) return { ...ri, receivedQty: pre.receivedQty };
  return ri;
});
log("UPD DN", `id=${dnDoc.id} status → DISCREPANCY, receivedItems reverted for 4 items`);
batch.update(dnDoc.ref, {
  status: "DISCREPANCY",
  receivedItems: revertedReceivedItems,
});
ops++;

// ─── 5) Revert PO ────────────────────────────────────────────────────────────
console.log("\n--- 5) Revert PO status ---");
const poSnap = await getDocs(query(collection(db, "pull_outs"), where("poRef", "==", PO_REF)));
if (poSnap.empty) {
  console.log(`  ERROR: PO ${PO_REF} not found — aborting.`);
  process.exit(1);
}
const poDoc = poSnap.docs[0];
log("UPD PO", `id=${poDoc.id} status → DISCREPANCY, commissaryInvWritten cleared`);
batch.update(poDoc.ref, {
  status: "DISCREPANCY",
  commissaryInvWritten: deleteField(),
});
ops++;

// ─── Commit ──────────────────────────────────────────────────────────────────
console.log(`\n=== TOTAL: ${ops} operations ===`);
if (APPLY) {
  console.log("\nCommitting batch...");
  await batch.commit();
  console.log("Done. PO is now DISCREPANCY. Open the branch app and use 'Edit Received Counts'.");
} else {
  console.log("\nDry-run — no writes. Re-run with --apply to commit.");
}

process.exit(0);
