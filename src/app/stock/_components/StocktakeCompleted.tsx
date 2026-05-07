"use client";
import { useState } from "react";
import type { DailyClose } from "@/lib/types";

interface Props {
  dayClose: DailyClose;
  role?: string | null;
  onCorrect?: (item: string, newQty: number) => Promise<void>;
  missingItems?: string[];
  onAddMissing?: (item: string, qty: number) => Promise<void>;
}

export function StocktakeCompleted({ dayClose, role, onCorrect, missingItems = [], onAddMissing }: Props) {
  const rows = Object.entries(dayClose.items).sort(([a], [b]) => a.localeCompare(b));
  const closedTime = new Date(dayClose.closedAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true });

  const [selected, setSelected] = useState<string | null>(null);
  const [newCount, setNewCount] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAddMissing, setShowAddMissing] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addSelected, setAddSelected] = useState<string | null>(null);
  const [addQty, setAddQty] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const canEdit = role === "superadmin" || role === "admin";

  function openCorrection(item: string, currentCount: number) {
    setSelected(item);
    setNewCount(String(currentCount));
  }

  function closeSheet() {
    setSelected(null);
    setNewCount("");
  }

  function openAddMissing() {
    setShowAddMissing(true);
    setAddSearch("");
    setAddSelected(null);
    setAddQty("");
  }

  function closeAddMissing() {
    setShowAddMissing(false);
    setAddSearch("");
    setAddSelected(null);
    setAddQty("");
  }

  async function handleAddMissingSave() {
    if (!addSelected || !onAddMissing) return;
    const qty = Number(addQty);
    if (addQty.trim() === "" || isNaN(qty) || qty < 0) return;
    setAddSaving(true);
    setAddError(null);
    try {
      await onAddMissing(addSelected, qty);
      closeAddMissing();
    } catch (err) {
      console.error("[AddMissingStocktake] save failed:", err);
      setAddError(err instanceof Error ? err.message : "Save failed. Please try again.");
    } finally {
      setAddSaving(false);
    }
  }

  const filteredMissing = missingItems.filter(item =>
    item.toLowerCase().includes(addSearch.toLowerCase())
  );

  async function handleSave() {
    if (!selected || !onCorrect) return;
    const qty = Number(newCount);
    if (isNaN(qty) || qty < 0 || newCount.trim() === "") return;
    setSaving(true);
    try {
      await onCorrect(selected, qty);
      closeSheet();
    } finally {
      setSaving(false);
    }
  }

  const selectedItem = selected ? dayClose.items[selected] : null;

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ margin: "12px 16px", background: "#F0FDF4", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#15803D" }}>Count Confirmed ✓</div>
        <div style={{ fontSize: 12, color: "#16A34A", marginTop: 2 }}>
          {dayClose.countType === "manual" ? `${dayClose.closedBy} · ${closedTime}` : "Auto-closed by system"}
        </div>
      </div>

      <div>
        {rows.map(([item, data]) => {
          const varColor = data.variance === 0 ? "#16A34A" : data.variance > 0 ? "#D97706" : "#DC2626";
          return (
            <div
              key={item}
              onClick={canEdit ? () => openCorrection(item, data.endCount) : undefined}
              style={{
                background: "#fff",
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid var(--border)",
                cursor: canEdit ? "pointer" : "default",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Expected: {data.expected} · BEG: {data.beginning}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{data.endCount}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: varColor }}>
                  {data.variance > 0 ? `+${data.variance}` : data.variance === 0 ? "✓" : String(data.variance)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {canEdit && missingItems.length > 0 && (
        <div style={{ padding: "12px 16px" }}>
          <button
            onClick={openAddMissing}
            style={{
              width: "100%", padding: "12px 0", borderRadius: 12,
              border: "1.5px dashed #16A34A", background: "#F0FDF4",
              color: "#15803D", fontWeight: 600, fontSize: 14, cursor: "pointer",
            }}
          >
            + Add missed item
          </button>
        </div>
      )}

      {canEdit && (
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "var(--text-secondary)" }}>
          Tap any item to correct its count
        </div>
      )}

      {/* Correction sheet */}
      {selected && selectedItem && (
        <>
          <div onClick={closeSheet} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }} />
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70, background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)" }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Correct count</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>{selected}</div>

            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, background: "var(--bg)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>Current count</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{selectedItem.endCount}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>New count</div>
                <input
                  type="number"
                  inputMode="decimal"
                  value={newCount}
                  onChange={e => setNewCount(e.target.value)}
                  autoFocus
                  style={{
                    width: "100%",
                    fontSize: 22,
                    fontWeight: 700,
                    border: "2px solid #1A1A1A",
                    borderRadius: 10,
                    padding: "10px 14px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={closeSheet}
                style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1.5px solid var(--border)", background: "#fff", color: "var(--text-secondary)", fontWeight: 600, fontSize: 15, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || newCount.trim() === "" || Number(newCount) < 0}
                style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "none", background: saving ? "#ccc" : "#1A1A1A", color: "#fff", fontWeight: 700, fontSize: 15, cursor: saving ? "default" : "pointer" }}
              >
                {saving ? "Saving…" : "Save Correction"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Add-missing sheet */}
      {showAddMissing && (
        <>
          <div onClick={closeAddMissing} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }} />
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70, background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)", maxHeight: "80dvh", display: "flex", flexDirection: "column" }}>
            {addSelected === null ? (
              <>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Add missed item</div>
                <input
                  type="text"
                  placeholder="Search items…"
                  value={addSearch}
                  onChange={e => setAddSearch(e.target.value)}
                  autoFocus
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--border)", fontSize: 14, marginBottom: 12, boxSizing: "border-box", outline: "none" }}
                />
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {filteredMissing.length === 0 ? (
                    <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13, padding: "24px 0" }}>No items found</div>
                  ) : (
                    filteredMissing.map(item => (
                      <div
                        key={item}
                        onClick={() => { setAddSelected(item); setAddQty(""); }}
                        style={{ padding: "14px 4px", borderBottom: "1px solid var(--border)", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
                      >
                        {item}
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setAddSelected(null); setAddQty(""); }}
                  style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 8 }}
                >
                  ← Back
                </button>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Add missed item</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>{addSelected}</div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>Count</div>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={addQty}
                    onChange={e => setAddQty(e.target.value)}
                    autoFocus
                    style={{ width: "100%", fontSize: 22, fontWeight: 700, border: "2px solid #1A1A1A", borderRadius: 10, padding: "10px 14px", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                {addError && (
                  <div style={{ color: "#DC2626", fontSize: 12, marginBottom: 8, textAlign: "center" }}>{addError}</div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={closeAddMissing}
                    style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1.5px solid var(--border)", background: "#fff", color: "var(--text-secondary)", fontWeight: 600, fontSize: 15, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddMissingSave}
                    disabled={addSaving || addQty.trim() === "" || Number(addQty) < 0}
                    style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "none", background: addSaving ? "#ccc" : "#15803D", color: "#fff", fontWeight: 700, fontSize: 15, cursor: addSaving ? "default" : "pointer" }}
                  >
                    {addSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
