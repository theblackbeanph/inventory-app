// Peek at daily_close/{MKT__kitchen__2026-08-03} to see items[] shape before patching.
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyBLBVqOwq6PRqNJJIQHlnsPR232Tu3ZV2s",
  authDomain: "commissary-dashboard-ccd7c.firebaseapp.com",
  projectId: "commissary-dashboard-ccd7c",
});
const auth = getAuth(app);
const db = getFirestore(app);
const { SEED_EMAIL, SEED_PASSWORD } = process.env;
await signInWithEmailAndPassword(auth, SEED_EMAIL, SEED_PASSWORD);

const snap = await getDoc(doc(db, "daily_close", "MKT__kitchen__2026-08-03"));
if (!snap.exists()) { console.log("NOT FOUND"); process.exit(1); }
const x = snap.data();
console.log("top-level keys:", Object.keys(x));
console.log("items type:", typeof x.items, Array.isArray(x.items) ? "array" : "not array");
if (x.items && typeof x.items === "object" && !Array.isArray(x.items)) {
  console.log("items is a MAP keyed by:", Object.keys(x.items).slice(0, 5), "...");
  console.log("Burger Patty entry:", JSON.stringify(x.items["Burger Patty"], null, 2));
} else if (Array.isArray(x.items)) {
  const bp = x.items.find(i => i.item === "Burger Patty");
  console.log("Burger Patty entry:", JSON.stringify(bp, null, 2));
}
process.exit(0);
