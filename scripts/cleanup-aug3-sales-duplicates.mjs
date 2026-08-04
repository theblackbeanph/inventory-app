// Cleanup Aug 3 2026 sales_import duplicates from pre-fix modal writes.
// Deletes any sales_import doc where doc's department != CATALOG_MAP.get(item).department.
// Also strips any resulting stale entries from daily_close.items.
// Usage: SEED_EMAIL=... SEED_PASSWORD=... node scripts/cleanup-aug3-sales-duplicates.mjs [--apply]
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore, collection, query, where, getDocs,
  writeBatch, updateDoc, deleteField,
} from "firebase/firestore";
import { CATALOG } from "../src/lib/items.ts";

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

const { SEED_EMAIL, SEED_PASSWORD } = process.env;
const APPLY = process.argv.includes("--apply");
const DATE = "2026-08-03";
const CATALOG_DEPT = new Map(CATALOG.map(i => [i.name, i.department]));

await signInWithEmailAndPassword(auth, SEED_EMAIL, SEED_PASSWORD);

console.log(`\n=== Aug 3 sales_import cleanup ===`);
console.log(`Mode: ${APPLY ? "APPLY (writing to Firestore)" : "DRY-RUN (no changes)"}\n`);

// Phase 1: identify wrong-dept sales_import adjustments
const adjToDelete = [];
for (const branch of ["MKT", "BF"]) {
  const snap = await getDocs(query(
    collection(db, "branch_adjustments"),
    where("branch", "==", branch),
    where("date", "==", DATE),
    where("type", "==", "sales_import"),
  ));
  for (const d of snap.docs) {
    const data = d.data();
    const correctDept = CATALOG_DEPT.get(data.item);
    if (!correctDept) continue;
    if (data.department !== correctDept) {
      adjToDelete.push({ ref: d.ref, branch, dept: data.department, item: data.item, qty: data.qty });
    }
  }
}

console.log(`Wrong-dept sales_import to delete: ${adjToDelete.length}`);
const byBd = {};
for (const a of adjToDelete) {
  const k = `${a.branch}/${a.dept}`;
  byBd[k] = (byBd[k] || 0) + 1;
}
for (const [k, n] of Object.entries(byBd).sort()) console.log(`  ${k}: ${n}`);

// Phase 2: identify stale keys in daily_close.items where item's catalog dept != close dept
const closesToStrip = []; // { ref, closeId, dept, staleItems: [] }
for (const branch of ["MKT", "BF"]) {
  for (const dept of ["kitchen", "bar", "cafe", "dining"]) {
    const closeSnap = await getDocs(query(
      collection(db, "daily_close"),
      where("branch", "==", branch),
      where("department", "==", dept),
      where("date", "==", DATE),
    ));
    if (closeSnap.empty) continue;
    const close = closeSnap.docs[0];
    const closeData = close.data();
    const stale = [];
    for (const item of Object.keys(closeData.items || {})) {
      const correct = CATALOG_DEPT.get(item);
      if (correct && correct !== dept) stale.push(item);
    }
    if (stale.length > 0) {
      closesToStrip.push({ ref: close.ref, closeId: close.id, dept, staleItems: stale });
    }
  }
}

const totalStale = closesToStrip.reduce((s, x) => s + x.staleItems.length, 0);
console.log(`\nDaily_close stale item-keys: ${totalStale} across ${closesToStrip.length} close docs`);
for (const c of closesToStrip) {
  console.log(`  ${c.closeId}: ${c.staleItems.length} items → ${c.staleItems.slice(0, 4).join(", ")}${c.staleItems.length > 4 ? ", ..." : ""}`);
}

if (!APPLY) {
  console.log(`\n[DRY-RUN] Rerun with --apply to execute.`);
  process.exit(0);
}

// Phase 3: delete adjustments in batches
console.log(`\nDeleting ${adjToDelete.length} adjustments...`);
let done = 0;
for (let i = 0; i < adjToDelete.length; i += 400) {
  const chunk = adjToDelete.slice(i, i + 400);
  const batch = writeBatch(db);
  for (const a of chunk) batch.delete(a.ref);
  await batch.commit();
  done += chunk.length;
  console.log(`  ${done}/${adjToDelete.length}`);
}

// Phase 4: strip stale items via updateDoc + deleteField (per-key deletion)
console.log(`\nStripping stale close items...`);
for (const c of closesToStrip) {
  const updates = {};
  for (const k of c.staleItems) updates[`items.${k}`] = deleteField();
  await updateDoc(c.ref, updates);
  console.log(`  ${c.closeId}: -${c.staleItems.length} items`);
}

console.log(`\n✅ Deleted ${adjToDelete.length} adjustments, stripped ${totalStale} close-doc keys.`);
process.exit(0);
