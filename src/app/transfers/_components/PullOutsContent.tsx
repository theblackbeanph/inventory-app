"use client";
import { useEffect, useState, useMemo } from "react";
import { BRANCH_LABELS } from "@/lib/auth";
import { CATALOG_MAP } from "@/lib/items";
import { db, COLS, saveDocById } from "@/lib/firebase";
import { collection, onSnapshot, query, where, getDocs } from "@/lib/firebase";
import {
  PULLOUT_ITEMS, generatePoNumber, generateDnNumber,
} from "@/lib/pullout-config";
import type { Branch, PullOut, PullOutItem, PullOutStatus, DeliveryNote, StockAdjustment } from "@/lib/types";

type View = "list" | "detail" | "new";
type FilterTab = "all" | "pending" | "active" | "done";

const STATUS_LABEL: Record<PullOutStatus, string> = {
  PENDING_REVIEW: "Pending Review",
  CONFIRMED:      "Confirmed",
  PREPARING:      "Preparing",
  DISPATCHED:     "Dispatched",
  COMPLETED:      "Completed",
  CANCELLED:      "Cancelled",
};
const STATUS_COLOR: Record<PullOutStatus, { bg: string; text: string }> = {
  PENDING_REVIEW: { bg: "#FEF3C7", text: "#D97706" },
  CONFIRMED:      { bg: "#DBEAFE", text: "#2563EB" },
  PREPARING:      { bg: "#EDE9FE", text: "#7C3AED" },
  DISPATCHED:     { bg: "#E0E7FF", text: "#4338CA" },
  COMPLETED:      { bg: "#D1FAE5", text: "#059669" },
  CANCELLED:      { bg: "#F3F4F6", text: "#6B7280" },
};

function todayPHT(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function formatDay(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
}

export function PullOutsContent({ branch }: { branch: Branch }) {
  const [view, setView] = useState<View>("list");
  const [selected, setSelected] = useState<PullOut | null>(null);
  const [pullOuts, setPullOuts] = useState<PullOut[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");

  useEffect(() => {
    const q = query(collection(db, COLS.pullOuts), where("branch", "==", branch));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => d.data() as PullOut);
      list.sort((a, b) => a.delivery_day < b.delivery_day ? 1 : -1);
      setPullOuts(list);
    });
    return unsub;
  }, [branch]);

  const filtered = useMemo(() => pullOuts.filter(po => {
    if (filter === "pending") return po.status === "PENDING_REVIEW";
    if (filter === "active")  return ["CONFIRMED", "PREPARING", "DISPATCHED"].includes(po.status);
    if (filter === "done")    return ["COMPLETED", "CANCELLED"].includes(po.status);
    return true;
  }), [pullOuts, filter]);

  if (view === "new") return <NewManualPullOut branch={branch} onBack={() => setView("list")} />;
  if (view === "detail" && selected) {
    return (
      <PullOutDetail
        po={selected} branch={branch}
        onBack={() => { setSelected(null); setView("list"); }}
        onUpdated={updated => setSelected(updated)}
      />
    );
  }

  const pendingCount = pullOuts.filter(p => p.status === "PENDING_REVIEW").length;

  return (
    <div>
      {/* Sub-header */}
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid var(--border)", padding: "10px 16px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {pendingCount > 0 && (
              <div style={{ background: "#FEF3C7", color: "#D97706", borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>
                {pendingCount} pending
              </div>
            )}
          </div>
          <button
            onClick={() => setView("new")}
            style={{ background: "#1A1A1A", color: "#FFF", border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >+ Manual</button>
        </div>
        <div style={{ display: "flex", gap: 4, overflowX: "auto" }}>
          {(["all", "pending", "active", "done"] as FilterTab[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "8px 16px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", background: "transparent",
              color: filter === f ? "#1A1A1A" : "var(--text-secondary)",
              borderBottom: filter === f ? "2px solid #1A1A1A" : "2px solid transparent",
              textTransform: "capitalize",
            }}>{f}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "60px 0", fontSize: 15 }}>
            No pull-outs{filter !== "all" ? ` in "${filter}"` : ""}.
          </div>
        )}
        {filtered.map(po => {
          const sc = STATUS_COLOR[po.status];
          return (
            <div key={po.id} onClick={() => { setSelected(po); setView("detail"); }} style={{
              background: "#FFF", borderRadius: 14, padding: "14px 16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)", cursor: "pointer",
              borderLeft: `4px solid ${po.status === "PENDING_REVIEW" ? "#D97706" : po.status === "COMPLETED" ? "#059669" : po.status === "CANCELLED" ? "#D1D5DB" : "#2563EB"}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", background: po.type === "AUTO" ? "#DBEAFE" : "#FFEDD5", color: po.type === "AUTO" ? "#1D4ED8" : "#C2410C", borderRadius: 6, padding: "2px 7px" }}>{po.type}</span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{po.po_number}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "3px 10px", background: sc.bg, color: sc.text }}>{STATUS_LABEL[po.status]}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {formatDay(po.delivery_day)} · {po.items.length} items · {po.items.reduce((s, i) => s + (i.confirmed_qty || i.calculated_qty), 0)} packs
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PullOutDetail({ po, branch, onBack, onUpdated }: {
  po: PullOut; branch: Branch;
  onBack: () => void;
  onUpdated: (po: PullOut) => void;
}) {
  const [items, setItems] = useState<PullOutItem[]>(po.items.map(i => ({ ...i })));
  const [notes, setNotes] = useState(po.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [usageData, setUsageData] = useState<Record<string, { total: number; avg: number }>>({});
  const loggedBy = BRANCH_LABELS[branch];
  const isReview = po.status === "PENDING_REVIEW";
  const sc = STATUS_COLOR[po.status];

  useEffect(() => {
    const sevenDaysAgo = addDays(todayPHT(), -6);
    getDocs(query(
      collection(db, COLS.adjustments),
      where("branch", "==", branch),
      where("department", "==", "kitchen"),
      where("type", "==", "sales_import"),
    )).then(snap => {
      const map: Record<string, number> = {};
      snap.docs.forEach(d => {
        const adj = d.data() as StockAdjustment;
        if (adj.date < sevenDaysAgo) return;
        map[adj.item] = (map[adj.item] ?? 0) + adj.qty;
      });
      const result: Record<string, { total: number; avg: number }> = {};
      for (const [item, total] of Object.entries(map)) {
        result[item] = { total, avg: Math.round((total / 7) * 10) / 10 };
      }
      setUsageData(result);
    });
  }, [branch]);

  async function confirm() {
    setLoading(true);
    const now = todayPHT();
    const confirmedItems = items.map(i => ({ ...i }));
    const dnSnap = await getDocs(query(
      collection(db, COLS.deliveryNotes),
      where("branch", "==", branch),
      where("dn_number", ">=", `DN-${now.slice(2, 4)}-${now.slice(5, 7)}${now.slice(8, 10)}-${branch === "BF" ? "BF" : "MKT"}`),
    ));
    const seq = dnSnap.size + 1;
    const dnNumber = generateDnNumber(branch, po.delivery_day, seq);
    const dnId = String(Date.now());
    const dn: DeliveryNote = {
      id: dnId, dn_number: dnNumber, pull_out_id: po.id, po_number: po.po_number,
      branch, status: "PENDING",
      items: confirmedItems.map(i => ({ item_name: i.item_name, unit: i.unit, dispatched_qty: i.confirmed_qty })),
      has_discrepancy: false, commissary_notified: false,
    };
    const updatedPo: PullOut = {
      ...po, status: "CONFIRMED", items: confirmedItems, confirmed_at: now,
      confirmed_by: loggedBy, delivery_note_id: dnId, notes: notes || undefined,
    };
    await Promise.all([
      saveDocById(COLS.pullOuts, po.id, updatedPo as unknown as Record<string, unknown>),
      saveDocById(COLS.deliveryNotes, dnId, dn as unknown as Record<string, unknown>),
    ]);
    onUpdated(updatedPo);
    setLoading(false);
  }

  async function cancel() {
    setLoading(true);
    const updated: PullOut = { ...po, status: "CANCELLED" };
    await saveDocById(COLS.pullOuts, po.id, updated as unknown as Record<string, unknown>);
    onUpdated(updated);
    setLoading(false);
    onBack();
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 24px)" }}>
      <div style={{ background: "#FFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-secondary)", fontSize: 20, lineHeight: 1 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", background: po.type === "AUTO" ? "#DBEAFE" : "#FFEDD5", color: po.type === "AUTO" ? "#1D4ED8" : "#C2410C", borderRadius: 6, padding: "2px 7px" }}>{po.type}</span>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{po.po_number}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{formatDay(po.delivery_day)}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "4px 10px", background: sc.bg, color: sc.text }}>{STATUS_LABEL[po.status]}</span>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {po.delivery_note_id && (
          <div style={{ background: "#EFF6FF", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#1D4ED8" }}>
            Delivery note created — see Deliveries tab for receipt confirmation.
          </div>
        )}
        {items.map((item, idx) => (
          <div key={item.item_name} style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.item_name}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  {CATALOG_MAP.get(item.item_name)?.packSize ?? "1 pc"} · Baseline: {item.calculated_qty}
                </div>
                {usageData[item.item_name] && (
                  <div style={{ fontSize: 11, color: "#2563EB", marginTop: 2 }}>
                    Avg {usageData[item.item_name].avg}/day · {usageData[item.item_name].total} sold last 7 days
                  </div>
                )}
              </div>
              {isReview ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => setItems(prev => prev.map((it, i) => i === idx ? { ...it, confirmed_qty: Math.max(0, it.confirmed_qty - 1) } : it))} style={qtyBtnStyle}>−</button>
                  <input type="number" value={item.confirmed_qty}
                    onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, confirmed_qty: Math.max(0, Number(e.target.value)) } : it))}
                    style={{ width: 56, textAlign: "center", border: "1.5px solid var(--border)", borderRadius: 8, padding: "6px 4px", fontSize: 16, fontWeight: 700, background: "var(--bg)", color: "var(--text)" }}
                  />
                  <button onClick={() => setItems(prev => prev.map((it, i) => i === idx ? { ...it, confirmed_qty: it.confirmed_qty + 1 } : it))} style={qtyBtnStyle}>+</button>
                </div>
              ) : (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{item.confirmed_qty}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>pc</div>
                </div>
              )}
            </div>
          </div>
        ))}

        {isReview && (
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes for commissary (optional)" rows={2}
            style={{ width: "100%", border: "1.5px solid var(--border)", borderRadius: 10, padding: "10px 12px", fontSize: 14, resize: "none", outline: "none", background: "var(--bg)", color: "var(--text)", boxSizing: "border-box" }}
          />
        )}
        {!isReview && po.notes && (
          <div style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "var(--text-secondary)" }}>Note: {po.notes}</div>
        )}

        {isReview && (
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={cancel} disabled={loading} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1.5px solid var(--border)", background: "#FFF", color: "var(--text-secondary)", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>Cancel PO</button>
            <button onClick={confirm} disabled={loading} style={{ flex: 2, padding: "14px 0", borderRadius: 12, border: "none", background: "#1A1A1A", color: "#FFF", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              {loading ? "Saving…" : "Confirm Pull-Out"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function NewManualPullOut({ branch, onBack }: { branch: Branch; onBack: () => void }) {
  const [deliveryDay, setDeliveryDay] = useState(todayPHT());
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map());
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const availableItems = useMemo(() =>
    PULLOUT_ITEMS.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase())),
    [search]);

  function toggleItem(name: string) {
    setSelectedItems(prev => { const n = new Map(prev); if (n.has(name)) n.delete(name); else n.set(name, 1); return n; });
  }
  function setQty(name: string, qty: number) {
    if (qty <= 0) setSelectedItems(prev => { const n = new Map(prev); n.delete(name); return n; });
    else setSelectedItems(prev => new Map(prev).set(name, qty));
  }

  async function submit() {
    if (selectedItems.size === 0) return;
    setLoading(true);
    const now = Date.now();
    const snap = await getDocs(query(collection(db, COLS.pullOuts), where("branch", "==", branch), where("delivery_day", "==", deliveryDay)));
    const seq = snap.size + 1;
    const poNumber = generatePoNumber(branch, deliveryDay, seq);
    const items: PullOutItem[] = Array.from(selectedItems.entries()).map(([name, qty]) => {
      const cfg = PULLOUT_ITEMS.find(i => i.name === name)!;
      return { item_name: name, item_class: cfg.itemClass, calculated_qty: qty, confirmed_qty: qty, unit: "pc" as const };
    });
    const po: PullOut = {
      id: String(now), po_number: poNumber, type: "MANUAL", branch,
      delivery_day: deliveryDay, status: "PENDING_REVIEW", created_at: todayPHT(), items,
      notes: notes || undefined,
    };
    await saveDocById(COLS.pullOuts, po.id, po as unknown as Record<string, unknown>);
    setLoading(false);
    onBack();
  }

  const hasSelection = selectedItems.size > 0;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 90px)" }}>
      <div style={{ background: "#FFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-secondary)", fontSize: 20 }}>←</button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>New Manual Pull-Out</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{BRANCH_LABELS[branch]}</div>
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Delivery Date</label>
          <input type="date" value={deliveryDay} onChange={e => setDeliveryDay(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: 4, border: "1.5px solid var(--border)", borderRadius: 10, padding: "10px 12px", fontSize: 15, background: "var(--bg)", color: "var(--text)", outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg)", borderRadius: 10, padding: "8px 12px" }}>
          <svg width={16} height={16} fill="none" stroke="var(--text-secondary)" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…"
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 15, width: "100%", color: "var(--text)" }} />
          {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 0 }}>✕</button>}
        </div>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {availableItems.map(item => {
          const qty = selectedItems.get(item.name);
          const isSelected = qty !== undefined;
          return (
            <div key={item.name} style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", borderLeft: isSelected ? "4px solid #1A1A1A" : "4px solid transparent", display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={() => toggleItem(item.name)} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSelected ? "#1A1A1A" : "#D1D5DB"}`, background: isSelected ? "#1A1A1A" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {isSelected && <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={3}><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{CATALOG_MAP.get(item.name)?.packSize ?? "1 pc"}</div>
              </div>
              {isSelected && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => setQty(item.name, (qty ?? 1) - 1)} style={qtyBtnStyle}>−</button>
                  <input type="number" value={qty} onChange={e => setQty(item.name, Math.max(0, Number(e.target.value)))}
                    style={{ width: 50, textAlign: "center", border: "1.5px solid var(--border)", borderRadius: 8, padding: "6px 4px", fontSize: 16, fontWeight: 700, background: "var(--bg)", color: "var(--text)" }}
                  />
                  <button onClick={() => setQty(item.name, (qty ?? 0) + 1)} style={qtyBtnStyle}>+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ position: "fixed", bottom: "var(--nav-h)", left: 0, right: 0, background: "#FFF", borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes for commissary (optional)" rows={1}
          style={{ width: "100%", border: "1.5px solid var(--border)", borderRadius: 10, padding: "8px 12px", fontSize: 14, resize: "none", outline: "none", background: "var(--bg)", color: "var(--text)", boxSizing: "border-box", marginBottom: 8 }}
        />
        <button onClick={submit} disabled={!hasSelection || loading} style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: hasSelection ? "#1A1A1A" : "#E8E8E4", color: hasSelection ? "#FFF" : "var(--text-secondary)", fontWeight: 700, fontSize: 16, cursor: hasSelection ? "pointer" : "not-allowed" }}>
          {loading ? "Saving…" : `Submit Pull-Out${hasSelection ? ` · ${selectedItems.size} items` : ""}`}
        </button>
      </div>
    </div>
  );
}

const qtyBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", cursor: "pointer", fontSize: 18, fontWeight: 700,
  color: "#1A1A1A", display: "flex", alignItems: "center", justifyContent: "center",
};
