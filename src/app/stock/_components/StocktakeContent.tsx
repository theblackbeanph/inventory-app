"use client";
import { useState } from "react";
import { CATALOG, LOCATIONS } from "@/lib/items";
import type { DailyMetrics, FilterTab } from "../_lib/helpers";
import { businessDatePHT, addDays } from "../_lib/helpers";

export function StocktakeContent({ items, metrics, endCounts, currentFilter, stocktakeDate, onDateChange, onCountChange, onSaveLocation, onOpenReview }: {
  items: typeof CATALOG;
  metrics: Record<string, DailyMetrics>;
  endCounts: Record<string, string>;
  currentFilter: FilterTab;
  stocktakeDate: string;
  onDateChange: (date: string) => void;
  onCountChange: (item: string, val: string) => void;
  onSaveLocation: (location: string) => Promise<void>;
  onOpenReview: () => void;
}) {
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const today = businessDatePHT();
  const yesterday = addDays(today, -1);
  const dateOptions = [
    { date: yesterday, label: "Yesterday" },
    { date: today,     label: "Today"     },
  ];

  const totalEntered = Object.values(endCounts).filter(v => v !== "").length;
  const activeLocation = currentFilter !== "all" ? LOCATIONS.find(l => l.id === currentFilter) ?? null : null;
  const canSave = activeLocation !== null && items.some(i => i.location === activeLocation.id && endCounts[i.name] !== undefined && endCounts[i.name] !== "");

  function handleDatePillClick(newDate: string) {
    if (newDate === stocktakeDate) return;
    if (Object.values(endCounts).some(v => v !== "")) {
      setPendingDate(newDate);
      setShowWarning(true);
    } else {
      onDateChange(newDate);
    }
  }

  async function handleSave() {
    if (!activeLocation) return;
    setSaveStatus("saving");
    await onSaveLocation(activeLocation.id);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }

  function confirmSwitch() {
    if (pendingDate) onDateChange(pendingDate);
    setPendingDate(null);
    setShowWarning(false);
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Date picker */}
      <div style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "8px 16px", display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Date:</span>
        <div style={{ display: "flex", gap: 4 }}>
          {dateOptions.map(({ date, label }) => {
            const isSelected = date === stocktakeDate;
            return (
              <button key={date} onClick={() => handleDatePillClick(date)} style={{
                padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                background: isSelected ? "#1A1A1A" : "#F3F4F6",
                color: isSelected ? "#fff" : "var(--text-secondary)",
                border: `1.5px solid ${isSelected ? "#1A1A1A" : "var(--border)"}`,
                cursor: "pointer",
              }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pending stocktake banner */}
      {totalEntered > 0 ? (
        <button onClick={onOpenReview} style={{
          width: "100%", background: "#FFF7ED", borderBottom: "1px solid #FED7AA",
          borderTop: "none", borderLeft: "none", borderRight: "none",
          padding: "10px 16px", display: "flex", justifyContent: "space-between",
          alignItems: "center", cursor: "pointer", textAlign: "left" as const,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#92400E" }}>Pending Stocktake</div>
            <div style={{ fontSize: 11, color: "#B45309", marginTop: 2 }}>
              {totalEntered} of {items.length} items counted · tap to review
            </div>
          </div>
          <span style={{ fontSize: 16, color: "#B45309" }}>›</span>
        </button>
      ) : (
        <div style={{ background: "#F9FAFB", borderBottom: "1px solid var(--border)", padding: "10px 16px" }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>No stocktake started</div>
        </div>
      )}

      {/* Item list */}
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

      {/* Bottom bar */}
      <div style={{ position: "fixed", bottom: "calc(var(--nav-h) + 12px)", left: 0, right: 0, padding: "0 16px", zIndex: 30, display: "flex", gap: 8 }}>
        {activeLocation !== null && (
          <button
            onClick={handleSave}
            disabled={!canSave || saveStatus === "saving"}
            style={{
              flex: 1, padding: "15px 0", borderRadius: 14,
              border: `1.5px solid ${saveStatus === "saved" ? "#16A34A" : "var(--border)"}`,
              fontWeight: 700, fontSize: 14,
              cursor: canSave && saveStatus !== "saving" ? "pointer" : "not-allowed",
              background: saveStatus === "saved" ? "#F0FDF4" : "#fff",
              color: saveStatus === "saved" ? "#16A34A" : canSave ? "var(--text)" : "var(--text-secondary)",
              transition: "background 0.2s, border-color 0.2s, color 0.2s",
            }}
          >
            {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : "Save"}
          </button>
        )}
        <button
          onClick={onOpenReview}
          disabled={totalEntered === 0}
          style={{
            flex: 2, padding: "15px 0", borderRadius: 14, border: "none",
            fontWeight: 700, fontSize: 16, cursor: totalEntered > 0 ? "pointer" : "not-allowed",
            background: totalEntered > 0 ? "#1A1A1A" : "#E8E8E4",
            color: totalEntered > 0 ? "#fff" : "var(--text-secondary)",
            boxShadow: totalEntered > 0 ? "0 4px 16px rgba(0,0,0,0.15)" : "none",
          }}
        >
          Submit ({totalEntered})
        </button>
      </div>

      {/* Date-change warning sheet */}
      {showWarning && pendingDate && (
        <>
          <div onClick={() => setShowWarning(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50 }} />
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderRadius: "16px 16px 0 0", padding: "20px 16px 32px", zIndex: 51, boxShadow: "0 -4px 20px rgba(0,0,0,0.12)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
              Change date to {pendingDate === today ? "today" : "yesterday"}?
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>
              You have{" "}
              <strong style={{ color: "var(--text)" }}>{totalEntered} unsaved count{totalEntered !== 1 ? "s" : ""}</strong>
              {" "}for {stocktakeDate === today ? "today" : "yesterday"}. Switching dates will clear them.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowWarning(false)}
                style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "1.5px solid var(--border)", fontWeight: 600, fontSize: 13, background: "#fff", color: "var(--text-secondary)", cursor: "pointer" }}
              >
                Keep {stocktakeDate === today ? "today" : "yesterday"}
              </button>
              <button
                onClick={confirmSwitch}
                style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "none", fontWeight: 700, fontSize: 13, background: "#DC2626", color: "#fff", cursor: "pointer" }}
              >
                Clear &amp; Switch
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
