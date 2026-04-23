"use client";
import { useState } from "react";
import type { Branch } from "@/lib/types";
import { db, COLS } from "@/lib/firebase";
import { collection, getDocs, query, where, writeBatch } from "@/lib/firebase";

export function ResetModal({ branch, onClose }: { branch: Branch; onClose: () => void }) {
  const [scope, setScope] = useState<"branch" | "all">("branch");
  const [phase, setPhase] = useState<"confirm" | "running" | "done">("confirm");
  const [log, setLog] = useState<string[]>([]);

  async function runReset() {
    setPhase("running");
    const lines: string[] = [];
    const branchCols = [COLS.branchStock, COLS.adjustments, COLS.dailyBeginning, COLS.pullOuts, COLS.deliveryNotes, COLS.dailyClose];
    for (const col of branchCols) {
      const q = scope === "branch" ? query(collection(db, col), where("branch", "==", branch)) : query(collection(db, col));
      const snap = await getDocs(q);
      if (snap.empty) { lines.push(`${col}: nothing to delete`); setLog([...lines]); continue; }
      const chunks: typeof snap.docs[] = [];
      for (let i = 0; i < snap.docs.length; i += 400) chunks.push(snap.docs.slice(i, i + 400));
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      lines.push(`✓ ${col}: deleted ${snap.size} docs`);
      setLog([...lines]);
    }

    const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const branches = scope === "branch" ? [branch] : ["mkt", "bf"];
    const departments = ["kitchen", "bar", "cafe"];
    for (const b of branches) {
      for (const dept of departments) {
        localStorage.removeItem(`counts_${b}_${dept}_${today}`);
        localStorage.removeItem(`countedBy_${b}_${dept}`);
      }
    }

    setPhase("done");
  }

  return (
    <>
      <div onClick={phase === "confirm" ? onClose : undefined} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }} />
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70, background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)" }}>
        {phase === "confirm" && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Reset Demo Data</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>Only clears branch app data. Cannot be undone.</div>
            <div style={{ background: "#FEF2F2", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Will be cleared</div>
              {["branch_stock", "branch_adjustments", "daily_beginning", "pull_outs", "delivery_notes"].map(c => (
                <div key={c} style={{ fontSize: 12, color: "#7F1D1D", marginBottom: 2 }}>· {c}</div>
              ))}
            </div>
            <div style={{ background: "#F0FDF4", borderRadius: 10, padding: "10px 12px", marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#15803D", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Commissary data — untouched</div>
              {["invEntries", "pullout_requests", "all other commissary collections"].map(c => (
                <div key={c} style={{ fontSize: 12, color: "#14532D", marginBottom: 2 }}>· {c}</div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {(["branch", "all"] as const).map(s => (
                <button key={s} onClick={() => setScope(s)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: scope === s ? "#1A1A1A" : "var(--bg)", color: scope === s ? "#fff" : "var(--text-secondary)" }}>
                  {s === "branch" ? "This branch only" : "All branches"}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1.5px solid var(--border)", background: "#fff", color: "var(--text-secondary)", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>Cancel</button>
              <button onClick={runReset} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "none", background: "#DC2626", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Wipe Data</button>
            </div>
          </>
        )}
        {phase === "running" && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Resetting…</div>
            {log.map((l, i) => <div key={i} style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>{l}</div>)}
          </>
        )}
        {phase === "done" && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Done ✓</div>
            {log.map((l, i) => <div key={i} style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>{l}</div>)}
            <button onClick={onClose} style={{ marginTop: 20, width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: "#1A1A1A", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Close</button>
          </>
        )}
      </div>
    </>
  );
}
