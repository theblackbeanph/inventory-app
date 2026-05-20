/**
 * Seed a fake DISPATCHED pull-out + delivery note for testing the check button feature.
 *
 * Usage:
 *   SEED_EMAIL=you@email.com SEED_PASSWORD=xxx node scripts/seed-test-order.mjs
 *
 * To delete the seeded docs after testing:
 *   SEED_EMAIL=you@email.com SEED_PASSWORD=xxx DELETE=true node scripts/seed-test-order.mjs
 */

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc, deleteDoc } from "firebase/firestore";

const { SEED_EMAIL, SEED_PASSWORD, DELETE } = process.env;
if (!SEED_EMAIL || !SEED_PASSWORD) {
  console.error("Usage: SEED_EMAIL=xxx SEED_PASSWORD=xxx node scripts/seed-test-order.mjs");
  process.exit(1);
}

const app = initializeApp({
  apiKey: "AIzaSyBLBVqOwq6PRqNJJIQHlnsPR232Tu3ZV2s",
  authDomain: "commissary-dashboard-ccd7c.firebaseapp.com",
  projectId: "commissary-dashboard-ccd7c",
  storageBucket: "commissary-dashboard-ccd7c.firebasestorage.app",
  messagingSenderId: "430542841830",
  appId: "1:430542841830:web:06014985cd9e8e1c9b5827",
});

const auth = getAuth(app);
const db   = getFirestore(app);

const PO_ID = "test-po-checkbtn-001";
const DN_ID = "test-dn-checkbtn-001";

await signInWithEmailAndPassword(auth, SEED_EMAIL, SEED_PASSWORD);
console.log("Signed in as", SEED_EMAIL);

if (DELETE) {
  await deleteDoc(doc(db, "pull_outs",      PO_ID));
  await deleteDoc(doc(db, "delivery_notes", DN_ID));
  console.log("Deleted test pull-out and delivery note.");
  process.exit(0);
}

await setDoc(doc(db, "pull_outs", PO_ID), {
  id:          PO_ID,
  poRef:       "PO-TEST-CHECKBTN",
  branch:      "BF",
  status:      "DISPATCHED",
  requestedAt: "2026-05-20",
  requestedBy: "Test Seed",
  items: [
    { item: "Cobbler",     qty: 10, unit: "pc" },
    { item: "Beef Tapa",   qty: 8,  unit: "pc" },
    { item: "Burger Patty", qty: 5, unit: "pc" },
  ],
});

await setDoc(doc(db, "delivery_notes", DN_ID), {
  id:           DN_ID,
  dnRef:        "DN-TEST-CHECKBTN",
  poRef:        "PO-TEST-CHECKBTN",
  pullOutId:    PO_ID,
  branch:       "BF",
  dispatchedAt: "2026-05-20",
  dispatchedBy: "Commissary",
  status:       "IN_TRANSIT",
  items: [
    { item: "Cobbler",      requestedQty: 10, dispatchedQty: 10, unit: "pc" },
    { item: "Beef Tapa",    requestedQty: 8,  dispatchedQty: 6,  unit: "pc" }, // short dispatch
    { item: "Burger Patty", requestedQty: 5,  dispatchedQty: 5,  unit: "pc" },
  ],
});

console.log("Seeded test order successfully.");
console.log("  Pull-out ID:     ", PO_ID);
console.log("  Delivery note ID:", DN_ID);
console.log("  Branch: BF — open the Active tab to see it.");
console.log("");
console.log("To clean up after testing:");
console.log("  SEED_EMAIL=xxx SEED_PASSWORD=xxx DELETE=true node scripts/seed-test-order.mjs");
