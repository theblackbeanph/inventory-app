"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, BRANCH_LABELS } from "@/lib/auth";
import { hasMinRole } from "@/lib/roles";
import type { Branch, PullOut, DeliveryNote } from "@/lib/types";
import { db, COLS, collection, onSnapshot, query, where, doc } from "@/lib/firebase";
import { updateDoc } from "firebase/firestore";
import BottomNav from "@/components/BottomNav";
import { OrdersContent } from "./_components/OrdersContent";

type Tab = "pending" | "active" | "history";

interface DisputeNoticeItem {
  item: string;
  unit: string;
  branchClaimedQty: number;
  resolvedQty: number;
  delta: number;
}

interface DisputeNotice {
  id: string;
  poRef: string;
  pullOutId: string;
  branch: string;
  resolvedAt: string;
  resolvedBy: string;
  superadminNote: string;
  correctedItems: DisputeNoticeItem[];
  branchAcknowledged: boolean;
  branchAcknowledgedAt?: string;
}

export default function TransfersPage() {
  const router = useRouter();
  const [branch,        setBranch]        = useState<Branch | null>(null);
  const [canOrder,      setCanOrder]      = useState(false);
  const [tab,           setTab]           = useState<Tab>("pending");
  const [pullOuts,      setPullOuts]      = useState<PullOut[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [notices,       setNotices]       = useState<DisputeNotice[]>([]);
  const [activeNotice,  setActiveNotice]  = useState<DisputeNotice | null>(null);
  const [dismissing,    setDismissing]    = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    if (session.department !== "kitchen") { router.replace("/stock"); return; }
    setBranch(session.branch);
    setCanOrder(hasMinRole(session.role, "admin"));
  }, [router]);

  useEffect(() => {
    if (!branch) return;
    const q1 = query(collection(db, COLS.pullOuts), where("branch", "==", branch));
    const unsub1 = onSnapshot(q1, snap => {
      const list = snap.docs.map(d => d.data() as PullOut);
      list.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
      setPullOuts(list);
    });
    const q2 = query(collection(db, COLS.deliveryNotes), where("branch", "==", branch));
    const unsub2 = onSnapshot(q2, snap => {
      setDeliveryNotes(snap.docs.map(d => d.data() as DeliveryNote));
    });
    const q3 = query(
      collection(db, COLS.disputeNotices),
      where("branch", "==", branch),
      where("branchAcknowledged", "==", false)
    );
    const unsub3 = onSnapshot(q3, snap => {
      setNotices(snap.docs.map(d => d.data() as DisputeNotice));
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [branch]);

  async function dismissNotice(notice: DisputeNotice) {
    if (dismissing) return;
    setDismissing(true);
    try {
      await updateDoc(doc(db, COLS.disputeNotices, notice.id), {
        branchAcknowledged:   true,
        branchAcknowledgedAt: new Date().toISOString(),
      });
      setActiveNotice(null);
    } catch {
      // silent — onSnapshot will retry on reconnect
    }
    setDismissing(false);
  }

  const pendingCount = pullOuts.filter(p => p.status === "PENDING_REVIEW").length;
  const activeCount  = pullOuts.filter(p => ["DISPATCHED", "DISCREPANCY"].includes(p.status)).length;
  const firstNotice  = notices[0] ?? null;

  if (!branch) return null;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 16px)" }}>
      {/* Resolution notice banner */}
      {firstNotice && !activeNotice && (
        <div style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "#1A1A1A", color: "#FFF", padding: "12px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            Dispute resolved: {firstNotice.poRef}
          </div>
          <button
            onClick={() => setActiveNotice(firstNotice)}
            style={{
              background: "#FFF", color: "#1A1A1A", border: "none", borderRadius: 8,
              padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            View Details
          </button>
        </div>
      )}

      {/* Resolution detail modal */}
      {activeNotice && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end",
        }}>
          <div style={{
            background: "var(--bg)", borderRadius: "20px 20px 0 0",
            padding: "24px 20px 40px", width: "100%", maxHeight: "80vh", overflowY: "auto",
          }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
              Dispute Resolved
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
              {activeNotice.poRef} · {activeNotice.resolvedAt}
            </div>

            <div style={{ background: "#F0FDF4", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#059669", marginBottom: 4 }}>
                Superadmin note
              </div>
              <div style={{ fontSize: 13, color: "#1A1A1A" }}>{activeNotice.superadminNote}</div>
            </div>

            {activeNotice.correctedItems.length > 0 ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)",
                  marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Stock corrections applied
                </div>
                {activeNotice.correctedItems.map((ci, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 0", borderTop: "1px solid var(--border)",
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{ci.item}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        You claimed {ci.branchClaimedQty} · resolved {ci.resolvedQty} {ci.unit}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 13, fontWeight: 700,
                      color: ci.delta > 0 ? "#059669" : "#DC2626",
                    }}>
                      {ci.delta > 0 ? `+${ci.delta}` : ci.delta} {ci.unit}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div style={{ fontSize: 13, color: "var(--text-secondary)", textAlign: "center", padding: "12px 0" }}>
                No stock corrections needed — your received quantities matched the resolution.
              </div>
            )}

            <button
              onClick={() => dismissNotice(activeNotice)}
              disabled={dismissing}
              style={{
                width: "100%", marginTop: 24, padding: "15px 0", borderRadius: 14,
                border: "none", background: "#1A1A1A", color: "#FFF",
                fontWeight: 700, fontSize: 16, cursor: dismissing ? "not-allowed" : "pointer",
              }}
            >
              {dismissing ? "Confirming…" : "Confirm — I've reviewed this"}
            </button>
          </div>
        </div>
      )}

      <div style={{ background: "#FFFFFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 0",
        position: "sticky", top: firstNotice && !activeNotice ? 49 : 0, zIndex: 40 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em",
            color: "var(--text-secondary)", textTransform: "uppercase" }}>
            {BRANCH_LABELS[branch]}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Orders</div>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {([
            { id: "pending", label: "Pending", count: pendingCount },
            { id: "active",  label: "Active",  count: activeCount  },
            { id: "history", label: "History",  count: 0            },
          ] as { id: Tab; label: string; count: number }[]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "9px 4px", border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 13, background: "transparent",
              color: tab === t.id ? "#1A1A1A" : "var(--text-secondary)",
              borderBottom: tab === t.id ? "2px solid #1A1A1A" : "2px solid transparent",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            }}>
              {t.label}
              {t.count > 0 && (
                <span style={{ background: "#1A1A1A", color: "#FFF", borderRadius: 8,
                  padding: "0 5px", fontSize: 10, fontWeight: 700 }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <OrdersContent tab={tab} pullOuts={pullOuts} deliveryNotes={deliveryNotes}
        branch={branch} canOrder={canOrder} />

      <BottomNav />
    </div>
  );
}
