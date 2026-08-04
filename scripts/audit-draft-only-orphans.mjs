// READ-ONLY audit.
// For the last N days (default 30), find stocktake_drafts entries where:
//   - the drafted item has NO daily_beginning for that (branch, dept, date)
//   - AND NO branch_adjustments (any type) for that (branch, dept, date, item)
//
// These are "draft-only orphans" — the partial-stocktake fallback in
// rollover/route.ts would silently drop them (itemsWithData is built from
// deptBeg + deptAdj only, drafts are not included).
//
// Purpose: decide whether the current behavior is intentional (dead entries)
// or a latent bug (real counts being lost) before locking it in with a test.
//
// Usage:
//   SEED_EMAIL=... SEED_PASSWORD=... node scripts/audit-draft-only-orphans.mjs [days]

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";

const DAYS = Number(process.argv[2] ?? 30);

const app = initializeApp({
  apiKey: "AIzaSyBLBVqOwq6PRqNJJIQHlnsPR232Tu3ZV2s",
  authDomain: "commissary-dashboard-ccd7c.firebaseapp.com",
  projectId: "commissary-dashboard-ccd7c",
});
const auth = getAuth(app);
const db = getFirestore(app);
const { SEED_EMAIL, SEED_PASSWORD } = process.env;
if (!SEED_EMAIL || !SEED_PASSWORD) {
  console.error("Set SEED_EMAIL and SEED_PASSWORD env vars.");
  process.exit(1);
}
await signInWithEmailAndPassword(auth, SEED_EMAIL, SEED_PASSWORD);

function phtDateNDaysAgo(n) {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const dates = Array.from({ length: DAYS }, (_, i) => phtDateNDaysAgo(i + 1));
console.log(`Auditing ${DAYS} days: ${dates[dates.length - 1]} → ${dates[0]}`);

const findings = [];
let totalDrafts = 0;
let totalDraftItems = 0;

for (const date of dates) {
  const draftSnap = await getDocs(
    query(collection(db, "stocktake_drafts"), where("date", "==", date))
  );
  if (draftSnap.empty) continue;

  // Fetch beg + adj for every (branch, dept) pair present in drafts, once per pair
  const pairs = new Set();
  for (const d of draftSnap.docs) {
    const x = d.data();
    pairs.add(`${x.branch}__${x.department}`);
  }

  const begByPair = {};
  const adjByPair = {};
  for (const pair of pairs) {
    const [branch, dept] = pair.split("__");
    const [begSnap, adjSnap] = await Promise.all([
      getDocs(query(
        collection(db, "daily_beginning"),
        where("branch", "==", branch),
        where("department", "==", dept),
        where("date", "==", date),
      )),
      getDocs(query(
        collection(db, "branch_adjustments"),
        where("branch", "==", branch),
        where("department", "==", dept),
        where("date", "==", date),
      )),
    ]);
    begByPair[pair] = new Set(begSnap.docs.map(d => d.data().item));
    adjByPair[pair] = new Set(adjSnap.docs.map(d => d.data().item));
  }

  for (const d of draftSnap.docs) {
    const draft = d.data();
    totalDrafts++;
    const pair = `${draft.branch}__${draft.department}`;
    const begSet = begByPair[pair] ?? new Set();
    const adjSet = adjByPair[pair] ?? new Set();
    for (const [item, qty] of Object.entries(draft.counts ?? {})) {
      totalDraftItems++;
      if (!begSet.has(item) && !adjSet.has(item)) {
        findings.push({
          date, branch: draft.branch, department: draft.department,
          item, qty, draftId: d.id,
        });
      }
    }
  }
}

console.log(`\nScanned ${totalDrafts} draft docs, ${totalDraftItems} drafted item-lines.`);
console.log(`Found ${findings.length} draft-only orphan(s):\n`);

if (findings.length === 0) {
  console.log("  (none) — current partial-fill behavior has never dropped a real draft count.");
} else {
  for (const f of findings) {
    console.log(`  ${f.date}  ${f.branch}/${f.department}  ${f.item}  qty=${f.qty}  [draft ${f.draftId}]`);
  }
}

process.exit(0);
