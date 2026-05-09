"use client";
import { useEffect, useState, useMemo } from "react";
import { BRANCH_LABELS } from "@/lib/auth";
import { CATALOG, CATALOG_MAP } from "@/lib/items";
import { db, COLS, auth, saveDocById, collection, onSnapshot, query, where, getDocs } from "@/lib/firebase";
import type { Branch, PullOut, PullOutItem, PullOutStatus } from "@/lib/types";

type View = "list" | "detail" | "new";
type FilterTab = "all" | "pending" | "active" | "done";

const STATUS_LABEL: Record<PullOutStatus, string> = {
  PENDING_REVIEW: "Pending Review",
  DISPATCHED:     "Dispatched",
  RECEIVED:       "Received",
  REJECTED:       "Rejected",
  CANCELLED:      "Cancelled",
  DISCREPANCY:    "Discrepancy",
  DISPUTED:       "Disputed",
  DONE:           "Done",
};
const STATUS_COLOR: Record<PullOutStatus, { bg: string; text: string }> = {
  PENDING_REVIEW: { bg: "#FEF3C7", text: "#D97706" },
  DISPATCHED:     { bg: "#E0E7FF", text: "#4338CA" },
  RECEIVED:       { bg: "#D1FAE5", text: "#059669" },
  REJECTED:       { bg: "#FEE2E2", text: "#DC2626" },
  CANCELLED:      { bg: "#F3F4F6", text: "#6B7280" },
  DISCREPANCY:    { bg: "#FEF3C7", text: "#D97706" },
  DISPUTED:       { bg: "#EDE9FE", text: "#7C3AED" },
  DONE:           { bg: "#D1FAE5", text: "#059669" },
};

function todayPHT(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function formatDay(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
}
function genPORef(branch: Branch, date: string, seq: number): string {
  return `PO-${date.slice(2, 4)}-${date.slice(5, 7)}${date.slice(8, 10)}-${branch}${String(seq).padStart(3, "0")}`;
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
      list.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
      setPullOuts(list);
    });
    return unsub;
  }, [branch]);

  const filtered = useMemo(() => pullOuts.filter(po => {
    if (filter === "pending") return po.status === "PENDING_REVIEW";
    if (filter === "active")  return po.status === "DISPATCHED";
    if (filter === "done")    return ["RECEIVED", "REJECTED", "CANCELLED", "DISCREPANCY", "DISPUTED", "DONE"].includes(po.status);
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
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid var(--border)", padding: "10px 16px 0" }}>
        {pendingCount > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ background: "#FEF3C7", color: "#D97706", borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 600, display: "inline-block" }}>
              {pendingCount} pending
            </div>
          </div>
        )}
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
          const borderColor = po.status === "PENDING_REVIEW" ? "#D97706"
            : po.status === "DISPATCHED" ? "#4338CA"
            : po.status === "RECEIVED" || po.status === "DONE" ? "#059669"
            : ["DISCREPANCY", "REJECTED", "DISPUTED"].includes(po.status) ? "#DC2626"
            : "#D1D5DB";
          return (
            <div key={po.id} onClick={() => { setSelected(po); setView("detail"); }} style={{
              background: "#FFF", borderRadius: 14, padding: "14px 16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)", cursor: "pointer",
              borderLeft: `4px solid ${borderColor}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{po.poRef}</div>
                <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "3px 10px", background: sc.bg, color: sc.text }}>{STATUS_LABEL[po.status]}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {formatDay(po.requestedAt)} · {po.items.length} item{po.items.length !== 1 ? "s" : ""} · {po.items.reduce((s, i) => s + i.qty, 0)} packs
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setView("new")}
        style={{
          position: "fixed", bottom: "calc(var(--nav-h) + 20px)", right: 20,
          width: 56, height: 56, borderRadius: "50%", border: "none",
          background: "#1A1A1A", color: "#FFF", fontSize: 28, fontWeight: 300,
          cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30,
        }}
        aria-label="New manual pull-out"
      >+</button>
    </div>
  );
}

function PullOutDetail({ po, branch, onBack, onUpdated }: {
  po: PullOut; branch: Branch;
  onBack: () => void;
  onUpdated: (po: PullOut) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const canCancel = po.status === "PENDING_REVIEW";
  const sc = STATUS_COLOR[po.status];

  async function cancelPO() {
    setLoading(true); setError("");
    try {
      await auth.authStateReady();
      const updated: PullOut = { ...po, status: "CANCELLED" };
      await saveDocById(COLS.pullOuts, po.id, updated as unknown as Record<string, unknown>);
      onUpdated(updated);
      onBack();
    } catch {
      setError("Failed to cancel. Try again.");
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 24px)" }}>
      <div style={{ background: "#FFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-secondary)", fontSize: 20, lineHeight: 1 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{po.poRef}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{formatDay(po.requestedAt)} · by {po.requestedBy}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "4px 10px", background: sc.bg, color: sc.text }}>{STATUS_LABEL[po.status]}</span>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {error && (
          <div style={{ background: "#FEF2F2", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#DC2626" }}>{error}</div>
        )}
        {po.status === "DISPATCHED" && (
          <div style={{ background: "#EFF6FF", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#1D4ED8" }}>
            Order dispatched — check the Deliveries tab to confirm receipt.
          </div>
        )}
        {["DISCREPANCY", "DISPUTED"].includes(po.status) && (
          <div style={{ background: "#FEF2F2", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#DC2626" }}>
            Discrepancy under review by commissary.
          </div>
        )}
        {po.status === "REJECTED" && (
          <div style={{ background: "#FEF2F2", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#DC2626" }}>
            Order rejected by commissary.{po.notes ? ` Note: ${po.notes}` : ""}
          </div>
        )}

        {po.items.map(item => (
          <div key={item.item} style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{item.item}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                {CATALOG_MAP.get(item.item)?.packSize ?? "1 pc"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{item.qty}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{item.unit}</div>
            </div>
          </div>
        ))}

        {po.notes && !["REJECTED"].includes(po.status) && (
          <div style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "var(--text-secondary)" }}>
            Note: {po.notes}
          </div>
        )}

        {canCancel && (
          <button onClick={cancelPO} disabled={loading} style={{ marginTop: 4, padding: "14px 0", borderRadius: 12, border: "1.5px solid #FCA5A5", background: "#FFF", color: "#DC2626", fontWeight: 600, fontSize: 15, cursor: "pointer", width: "100%" }}>
            {loading ? "Cancelling…" : "Cancel Request"}
          </button>
        )}
      </div>
    </div>
  );
}

function NewManualPullOut({ branch, onBack }: { branch: Branch; onBack: () => void }) {
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map());
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const branchItems = useMemo(() =>
    CATALOG.filter(i => !i.branches || i.branches.includes(branch)),
    [branch]
  );

  const availableItems = useMemo(() =>
    branchItems.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase())),
    [branchItems, search]
  );

  function toggleItem(name: string) {
    setSelectedItems(prev => {
      const n = new Map(prev);
      if (n.has(name)) n.delete(name); else n.set(name, 1);
      return n;
    });
  }
  function setQty(name: string, qty: number) {
    if (qty <= 0) setSelectedItems(prev => { const n = new Map(prev); n.delete(name); return n; });
    else setSelectedItems(prev => new Map(prev).set(name, qty));
  }

  async function submit() {
    if (selectedItems.size === 0) return;
    setLoading(true); setError("");
    try {
      await auth.authStateReady();
      const today = todayPHT();
      const snap = await getDocs(query(
        collection(db, COLS.pullOuts),
        where("branch", "==", branch),
        where("requestedAt", "==", today),
      ));
      const seq = snap.size + 1;
      const poRef = genPORef(branch, today, seq);
      const requestedBy = auth.currentUser?.displayName || BRANCH_LABELS[branch];
      const items: PullOutItem[] = Array.from(selectedItems.entries()).map(([name, qty]) => {
        const catalogItem = CATALOG_MAP.get(name);
        return { item: name, qty, unit: (catalogItem?.unit === "pack" ? "pack" : "pc") as "pc" | "pack" };
      });
      const po: PullOut = {
        id: String(Date.now()), poRef, branch, status: "PENDING_REVIEW",
        requestedAt: today, requestedBy, items,
        ...(notes ? { notes } : {}),
      };
      await saveDocById(COLS.pullOuts, po.id, po as unknown as Record<string, unknown>);
      onBack();
    } catch {
      setError("Failed to submit. Try again.");
    }
    setLoading(false);
  }

  const hasSelection = selectedItems.size > 0;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 90px)" }}>
      <div style={{ background: "#FFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-secondary)", fontSize: 20 }}>←</button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>New Pull-Out Request</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{BRANCH_LABELS[branch]}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg)", borderRadius: 10, padding: "8px 12px" }}>
          <svg width={16} height={16} fill="none" stroke="var(--text-secondary)" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…"
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 15, width: "100%", color: "var(--text)" }} />
          {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 0 }}>✕</button>}
        </div>
      </div>

      {error && (
        <div style={{ margin: "12px 16px 0", background: "#FEF2F2", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#DC2626" }}>{error}</div>
      )}

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
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  {item.packSize}
                  <span style={{ marginLeft: 6, background: item.category === "portion" ? "#EDE9FE" : item.category === "packed" ? "#DBEAFE" : "#D1FAE5", color: item.category === "portion" ? "#7C3AED" : item.category === "packed" ? "#2563EB" : "#059669", borderRadius: 4, padding: "1px 5px", fontSize: 10, fontWeight: 600 }}>{item.category}</span>
                </div>
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
          {loading ? "Saving…" : `Submit Request${hasSelection ? ` · ${selectedItems.size} item${selectedItems.size !== 1 ? "s" : ""}` : ""}`}
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
