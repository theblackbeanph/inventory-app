// READ-ONLY inspection of MKT / dining / Oventime Carrot Cake since 2026-07-31.
// Reconstructs daily BEG + IN - OUT = EXPECTED vs END from source docs.

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyBLBVqOwq6PRqNJJIQHlnsPR232Tu3ZV2s",
  authDomain: "commissary-dashboard-ccd7c.firebaseapp.com",
  projectId: "commissary-dashboard-ccd7c",
});
const auth = getAuth(app);
const db = getFirestore(app);
const { SEED_EMAIL, SEED_PASSWORD } = process.env;
if (!SEED_EMAIL || !SEED_PASSWORD) { console.error("Set SEED_EMAIL and SEED_PASSWORD"); process.exit(1); }
await signInWithEmailAndPassword(auth, SEED_EMAIL, SEED_PASSWORD);

const BRANCH = "MKT";
const DEPT = "dining";
const ITEM = "Oventime Carrot Cake";
const DATES = ["2026-07-31", "2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05"];

console.log(`\nInspecting ${BRANCH} / ${DEPT} / "${ITEM}" from ${DATES[0]} → ${DATES[DATES.length - 1]}\n`);

// Current branchStock
const stockId = `${BRANCH}__${DEPT}__${ITEM.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
console.log(`branchStock doc probe: ${stockId}`);
const stockSnap = await getDoc(doc(db, "branch_stock", stockId));
if (stockSnap.exists()) {
  const s = stockSnap.data();
  console.log(`  qty=${s.qty} lastUpdated=${s.lastUpdated} by=${s.lastUpdatedBy}\n`);
} else {
  console.log(`  (not found — trying broader query)\n`);
  const qs = await getDocs(query(
    collection(db, "branch_stock"),
    where("branch", "==", BRANCH),
    where("department", "==", DEPT),
    where("item", "==", ITEM),
  ));
  for (const d of qs.docs) {
    const s = d.data();
    console.log(`  ${d.id}: qty=${s.qty} lastUpdated=${s.lastUpdated} by=${s.lastUpdatedBy}\n`);
  }
}

for (const date of DATES) {
  const [begSnap, adjSnap, closeSnap] = await Promise.all([
    getDocs(query(
      collection(db, "daily_beginning"),
      where("branch", "==", BRANCH), where("department", "==", DEPT),
      where("item", "==", ITEM), where("date", "==", date),
    )),
    getDocs(query(
      collection(db, "branch_adjustments"),
      where("branch", "==", BRANCH), where("department", "==", DEPT),
      where("item", "==", ITEM), where("date", "==", date),
    )),
    getDocs(query(
      collection(db, "daily_close"),
      where("branch", "==", BRANCH), where("department", "==", DEPT),
      where("date", "==", date),
    )),
  ]);

  const begDocs = begSnap.docs.map(d => d.data());
  const adjDocs = adjSnap.docs.map(d => d.data());
  const closeDocs = closeSnap.docs.map(d => d.data());

  const beg = begDocs[0]?.qty ?? "—";
  // Show raw BEG doc metadata for trace
  for (const b of begDocs) {
    console.log(`  BEG doc: id=${b.id}  qty=${b.qty}  setBy=${b.setBy}  updatedAt=${b.updatedAt}`);
  }
  const inTotal  = adjDocs.filter(a => a.type === "in").reduce((s, a) => s + a.qty, 0);
  const outTotal = adjDocs.filter(a => ["out", "waste", "sales_import"].includes(a.type)).reduce((s, a) => s + a.qty, 0);
  const count    = adjDocs.filter(a => a.type === "count").sort((a, b) => b.id - a.id)[0];
  const corr     = adjDocs.filter(a => a.type === "correction");
  const closeItem = closeDocs[0]?.items?.[ITEM];

  console.log(`── ${date} ─────────────────────────────────────────────`);
  console.log(`  BEG: ${beg}${begDocs[0] ? `  (setBy=${begDocs[0].setBy})` : ""}`);
  console.log(`  IN:  ${inTotal}   OUT: ${outTotal}`);
  console.log(`  adjustments (${adjDocs.length}):`);
  for (const a of adjDocs.sort((x, y) => x.id - y.id)) {
    console.log(`    - id=${a.id} type=${a.type.padEnd(13)} qty=${String(a.qty).padStart(4)}  loggedBy=${a.loggedBy}  note="${a.note ?? ""}"`);
  }
  if (count) console.log(`  latest count adj → qty=${count.qty} (id=${count.id})`);
  if (corr.length) console.log(`  corrections: ${corr.length} → latest qty=${corr.at(-1)!.qty}`);
  if (closeItem) {
    console.log(`  daily_close.items["${ITEM}"]:`);
    console.log(`    beg=${closeItem.beginning}  in=${closeItem.inQty}  out=${closeItem.outQty}`);
    console.log(`    expected=${closeItem.expected}  endCount=${closeItem.endCount}  variance=${closeItem.variance}`);
    console.log(`    close.countType=${closeDocs[0].countType}  closedBy=${closeDocs[0].closedBy}  closedAt=${closeDocs[0].closedAt}`);
  } else if (closeDocs[0]) {
    console.log(`  daily_close exists for this dept/date but does NOT include "${ITEM}"`);
    console.log(`    close.countType=${closeDocs[0].countType}  closedBy=${closeDocs[0].closedBy}`);
  } else {
    console.log(`  (no daily_close for this dept/date)`);
  }
  console.log();
}

process.exit(0);
