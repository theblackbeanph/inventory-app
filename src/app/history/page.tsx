"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getSession, BRANCH_LABELS, DEPARTMENT_LABELS } from "@/lib/auth";
import { db, COLS, collection, onSnapshot, query, where } from "@/lib/firebase";
import type { Branch, Department, StockAdjustment, AdjustmentType } from "@/lib/types";
import BottomNav from "@/components/BottomNav";

const TYPE_STYLES: Record<AdjustmentType, { label: string; bg: string; text: string }> = {
  in:           { label: "IN",     bg: "#D1FAE5", text: "#059669" },
  out:          { label: "OUT",    bg: "#FEE2E2", text: "#DC2626" },
  waste:        { label: "WASTE",  bg: "#FEF3C7", text: "#D97706" },
  count:        { label: "COUNT",  bg: "#EDE9FE", text: "#7C3AED" },
  sales_import: { label: "SALES",  bg: "#DBEAFE", text: "#2563EB" },
};

export default function HistoryPage() {
  const router = useRouter();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [department, setDept] = useState<Department | null>(null);
  const [adjs, setAdjs] = useState<StockAdjustment[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    setBranch(session.branch);
    setDept(session.department);

    const adjQ = query(collection(db, COLS.adjustments), where("branch", "==", session.branch), where("department", "==", session.department));
    const unsub = onSnapshot(adjQ, snap => {
      const items = snap.docs.map(d => d.data() as StockAdjustment)
        .sort((a, b) => b.id - a.id);
      setAdjs(items);
    });
    return unsub;
  }, [router]);

  const filtered = useMemo(() => {
    if (!search) return adjs;
    return adjs.filter(a => a.item.toLowerCase().includes(search.toLowerCase()));
  }, [adjs, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, StockAdjustment[]>();
    for (const a of filtered) {
      const list = map.get(a.date) ?? [];
      list.push(a);
      map.set(a.date, list);
    }
    return map;
  }, [filtered]);

  if (!branch || !department) return null;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 16px)" }}>
      <div style={{
        background: "#FFFFFF", borderBottom: "1px solid var(--border)",
        padding: "16px 16px 12px", position: "sticky", top: 0, zIndex: 40,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
          {BRANCH_LABELS[branch]} · {DEPARTMENT_LABELS[department]}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Adjustment Log</div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg)", borderRadius: 10, padding: "8px 12px" }}>
          <svg width={16} height={16} fill="none" stroke="var(--text-secondary)" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by item…"
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 15, width: "100%", color: "var(--text)" }} />
        </div>
      </div>

      <div style={{ padding: "12px 16px" }}>
        {grouped.size === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "64px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
            <div style={{ fontSize: 15 }}>No adjustments yet</div>
          </div>
        )}
        {[...grouped.entries()].map(([date, items]) => (
          <div key={date} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
              {date}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map(adj => {
                const s = TYPE_STYLES[adj.type];
                return (
                  <div key={adj.id} style={{
                    background: "#FFFFFF", borderRadius: 12, padding: "12px 14px",
                    display: "flex", alignItems: "center", gap: 12,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  }}>
                    <div style={{
                      background: s.bg, color: s.text,
                      borderRadius: 6, padding: "3px 8px",
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                      flexShrink: 0,
                    }}>
                      {s.label}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {adj.item}
                      </div>
                      {adj.note && (
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 1 }}>{adj.note}</div>
                      )}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: adj.type === "in" ? "var(--good)" : adj.type === "out" || adj.type === "waste" ? "var(--critical)" : "var(--text)", flexShrink: 0 }}>
                      {adj.type === "in" ? "+" : adj.type === "out" || adj.type === "waste" ? "−" : "="}{adj.qty.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  );
}
