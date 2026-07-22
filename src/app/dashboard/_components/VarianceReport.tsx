"use client";
import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import { db, COLS, getDocs, query, collection, where } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import type { Branch, Department, StockAdjustment, DailyBeginning } from "@/lib/types";
import { addDays, todayPHT, formatDate } from "@/app/stock/_lib/helpers";
import {
  computeItemSummaries,
  exportItemSummariesCsv,
  exportLossSummaryCsv,
  datesInRange,
  type ItemSummary,
} from "@/app/dashboard/_lib/variance";
import { BRANCH_LABELS } from "@/lib/auth";
import { allMappedItems } from "@/lib/storehub-mapping";
import { CATALOG_MAP } from "@/lib/items";

// ─── Types ────────────────────────────────────────────────────────────────────

type Preset = 7 | "mtd";
type Direction = "all" | "loss" | "surplus";

interface UnmatchedDoc {
  id: string;
  branch: Branch;
  date: string;
  syncedAt: string;
  items: { sku: string; name: string; qty: number }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function presetRange(days: Preset): { start: string; end: string } {
  const end = todayPHT();
  if (days === "mtd") {
    const [y, m] = end.split("-");
    return { start: `${y}-${m}-01`, end };
  }
  return { start: addDays(end, -(days - 1)), end };
}

function formatBarDate(date: string): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const [, m, d] = date.split("-");
  return `${months[parseInt(m, 10) - 1]}${parseInt(d, 10)}`;
}

function btnStyle(active: boolean): React.CSSProperties {
  return {
    padding: "5px 12px", borderRadius: 6, border: "1px solid",
    fontSize: 12, fontWeight: 500, cursor: "pointer",
    background: active ? "#0f172a" : "#fff",
    color: active ? "#fff" : "#475569",
    borderColor: active ? "#0f172a" : "#cbd5e1",
  };
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "4px 10px", borderRadius: 20, border: "1.5px solid",
    fontSize: 12, fontWeight: 600, cursor: "pointer",
    background: active ? "#0f172a" : "#fff",
    color: active ? "#fff" : "#64748b",
    borderColor: active ? "#0f172a" : "#e2e8f0",
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const STATUS_COLORS = {
  critical: "#dc2626",
  watch: "#d97706",
  normal: "#94a3b8",
} as const;


const TABLE_COLS = [
  { label: "Item", align: "left" as const },
  { label: "Period Var", align: "right" as const },
  { label: "Var %", align: "right" as const },
  { label: "Days w/ var", align: "right" as const },
  { label: "Trend", align: "left" as const },
  { label: "Latest END", align: "right" as const },
];

function SummaryRow({ summary, isSelected, onClick }: {
  summary: ItemSummary;
  isSelected: boolean;
  onClick: () => void;
}) {
  const sign = summary.periodVariance > 0 ? "+" : "";
  const varColor = summary.periodVariance < 0 ? "#dc2626" : "#d97706";
  const isResolving = summary.status === "critical" && summary.trend === "better";
  const trendLabel = summary.trend === "better" ? "↗ better" : summary.trend === "worse" ? "↘ worse" : "→ stable";
  const trendColor = summary.trend === "better" ? "#16a34a" : summary.trend === "worse" ? "#dc2626" : "#94a3b8";
  const accentColor = STATUS_COLORS[summary.status];

  return (
    <tr
      onClick={onClick}
      style={{ borderBottom: "1px solid #f8fafc", cursor: "pointer", background: isSelected ? "#eff6ff" : undefined }}
      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = "#f8fafc"; }}
      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
    >
      <td style={{ width: 4, padding: 0 }}>
        <span style={{ display: "block", width: 4, minHeight: 46, background: accentColor }} />
      </td>
      <td style={{ padding: "10px 12px" }}>
        <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 13 }}>
          {summary.item}
          {isResolving && (
            <span style={{ fontSize: 10, fontWeight: 700, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", padding: "1px 6px", borderRadius: 4, marginLeft: 6, verticalAlign: "middle" }}>
              ↗ Resolving
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>Click to see daily breakdown →</div>
      </td>
      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: varColor }}>
        {sign}{summary.periodVariance}
      </td>
      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: varColor }}>
        {sign}{Math.round(summary.periodVarPct)}%
      </td>
      <td style={{ padding: "10px 12px", textAlign: "right" }}>
        <span style={{ fontWeight: 700, color: "#0f172a" }}>{summary.daysWithVariance}</span>
        <span style={{ color: "#94a3b8" }}> of {summary.totalDays}</span>
      </td>
      <td style={{ padding: "10px 12px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: trendColor, whiteSpace: "nowrap" }}>{trendLabel}</span>
      </td>
      <td style={{ padding: "10px 12px", textAlign: "right", color: "#475569" }}>
        {summary.latestEnd ?? "—"}
      </td>
    </tr>
  );
}

function InsightRow({ summary }: { summary: ItemSummary }) {
  if (!summary.hasInsight) return null;
  return (
    <tr>
      <td colSpan={7} style={{ padding: "0 12px 10px" }}>
        <div style={{ background: "#fefce8", border: "1px solid #fef08a", borderRadius: 6, padding: "7px 10px", fontSize: 11, color: "#854d0e", lineHeight: 1.5 }}>
          ⚠ Variance recurring on {summary.daysWithVariance} of {summary.totalDays} days. Consistent shortfall — likely systematic. Check POS mapping or portioning consistency rather than investigating each day separately.
        </div>
      </td>
    </tr>
  );
}

function SummaryTable({ summaries, selectedItem, onSelect, showInsights = false }: {
  summaries: ItemSummary[];
  selectedItem: ItemSummary | null;
  onSelect: (s: ItemSummary) => void;
  showInsights?: boolean;
}) {
  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", marginBottom: 6 } as React.CSSProperties}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff" }}>
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            <th style={{ width: 4, padding: 0 }} />
            {TABLE_COLS.map(col => (
              <th key={col.label} style={{
                padding: "9px 12px", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                color: "#94a3b8", textTransform: "uppercase", textAlign: col.align,
                whiteSpace: "nowrap", borderBottom: "1px solid #e2e8f0",
              }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {summaries.map(s => (
            <Fragment key={s.item}>
              <SummaryRow summary={s} isSelected={selectedItem?.item === s.item} onClick={() => onSelect(s)} />
              {showInsights && <InsightRow summary={s} />}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailPanel({ item, dateRange, onClose }: {
  item: ItemSummary | null;
  dateRange: string;
  onClose: () => void;
}) {
  const maxAbs = item
    ? Math.max(...item.dailyRows.map(r => Math.abs(r.variance ?? 0)), 1)
    : 1;

  return (
    <div style={{
      position: "fixed", top: 0,
      right: item ? 0 : -380,
      width: 360,
      height: "100vh",
      background: "#fff",
      borderLeft: "1px solid var(--border)",
      boxShadow: "-4px 0 20px rgba(0,0,0,0.08)",
      overflowY: "auto",
      zIndex: 50,
      transition: "right 0.25s ease",
    }}>
      {item && (
        <>
          {/* Header */}
          <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
            <button onClick={onClose} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 18, lineHeight: 1 }}>✕</button>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 2 }}>{item.item}</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{dateRange}</div>
          </div>

          <div style={{ padding: "14px 16px" }}>
            {/* Period KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
              {[
                { label: "Period Var", value: `${item.periodVariance > 0 ? "+" : ""}${item.periodVariance}`, color: item.periodVariance < 0 ? "#dc2626" : "#d97706" },
                { label: "Var %", value: `${item.periodVariance > 0 ? "+" : ""}${Math.round(item.periodVarPct)}%`, color: item.periodVariance < 0 ? "#dc2626" : "#d97706" },
                { label: "Days w/ var", value: `${item.daysWithVariance} of ${item.totalDays}`, color: "#0f172a" },
              ].map(kpi => (
                <div key={kpi.label} style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 2 }}>{kpi.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                </div>
              ))}
            </div>

            {/* Bar chart */}
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 8 }}>Daily Variance</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 72, marginBottom: 14 }}>
              {item.dailyRows.map(row => {
                const abs = Math.abs(row.variance ?? 0);
                const heightPct = abs > 0 ? (abs / maxAbs) * 100 : 0;
                const barColor = (row.variance ?? 0) < 0 ? "#dc2626" : (row.variance ?? 0) > 0 ? "#d97706" : "#e2e8f0";
                return (
                  <div key={row.date} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, height: "100%", justifyContent: "flex-end" }}>
                    <div style={{
                      borderRadius: "3px 3px 0 0",
                      width: "80%",
                      height: heightPct > 0 ? `${heightPct}%` : 3,
                      background: barColor,
                      minHeight: 3,
                    }} />
                    <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 3, whiteSpace: "nowrap" }}>
                      {formatBarDate(row.date)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Insight box */}
            {item.hasInsight && (
              <div style={{ background: "#fefce8", border: "1px solid #fef08a", borderRadius: 6, padding: "9px 11px", fontSize: 11, color: "#854d0e", lineHeight: 1.55, marginBottom: 14 }}>
                ⚠ Variance recurring on {item.daysWithVariance} of {item.totalDays} days. Consistent shortfall — likely systematic. Check POS mapping or portioning consistency.
              </div>
            )}
            {item.trend === "better" && item.status === "critical" && !item.hasInsight && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "9px 11px", fontSize: 11, color: "#166534", lineHeight: 1.55, marginBottom: 14 }}>
                ↗ Trending better — variance decreasing over this period. Monitor for one more period before closing.
              </div>
            )}

            {/* Daily breakdown table */}
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 8 }}>Daily Breakdown</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["Date", "BEG", "IN", "OUT", "EXP", "END", "VAR"].map(h => (
                      <th key={h} style={{
                        fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: "0.06em", color: "#94a3b8",
                        padding: "5px 6px",
                        textAlign: h === "Date" ? "left" : "right",
                        borderBottom: "1px solid var(--border)",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {item.dailyRows.map(row => {
                    const varVal = row.variance;
                    const varColor = varVal === null || varVal === 0 ? "#94a3b8" : varVal < 0 ? "#dc2626" : "#d97706";
                    const varDisplay = varVal === null || varVal === 0 ? "—" : varVal > 0 ? `+${varVal}` : String(varVal);
                    return (
                      <tr key={row.date}>
                        <td style={{ padding: "6px 6px", color: "#0f172a", fontWeight: 500 }}>{formatDate(row.date)}</td>
                        <td style={{ padding: "6px 6px", textAlign: "right", color: "#475569" }}>{row.beg}</td>
                        <td style={{ padding: "6px 6px", textAlign: "right", color: "#475569" }}>{row.totalIn > 0 ? row.totalIn : "—"}</td>
                        <td style={{ padding: "6px 6px", textAlign: "right", color: "#475569" }}>{row.totalOut > 0 ? row.totalOut : "—"}</td>
                        <td style={{ padding: "6px 6px", textAlign: "right", color: "#475569" }}>{row.exp}</td>
                        <td style={{ padding: "6px 6px", textAlign: "right", color: "#475569" }}>{row.end ?? "—"}</td>
                        <td style={{ padding: "6px 6px", textAlign: "right", fontWeight: varVal !== null && varVal !== 0 ? 700 : 400, color: varColor }}>
                          {varDisplay}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function VarianceReport({ branch, department }: {
  branch: Branch;
  department: Department;
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

  const [direction, setDirection] = useState<Direction>("all");
  const [threshold, setThreshold] = useState(2);
  const [selectedItem, setSelectedItem] = useState<ItemSummary | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      await auth.authStateReady();
      const queries: Promise<Awaited<ReturnType<typeof getDocs>>>[] = [
        getDocs(query(collection(db, COLS.adjustments), where("branch", "==", branch), where("department", "==", department))),
        getDocs(query(collection(db, COLS.dailyBeginning), where("branch", "==", branch), where("department", "==", department))),
      ];
      if (branch === "MKT") {
        queries.push(getDocs(query(collection(db, COLS.storehubUnmatched), where("branch", "==", branch))));
      }
      const results = await Promise.all(queries);
      setAdjustments(
        results[0].docs.map(d => d.data() as StockAdjustment).filter(a => a.date >= startDate && a.date <= endDate)
      );
      setBeginnings(
        results[1].docs.map(d => d.data() as DailyBeginning).filter(b => b.date >= startDate && b.date <= endDate)
      );
      if (branch === "MKT" && results[2]) {
        setUnmatchedDocs(
          results[2].docs.map(d => d.data() as UnmatchedDoc)
            .filter(d => d.date >= startDate && d.date <= endDate)
            .sort((a, b) => a.date.localeCompare(b.date))
        );
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

  const allDates = useMemo(() => datesInRange(startDate, endDate), [startDate, endDate]);

  const { summaries: rawSummaries } = useMemo(
    () => computeItemSummaries(adjustments, beginnings, allDates),
    [adjustments, beginnings, allDates],
  );

  const trackedItems = useMemo(() => allMappedItems(branch), [branch]);

  const filteredSummaries = useMemo(() => {
    let filtered = rawSummaries.filter(s =>
      trackedItems.has(s.item) &&
      CATALOG_MAP.get(s.item)?.department === department &&
      Math.abs(s.periodVariance) >= threshold
    );
    if (direction === "loss") filtered = filtered.filter(s => s.periodVariance < 0);
    if (direction === "surplus") filtered = filtered.filter(s => s.periodVariance > 0);
    return filtered;
  }, [rawSummaries, trackedItems, department, threshold, direction]);

  useEffect(() => {
    if (selectedItem && !filteredSummaries.find(s => s.item === selectedItem.item)) {
      setSelectedItem(null);
    }
  }, [filteredSummaries, selectedItem]);

  const presetLabel = usingCustom ? `${startDate} to ${endDate}` : preset === 7 ? "Last 7 days" : "MTD";
  const panelDateRange = `${presetLabel} · ${formatDate(startDate)} – ${formatDate(endDate)}`;

  const uniqueUnmatchedSkus = useMemo(() => {
    const seen = new Map<string, { sku: string; name: string; qty: number; lastDate: string }>();
    for (const d of unmatchedDocs) {
      for (const it of d.items) {
        const existing = seen.get(it.sku);
        if (!existing || d.date > existing.lastDate) {
          seen.set(it.sku, { sku: it.sku, name: it.name, qty: it.qty, lastDate: d.date });
        }
      }
    }
    return Array.from(seen.values());
  }, [unmatchedDocs]);

  function exportUnmatchedCSV() {
    const header = ["SKU", "Product Name", "Qty Sold (latest)"];
    const rows = uniqueUnmatchedSkus.map(it => [it.sku, it.name, it.qty]);
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unmatched-skus-${BRANCH_LABELS[branch]}-${startDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleSelectItem(s: ItemSummary) {
    setSelectedItem(prev => prev?.item === s.item ? null : s);
  }

  return (
    <div style={{ display: "flex", position: "relative" }}>
      {/* Main content — shrinks when panel open */}
      <div style={{
        flex: 1, minWidth: 0, padding: "12px 16px",
        marginRight: selectedItem ? 368 : 0,
        transition: "margin-right 0.25s ease",
      }}>
        {/* Filter bar */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => { setPreset(7); setUsingCustom(false); }} style={btnStyle(!usingCustom && preset === 7)}>
              Last 7 days
            </button>
            <button onClick={() => { setPreset("mtd"); setUsingCustom(false); }} style={btnStyle(!usingCustom && preset === "mtd")}>
              MTD
            </button>
            <div style={{ width: 1, height: 22, background: "#e2e8f0", margin: "0 2px" }} />
            <span style={{ fontSize: 11, color: "#94a3b8" }}>From</span>
            <input
              type="date"
              value={customStart || startDate}
              onChange={e => { setCustomStart(e.target.value); setUsingCustom(true); }}
              style={{ padding: "4px 8px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 12, color: "#475569", width: 130 }}
            />
            <span style={{ fontSize: 11, color: "#94a3b8" }}>To</span>
            <input
              type="date"
              value={customEnd || endDate}
              onChange={e => { setCustomEnd(e.target.value); setUsingCustom(true); }}
              style={{ padding: "4px 8px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 12, color: "#475569", width: 130 }}
            />
            <div style={{ width: 1, height: 22, background: "#e2e8f0", margin: "0 2px" }} />
            <button onClick={() => setDirection("all")} style={chipStyle(direction === "all")}>All</button>
            <button onClick={() => setDirection("loss")} style={chipStyle(direction === "loss")}>Loss only ↘</button>
            <button onClick={() => setDirection("surplus")} style={chipStyle(direction === "surplus")}>Surplus only ↗</button>
          </div>
          {/* Threshold slider on its own row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8, borderTop: "1px solid #f1f5f9", marginTop: 8 }}>
            <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>Hide small variances</span>
            <input
              type="range"
              min={0} max={10}
              value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
              style={{ width: 110, accentColor: "#0f172a" } as React.CSSProperties}
            />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", minWidth: 52 }}>≥ {threshold} units</span>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>items below this are hidden</span>
          </div>
        </div>

        {/* Export */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button
            onClick={() => exportItemSummariesCsv(filteredSummaries, startDate, endDate, BRANCH_LABELS[branch])}
            style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", color: "#475569" }}
          >
            ↓ Export CSV ({presetLabel})
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "48px 0", fontSize: 14 }}>Loading…</div>
        ) : (
          <>
            {/* All items — flat list sorted by |variance| */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 7px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>All Items</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: "#f1f5f9", color: "#64748b" }}>{filteredSummaries.length} items</span>
              <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 4 }}>sorted by |variance| ↓</span>
            </div>
            {filteredSummaries.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 10, border: "1px dashed #e2e8f0", padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13, marginBottom: 6 }}>
                No variances for this period.
              </div>
            ) : (
              <SummaryTable summaries={filteredSummaries} selectedItem={selectedItem} onSelect={handleSelectItem} showInsights />
            )}

            {/* Loss Summary — for month-end charges */}
            {(() => {
              const lossItems = rawSummaries.filter(s => trackedItems.has(s.item) && s.periodVariance < 0);
              return (
                <div style={{ marginTop: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Loss Summary (for charges)</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                        {lossItems.length === 0
                          ? "No loss items for this period."
                          : `${lossItems.length} item${lossItems.length !== 1 ? "s" : ""} with net loss · Add cost/unit in the spreadsheet`}
                      </div>
                    </div>
                    {lossItems.length > 0 && (
                      <button
                        onClick={() => exportLossSummaryCsv(rawSummaries, startDate, endDate, BRANCH_LABELS[branch])}
                        style={{ padding: "6px 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text)", whiteSpace: "nowrap" }}
                      >
                        Export CSV
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Unmatched SKUs — MKT only */}
            {branch === "MKT" && (
              <div style={{ marginTop: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Unmatched SKUs (StoreHub)</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      {uniqueUnmatchedSkus.length === 0
                        ? "No unmatched SKUs for this period."
                        : `${uniqueUnmatchedSkus.length} unique SKU${uniqueUnmatchedSkus.length !== 1 ? "s" : ""} not mapped to inventory`}
                    </div>
                  </div>
                  {uniqueUnmatchedSkus.length > 0 && (
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

      {/* Slide-in detail panel */}
      <DetailPanel item={selectedItem} dateRange={panelDateRange} onClose={() => setSelectedItem(null)} />
    </div>
  );
}
