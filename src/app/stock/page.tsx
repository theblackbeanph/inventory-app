"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getSession, logout, BRANCH_LABELS } from "@/lib/auth";
import { db, COLS, saveDocById, saveDoc } from "@/lib/firebase";
import { CATALOG, stockDocId } from "@/lib/items";
import { collection, onSnapshot, query, where, getDocs, writeBatch } from "@/lib/firebase";
import type { Branch, BranchStock, StockAdjustment, DailyBeginning, ItemCategory } from "@/lib/types";
import BottomNav from "@/components/BottomNav";

type FilterTab = "all" | ItemCategory;
type ModalMode = "beginning" | "adjust" | "count";

const TABS: { id: FilterTab; label: string }[] = [
  { id: "all",     label: "All"      },
  { id: "portion", label: "Portions" },
  { id: "packed",  label: "Packed"   },
  { id: "loose",   label: "Loose"    },
];

function todayPHT(): string {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

interface DailyMetrics {
  beginning: number | null;
  inQty: number;
  outQty: number;
  endCount: number | null;
}

export default function StockPage() {
  const router = useRouter();
  const [today] = useState(todayPHT);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [stocks, setStocks] = useState<Record<string, BranchStock>>({});
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [beginnings, setBeginnings] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [adjustItem, setAdjustItem] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    setBranch(session.branch);

    const b = session.branch;

    const unsubStock = onSnapshot(collection(db, COLS.branchStock), snap => {
      const map: Record<string, BranchStock> = {};
      snap.docs.forEach(d => {
        const s = d.data() as BranchStock;
        if (s.branch === b) map[s.item] = s;
      });
      setStocks(map);
    });

    const adjQuery = query(
      collection(db, COLS.adjustments),
      where("branch", "==", b),
      where("date", "==", today)
    );
    const unsubAdj = onSnapshot(adjQuery, snap => {
      setAdjustments(snap.docs.map(d => d.data() as StockAdjustment));
    });

    const begQuery = query(
      collection(db, COLS.dailyBeginning),
      where("branch", "==", b),
      where("date", "==", today)
    );
    const unsubBeg = onSnapshot(begQuery, snap => {
      const map: Record<string, number> = {};
      snap.docs.forEach(d => {
        const beg = d.data() as DailyBeginning;
        map[beg.item] = beg.qty;
      });
      setBeginnings(map);
    });

    return () => { unsubStock(); unsubAdj(); unsubBeg(); };
  }, [router, today]);

  const dailyMetrics = useMemo((): Record<string, DailyMetrics> => {
    const metrics: Record<string, DailyMetrics> = {};
    for (const item of CATALOG) {
      metrics[item.name] = { beginning: beginnings[item.name] ?? null, inQty: 0, outQty: 0, endCount: null };
    }

    const latestCount: Record<string, { qty: number; id: number }> = {};
    for (const adj of adjustments) {
      if (!metrics[adj.item]) continue;
      const m = metrics[adj.item];
      if (adj.type === "in") {
        m.inQty += adj.qty;
      } else if (adj.type === "out" || adj.type === "waste") {
        m.outQty += adj.qty;
      } else if (adj.type === "count") {
        if (!latestCount[adj.item] || adj.id > latestCount[adj.item].id) {
          latestCount[adj.item] = { qty: adj.qty, id: adj.id };
        }
      }
    }
    for (const [item, { qty }] of Object.entries(latestCount)) {
      if (metrics[item]) metrics[item].endCount = qty;
    }

    return metrics;
  }, [adjustments, beginnings]);

  const filtered = useMemo(() => CATALOG.filter(item => {
    if (filter !== "all" && item.category !== filter) return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [filter, search]);

  const lowCount = CATALOG.filter(item => {
    const s = stocks[item.name];
    return s && s.qty <= item.reorderAt && s.qty > 0;
  }).length;

  const critCount = CATALOG.filter(item => {
    const s = stocks[item.name];
    return !s || s.qty <= 0;
  }).length;

  if (!branch) return null;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 16px)" }}>
      <div style={{
        background: "#FFFFFF", borderBottom: "1px solid var(--border)",
        padding: "16px 16px 0",
        position: "sticky", top: 0, zIndex: 40,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
              {BRANCH_LABELS[branch]}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Daily Inventory</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 1 }}>{today}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {lowCount > 0 && (
              <div style={{ background: "#FEF3C7", color: "#D97706", borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>
                {lowCount} low
              </div>
            )}
            {critCount > 0 && (
              <div style={{ background: "#FEE2E2", color: "#DC2626", borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>
                {critCount} out
              </div>
            )}
            <button
              onClick={() => setShowReset(true)}
              style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 12, padding: "4px 8px", fontWeight: 500 }}
            >
              Reset
            </button>
            <button
              onClick={() => { logout(); router.replace("/login"); }}
              style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, padding: "4px 8px" }}
            >
              Log out
            </button>
          </div>
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--bg)", borderRadius: 10, padding: "8px 12px",
          marginBottom: 12,
        }}>
          <svg width={16} height={16} fill="none" stroke="var(--text-secondary)" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search items…"
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 15, width: "100%", color: "var(--text)" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 0, lineHeight: 1 }}>✕</button>
          )}
        </div>

        <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 0 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              style={{
                padding: "8px 16px", borderRadius: "8px 8px 0 0", border: "none",
                cursor: "pointer", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap",
                background: filter === t.id ? "var(--bg)" : "transparent",
                color: filter === t.id ? "#1A1A1A" : "var(--text-secondary)",
                borderBottom: filter === t.id ? "2px solid #1A1A1A" : "2px solid transparent",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map(item => {
          const m = dailyMetrics[item.name];
          const expected = m.beginning !== null ? m.beginning + m.inQty - m.outQty : null;
          const variance = m.endCount !== null && expected !== null ? m.endCount - expected : null;

          let borderColor = "#D1D5DB";
          if (variance !== null) {
            borderColor = variance === 0 ? "#16A34A" : "#DC2626";
          } else {
            const s = stocks[item.name];
            if (s) {
              if (s.qty <= 0) borderColor = "#DC2626";
              else if (s.qty <= item.reorderAt) borderColor = "#D97706";
              else borderColor = "#16A34A";
            }
          }

          return (
            <div
              key={item.name}
              onClick={() => setAdjustItem(item.name)}
              style={{
                background: "#FFFFFF", borderRadius: 14,
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                cursor: "pointer",
                borderLeft: `4px solid ${borderColor}`,
                overflow: "hidden",
              }}
            >
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "11px 14px 9px",
              }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{item.name}</div>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                  textTransform: "uppercase", color: "var(--text-secondary)",
                  background: "var(--bg)", padding: "3px 8px", borderRadius: 20,
                }}>
                  {item.category} · {item.unit}
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
                <MetricCell label="BEG" value={m.beginning} color="var(--text)" />
                <MetricCell label="IN" value={m.inQty} color="#16A34A" prefix="+" border />
                <MetricCell label="OUT" value={m.outQty} color="#DC2626" prefix="−" border />
              </div>
              <div style={{ borderTop: "1px solid var(--border)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
                <MetricCell label="EXPECTED" value={expected} color="#2563EB" />
                <MetricCell label="END COUNT" value={m.endCount} color="var(--text)" border />
                <MetricCell
                  label="VARIANCE"
                  value={variance}
                  color={variance === null ? "var(--text-secondary)" : variance === 0 ? "#16A34A" : "#DC2626"}
                  showSign
                  border
                />
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "48px 0", fontSize: 15 }}>
            No items match &ldquo;{search}&rdquo;
          </div>
        )}
      </div>

      {showReset && branch && (
        <ResetModal branch={branch} onClose={() => setShowReset(false)} />
      )}

      {adjustItem && (
        <AdjustModal
          item={adjustItem}
          branch={branch}
          stock={stocks[adjustItem] ?? null}
          beginningQty={beginnings[adjustItem] ?? null}
          today={today}
          onClose={() => setAdjustItem(null)}
        />
      )}

      <BottomNav />
    </div>
  );
}

function MetricCell({ label, value, color, prefix, showSign, border }: {
  label: string;
  value: number | null;
  color: string;
  prefix?: string;
  showSign?: boolean;
  border?: boolean;
}) {
  let display: string;
  if (value === null) {
    display = "—";
  } else if (showSign) {
    display = value > 0 ? `+${value}` : value < 0 ? `${value}` : "✓";
  } else if (prefix && value > 0) {
    display = `${prefix}${value}`;
  } else {
    display = value.toLocaleString();
  }

  return (
    <div style={{
      padding: "8px 4px 10px",
      textAlign: "center",
      borderLeft: border ? "1px solid var(--border)" : undefined,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: value === null ? "var(--text-secondary)" : color }}>
        {display}
      </div>
    </div>
  );
}

function AdjustModal({ item, branch, stock, beginningQty, today, onClose }: {
  item: string;
  branch: Branch;
  stock: BranchStock | null;
  beginningQty: number | null;
  today: string;
  onClose: () => void;
}) {
  const catalogItem = CATALOG.find(c => c.name === item)!;
  const [mode, setMode] = useState<ModalMode>("beginning");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const currentQty = stock?.qty ?? 0;

  async function save() {
    setLoading(true);
    const now = Date.now();
    const loggedBy = BRANCH_LABELS[branch];
    const qtyNum = Number(qty);

    if (mode === "beginning") {
      const beginId = `${branch}__${item}__${today}`;
      const begDoc: DailyBeginning = {
        id: beginId, branch, item, date: today,
        qty: qtyNum, setBy: loggedBy, updatedAt: today,
      };
      await saveDocById(COLS.dailyBeginning, beginId, begDoc as unknown as Record<string, unknown>);
    } else {
      const type: StockAdjustment["type"] =
        mode === "count" ? "count" :
        qtyNum >= 0 ? "in" : "out";

      const adj: StockAdjustment = {
        id: now, branch, date: today, item,
        type, qty: Math.abs(qtyNum), loggedBy,
      };
      if (note) adj.note = note;

      const newQty = mode === "count" ? qtyNum : Math.max(0, currentQty + qtyNum);
      const stockId = stockDocId(branch, item);
      const stockDoc: BranchStock = {
        id: stockId, branch, item,
        category: catalogItem.category,
        unit: catalogItem.unit,
        qty: newQty,
        reorderAt: catalogItem.reorderAt,
        lastUpdated: today,
        lastUpdatedBy: loggedBy,
      };

      await Promise.all([
        saveDocById(COLS.branchStock, stockId, stockDoc as unknown as Record<string, unknown>),
        saveDoc(COLS.adjustments, adj as unknown as Record<string, unknown>),
      ]);
    }

    setLoading(false);
    onClose();
  }

  const qtyNum = Number(qty);
  const canSave = qty !== "" && !isNaN(qtyNum) &&
    (mode === "adjust" ? qtyNum !== 0 : qtyNum >= 0);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60 }} />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70,
        background: "#FFFFFF", borderRadius: "20px 20px 0 0",
        padding: "20px 20px 40px",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.12)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{item}</div>
            <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 2 }}>
              Stock: <strong>{currentQty.toLocaleString()} {catalogItem.unit}</strong>
              {beginningQty !== null && (
                <span> · BEG: <strong>{beginningQty} {catalogItem.unit}</strong></span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: 20, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 6, margin: "16px 0" }}>
          {([
            { id: "beginning", label: "Beginning" },
            { id: "adjust",    label: "Adjust" },
            { id: "count",     label: "End Count" },
          ] as { id: ModalMode; label: string }[]).map(m => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); setQty(""); }}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer",
                fontWeight: 600, fontSize: 13,
                background: mode === m.id ? "#1A1A1A" : "var(--bg)",
                color: mode === m.id ? "#FFFFFF" : "var(--text-secondary)",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 8 }}>
          {mode === "beginning" && `Start-of-day count${beginningQty !== null ? ` (currently ${beginningQty})` : ""}`}
          {mode === "adjust" && "Positive to add, negative to remove"}
          {mode === "count" && "Physical end-of-day count"}
        </div>

        {mode === "adjust" ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setQty(q => String((Number(q) || 0) - 1))} style={quickBtnStyle}>−</button>
            <input
              type="number" value={qty}
              onChange={e => setQty(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
            <button onClick={() => setQty(q => String((Number(q) || 0) + 1))} style={quickBtnStyle}>+</button>
          </div>
        ) : (
          <input
            type="number" value={qty}
            onChange={e => setQty(e.target.value)}
            placeholder={`Count in ${catalogItem.unit}`}
            style={{ ...inputStyle, width: "100%" }}
          />
        )}

        {mode === "adjust" && qty && !isNaN(Number(qty)) && (
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)" }}>
            New balance: <strong>{Math.max(0, currentQty + Number(qty))} {catalogItem.unit}</strong>
          </div>
        )}

        {mode !== "beginning" && (
          <input
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="Note (optional)"
            style={{ ...inputStyle, width: "100%", marginTop: 10 }}
          />
        )}

        <button
          onClick={save} disabled={!canSave || loading}
          style={{
            marginTop: 16, width: "100%", padding: "15px 0",
            borderRadius: 14, border: "none", cursor: canSave ? "pointer" : "not-allowed",
            fontWeight: 700, fontSize: 16,
            background: canSave ? "#1A1A1A" : "#E8E8E4",
            color: canSave ? "#FFFFFF" : "var(--text-secondary)",
          }}
        >
          {loading ? "Saving…" :
            mode === "beginning" ? "Set Beginning" :
            mode === "count" ? "Save End Count" :
            "Save Adjustment"}
        </button>
      </div>
    </>
  );
}

// ── Reset Demo Data Modal ─────────────────────────────────────────────────────

function ResetModal({ branch, onClose }: { branch: Branch; onClose: () => void }) {
  const [scope, setScope] = useState<"branch" | "all">("branch");
  const [phase, setPhase] = useState<"confirm" | "running" | "done">("confirm");
  const [log, setLog] = useState<string[]>([]);

  async function runReset() {
    setPhase("running");
    const lines: string[] = [];

    const branchCols = [
      COLS.branchStock,
      COLS.adjustments,
      COLS.dailyBeginning,
      COLS.pullOuts,
      COLS.deliveryNotes,
    ];

    for (const col of branchCols) {
      const q = scope === "branch"
        ? query(collection(db, col), where("branch", "==", branch))
        : query(collection(db, col));
      const snap = await getDocs(q);
      if (snap.empty) { lines.push(`${col}: nothing to delete`); setLog([...lines]); continue; }

      // Delete in batches of 400
      const chunks: typeof snap.docs[] = [];
      for (let i = 0; i < snap.docs.length; i += 400) chunks.push(snap.docs.slice(i, i + 400));
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      lines.push(`✓ ${col}: deleted ${snap.size} docs`);
      setLog([...lines]);
    }

    setPhase("done");
  }

  return (
    <>
      <div onClick={phase === "confirm" ? onClose : undefined}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }} />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70,
        background: "#FFF", borderRadius: "20px 20px 0 0",
        padding: "24px 20px 40px",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.15)",
      }}>
        {phase === "confirm" && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Reset Demo Data</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
              Only clears branch app data. Cannot be undone.
            </div>

            {/* What gets cleared */}
            <div style={{ background: "#FEF2F2", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Will be cleared</div>
              {["branch_stock", "branch_adjustments", "daily_beginning", "pull_outs", "delivery_notes"].map(c => (
                <div key={c} style={{ fontSize: 12, color: "#7F1D1D", marginBottom: 2 }}>· {c}</div>
              ))}
            </div>

            {/* What is NOT touched */}
            <div style={{ background: "#F0FDF4", borderRadius: 10, padding: "10px 12px", marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#15803D", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Commissary data — untouched</div>
              {["invEntries", "pullout_requests", "all other commissary collections"].map(c => (
                <div key={c} style={{ fontSize: 12, color: "#14532D", marginBottom: 2 }}>· {c}</div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {(["branch", "all"] as const).map(s => (
                <button key={s} onClick={() => setScope(s)} style={{
                  flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
                  cursor: "pointer", fontWeight: 600, fontSize: 13,
                  background: scope === s ? "#1A1A1A" : "var(--bg)",
                  color: scope === s ? "#FFF" : "var(--text-secondary)",
                }}>
                  {s === "branch" ? `This branch only` : "All branches"}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} style={{
                flex: 1, padding: "14px 0", borderRadius: 12,
                border: "1.5px solid var(--border)", background: "#FFF",
                color: "var(--text-secondary)", fontWeight: 600, fontSize: 15, cursor: "pointer",
              }}>Cancel</button>
              <button onClick={runReset} style={{
                flex: 1, padding: "14px 0", borderRadius: 12,
                border: "none", background: "#DC2626",
                color: "#FFF", fontWeight: 700, fontSize: 15, cursor: "pointer",
              }}>Wipe Data</button>
            </div>
          </>
        )}

        {phase === "running" && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Resetting…</div>
            {log.map((l, i) => (
              <div key={i} style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>{l}</div>
            ))}
          </>
        )}

        {phase === "done" && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Done ✓</div>
            {log.map((l, i) => (
              <div key={i} style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>{l}</div>
            ))}
            <button onClick={onClose} style={{
              marginTop: 20, width: "100%", padding: "14px 0", borderRadius: 12,
              border: "none", background: "#1A1A1A", color: "#FFF",
              fontWeight: 700, fontSize: 15, cursor: "pointer",
            }}>Close</button>
          </>
        )}
      </div>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--border)", borderRadius: 10,
  padding: "12px 14px", fontSize: 16, outline: "none",
  background: "var(--bg)", color: "var(--text)", width: "100%",
};

const quickBtnStyle: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 10, border: "1.5px solid var(--border)",
  background: "var(--bg)", cursor: "pointer", fontSize: 20, fontWeight: 700,
  color: "#1A1A1A", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
};
