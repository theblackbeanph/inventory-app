import { NextResponse } from "next/server";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getDocs, collection } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export const revalidate = 300; // 5-minute cache

const FOOD_CATEGORIES = new Set([
  'Brunch Plates',
  'Mains',
  'Pasta & Flatbread',
  'Rice Bowls',
  'Sandwiches',
  'Starters',
]);

export async function GET() {
  if (!process.env.SYSTEM_EMAIL || !process.env.SYSTEM_PASSWORD) {
    return NextResponse.json(
      { error: "SYSTEM_EMAIL / SYSTEM_PASSWORD not configured" },
      { status: 500 }
    );
  }

  try {
    await signInWithEmailAndPassword(
      auth,
      process.env.SYSTEM_EMAIL,
      process.env.SYSTEM_PASSWORD
    );

    const snap = await getDocs(collection(db, "recipes"));
    const skuCostMap: Record<string, number> = {};
    const srpMap: Record<string, number> = {};
    let uncostedCount = 0;

    for (const docSnap of snap.docs) {
      const r = docSnap.data();
      if (r.recipe_type !== "LINE" || !FOOD_CATEGORIES.has(r.category)) continue;
      if (r.pos_sku_id != null && r.pos_sku_id !== "" && typeof r.food_cost === "number" && r.food_cost > 0) {
        skuCostMap[r.pos_sku_id as string] = r.food_cost as number;
        if (typeof r.srp === "number" && r.srp > 0) {
          srpMap[r.pos_sku_id as string] = r.srp as number;
        }
      } else {
        uncostedCount++;
      }
    }

    return NextResponse.json({ skuCostMap, srpMap, uncostedCount });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
