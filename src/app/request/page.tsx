"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getSession, BRANCH_LABELS } from "@/lib/auth";
import { db, COLS, saveDoc, collection, onSnapshot } from "@/lib/firebase";
import { CATALOG } from "@/lib/items";
import type { Branch, BranchStock, PulloutRequest, PulloutItem, ItemCategory } from "@/lib/types";
import BottomNav from "@/components/BottomNav";

type View = "list" | "new";

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending:    { bg: "#FEF3C7", text: "#D97706", label: "Pending"    },
  approved:   { bg: "#D1FAE5", text: "#059669", label: "Approved"   },
  in_transit: { bg: "#DBEAFE", text: "#2563EB", label: "In Transit" },
  received:   { bg: "#F3F4F6", text: "#6B7280", label: "Received"   },
};

function todayPHT(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function poRef(branch: Branch, date: string, seq: number): string {
  const d = date.replace(/-/g, "").slice(2);
  return `${branch}-${d}-${String(seq).padStart(2, "0")}`;
}

export default function RequestPage() {
  const router = useRouter();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [view, setView] = useState<View>("list");
  const [requests, setRequests] = useState<PulloutRequest[]>([]);
  const [stocks, setStocks] = useState<Record<string, BranchStock>>({});

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    setBranch(session.branch);

    const unsubReqs = onSnapshot(collection(db, COLS.pulloutReqs), snap => {
      const reqs = snap.docs.map(d => d.data() as PulloutRequest)
        .filter(r => r.branch === session.branch)
        .sort((a, b) => b.id - a.id);
      setRequests(reqs);
    });

    const unsubStock = onSnapshot(collection(db, COLS.branchStock), snap => {
      const map: Record<string, BranchStock> = {};
      snap.docs.forEach(d => {
        const s = d.data() as BranchStock;
        if (s.branch === session.branch) map[s.item] = s;
      });
      setStocks(map);
    });

    return () => { unsubReqs(); unsubStock(); };
  }, [router]);

  if (!branch) return null;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 16px)" }}>
      {view === "list" ? (
        <ListView branch={branch} requests={requests} onNew={() => setView("new")} />
      ) : (
        <NewRequestView branch={branch} stocks={stocks} requests={requests} onBack={() => setView("list")} />
      )}
      <BottomNav />
    </div>
  );
}

function ListView({ branch, requests, onNew }: {
  branch: Branch; requests: PulloutRequest[]; onNew: () => void;
}) {
  const [selected, setSelected] = useState<PulloutRequest | null>(null);

  return (
    <>
      <div style={{
        background: "#FFFFFF", borderBottom: "1px solid var(--border)",
        padding: "16px 16px 12px",
        position: "sticky", top: 0, zIndex: 40,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
          {BRANCH_LABELS[branch]}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Pull-out Requests</div>
          <button
            onClick={onNew}
            style={{
              background: "#1A1A1A", color: "#FFFFFF", border: "none",
              borderRadius: 10, padding: "8px 16px", fontWeight: 600, fontSize: 14, cursor: "pointer",
            }}
          >
            + New
          </button>
        </div>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {requests.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "64px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 15 }}>No requests yet</div>
          </div>
        )}
        {requests.map(req => {
          const st = STATUS_COLORS[req.status] ?? STATUS_COLORS.pending;
          return (
            <div
              key={req.id}
              onClick={() => setSelected(req)}
              style={{
                background: "#FFFFFF", borderRadius: 14, padding: "14px 16px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)", cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{req.poRef}</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 2 }}>
                    {req.date} · {req.items.length} item{req.items.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <div style={{
                  background: st.bg, color: st.text,
                  borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 600,
                }}>
                  {st.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <RequestDetailModal req={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function NewRequestView({ branch, stocks, requests, onBack }: {
  branch: Branch; stocks: Record<string, BranchStock>;
  requests: PulloutRequest[]; onBack: () => void;
}) {
  type SelectedItem = { item: string; qty: string };
  const [selected, setSelected] = useState<SelectedItem[]>([]);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<"all" | ItemCategory>("all");
  const [loading, setLoading] = useState(false);

  const TABS: { id: "all" | ItemCategory; label: string }[] = [
    { id: "all",     label: "All"      },
    { id: "portion", label: "Portions" },
    { id: "packed",  label: "Packed"   },
    { id: "loose",   label: "Loose"    },
  ];

  const filtered = useMemo(() => CATALOG.filter(i => {
    if (catFilter !== "all" && i.category !== catFilter) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [catFilter, search]);

  function toggleItem(name: string) {
    setSelected(prev => {
      const exists = prev.find(s => s.item === name);
      if (exists) return prev.filter(s => s.item !== name);
      return [...prev, { item: name, qty: "" }];
    });
  }

  function setQty(name: string, qty: string) {
    setSelected(prev => prev.map(s => s.item === name ? { ...s, qty } : s));
  }

  const canSubmit = selected.length > 0 && selected.every(s => s.qty !== "" && Number(s.qty) > 0);

  async function submit() {
    if (!canSubmit) return;
    setLoading(true);
    const date = todayPHT();
    const todayReqs = requests.filter(r => r.date === date);
    const seq = todayReqs.length + 1;
    const id = Date.now();

    const items: PulloutItem[] = selected.map(s => {
      const cat = CATALOG.find(c => c.name === s.item)!;
      return {
        item: s.item,
        category: cat.category,
        qty: Number(s.qty),
        unit: cat.unit,
        currentStock: stocks[s.item]?.qty,
      };
    });

    const req: PulloutRequest = {
      id,
      poRef: poRef(branch, date, seq),
      branch, date,
      requestedBy: BRANCH_LABELS[branch],
      status: "pending",
      items,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (notes) req.notes = notes;

    await saveDoc(COLS.pulloutReqs, req as unknown as Record<string, unknown>);
    setLoading(false);
    onBack();
  }

  return (
    <div>
      <div style={{
        background: "#FFFFFF", borderBottom: "1px solid var(--border)",
        padding: "16px 16px 0", position: "sticky", top: 0, zIndex: 40,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text-secondary)", fontSize: 22, lineHeight: 1 }}>←</button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>New Request</div>
            <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              {selected.length > 0 ? `${selected.length} item${selected.length > 1 ? "s" : ""} selected` : "Select items to request"}
            </div>
          </div>
          {canSubmit && (
            <button
              onClick={submit} disabled={loading}
              style={{
                marginLeft: "auto", background: "#1A1A1A", color: "#FFFFFF",
                border: "none", borderRadius: 10, padding: "8px 16px",
                fontWeight: 600, fontSize: 14, cursor: "pointer",
              }}
            >
              {loading ? "Sending…" : "Send"}
            </button>
          )}
        </div>

        {/* Search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--bg)", borderRadius: 10, padding: "8px 12px", marginBottom: 8,
        }}>
          <svg width={16} height={16} fill="none" stroke="var(--text-secondary)" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…"
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 15, width: "100%", color: "var(--text)" }} />
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setCatFilter(t.id)} style={{
              padding: "8px 16px", borderRadius: "8px 8px 0 0", border: "none",
              cursor: "pointer", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap",
              background: catFilter === t.id ? "var(--bg)" : "transparent",
              color: catFilter === t.id ? "#1A1A1A" : "var(--text-secondary)",
              borderBottom: catFilter === t.id ? "2px solid #1A1A1A" : "2px solid transparent",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Notes field */}
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes for commissary (optional)"
          style={{ border: "1.5px solid var(--border)", borderRadius: 10, padding: "12px 14px", fontSize: 15, outline: "none", background: "#FFFFFF", color: "var(--text)", width: "100%" }} />

        {filtered.map(item => {
          const sel = selected.find(s => s.item === item.name);
          const stock = stocks[item.name];
          return (
            <div key={item.name} onClick={() => !sel && toggleItem(item.name)}
              style={{
                background: "#FFFFFF", borderRadius: 14, padding: "12px 14px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                border: sel ? "2px solid #1A1A1A" : "2px solid transparent",
                cursor: sel ? "default" : "pointer",
                display: "flex", alignItems: "center", gap: 12,
              }}
            >
              <div
                onClick={e => { e.stopPropagation(); toggleItem(item.name); }}
                style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  border: "2px solid", borderColor: sel ? "#1A1A1A" : "#D1D5DB",
                  background: sel ? "#1A1A1A" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                {sel && <svg width={12} height={12} fill="none" stroke="#FFFFFF" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  On hand: {stock ? `${stock.qty} ${item.unit}` : "unknown"}
                </div>
              </div>
              {sel && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={e => e.stopPropagation()}>
                  <input
                    type="number" value={sel.qty}
                    onChange={e => setQty(item.name, e.target.value)}
                    placeholder="Qty"
                    autoFocus
                    style={{
                      width: 70, border: "1.5px solid var(--border)", borderRadius: 8,
                      padding: "8px 10px", fontSize: 15, outline: "none",
                      background: "var(--bg)", color: "var(--text)", textAlign: "right",
                    }}
                  />
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{item.unit}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RequestDetailModal({ req, onClose }: { req: PulloutRequest; onClose: () => void }) {
  const st = STATUS_COLORS[req.status] ?? STATUS_COLORS.pending;
  const STEPS: PulloutRequest["status"][] = ["pending", "approved", "in_transit", "received"];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60 }} />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70,
        background: "#FFFFFF", borderRadius: "20px 20px 0 0",
        padding: "20px 20px 40px", maxHeight: "80dvh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{req.poRef}</div>
            <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 2 }}>{req.date}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ background: st.bg, color: st.text, borderRadius: 20, padding: "4px 12px", fontSize: 13, fontWeight: 600 }}>
              {st.label}
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: 20, padding: 4 }}>✕</button>
          </div>
        </div>

        {/* Status timeline */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, position: "relative" }}>
          <div style={{
            position: "absolute", top: 10, left: "10%", right: "10%", height: 2,
            background: "var(--border)", zIndex: 0,
          }} />
          {STEPS.map(step => {
            const stepIdx = STEPS.indexOf(step);
            const curIdx = STEPS.indexOf(req.status);
            const done = stepIdx <= curIdx;
            return (
              <div key={step} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, zIndex: 1, minWidth: 60 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: done ? "#1A1A1A" : "#FFFFFF",
                  border: `2px solid ${done ? "#1A1A1A" : "var(--border)"}`,
                }} />
                <div style={{ fontSize: 10, color: done ? "#1A1A1A" : "var(--text-secondary)", fontWeight: done ? 600 : 400, textAlign: "center", textTransform: "capitalize", whiteSpace: "nowrap" }}>
                  {STATUS_COLORS[step]?.label ?? step}
                </div>
              </div>
            );
          })}
        </div>

        {req.notes && (
          <div style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 14, color: "var(--text-secondary)" }}>
            📝 {req.notes}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {req.items.map((it, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 14px", background: "var(--bg)", borderRadius: 10,
            }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{it.item}</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{it.qty} <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-secondary)" }}>{it.unit}</span></div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
