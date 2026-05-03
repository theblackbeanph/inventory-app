"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { db, COLS, getDocs, query, collection, where, doc, setDoc } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import type { Branch, Department, StockAdjustment, DailyBeginning, VarianceExplanation, ExplanationReason } from "@/lib/types";
import { addDays, todayPHT, formatDate } from "@/app/stock/_lib/helpers";
import { computeVarianceRows, exportVarianceCsv, type VarianceRow } from "@/app/dashboard/_lib/variance";
import { hasMinRole } from "@/lib/roles";
import type { Role } from "@/lib/roles";
import { BRANCH_LABELS } from "@/lib/auth";

const EXPLANATION_OPTIONS = [
  "Counting error",
  "Waste",
  "Data entry error",
  "Unknown",
] as const;

type Preset = 7 | 14 | 30;

function presetRange(days: Preset): { start: string; end: string } {
  const end = todayPHT();
  return { start: addDays(end, -(days - 1)), end };
}

function VarPctBadge({ variancePct, variance }: { variancePct: number; variance: number }) {
  const sign = variance > 0 ? "+" : "";
  const label = `${sign}${Math.round(variancePct)}%`;
  let bg = "#dcfce7", color = "#16a34a";
  if (variancePct > 30) { bg = "#fee2e2"; color = "#dc2626"; }
  else if (variancePct >= 10) { bg = "#fef3c7"; color = "#d97706"; }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 5, background: bg, color, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function VarianceTable({
  rows, explanations, canEdit, onSave, isPending,
}: {
  rows: VarianceRow[];
  explanations: Map<string, VarianceExplanation>;
  canEdit: boolean;
  onSave: (docId: string, item: string, date: string, reason: ExplanationReason) => Promise<void>;
  isPending: boolean;
}) {
  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff", borderRadius: 10, overflow: "hidden" }}>
        <thead>
          <tr style={{ background: "var(--bg)" }}>
            {["Date", "Item", "Var %", "Var (units)", "Actual", "Expected", "Explanation"].map(h => (
              <th key={h} style={{
                padding: "8px 10px", fontSize: 10, fontWeight: 700,
                letterSpacing: "0.08em", color: "var(--text-secondary)",
                textTransform: "uppercase",
                textAlign: h === "Item" || h === "Explanation" ? "left" : "center",
                whiteSpace: "nowrap", borderBottom: "1px solid var(--border)",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const expl = explanations.get(row.docId);
            const muted = !isPending;
            return (
              <tr key={row.docId} style={{ borderBottom: "1px solid var(--border)", background: isPending ? "#fffbeb" : "#fff" }}>
                <td style={{ padding: "10px 10px", whiteSpace: "nowrap", color: muted ? "#94a3b8" : "inherit" }}>
                  {formatDate(row.date)}
                </td>
                <td style={{ padding: "10px 10px", fontWeight: muted ? 500 : 600, whiteSpace: "nowrap", color: muted ? "#94a3b8" : "#0f172a" }}>
                  {row.item}
                </td>
                <td style={{ padding: "10px 6px", textAlign: "center" }}>
                  <VarPctBadge variancePct={row.variancePct} variance={row.variance} />
                </td>
                <td style={{ padding: "10px 6px", textAlign: "center", fontWeight: 600, color: row.variance < 0 ? "#dc2626" : "#16a34a" }}>
                  {row.variance > 0 ? `+${row.variance}` : row.variance}
                </td>
                <td style={{ padding: "10px 6px", textAlign: "center", color: muted ? "#94a3b8" : "inherit" }}>{row.actual}</td>
                <td style={{ padding: "10px 6px", textAlign: "center", color: muted ? "#94a3b8" : "inherit" }}>{row.expected}</td>
                <td style={{ padding: "10px 10px" }}>
                  {isPending && canEdit ? (
                    <select
                      defaultValue=""
                      onChange={e => {
                        if (e.target.value) {
                          onSave(row.docId, row.item, row.date, e.target.value as ExplanationReason);
                        }
                      }}
                      style={{ padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, color: "#374151", background: "#fff", maxWidth: 185, cursor: "pointer" }}
                    >
                      <option value="">Select reason…</option>
                      {EXPLANATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : expl ? (
                    <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b", background: "#f1f5f9", padding: "3px 9px", borderRadius: 5, display: "inline-block" }}>
                      {expl.explanation}
                    </span>
                  ) : (
                    <span style={{ color: "#94a3b8" }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function VarianceReport({ branch, department, role }: {
  branch: Branch;
  department: Department;
  role: Role;
}) {
  const canEdit = hasMinRole(role, "admin");

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
  const [explanations, setExplanations] = useState<Map<string, VarianceExplanation>>(new Map());
  const [loading, setLoading] = useState(false);
  const [reviewedOpen, setReviewedOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      await auth.authStateReady();
      const [adjSnap, begSnap, explSnap] = await Promise.all([
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
        getDocs(query(
          collection(db, COLS.varianceExplanations),
          where("branch", "==", branch),
          where("department", "==", department),
        )),
      ]);
      setAdjustments(adjSnap.docs.map(d => d.data() as StockAdjustment));
      setBeginnings(begSnap.docs.map(d => d.data() as DailyBeginning));
      const explMap = new Map<string, VarianceExplanation>();
      explSnap.docs.forEach(d => {
        const e = d.data() as VarianceExplanation;
        if (e.date >= startDate && e.date <= endDate) explMap.set(e.id, e);
      });
      setExplanations(explMap);
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

  const pendingRows = allRows.filter(r => !explanations.has(r.docId));
  const reviewedRows = allRows.filter(r => explanations.has(r.docId));

  const saveExplanation = useCallback(async (docId: string, item: string, date: string, reason: ExplanationReason) => {
    const uid = auth.currentUser?.uid ?? "";
    const explDoc: VarianceExplanation = {
      id: docId, branch, department, item, date,
      explanation: reason, notes: "",
      savedBy: uid, savedAt: new Date().toISOString(),
    };
    setExplanations(prev => new Map(prev).set(docId, explDoc)); // optimistic
    try {
      await setDoc(doc(db, COLS.varianceExplanations, docId), explDoc);
    } catch (err) {
      setExplanations(prev => {
        const next = new Map(prev);
        next.delete(docId);
        return next;
      });
      console.error("Failed to save explanation:", err);
    }
  }, [branch, department]);

  const presetLabel = usingCustom
    ? `${startDate} to ${endDate}`
    : `Last ${preset} days`;

  return (
    <div style={{ padding: "12px 16px" }}>
      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
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
        <button
          onClick={() => exportVarianceCsv(allRows, explanations, startDate, endDate, BRANCH_LABELS[branch])}
          style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", color: "#475569", display: "flex", alignItems: "center", gap: 6 }}
        >
          ↓ Export CSV ({presetLabel})
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "48px 0", fontSize: 14 }}>Loading…</div>
      ) : (
        <>
          {/* Pending section */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#b45309" }}>
                ⚠ Pending Explanation
              </span>
              {pendingRows.length > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#fef3c7", color: "#b45309" }}>
                  {pendingRows.length} item{pendingRows.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {pendingRows.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 10, border: "1px dashed #e2e8f0", padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                All caught up — no unexplained variances for this period.
              </div>
            ) : (
              <VarianceTable rows={pendingRows} explanations={explanations} canEdit={canEdit} onSave={saveExplanation} isPending />
            )}
          </div>

          {/* Reviewed section (collapsed by default) */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b" }}>
                ✓ Reviewed
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#f1f5f9", color: "#64748b" }}>
                {reviewedRows.length} item{reviewedRows.length !== 1 ? "s" : ""}
              </span>
              <button
                onClick={() => setReviewedOpen(o => !o)}
                style={{ marginLeft: "auto", background: "none", border: "1px solid #e2e8f0", color: "#64748b", fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 5, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
              >
                {reviewedOpen ? "Hide" : "Show"}
                <span style={{ display: "inline-block", transform: reviewedOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
              </button>
            </div>
            {reviewedOpen && (
              reviewedRows.length === 0 ? (
                <div style={{ background: "#fff", borderRadius: 10, border: "1px dashed #e2e8f0", padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                  No reviewed variances for this period.
                </div>
              ) : (
                <div style={{ opacity: 0.8 }}>
                  <VarianceTable rows={reviewedRows} explanations={explanations} canEdit={false} onSave={saveExplanation} isPending={false} />
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
