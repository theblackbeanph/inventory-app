"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getSession, BRANCH_LABELS, DEPARTMENT_LABELS } from "@/lib/auth";
import { db, COLS, collection, onSnapshot, query, where, getDocs } from "@/lib/firebase";
import type { Branch, Department, StockAdjustment, AdjustmentType, DailyBeginning } from "@/lib/types";
import { CATALOG } from "@/lib/items";
import BottomNav from "@/components/BottomNav";

const TYPE_STYLES: Record<AdjustmentType, { label: string; bg: string; text: string }> = {
  in:           { label: "IN",     bg: "#D1FAE5", text: "#059669" },
  out:          { label: "OUT",    bg: "#FEE2E2", text: "#DC2626" },
  waste:        { label: "WASTE",  bg: "#FEF3C7", text: "#D97706" },
  count:        { label: "COUNT",  bg: "#EDE9FE", text: "#7C3AED" },
  sales_import: { label: "SALES",  bg: "#DBEAFE", text: "#2563EB" },
};

function todayPHT(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekMonday(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function formatDate(date: string): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
}

type HistTab = "log" | "weekly";

export default function HistoryPage() {
  const router = useRouter();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [department, setDept] = useState<Department | null>(null);
  const [adjs, setAdjs] = useState<StockAdjustment[]>([]);
  const [search, setSearch] = useState("");

  const [histTab, setHistTab] = useState<HistTab>("log");
  const [weekStart, setWeekStart] = useState(() => weekMonday(todayPHT()));
  const [weekBeginnings, setWeekBeginnings] = useState<Record<string, number>>({});

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

  // Fetch Monday beginnings when weekly tab is active or week changes
  useEffect(() => {
    if (!branch || !department || histTab !== "weekly") return;
    let cancelled = false;
    (async () => {
      const begSnap = await getDocs(query(
        collection(db, COLS.dailyBeginning),
        where("branch", "==", branch),
        where("department", "==", department),
        where("date", "==", weekStart),
      ));
      if (cancelled) return;
      const map: Record<string, number> = {};
      begSnap.docs.forEach(d => { const b = d.data() as DailyBeginning; map[b.item] = b.qty; });
      setWeekBeginnings(map);
    })();
    return () => { cancelled = true; };
  }, [branch, department, histTab, weekStart]);

  const weekEnd = addDays(weekStart, 6);

  const weekSummary = useMemo(() => {
    if (!department) return [];
    const deptCatalog = CATALOG.filter(i => i.department === department);
    const weekAdjs = adjs.filter(a => a.date >= weekStart && a.date <= weekEnd);

    return deptCatalog.map(item => {
      const monBeg = weekBeginnings[item.name] ?? null;
      const itemAdjs = weekAdjs.filter(a => a.item === item.name);

      const totalIn  = itemAdjs.filter(a => a.type === "in").reduce((s, a) => s + a.qty, 0);
      const totalOut = itemAdjs.filter(a => a.type === "out" || a.type === "waste" || a.type === "sales_import").reduce((s, a) => s + a.qty, 0);
      const expected = monBeg !== null ? monBeg + totalIn - totalOut : null;

      const sundayCounts = itemAdjs.filter(a => a.type === "count" && a.date === weekEnd);
      const sundayCount = sundayCounts.length > 0
        ? sundayCounts.reduce((best, a) => a.id > best.id ? a : best).qty
        : null;

      const variance = expected !== null && sundayCount !== null ? sundayCount - expected : null;

      return { item, monBeg, totalIn, totalOut, expected, sundayCount, variance };
    }).filter(r => r.monBeg !== null || r.totalIn > 0 || r.totalOut > 0);
  }, [department, weekStart, weekEnd, adjs, weekBeginnings]);

  // Log tab data
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

  function exportWeeklyCSV() {
    if (!branch) return;
    const header = ["Item", "Mon BEG", "Total IN", "Total OUT", "Expected End", "Sunday Count", "Weekly Variance"];
    const rows = weekSummary.map(r => [
      r.item.name, r.monBeg ?? "", r.totalIn, r.totalOut,
      r.expected ?? "", r.sundayCount ?? "", r.variance ?? "",
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekly-${BRANCH_LABELS[branch]}-${weekStart}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!branch || !department) return null;

  const manualDays = new Set(
    adjs.filter(a => a.date >= weekStart && a.date <= weekEnd && a.type === "count" && a.note !== "Auto-closed")
        .map(a => a.date)
  ).size;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 16px)" }}>
      <div style={{
        background: "#FFFFFF", borderBottom: "1px solid var(--border)",
        padding: "16px 16px 0", position: "sticky", top: 0, zIndex: 40,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
          {BRANCH_LABELS[branch]} · {DEPARTMENT_LABELS[department]}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>History</div>

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 2 }}>
          {(["log", "weekly"] as HistTab[]).map(t => (
            <button key={t} onClick={() => setHistTab(t)} style={{
              flex: 1, padding: "9px 4px", border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 13, background: "transparent",
              color: histTab === t ? "#1A1A1A" : "var(--text-secondary)",
              borderBottom: histTab === t ? "2px solid #1A1A1A" : "2px solid transparent",
            }}>
              {t === "log" ? "Adjustment Log" : "Weekly Summary"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Adjustment Log ── */}
      {histTab === "log" && (
        <>
          <div style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "8px 16px", position: "sticky", top: 113, zIndex: 39 }}>
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
        </>
      )}

      {/* ── Weekly Summary ── */}
      {histTab === "weekly" && (
        <div style={{ padding: "12px 16px" }}>
          {/* Controls */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                onClick={() => setWeekStart(addDays(weekStart, -7))}
                style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid var(--border)", background: "#fff", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
              >‹</button>
              <div style={{ fontSize: 13, fontWeight: 600, minWidth: 140, textAlign: "center" }}>
                {formatDate(weekStart)} – {formatDate(weekEnd)}
              </div>
              <button
                onClick={() => { const next = addDays(weekStart, 7); if (next <= weekMonday(todayPHT())) setWeekStart(next); }}
                disabled={addDays(weekStart, 7) > weekMonday(todayPHT())}
                style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid var(--border)", background: "#fff", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", opacity: addDays(weekStart, 7) > weekMonday(todayPHT()) ? 0.3 : 1 }}
              >›</button>
            </div>
            <button
              onClick={exportWeeklyCSV}
              style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "var(--text)" }}
            >
              Export CSV
            </button>
          </div>

          {/* Manual count badge */}
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            {manualDays} of 7 days manually counted
          </div>

          {weekSummary.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "48px 0" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📅</div>
              <div style={{ fontSize: 15 }}>No data for this week</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <thead>
                  <tr style={{ background: "var(--bg)" }}>
                    {["Item", "Mon BEG", "Total IN", "Total OUT", "Expected", "Sun Count", "Variance"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-secondary)", textTransform: "uppercase", textAlign: h === "Item" ? "left" : "center", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weekSummary.map(({ item, monBeg, totalIn, totalOut, expected, sundayCount, variance }) => {
                    const varColor = variance === null ? "var(--text-secondary)" : variance === 0 ? "#16A34A" : variance > 0 ? "#D97706" : "#DC2626";
                    return (
                      <tr key={item.name} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 10px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>{item.name}</td>
                        <td style={{ padding: "10px 6px", textAlign: "center", color: "var(--text-secondary)" }}>{monBeg ?? "—"}</td>
                        <td style={{ padding: "10px 6px", textAlign: "center", color: "#059669", fontWeight: 600 }}>{totalIn > 0 ? `+${totalIn}` : "—"}</td>
                        <td style={{ padding: "10px 6px", textAlign: "center", color: "#DC2626", fontWeight: 600 }}>{totalOut > 0 ? `−${totalOut}` : "—"}</td>
                        <td style={{ padding: "10px 6px", textAlign: "center", color: "#2563EB", fontWeight: 600 }}>{expected ?? "—"}</td>
                        <td style={{ padding: "10px 6px", textAlign: "center" }}>{sundayCount ?? "—"}</td>
                        <td style={{ padding: "10px 6px", textAlign: "center", fontWeight: 700, color: varColor }}>
                          {variance === null ? "—" : variance === 0 ? "✓" : variance > 0 ? `+${variance}` : String(variance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
