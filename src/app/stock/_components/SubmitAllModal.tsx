"use client";
import { LOCATIONS } from "@/lib/items";
import type { StocktakeDraft } from "@/lib/types";

export function SubmitAllModal({ drafts, totalCounted, onConfirm, onClose, loading }: {
  drafts: Record<string, StocktakeDraft>;
  totalCounted: number;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  loading: boolean;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", padding: "24px 20px 40px" }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Submit Stocktake</div>
        <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 20 }}>
          {totalCounted} items counted. This will lock today and set tomorrow's beginning stock.
        </div>
        <div style={{ marginBottom: 20 }}>
          {LOCATIONS.map(loc => {
            const draft = drafts[loc.id];
            return (
              <div key={loc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{loc.label}</span>
                {draft
                  ? <span style={{ fontSize: 12, color: "#15803D", fontWeight: 600 }}>Saved · {Object.keys(draft.counts).length} items</span>
                  : <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Not saved</span>
                }
              </div>
            );
          })}
        </div>
        <button
          onClick={onConfirm}
          disabled={loading}
          style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: "#1A1A1A", color: "#fff", fontWeight: 700, fontSize: 16, cursor: loading ? "wait" : "pointer", marginBottom: 10 }}
        >
          {loading ? "Submitting…" : "Submit"}
        </button>
        <button
          onClick={onClose}
          disabled={loading}
          style={{ width: "100%", padding: "13px 0", borderRadius: 14, border: "1.5px solid var(--border)", background: "#fff", color: "var(--text)", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
