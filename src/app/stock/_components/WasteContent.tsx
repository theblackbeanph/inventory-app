"use client";
import { useState } from "react";
import { CATALOG } from "@/lib/items";
import type { StockAdjustment } from "@/lib/types";
import { WASTE_REASONS, type WasteReason } from "./WasteEntrySheet";

type CatalogItem = typeof CATALOG[number];

interface WasteEntry { item: string; qty: number; reason: WasteReason; }

interface WasteContentProps {
  items: CatalogItem[];
  todayWaste: StockAdjustment[];
  wasteHistory: StockAdjustment[];
  onSubmit: (entries: WasteEntry[]) => Promise<void>;
  onExport: () => Promise<void>;
  today: string;
  loading: boolean;
}

export function WasteContent({ items, todayWaste, wasteHistory, onSubmit, onExport, today, loading }: WasteContentProps) {
  const [subTab, setSubTab] = useState<"log" | "history">("log");
  const [view, setView] = useState<"select" | "review">("select");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [reasons, setReasons] = useState<Map<string, WasteReason>>(new Map());
  const [exporting, setExporting] = useState(false);

  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const selectedCount = selected.size;
  const allHaveReasons = selectedCount > 0 && [...selected.keys()].every(k => reasons.has(k));

  function toggleItem(name: string) {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(name)) { next.delete(name); setReasons(r => { const rn = new Map(r); rn.delete(name); return rn; }); }
      else next.set(name, 1);
      return next;
    });
  }

  function changeQty(name: string, delta: number) {
    setSelected(prev => {
      const next = new Map(prev);
      const cur = next.get(name) ?? 1;
      next.set(name, Math.max(1, cur + delta));
      return next;
    });
  }

  function setReason(item: string, reason: WasteReason) {
    setReasons(prev => new Map(prev).set(item, reason));
  }

  async function handleSubmit() {
    if (!allHaveReasons || loading) return;
    const entries: WasteEntry[] = [...selected.entries()].map(([item, qty]) => ({
      item, qty, reason: reasons.get(item)!,
    }));
    await onSubmit(entries);
    setSelected(new Map());
    setReasons(new Map());
    setView("select");
    setSubTab("history");
  }

  function goToLog() { setSubTab("log"); setView("select"); setSearch(""); }

  // ── History grouped by date ───────────────────────────────────────────────
  const grouped = new Map<string, StockAdjustment[]>();
  for (const adj of wasteHistory) {
    if (!grouped.has(adj.date)) grouped.set(adj.date, []);
    grouped.get(adj.date)!.push(adj);
  }
  const sortedDates = [...grouped.keys()].sort((a, b) => b.localeCompare(a));

  const tdStyle: React.CSSProperties = { padding: "0 8px", textAlign: "center", fontSize: 14, fontWeight: 600 };

  // ── Shared tab bar ────────────────────────────────────────────────────────
  const tabBar = (
    <div role="tablist" style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "#fff" }}>
      {(["log", "history"] as const).map(t => (
        <button
          key={t}
          role="tab"
          aria-selected={subTab === t}
          onClick={() => { setSubTab(t); if (t === "log") setView("select"); }}
          style={{
            padding: "10px 20px", fontSize: 13, fontWeight: 600, border: "none",
            background: "transparent", cursor: "pointer",
            color: subTab === t ? "#1A1A1A" : "var(--text-secondary)",
            borderBottom: subTab === t ? "2px solid #1A1A1A" : "2px solid transparent",
          }}
        >
          {t === "log" ? "Log Waste" : "History"}
        </button>
      ))}
    </div>
  );

  // ── History view ──────────────────────────────────────────────────────────
  if (subTab === "history") {
    return (
      <div>
        {tabBar}
        <div style={{ padding: "12px 16px" }}>
          {sortedDates.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-secondary)", fontSize: 14 }}>
              Nothing logged yet
            </div>
          ) : sortedDates.map(date => {
            const adjs = grouped.get(date)!;
            const label = date === today ? `Today · ${date}` : date;
            return (
              <div key={date} data-testid={`history-group-${date}`} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
                    {adjs.length} {adjs.length === 1 ? "item" : "items"} · logged by {adjs[0].loggedBy}
                  </span>
                </div>
                <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflow: "hidden" }}>
                  {adjs.map((adj, i) => (
                    <div key={adj.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{adj.item}</div>
                        {adj.note && (
                          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", marginTop: 3, display: "inline-block" }}>
                            {adj.note}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#DC2626" }}>−{adj.qty}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <button
            onClick={async () => { setExporting(true); try { await onExport(); } finally { setExporting(false); } }}
            disabled={exporting}
            style={{ width: "100%", height: 44, borderRadius: 14, border: "1.5px solid #D1D5DB", background: "#fff", color: exporting ? "var(--text-secondary)" : "#1A1A1A", fontSize: 14, fontWeight: 600, cursor: exporting ? "not-allowed" : "pointer", marginTop: 8 }}
          >
            {exporting ? "Exporting…" : "Export Waste (90 days)"}
          </button>
          <button
            onClick={goToLog}
            style={{ width: "100%", height: 52, borderRadius: 14, border: "none", background: "#1A1A1A", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 8 }}
          >
            + Log Waste
          </button>
        </div>
      </div>
    );
  }

  // ── Review screen ─────────────────────────────────────────────────────────
  if (view === "review") {
    const entries = [...selected.entries()];
    return (
      <div>
        {tabBar}
        <div style={{ padding: "14px 16px 12px", display: "flex", alignItems: "center", gap: 10 }}>
          <button
            aria-label="Back"
            onClick={() => setView("select")}
            style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text)", lineHeight: 1 }}
          >
            ←
          </button>
          <span style={{ fontSize: 17, fontWeight: 700 }}>Review Waste · {selectedCount} {selectedCount === 1 ? "item" : "items"}</span>
        </div>
        <div style={{ padding: "0 16px" }}>
          {entries.map(([item, qty]) => (
            <div key={item} style={{ background: "#fff", borderRadius: 14, padding: 14, marginBottom: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{item}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                    {items.find(i => i.name === item)?.packSize}
                  </div>
                </div>
                <span data-testid={`review-qty-${item}`} style={{ fontSize: 13, fontWeight: 700, color: "#DC2626", background: "#FEF2F2", padding: "3px 10px", borderRadius: 20 }}>
                  −{qty} {qty === 1 ? "pc" : "pcs"}
                </span>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: reasons.has(item) ? "var(--text-secondary)" : "#FBBF24", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7 }}>
                Reason {reasons.has(item) ? "" : "* — required"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {WASTE_REASONS.map(r => {
                  const sel = reasons.get(item) === r;
                  return (
                    <button
                      key={r}
                      data-testid={`reason-${item}-${r}`}
                      onClick={() => setReason(item, r)}
                      style={{
                        padding: "5px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                        border: "1.5px solid", cursor: "pointer",
                        borderColor: sel ? "#DC2626" : "var(--border)",
                        background: sel ? "#FEF2F2" : "#fff",
                        color: sel ? "#DC2626" : "var(--text-secondary)",
                      }}
                    >{r}</button>
                  );
                })}
              </div>
            </div>
          ))}
          <button
            onClick={handleSubmit}
            disabled={!allHaveReasons || loading}
            style={{
              width: "100%", height: 52, borderRadius: 14, border: "none",
              background: allHaveReasons && !loading ? "#DC2626" : "#E5E7EB",
              color: allHaveReasons && !loading ? "#fff" : "var(--text-secondary)",
              fontSize: 16, fontWeight: 700, cursor: allHaveReasons && !loading ? "pointer" : "not-allowed",
              marginBottom: 20,
            }}
          >
            Submit Waste
          </button>
        </div>
      </div>
    );
  }

  // ── Select screen (default) ───────────────────────────────────────────────
  return (
    <div>
      {tabBar}
      <div style={{ padding: "12px 16px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#EFEFEF", borderRadius: 12, padding: "10px 14px" }}>
          <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>🔍</span>
          <input
            placeholder="Search items..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, border: "none", background: "transparent", fontSize: 14, color: "var(--text)", outline: "none" }}
          />
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>
        {filtered.map(item => {
          const isChecked = selected.has(item.name);
          const qty = selected.get(item.name) ?? 1;
          const todayCount = todayWaste.filter(a => a.item === item.name).reduce((s, a) => s + a.qty, 0);
          return (
            <div
              key={item.name}
              data-testid={`item-row-${item.name}`}
              onClick={() => toggleItem(item.name)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                background: "#fff", borderRadius: 14, padding: "13px 14px", marginBottom: 8,
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)", cursor: "pointer",
                outline: isChecked ? "2px solid #1A1A1A" : "none",
              }}
            >
              <div style={{
                width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                background: isChecked ? "#1A1A1A" : "#fff",
                border: isChecked ? "none" : "2px solid #D1D5DB",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {isChecked && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{item.packSize}</span>
                  {todayCount > 0 && (
                    <span data-testid={`logged-today-${item.name}`} style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA", padding: "1px 6px", borderRadius: 20 }}>
                      {todayCount} logged today
                    </span>
                  )}
                </div>
              </div>
              {isChecked && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={e => e.stopPropagation()}>
                  <button
                    data-testid={`dec-${item.name}`}
                    onClick={() => changeQty(item.name, -1)}
                    style={{ width: 30, height: 30, borderRadius: 8, border: "1.5px solid var(--border)", background: "#F9F9F9", fontSize: 16, fontWeight: 600, cursor: "pointer" }}
                  >−</button>
                  <span data-testid={`qty-${item.name}`} style={{ fontSize: 16, fontWeight: 700, minWidth: 20, textAlign: "center" }}>{qty}</span>
                  <button
                    data-testid={`inc-${item.name}`}
                    onClick={() => changeQty(item.name, 1)}
                    style={{ width: 30, height: 30, borderRadius: 8, border: "1.5px solid var(--border)", background: "#F9F9F9", fontSize: 16, fontWeight: 600, cursor: "pointer" }}
                  >+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: "12px 16px 20px" }}>
        <button
          onClick={() => setView("review")}
          disabled={selectedCount === 0}
          style={{
            width: "100%", height: 52, borderRadius: 14, border: "none",
            background: selectedCount > 0 ? "#1A1A1A" : "#E5E7EB",
            color: selectedCount > 0 ? "#fff" : "var(--text-secondary)",
            fontSize: 16, fontWeight: 700, cursor: selectedCount > 0 ? "pointer" : "not-allowed",
          }}
        >
          Review Waste{selectedCount > 0 ? ` · ${selectedCount} ${selectedCount === 1 ? "item" : "items"}` : ""}
        </button>
      </div>
    </div>
  );
}
