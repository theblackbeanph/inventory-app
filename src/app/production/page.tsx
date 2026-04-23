"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getSession, BRANCH_LABELS } from "@/lib/auth";
import { db, COLS, saveDocById } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "@/lib/firebase";
import { RAW_MATERIALS, RAW_MATERIAL_MAP } from "@/lib/production-config";
import type { Branch, SupplierDelivery, SupplierDeliveryItem, PortioningRun } from "@/lib/types";
import BottomNav from "@/components/BottomNav";

type Tab = "deliveries" | "portioning";
type DeliveryView = "list" | "new";
type PortioningView = "list" | "new";

function todayPHT(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function formatDay(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
}

export default function ProductionPage() {
  const router = useRouter();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [tab, setTab] = useState<Tab>("deliveries");

  // Shared data: deliveries and portioning runs (for remaining packs computation)
  const [deliveries, setDeliveries] = useState<SupplierDelivery[]>([]);
  const [runs, setRuns] = useState<PortioningRun[]>([]);

  const [deliveryView, setDeliveryView] = useState<DeliveryView>("list");
  const [portioningView, setPortioningView] = useState<PortioningView>("list");

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    setBranch(session.branch);
    const b = session.branch;

    const unsubD = onSnapshot(
      query(collection(db, COLS.supplierDeliveries), where("branch", "==", b)),
      snap => {
        const list = snap.docs.map(d => d.data() as SupplierDelivery);
        list.sort((a, b) => b.date.localeCompare(a.date));
        setDeliveries(list);
      }
    );
    const unsubR = onSnapshot(
      query(collection(db, COLS.portioningRuns), where("branch", "==", b)),
      snap => {
        const list = snap.docs.map(d => d.data() as PortioningRun);
        list.sort((a, b) => b.date.localeCompare(a.date));
        setRuns(list);
      }
    );
    return () => { unsubD(); unsubR(); };
  }, [router]);

  // Compute remaining packs per raw item
  const remainingPacks = useMemo(() => {
    const map: Record<string, number> = {};
    for (const mat of RAW_MATERIALS) map[mat.name] = 0;
    for (const d of deliveries) {
      for (const item of d.items) {
        map[item.rawItem] = (map[item.rawItem] ?? 0) + item.packsReceived;
      }
    }
    for (const r of runs) {
      map[r.rawItem] = (map[r.rawItem] ?? 0) - r.packsUsed;
    }
    return map;
  }, [deliveries, runs]);

  if (!branch) return null;

  const noItems = RAW_MATERIALS.length === 0;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 16px)" }}>
      {/* Header */}
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 0", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
            {BRANCH_LABELS[branch]}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Production</div>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {([
            { id: "deliveries", label: "Raw Deliveries" },
            { id: "portioning", label: "Portioning" },
          ] as { id: Tab; label: string }[]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "9px 4px", border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 13, background: "transparent",
              color: tab === t.id ? "#1A1A1A" : "var(--text-secondary)",
              borderBottom: tab === t.id ? "2px solid #1A1A1A" : "2px solid transparent",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {noItems && (
        <div style={{ margin: "24px 16px", background: "#FEF3C7", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#D97706", marginBottom: 4 }}>No raw materials configured</div>
          <div style={{ fontSize: 13, color: "#92400E" }}>
            Add items to <code style={{ background: "#FDE68A", borderRadius: 4, padding: "1px 5px" }}>src/lib/production-config.ts</code> to start tracking production.
          </div>
        </div>
      )}

      {/* Raw stock summary cards */}
      {!noItems && (
        <div style={{ padding: "12px 16px 0", display: "flex", gap: 8, overflowX: "auto" }}>
          {RAW_MATERIALS.map(mat => {
            const remaining = remainingPacks[mat.name] ?? 0;
            const isLow = remaining <= 2;
            return (
              <div key={mat.name} style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", minWidth: 140, flexShrink: 0, borderTop: `3px solid ${isLow ? "#DC2626" : "#059669"}` }}>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4, fontWeight: 600 }}>{mat.name}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: isLow ? "#DC2626" : "#1A1A1A" }}>{remaining}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{mat.packLabel}s left</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab content */}
      {tab === "deliveries" && (
        deliveryView === "new"
          ? <NewDeliveryForm branch={branch} loggedBy={BRANCH_LABELS[branch]} onBack={() => setDeliveryView("list")} />
          : <DeliveryList deliveries={deliveries} onNew={() => setDeliveryView("new")} noItems={noItems} />
      )}
      {tab === "portioning" && (
        portioningView === "new"
          ? <NewPortioningForm branch={branch} loggedBy={BRANCH_LABELS[branch]} remainingPacks={remainingPacks} onBack={() => setPortioningView("list")} />
          : <PortioningList runs={runs} onNew={() => setPortioningView("new")} noItems={noItems} />
      )}

      <BottomNav />
    </div>
  );
}

// ── Delivery list ─────────────────────────────────────────────────────────────

function DeliveryList({ deliveries, onNew, noItems }: { deliveries: SupplierDelivery[]; onNew: () => void; noItems: boolean }) {
  return (
    <div>
      <div style={{ padding: "12px 16px 6px", display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onNew} disabled={noItems} style={{ background: noItems ? "#E8E8E4" : "#1A1A1A", color: noItems ? "var(--text-secondary)" : "#FFF", border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: noItems ? "not-allowed" : "pointer" }}>
          + Log Delivery
        </button>
      </div>
      <div style={{ padding: "6px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {deliveries.length === 0 && !noItems && (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "60px 0", fontSize: 15 }}>No supplier deliveries yet.</div>
        )}
        {deliveries.map(d => (
          <div key={d.id} style={{ background: "#FFF", borderRadius: 14, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", borderLeft: "4px solid #059669" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{formatDay(d.date)}</div>
              {d.supplier && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{d.supplier}</div>}
            </div>
            {d.items.map(item => (
              <div key={item.rawItem} style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                +{item.packsReceived} {RAW_MATERIAL_MAP.get(item.rawItem)?.packLabel ?? "pack"}s · <strong style={{ color: "#1A1A1A" }}>{item.rawItem}</strong>
              </div>
            ))}
            {d.notes && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>{d.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── New delivery form ─────────────────────────────────────────────────────────

function NewDeliveryForm({ branch, loggedBy, onBack }: { branch: Branch; loggedBy: string; onBack: () => void }) {
  const [date, setDate] = useState(todayPHT());
  const [supplier, setSupplier] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const hasQty = Object.values(quantities).some(v => Number(v) > 0);

  async function submit() {
    if (!hasQty) return;
    setLoading(true);
    const id = String(Date.now());
    const items: SupplierDeliveryItem[] = RAW_MATERIALS
      .filter(m => Number(quantities[m.name]) > 0)
      .map(m => ({ rawItem: m.name, packsReceived: Number(quantities[m.name]) }));
    const delivery: SupplierDelivery = { id, branch, date, loggedBy, items, notes: notes || undefined, supplier: supplier || undefined };
    await saveDocById(COLS.supplierDeliveries, id, delivery as unknown as Record<string, unknown>);
    setLoading(false);
    onBack();
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 90px)" }}>
      <div style={{ background: "#FFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-secondary)", fontSize: 20 }}>←</button>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Log Supplier Delivery</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Supplier (optional)</label>
            <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="e.g. S&R" style={inputStyle} />
          </div>
        </div>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Packs received</div>
        {RAW_MATERIALS.map(mat => (
          <div key={mat.name} style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{mat.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{mat.packLabel}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => setQuantities(p => ({ ...p, [mat.name]: String(Math.max(0, (Number(p[mat.name]) || 0) - 1)) }))} style={qtyBtnStyle}>−</button>
              <input type="number" value={quantities[mat.name] ?? "0"}
                onChange={e => setQuantities(p => ({ ...p, [mat.name]: e.target.value }))}
                style={{ width: 56, textAlign: "center", border: "1.5px solid var(--border)", borderRadius: 8, padding: "6px 4px", fontSize: 16, fontWeight: 700, background: "var(--bg)", color: "var(--text)" }}
              />
              <button onClick={() => setQuantities(p => ({ ...p, [mat.name]: String((Number(p[mat.name]) || 0) + 1) }))} style={qtyBtnStyle}>+</button>
            </div>
          </div>
        ))}
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2}
          style={{ width: "100%", border: "1.5px solid var(--border)", borderRadius: 10, padding: "10px 12px", fontSize: 14, resize: "none", outline: "none", background: "var(--bg)", color: "var(--text)", boxSizing: "border-box", marginTop: 4 }}
        />
      </div>

      <div style={{ position: "fixed", bottom: "var(--nav-h)", left: 0, right: 0, background: "#FFF", borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
        <button onClick={submit} disabled={!hasQty || loading} style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: hasQty ? "#1A1A1A" : "#E8E8E4", color: hasQty ? "#FFF" : "var(--text-secondary)", fontWeight: 700, fontSize: 16, cursor: hasQty ? "pointer" : "not-allowed" }}>
          {loading ? "Saving…" : "Save Delivery"}
        </button>
      </div>
    </div>
  );
}

// ── Portioning list ───────────────────────────────────────────────────────────

function PortioningList({ runs, onNew, noItems }: { runs: PortioningRun[]; onNew: () => void; noItems: boolean }) {
  return (
    <div>
      <div style={{ padding: "12px 16px 6px", display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onNew} disabled={noItems} style={{ background: noItems ? "#E8E8E4" : "#1A1A1A", color: noItems ? "var(--text-secondary)" : "#FFF", border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: noItems ? "not-allowed" : "pointer" }}>
          + Log Portioning
        </button>
      </div>
      <div style={{ padding: "6px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {runs.length === 0 && !noItems && (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "60px 0", fontSize: 15 }}>No portioning runs yet.</div>
        )}
        {runs.map(r => (
          <div key={r.id} style={{ background: "#FFF", borderRadius: 14, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", borderLeft: "4px solid #7C3AED" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{formatDay(r.date)}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{r.loggedBy}</div>
            </div>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: "var(--text-secondary)" }}>−{r.packsUsed} {RAW_MATERIAL_MAP.get(r.rawItem)?.packLabel ?? "pack"}s</span>
              <span style={{ color: "var(--text-secondary)" }}> · </span>
              <strong>{r.rawItem}</strong>
            </div>
            <div style={{ fontSize: 13, marginTop: 2 }}>
              <span style={{ color: "#7C3AED", fontWeight: 600 }}>→ +{r.portionsProduced} portions</span>
              <span style={{ color: "var(--text-secondary)" }}> · {r.portionedItem}</span>
            </div>
            {r.notes && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>{r.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── New portioning form ───────────────────────────────────────────────────────

function NewPortioningForm({ branch, loggedBy, remainingPacks, onBack }: {
  branch: Branch; loggedBy: string;
  remainingPacks: Record<string, number>;
  onBack: () => void;
}) {
  const [date, setDate] = useState(todayPHT());
  const [rawItem, setRawItem] = useState(RAW_MATERIALS[0]?.name ?? "");
  const [packsUsed, setPacksUsed] = useState(1);
  const [portionsProduced, setPortionsProduced] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const mat = RAW_MATERIAL_MAP.get(rawItem);
  const remaining = remainingPacks[rawItem] ?? 0;
  const expectedPortions = mat?.yieldsPerPack ? packsUsed * mat.yieldsPerPack : null;
  const portionedItem = mat?.portionedItem ?? rawItem;
  const canSubmit = packsUsed > 0 && packsUsed <= remaining && Number(portionsProduced) > 0;

  async function submit() {
    if (!canSubmit) return;
    setLoading(true);
    const id = String(Date.now());
    const run: PortioningRun = {
      id, branch, date, loggedBy, rawItem,
      packsUsed, portionedItem, portionsProduced: Number(portionsProduced),
      notes: notes || undefined,
    };
    await saveDocById(COLS.portioningRuns, id, run as unknown as Record<string, unknown>);
    setLoading(false);
    onBack();
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 90px)" }}>
      <div style={{ background: "#FFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-secondary)", fontSize: 20 }}>←</button>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Log Portioning Run</div>
        </div>
        <div>
          <label style={labelStyle}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, display: "block", width: "100%", boxSizing: "border-box" }} />
        </div>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Raw item selector */}
        <div>
          <label style={labelStyle}>Raw material</label>
          <select value={rawItem} onChange={e => { setRawItem(e.target.value); setPacksUsed(1); setPortionsProduced(""); }}
            style={{ ...inputStyle, display: "block", width: "100%", boxSizing: "border-box" }}>
            {RAW_MATERIALS.map(m => (
              <option key={m.name} value={m.name}>{m.name} — {remainingPacks[m.name] ?? 0} {m.packLabel}s available</option>
            ))}
          </select>
        </div>

        {/* Packs used */}
        <div style={{ background: "#FFF", borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Packs used <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>({remaining} available)</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setPacksUsed(p => Math.max(1, p - 1))} style={qtyBtnStyle}>−</button>
            <input type="number" value={packsUsed}
              onChange={e => setPacksUsed(Math.max(1, Math.min(remaining, Number(e.target.value))))}
              style={{ flex: 1, textAlign: "center", border: `1.5px solid ${packsUsed > remaining ? "#DC2626" : "var(--border)"}`, borderRadius: 8, padding: "10px 4px", fontSize: 20, fontWeight: 700, background: "var(--bg)", color: "var(--text)" }}
            />
            <button onClick={() => setPacksUsed(p => Math.min(remaining, p + 1))} style={qtyBtnStyle}>+</button>
          </div>
          {packsUsed > remaining && (
            <div style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>Exceeds available stock ({remaining} packs)</div>
          )}
        </div>

        {/* Portions produced */}
        <div style={{ background: "#FFF", borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Portions produced</div>
          {expectedPortions && (
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>Expected: ~{expectedPortions} (based on recipe)</div>
          )}
          <input type="number" value={portionsProduced} onChange={e => setPortionsProduced(e.target.value)} placeholder={expectedPortions ? String(expectedPortions) : "Enter count"}
            style={{ width: "100%", border: "1.5px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 20, fontWeight: 700, background: "var(--bg)", color: "var(--text)", boxSizing: "border-box", outline: "none" }}
          />
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>→ {portionedItem}</div>
        </div>

        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2}
          style={{ width: "100%", border: "1.5px solid var(--border)", borderRadius: 10, padding: "10px 12px", fontSize: 14, resize: "none", outline: "none", background: "var(--bg)", color: "var(--text)", boxSizing: "border-box" }}
        />
      </div>

      <div style={{ position: "fixed", bottom: "var(--nav-h)", left: 0, right: 0, background: "#FFF", borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
        <button onClick={submit} disabled={!canSubmit || loading} style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: canSubmit ? "#7C3AED" : "#E8E8E4", color: canSubmit ? "#FFF" : "var(--text-secondary)", fontWeight: 700, fontSize: 16, cursor: canSubmit ? "pointer" : "not-allowed" }}>
          {loading ? "Saving…" : "Save Portioning Run"}
        </button>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "var(--text-secondary)",
  textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--border)", borderRadius: 10, padding: "10px 12px",
  fontSize: 15, background: "var(--bg)", color: "var(--text)", outline: "none",
};
const qtyBtnStyle: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", cursor: "pointer", fontSize: 18, fontWeight: 700,
  color: "#1A1A1A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
};
