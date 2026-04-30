"use client";
import { CATALOG, LOCATIONS } from "@/lib/items";
import type { DailyMetrics, FilterTab } from "../_lib/helpers";
import type { StocktakeDraft } from "@/lib/types";

export function StocktakeContent({ items, metrics, endCounts, drafts, currentFilter, onCountChange, onSaveLocation, onSubmitAll }: {
  items: typeof CATALOG;
  metrics: Record<string, DailyMetrics>;
  endCounts: Record<string, string>;
  drafts: Record<string, StocktakeDraft>;
  currentFilter: FilterTab;
  onCountChange: (item: string, val: string) => void;
  onSaveLocation: (location: string) => void;
  onSubmitAll: () => void;
}) {
  const enteredCount = items.filter(i => endCounts[i.name] !== undefined && endCounts[i.name] !== "").length;
  const totalEntered = Object.values(endCounts).filter(v => v !== "").length;
  const canSubmit = totalEntered > 0;

  const activeLocation = currentFilter !== "all" ? LOCATIONS.find(l => l.id === currentFilter) : null;
  const canSave = activeLocation !== null && enteredCount > 0;

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Location progress */}
      <div style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "12px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
          Stocktake Progress
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {LOCATIONS.map(loc => {
            const draft = drafts[loc.id];
            return (
              <div key={loc.id} style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                background: draft ? "#DCFCE7" : "#F3F4F6",
                color: draft ? "#15803D" : "var(--text-secondary)",
                border: `1.5px solid ${draft ? "#86EFAC" : "var(--border)"}`,
              }}>
                {draft ? "✓" : "○"} {loc.label}
                {draft && <span style={{ fontWeight: 400 }}> · {Object.keys(draft.counts).length}</span>}
              </div>
            );
          })}
        </div>
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
                onChange={e => onCountChange(item.name, e.target.value)}
                style={{
                  width: 72, padding: "8px 10px", fontSize: 16, fontWeight: 700,
                  textAlign: "right", border: "1.5px solid",
                  borderColor: val !== "" ? "#1A1A1A" : "var(--border)",
                  borderRadius: 10, outline: "none",
                  background: "var(--bg)", color: "var(--text)",
                }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ position: "fixed", bottom: "calc(var(--nav-h) + 12px)", left: 0, right: 0, padding: "0 16px", zIndex: 30, display: "flex", gap: 8 }}>
        {activeLocation && (
          <button
            onClick={() => onSaveLocation(activeLocation.id)}
            disabled={!canSave}
            style={{
              flex: 1, padding: "15px 0", borderRadius: 14,
              border: "1.5px solid var(--border)", fontWeight: 700, fontSize: 14,
              cursor: canSave ? "pointer" : "not-allowed",
              background: "#fff",
              color: canSave ? "var(--text)" : "var(--text-secondary)",
            }}
          >
            Save {activeLocation.label}
          </button>
        )}
        <button
          onClick={onSubmitAll}
          disabled={!canSubmit}
          style={{
            flex: activeLocation ? 1 : undefined,
            width: activeLocation ? undefined : "100%",
            padding: "15px 0", borderRadius: 14, border: "none",
            fontWeight: 700, fontSize: 16, cursor: canSubmit ? "pointer" : "not-allowed",
            background: canSubmit ? "#1A1A1A" : "#E8E8E4",
            color: canSubmit ? "#fff" : "var(--text-secondary)",
            boxShadow: canSubmit ? "0 4px 16px rgba(0,0,0,0.15)" : "none",
          }}
        >
          Submit All ({totalEntered})
        </button>
      </div>
    </div>
  );
}
