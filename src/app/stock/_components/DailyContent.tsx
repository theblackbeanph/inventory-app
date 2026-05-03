"use client";
import type { Branch } from "@/lib/types";
import { CATALOG } from "@/lib/items";
import { BRANCH_LABELS } from "@/lib/auth";
import type { DailyMetrics } from "../_lib/helpers";

export function DailyContent({ items, metrics, summaryDate, today, activeFilter, onDateChange, onFilterChange, lowItems, oosItems, branch }: {
  items: typeof CATALOG;
  metrics: Record<string, DailyMetrics>;
  summaryDate: string;
  today: string;
  activeFilter: "variance" | "low" | "oos" | null;
  onDateChange: (d: string) => void;
  onFilterChange: (f: "variance" | "low" | "oos" | null) => void;
  lowItems: Set<string>;
  oosItems: Set<string>;
  branch: Branch;
}) {
  const rows = items.map(item => {
    const m = metrics[item.name];
    const expected = m.beginning !== null ? m.beginning + m.inQty - m.outQty : null;
    const variance = m.endCount !== null && expected !== null ? m.endCount - expected : null;
    return { item, m, expected, variance };
  }).filter(r => {
    if (!activeFilter) return true;
    if (activeFilter === "variance") return r.variance !== null && r.variance !== 0;
    if (activeFilter === "low") return lowItems.has(r.item.name);
    if (activeFilter === "oos") return oosItems.has(r.item.name);
    return true;
  });

  function exportCSV() {
    const header = ["Item", "Pack Size", "Beginning", "IN", "OUT", "Expected", "End Count", "Variance"];
    const csvRows = [header, ...rows.map(({ item, m, expected, variance }) =>
      [item.name, item.packSize, m.beginning ?? "", m.inQty, m.outQty, expected ?? "", m.endCount ?? "", variance ?? ""]
    )];
    const csv = csvRows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-${BRANCH_LABELS[branch]}-${summaryDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const thStyle: React.CSSProperties = {
    padding: "8px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
    color: "var(--text-secondary)", textTransform: "uppercase", textAlign: "center",
    whiteSpace: "nowrap", background: "var(--bg)", borderBottom: "1px solid var(--border)",
  };
  const tdStyle: React.CSSProperties = { padding: "0 8px", textAlign: "center", fontSize: 14, fontWeight: 600 };

  return (
    <div style={{ padding: "12px 16px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input
          type="date"
          value={summaryDate}
          max={today}
          onChange={e => onDateChange(e.target.value)}
          style={{ border: "1.5px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 13, background: "#fff", color: "var(--text)", outline: "none" }}
        />
        {(["variance", "low", "oos"] as const).map(f => {
          const label = f === "variance" ? "Variance" : f === "low" ? `${lowItems.size} Low` : `${oosItems.size} OOS`;
          if (f === "low" && lowItems.size === 0 && activeFilter !== "low") return null;
          if (f === "oos" && oosItems.size === 0 && activeFilter !== "oos") return null;
          const active = activeFilter === f;
          return (
            <button
              key={f}
              onClick={() => onFilterChange(active ? null : f)}
              style={{ padding: "5px 14px", borderRadius: 20, border: "1.5px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", borderColor: active ? "#1A1A1A" : "var(--border)", background: active ? "#1A1A1A" : "#fff", color: active ? "#fff" : "var(--text-secondary)" }}
            >{label}</button>
          );
        })}
      </div>

<div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", background: "#fff" }}>
        <table style={{ minWidth: 540, borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: "left", position: "sticky", left: 0, background: "var(--bg)", minWidth: 140 }}>Item</th>
              <th style={thStyle}>BEG</th>
              <th style={thStyle}>IN</th>
              <th style={thStyle}>OUT</th>
              <th style={thStyle}>EXP</th>
              <th style={thStyle}>END</th>
              <th style={thStyle}>VAR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, m, expected, variance }) => {
              const varColor = variance === null ? "var(--text-secondary)" : variance < 0 ? "#DC2626" : variance > 0 ? "#D97706" : "#16A34A";
              return (
                <tr key={item.name} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ ...tdStyle, textAlign: "left", padding: "10px 12px", position: "sticky", left: 0, background: "#fff" }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1 }}>{item.packSize}</div>
                  </td>
                  <td style={tdStyle}>{m.beginning ?? "—"}</td>
                  <td style={{ ...tdStyle, color: m.inQty > 0 ? "#16A34A" : undefined }}>{m.inQty > 0 ? `+${m.inQty}` : "—"}</td>
                  <td style={{ ...tdStyle, color: m.outQty > 0 ? "#DC2626" : undefined }}>
                    {m.outQty > 0 ? (
                      <>
                        <div>{`−${m.outQty}`}</div>
                        {m.salesOrders > 0 && (
                          <div style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 400 }}>{m.salesOrders} orders</div>
                        )}
                      </>
                    ) : "—"}
                  </td>
                  <td style={tdStyle}>{expected ?? "—"}</td>
                  <td style={tdStyle}>{m.endCount ?? "—"}</td>
                  <td style={{ ...tdStyle, color: varColor, fontWeight: 700 }}>
                    {variance === null ? "—" : variance === 0 ? "✓" : variance > 0 ? `+${variance}` : String(variance)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "var(--text-secondary)", fontSize: 14 }}>No items to show</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        onClick={exportCSV}
        style={{ marginTop: 16, width: "100%", padding: "13px 0", borderRadius: 12, border: "1.5px solid var(--border)", background: "#fff", color: "var(--text)", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
      >
        Export inventory
      </button>
    </div>
  );
}
