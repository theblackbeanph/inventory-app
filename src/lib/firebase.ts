import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  writeBatch,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBLBVqOwq6PRqNJJIQHlnsPR232Tu3ZV2s",
  authDomain: "commissary-dashboard-ccd7c.firebaseapp.com",
  projectId: "commissary-dashboard-ccd7c",
  storageBucket: "commissary-dashboard-ccd7c.firebasestorage.app",
  messagingSenderId: "430542841830",
  appId: "1:430542841830:web:06014985cd9e8e1c9b5827",
};

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const COLS = {
  branchStock:        "branch_stock",
  adjustments:        "branch_adjustments",
  pulloutReqs:        "pullout_requests",
  dailyBeginning:     "daily_beginning",
  dailyClose:         "daily_close",
  pullOuts:           "pull_outs",
  deliveryNotes:      "delivery_notes",
  invEntries:         "invEntries",
  supplierDeliveries: "supplier_deliveries",
  portioningRuns:     "portioning_runs",
  storehubUnmatched:  "storehub_unmatched",
  users:              "users",
} as const;

export async function saveDoc(col: string, item: Record<string, unknown>) {
  const ref = doc(db, col, String(item.id));
  await setDoc(ref, item);
}

export async function saveDocById(col: string, id: string, data: Record<string, unknown>) {
  const ref = doc(db, col, id);
  await setDoc(ref, data, { merge: true });
}

export async function saveBatch(col: string, items: Record<string, unknown>[]) {
  const chunks: Record<string, unknown>[][] = [];
  for (let i = 0; i < items.length; i += 400) chunks.push(items.slice(i, i + 400));
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const item of chunk) {
      const ref = doc(db, col, String(item.id));
      batch.set(ref, item);
    }
    await batch.commit();
  }
}

export {
  collection, doc, onSnapshot, setDoc, getDocs,
  query, where, orderBy, writeBatch,
};
