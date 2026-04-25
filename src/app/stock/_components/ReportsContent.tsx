"use client";
import { useState, useEffect, useMemo } from "react";
import { CATALOG } from "@/lib/items";
import type { Branch, Department, StockAdjustment, DailyBeginning } from "@/lib/types";
import { db, COLS } from "@/lib/firebase";
import { collection, getDocs, query, where } from "@/lib/firebase";
import { BRANCH_LABELS } from "@/lib/auth";
import { addDays, weekMonday, formatDate, todayPHT } from "../_lib/helpers";

interface UnmatchedDoc {
  id: string;
  branch: Branch;
  date: string;
  syncedAt: string;
  items: { sku: string; name: string; qty: number }[];
}

export function ReportsContent({ branch, department, items }: {
  branch: Branch;
  department: Department;
  items: typeof CATALOG;
}) {
  const [weekStart, setWeekStart] = useState(() => weekMonday(todayPHT()));
  const [weekAdjs, setWeekAdjs] = useState<StockAdjustment[]>([]);
  const [weekBeg, setWeekBeg] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [unmatchedDocs, setUnmatchedDocs] = useState<UnmatchedDoc[]>([]);

  const todayStr = todayPHT();

  useEffect(() => {
    setLoading(true);
    const weekEnd = addDays(weekStart, 6);
    let cancelled = false;
    (async () => {
      const queries: Promise<unknown>[] = [
        getDocs(query(collection(db, COLS.adjustments), where("branch", "==", branch), where("department", "==", department))),
        getDocs(query(collection(db, COLS.dailyBeginning), where("branch", "==", branch), where("department", "==", department), where("date", "==", weekStart))),
      ];
      if (branch === "MKT") {
        queries.push(getDocs(query(collection(db, COLS.storehubUnmatched), where("branch", "==", branch))));
      }
      const results = await Promise.all(queries);
      if (cancelled) return;
      const [adjSnap, begSnap] = results as [Awaited<ReturnType<typeof getDocs>>, Awaited<ReturnType<typeof getDocs>>];
      const allAdjs = adjSnap.docs.map(d => d.data() as StockAdjustment);
      setWeekAdjs(allAdjs.filter(a => a.date >= weekStart && a.date <= weekEnd));
      const map: Record<string, number> = {};
      begSnap.docs.forEach(d => { const b = d.data() as DailyBeginning; map[b.item] = b.qty; });
      setWeekBeg(map);
      if (branch === "MKT" && results[2]) {
        const unmatchedSnap = results[2] as Awaited<ReturnType<typeof getDocs>>;
        const docs = unmatchedSnap.docs
          .map(d => d.data() as UnmatchedDoc)
          .filter(d => d.date >= weekStart && d.date <= weekEnd)
          .sort((a, b) => a.date.localeCompare(b.date));
        setUnmatchedDocs(docs);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [branch, department, weekStart]);

  const weekEnd = addDays(weekStart, 6);

  const weekSummary = useMemo(() => {
    return items.map(item => {
      const monBeg = weekBeg[item.name] ?? null;
      const itemAdjs = weekAdjs.filter(a => a.item === item.name);
      const totalIn  = itemAdjs.filter(a => a.type === "in").reduce((s, a) => s + a.qty, 0);
      const totalOut = itemAdjs.filter(a => a.type === "out" || a.type === "waste" || a.type === "sales_import").reduce((s, a) => s + a.qty, 0);
      const expected = monBeg !== null ? monBeg + totalIn - totalOut : null;
      const weekCounts = itemAdjs.filter(a => a.type === "count");
      const lastCount = weekCounts.length > 0
        ? weekCounts.reduce((best, a) => a.id > best.id ? a : best).qty
        : null;
      const variance = expected !== null && lastCount !== null ? lastCount - expected : null;
      return { item, monBeg, totalIn, totalOut, expected, lastCount, variance };
    }).filter(r => r.monBeg !== null || r.totalIn > 0 || r.totalOut > 0);
  }, [items, weekAdjs, weekBeg]);

  const manualDays = new Set(
    weekAdjs.filter(a => a.type === "count" && a.note !== "Auto-closed").map(a => a.date)
  ).size;

  function exportCSV() {
    const header = ["Item", "Mon BEG", "Total IN", "Total OUT", "Expected End", "Actual Count", "Weekly Variance"];
    const rows = weekSummary.map(r => [
      r.item.name, r.monBeg ?? "", r.totalIn, r.totalOut,
      r.expected ?? "", r.lastCount ?? "", r.variance ?? "",
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekly-${BRANCH_LABELS[branch]}-${weekStart}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportUnmatchedCSV() {
    const header = ["Date", "SKU", "Product Name", "Qty Sold"];
    const rows = unmatchedDocs.flatMap(doc =>
      doc.items.map(it => [doc.date, it.sku, it.name, it.qty])
    );
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unmatched-skus-${BRANCH_LABELS[branch]}-${weekStart}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: "12px 16px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid var(--border)", background: "#fff", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
          >‹</button>
          <div style={{ fontSize: 13, fontWeight: 600, minWidth: 140, textAlign: "center" }}>
            {formatDate(weekStart)} – {formatDate(weekEnd)}
          </div>
          <button
            onClick={() => { const next = addDays(weekStart, 7); if (next <= weekMonday(todayStr)) setWeekStart(next); }}
            disabled={addDays(weekStart, 7) > weekMonday(todayStr)}
            style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid var(--border)", background: "#fff", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", opacity: addDays(weekStart, 7) > weekMonday(todayStr) ? 0.3 : 1 }}
          >›</button>
        </div>
        <button
          onClick={exportCSV}
          style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "var(--text)" }}
        >
          Export CSV
        </button>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
        {manualDays} of 7 days manually counted
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "48px 0", fontSize: 14 }}>Loading…</div>
      ) : weekSummary.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "48px 0" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📅</div>
          <div style={{ fontSize: 15 }}>No data for this week</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff", borderRadius: 12, overflow: "hidden" }}>
            <thead>
              <tr style={{ background: "var(--bg)" }}>
                {["Item", "Mon BEG", "Total IN", "Total OUT", "Expected", "Actual Count", "Variance"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-secondary)", textTransform: "uppercase", textAlign: h === "Item" ? "left" : "center", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekSummary.map(({ item, monBeg, totalIn, totalOut, expected, lastCount, variance }) => {
                const varColor = variance === null ? "var(--text-secondary)" : variance === 0 ? "#16A34A" : variance > 0 ? "#D97706" : "#DC2626";
                return (
                  <tr key={item.name} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 10px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>
                      <div>{item.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 400, marginTop: 1 }}>{item.packSize}</div>
                    </td>
                    <td style={{ padding: "10px 6px", textAlign: "center", color: "var(--text-secondary)" }}>{monBeg ?? "—"}</td>
                    <td style={{ padding: "10px 6px", textAlign: "center", color: "#059669", fontWeight: 600 }}>{totalIn > 0 ? `+${totalIn}` : "—"}</td>
                    <td style={{ padding: "10px 6px", textAlign: "center", color: "#DC2626", fontWeight: 600 }}>{totalOut > 0 ? `−${totalOut}` : "—"}</td>
                    <td style={{ padding: "10px 6px", textAlign: "center", color: "#2563EB", fontWeight: 600 }}>{expected ?? "—"}</td>
                    <td style={{ padding: "10px 6px", textAlign: "center" }}>{lastCount ?? "—"}</td>
                    <td style={{ padding: "10px 6px", textAlign: "center", fontWeight: 700, color: varColor }}>
                      {variance === null ? "—" : variance === 0 ? "✓" : variance > 0 ? `+${variance}` : String(variance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Unmatched SKUs — MKT only */}
      {branch === "MKT" && !loading && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Unmatched SKUs (StoreHub)</div>
            {unmatchedDocs.length > 0 && (
              <button
                onClick={exportUnmatchedCSV}
                style={{ padding: "6px 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "var(--text)" }}
              >
                Export CSV
              </button>
            )}
          </div>
          {unmatchedDocs.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "20px 0", fontSize: 13 }}>No unmatched SKUs this week.</div>
          ) : (
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff", borderRadius: 12, overflow: "hidden" }}>
                <thead>
                  <tr style={{ background: "var(--bg)" }}>
                    {["Date", "SKU", "Product Name", "Qty Sold"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-secondary)", textTransform: "uppercase", textAlign: h === "Product Name" ? "left" : "center", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {unmatchedDocs.flatMap(doc =>
                    doc.items.map((it, i) => (
                      <tr key={`${doc.date}-${it.sku}-${i}`} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{formatDate(doc.date)}</td>
                        <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)" }}>{it.sku}</td>
                        <td style={{ padding: "9px 10px", fontWeight: 500 }}>{it.name}</td>
                        <td style={{ padding: "9px 10px", textAlign: "center", fontWeight: 700, color: "#D97706" }}>{it.qty}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
