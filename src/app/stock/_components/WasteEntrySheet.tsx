"use client";
import { useState } from "react";

export const WASTE_REASONS = [
  "Spoilage",
  "Quality Issue - Kitchen",
  "Quality Issue - Commissary",
  "Quality Check",
  "Pull Out",
  "Others",
] as const;

export type WasteReason = typeof WASTE_REASONS[number];

interface WasteEntrySheetProps {
  itemName: string;
  packSize: string;
  alreadyLoggedToday: number;
  onLog: (qty: number, reason: WasteReason) => void;
  onClose: () => void;
}

export function WasteEntrySheet({ itemName, packSize, alreadyLoggedToday, onLog, onClose }: WasteEntrySheetProps) {
  const [input, setInput] = useState("");
  const [reason, setReason] = useState<WasteReason | null>(null);

  const qty = parseInt(input, 10);
  const isValid = !isNaN(qty) && qty > 0 && reason !== null;

  function handleConfirm() {
    if (!isValid || !reason) return;
    onLog(qty, reason);
  }

  return (
    <>
      <div
        data-testid="waste-backdrop"
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
          Log waste
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: alreadyLoggedToday > 0 ? 6 : 14 }}>
          {itemName}
        </div>

        {alreadyLoggedToday > 0 && (
          <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600, marginBottom: 14 }}>
            Already logged today: {alreadyLoggedToday} {packSize}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
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

        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          Reason
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {WASTE_REASONS.map(r => {
            const selected = reason === r;
            return (
              <button
                key={r}
                onClick={() => setReason(r)}
                style={{
                  padding: "7px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", border: "1.5px solid",
                  borderColor: selected ? "#DC2626" : "var(--border)",
                  background: selected ? "#FEF2F2" : "#fff",
                  color: selected ? "#DC2626" : "var(--text-secondary)",
                }}
              >{r}</button>
            );
          })}
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
              background: isValid ? "#DC2626" : "#E5E7EB",
              color: isValid ? "#fff" : "var(--text-secondary)",
              cursor: isValid ? "pointer" : "not-allowed",
            }}
          >
            Log waste
          </button>
        </div>
      </div>
    </>
  );
}
