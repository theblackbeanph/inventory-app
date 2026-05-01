"use client";
import { CATALOG } from "@/lib/items";
import type { DailyMetrics } from "../_lib/helpers";

export function StocktakeReviewSheet({ items, metrics, endCounts, stocktakeDate, onRecount, onConfirm, onClose, loading }: {
  items: typeof CATALOG;
  metrics: Record<string, DailyMetrics>;
  endCounts: Record<string, string>;
  stocktakeDate: string;
  onRecount: (item: string) => void;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  loading: boolean;
}) {
  const rows = items
    .filter(item => endCounts[item.name] !== undefined && endCounts[item.name] !== "")
    .map(item => {
      const m = metrics[item.name];
      const expected = m.beginning !== null ? m.beginning + m.inQty - m.outQty : null;
      const count = Number(endCounts[item.name]);
      const variance = expected !== null ? count - expected : null;
      return { item, expected, count, variance };
    });

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "#fff", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Stocktake Review</div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-secondary)", padding: 4 }}>✕</button>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
            {stocktakeDate} · {rows.length} item{rows.length !== 1 ? "s" : ""} counted
          </div>
        </div>

        <div style={{ flex: 1, padding: "0 0 100px" }}>
          {rows.map(({ item, expected, count, variance }) => {
            const isBig = variance !== null && Math.abs(variance) > 1;
            return (
              <div key={item.name} style={{
                padding: "12px 16px", borderBottom: "1px solid var(--border)",
                background: isBig ? "#FFF7ED" : "#fff",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      {item.packSize} · Expected: {expected ?? "—"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{count}</div>
                      {variance !== null && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: variance === 0 ? "#16A34A" : variance > 0 ? "#D97706" : "#DC2626" }}>
                          {variance > 0 ? `+${variance}` : variance === 0 ? "✓" : String(variance)}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => onRecount(item.name)}
                      style={{ padding: "5px 10px", borderRadius: 8, border: "1.5px solid var(--border)", background: "#fff", color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    >
                      Recount
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "40px 16px", fontSize: 14 }}>No items counted yet.</div>
          )}
        </div>

        <div style={{ position: "sticky", bottom: 0, padding: "12px 16px 32px", background: "#fff", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: "15px 0", borderRadius: 14,
              border: "1.5px solid var(--border)", fontWeight: 700, fontSize: 14,
              cursor: "pointer", background: "#fff", color: "var(--text)",
            }}
          >
            Continue Stocktake
          </button>
          <button
            disabled={loading || rows.length === 0}
            onClick={onConfirm}
            style={{
              flex: 1, padding: "15px 0", borderRadius: 14, border: "none",
              fontWeight: 700, fontSize: 16, cursor: rows.length > 0 && !loading ? "pointer" : "not-allowed",
              background: rows.length > 0 ? "#1A1A1A" : "#E8E8E4",
              color: rows.length > 0 ? "#fff" : "var(--text-secondary)",
            }}
          >
            {loading ? "Saving…" : "Submit"}
          </button>
        </div>
      </div>
    </>
  );
}
