"use client";
import { useState, useRef } from "react";
import type { Branch, Department, StockAdjustment } from "@/lib/types";
import { db, COLS } from "@/lib/firebase";
import { collection, writeBatch, doc } from "@/lib/firebase";
import { CATALOG_MAP, stockDocId } from "@/lib/items";
import { BRANCH_LABELS } from "@/lib/auth";
import { parseSalesCSV, applyCsvMapping, allMappedPosNames } from "@/lib/csv-mapping";

export function CSVImportModal({ branch, department, today, onClose, onComplete }: {
  branch: Branch;
  department: Department;
  today: string;
  onClose: () => void;
  onComplete: (matchedCount: number, unmatchedCount: number) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"pick" | "preview" | "saving" | "done">("pick");
  const [error, setError] = useState<string | null>(null);
  const [matched, setMatched] = useState<{ item: string; qty: number }[]>([]);
  const [unmatched, setUnmatched] = useState<{ name: string; qty: number }[]>([]);

  async function handleFile(file: File) {
    setError(null);
    try {
      const text = await file.text();
      const salesMap = parseSalesCSV(text);
      const mappedPosNames = allMappedPosNames();
      const unmatchedItems: { name: string; qty: number }[] = [];
      for (const [posItem, qty] of Object.entries(salesMap)) {
        if (!mappedPosNames.has(posItem.trim().toUpperCase())) {
          unmatchedItems.push({ name: posItem, qty });
        }
      }
      setMatched(applyCsvMapping(salesMap));
      setUnmatched(unmatchedItems);
      setPhase("preview");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to parse CSV");
    }
  }

  async function confirm() {
    setPhase("saving");
    const batch = writeBatch(db);
    const now = Date.now();
    for (const { item, qty } of matched) {
      const catalogItem = CATALOG_MAP.get(item);
      if (!catalogItem) continue;
      const adjRef = doc(collection(db, COLS.adjustments));
      batch.set(adjRef, {
        id: now + Math.random(), branch, department, date: today, item,
        type: "sales_import", qty, loggedBy: BRANCH_LABELS[branch], source: "csv",
      } satisfies StockAdjustment);
      const sid = stockDocId(branch, department, item);
      batch.set(doc(db, COLS.branchStock, sid), {
        id: sid, branch, department, item, category: catalogItem.category,
        unit: catalogItem.unit, qty: 0,
        reorderAt: catalogItem.reorderAt,
        lastUpdated: today, lastUpdatedBy: BRANCH_LABELS[branch],
      }, { merge: true });
    }
    await batch.commit();
    onComplete(matched.length, unmatched.length);
    setPhase("done");
  }

  return (
    <>
      <div onClick={phase === "pick" ? onClose : undefined} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }} />
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70, background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)", maxHeight: "90dvh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Import Sales</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-secondary)", padding: 4 }}>✕</button>
        </div>

        {phase === "pick" && (
          <>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
              Upload the daily Utak Product Mix CSV. Sales quantities will be deducted from today's inventory.
            </div>
            {error && <div style={{ background: "#FEF2F2", borderRadius: 10, padding: "10px 14px", color: "#DC2626", fontSize: 13, marginBottom: 16 }}>{error}</div>}
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <button
              onClick={() => fileRef.current?.click()}
              style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: "#1A1A1A", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}
            >
              Choose CSV file
            </button>
          </>
        )}

        {phase === "preview" && (
          <>
            <div style={{ background: "#F0FDF4", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#15803D", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Will deduct — {matched.length} items</div>
              {matched.map(({ item, qty }) => (
                <div key={item} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                  <span>{item}</span>
                  <span style={{ fontWeight: 700, color: "#DC2626" }}>−{qty}</span>
                </div>
              ))}
              {matched.length === 0 && <div style={{ fontSize: 13, color: "#15803D" }}>No commissary items matched.</div>}
            </div>

            {unmatched.length > 0 && (
              <div style={{ background: "#FEF3C7", borderRadius: 10, padding: "10px 14px", marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#D97706", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Not tracked — {unmatched.length} POS item{unmatched.length !== 1 ? "s" : ""}</div>
                {unmatched.map(({ name, qty }) => (
                  <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#92400E", marginBottom: 2 }}>
                    <span>{name}</span>
                    <span style={{ fontWeight: 700 }}>{qty} sold</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setPhase("pick")} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1.5px solid var(--border)", background: "#fff", color: "var(--text)", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>Back</button>
              <button
                onClick={confirm}
                disabled={matched.length === 0}
                style={{ flex: 2, padding: "14px 0", borderRadius: 12, border: "none", background: matched.length > 0 ? "#1A1A1A" : "#E8E8E4", color: matched.length > 0 ? "#fff" : "var(--text-secondary)", fontWeight: 700, fontSize: 15, cursor: matched.length > 0 ? "pointer" : "not-allowed" }}
              >
                Confirm import
              </button>
            </div>
          </>
        )}

        {phase === "saving" && (
          <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-secondary)", fontSize: 15 }}>Saving…</div>
        )}

        {phase === "done" && (
          <>
            <div style={{ textAlign: "center", padding: "12px 0 20px", fontSize: 32 }}>✓</div>
            <div style={{ textAlign: "center", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Import complete</div>
            <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13, marginBottom: 24 }}>
              {matched.length} item{matched.length !== 1 ? "s" : ""} deducted from today's inventory.
            </div>
            <button onClick={onClose} style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: "#1A1A1A", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Done</button>
          </>
        )}
      </div>
    </>
  );
}
