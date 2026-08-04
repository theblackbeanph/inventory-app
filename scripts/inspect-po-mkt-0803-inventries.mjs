// Inspect commissary invEntries for PO-26-0803-MKT001.
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

console.log("=== invEntries with poRef=PO-26-0803-MKT001 ===");
const snap = await getDocs(query(
  collection(db, "invEntries"),
  where("poRef", "==", "PO-26-0803-MKT001"),
));
snap.forEach(d => {
  const x = d.data();
  console.log(`id=${d.id} date=${x.date} type=${x.type} item=${x.item} qty=${x.qty} note="${x.note}"`);
});

process.exit(0);
