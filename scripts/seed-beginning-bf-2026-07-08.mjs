/**
 * Seeds July 8 2026 beginning inventory for BF / kitchen.
 * Source: July 7 BF Ending.xlsx (col 86 = last END column).
 *
 * Usage:
 *   SEED_EMAIL=xxx SEED_PASSWORD=xxx node scripts/seed-beginning-bf-2026-07-08.mjs
 *   SEED_EMAIL=xxx SEED_PASSWORD=xxx DRY_RUN=true node scripts/seed-beginning-bf-2026-07-08.mjs
 */

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, writeBatch, serverTimestamp } from "firebase/firestore";

const { SEED_EMAIL, SEED_PASSWORD, DRY_RUN } = process.env;
if (!SEED_EMAIL || !SEED_PASSWORD) {
  console.error("Usage: SEED_EMAIL=xxx SEED_PASSWORD=xxx node scripts/seed-beginning-bf-2026-07-08.mjs");
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

const BRANCH     = "BF";
const DEPARTMENT = "kitchen";
const DATE       = "2026-07-08";

// July 7 ending → July 8 beginning
// Breads (Pandesal, Potato Buns, Sourdough, Focaccia, Brioche Loaf) excluded — team counts tonight.
const BEGINNING = [
  { item: "Aburi Salmon",            qty: 12 },
  { item: "Adobo Flakes",            qty: 17 },
  { item: "Arroz ala Cubana",        qty: 12 },
  { item: "Bacon Cubes",             qty: 14 },
  { item: "Beef Pares",              qty: 26 },
  { item: "Beef Tapa",               qty: 45 },
  { item: "Burger Patty",            qty: 24 },
  { item: "Buttermilk Chicken 150g", qty: 24 },
  { item: "Buttermilk Chicken 300g", qty: 27 },
  { item: "Chicken BBQ",             qty: 6  },
  { item: "Cobbler",                 qty: 26 },
  { item: "Mozzarella Sticks",       qty: 4  },
  { item: "Prosciutto",              qty: 15 },
  { item: "Roast Beef",              qty: 14 },
  { item: "Salmon Fillet",           qty: 1  },
  { item: "Scallops",                qty: 29 },
  { item: "Smoked Salmon",           qty: 20 },
  { item: "Squid Ink Sauce",         qty: 25 },
  { item: "Pork Chop",               qty: 0  },
  { item: "Au Jus",                  qty: 18 },
  { item: "Bacon Jam",               qty: 17 },
  { item: "Caramelized Onion",       qty: 9  },
  { item: "Squash Soup",             qty: 10 },
  { item: "Salted Egg Sauce",        qty: 18 },
  { item: "Salted Egg Custard",      qty: 4  },
  { item: "Tuna Spread",             qty: 5  },
  { item: "Truffle Mushroom Paste",  qty: 2  },
  { item: "Flatbread",               qty: 6  },
  { item: "Longganisa Duo",          qty: 3  },
  { item: "Wagyu Cubes",             qty: 58 },
  { item: "Farmer's Ham",            qty: 4  },
  { item: "Bacon Strip",             qty: 51 },
  { item: "Clam Chowder",            qty: 6  },
  { item: "Burrata",                 qty: 0  },
  { item: "Gyudon Sauce",            qty: 4  },
  { item: "Tartar",                  qty: 1  },
  { item: "Aioli",                   qty: 1  },
  { item: "Nigiri",                  qty: 2  },
  { item: "Beef Pares Sauce",        qty: 1  },
  { item: "Adobo Flakes Sauce",      qty: 0  },
  { item: "Pesto",                   qty: 0  },
  { item: "Caesar Dressing",         qty: 1  },
  { item: "Raspberry Dressing",      qty: 2  },
  { item: "Candied Walnut",          qty: 1  },
  { item: "Burger Dressing",         qty: 3  },
  { item: "Ube Halaya",              qty: 3  },
  { item: "Kimchi",                  qty: 0  },
];

await signInWithEmailAndPassword(auth, SEED_EMAIL, SEED_PASSWORD);
console.log("Signed in as", SEED_EMAIL);

if (DRY_RUN) {
  console.log("\n[DRY RUN] Would write the following daily_beginning docs:\n");
  for (const { item, qty } of BEGINNING) {
    const id = `${BRANCH}__${DEPARTMENT}__${item}__${DATE}`;
    console.log(`  ${id}  qty=${qty}`);
  }
  console.log(`\nTotal: ${BEGINNING.length} docs`);
  process.exit(0);
}

const batch = writeBatch(db);
for (const { item, qty } of BEGINNING) {
  const id = `${BRANCH}__${DEPARTMENT}__${item}__${DATE}`;
  batch.set(doc(db, "daily_beginning", id), {
    id, branch: BRANCH, department: DEPARTMENT, item, date: DATE,
    qty, setBy: SEED_EMAIL, updatedAt: serverTimestamp(),
  });
}
await batch.commit();
console.log(`\nWrote ${BEGINNING.length} beginning docs for ${BRANCH} / ${DEPARTMENT} / ${DATE}`);
process.exit(0);
