import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs, updateDoc } from "firebase/firestore";

const { SEED_PASSWORD } = process.env;
if (!SEED_PASSWORD) {
  console.error("Usage: SEED_PASSWORD=xxx node scripts/migrate-linecook-to-staff.mjs");
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

const snap = await getDocs(query(collection(db, "users"), where("role", "==", "linecook")));
console.log(`Found ${snap.size} linecook account(s)`);
for (const d of snap.docs) {
  await updateDoc(d.ref, { role: "staff" });
  console.log(`  updated: ${d.data().displayName ?? d.id}`);
}
console.log("Done.");
process.exit(0);
