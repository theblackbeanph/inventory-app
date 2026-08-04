// Inspect PO-26-0803-MKT001 / DN-26-0803-MKT001 and related branch_adjustments.
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
await signInWithEmailAndPassword(auth, SEED_EMAIL, SEED_PASSWORD);

const PO_REF = "PO-26-0803-MKT001";
const DN_REF = "DN-26-0803-MKT001";
const ITEMS = ["Burger Patty", "Au Jus", "Bacon Jam", "Caramelized Onion"];

// 1) PullOut
const poSnap = await getDocs(query(collection(db, "pull_outs"), where("poRef", "==", PO_REF)));
console.log("\n=== PULL_OUTS ===");
poSnap.forEach(d => {
  const x = d.data();
  console.log(`id=${d.id} status=${x.status} commissaryInvWritten=${x.commissaryInvWritten} branch=${x.branch}`);
});

// 2) DeliveryNote
const dnSnap = await getDocs(query(collection(db, "delivery_notes"), where("dnRef", "==", DN_REF)));
console.log("\n=== DELIVERY_NOTES ===");
dnSnap.forEach(d => {
  const x = d.data();
  console.log(`id=${d.id} status=${x.status} receivedAt=${x.receivedAt} receivedBy=${x.receivedBy}`);
  console.log("items:", JSON.stringify(x.items, null, 2));
  console.log("receivedItems:", JSON.stringify(x.receivedItems, null, 2));
  console.log("editedAt=", x.receivedItemsEditedAt, "editedBy=", x.receivedItemsEditedBy, "editCount=", x.receivedItemsEditCount);
});

// 3) All branch_adjustments for MKT on 2026-08-03 for the 4 items
console.log("\n=== BRANCH_ADJUSTMENTS (MKT, 2026-08-03, disputed items) ===");
for (const item of ITEMS) {
  const snap = await getDocs(query(
    collection(db, "branch_adjustments"),
    where("branch", "==", "MKT"),
    where("date", "==", "2026-08-03"),
    where("item", "==", item),
  ));
  console.log(`\n--- ${item} ---`);
  snap.forEach(d => {
    const x = d.data();
    console.log(`  [${x.type}] qty=${x.qty} dept=${x.department} note="${x.note}" by=${x.loggedBy}`);
  });
}

// 4) branch_adjustments for 2026-08-04 too (in case cancelDispute wrote today)
console.log("\n=== BRANCH_ADJUSTMENTS (MKT, 2026-08-04, disputed items) ===");
for (const item of ITEMS) {
  const snap = await getDocs(query(
    collection(db, "branch_adjustments"),
    where("branch", "==", "MKT"),
    where("date", "==", "2026-08-04"),
    where("item", "==", item),
  ));
  console.log(`\n--- ${item} ---`);
  snap.forEach(d => {
    const x = d.data();
    console.log(`  [${x.type}] qty=${x.qty} dept=${x.department} note="${x.note}" by=${x.loggedBy}`);
  });
}

// 5) daily_close for 2026-08-03 kitchen MKT
console.log("\n=== DAILY_CLOSE MKT_kitchen_2026-08-03 ===");
const dcSnap = await getDocs(query(
  collection(db, "daily_close"),
  where("branch", "==", "MKT"),
  where("department", "==", "kitchen"),
  where("date", "==", "2026-08-03"),
));
dcSnap.forEach(d => {
  const x = d.data();
  console.log(`id=${d.id} countType=${x.countType} closedBy=${x.closedBy}`);
  const rows = (x.items || []).filter(i => ITEMS.includes(i.item));
  console.log(JSON.stringify(rows, null, 2));
});

process.exit(0);
