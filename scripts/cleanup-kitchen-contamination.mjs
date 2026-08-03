#!/usr/bin/env node
// Cleanup kitchen-item contamination from dining daily_close/adjustments
// Usage: node cleanup-kitchen-contamination.mjs [--apply]
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs, doc, writeBatch, deleteDoc, deleteField } from "firebase/firestore";
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
const diningCatalog = new Set(CATALOG.filter(i => i.department === "dining").map(i => i.name));

await signInWithEmailAndPassword(auth, SEED_EMAIL, SEED_PASSWORD);

console.log(`\n=== Kitchen-Item Contamination Cleanup ===\n`);
console.log(`Mode: ${APPLY ? "APPLY (writing to Firestore)" : "DRY-RUN (no changes)"}\n`);

// Phase 1: Identify all contaminated items
const pollutedItems = new Set();
const closeDocUpdates = {}; // keyed by doc ID, maps item → null (for deletion)

console.log(`Scanning dining closes from 2026-07-15...\n`);

for (const branch of ["MKT", "BF"]) {
  const q = query(
    collection(db, "daily_close"),
    where("branch", "==", branch),
    where("department", "==", "dining")
  );
  const snap = await getDocs(q);

  for (const docSnap of snap.docs) {
    const close = docSnap.data();
    const date = close.date;
    if (date < "2026-07-15") continue;

    const pollutedInDoc = [];
    for (const item of Object.keys(close.items || {})) {
      if (!diningCatalog.has(item)) {
        pollutedItems.add(item);
        pollutedInDoc.push(item);
        if (!closeDocUpdates[docSnap.id]) closeDocUpdates[docSnap.id] = {};
        closeDocUpdates[docSnap.id][item] = null; // Mark for deletion
      }
    }

    if (pollutedInDoc.length > 0) {
      console.log(`  ${branch}/${date}: ${pollutedInDoc.length} polluted items`);
    }
  }
}

console.log(`\nTotal polluted items: ${pollutedItems.size}`);
console.log(`Affected daily_close docs: ${Object.keys(closeDocUpdates).length}\n`);

// Phase 2: Build delete plan
const deletePlan = {
  closeItemKeys: Object.keys(closeDocUpdates).length,
  adjustmentDocs: 0,
  beginningDocs: 0,
};

console.log(`Cleanup Plan:\n`);
console.log(`1. Remove item-keys from daily_close (${deletePlan.closeItemKeys} docs)`);

// Count adjustment docs to delete
let adjCount = 0;
for (const item of pollutedItems) {
  const adjQ = query(
    collection(db, "branch_adjustments"),
    where("branch", "==", "MKT"),
    where("department", "==", "dining"),
    where("item", "==", item)
  );
  const adjSnap = await getDocs(adjQ);
  for (const d of adjSnap.docs) {
    if (d.data().type === "sales_import") adjCount++;
  }
}
deletePlan.adjustmentDocs = adjCount;
console.log(`2. Delete branch_adjustments docs (${adjCount} sales_import docs)`);
console.log(`3. daily_beginning: auto-heal on next rollover (0 docs to delete)\n`);

if (!APPLY) {
  console.log(`[DRY_RUN] No changes will be made. Rerun with --apply flag to execute cleanup.\n`);
  process.exit(0);
}

// Phase 3: Execute cleanup
console.log(`Executing cleanup...\n`);

// Delete from daily_close
let batchCount = 0;
let docCount = 0;
for (const [docId, itemsToDelete] of Object.entries(closeDocUpdates)) {
  const batch = writeBatch(db);
  for (const item of Object.keys(itemsToDelete)) {
    batch.update(doc(db, "daily_close", docId), { [`items.${item}`]: deleteField() });
  }
  await batch.commit();
  docCount++;
  batchCount++;
  console.log(`  Batch ${batchCount}: daily_close/${docId} (${Object.keys(itemsToDelete).length} items removed)`);
  if (batchCount % 5 === 0) console.log(`  ...${batchCount} batches committed\n`);
}

// Delete adjustments (batched by 500)
let adjBatch = 0;
const adjToDelete = [];
for (const item of pollutedItems) {
  const adjQ = query(
    collection(db, "branch_adjustments"),
    where("branch", "==", "MKT"),
    where("department", "==", "dining"),
    where("item", "==", item)
  );
  const adjSnap = await getDocs(adjQ);
  for (const d of adjSnap.docs) {
    if (d.data().type === "sales_import") adjToDelete.push(d.ref);
  }
}

for (let i = 0; i < adjToDelete.length; i += 500) {
  const chunk = adjToDelete.slice(i, i + 500);
  const batch = writeBatch(db);
  for (const ref of chunk) batch.delete(ref);
  await batch.commit();
  adjBatch++;
  console.log(`  Batch: deleted ${chunk.length} adjustments`);
}

console.log(`\n✅ Cleanup complete. Total batches: ${batchCount + adjBatch}\n`);

// Phase 4: Verification
console.log(`Verifying...\n`);
let verifyErrors = 0;
for (const [docId, itemsToDelete] of Object.entries(closeDocUpdates)) {
  const docSnap = await getDocs(query(collection(db, "daily_close"), where("__name__", "==", docId)));
  if (!docSnap.empty) {
    const close = docSnap.docs[0].data();
    for (const item of Object.keys(itemsToDelete)) {
      if (close.items && close.items[item]) {
        console.log(`  ✗ ${docId}: still contains ${item}`);
        verifyErrors++;
      }
    }
  }
}

if (verifyErrors === 0) {
  console.log(`✓ Verification passed: all polluted items removed\n`);
} else {
  console.log(`⚠ ${verifyErrors} verification errors\n`);
}
