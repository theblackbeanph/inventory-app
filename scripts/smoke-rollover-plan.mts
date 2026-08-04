// READ-ONLY smoke test for the rollover extraction.
//
// Reads yesterday's Firestore snapshot state for both branches, runs the pure
// computeRolloverPlan on each (branch, dept), and prints the plan diff.
//
// Since yesterday's rollover already ran, healthy state = mostly empty plans
// (all depts show up in `closes`, so partial-fill only fires for real missing
// items; today's BEGs already exist so BEG carry emits nothing).
//
// ANY non-empty plan is worth eyeballing before deploy — it means real prod
// data exposes a shape the tests didn't cover.
//
// Usage:
//   SEED_EMAIL=... SEED_PASSWORD=... npx tsx scripts/smoke-rollover-plan.mts [YYYY-MM-DD]
//   (date defaults to yesterday PHT)

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";
import { computeRolloverPlan, type RolloverInput } from "../src/app/api/cron/rollover/plan";
import { CATALOG } from "../src/lib/items";
import type {
  Branch, Department, StockAdjustment, DailyBeginning, DailyClose, StocktakeDraft,
} from "../src/lib/types";

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

function phtToday(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const yesterday = process.argv[2] ?? addDays(phtToday(), -1);
const today = addDays(yesterday, 1);
const BRANCHES: Branch[] = ["MKT", "BF"];
const DEPARTMENTS: Department[] = ["kitchen", "bar", "cafe", "dining"];

console.log(`\nSmoke test — replaying rollover for ${yesterday} → ${today}`);
console.log(`(healthy state = mostly empty plans; investigate anything non-empty)\n`);

let idCounter = 9_000_000;
const nextAdjId = () => ++idCounter;
const now = Date.now();
const nowISO = new Date().toISOString();

for (const branch of BRANCHES) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ${branch}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const [adjSnap, begSnap, closeSnap, todayBegSnap, draftSnap] = await Promise.all([
    getDocs(query(collection(db, "branch_adjustments"), where("branch", "==", branch), where("date", "==", yesterday))),
    getDocs(query(collection(db, "daily_beginning"),    where("branch", "==", branch), where("date", "==", yesterday))),
    getDocs(query(collection(db, "daily_close"),        where("branch", "==", branch), where("date", "==", yesterday))),
    getDocs(query(collection(db, "daily_beginning"),    where("branch", "==", branch), where("date", "==", today))),
    getDocs(query(collection(db, "stocktake_drafts"),   where("branch", "==", branch), where("date", "==", yesterday))),
  ]);

  const adjustments     = adjSnap.docs.map(d => d.data() as StockAdjustment);
  const beginnings      = begSnap.docs.map(d => d.data() as DailyBeginning);
  const closes          = closeSnap.docs.map(d => d.data() as DailyClose);
  const todayBeginnings = todayBegSnap.docs.map(d => d.data() as DailyBeginning);
  const drafts          = draftSnap.docs.map(d => ({ id: d.id, data: d.data() as StocktakeDraft }));

  console.log(`  fetched: ${adjustments.length} adj · ${beginnings.length} beg · ${closes.length} close · ${todayBeginnings.length} todayBeg · ${drafts.length} draft`);

  for (const dept of DEPARTMENTS) {
    const deptCatalog = CATALOG.filter(i => i.department === dept && (!i.branches || i.branches.includes(branch)));

    const input: RolloverInput = {
      branch, dept, yesterday, today,
      adjustments, beginnings, closes, todayBeginnings, drafts,
      deptCatalog,
      clock: { now, nowISO, nextAdjId },
    };

    const plan = computeRolloverPlan(input);
    const cw = plan.closeWrites.length;
    const dd = plan.draftDeletes.length;
    const bw = plan.begWrites.length;

    const marker = (cw + dd + bw) === 0 ? "✓" : "⚠";
    console.log(`\n  ${marker} ${branch}/${dept} — close:${cw} draftDel:${dd} beg:${bw}`);
    for (const line of plan.logs) console.log(`      · ${line}`);

    if (cw > 0) {
      console.log(`      closeWrites:`);
      for (const w of plan.closeWrites) {
        if (w.kind === "adjAutoId") {
          console.log(`        - adjAutoId  ${w.data.item.padEnd(30)} type=${w.data.type} qty=${w.data.qty} note="${w.data.note}"`);
        } else if (w.kind === "closeSet") {
          console.log(`        - closeSet   id=${w.id} items=${Object.keys(w.data.items).length}`);
        } else if (w.kind === "closeMerge") {
          console.log(`        - closeMerge id=${w.id} items=[${Object.keys(w.items).join(", ")}]`);
        } else if (w.kind === "branchStockMerge") {
          console.log(`        - stockMerge ${w.data.item.padEnd(30)} qty=${w.data.qty}`);
        }
      }
    }
    if (dd > 0) {
      console.log(`      draftDeletes: ${plan.draftDeletes.join(", ")}`);
    }
    if (bw > 0) {
      console.log(`      begWrites:`);
      for (const w of plan.begWrites) {
        if (w.kind === "begSet") {
          console.log(`        - ${w.data.item.padEnd(30)} qty=${w.data.qty}`);
        }
      }
    }
  }
}

console.log(`\nDone. Any ⚠ above is worth eyeballing before deploy.\n`);
process.exit(0);
