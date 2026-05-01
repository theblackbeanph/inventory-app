"use client";
import { CATALOG } from "@/lib/items";
import type { BranchStock } from "@/lib/types";
import { formatDate } from "../_lib/helpers";

export function DeliveryReviewSheet({ items, stocks, deliveryCounts, deliveryDate, onRecount, onConfirm, onClose, loading }: {
  items: typeof CATALOG;
  stocks: Record<string, BranchStock>;
  deliveryCounts: Record<string, string>;
  deliveryDate: string;
  onRecount: (item: string) => void;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  loading: boolean;
}) {
  const entered = items.filter(i => deliveryCounts[i.name] !== undefined && deliveryCounts[i.name] !== "");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "#fff", overflowY: "auto" }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Delivery Review</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
            {formatDate(deliveryDate)} · {entered.length} item{entered.length !== 1 ? "s" : ""} received
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: "var(--text-secondary)", cursor: "pointer", padding: "2px 6px" }}>✕</button>
      </div>

      {/* Item list */}
      <div>
        {entered.map(item => {
          const qty = Number(deliveryCounts[item.name]);
          const currentStock = stocks[item.name]?.qty ?? 0;
          const newStock = currentStock + qty;
          return (
            <div key={item.name} style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{item.packSize}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#1D4ED8" }}>{qty >= 0 ? `+${qty}` : String(qty)}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>→ {newStock}</div>
                </div>
                <button
                  onClick={() => onRecount(item.name)}
                  style={{ padding: "5px 10px", borderRadius: 8, border: "1.5px solid var(--border)", background: "#fff", color: "var(--text-secondary)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  Recount
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom buttons */}
      <div style={{ position: "sticky", bottom: 0, background: "#fff", borderTop: "1px solid var(--border)", padding: "12px 16px 32px", display: "flex", gap: 8 }}>
        <button
          onClick={onClose}
          style={{ flex: 1, padding: "14px 0", borderRadius: 14, border: "1.5px solid var(--border)", fontWeight: 700, fontSize: 14, background: "#fff", color: "var(--text)", cursor: "pointer" }}
        >
          Continue
        </button>
        <button
          onClick={onConfirm}
          disabled={loading || entered.length === 0}
          style={{
            flex: 1, padding: "14px 0", borderRadius: 14, border: "none", fontWeight: 700, fontSize: 14,
            background: loading || entered.length === 0 ? "#E8E8E4" : "#1A1A1A",
            color: loading || entered.length === 0 ? "var(--text-secondary)" : "#fff",
            cursor: loading || entered.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Submitting..." : "Submit"}
        </button>
      </div>
    </div>
  );
}
