// Renames "Coke" → "Coke Regular" across all Firestore collections.
// Affected branch: BF only (Coke is BF-only item).
//
// Usage:
//   SEED_PASSWORD=xxx node scripts/migrate-coke-rename.mjs          (dry run)
//   SEED_PASSWORD=xxx node scripts/migrate-coke-rename.mjs --apply

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";

const DRY_RUN = !process.argv.includes("--apply");
if (DRY_RUN) console.log("DRY RUN — pass --apply to commit changes\n");

const { SEED_PASSWORD } = process.env;
if (!SEED_PASSWORD) {
  console.error("Usage: SEED_PASSWORD=xxx node scripts/migrate-coke-rename.mjs [--apply]");
  process.exit(1);
}

const app = initializeApp({
  apiKey: "AIzaSyBLBVqOwq6PRqNJJIQHlnsPR232Tu3ZV2s",
  authDomain: "commissary-dashboard-ccd7c.firebaseapp.com",
  projectId: "commissary-dashboard-ccd7c",
  storageBucket: "commissary-dashboard-ccd7c.firebasestorage.app",
  messagingSenderId: "430542841830",
  appId: "1:430542841830:web:commissary-dashboard",
});

const auth = getAuth(app);
const db   = getFirestore(app);

await signInWithEmailAndPassword(auth, "chris@theblackbean.ph", SEED_PASSWORD);
console.log("Authenticated.\n");

const OLD_NAME = "Coke";
const NEW_NAME = "Coke Regular";

function itemSlug(name) {
  return name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
}

let totalChanges = 0;

// ── 1. branch_stock ──────────────────────────────────────────────────────────
// Doc ID: BF__dining__Coke  →  BF__dining__Coke_Regular
{
  const oldId = `BF__dining__${itemSlug(OLD_NAME)}`;
  const newId = `BF__dining__${itemSlug(NEW_NAME)}`;
  const oldRef = doc(db, "branch_stock", oldId);
  const snap = await getDoc(oldRef);
  if (snap.exists()) {
    const data = snap.data();
    console.log(`[branch_stock] found: ${oldId}  (qty: ${data.qty})`);
    console.log(`  → rename to: ${newId}`);
    if (!DRY_RUN) {
      await setDoc(doc(db, "branch_stock", newId), { ...data, id: newId, item: NEW_NAME });
      await deleteDoc(oldRef);
      console.log("  ✓ done");
    }
    totalChanges++;
  } else {
    console.log(`[branch_stock] no doc found for: ${oldId}`);
  }
}

// ── 2. branch_adjustments ────────────────────────────────────────────────────
// Query by item field; update item field (and recreate doc if ID encodes item slug).
{
  const snap = await getDocs(query(collection(db, "branch_adjustments"), where("item", "==", OLD_NAME)));
  console.log(`\n[branch_adjustments] found ${snap.size} doc(s) with item == "${OLD_NAME}"`);
  for (const d of snap.docs) {
    const data = d.data();
    const oldDocId = d.id;
    // If doc ID ends with old slug, it needs to be recreated with new ID.
    const oldSlug = itemSlug(OLD_NAME);
    const newSlug = itemSlug(NEW_NAME);
    const needsIdRename = oldDocId.endsWith(`__${oldSlug}`);
    const newDocId = needsIdRename ? oldDocId.replace(new RegExp(`__${oldSlug}$`), `__${newSlug}`) : oldDocId;
    if (needsIdRename) {
      console.log(`  recreate: ${oldDocId}  →  ${newDocId}`);
    } else {
      console.log(`  update item field in: ${oldDocId}`);
    }
    if (!DRY_RUN) {
      if (needsIdRename) {
        await setDoc(doc(db, "branch_adjustments", newDocId), { ...data, item: NEW_NAME });
        await deleteDoc(d.ref);
      } else {
        await updateDoc(d.ref, { item: NEW_NAME });
      }
      console.log("  ✓ done");
    }
    totalChanges++;
  }
}

// ── 3. daily_beginning ───────────────────────────────────────────────────────
// Doc ID: BF__dining__Coke__YYYY-MM-DD  (per-item, per-date)
// Query by item field.
{
  const snap = await getDocs(query(collection(db, "daily_beginning"), where("item", "==", OLD_NAME)));
  console.log(`\n[daily_beginning] found ${snap.size} doc(s) with item == "${OLD_NAME}"`);
  for (const d of snap.docs) {
    const data = d.data();
    const oldDocId = d.id;
    // ID pattern: BF__dining__Coke__2026-07-19 — replace item segment
    const oldSlug = itemSlug(OLD_NAME);
    const newSlug = itemSlug(NEW_NAME);
    const newDocId = oldDocId.replace(`__${oldSlug}__`, `__${newSlug}__`);
    console.log(`  recreate: ${oldDocId}  →  ${newDocId}`);
    if (!DRY_RUN) {
      await setDoc(doc(db, "daily_beginning", newDocId), { ...data, id: newDocId, item: NEW_NAME });
      await deleteDoc(d.ref);
      console.log("  ✓ done");
    }
    totalChanges++;
  }
}

// ── 4. daily_close ───────────────────────────────────────────────────────────
// Doc ID: BF__dining__YYYY-MM-DD — items stored as a nested map keyed by item name.
// Load recent BF dining docs and patch any that have the "Coke" key.
{
  const snap = await getDocs(
    query(collection(db, "daily_close"), where("branch", "==", "BF"), where("department", "==", "dining"))
  );
  console.log(`\n[daily_close] scanning ${snap.size} BF/dining doc(s) for "${OLD_NAME}" key in items map`);
  for (const d of snap.docs) {
    const data = d.data();
    if (data.items && OLD_NAME in data.items) {
      console.log(`  patch items map in: ${d.id}  (date: ${data.date})`);
      if (!DRY_RUN) {
        const newItems = { ...data.items, [NEW_NAME]: data.items[OLD_NAME] };
        delete newItems[OLD_NAME];
        await updateDoc(d.ref, { items: newItems });
        console.log("  ✓ done");
      }
      totalChanges++;
    }
  }
}

// ── 5. variance_explanations ─────────────────────────────────────────────────
// Doc ID: BF__dining__Coke__YYYY-MM-DD — query by item field if present, else scan.
{
  const snap = await getDocs(
    query(collection(db, "variance_explanations"), where("branch", "==", "BF"), where("item", "==", OLD_NAME))
  );
  console.log(`\n[variance_explanations] found ${snap.size} doc(s)`);
  for (const d of snap.docs) {
    const data = d.data();
    const oldDocId = d.id;
    const oldSlug = itemSlug(OLD_NAME);
    const newSlug = itemSlug(NEW_NAME);
    const newDocId = oldDocId.replace(`__${oldSlug}__`, `__${newSlug}__`);
    console.log(`  recreate: ${oldDocId}  →  ${newDocId}`);
    if (!DRY_RUN) {
      await setDoc(doc(db, "variance_explanations", newDocId), { ...data, item: NEW_NAME });
      await deleteDoc(d.ref);
      console.log("  ✓ done");
    }
    totalChanges++;
  }
}

console.log(`\n${DRY_RUN ? "[DRY RUN]" : "[APPLIED]"} Total changes: ${totalChanges}`);
if (DRY_RUN && totalChanges > 0) console.log("Re-run with --apply to commit.");
process.exit(0);
