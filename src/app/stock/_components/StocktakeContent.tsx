"use client";
import { CATALOG } from "@/lib/items";
import type { DailyMetrics } from "../_lib/helpers";

export function StocktakeContent({ items, metrics, endCounts, countedBy, staffNames, onCountedByChange, onCountChange, onReview }: {
  items: typeof CATALOG;
  metrics: Record<string, DailyMetrics>;
  endCounts: Record<string, string>;
  countedBy: string;
  staffNames: string[];
  onCountedByChange: (name: string) => void;
  onCountChange: (item: string, val: string) => void;
  onReview: () => void;
}) {
  const enteredCount = items.filter(i => endCounts[i.name] !== undefined && endCounts[i.name] !== "").length;
  const canProceed = countedBy !== "" && enteredCount > 0;

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "12px 16px" }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
          Counted by
        </label>
        <select
          value={countedBy}
          onChange={e => onCountedByChange(e.target.value)}
          style={{
            width: "100%", padding: "10px 12px", fontSize: 15, fontWeight: 600,
            border: "1.5px solid", borderColor: countedBy ? "#1A1A1A" : "var(--border)",
            borderRadius: 10, background: "#fff", color: countedBy ? "var(--text)" : "var(--text-secondary)",
            outline: "none", appearance: "none",
          }}
        >
          <option value="">Select name…</option>
          {staffNames.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        {!countedBy && (
          <div style={{ fontSize: 12, color: "#D97706", marginTop: 6 }}>Select your name to start counting</div>
        )}
      </div>

      <div style={{ padding: "6px 16px 4px", fontSize: 12, color: "var(--text-secondary)" }}>
        {enteredCount} of {items.length} counted
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {items.map(item => {
          const m = metrics[item.name];
          const expected = m.beginning !== null ? m.beginning + m.inQty - m.outQty : null;
          const val = endCounts[item.name] ?? "";
          return (
            <div key={item.name} style={{ background: "#fff", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  {item.packSize}
                  {expected !== null && <span> · Expected: <strong>{expected}</strong></span>}
                </div>
              </div>
              <input
                type="number"
                inputMode="numeric"
                value={val}
                placeholder="—"
                disabled={!countedBy}
                onChange={e => onCountChange(item.name, e.target.value)}
                style={{
                  width: 72, padding: "8px 10px", fontSize: 16, fontWeight: 700,
                  textAlign: "right", border: "1.5px solid",
                  borderColor: val !== "" ? "#1A1A1A" : "var(--border)",
                  borderRadius: 10, outline: "none",
                  background: countedBy ? "var(--bg)" : "#F3F4F6",
                  color: "var(--text)", opacity: countedBy ? 1 : 0.4,
                }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ position: "fixed", bottom: "calc(var(--nav-h) + 12px)", left: 0, right: 0, padding: "0 16px", zIndex: 30 }}>
        <button
          onClick={onReview}
          disabled={!canProceed}
          style={{
            width: "100%", padding: "15px 0", borderRadius: 14, border: "none",
            fontWeight: 700, fontSize: 16, cursor: canProceed ? "pointer" : "not-allowed",
            background: canProceed ? "#1A1A1A" : "#E8E8E4",
            color: canProceed ? "#fff" : "var(--text-secondary)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          }}
        >
          Review ({enteredCount})
        </button>
      </div>
    </div>
  );
}
