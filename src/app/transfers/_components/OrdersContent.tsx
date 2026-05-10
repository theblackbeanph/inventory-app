"use client";
import { useState, useMemo } from "react";
import { BRANCH_LABELS } from "@/lib/auth";
import { CATALOG, CATALOG_MAP } from "@/lib/items";
import { db, COLS, auth, saveDocById, collection, query, where, getDocs, writeBatch, doc } from "@/lib/firebase";
import type { Branch, PullOut, PullOutItem, DeliveryNote, ReceivedItem } from "@/lib/types";

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
  PENDING_REVIEW: "Pending Review",
  DISPATCHED:     "Dispatched",
  RECEIVED:       "Received",
  REJECTED:       "Rejected",
  CANCELLED:      "Cancelled",
  DISCREPANCY:    "Discrepancy",
  DISPUTED:       "Disputed",
  DONE:           "Done",
};

function statusBadgeStyle(status: string): React.CSSProperties {
  const map: Record<string, { bg: string; text: string }> = {
    PENDING_REVIEW: { bg: "#FEF3C7", text: "#D97706" },
    DISPATCHED:     { bg: "#E0E7FF", text: "#4338CA" },
    RECEIVED:       { bg: "#D1FAE5", text: "#059669" },
    DONE:           { bg: "#D1FAE5", text: "#059669" },
    REJECTED:       { bg: "#F3F4F6", text: "#6B7280" },
    CANCELLED:      { bg: "#F3F4F6", text: "#6B7280" },
    DISCREPANCY:    { bg: "#FEF3C7", text: "#D97706" },
    DISPUTED:       { bg: "#EDE9FE", text: "#7C3AED" },
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
  if (["DISCREPANCY", "REJECTED", "DISPUTED"].includes(status)) return "#DC2626";
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
}

export function OrdersContent({ tab, pullOuts, deliveryNotes, branch }: Props) {
  const [view,     setView]     = useState<View>("list");
  const [selected, setSelected] = useState<PullOut | null>(null);

  const pending = useMemo(() => pullOuts.filter(p => p.status === "PENDING_REVIEW"), [pullOuts]);
  const active  = useMemo(() => pullOuts.filter(p => p.status === "DISPATCHED"),     [pullOuts]);
  const history = useMemo(() => pullOuts.filter(p =>
    ["RECEIVED", "DONE", "CANCELLED", "REJECTED", "DISCREPANCY", "DISPUTED"].includes(p.status)
  ), [pullOuts]);

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
          const dn = tab === "active"
            ? deliveryNotes.find(d => d.pullOutId === po.id)
            : undefined;
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
                <span style={statusBadgeStyle(po.status)}>{STATUS_LABEL[po.status]}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {formatDay(po.requestedAt)} · {po.items.length} item{po.items.length !== 1 ? "s" : ""}
              </div>
              {tab === "active" && (
                <div style={{ marginTop: 6 }}>
                  {dn ? (
                    <>
                      <div style={{ fontSize: 12, color: "#4338CA", fontWeight: 600 }}>{dn.dnRef}</div>
                      <div style={{ fontSize: 12, color: "#4338CA" }}>Tap to confirm receipt →</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Awaiting delivery note…</div>
                  )}
                </div>
              )}
              {tab === "history" && ["DISCREPANCY", "DISPUTED"].includes(po.status) && (
                <div style={{ marginTop: 6, fontSize: 12, color: "#D97706" }}>
                  Discrepancy on file — place a new order if needed
                </div>
              )}
            </div>
          );
        })}
      </div>

      {tab !== "history" && (
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

// ── PendingDetail, ActiveDetail, HistoryDetail, NewOrderForm ──────────────────
// Stubs — implemented in Task 4 and Task 5

function PendingDetail(_props: { po: PullOut; onBack: () => void; onUpdated: (po: PullOut) => void }) {
  return <div style={{ padding: 16 }}>PendingDetail — coming in Task 4</div>;
}
function ActiveDetail(_props: { po: PullOut; dn: DeliveryNote | null; branch: Branch; onBack: () => void; onUpdated: (po: PullOut) => void }) {
  return <div style={{ padding: 16 }}>ActiveDetail — coming in Task 4</div>;
}
function HistoryDetail(_props: { po: PullOut; dn: DeliveryNote | null; onBack: () => void }) {
  return <div style={{ padding: 16 }}>HistoryDetail — coming in Task 4</div>;
}
function NewOrderForm(_props: { branch: Branch; onBack: () => void }) {
  return <div style={{ padding: 16 }}>NewOrderForm — coming in Task 5</div>;
}
