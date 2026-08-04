// Investigate why Burger Patty is missing from PO-26-0803-MKT001 invEntries.
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

// 1) All invEntries for Burger Patty on 2026-08-03 and 2026-08-04
console.log("=== Burger Patty invEntries (2026-08-02 through 08-04) ===");
for (const date of ["2026-08-02", "2026-08-03", "2026-08-04"]) {
  const snap = await getDocs(query(
    collection(db, "invEntries"),
    where("item", "==", "Burger Patty"),
    where("date", "==", date),
  ));
  console.log(`\n--- ${date} ---`);
  snap.forEach(d => {
    const x = d.data();
    console.log(`  id=${d.id} type=${x.type} qty=${x.qty} poRef=${x.poRef ?? "(none)"} note="${x.note ?? ""}" by=${x.loggedBy ?? ""}`);
  });
}

// 2) Confirm DN.items contains Burger Patty
console.log("\n=== DN items check ===");
const dnSnap = await getDocs(query(collection(db, "delivery_notes"), where("dnRef", "==", "DN-26-0803-MKT001")));
dnSnap.forEach(d => {
  const x = d.data();
  const bp = (x.items || []).find(i => i.item === "Burger Patty");
  console.log("Burger Patty in dn.items:", JSON.stringify(bp));
  const bpR = (x.receivedItems || []).find(i => i.item === "Burger Patty");
  console.log("Burger Patty in dn.receivedItems:", JSON.stringify(bpR));
});

process.exit(0);
