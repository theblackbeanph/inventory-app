// Patch the phantom BEG=14 for MKT/dining Oventime Carrot Cake on 2026-08-03.
//
// Root cause: an out-of-band write set Aug 3 BEG=14 (setBy=Kent, updatedAt=2026-08-02).
// The correct value is 9 (Aug 2 close.items[OCC].endCount).
// The wrong BEG propagated into Aug 3's auto-filled close and Aug 4's BEG.
//
// Ops (5 total when Aug 4 close exists):
//   1) daily_beginning Aug 3: qty 14 → 9 (setBy=Kent → system)
//   2) branch_adjustments Aug 3 auto-fill count: qty 14 → 9 (loggedBy=system)
//   3) daily_close Aug 3 items[OCC]: rewrite with beg=9, live in/out, end=9, var=0
//   4) daily_beginning Aug 4: qty 14 → 9 (setBy=system → system)
//   5) daily_close Aug 4 items[OCC]: rewrite with beg=9, live in/out, preserve
//      real manual endCount (12), recompute variance
//
// Safety:
//   - Anchors on Aug 2 close.items[OCC].endCount === 9. Refuses to run otherwise.
//   - "Real" manual counts distinguished from rollover auto-fills via loggedBy !== "system".
//   - Refuses to run if it finds >1 BEG doc per date or ambiguous count history.
//
// Usage:
//   SEED_EMAIL=... SEED_PASSWORD=... node scripts/patch-oventime-carrot-cake-0803-beg.mjs
//   SEED_EMAIL=... SEED_PASSWORD=... node scripts/patch-oventime-carrot-cake-0803-beg.mjs --apply

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

const BRANCH = "MKT", DEPT = "dining", ITEM = "Oventime Carrot Cake";
const D_AUG02 = "2026-08-02";
const D_AUG03 = "2026-08-03";
const D_AUG04 = "2026-08-04";
const CORRECT_AUG03_BEG = 9;

console.log(`\n=== PATCH ${ITEM} (MKT/dining) — ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`);

// ── Sum live IN/OUT + collect real manual counts (excludes system auto-fills) ─
async function inspectDay(date) {
  const snap = await getDocs(query(
    collection(db, "branch_adjustments"),
    where("branch", "==", BRANCH),
    where("date", "==", date),
    where("item", "==", ITEM),
  ));
  let inQty = 0, outQty = 0;
  const systemCounts = [];  // rollover auto-fills
  const realCounts = [];    // team-entered counts + corrections
  for (const d of snap.docs) {
    const x = d.data();
    if (x.type === "in") inQty += x.qty;
    else if (x.type === "out" || x.type === "waste" || x.type === "sales_import") outQty += x.qty;
    else if (x.type === "count" || x.type === "correction") {
      if (x.loggedBy === "system") systemCounts.push({ ref: d.ref, id: d.id, qty: x.qty, note: x.note });
      else realCounts.push({ ref: d.ref, id: d.id, qty: x.qty, loggedBy: x.loggedBy, note: x.note });
    }
  }
  return { inQty, outQty, systemCounts, realCounts };
}

// ── Verify anchor ─────────────────────────────────────────────────────────────
const dc02Ref = doc(db, "daily_close", `${BRANCH}__${DEPT}__${D_AUG02}`);
const dc02Snap = await getDoc(dc02Ref);
if (!dc02Snap.exists()) { console.log(`ERROR: Aug 2 daily_close missing`); process.exit(1); }
const aug02Entry = dc02Snap.data().items?.[ITEM];
console.log(`  Aug 2 close.items[${ITEM}]: ${JSON.stringify(aug02Entry)}`);
if (!aug02Entry || aug02Entry.endCount !== CORRECT_AUG03_BEG) {
  console.log(`ERROR: expected Aug 2 endCount=${CORRECT_AUG03_BEG}, got ${aug02Entry?.endCount}. Refusing.`);
  process.exit(1);
}

const batch = writeBatch(db);
let ops = 0;

// ── Aug 3 BEG ─────────────────────────────────────────────────────────────────
const beg03Snap = await getDocs(query(
  collection(db, "daily_beginning"),
  where("branch", "==", BRANCH),
  where("date", "==", D_AUG03),
  where("item", "==", ITEM),
));
if (beg03Snap.empty) { console.log(`ERROR: Aug 3 BEG doc missing`); process.exit(1); }
if (beg03Snap.size > 1) { console.log(`ERROR: ${beg03Snap.size} Aug 3 BEG docs`); process.exit(1); }
const beg03Doc = beg03Snap.docs[0];
const oldAug03Beg = beg03Doc.data().qty;
console.log(`\n  [${APPLY ? "APPLY" : "DRY"}] Aug 3 BEG: qty ${oldAug03Beg} → ${CORRECT_AUG03_BEG} (setBy=${beg03Doc.data().setBy} → system)`);
batch.update(beg03Doc.ref, { qty: CORRECT_AUG03_BEG, setBy: "system", updatedAt: D_AUG03 });
ops++;

// ── Aug 3 auto-fill count adj + close ─────────────────────────────────────────
const aug03 = await inspectDay(D_AUG03);
console.log(`\n  Aug 3 live: IN=${aug03.inQty} OUT=${aug03.outQty} systemCounts=${aug03.systemCounts.length} realCounts=${aug03.realCounts.length}`);
if (aug03.realCounts.length) {
  console.log(`ERROR: Aug 3 has ${aug03.realCounts.length} real count(s) — patch strategy assumes none. ${JSON.stringify(aug03.realCounts)}`);
  process.exit(1);
}
if (aug03.systemCounts.length !== 1) {
  console.log(`ERROR: expected 1 Aug 3 system auto-fill count, found ${aug03.systemCounts.length}`);
  process.exit(1);
}
const aug03Expected = CORRECT_AUG03_BEG + aug03.inQty - aug03.outQty;
const aug03EndCount = aug03Expected;  // auto-filled = end tracks expected
const sysCnt03 = aug03.systemCounts[0];
console.log(`  [${APPLY ? "APPLY" : "DRY"}] Aug 3 auto-fill count adj ${sysCnt03.id}: qty ${sysCnt03.qty} → ${aug03EndCount}`);
batch.update(sysCnt03.ref, { qty: aug03EndCount });
ops++;

const dc03Ref = doc(db, "daily_close", `${BRANCH}__${DEPT}__${D_AUG03}`);
const dc03Snap = await getDoc(dc03Ref);
if (!dc03Snap.exists()) { console.log(`ERROR: Aug 3 daily_close missing`); process.exit(1); }
const aug03Before = dc03Snap.data().items?.[ITEM];
const aug03After = {
  beginning: CORRECT_AUG03_BEG,
  inQty: aug03.inQty,
  outQty: aug03.outQty,
  expected: aug03Expected,
  endCount: aug03EndCount,
  variance: 0,
};
console.log(`  BEFORE Aug 3 close.items[${ITEM}] = ${JSON.stringify(aug03Before)}`);
console.log(`  AFTER  Aug 3 close.items[${ITEM}] = ${JSON.stringify(aug03After)}`);
batch.update(dc03Ref, { [`items.${ITEM}`]: aug03After });
ops++;

// ── Aug 4 BEG (cascades from Aug 3 endCount) ─────────────────────────────────
const beg04Snap = await getDocs(query(
  collection(db, "daily_beginning"),
  where("branch", "==", BRANCH),
  where("date", "==", D_AUG04),
  where("item", "==", ITEM),
));
if (beg04Snap.empty) {
  console.log(`\n  (no Aug 4 BEG doc — skipping Aug 4 patch)`);
} else {
  if (beg04Snap.size > 1) { console.log(`ERROR: ${beg04Snap.size} Aug 4 BEG docs`); process.exit(1); }
  const beg04Doc = beg04Snap.docs[0];
  const oldAug04Beg = beg04Doc.data().qty;
  console.log(`\n  [${APPLY ? "APPLY" : "DRY"}] Aug 4 BEG: qty ${oldAug04Beg} → ${aug03EndCount} (setBy=${beg04Doc.data().setBy} → system)`);
  batch.update(beg04Doc.ref, { qty: aug03EndCount, setBy: "system", updatedAt: D_AUG04 });
  ops++;

  const dc04Ref = doc(db, "daily_close", `${BRANCH}__${DEPT}__${D_AUG04}`);
  const dc04Snap = await getDoc(dc04Ref);
  if (dc04Snap.exists() && dc04Snap.data().items?.[ITEM]) {
    const aug04Before = dc04Snap.data().items[ITEM];
    const aug04 = await inspectDay(D_AUG04);
    console.log(`\n  Aug 4 live: IN=${aug04.inQty} OUT=${aug04.outQty} systemCounts=${aug04.systemCounts.length} realCounts=${aug04.realCounts.length}`);
    // Preserve real manual count if present; else fall back to whatever close had.
    const preservedEnd = aug04.realCounts.length
      ? aug04.realCounts[aug04.realCounts.length - 1].qty
      : (aug04Before.endCount ?? (aug03EndCount + aug04.inQty - aug04.outQty));
    const aug04Expected = aug03EndCount + aug04.inQty - aug04.outQty;
    const aug04After = {
      beginning: aug03EndCount,
      inQty: aug04.inQty,
      outQty: aug04.outQty,
      expected: aug04Expected,
      endCount: preservedEnd,
      variance: preservedEnd - aug04Expected,
    };
    console.log(`  BEFORE Aug 4 close.items[${ITEM}] = ${JSON.stringify(aug04Before)}`);
    console.log(`  AFTER  Aug 4 close.items[${ITEM}] = ${JSON.stringify(aug04After)}`);
    batch.update(dc04Ref, { [`items.${ITEM}`]: aug04After });
    ops++;

    if (aug04After.variance !== 0) {
      console.log(`\n  ⚠  Aug 4 residual variance = ${aug04After.variance} — genuine inventory gap`);
      console.log(`     After the patch, ${Math.abs(aug04After.variance)} unit(s) of ${ITEM} are unaccounted for on Aug 4.`);
      console.log(`     Physically re-verify shelf count; if the loss is real, log a waste adjustment`);
      console.log(`     for the gap so the running balance reconciles going forward.`);
    }
  } else {
    console.log(`  (no Aug 4 close entry for ${ITEM} — BEG update only)`);
  }
}

console.log(`\n=== ${ops} op(s) ===`);
if (APPLY) {
  await batch.commit();
  console.log("Committed.");
} else {
  console.log("Dry-run — no writes. Re-run with --apply.");
}
process.exit(0);
