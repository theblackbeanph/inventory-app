"use client";
import { useState, useEffect } from "react";
import { CATALOG_MAP } from "@/lib/items";
import type { DeliveryNote, ReceivedItem } from "@/lib/types";

// ── shared qty button style (duplicated from OrdersContent.tsx — cheap, clearer than cross-file dep) ──

const qtyBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", cursor: "pointer", fontSize: 18, fontWeight: 700,
  color: "#1A1A1A", display: "flex", alignItems: "center", justifyContent: "center",
};

// ── ReceiveEditorProps ────────────────────────────────────────────────────────

export type ReceiveEditorProps = {
  dn: DeliveryNote;
  initialReceivedQtys: Record<string, number>;
  showCheckUX: boolean;
  infoBanner?: React.ReactNode;
  submitLabel: (hasDiscrepancy: boolean) => string;
  submitColor?: (hasDiscrepancy: boolean) => string; // defaults to red/green
  reviewTitle?: string; // defaults to "Review & Confirm"
  reviewHeaderText: (hasDiscrepancy: boolean) => { headline: string };
  reviewFooterNote: (hasDiscrepancy: boolean) => string;
  onSubmit: (receivedItems: ReceivedItem[]) => Promise<{ error?: string } | void>;
  poRef: string; // for review overlay display
};

// ── ReceiveEditor ─────────────────────────────────────────────────────────────

export function ReceiveEditor(props: ReceiveEditorProps): React.ReactElement {
  const { dn, initialReceivedQtys, showCheckUX, infoBanner, submitLabel, submitColor, reviewTitle, reviewHeaderText, reviewFooterNote, onSubmit, poRef } = props;

  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>(initialReceivedQtys);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [showReview,   setShowReview]   = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");

  // re-sync on dn.id change (matches ActiveDetail's original behavior)
  useEffect(() => {
    setReceivedQtys(Object.fromEntries(dn.items.map(i => [i.item, i.dispatchedQty])));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dn.id]);

  function toggleChecked(itemName: string) {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemName)) next.delete(itemName); else next.add(itemName);
      return next;
    });
  }

  const hasDiscrepancy = dn.items.some(i => (receivedQtys[i.item] ?? i.dispatchedQty) !== i.dispatchedQty);
  const itemsWithDiscrepancy = dn.items.filter(i => (receivedQtys[i.item] ?? i.dispatchedQty) !== i.dispatchedQty);

  const primaryColor = submitColor
    ? submitColor(hasDiscrepancy)
    : hasDiscrepancy ? "#DC2626" : "#059669";

  async function handleSubmit() {
    setLoading(true);
    setError("");
    const receivedItems: ReceivedItem[] = dn.items.map(i => ({
      item:          i.item,
      dispatchedQty: i.dispatchedQty,
      receivedQty:   receivedQtys[i.item] ?? i.dispatchedQty,
      unit:          i.unit,
    }));
    const result = await onSubmit(receivedItems);
    if (result && "error" in result && result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    // parent has navigated away on success; no need to reset loading
  }

  return (
    <>
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {infoBanner && infoBanner}

        {showCheckUX && (
          <div style={{ background: "#FFF", borderRadius: 10, padding: "10px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, color: "#555", fontWeight: 500 }}>Items checked</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>
              {checkedItems.size} <span style={{ color: "#888", fontWeight: 400 }}>of {dn.items.length}</span>
            </div>
          </div>
        )}

        {dn.items.map(item => {
          const received   = receivedQtys[item.item] ?? item.dispatchedQty;
          const isDiff     = received !== item.dispatchedQty;
          const isChecked  = showCheckUX && checkedItems.has(item.item);
          const rowBg      = isChecked && isDiff ? "#FFF5F5" : isChecked ? "#F0FDF4" : "#FFF";
          const rowBorder  = isDiff ? "4px solid #DC2626" : isChecked ? "4px solid #059669" : "4px solid transparent";
          return (
            <div key={item.item} style={{ background: rowBg, borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", borderLeft: rowBorder }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {showCheckUX && (
                  <button
                    onClick={() => toggleChecked(item.item)}
                    aria-label={isChecked ? "Uncheck item" : "Check item"}
                    style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      border: `2px solid ${isChecked ? "#059669" : "#D1D5DB"}`,
                      background: isChecked ? "#059669" : "transparent",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      padding: 0, marginRight: 10,
                    }}
                  >
                    {isChecked && (
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={3}>
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{item.item}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    {CATALOG_MAP.get(item.item)?.packSize ?? "1 pc"}
                    {item.dispatchedQty < item.requestedQty ? (
                      <>
                        {" · "}
                        <span>Ordered: {item.requestedQty}</span>
                        {" "}
                        <span style={{ color: "#D97706", fontWeight: 600 }}>→ Dispatched: {item.dispatchedQty}</span>
                      </>
                    ) : (
                      <> · Dispatched: <strong>{item.dispatchedQty}</strong></>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: isChecked && !isDiff ? 0.45 : 1 }}>
                  <button
                    onClick={() => setReceivedQtys(p => ({ ...p, [item.item]: Math.max(0, (p[item.item] ?? item.dispatchedQty) - 1) }))}
                    style={qtyBtnStyle}
                  >−</button>
                  <input
                    type="number"
                    value={received}
                    onChange={e => setReceivedQtys(p => ({ ...p, [item.item]: Math.max(0, Number(e.target.value)) }))}
                    style={{ width: 56, textAlign: "center", border: `1.5px solid ${isDiff ? "#DC2626" : "var(--border)"}`, borderRadius: 8, padding: "6px 4px", fontSize: 16, fontWeight: 700, background: isDiff ? "#FEF2F2" : "var(--bg)", color: "var(--text)" }}
                  />
                  <button
                    onClick={() => setReceivedQtys(p => ({ ...p, [item.item]: (p[item.item] ?? item.dispatchedQty) + 1 }))}
                    style={qtyBtnStyle}
                  >+</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* sticky footer */}
      <div style={{ position: "fixed", bottom: "var(--nav-h)", left: 0, right: 0, background: "#FFF", borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
        {hasDiscrepancy && (
          <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600, marginBottom: 8 }}>
            {itemsWithDiscrepancy.length} item{itemsWithDiscrepancy.length > 1 ? "s" : ""} with discrepancy — commissary will be notified.
          </div>
        )}
        <button
          onClick={() => setShowReview(true)}
          disabled={loading}
          style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: primaryColor, color: "#FFF", fontWeight: 700, fontSize: 16, cursor: loading ? "not-allowed" : "pointer" }}
        >
          {submitLabel(hasDiscrepancy)}
        </button>
      </div>

      {/* review overlay */}
      {showReview && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "#FFF", overflowY: "auto", display: "flex", flexDirection: "column" }}>

          <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)", background: "#FFF", position: "sticky", top: 0, zIndex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{reviewTitle ?? "Review & Confirm"}</div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            <div style={{ background: "#FFF", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>

              <div style={{ background: primaryColor, padding: "14px 16px", color: "#FFF" }}>
                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 2 }}>{reviewHeaderText(hasDiscrepancy).headline}</div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{poRef}</div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                  {dn.dnRef} · {dn.items.length} item{dn.items.length !== 1 ? "s" : ""}
                  {hasDiscrepancy ? ` · ${itemsWithDiscrepancy.length} discrepancy` : ""}
                </div>
              </div>

              <div style={{ padding: "4px 0" }}>
                {dn.items.map((item, idx) => {
                  const receivedQty = receivedQtys[item.item] ?? item.dispatchedQty;
                  const isDisc      = receivedQty !== item.dispatchedQty;
                  return (
                    <div
                      key={item.item}
                      style={{
                        background:   isDisc ? "#FEF2F2" : "#FFF",
                        borderLeft:   isDisc ? "3px solid #DC2626" : "3px solid transparent",
                        padding:      "11px 16px",
                        borderBottom: idx < dn.items.length - 1 ? "1px solid #F3F3F0" : "none",
                        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{item.item}</div>
                        {isDisc && (
                          <div style={{ fontSize: 11, color: "#DC2626", fontWeight: 500, marginTop: 2 }}>
                            Expected {item.dispatchedQty} · received {receivedQty}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: isDisc ? "#DC2626" : "var(--text)" }}>
                          {receivedQty}{" "}
                          <span style={{ fontWeight: 400, fontSize: 12, color: isDisc ? "#DC2626" : "#888" }}>{item.unit}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ background: hasDiscrepancy ? "#FEF2F2" : "#F0FDF4", padding: "10px 16px", fontSize: 12, color: hasDiscrepancy ? "#DC2626" : "#059669", fontWeight: 500, borderTop: "1px solid var(--border)" }}>
                {reviewFooterNote(hasDiscrepancy)}
              </div>
            </div>

            <div style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", marginTop: 14 }}>
              Stock will be added to your inventory once submitted.
            </div>
          </div>

          <div style={{ padding: "12px 16px calc(var(--nav-h) + 12px)", background: "#FFF", borderTop: "1px solid var(--border)" }}>
            {error && (
              <div style={{ background: "#FEF2F2", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#DC2626", marginBottom: 8 }}>{error}</div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowReview(false)}
                style={{ flex: 1, padding: "15px 0", borderRadius: 14, border: "1.5px solid var(--border)", background: "#FFF", color: "var(--text)", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{ flex: 2, padding: "15px 0", borderRadius: 14, border: "none", background: primaryColor, color: "#FFF", fontWeight: 700, fontSize: 15, cursor: loading ? "not-allowed" : "pointer" }}
              >
                {loading ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
