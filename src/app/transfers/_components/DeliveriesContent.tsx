"use client";
import { useEffect, useState, useMemo } from "react";
import { BRANCH_LABELS } from "@/lib/auth";
import { CATALOG_MAP } from "@/lib/items";
import { db, COLS, auth, collection, onSnapshot, query, where, writeBatch, doc } from "@/lib/firebase";
import type { Branch, DeliveryNote, DeliveryNoteStatus, ReceivedItem } from "@/lib/types";

type FilterTab = "all" | "in_transit" | "done";

const STATUS_LABEL: Record<DeliveryNoteStatus, string> = {
  IN_TRANSIT:  "In Transit",
  RECEIVED:    "Received",
  DISCREPANCY: "Discrepancy",
};
const STATUS_COLOR: Record<DeliveryNoteStatus, { bg: string; text: string }> = {
  IN_TRANSIT:  { bg: "#DBEAFE", text: "#2563EB" },
  RECEIVED:    { bg: "#D1FAE5", text: "#059669" },
  DISCREPANCY: { bg: "#FEE2E2", text: "#DC2626" },
};

function todayPHT(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function DeliveriesContent({ branch }: { branch: Branch }) {
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [selected, setSelected] = useState<DeliveryNote | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");

  useEffect(() => {
    const q = query(collection(db, COLS.deliveryNotes), where("branch", "==", branch));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => d.data() as DeliveryNote);
      list.sort((a, b) => (b.id > a.id ? 1 : -1));
      setNotes(list);
    });
    return unsub;
  }, [branch]);

  const filtered = useMemo(() => notes.filter(n => {
    if (filter === "in_transit") return n.status === "IN_TRANSIT";
    if (filter === "done")       return ["RECEIVED", "DISCREPANCY"].includes(n.status);
    return true;
  }), [notes, filter]);

  const inTransitCount = notes.filter(n => n.status === "IN_TRANSIT").length;

  if (selected) {
    return (
      <DeliveryDetail
        note={selected} branch={branch}
        onBack={() => setSelected(null)}
        onUpdated={updated => setSelected(updated)}
      />
    );
  }

  return (
    <div>
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid var(--border)", padding: "10px 16px 0" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          {inTransitCount > 0 && (
            <div style={{ background: "#DBEAFE", color: "#2563EB", borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>
              {inTransitCount} in transit
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 4, overflowX: "auto" }}>
          {(["all", "in_transit", "done"] as FilterTab[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "8px 14px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", background: "transparent",
              color: filter === f ? "#1A1A1A" : "var(--text-secondary)",
              borderBottom: filter === f ? "2px solid #1A1A1A" : "2px solid transparent",
              textTransform: "capitalize",
            }}>{f.replace("_", " ")}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "60px 0", fontSize: 15 }}>
            No delivery notes{filter !== "all" ? ` in "${filter.replace("_", " ")}"` : ""}.
          </div>
        )}
        {filtered.map(note => {
          const sc = STATUS_COLOR[note.status];
          return (
            <div key={note.id} onClick={() => setSelected(note)} style={{
              background: "#FFF", borderRadius: 14, padding: "14px 16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)", cursor: "pointer",
              borderLeft: `4px solid ${note.status === "IN_TRANSIT" ? "#2563EB" : note.status === "RECEIVED" ? "#059669" : note.status === "DISCREPANCY" ? "#DC2626" : "#D1D5DB"}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{note.dnRef}</div>
                <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "3px 10px", background: sc.bg, color: sc.text }}>{STATUS_LABEL[note.status]}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>{note.poRef} · {note.items.length} items</div>
              {note.status === "IN_TRANSIT" && <div style={{ fontSize: 12, color: "#2563EB", fontWeight: 600 }}>Tap to confirm receipt →</div>}
              {note.status === "DISCREPANCY" && <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>Discrepancy reported — commissary notified</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeliveryDetail({ note, branch, onBack, onUpdated }: {
  note: DeliveryNote; branch: Branch;
  onBack: () => void;
  onUpdated: (n: DeliveryNote) => void;
}) {
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>(
    Object.fromEntries(note.items.map(i => [i.item, i.dispatchedQty]))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const canConfirm = note.status === "IN_TRANSIT";
  const sc = STATUS_COLOR[note.status];

  const itemsWithDiscrepancy = useMemo(() =>
    note.items.filter(i => receivedQtys[i.item] !== i.dispatchedQty),
    [note.items, receivedQtys]
  );
  const hasDiscrepancy = itemsWithDiscrepancy.length > 0;

  async function confirmReceipt() {
    setLoading(true); setError("");
    try {
      await auth.authStateReady();
      const receivedBy = auth.currentUser?.displayName || BRANCH_LABELS[branch];
      const receivedAt = todayPHT();

      const receivedItems: ReceivedItem[] = note.items.map(i => ({
        item: i.item,
        dispatchedQty: i.dispatchedQty,
        receivedQty: receivedQtys[i.item] ?? i.dispatchedQty,
        unit: i.unit,
      }));

      const newStatus: DeliveryNoteStatus = hasDiscrepancy ? "DISCREPANCY" : "RECEIVED";

      const batch = writeBatch(db);
      batch.update(doc(db, COLS.deliveryNotes, note.id), { status: newStatus, receivedItems, receivedAt, receivedBy });
      batch.update(doc(db, COLS.pullOuts, note.pullOutId), { status: newStatus });
      await batch.commit();

      onUpdated({ ...note, status: newStatus, receivedItems, receivedAt, receivedBy });
    } catch {
      setError("Failed to confirm receipt. Try again.");
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 100px)" }}>
      <div style={{ background: "#FFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-secondary)", fontSize: 20 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{note.dnRef}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{note.poRef}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "4px 10px", background: sc.bg, color: sc.text }}>{STATUS_LABEL[note.status]}</span>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {error && (
          <div style={{ background: "#FEF2F2", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#DC2626" }}>{error}</div>
        )}
        {canConfirm && (
          <div style={{ background: "#EFF6FF", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#1D4ED8" }}>
            Verify each quantity received. Adjust if the actual count differs.
          </div>
        )}
        {note.status === "DISCREPANCY" && (
          <div style={{ background: "#FEF2F2", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#DC2626" }}>
            Discrepancy reported. Commissary has been notified.
          </div>
        )}
        {note.items.map(item => {
          const received = receivedQtys[item.item] ?? item.dispatchedQty;
          const isDiff = received !== item.dispatchedQty;
          const ri = note.receivedItems?.find(r => r.item === item.item);
          const displayQty = canConfirm ? null : (ri?.receivedQty ?? item.dispatchedQty);
          const displayDiff = displayQty !== null ? displayQty - item.dispatchedQty : 0;

          return (
            <div key={item.item} style={{
              background: "#FFF", borderRadius: 12, padding: "12px 14px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              borderLeft: (canConfirm && isDiff) || (!canConfirm && displayDiff !== 0) ? "4px solid #DC2626" : "4px solid transparent",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{item.item}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    {CATALOG_MAP.get(item.item)?.packSize ?? "1 pc"} · Dispatched: <strong>{item.dispatchedQty}</strong>
                    {!canConfirm && displayQty !== null && displayQty !== item.dispatchedQty && (
                      <span> · Received: <strong style={{ color: "#DC2626" }}>{displayQty} {item.unit}</strong></span>
                    )}
                    {!canConfirm && displayQty !== null && displayQty === item.dispatchedQty && (
                      <span> · Received: <strong style={{ color: "#059669" }}>{displayQty} {item.unit}</strong></span>
                    )}
                  </div>
                </div>
                {canConfirm ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      onClick={() => setReceivedQtys(p => ({ ...p, [item.item]: Math.max(0, (p[item.item] ?? item.dispatchedQty) - 1) }))}
                      style={qtyBtnStyle}
                    >−</button>
                    <input type="number" value={received}
                      onChange={e => setReceivedQtys(p => ({ ...p, [item.item]: Math.max(0, Number(e.target.value)) }))}
                      style={{ width: 56, textAlign: "center", border: `1.5px solid ${isDiff ? "#DC2626" : "var(--border)"}`, borderRadius: 8, padding: "6px 4px", fontSize: 16, fontWeight: 700, background: isDiff ? "#FEF2F2" : "var(--bg)", color: "var(--text)" }}
                    />
                    <button
                      onClick={() => setReceivedQtys(p => ({ ...p, [item.item]: (p[item.item] ?? item.dispatchedQty) + 1 }))}
                      style={qtyBtnStyle}
                    >+</button>
                  </div>
                ) : (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 18, color: displayDiff !== 0 ? "#DC2626" : "var(--text)" }}>{displayQty ?? item.dispatchedQty}</div>
                    {displayDiff !== 0 && (
                      <div style={{ fontSize: 11, color: "#DC2626", fontWeight: 600 }}>{displayDiff > 0 ? `+${displayDiff}` : displayDiff} vs expected</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {canConfirm && (
        <div style={{ position: "fixed", bottom: "var(--nav-h)", left: 0, right: 0, background: "#FFF", borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
          {hasDiscrepancy && (
            <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600, marginBottom: 8 }}>
              {itemsWithDiscrepancy.length} item{itemsWithDiscrepancy.length > 1 ? "s" : ""} with discrepancy — commissary will be notified.
            </div>
          )}
          <button onClick={confirmReceipt} disabled={loading} style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: hasDiscrepancy ? "#DC2626" : "#059669", color: "#FFF", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
            {loading ? "Saving…" : hasDiscrepancy ? "Confirm Receipt with Discrepancy" : "Confirm Receipt — All Good"}
          </button>
        </div>
      )}
    </div>
  );
}

const qtyBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", cursor: "pointer", fontSize: 18, fontWeight: 700,
  color: "#1A1A1A", display: "flex", alignItems: "center", justifyContent: "center",
};
