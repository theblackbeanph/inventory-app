"use client";
import { useState } from "react";
import { db, COLS } from "@/lib/firebase";
import { collection, getDocs, writeBatch, doc, deleteDoc } from "firebase/firestore";
import { itemSlug } from "@/lib/items";

type LogLine = { text: string; ok: boolean };

export default function MigratePage() {
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [log, setLog] = useState<LogLine[]>([]);

  function append(text: string, ok = true) {
    setLog(prev => [...prev, { text, ok }]);
  }

  async function run() {
    setPhase("running");
    setLog([]);

    // ── 1. branch_stock ──────────────────────────────────────────────────────
    append("Reading branch_stock…");
    const stockSnap = await getDocs(collection(db, COLS.branchStock));
    let stockMoved = 0, stockSkipped = 0;
    const stockBatch = writeBatch(db);
    const toDelete: string[] = [];

    for (const d of stockSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (data.department) { stockSkipped++; continue; }

      const branch = data.branch as string;
      const item = data.item as string;
      const newId = `${branch}__kitchen__${itemSlug(item)}`;
      const newData = { ...data, department: "kitchen", id: newId };

      stockBatch.set(doc(db, COLS.branchStock, newId), newData);
      if (d.id !== newId) toDelete.push(d.id);
      stockMoved++;
    }
    await stockBatch.commit();
    for (const id of toDelete) await deleteDoc(doc(db, COLS.branchStock, id));
    append(`branch_stock: ${stockMoved} migrated, ${stockSkipped} already done`);

    // ── 2. daily_beginning ───────────────────────────────────────────────────
    append("Reading daily_beginning…");
    const begSnap = await getDocs(collection(db, COLS.dailyBeginning));
    let begMoved = 0, begSkipped = 0;
    const begBatch = writeBatch(db);
    const begToDelete: string[] = [];

    for (const d of begSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (data.department) { begSkipped++; continue; }

      const branch = data.branch as string;
      const item = data.item as string;
      const date = data.date as string;
      const newId = `${branch}__kitchen__${item}__${date}`;
      const newData = { ...data, department: "kitchen", id: newId };

      begBatch.set(doc(db, COLS.dailyBeginning, newId), newData);
      if (d.id !== newId) begToDelete.push(d.id);
      begMoved++;
    }
    await begBatch.commit();
    for (const id of begToDelete) await deleteDoc(doc(db, COLS.dailyBeginning, id));
    append(`daily_beginning: ${begMoved} migrated, ${begSkipped} already done`);

    // ── 3. branch_adjustments ────────────────────────────────────────────────
    append("Reading branch_adjustments…");
    const adjSnap = await getDocs(collection(db, COLS.adjustments));
    let adjMoved = 0, adjSkipped = 0;

    const adjChunks: typeof adjSnap.docs[] = [];
    const adjDocs = adjSnap.docs.filter(d => !d.data().department);
    adjSkipped = adjSnap.size - adjDocs.length;
    for (let i = 0; i < adjDocs.length; i += 400) adjChunks.push(adjDocs.slice(i, i + 400));

    for (const chunk of adjChunks) {
      const batch = writeBatch(db);
      for (const d of chunk) {
        batch.set(doc(db, COLS.adjustments, d.id), { ...d.data(), department: "kitchen" });
        adjMoved++;
      }
      await batch.commit();
    }
    append(`branch_adjustments: ${adjMoved} migrated, ${adjSkipped} already done`);

    append("Migration complete ✓");
    setPhase("done");
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", padding: "32px 24px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 6 }}>
          One-time tool
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Firestore Migration</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.6 }}>
          Adds <code>department: &quot;kitchen&quot;</code> to all existing documents and updates doc IDs to the new{" "}
          <code>branch__department__item</code> format. Safe to run multiple times — already-migrated docs are skipped.
        </div>

        {phase === "idle" && (
          <button
            onClick={run}
            style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: "#1A1A1A", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}
          >
            Run Migration
          </button>
        )}

        {phase === "running" && (
          <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>Running…</div>
        )}

        {log.length > 0 && (
          <div style={{ marginTop: 20, background: "#fff", borderRadius: 12, padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            {log.map((l, i) => (
              <div key={i} style={{ fontSize: 13, color: l.ok ? "var(--text)" : "#DC2626", marginBottom: 6, fontFamily: "monospace" }}>
                {l.text}
              </div>
            ))}
          </div>
        )}

        {phase === "done" && (
          <button
            onClick={() => window.location.href = "/"}
            style={{ marginTop: 20, width: "100%", padding: "14px 0", borderRadius: 12, border: "1.5px solid var(--border)", background: "#fff", color: "var(--text)", fontWeight: 600, fontSize: 15, cursor: "pointer" }}
          >
            Go to app
          </button>
        )}
      </div>
    </div>
  );
}
