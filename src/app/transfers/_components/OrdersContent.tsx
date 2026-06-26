"use client";
import { useState, useMemo, useEffect } from "react";
import { BRANCH_LABELS } from "@/lib/auth";
import { CATALOG, CATALOG_MAP, stockDocId } from "@/lib/items";
import { db, COLS, auth, saveDocById, collection, query, where, getDocs, writeBatch, doc, increment } from "@/lib/firebase";
import { getDoc } from "firebase/firestore";
import type { Branch, PullOut, PullOutItem, DeliveryNote, ReceivedItem, ParLevelItem } from "@/lib/types";
import { isIncomplete, fulfillmentPct } from "../_lib/helpers";
import { generateBranchDR } from "../_lib/print";
import { businessDatePHT } from "@/app/stock/_lib/helpers";

// ── helpers ───────────────────────────────────────────────────────────────────

function todayPHT(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function formatDay(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "short", month: "short", day: "numeric",
  });
}
function genPORef(branch: Branch, date: string, seq: number): string {
  return `PO-${date.slice(2, 4)}-${date.slice(5, 7)}${date.slice(8, 10)}-${branch}${String(seq).padStart(3, "0")}`;
}

// ── status helpers ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  PENDING_REVIEW: "Submitted",
  DISPATCHED:     "Dispatched",
  RECEIVED:       "Received",
  REJECTED:       "Rejected",
  CANCELLED:      "Cancelled",
  DISCREPANCY:    "Discrepancy",
  DISPUTED:       "Disputed",
  DONE:           "Received",
  SENT_BACK:      "Sent Back",
  RESOLVED:       "Resolved",
};

function statusBadgeStyle(status: string): React.CSSProperties {
  const map: Record<string, { bg: string; text: string }> = {
    PENDING_REVIEW: { bg: "#FEF3C7", text: "#D97706" },
    DISPATCHED:     { bg: "#E0E7FF", text: "#4338CA" },
    RECEIVED:       { bg: "#D1FAE5", text: "#059669" },
    DONE:           { bg: "#D1FAE5", text: "#059669" },
    REJECTED:       { bg: "#FEE2E2", text: "#DC2626" },
    CANCELLED:      { bg: "#F3F4F6", text: "#6B7280" },
    DISCREPANCY:    { bg: "#FEF3C7", text: "#D97706" },
    DISPUTED:       { bg: "#EDE9FE", text: "#7C3AED" },
    SENT_BACK:      { bg: "#FFF7ED", text: "#C2410C" },
    RESOLVED:       { bg: "#D1FAE5", text: "#059669" },
  };
  const s = map[status] ?? { bg: "#F3F4F6", text: "#6B7280" };
  return {
    fontSize: 11, fontWeight: 600, borderRadius: 20,
    padding: "3px 10px", background: s.bg, color: s.text,
  };
}

function cardBorderColor(status: string): string {
  if (status === "PENDING_REVIEW") return "#D97706";
  if (status === "DISPATCHED")     return "#4338CA";
  if (status === "RECEIVED" || status === "DONE") return "#059669";
  if (["DISCREPANCY", "REJECTED", "DISPUTED", "SENT_BACK"].includes(status)) return "#DC2626";
  return "#D1D5DB";
}

// ── shared qty button style ───────────────────────────────────────────────────

const qtyBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", cursor: "pointer", fontSize: 18, fontWeight: 700,
  color: "#1A1A1A", display: "flex", alignItems: "center", justifyContent: "center",
};

// ── OrdersContent ─────────────────────────────────────────────────────────────

type View = "list" | "detail" | "new";

interface Props {
  tab:           "pending" | "active" | "history";
  pullOuts:      PullOut[];
  deliveryNotes: DeliveryNote[];
  branch:        Branch;
  canOrder:      boolean;
}

export function OrdersContent({ tab, pullOuts, deliveryNotes, branch, canOrder }: Props) {
  const [view,     setView]     = useState<View>("list");
  const [selected, setSelected] = useState<PullOut | null>(null);

  useEffect(() => {
    setView("list");
    setSelected(null);
  }, [tab]);

  const pending = useMemo(() =>
    [...pullOuts.filter(p => p.status === "PENDING_REVIEW")]
      .sort((a, b) => b.id.localeCompare(a.id)),
  [pullOuts]);
  const active  = useMemo(() =>
    [...pullOuts.filter(p => ["DISPATCHED", "DISCREPANCY"].includes(p.status))]
      .sort((a, b) => b.id.localeCompare(a.id)),
  [pullOuts]);
  const history = useMemo(() =>
    [...pullOuts.filter(p =>
      ["RECEIVED", "DONE", "CANCELLED", "REJECTED", "DISPUTED", "SENT_BACK", "RESOLVED"].includes(p.status)
    )].sort((a, b) => b.id.localeCompare(a.id)),
  [pullOuts]);

  const list = tab === "pending" ? pending : tab === "active" ? active : history;

  function openDetail(po: PullOut) { setSelected(po); setView("detail"); }
  function goBack()                { setSelected(null); setView("list"); }

  if (view === "new") {
    return <NewOrderForm branch={branch} onBack={goBack} />;
  }

  if (view === "detail" && selected) {
    if (selected.status === "PENDING_REVIEW") {
      return (
        <PendingDetail
          po={selected}
          onBack={goBack}
          onUpdated={updated => setSelected(updated)}
        />
      );
    }
    if (selected.status === "DISPATCHED") {
      const dn = deliveryNotes.find(d => d.pullOutId === selected.id) ?? null;
      return (
        <ActiveDetail
          po={selected}
          dn={dn}
          branch={branch}
          onBack={goBack}
          onUpdated={updated => setSelected(updated)}
        />
      );
    }
    if (selected.status === "DISCREPANCY") {
      const dn = deliveryNotes.find(d => d.pullOutId === selected.id) ?? null;
      return (
        <DiscrepancyDetail
          po={selected}
          dn={dn}
          branch={branch}
          onBack={goBack}
          onUpdated={updated => setSelected(updated)}
        />
      );
    }
    const dn = deliveryNotes.find(d => d.pullOutId === selected.id) ?? null;
    return <HistoryDetail po={selected} dn={dn} onBack={goBack} />;
  }

  // ── list view ──────────────────────────────────────────────────────────────

  return (
    <div>
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {list.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "60px 0", fontSize: 15 }}>
            No {tab} orders.
          </div>
        )}
        {list.map(po => {
          const dn = tab === "pending"
            ? undefined
            : deliveryNotes.find(d => d.pullOutId === po.id);
          const incomplete = dn ? isIncomplete(dn) : false;
          const pct        = dn && incomplete ? fulfillmentPct(dn) : 100;
          return (
            <div
              key={po.id}
              onClick={() => openDetail(po)}
              style={{
                background: "#FFF", borderRadius: 14, padding: "14px 16px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)", cursor: "pointer",
                borderLeft: `4px solid ${cardBorderColor(po.status)}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{po.poRef}</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {incomplete && (
                    <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "3px 10px", background: "#FEF3C7", color: "#D97706" }}>
                      Incomplete
                    </span>
                  )}
                  <span style={statusBadgeStyle(po.status)}>{STATUS_LABEL[po.status]}</span>
                </div>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {tab === "history" && dn?.dnRef ? dn.dnRef : formatDay(po.requestedAt)}
                {" · "}{po.items.length} item{po.items.length !== 1 ? "s" : ""}
                {incomplete ? ` · ${pct}% fulfilled` : ""}
              </div>
              {tab === "active" && (
                <div style={{ marginTop: 6 }}>
                  {po.status === "DISCREPANCY" ? (
                    <div style={{ fontSize: 12, color: "#D97706", fontWeight: 600 }}>
                      Dispute filed — pending commissary review
                    </div>
                  ) : dn ? (
                    <>
                      <div style={{ fontSize: 12, color: "#4338CA", fontWeight: 600 }}>{dn.dnRef}</div>
                      <div style={{ fontSize: 12, color: "#4338CA" }}>Tap to confirm receipt →</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Awaiting delivery note…</div>
                  )}
                </div>
              )}
              {tab === "history" && po.status === "DISPUTED" && (
                <div style={{ marginTop: 6, fontSize: 12, color: "#7C3AED", fontWeight: 600 }}>
                  Escalated — pending admin decision
                </div>
              )}
            </div>
          );
        })}
      </div>

      {tab !== "history" && canOrder && (
        <button
          onClick={() => setView("new")}
          style={{
            position: "fixed", bottom: "calc(var(--nav-h) + 20px)", right: 20,
            width: 56, height: 56, borderRadius: "50%", border: "none",
            background: "#1A1A1A", color: "#FFF", fontSize: 28, fontWeight: 300,
            cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30,
          }}
          aria-label="New order"
        >+</button>
      )}
    </div>
  );
}

// ── PendingDetail ─────────────────────────────────────────────────────────────

function PendingDetail({ po, onBack, onUpdated }: {
  po: PullOut;
  onBack: () => void;
  onUpdated: (po: PullOut) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function cancelPO() {
    setLoading(true); setError("");
    try {
      await auth.authStateReady();
      const batch = writeBatch(db);
      batch.update(doc(db, COLS.pullOuts, po.id), { status: "CANCELLED" });
      await batch.commit();
      onUpdated({ ...po, status: "CANCELLED" });
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
        <span style={statusBadgeStyle(po.status)}>{STATUS_LABEL[po.status]}</span>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {error && (
          <div style={{ background: "#FEF2F2", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#DC2626" }}>{error}</div>
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
        {po.notes && (
          <div style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "var(--text-secondary)" }}>
            Note: {po.notes}
          </div>
        )}
        <button
          onClick={cancelPO}
          disabled={loading}
          style={{ marginTop: 4, padding: "14px 0", borderRadius: 12, border: "1.5px solid #FCA5A5", background: "#FFF", color: "#DC2626", fontWeight: 600, fontSize: 15, cursor: "pointer", width: "100%" }}
        >
          {loading ? "Cancelling…" : "Cancel Request"}
        </button>
      </div>
    </div>
  );
}

// ── ActiveDetail ──────────────────────────────────────────────────────────────

function ActiveDetail({ po, dn, branch, onBack, onUpdated }: {
  po: PullOut;
  dn: DeliveryNote | null;
  branch: Branch;
  onBack: () => void;
  onUpdated: (po: PullOut) => void;
}) {
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>(
    dn ? Object.fromEntries(dn.items.map(i => [i.item, i.dispatchedQty])) : {}
  );
  useEffect(() => {
    if (dn) {
      setReceivedQtys(Object.fromEntries(dn.items.map(i => [i.item, i.dispatchedQty])));
    }
  }, [dn?.id]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [showReview,   setShowReview]   = useState(false);

  function toggleChecked(itemName: string) {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemName)) next.delete(itemName); else next.add(itemName);
      return next;
    });
  }

  const itemsWithDiscrepancy = dn
    ? dn.items.filter(i => receivedQtys[i.item] !== i.dispatchedQty)
    : [];
  const hasDiscrepancy = itemsWithDiscrepancy.length > 0;

  async function confirmReceipt() {
    if (!dn) return;
    setLoading(true); setError("");
    try {
      await auth.authStateReady();
      const receivedBy = auth.currentUser?.displayName || BRANCH_LABELS[branch];
      const receivedAt = todayPHT();
      const receivedItems: ReceivedItem[] = dn.items.map(i => ({
        item:          i.item,
        dispatchedQty: i.dispatchedQty,
        receivedQty:   receivedQtys[i.item] ?? i.dispatchedQty,
        unit:          i.unit,
      }));
      const newStatus = hasDiscrepancy ? "DISCREPANCY" : "RECEIVED";
      const batch = writeBatch(db);
      batch.update(doc(db, COLS.deliveryNotes, dn.id), { status: newStatus, receivedItems, receivedAt, receivedBy });
      batch.update(doc(db, COLS.pullOuts, po.id), { status: newStatus });

      for (const ri of receivedItems) {
        const catalogItem = CATALOG_MAP.get(ri.item);
        if (!catalogItem || ri.receivedQty <= 0) continue;
        const dept = catalogItem.department;
        batch.set(
          doc(db, COLS.branchStock, stockDocId(branch, dept, ri.item)),
          { qty: increment(ri.receivedQty), lastUpdated: receivedAt, lastUpdatedBy: receivedBy },
          { merge: true },
        );
        const adjRef = doc(collection(db, COLS.adjustments));
        batch.set(adjRef, {
          id: adjRef.id, branch, department: dept, date: receivedAt,
          item: ri.item, type: "in", qty: ri.receivedQty, loggedBy: receivedBy,
          note: "commissary transfer",
        });
      }

      await batch.commit();
      onUpdated({ ...po, status: newStatus as PullOut["status"] });
      onBack();
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
          <div style={{ fontWeight: 700, fontSize: 16 }}>{po.poRef}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{dn?.dnRef ?? "Awaiting delivery note"}</div>
        </div>
        <span style={statusBadgeStyle(po.status)}>{STATUS_LABEL[po.status]}</span>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {error && (
          <div style={{ background: "#FEF2F2", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#DC2626" }}>{error}</div>
        )}
        {!dn && (
          <div style={{ background: "#EFF6FF", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#1D4ED8" }}>
            Delivery note not yet available. Check back shortly.
          </div>
        )}
        {dn && (
          <>
            <div style={{ background: "#EFF6FF", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#1D4ED8" }}>
              Verify each quantity received. Adjust if the actual count differs.
            </div>
            <div style={{ background: "#FFF", borderRadius: 10, padding: "10px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, color: "#555", fontWeight: 500 }}>Items checked</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>
                {checkedItems.size} <span style={{ color: "#888", fontWeight: 400 }}>of {dn.items.length}</span>
              </div>
            </div>
            {dn.items.map(item => {
              const received   = receivedQtys[item.item] ?? item.dispatchedQty;
              const isDiff     = received !== item.dispatchedQty;
              const isChecked  = checkedItems.has(item.item);
              const rowBg      = isChecked && isDiff ? "#FFF5F5" : isChecked ? "#F0FDF4" : "#FFF";
              const rowBorder  = isDiff ? "4px solid #DC2626" : isChecked ? "4px solid #059669" : "4px solid transparent";
              return (
                <div key={item.item} style={{ background: rowBg, borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", borderLeft: rowBorder }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button
                      onClick={() => toggleChecked(item.item)}
                      aria-label={isChecked ? "Uncheck item" : "Check item"}
                      style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                        border: `2px solid ${isChecked ? "#059669" : "#D1D5DB"}`,
                        background: isChecked ? "#059669" : "transparent",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        padding: 0, marginRight: 10,
                      }}
                    >
                      {isChecked && (
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={3}>
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{item.item}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                        {CATALOG_MAP.get(item.item)?.packSize ?? "1 pc"}
                        {item.dispatchedQty < item.requestedQty ? (
                          <>
                            {" · "}
                            <span>Ordered: {item.requestedQty}</span>
                            {" "}
                            <span style={{ color: "#D97706", fontWeight: 600 }}>→ Dispatched: {item.dispatchedQty}</span>
                          </>
                        ) : (
                          <> · Dispatched: <strong>{item.dispatchedQty}</strong></>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: isChecked && !isDiff ? 0.45 : 1 }}>
                      <button
                        onClick={() => setReceivedQtys(p => ({ ...p, [item.item]: Math.max(0, (p[item.item] ?? item.dispatchedQty) - 1) }))}
                        style={qtyBtnStyle}
                      >−</button>
                      <input
                        type="number"
                        value={received}
                        onChange={e => setReceivedQtys(p => ({ ...p, [item.item]: Math.max(0, Number(e.target.value)) }))}
                        style={{ width: 56, textAlign: "center", border: `1.5px solid ${isDiff ? "#DC2626" : "var(--border)"}`, borderRadius: 8, padding: "6px 4px", fontSize: 16, fontWeight: 700, background: isDiff ? "#FEF2F2" : "var(--bg)", color: "var(--text)" }}
                      />
                      <button
                        onClick={() => setReceivedQtys(p => ({ ...p, [item.item]: (p[item.item] ?? item.dispatchedQty) + 1 }))}
                        style={qtyBtnStyle}
                      >+</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {dn && (
        <div style={{ position: "fixed", bottom: "var(--nav-h)", left: 0, right: 0, background: "#FFF", borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
          {hasDiscrepancy && (
            <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600, marginBottom: 8 }}>
              {itemsWithDiscrepancy.length} item{itemsWithDiscrepancy.length > 1 ? "s" : ""} with discrepancy — commissary will be notified.
            </div>
          )}
          <button
            onClick={() => setShowReview(true)}
            style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: hasDiscrepancy ? "#DC2626" : "#059669", color: "#FFF", fontWeight: 700, fontSize: 16, cursor: "pointer" }}
          >
            {hasDiscrepancy ? "Confirm Receipt with Discrepancy" : "Confirm Receipt — All Good"}
          </button>
        </div>
      )}

      {showReview && dn && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "#FFF", overflowY: "auto", display: "flex", flexDirection: "column" }}>

          <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)", background: "#FFF", position: "sticky", top: 0, zIndex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Review & Confirm</div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            <div style={{ background: "#FFF", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>

              <div style={{ background: hasDiscrepancy ? "#DC2626" : "#059669", padding: "14px 16px", color: "#FFF" }}>
                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 2 }}>You are confirming receipt of</div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{po.poRef}</div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                  {dn.dnRef} · {dn.items.length} item{dn.items.length !== 1 ? "s" : ""}
                  {hasDiscrepancy ? ` · ${itemsWithDiscrepancy.length} discrepancy` : ""}
                </div>
              </div>

              <div style={{ padding: "4px 0" }}>
                {dn.items.map((item, idx) => {
                  const receivedQty = receivedQtys[item.item] ?? item.dispatchedQty;
                  const isDisc      = receivedQty !== item.dispatchedQty;
                  return (
                    <div
                      key={item.item}
                      style={{
                        background:   isDisc ? "#FEF2F2" : "#FFF",
                        borderLeft:   isDisc ? "3px solid #DC2626" : "3px solid transparent",
                        padding:      "11px 16px",
                        borderBottom: idx < dn.items.length - 1 ? "1px solid #F3F3F0" : "none",
                        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{item.item}</div>
                        {isDisc && (
                          <div style={{ fontSize: 11, color: "#DC2626", fontWeight: 500, marginTop: 2 }}>
                            Expected {item.dispatchedQty} · received {receivedQty}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: isDisc ? "#DC2626" : "var(--text)" }}>
                          {receivedQty}{" "}
                          <span style={{ fontWeight: 400, fontSize: 12, color: isDisc ? "#DC2626" : "#888" }}>{item.unit}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ background: hasDiscrepancy ? "#FEF2F2" : "#F0FDF4", padding: "10px 16px", fontSize: 12, color: hasDiscrepancy ? "#DC2626" : "#059669", fontWeight: 500, borderTop: "1px solid var(--border)" }}>
                {hasDiscrepancy ? "Commissary will be notified of the discrepancy." : "✓ All quantities match dispatch"}
              </div>
            </div>

            <div style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", marginTop: 14 }}>
              Stock will be added to your inventory once submitted.
            </div>
          </div>

          <div style={{ padding: "12px 16px calc(var(--nav-h) + 12px)", background: "#FFF", borderTop: "1px solid var(--border)" }}>
            {error && (
              <div style={{ background: "#FEF2F2", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#DC2626", marginBottom: 8 }}>{error}</div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowReview(false)}
                style={{ flex: 1, padding: "15px 0", borderRadius: 14, border: "1.5px solid var(--border)", background: "#FFF", color: "var(--text)", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
              >
                Back
              </button>
              <button
                onClick={confirmReceipt}
                disabled={loading}
                style={{ flex: 2, padding: "15px 0", borderRadius: 14, border: "none", background: hasDiscrepancy ? "#DC2626" : "#059669", color: "#FFF", fontWeight: 700, fontSize: 15, cursor: loading ? "not-allowed" : "pointer" }}
              >
                {loading ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── DiscrepancyDetail ─────────────────────────────────────────────────────────

function DiscrepancyDetail({ po, dn, branch, onBack, onUpdated }: {
  po: PullOut;
  dn: DeliveryNote | null;
  branch: Branch;
  onBack: () => void;
  onUpdated: (po: PullOut) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const discrepancyItems = dn
    ? dn.items.filter(i => {
        const ri = dn.receivedItems?.find(r => r.item === i.item);
        return ri && ri.receivedQty !== i.dispatchedQty;
      })
    : [];

  async function cancelDispute() {
    if (!dn) return;
    setLoading(true); setError("");
    try {
      await auth.authStateReady();
      const loggedBy = auth.currentUser?.displayName || BRANCH_LABELS[branch];
      const today    = todayPHT();
      const now      = Date.now();
      const poRef    = `${po.poRef} · ${dn.dnRef}`;
      const batchW   = writeBatch(db);

      dn.items.forEach((it, i) => {
        batchW.set(doc(db, COLS.invEntries, String(now + i)), {
          id: now + i, date: today, item: it.item, type: "out",
          qty: it.dispatchedQty,
          note: `Transfer to ${po.branch} · ${poRef} · branch cancelled dispute`,
          loggedBy, poRef: po.poRef,
        });
      });

      dn.items.forEach(it => {
        const ri    = dn.receivedItems?.find(r => r.item === it.item);
        const recv  = ri?.receivedQty ?? it.dispatchedQty;
        const delta = it.dispatchedQty - recv;
        if (delta === 0) return;
        const adjRef = doc(collection(db, COLS.adjustments));
        batchW.set(adjRef, {
          id: adjRef.id, branch, department: "kitchen", date: today,
          item: it.item, type: delta > 0 ? "in" : "out", qty: Math.abs(delta),
          loggedBy, note: `Dispute cancelled · ${po.poRef}`,
        });
        const catalogItem = CATALOG_MAP.get(it.item);
        if (catalogItem) {
          batchW.set(
            doc(db, COLS.branchStock, `${branch}_${catalogItem.department}_${it.item}`),
            { qty: increment(delta), lastUpdated: today, lastUpdatedBy: loggedBy },
            { merge: true },
          );
        }
      });

      batchW.update(doc(db, COLS.deliveryNotes, dn.id), { status: "RECEIVED" });
      batchW.update(doc(db, COLS.pullOuts, po.id), { status: "DONE", commissaryInvWritten: true });
      await batchW.commit();
      onUpdated({ ...po, status: "DONE" as PullOut["status"] });
      onBack();
    } catch {
      setError("Failed to cancel dispute. Try again.");
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 100px)" }}>
      <div style={{ background: "#FFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-secondary)", fontSize: 20 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{po.poRef}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{dn?.dnRef ?? "No delivery note"}</div>
        </div>
        <span style={statusBadgeStyle(po.status)}>{STATUS_LABEL[po.status]}</span>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {error && (
          <div style={{ background: "#FEF2F2", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#DC2626" }}>{error}</div>
        )}

        <div style={{ background: "#FEF3C7", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#D97706" }}>
          Dispute filed — commissary has been notified and is reviewing the quantities.
        </div>

        {discrepancyItems.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", padding: "4px 2px", marginTop: 4 }}>
              Items with discrepancy
            </div>
            {discrepancyItems.map(item => {
              const ri = dn!.receivedItems?.find(r => r.item === item.item);
              return (
                <div key={item.item} style={{ background: "#FEF2F2", borderRadius: 12, padding: "12px 14px", borderLeft: "4px solid #DC2626", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{item.item}</div>
                    <div style={{ fontSize: 11, color: "#DC2626", marginTop: 2 }}>
                      Dispatched: {item.dispatchedQty} · You received: {ri?.receivedQty ?? "—"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 18, color: "#DC2626" }}>{ri?.receivedQty ?? "—"}</div>
                    <div style={{ fontSize: 11, color: "#DC2626" }}>{item.unit}</div>
                  </div>
                </div>
              );
            })}
            <div style={{ borderBottom: "1px solid var(--border)", margin: "4px 0" }} />
          </>
        )}

        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", padding: "4px 2px" }}>
          All items received
        </div>
        {po.items.map(item => {
          const dnItem     = dn?.items.find(i => i.item === item.item);
          const ri         = dn?.receivedItems?.find(r => r.item === item.item);
          const isDisc     = ri && ri.receivedQty !== dnItem?.dispatchedQty;
          const dispatched = dnItem?.dispatchedQty;
          const received   = ri?.receivedQty ?? dispatched ?? item.qty;
          return (
            <div key={item.item} style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.item}</div>
                {dispatched !== undefined && (
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                    Dispatched: {dispatched}
                    {isDisc && <span style={{ color: "#DC2626", fontWeight: 600, marginLeft: 4 }}>· Received: {ri!.receivedQty}</span>}
                    {!isDisc && ri && <span style={{ color: "#059669", marginLeft: 4 }}>· Received: {ri.receivedQty}</span>}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: isDisc ? "#DC2626" : "var(--text)" }}>{received}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{item.unit}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ position: "fixed", bottom: "var(--nav-h)", left: 0, right: 0, background: "#FFF", borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
        <button
          onClick={cancelDispute}
          disabled={loading}
          style={{
            width: "100%", padding: "14px 0", borderRadius: 14,
            border: "1px solid var(--border)", background: "transparent",
            color: "var(--text-secondary)", fontWeight: 600,
            fontSize: 14, cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Cancelling…" : "Cancel Dispute — Accept Dispatched Quantities"}
        </button>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "center", marginTop: 6 }}>
          Confirms commissary was correct. Adjusts your stock to match dispatched quantities.
        </div>
      </div>
    </div>
  );
}

// ── HistoryDetail ─────────────────────────────────────────────────────────────

function HistoryDetail({ po, dn, onBack }: {
  po: PullOut;
  dn: DeliveryNote | null;
  onBack: () => void;
}) {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 24px)" }}>
      <div style={{ background: "#FFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-secondary)", fontSize: 20 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{po.poRef}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {formatDay(po.requestedAt)}{dn ? ` · ${dn.dnRef}` : ""}
          </div>
        </div>
        <span style={statusBadgeStyle(po.status)}>{STATUS_LABEL[po.status]}</span>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {["DISCREPANCY", "DISPUTED"].includes(po.status) && (
          <div style={{ background: "#FEF3C7", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#D97706" }}>
            Discrepancy on file — place a new order if replacement is needed.
          </div>
        )}
        {po.items.map(item => {
          const dnItem     = dn?.items.find(i => i.item === item.item);
          const ri         = dn?.receivedItems?.find(r => r.item === item.item);
          const dispatched = dnItem?.dispatchedQty;
          const requested  = dnItem?.requestedQty;
          const isShort    = dispatched !== undefined && requested !== undefined && dispatched < requested;
          return (
            <div key={item.item} style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.item}</div>
                {dispatched !== undefined && (
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                    {isShort ? (
                      <>
                        <span>Ordered: {requested}</span>
                        <span style={{ color: "#D97706", fontWeight: 600, marginLeft: 4 }}>→ Dispatched: {dispatched}</span>
                      </>
                    ) : (
                      <span>Dispatched: {dispatched}</span>
                    )}
                    {ri && ri.receivedQty !== dispatched && (
                      <span style={{ color: "#DC2626", marginLeft: 4 }}>· Received: {ri.receivedQty}</span>
                    )}
                    {ri && ri.receivedQty === dispatched && (
                      <span style={{ color: "#059669", marginLeft: 4 }}>· Received: {ri.receivedQty}</span>
                    )}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{ri?.receivedQty ?? dispatched ?? item.qty}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{item.unit}</div>
              </div>
            </div>
          );
        })}
        {po.notes && (
          <div style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "var(--text-secondary)" }}>
            Note: {po.notes}
          </div>
        )}
        {dn && (dn.status === "RECEIVED" || dn.status === "DISCREPANCY") && dn.receivedItems && (
          <button
            onClick={() => generateBranchDR({
              poRef:         po.poRef,
              dnRef:         dn.dnRef,
              branch:        dn.branch,
              dispatchedAt:  dn.dispatchedAt,
              receivedAt:    dn.receivedAt ?? "",
              dispatchedBy:  dn.dispatchedBy,
              receivedBy:    dn.receivedBy ?? "",
              items: dn.items.map(i => {
                const ri = dn.receivedItems!.find(r => r.item === i.item);
                return {
                  item:          i.item,
                  requestedQty:  i.requestedQty,
                  dispatchedQty: i.dispatchedQty,
                  receivedQty:   ri?.receivedQty ?? i.dispatchedQty,
                  unit:          i.unit,
                };
              }),
            })}
            style={{
              width: "100%", padding: "14px 0", borderRadius: 12,
              border: "none", background: "#1A1A1A",
              color: "#FFF", fontWeight: 600, fontSize: 15, cursor: "pointer",
            }}
          >
            Reprint DR
          </button>
        )}
      </div>
    </div>
  );
}

// ── NewOrderForm ──────────────────────────────────────────────────────────────

interface StockContext {
  currentStock: number;
  parLevel: number;
  source: "count" | "expected" | "stock";
}

function NewOrderForm({ branch, onBack }: { branch: Branch; onBack: () => void }) {
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map());
  const [stockCtx,    setStockCtx]    = useState<Map<string, StockContext>>(new Map());
  const [loadingStock, setLoadingStock] = useState(true);
  const [search,      setSearch]      = useState("");
  const [showReview,  setShowReview]  = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  const branchItems = useMemo(
    () => CATALOG.filter(i => i.commissary && (!i.branches || i.branches.includes(branch))),
    [branch]
  );
  const availableItems = useMemo(
    () => branchItems.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase())),
    [branchItems, search]
  );

  // ── auto-fill on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    async function prefill() {
      try {
      await auth.authStateReady();
      const today = businessDatePHT();

      // fetch par level overrides, today's beginning stock, and today's adjustments in parallel
      const [parSnap, beginSnap, adjSnap] = await Promise.all([
        getDoc(doc(db, "parLevelSettings", branch)),
        getDocs(query(collection(db, COLS.dailyBeginning), where("branch", "==", branch), where("date", "==", today))),
        getDocs(query(
          collection(db, COLS.adjustments),
          where("branch", "==", branch),
          where("date", "==", today),
        )),
      ]);

      const parOverrides: Record<string, ParLevelItem> = parSnap.exists()
        ? (parSnap.data().items ?? {})
        : {};

      // dailyBeginning = yesterday's end, stable throughout the day (matches EXP calculation)
      const beginMap = new Map<string, number>();
      beginSnap.forEach(d => {
        const data = d.data();
        beginMap.set(data.item as string, data.qty as number);
      });

      // build adjustment maps for today
      const inMap    = new Map<string, number>();
      const outMap   = new Map<string, number>();
      const countMap = new Map<string, number>(); // item → endCount from today's stocktake
      adjSnap.forEach(d => {
        const data = d.data();
        const name = data.item as string;
        const qty  = data.qty  as number;
        const type = data.type as string;
        if (type === "count") {
          countMap.set(name, qty);
        } else if (type === "in") {
          inMap.set(name, (inMap.get(name) ?? 0) + qty);
        } else if (["out", "waste", "sales_import"].includes(type)) {
          outMap.set(name, (outMap.get(name) ?? 0) + qty);
        }
      });

      const autoSelected = new Map<string, number>();
      const ctx          = new Map<string, StockContext>();

      for (const item of branchItems) {
        // resolve current stock for all items — mirrors the EXP formula used in the stock page
        let currentStock: number;
        let source: StockContext["source"];
        if (countMap.has(item.name)) {
          currentStock = countMap.get(item.name)!;
          source = "count";
        } else {
          const beginning = beginMap.get(item.name) ?? 0;
          const inQty     = inMap.get(item.name)    ?? 0;
          const outQty    = outMap.get(item.name)   ?? 0;
          currentStock = beginning + inQty - outQty;
          source = inQty > 0 || outQty > 0 ? "expected" : "stock";
        }

        // resolve par level: Firestore override → catalog parLevel → catalog reorderAt
        const override = parOverrides[item.name];
        const parLevel = override?.parLevel ?? item.parLevel ?? item.reorderAt;

        ctx.set(item.name, { currentStock, parLevel, source });

        // packs are never auto-selected — team fills manually
        if (item.unit === "pack") continue;

        const gap = parLevel - currentStock;
        if (gap > 0) {
          autoSelected.set(item.name, Math.ceil(gap / 5) * 5);
        }
      }

      setStockCtx(ctx);
      setSelectedItems(autoSelected);
      } finally {
        setLoadingStock(false);
      }
    }

    prefill();
  }, [branch, branchItems]);

  // ── selection helpers ───────────────────────────────────────────────────────
  function toggleItem(name: string) {
    setSelectedItems(prev => {
      const n = new Map(prev);
      if (n.has(name)) {
        n.delete(name);
      } else {
        // default to suggested if available, else 1
        const ctx = stockCtx.get(name);
        const gap = ctx ? ctx.parLevel - ctx.currentStock : 0;
        n.set(name, gap > 0 ? Math.ceil(gap / 5) * 5 : 1);
      }
      return n;
    });
  }
  function setQty(name: string, qty: number) {
    if (qty <= 0) {
      setSelectedItems(prev => { const n = new Map(prev); n.delete(name); return n; });
    } else {
      setSelectedItems(prev => new Map(prev).set(name, qty));
    }
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
      };
      await saveDocById(COLS.pullOuts, po.id, po as unknown as Record<string, unknown>);
      onBack();
    } catch {
      setError("Failed to submit. Try again.");
    }
    setLoading(false);
  }

  const hasSelection = selectedItems.size > 0;

  // source label for the info banner
  const stockSources = Array.from(stockCtx.values());
  const hasCount    = stockSources.some(s => s.source === "count");
  const hasExpected = stockSources.some(s => s.source === "expected");
  const sourceLabel = hasCount
    ? "today's stocktake count"
    : hasExpected
    ? "latest expected (synced sales)"
    : "last known stock";

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 90px)" }}>
      <div style={{ background: "#FFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-secondary)", fontSize: 20 }}>←</button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>New Order Request</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{BRANCH_LABELS[branch]}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg)", borderRadius: 10, padding: "8px 12px" }}>
          <svg width={16} height={16} fill="none" stroke="var(--text-secondary)" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search items…"
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 15, width: "100%", color: "var(--text)" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 0 }}>✕</button>
          )}
        </div>
      </div>

      {/* info banner */}
      {!loadingStock && (
        <div style={{ margin: "12px 16px 0", background: "#EFF6FF", borderRadius: 10, padding: "9px 13px", fontSize: 12, color: "#1D4ED8" }}>
          Pre-filled based on {sourceLabel} vs. par level. Packs are not pre-filled — add manually if needed.
        </div>
      )}

      {error && (
        <div style={{ margin: "12px 16px 0", background: "#FEF2F2", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#DC2626" }}>{error}</div>
      )}

      {loadingStock ? (
        <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--text-secondary)", fontSize: 14 }}>
          Loading stock data…
        </div>
      ) : (
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {availableItems.map(item => {
            const qty        = selectedItems.get(item.name);
            const isSelected = qty !== undefined;
            const ctx        = stockCtx.get(item.name);
            const isPack     = item.unit === "pack";

            return (
              <div
                key={item.name}
                style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", borderLeft: isSelected ? "4px solid #1A1A1A" : "4px solid transparent", display: "flex", alignItems: "center", gap: 12 }}
              >
                <button
                  onClick={() => toggleItem(item.name)}
                  style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSelected ? "#1A1A1A" : "#D1D5DB"}`, background: isSelected ? "#1A1A1A" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                >
                  {isSelected && (
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={3}>
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", display: "flex", flexWrap: "wrap", gap: "0 6px", marginTop: 2 }}>
                    <span>{item.packSize}</span>
                    <span style={{
                      background:  item.category === "portion" ? "#EDE9FE" : item.category === "packed" ? "#DBEAFE" : "#D1FAE5",
                      color:       item.category === "portion" ? "#7C3AED" : item.category === "packed" ? "#2563EB" : "#059669",
                      borderRadius: 4, padding: "1px 5px", fontSize: 10, fontWeight: 600,
                    }}>{item.category}</span>
                    {ctx && (
                      <span style={{ color: ctx.currentStock <= 0 ? "#DC2626" : "var(--text-secondary)" }}>
                        Stock: {ctx.currentStock}{!isPack && ` · Par: ${ctx.parLevel}`}
                      </span>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={() => setQty(item.name, (qty ?? 1) - 1)} style={qtyBtnStyle}>−</button>
                    <input
                      type="number"
                      value={qty}
                      onChange={e => setQty(item.name, Math.max(0, Number(e.target.value)))}
                      style={{ width: 50, textAlign: "center", border: "1.5px solid var(--border)", borderRadius: 8, padding: "6px 4px", fontSize: 16, fontWeight: 700, background: "var(--bg)", color: "var(--text)" }}
                    />
                    <button onClick={() => setQty(item.name, (qty ?? 0) + 1)} style={qtyBtnStyle}>+</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ position: "fixed", bottom: "var(--nav-h)", left: 0, right: 0, background: "#FFF", borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
        <button
          onClick={() => setShowReview(true)}
          disabled={!hasSelection || loadingStock}
          style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: hasSelection && !loadingStock ? "#1A1A1A" : "#E8E8E4", color: hasSelection && !loadingStock ? "#FFF" : "var(--text-secondary)", fontWeight: 700, fontSize: 16, cursor: hasSelection && !loadingStock ? "pointer" : "not-allowed" }}
        >
          {`Review Order${hasSelection ? ` · ${selectedItems.size} item${selectedItems.size !== 1 ? "s" : ""}` : ""}`}
        </button>
      </div>

      {showReview && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "#fff", overflowY: "auto" }}>
          <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>Order Summary</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{selectedItems.size} item{selectedItems.size !== 1 ? "s" : ""} · {BRANCH_LABELS[branch]}</div>
            </div>
            <button onClick={() => setShowReview(false)} style={{ background: "none", border: "none", fontSize: 20, color: "var(--text-secondary)", cursor: "pointer", padding: "2px 6px" }}>✕</button>
          </div>

          <div>
            {Array.from(selectedItems.entries()).map(([name, qty]) => {
              const item = CATALOG_MAP.get(name);
              const ctx  = stockCtx.get(name);
              return (
                <div key={name} style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                      {item?.packSize}
                      {ctx && <span style={{ marginLeft: 6 }}>Stock: {ctx.currentStock} · Par: {ctx.parLevel}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{qty} <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-secondary)" }}>{item?.unit}</span></div>
                </div>
              );
            })}
          </div>

          {error && (
            <div style={{ margin: "12px 16px", background: "#FEF2F2", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#DC2626" }}>{error}</div>
          )}

          <div style={{ position: "sticky", bottom: 0, background: "#fff", borderTop: "1px solid var(--border)", padding: "12px 16px 32px", display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowReview(false)}
              style={{ flex: 1, padding: "14px 0", borderRadius: 14, border: "1.5px solid var(--border)", fontWeight: 700, fontSize: 14, background: "#fff", color: "var(--text)", cursor: "pointer" }}
            >
              Edit
            </button>
            <button
              onClick={submit}
              disabled={loading}
              style={{ flex: 1, padding: "14px 0", borderRadius: 14, border: "none", fontWeight: 700, fontSize: 14, background: loading ? "#E8E8E4" : "#1A1A1A", color: loading ? "var(--text-secondary)" : "#fff", cursor: loading ? "not-allowed" : "pointer" }}
            >
              {loading ? "Submitting…" : "Confirm & Submit"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
