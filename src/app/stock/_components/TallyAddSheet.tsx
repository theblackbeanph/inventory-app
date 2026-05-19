"use client";
import { useState } from "react";

interface TallyAddSheetProps {
  itemName: string;
  packSize: string;
  currentCount: number;
  onAdd: (qty: number) => void;
  onClose: () => void;
}

export function TallyAddSheet({ itemName, packSize, currentCount, onAdd, onClose }: TallyAddSheetProps) {
  const [input, setInput] = useState("");

  const addedQty = parseInt(input, 10);
  const isValid = !isNaN(addedQty) && addedQty > 0;
  const newTotal = isValid ? currentCount + addedQty : null;

  function handleConfirm() {
    if (!isValid) return;
    onAdd(addedQty);
  }

  return (
    <>
      <div
        data-testid="tally-backdrop"
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50 }}
      />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "#fff", borderRadius: "16px 16px 0 0",
        padding: "20px 16px 32px", zIndex: 51,
        boxShadow: "0 -4px 20px rgba(0,0,0,0.12)",
      }}>
        <div style={{ width: 36, height: 4, background: "#E5E7EB", borderRadius: 2, margin: "0 auto 16px" }} />

        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
          Add qty found
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 14 }}>
          {itemName}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600, minWidth: 28 }}>
            {packSize}
          </span>
          <input
            type="number"
            inputMode="numeric"
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="0"
            style={{
              flex: 1, height: 52, border: "1.5px solid #1A1A1A",
              borderRadius: 12, fontSize: 26, fontWeight: 700,
              textAlign: "right", paddingRight: 14,
              color: "var(--text)", background: "#F9F9F9", outline: "none",
            }}
          />
        </div>

        <div style={{
          fontSize: 13, color: "var(--text-secondary)", marginBottom: 16,
          background: "#F9FAFB", borderRadius: 8, padding: "8px 12px",
          display: "flex", justifyContent: "space-between",
        }}>
          <span>Running total</span>
          <span style={{ fontWeight: 700, color: "var(--text)" }}>
            {newTotal !== null ? `${currentCount} → ${newTotal}` : `${currentCount}`}
          </span>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, height: 44, borderRadius: 12,
              border: "1.5px solid var(--border)", fontWeight: 700, fontSize: 15,
              background: "#fff", color: "var(--text)", cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            style={{
              flex: 2, height: 44, borderRadius: 12, border: "none",
              fontWeight: 700, fontSize: 15,
              background: isValid ? "#16A34A" : "#E5E7EB",
              color: isValid ? "#fff" : "var(--text-secondary)",
              cursor: isValid ? "pointer" : "not-allowed",
              boxShadow: isValid ? "0 2px 8px rgba(22,163,74,0.25)" : "none",
            }}
          >
            {isValid ? `+ Add ${addedQty}` : "Add"}
          </button>
        </div>
      </div>
    </>
  );
}
