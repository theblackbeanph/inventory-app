import { NextRequest, NextResponse } from "next/server";
import { db, COLS } from "@/lib/firebase";
import { collection, getDocs, query, where } from "@/lib/firebase";
import {
  getNextWeekDeliveries, getItemsForSlot,
  generatePoNumber, type DeliverySlot,
} from "@/lib/pullout-config";
import type { PullOut } from "@/lib/types";
import { doc, setDoc } from "firebase/firestore";

export async function GET(request: NextRequest) {
  // Verify Vercel cron secret
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Saturday that the cron runs on (today in PHT)
  const nowPHT = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const todayStr = nowPHT.toISOString().slice(0, 10);

  const deliveries = getNextWeekDeliveries(nowPHT);
  const created: string[] = [];
  const skipped: string[] = [];

  for (const { branch, date, slot } of deliveries) {
    // Check if AUTO pull-out already exists for this branch + delivery_day
    const existing = await getDocs(query(
      collection(db, COLS.pullOuts),
      where("branch", "==", branch),
      where("delivery_day", "==", date),
      where("type", "==", "AUTO"),
    ));

    if (!existing.empty) {
      skipped.push(`${branch} ${date}`);
      continue;
    }

    // Get sequence number for PO (count all pull-outs on that date for that branch)
    const allOnDate = await getDocs(query(
      collection(db, COLS.pullOuts),
      where("branch", "==", branch),
      where("delivery_day", "==", date),
    ));
    const seq = allOnDate.size + 1;
    const poNumber = generatePoNumber(branch, date, seq);
    const id = `auto_${branch}_${date}`;

    const items = getItemsForSlot(slot as DeliverySlot);

    const pullOut: PullOut = {
      id,
      po_number: poNumber,
      type: "AUTO",
      branch,
      delivery_day: date,
      status: "PENDING_REVIEW",
      created_at: todayStr,
      items,
    };

    await setDoc(doc(db, COLS.pullOuts, id), pullOut);
    created.push(poNumber);
  }

  return NextResponse.json({
    ok: true,
    generatedOn: todayStr,
    created,
    skipped,
    total: created.length,
  });
}
