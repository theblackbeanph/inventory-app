// One-off: seed MKT dining beer/water BEG for 2026-07-29 (July 28 expected end).
// Root cause: manual close July 28 covered only desserts, so rollover didn't carry these.
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, writeBatch } from "firebase/firestore";

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
const { SEED_EMAIL, SEED_PASSWORD, DRY_RUN } = process.env;
await signInWithEmailAndPassword(auth, SEED_EMAIL, SEED_PASSWORD);

const BRANCH = "MKT";
const DEPT = "dining";
const DATE = "2026-07-29";

// Values = July 28 max(0, BEG + IN - OUT) using rollover formula
const seeds = [
  { item: "Engkanto Craft Beer (Green Lava)",      qty: 0  },
  { item: "Engkanto Craft Beer (High Five)",       qty: 20 },
  { item: "Engkanto Craft Beer (Live It Up)",      qty: 45 },
  { item: "Engkanto Craft Beer (Mango Nation)",    qty: 4  },
  { item: "Engkanto Craft Beer (Paint Me Purple)", qty: 23 },
  { item: "Bottled Water",                         qty: 94 },
  { item: "Sparkling Water",                       qty: 19 },
];

const batch = writeBatch(db);
for (const s of seeds) {
  const id = `${BRANCH}__${DEPT}__${s.item}__${DATE}`;
  const payload = { id, branch: BRANCH, department: DEPT, item: s.item, date: DATE, qty: s.qty, setBy: "system (backfill)", updatedAt: DATE };
  console.log(`${DRY_RUN ? "[DRY] " : ""}SET ${id} qty=${s.qty}`);
  batch.set(doc(db, "daily_beginning", id), payload);
}

if (DRY_RUN) {
  console.log("\nDRY_RUN — no writes performed. Rerun without DRY_RUN=true to commit.");
} else {
  await batch.commit();
  console.log(`\nWrote ${seeds.length} daily_beginning docs.`);
}
