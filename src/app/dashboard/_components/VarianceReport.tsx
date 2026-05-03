"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { db, COLS, getDocs, query, collection, where } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import type { Branch, Department, StockAdjustment, DailyBeginning } from "@/lib/types";
import { addDays, todayPHT, formatDate } from "@/app/stock/_lib/helpers";
import { computeVarianceRows, exportVarianceCsv, type VarianceRow } from "@/app/dashboard/_lib/variance";
import type { Role } from "@/lib/roles";
import { BRANCH_LABELS } from "@/lib/auth";

type Preset = 7 | 14 | 30;

function presetRange(days: Preset): { start: string; end: string } {
  const end = todayPHT();
  return { start: addDays(end, -(days - 1)), end };
}

function VarPctBadge({ variancePct, variance }: { variancePct: number; variance: number }) {
  const sign = variance > 0 ? "+" : "";
  const label = `${sign}${Math.round(variancePct)}%`;
  let bg = "#dcfce7", color = "#16a34a";
  if (Math.abs(variancePct) > 30) { bg = "#fee2e2"; color = "#dc2626"; }
  else if (Math.abs(variancePct) >= 10) { bg = "#fef3c7"; color = "#d97706"; }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 5, background: bg, color, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function VarianceTable({ rows }: { rows: VarianceRow[] }) {
  if (rows.length === 0) {
    return (
      <div style={{ background: "#fff", borderRadius: 10, border: "1px dashed #e2e8f0", padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
        No variances for this period.
      </div>
    );
  }
  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff", borderRadius: 10, overflow: "hidden" }}>
        <thead>
          <tr style={{ background: "var(--bg)" }}>
            {["Date", "Item", "Var %", "Var (units)", "Actual", "Expected"].map(h => (
              <th key={h} style={{
                padding: "8px 10px", fontSize: 10, fontWeight: 700,
                letterSpacing: "0.08em", color: "var(--text-secondary)",
                textTransform: "uppercase",
                textAlign: h === "Item" ? "left" : "center",
                whiteSpace: "nowrap", borderBottom: "1px solid var(--border)",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.docId} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>{formatDate(row.date)}</td>
              <td style={{ padding: "10px 10px", fontWeight: 600, whiteSpace: "nowrap", color: "#0f172a" }}>{row.item}</td>
              <td style={{ padding: "10px 6px", textAlign: "center" }}>
                <VarPctBadge variancePct={row.variancePct} variance={row.variance} />
              </td>
              <td style={{ padding: "10px 6px", textAlign: "center", fontWeight: 600, color: row.variance < 0 ? "#dc2626" : "#16a34a" }}>
                {row.variance > 0 ? `+${row.variance}` : row.variance}
              </td>
              <td style={{ padding: "10px 6px", textAlign: "center" }}>{row.actual}</td>
              <td style={{ padding: "10px 6px", textAlign: "center" }}>{row.expected}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface UnmatchedDoc {
  id: string;
  branch: Branch;
  date: string;
  syncedAt: string;
  items: { sku: string; name: string; qty: number }[];
}

export function VarianceReport({ branch, department }: {
  branch: Branch;
  department: Department;
  role: Role;
}) {
  const [preset, setPreset] = useState<Preset>(7);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [usingCustom, setUsingCustom] = useState(false);

  const { startDate, endDate } = useMemo(() => {
    if (usingCustom && customStart && customEnd) {
      return { startDate: customStart, endDate: customEnd };
    }
    const r = presetRange(preset);
    return { startDate: r.start, endDate: r.end };
  }, [preset, usingCustom, customStart, customEnd]);

  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [beginnings, setBeginnings] = useState<DailyBeginning[]>([]);
  const [unmatchedDocs, setUnmatchedDocs] = useState<UnmatchedDoc[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      await auth.authStateReady();
      const queries: Promise<Awaited<ReturnType<typeof getDocs>>>[] = [
        getDocs(query(
          collection(db, COLS.adjustments),
          where("branch", "==", branch),
          where("department", "==", department),
          where("date", ">=", startDate),
          where("date", "<=", endDate),
        )),
        getDocs(query(
          collection(db, COLS.dailyBeginning),
          where("branch", "==", branch),
          where("department", "==", department),
          where("date", ">=", startDate),
          where("date", "<=", endDate),
        )),
      ];
      if (branch === "MKT") {
        queries.push(getDocs(query(
          collection(db, COLS.storehubUnmatched),
          where("branch", "==", branch),
        )));
      }
      const results = await Promise.all(queries);
      setAdjustments(results[0].docs.map(d => d.data() as StockAdjustment));
      setBeginnings(results[1].docs.map(d => d.data() as DailyBeginning));
      if (branch === "MKT" && results[2]) {
        const docs = results[2].docs
          .map(d => d.data() as UnmatchedDoc)
          .filter(d => d.date >= startDate && d.date <= endDate)
          .sort((a, b) => a.date.localeCompare(b.date));
        setUnmatchedDocs(docs);
      } else {
        setUnmatchedDocs([]);
      }
    } catch (err) {
      console.error("Variance report fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [branch, department, startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const allRows = useMemo(
    () => computeVarianceRows(adjustments, beginnings, branch, department),
    [adjustments, beginnings, branch, department],
  );

  const presetLabel = usingCustom
    ? `${startDate} to ${endDate}`
    : `Last ${preset} days`;

  function exportUnmatchedCSV() {
    const header = ["Date", "SKU", "Product Name", "Qty Sold"];
    const rows = unmatchedDocs.flatMap(d =>
      d.items.map(it => [d.date, it.sku, it.name, it.qty])
    );
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unmatched-skus-${BRANCH_LABELS[branch]}-${startDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: "12px 16px" }}>
      {/* Preset buttons + date range */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        {([7, 14, 30] as Preset[]).map(d => (
          <button
            key={d}
            onClick={() => { setPreset(d); setUsingCustom(false); }}
            style={{
              padding: "6px 14px", borderRadius: 6, border: "1px solid", fontSize: 13,
              fontWeight: 500, cursor: "pointer",
              background: !usingCustom && preset === d ? "#0f172a" : "#fff",
              color:      !usingCustom && preset === d ? "#fff"    : "#475569",
              borderColor: !usingCustom && preset === d ? "#0f172a" : "#cbd5e1",
            }}
          >
            Last {d} days
          </button>
        ))}
        <div style={{ width: 1, height: 24, background: "#e2e8f0", margin: "0 4px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>From</span>
          <input
            type="date"
            value={customStart || startDate}
            onChange={e => { setCustomStart(e.target.value); setUsingCustom(true); }}
            style={{ padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, color: "#475569", width: 140 }}
          />
          <span style={{ fontSize: 12, color: "#94a3b8" }}>To</span>
          <input
            type="date"
            value={customEnd || endDate}
            onChange={e => { setCustomEnd(e.target.value); setUsingCustom(true); }}
            style={{ padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, color: "#475569", width: 140 }}
          />
        </div>
      </div>

      {/* Export CSV on its own row */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => exportVarianceCsv(allRows, new Map(), startDate, endDate, BRANCH_LABELS[branch])}
          style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", color: "#475569", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          ↓ Export CSV ({presetLabel})
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "48px 0", fontSize: 14 }}>Loading…</div>
      ) : (
        <>
          <VarianceTable rows={allRows} />

          {/* Unmatched SKUs — MKT only */}
          {branch === "MKT" && (
            <div style={{ marginTop: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Unmatched SKUs (StoreHub)</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    {unmatchedDocs.length === 0
                      ? "No unmatched SKUs for this period."
                      : `${unmatchedDocs.reduce((n, d) => n + d.items.length, 0)} SKUs across ${unmatchedDocs.length} day(s)`}
                  </div>
                </div>
                {unmatchedDocs.length > 0 && (
                  <button
                    onClick={exportUnmatchedCSV}
                    style={{ padding: "6px 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text)", whiteSpace: "nowrap" }}
                  >
                    Export CSV
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
