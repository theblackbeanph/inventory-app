import { NextRequest, NextResponse } from "next/server";
import { signInWithEmailAndPassword } from "firebase/auth";
import { db, auth as firebaseAuth, COLS, collection, getDocs, query, where, writeBatch, doc } from "@/lib/firebase";
import type { Branch, Department, StockAdjustment, DailyBeginning, DailyClose, StocktakeDraft } from "@/lib/types";
import { CATALOG } from "@/lib/items";
import { computeRolloverPlan, type PlanWrite } from "./plan";

const BRANCHES: Branch[] = ["MKT", "BF"];
const DEPARTMENTS: Department[] = ["kitchen", "bar", "cafe", "dining"];

function phtToday(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Execute a list of PlanWrite ops in a single Firestore batch.
async function commitWrites(writes: PlanWrite[]): Promise<void> {
  if (writes.length === 0) return;
  const batch = writeBatch(db);
  for (const w of writes) {
    switch (w.kind) {
      case "adjAutoId": {
        const ref = doc(collection(db, COLS.adjustments));
        batch.set(ref, w.data);
        break;
      }
      case "closeSet":
        batch.set(doc(db, COLS.dailyClose, w.id), w.data);
        break;
      case "closeMerge":
        batch.set(doc(db, COLS.dailyClose, w.id), { items: w.items }, { merge: true });
        break;
      case "branchStockMerge":
        batch.set(doc(db, COLS.branchStock, w.id), w.data, { merge: true });
        break;
      case "begSet":
        batch.set(doc(db, COLS.dailyBeginning, w.id), w.data);
        break;
    }
  }
  await batch.commit();
}

async function commitDraftDeletes(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  for (const id of ids) batch.delete(doc(db, COLS.stocktakeDrafts, id));
  await batch.commit();
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SYSTEM_EMAIL || !process.env.SYSTEM_PASSWORD) {
    return NextResponse.json({ error: "SYSTEM_EMAIL / SYSTEM_PASSWORD not configured" }, { status: 500 });
  }
  await signInWithEmailAndPassword(firebaseAuth, process.env.SYSTEM_EMAIL, process.env.SYSTEM_PASSWORD);

  const today = phtToday();
  const yesterday = addDays(today, -1);
  const nowISO = new Date().toISOString();
  const now = Date.now();
  const log: string[] = [];

  for (const branch of BRANCHES) {
    const [adjSnap, begSnap, closeSnap, todayBegSnap, draftSnap] = await Promise.all([
      getDocs(query(collection(db, COLS.adjustments),    where("branch", "==", branch), where("date", "==", yesterday))),
      getDocs(query(collection(db, COLS.dailyBeginning), where("branch", "==", branch), where("date", "==", yesterday))),
      getDocs(query(collection(db, COLS.dailyClose),     where("branch", "==", branch), where("date", "==", yesterday))),
      getDocs(query(collection(db, COLS.dailyBeginning), where("branch", "==", branch), where("date", "==", today))),
      getDocs(query(collection(db, COLS.stocktakeDrafts), where("branch", "==", branch), where("date", "==", yesterday))),
    ]);

    const adjustments      = adjSnap.docs.map(d => d.data() as StockAdjustment);
    const beginnings       = begSnap.docs.map(d => d.data() as DailyBeginning);
    const closes           = closeSnap.docs.map(d => d.data() as DailyClose);
    const todayBeginnings  = todayBegSnap.docs.map(d => d.data() as DailyBeginning);
    const drafts           = draftSnap.docs.map(d => ({ id: d.id, data: d.data() as StocktakeDraft }));

    for (const dept of DEPARTMENTS) {
      const deptCatalog = CATALOG.filter(i => i.department === dept && (!i.branches || i.branches.includes(branch)));

      const plan = computeRolloverPlan({
        branch, dept, yesterday, today,
        adjustments, beginnings, closes, todayBeginnings, drafts,
        deptCatalog,
        clock: {
          now,
          nowISO,
          nextAdjId: () => Date.now() + Math.random(),
        },
      });

      // Preserve the three-phase atomicity contract:
      // 1) auto-close / partial-fill batch
      // 2) draft cleanup batch
      // 3) BEG carry-forward batch
      await commitWrites(plan.closeWrites);
      await commitDraftDeletes(plan.draftDeletes);
      await commitWrites(plan.begWrites);

      log.push(...plan.logs);
    }
  }

  return NextResponse.json({ ok: true, yesterday, today, log });
}
