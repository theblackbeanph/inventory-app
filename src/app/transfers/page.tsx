"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, BRANCH_LABELS } from "@/lib/auth";
import { hasMinRole } from "@/lib/roles";
import type { Branch, PullOut, DeliveryNote } from "@/lib/types";
import { db, COLS, collection, onSnapshot, query, where } from "@/lib/firebase";
import BottomNav from "@/components/BottomNav";
import { OrdersContent } from "./_components/OrdersContent";

type Tab = "pending" | "active" | "history";

export default function TransfersPage() {
  const router = useRouter();
  const [branch,        setBranch]        = useState<Branch | null>(null);
  const [canOrder,      setCanOrder]      = useState(false);
  const [tab,           setTab]           = useState<Tab>("pending");
  const [pullOuts,      setPullOuts]      = useState<PullOut[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);

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
      const list = snap.docs.map(d => d.data() as DeliveryNote);
      setDeliveryNotes(list);
    });
    return () => { unsub1(); unsub2(); };
  }, [branch]);

  const pendingCount = pullOuts.filter(p => p.status === "PENDING_REVIEW").length;
  const activeCount  = pullOuts.filter(p => p.status === "DISPATCHED").length;

  if (!branch) return null;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 16px)" }}>
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 0", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
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
                <span style={{ background: "#1A1A1A", color: "#FFF", borderRadius: 8, padding: "0 5px", fontSize: 10, fontWeight: 700 }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <OrdersContent tab={tab} pullOuts={pullOuts} deliveryNotes={deliveryNotes} branch={branch} canOrder={canOrder} />

      <BottomNav />
    </div>
  );
}
