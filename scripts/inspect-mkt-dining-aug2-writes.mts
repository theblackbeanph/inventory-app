// READ-ONLY: dump all MKT/dining writes on Aug 2 to pin down Kent's write path
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";

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

const BRANCH = "MKT", DEPT = "dining";

// 1. All adjustments MKT/dining dated 08-02
console.log("\n═══ ALL MKT/dining adjustments dated 2026-08-02 ═══");
const adjSnap = await getDocs(query(
  collection(db, "branch_adjustments"),
  where("branch", "==", BRANCH), where("department", "==", DEPT),
  where("date", "==", "2026-08-02"),
));
const adjs = adjSnap.docs.map(d => d.data()).sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
for (const a of adjs as any[]) {
  console.log(`  ${String(a.id).padEnd(28)} ${String(a.type).padEnd(13)} qty=${String(a.qty).padStart(4)}  item=${a.item.padEnd(35)} by=${a.loggedBy}  note="${a.note ?? ""}"`);
}
console.log(`  total: ${adjs.length}`);

// 1a. Any count/correction adjustments MKT/dining 08-02 with "carrot" in item name (any spelling)
console.log("\n═══ count/correction adjs MKT/dining 08-02 with item ~ /carrot/i ═══");
const carrotHits = (adjs as any[]).filter(a =>
  (a.type === "count" || a.type === "correction") && /carrot/i.test(a.item ?? "")
);
for (const a of carrotHits) {
  console.log(`  ${String(a.id).padEnd(28)} ${a.type.padEnd(13)} qty=${String(a.qty).padStart(4)}  item="${a.item}"  by=${a.loggedBy}  note="${a.note ?? ""}"`);
}
console.log(`  carrot count/correction hits: ${carrotHits.length}`);

// 1b. Cross-department scan: any count/correction anywhere on 08-02 in MKT with item ~ /carrot/i
console.log("\n═══ MKT count/correction adjs on 08-02 across ALL depts with item ~ /carrot/i ═══");
const allMktSnap = await getDocs(query(
  collection(db, "branch_adjustments"),
  where("branch", "==", BRANCH),
  where("date", "==", "2026-08-02"),
));
const crossDept = allMktSnap.docs.map(d => d.data()).filter((a: any) =>
  (a.type === "count" || a.type === "correction") && /carrot/i.test(a.item ?? "")
);
for (const a of crossDept as any[]) {
  console.log(`  ${String(a.id).padEnd(28)} dept=${(a.department ?? "?").padEnd(8)} ${a.type.padEnd(13)} qty=${String(a.qty).padStart(4)}  item="${a.item}"  by=${a.loggedBy}  note="${a.note ?? ""}"`);
}
console.log(`  cross-dept carrot count/correction hits: ${crossDept.length}`);

// 1c. Also scan 08-03 (in case a mis-dated write landed on the next day)
console.log("\n═══ MKT count/correction adjs on 08-03 across ALL depts with item ~ /carrot/i ═══");
const nextDaySnap = await getDocs(query(
  collection(db, "branch_adjustments"),
  where("branch", "==", BRANCH),
  where("date", "==", "2026-08-03"),
));
const nextDayCarrot = nextDaySnap.docs.map(d => d.data()).filter((a: any) =>
  (a.type === "count" || a.type === "correction") && /carrot/i.test(a.item ?? "")
);
for (const a of nextDayCarrot as any[]) {
  console.log(`  ${String(a.id).padEnd(28)} dept=${(a.department ?? "?").padEnd(8)} ${a.type.padEnd(13)} qty=${String(a.qty).padStart(4)}  item="${a.item}"  by=${a.loggedBy}  note="${a.note ?? ""}"`);
}
console.log(`  08-03 cross-dept carrot count/correction hits: ${nextDayCarrot.length}`);

// 2. All BEG docs dated 08-03 for MKT/dining
console.log("\n═══ ALL MKT/dining daily_beginning docs dated 2026-08-03 ═══");
const begSnap = await getDocs(query(
  collection(db, "daily_beginning"),
  where("branch", "==", BRANCH), where("department", "==", DEPT),
  where("date", "==", "2026-08-03"),
));
const begs = begSnap.docs.map(d => d.data()).sort((a: any, b: any) => a.item.localeCompare(b.item));
for (const b of begs as any[]) {
  console.log(`  ${b.item.padEnd(35)} qty=${String(b.qty).padStart(4)}  setBy=${b.setBy}  updatedAt=${b.updatedAt}`);
}
console.log(`  total: ${begs.length}`);

// 3. Full daily_close for MKT/dining 08-02
console.log("\n═══ MKT/dining daily_close for 2026-08-02 ═══");
const closeSnap = await getDocs(query(
  collection(db, "daily_close"),
  where("branch", "==", BRANCH), where("department", "==", DEPT),
  where("date", "==", "2026-08-02"),
));
for (const d of closeSnap.docs) {
  const c: any = d.data();
  console.log(`  closedBy=${c.closedBy} closedAt=${c.closedAt} countType=${c.countType} isLocked=${c.isLocked}`);
  console.log(`  items (${Object.keys(c.items).length}):`);
  const rows = Object.entries(c.items).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [name, v] of rows as any[]) {
    console.log(`    ${name.padEnd(35)} beg=${String(v.beginning).padStart(3)} in=${String(v.inQty).padStart(3)} out=${String(v.outQty).padStart(3)} exp=${String(v.expected).padStart(3)} end=${String(v.endCount).padStart(3)} var=${v.variance}`);
  }
}

// 4. Any stocktake_drafts for MKT/dining 08-02 or 08-03
console.log("\n═══ stocktake_drafts MKT/dining 2026-08-02 ═══");
const draftSnap02 = await getDocs(query(
  collection(db, "stocktake_drafts"),
  where("branch", "==", BRANCH), where("department", "==", DEPT),
  where("date", "==", "2026-08-02"),
));
for (const d of draftSnap02.docs) {
  const x: any = d.data();
  console.log(`  ${x.id}: savedBy=${x.savedBy} savedAt=${x.savedAt} count-items=${Object.keys(x.counts ?? {}).length}`);
}
console.log(`  total drafts 08-02: ${draftSnap02.size}`);

process.exit(0);
