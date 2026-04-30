"use client";
import { useState } from "react";
import { auth, db, COLS, writeBatch, doc, setDoc } from "@/lib/firebase";
import { CATALOG_MAP, stockDocId, itemSlug } from "@/lib/items";
import { BRANCH_LABELS } from "@/lib/auth";
import type { Branch, Department, StockAdjustment } from "@/lib/types";

export function StoreHubSyncModal({ branch, department, today, onClose, onComplete }: {
  branch: Branch;
  department: Department;
  today: string;
  onClose: () => void;
  onComplete: (matchedCount: number, unmatchedCount: number) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "syncing" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [matchedCount, setMatchedCount] = useState(0);

  async function sync() {
    setError(null);
    setPhase("syncing");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      // Fetch sales from StoreHub
      const salesRes = await fetch(`/api/storehub/sales?date=${today}`, { signal: controller.signal });
      clearTimeout(timeout);
      const salesData = await salesRes.json();
      if (!salesRes.ok) throw new Error(salesData.error ?? "Failed to fetch sales");

      const matched: { item: string; qty: number; rawOrders?: number }[] = salesData.matched;
      const unmatched: { sku: string; name: string; qty: number }[] = salesData.unmatchedSkus ?? [];

      // Wait for Firebase Auth session restore before writing
      await auth.authStateReady();
      const batch = writeBatch(db);
      const now = Date.now();
      for (const { item, qty, rawOrders } of matched) {
        const catalogItem = CATALOG_MAP.get(item);
        if (!catalogItem) continue;
        const adjId = `storehub__${branch}__${department}__${today}__${itemSlug(item)}`;
        const adj: StockAdjustment = {
          id: now, branch, department, date: today, item,
          type: "sales_import", qty, loggedBy: BRANCH_LABELS[branch],
          ...(rawOrders !== undefined && { rawOrders }),
        };
        batch.set(doc(db, COLS.adjustments, adjId), adj);
        const sid = stockDocId(branch, department, item);
        batch.set(doc(db, COLS.branchStock, sid), {
          id: sid, branch, department, item, category: catalogItem.category,
          unit: catalogItem.unit, qty: 0,
          reorderAt: catalogItem.reorderAt,
          lastUpdated: today, lastUpdatedBy: BRANCH_LABELS[branch],
        });
      }
      await batch.commit();

      const unmatchedDocId = `${branch}__${today}`;
      await setDoc(doc(db, COLS.storehubUnmatched, unmatchedDocId), {
        id: unmatchedDocId, branch, date: today,
        syncedAt: new Date().toISOString(),
        items: unmatched,
      });

      setMatchedCount(matched.length);
      onComplete(matched.length, unmatched.length);
      setPhase("done");
    } catch (e: unknown) {
      clearTimeout(timeout);
      const msg = e instanceof Error && e.name === "AbortError"
        ? "Sync timed out — StoreHub took too long to respond. Try again."
        : (e instanceof Error ? e.message : "Sync failed. Please try again.");
      setError(msg);
      setPhase("idle");
    }
  }

  return (
    <>
      <div onClick={phase === "idle" ? onClose : undefined} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }} />
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70, background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Sync Sales from StoreHub</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-secondary)", padding: 4 }}>✕</button>
        </div>

        {phase === "idle" && (
          <>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
              Pulls today&apos;s sales from StoreHub POS and deducts sold quantities from inventory.
            </div>
            {error && <div style={{ background: "#FEF2F2", borderRadius: 10, padding: "10px 14px", color: "#DC2626", fontSize: 13, marginBottom: 16 }}>{error}</div>}
            <button
              onClick={sync}
              style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: "#1A1A1A", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}
            >
              Sync today&apos;s sales
            </button>
          </>
        )}

        {phase === "syncing" && (
          <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-secondary)", fontSize: 15 }}>Syncing with StoreHub…</div>
        )}

        {phase === "done" && (
          <>
            <div style={{ textAlign: "center", padding: "12px 0 20px", fontSize: 32 }}>✓</div>
            <div style={{ textAlign: "center", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Sync complete</div>
            <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13, marginBottom: 24 }}>
              {matchedCount} item{matchedCount !== 1 ? "s" : ""} deducted from today&apos;s inventory.
            </div>
            <button onClick={onClose} style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: "#1A1A1A", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Done</button>
          </>
        )}
      </div>
    </>
  );
}
