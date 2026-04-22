"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSession, logout, BRANCH_LABELS, DEPARTMENT_LABELS, BRANCH_POS_TYPE } from "@/lib/auth";
import { db, COLS, saveDocById, saveDoc } from "@/lib/firebase";
import { CATALOG, CATALOG_MAP, stockDocId, beginningDocId } from "@/lib/items";
import { collection, onSnapshot, query, where, getDocs, writeBatch, doc } from "@/lib/firebase";
import type { Branch, Department, BranchStock, StockAdjustment, DailyBeginning, ItemCategory, DailyClose } from "@/lib/types";
import { parseSalesCSV, applyCsvMapping, allMappedPosNames } from "@/lib/csv-mapping";
import BottomNav from "@/components/BottomNav";

type SubTab = "summary" | "endcount" | "adjust";
type FilterTab = "all" | ItemCategory;

const CATEGORY_FILTERS: { id: FilterTab; label: string }[] = [
  { id: "all",     label: "All" },
  { id: "portion", label: "Portions" },
  { id: "packed",  label: "Packed" },
  { id: "loose",   label: "Loose" },
];

function todayPHT(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface DailyMetrics {
  beginning: number | null;
  inQty: number;
  outQty: number;
  endCount: number | null;
}

function computeMetrics(catalog: typeof CATALOG, adjustments: StockAdjustment[], beginnings: Record<string, number>): Record<string, DailyMetrics> {
  const metrics: Record<string, DailyMetrics> = {};
  for (const item of catalog) {
    metrics[item.name] = { beginning: beginnings[item.name] ?? null, inQty: 0, outQty: 0, endCount: null };
  }
  const latestCount: Record<string, { qty: number; id: number }> = {};
  for (const adj of adjustments) {
    if (!metrics[adj.item]) continue;
    const m = metrics[adj.item];
    if (adj.type === "in") {
      m.inQty += adj.qty;
    } else if (adj.type === "out" || adj.type === "waste" || adj.type === "sales_import") {
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
}

export default function StockPage() {
  const router = useRouter();
  const [today] = useState(todayPHT);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [department, setDept] = useState<Department | null>(null);
  const [stocks, setStocks] = useState<Record<string, BranchStock>>({});
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [beginnings, setBeginnings] = useState<Record<string, number>>({});

  // Navigation
  const [subTab, setSubTab] = useState<SubTab>("summary");
  const [categoryFilter, setCategoryFilter] = useState<FilterTab>("all");

  // Summary tab
  const [summaryDate, setSummaryDate] = useState(todayPHT);
  const [summaryAdj, setSummaryAdj] = useState<StockAdjustment[]>([]);
  const [summaryBeg, setSummaryBeg] = useState<Record<string, number>>({});
  const [varOnly, setVarOnly] = useState(false);

  // End count tab
  const [endCounts, setEndCounts] = useState<Record<string, string>>({});
  const [showReview, setShowReview] = useState(false);
  const [recountItems, setRecountItems] = useState<Set<string>>(new Set());

  // Modals
  const [showReset, setShowReset] = useState(false);
  const [adjustItem, setAdjustItem] = useState<string | null>(null);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [dayClose, setDayClose] = useState<DailyClose | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    setBranch(session.branch);
    setDept(session.department);
    const b = session.branch;
    const dept = session.department;

    const stockQ = query(collection(db, COLS.branchStock), where("branch", "==", b), where("department", "==", dept));
    const unsubStock = onSnapshot(stockQ, snap => {
      const map: Record<string, BranchStock> = {};
      snap.docs.forEach(d => { const s = d.data() as BranchStock; map[s.item] = s; });
      setStocks(map);
    });

    const adjQ = query(collection(db, COLS.adjustments), where("branch", "==", b), where("department", "==", dept), where("date", "==", today));
    const unsubAdj = onSnapshot(adjQ, snap => setAdjustments(snap.docs.map(d => d.data() as StockAdjustment)));

    const begQ = query(collection(db, COLS.dailyBeginning), where("branch", "==", b), where("department", "==", dept), where("date", "==", today));
    const unsubBeg = onSnapshot(begQ, snap => {
      const map: Record<string, number> = {};
      snap.docs.forEach(d => { const beg = d.data() as DailyBeginning; map[beg.item] = beg.qty; });
      setBeginnings(map);
    });

    const closeQ = query(collection(db, COLS.dailyClose), where("branch", "==", b), where("department", "==", dept), where("date", "==", today));
    const unsubClose = onSnapshot(closeQ, snap => {
      setDayClose(snap.empty ? null : snap.docs[0].data() as DailyClose);
    });

    return () => { unsubStock(); unsubAdj(); unsubBeg(); unsubClose(); };
  }, [router, today]);

  // Fetch summary data when summaryDate changes
  useEffect(() => {
    if (!branch) return;
    if (summaryDate === today) {
      setSummaryAdj(adjustments);
      setSummaryBeg(beginnings);
      return;
    }
    let cancelled = false;
    (async () => {
      const [adjSnap, begSnap] = await Promise.all([
        getDocs(query(collection(db, COLS.adjustments), where("branch", "==", branch), where("department", "==", department), where("date", "==", summaryDate))),
        getDocs(query(collection(db, COLS.dailyBeginning), where("branch", "==", branch), where("department", "==", department), where("date", "==", summaryDate))),
      ]);
      if (cancelled) return;
      setSummaryAdj(adjSnap.docs.map(d => d.data() as StockAdjustment));
      const map: Record<string, number> = {};
      begSnap.docs.forEach(d => { const b = d.data() as DailyBeginning; map[b.item] = b.qty; });
      setSummaryBeg(map);
    })();
    return () => { cancelled = true; };
  }, [branch, department, summaryDate, today, adjustments, beginnings]);

  const deptCatalog = useMemo(() => department ? CATALOG.filter(i => i.department === department) : [], [department]);

  const dailyMetrics = useMemo(() => computeMetrics(deptCatalog, adjustments, beginnings), [deptCatalog, adjustments, beginnings]);
  const summaryMetrics = useMemo(() => computeMetrics(deptCatalog, summaryAdj, summaryBeg), [deptCatalog, summaryAdj, summaryBeg]);

  // Pre-populate end count inputs from Firestore (only fill blanks, not override in-progress)
  useEffect(() => {
    setEndCounts(prev => {
      const next = { ...prev };
      for (const [item, m] of Object.entries(dailyMetrics)) {
        if (!(item in next) && m.endCount !== null) next[item] = String(m.endCount);
      }
      return next;
    });
  }, [dailyMetrics]);

  const filtered = useMemo(() => deptCatalog.filter(item =>
    categoryFilter === "all" || item.category === categoryFilter
  ), [deptCatalog, categoryFilter]);

  const lowCount  = deptCatalog.filter(i => { const s = stocks[i.name]; return s && s.qty <= i.reorderAt && s.qty > 0; }).length;
  const critCount = deptCatalog.filter(i => { const s = stocks[i.name]; return !s || s.qty <= 0; }).length;

  const posType = branch ? BRANCH_POS_TYPE[branch] : null;


  if (!branch || !department) return null;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 16px)" }}>
      {/* ── Header ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "16px 16px 0", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" }}>{BRANCH_LABELS[branch]} · {DEPARTMENT_LABELS[department]}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Daily Inventory</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 1 }}>{today}</div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {lowCount > 0 && <div style={{ background: "#FEF3C7", color: "#D97706", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>{lowCount} low</div>}
            {critCount > 0 && <div style={{ background: "#FEE2E2", color: "#DC2626", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>{critCount} out</div>}
            {posType === "csv" && (
              <button onClick={() => setShowCSVImport(true)} style={{ background: "#EFF6FF", border: "none", color: "#2563EB", cursor: "pointer", fontSize: 12, padding: "4px 10px", fontWeight: 600, borderRadius: 8 }}>
                Import sales
              </button>
            )}
            <button onClick={() => setShowReset(true)} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 12, padding: "4px 8px", fontWeight: 500 }}>Reset</button>
            <button onClick={() => { logout(); router.replace("/login"); }} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, padding: "4px 8px" }}>Log out</button>
          </div>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: "flex", gap: 2, marginBottom: 0 }}>
          {(["summary", "endcount", "adjust"] as SubTab[]).map(tab => {
            const label = tab === "summary" ? "Summary" : tab === "endcount" ? "End Count" : "Adjust";
            return (
              <button key={tab} onClick={() => setSubTab(tab)} style={{
                flex: 1, padding: "9px 4px", border: "none", cursor: "pointer",
                fontWeight: 600, fontSize: 13, background: "transparent",
                color: subTab === tab ? "#1A1A1A" : "var(--text-secondary)",
                borderBottom: subTab === tab ? "2px solid #1A1A1A" : "2px solid transparent",
              }}>{label}</button>
            );
          })}
        </div>
      </div>

      {/* ── Category filter pills ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "8px 16px", display: "flex", gap: 6, overflowX: "auto", position: "sticky", top: 113, zIndex: 39 }}>
        {CATEGORY_FILTERS.map(f => (
          <button key={f.id} onClick={() => setCategoryFilter(f.id)} style={{
            padding: "5px 14px", borderRadius: 20, border: "1.5px solid",
            borderColor: categoryFilter === f.id ? "#1A1A1A" : "var(--border)",
            background: categoryFilter === f.id ? "#1A1A1A" : "#fff",
            color: categoryFilter === f.id ? "#fff" : "var(--text-secondary)",
            fontWeight: 600, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
          }}>{f.label}</button>
        ))}
      </div>

      {/* ── Content ── */}
      {subTab === "summary" && (
        <SummaryContent
          items={filtered}
          metrics={summaryMetrics}
          summaryDate={summaryDate}
          today={today}
          varOnly={varOnly}
          onDateChange={setSummaryDate}
          onVarOnlyChange={setVarOnly}
          branch={branch}
        />
      )}
      {subTab === "endcount" && (
        dayClose?.isLocked
          ? <EndCountCompleted dayClose={dayClose} />
          : <EndCountContent
              items={filtered}
              metrics={dailyMetrics}
              endCounts={endCounts}
              onCountChange={(item, val) => setEndCounts(prev => ({ ...prev, [item]: val }))}
              onReview={() => setShowReview(true)}
            />
      )}
      {subTab === "adjust" && (
        <AdjustContent
          items={filtered}
          metrics={dailyMetrics}
          stocks={stocks}
          onTap={item => setAdjustItem(item)}
        />
      )}

      {/* ── Modals ── */}
      {showReview && (
        <ReviewModal
          items={filtered}
          metrics={dailyMetrics}
          endCounts={endCounts}
          recountItems={recountItems}
          onRecount={item => setRecountItems(prev => new Set([...prev, item]))}
          onConfirm={async () => {
            if (!branch || !department) return;
            const batch = writeBatch(db);
            const now = Date.now();
            const closeItems: DailyClose["items"] = {};
            for (const item of filtered) {
              if (recountItems.has(item.name)) continue;
              const val = endCounts[item.name];
              if (val === undefined || val === "") continue;
              const qty = Number(val);
              if (isNaN(qty) || qty < 0) continue;
              const adjRef = doc(collection(db, COLS.adjustments));
              batch.set(adjRef, { id: now + Math.random(), branch, department, date: today, item: item.name, type: "count", qty, loggedBy: BRANCH_LABELS[branch] });
              const stockId = stockDocId(branch, department, item.name);
              batch.set(doc(db, COLS.branchStock, stockId), {
                id: stockId, branch, department, item: item.name, category: item.category,
                unit: item.unit, qty, reorderAt: item.reorderAt,
                lastUpdated: today, lastUpdatedBy: BRANCH_LABELS[branch],
              });
              const m = dailyMetrics[item.name];
              const expected = m.beginning !== null ? m.beginning + m.inQty - m.outQty : qty;
              closeItems[item.name] = {
                beginning: m.beginning ?? 0, inQty: m.inQty, outQty: m.outQty,
                expected, endCount: qty, variance: qty - expected,
              };
            }
            await batch.commit();

            // Lock the day
            const closeId = `${branch}__${department}__${today}`;
            await saveDocById(COLS.dailyClose, closeId, {
              id: closeId, branch, department, date: today,
              countType: "manual", closedAt: new Date().toISOString(),
              closedBy: BRANCH_LABELS[branch], isLocked: true, items: closeItems,
            });

            // Carry forward today's confirmed counts as tomorrow's beginning
            const tomorrow = addDays(today, 1);
            const begBatch = writeBatch(db);
            let begCount = 0;
            for (const [itemName, data] of Object.entries(closeItems)) {
              const begId = beginningDocId(branch, department, itemName, tomorrow);
              begBatch.set(doc(db, COLS.dailyBeginning, begId), {
                id: begId, branch, department, item: itemName, date: tomorrow,
                qty: data.endCount, setBy: BRANCH_LABELS[branch], updatedAt: today,
              });
              begCount++;
            }
            if (begCount > 0) await begBatch.commit();

            setEndCounts(prev => {
              const next = { ...prev };
              recountItems.forEach(item => { delete next[item]; });
              return next;
            });
            setRecountItems(new Set());
            setShowReview(false);
          }}
          onClose={() => { setRecountItems(new Set()); setShowReview(false); }}
        />
      )}

      {showReset && branch && <ResetModal branch={branch} onClose={() => setShowReset(false)} />}

      {adjustItem && branch && department && (
        <AdjustModal
          item={adjustItem}
          branch={branch}
          department={department}
          stock={stocks[adjustItem] ?? null}
          beginningQty={beginnings[adjustItem] ?? null}
          today={today}
          onClose={() => setAdjustItem(null)}
        />
      )}

      {showCSVImport && branch && department && (
        <CSVImportModal
          branch={branch}
          department={department}
          today={today}
          onClose={() => setShowCSVImport(false)}
        />
      )}

      <BottomNav />
    </div>
  );
}

// ── Summary tab ───────────────────────────────────────────────────────────────

function SummaryContent({ items, metrics, summaryDate, today, varOnly, onDateChange, onVarOnlyChange, branch }: {
  items: typeof CATALOG;
  metrics: Record<string, DailyMetrics>;
  summaryDate: string;
  today: string;
  varOnly: boolean;
  onDateChange: (d: string) => void;
  onVarOnlyChange: (v: boolean) => void;
  branch: Branch;
}) {
  const rows = items.map(item => {
    const m = metrics[item.name];
    const expected = m.beginning !== null ? m.beginning + m.inQty - m.outQty : null;
    const variance = m.endCount !== null && expected !== null ? m.endCount - expected : null;
    return { item, m, expected, variance };
  }).filter(r => !varOnly || (r.variance !== null && r.variance !== 0));

  function exportCSV() {
    const header = ["Item", "Pack Size", "Beginning", "IN", "OUT", "Expected", "End Count", "Variance"];
    const csvRows = [header, ...rows.map(({ item, m, expected, variance }) =>
      [item.name, item.packSize, m.beginning ?? "", m.inQty, m.outQty, expected ?? "", m.endCount ?? "", variance ?? ""]
    )];
    const csv = csvRows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-${BRANCH_LABELS[branch]}-${summaryDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const thStyle: React.CSSProperties = {
    padding: "8px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
    color: "var(--text-secondary)", textTransform: "uppercase", textAlign: "center",
    whiteSpace: "nowrap", background: "var(--bg)", borderBottom: "1px solid var(--border)",
  };
  const tdStyle: React.CSSProperties = { padding: "0 8px", textAlign: "center", fontSize: 14, fontWeight: 600 };

  return (
    <div style={{ padding: "12px 16px" }}>
      {/* Controls */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input
          type="date"
          value={summaryDate}
          max={today}
          onChange={e => onDateChange(e.target.value)}
          style={{ border: "1.5px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 13, background: "#fff", color: "var(--text)", outline: "none" }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
          <input type="checkbox" checked={varOnly} onChange={e => onVarOnlyChange(e.target.checked)} style={{ width: 15, height: 15 }} />
          Variances only
        </label>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", background: "#fff" }}>
        <table style={{ minWidth: 540, borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: "left", position: "sticky", left: 0, background: "var(--bg)", minWidth: 140 }}>Item</th>
              <th style={thStyle}>BEG</th>
              <th style={thStyle}>IN</th>
              <th style={thStyle}>OUT</th>
              <th style={thStyle}>EXP</th>
              <th style={thStyle}>END</th>
              <th style={thStyle}>VAR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, m, expected, variance }) => {
              const varColor = variance === null ? "var(--text-secondary)" : variance < 0 ? "#DC2626" : variance > 0 ? "#D97706" : "#16A34A";
              return (
                <tr key={item.name} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ ...tdStyle, textAlign: "left", padding: "10px 12px", position: "sticky", left: 0, background: "#fff" }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1 }}>{item.packSize}</div>
                  </td>
                  <td style={tdStyle}>{m.beginning ?? "—"}</td>
                  <td style={{ ...tdStyle, color: m.inQty > 0 ? "#16A34A" : undefined }}>{m.inQty > 0 ? `+${m.inQty}` : "—"}</td>
                  <td style={{ ...tdStyle, color: m.outQty > 0 ? "#DC2626" : undefined }}>{m.outQty > 0 ? `−${m.outQty}` : "—"}</td>
                  <td style={tdStyle}>{expected ?? "—"}</td>
                  <td style={tdStyle}>{m.endCount ?? "—"}</td>
                  <td style={{ ...tdStyle, color: varColor, fontWeight: 700 }}>
                    {variance === null ? "—" : variance === 0 ? "✓" : variance > 0 ? `+${variance}` : String(variance)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "var(--text-secondary)", fontSize: 14 }}>No items to show</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        onClick={exportCSV}
        style={{ marginTop: 16, width: "100%", padding: "13px 0", borderRadius: 12, border: "1.5px solid var(--border)", background: "#fff", color: "var(--text)", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
      >
        Export CSV
      </button>
    </div>
  );
}

// ── End Count tab ─────────────────────────────────────────────────────────────

function EndCountContent({ items, metrics, endCounts, onCountChange, onReview }: {
  items: typeof CATALOG;
  metrics: Record<string, DailyMetrics>;
  endCounts: Record<string, string>;
  onCountChange: (item: string, val: string) => void;
  onReview: () => void;
}) {
  const enteredCount = items.filter(i => endCounts[i.name] !== undefined && endCounts[i.name] !== "").length;

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ padding: "10px 16px 4px", fontSize: 12, color: "var(--text-secondary)" }}>
        {enteredCount} of {items.length} counted
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {items.map(item => {
          const m = metrics[item.name];
          const expected = m.beginning !== null ? m.beginning + m.inQty - m.outQty : null;
          const val = endCounts[item.name] ?? "";

          return (
            <div key={item.name} style={{ background: "#fff", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  {item.packSize}
                  {expected !== null && <span> · Expected: <strong>{expected}</strong></span>}
                </div>
              </div>
              <input
                type="number"
                inputMode="numeric"
                value={val}
                placeholder="—"
                onChange={e => onCountChange(item.name, e.target.value)}
                style={{
                  width: 72, padding: "8px 10px", fontSize: 16, fontWeight: 700,
                  textAlign: "right", border: "1.5px solid",
                  borderColor: val !== "" ? "#1A1A1A" : "var(--border)",
                  borderRadius: 10, outline: "none", background: "var(--bg)", color: "var(--text)",
                }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ position: "fixed", bottom: "calc(var(--nav-h) + 12px)", left: 0, right: 0, padding: "0 16px", zIndex: 30 }}>
        <button
          onClick={onReview}
          disabled={enteredCount === 0}
          style={{
            width: "100%", padding: "15px 0", borderRadius: 14, border: "none",
            fontWeight: 700, fontSize: 16, cursor: enteredCount > 0 ? "pointer" : "not-allowed",
            background: enteredCount > 0 ? "#1A1A1A" : "#E8E8E4",
            color: enteredCount > 0 ? "#fff" : "var(--text-secondary)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          }}
        >
          Review ({enteredCount})
        </button>
      </div>
    </div>
  );
}

// ── Adjust tab ────────────────────────────────────────────────────────────────

function AdjustContent({ items, metrics, stocks, onTap }: {
  items: typeof CATALOG;
  metrics: Record<string, DailyMetrics>;
  stocks: Record<string, BranchStock>;
  onTap: (item: string) => void;
}) {
  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map(item => {
        const m = metrics[item.name];
        const expected = m.beginning !== null ? m.beginning + m.inQty - m.outQty : null;
        const variance = m.endCount !== null && expected !== null ? m.endCount - expected : null;

        let borderColor = "#D1D5DB";
        if (variance !== null) {
          borderColor = variance === 0 ? "#16A34A" : "#DC2626";
        } else {
          const s = stocks[item.name];
          if (s) borderColor = s.qty <= 0 ? "#DC2626" : s.qty <= item.reorderAt ? "#D97706" : "#16A34A";
        }

        const varColor = variance === null ? "var(--text-secondary)" : variance === 0 ? "#16A34A" : "#DC2626";

        return (
          <div key={item.name} onClick={() => onTap(item.name)} style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", cursor: "pointer", borderLeft: `4px solid ${borderColor}`, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px 9px" }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{item.name}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", background: "var(--bg)", padding: "3px 10px", borderRadius: 20 }}>
                {item.packSize}
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
              <MetricCell label="VARIANCE" value={variance} color={varColor} showSign border />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Review Modal ──────────────────────────────────────────────────────────────

function ReviewModal({ items, metrics, endCounts, recountItems, onRecount, onConfirm, onClose }: {
  items: typeof CATALOG;
  metrics: Record<string, DailyMetrics>;
  endCounts: Record<string, string>;
  recountItems: Set<string>;
  onRecount: (item: string) => void;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const rows = items
    .filter(item => endCounts[item.name] !== undefined && endCounts[item.name] !== "")
    .map(item => {
      const m = metrics[item.name];
      const expected = m.beginning !== null ? m.beginning + m.inQty - m.outQty : null;
      const count = Number(endCounts[item.name]);
      const variance = expected !== null ? count - expected : null;
      return { item, expected, count, variance };
    });

  const confirmable = rows.filter(r => !recountItems.has(r.item.name));

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "#fff", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Review End Count</div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-secondary)", padding: 4 }}>✕</button>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
            {confirmable.length} item{confirmable.length !== 1 ? "s" : ""} will be saved · {recountItems.size} flagged for recount
          </div>
        </div>

        <div style={{ flex: 1, padding: "0 0 100px" }}>
          {rows.map(({ item, expected, count, variance }) => {
            const isRecount = recountItems.has(item.name);
            const isBig = variance !== null && Math.abs(variance) > 1;
            return (
              <div key={item.name} style={{
                padding: "12px 16px", borderBottom: "1px solid var(--border)",
                background: isRecount ? "#F9FAFB" : isBig ? "#FFF7ED" : "#fff",
                opacity: isRecount ? 0.5 : 1,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      {item.packSize} · Expected: {expected ?? "—"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{count}</div>
                      {variance !== null && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: variance === 0 ? "#16A34A" : variance > 0 ? "#D97706" : "#DC2626" }}>
                          {variance > 0 ? `+${variance}` : variance === 0 ? "✓" : String(variance)}
                        </div>
                      )}
                    </div>
                    {!isRecount && (
                      <button
                        onClick={() => onRecount(item.name)}
                        style={{ padding: "5px 10px", borderRadius: 8, border: "1.5px solid var(--border)", background: "#fff", color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                      >
                        Recount
                      </button>
                    )}
                    {isRecount && <div style={{ fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic" }}>Recounting</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ position: "sticky", bottom: 0, padding: "12px 16px 32px", background: "#fff", borderTop: "1px solid var(--border)" }}>
          <button
            disabled={saving || confirmable.length === 0}
            onClick={async () => { setSaving(true); await onConfirm(); setSaving(false); }}
            style={{
              width: "100%", padding: "15px 0", borderRadius: 14, border: "none",
              fontWeight: 700, fontSize: 16, cursor: confirmable.length > 0 ? "pointer" : "not-allowed",
              background: confirmable.length > 0 ? "#1A1A1A" : "#E8E8E4",
              color: confirmable.length > 0 ? "#fff" : "var(--text-secondary)",
            }}
          >
            {saving ? "Saving…" : `Confirm ${confirmable.length} count${confirmable.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </>
  );
}

// ── CSV Import Modal (BF only) ─────────────────────────────────────────────────

function CSVImportModal({ branch, department, today, onClose }: { branch: Branch; department: Department; today: string; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"pick" | "preview" | "saving" | "done">("pick");
  const [error, setError] = useState<string | null>(null);
  const [matched, setMatched] = useState<{ item: string; qty: number }[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);

  async function handleFile(file: File) {
    setError(null);
    try {
      const text = await file.text();
      const salesMap = parseSalesCSV(text);
      const mappedPosNames = allMappedPosNames();
      const unmatchedItems: string[] = [];
      for (const posItem of Object.keys(salesMap)) {
        if (!mappedPosNames.has(posItem.trim().toUpperCase())) {
          unmatchedItems.push(posItem);
        }
      }
      const results = applyCsvMapping(salesMap);
      setMatched(results);
      setUnmatched(unmatchedItems);
      setPhase("preview");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to parse CSV");
    }
  }

  async function confirm() {
    setPhase("saving");
    const batch = writeBatch(db);
    const now = Date.now();
    for (const { item, qty } of matched) {
      const catalogItem = CATALOG_MAP.get(item);
      if (!catalogItem) continue;
      const adjRef = doc(collection(db, COLS.adjustments));
      batch.set(adjRef, {
        id: now + Math.random(), branch, department, date: today, item,
        type: "sales_import", qty, loggedBy: BRANCH_LABELS[branch], source: "csv",
      } satisfies StockAdjustment);
      const stockId = stockDocId(branch, department, item);
      batch.set(doc(db, COLS.branchStock, stockId), {
        id: stockId, branch, department, item, category: catalogItem.category,
        unit: catalogItem.unit, qty: 0,
        reorderAt: catalogItem.reorderAt,
        lastUpdated: today, lastUpdatedBy: BRANCH_LABELS[branch],
      }, { merge: true });
    }
    await batch.commit();
    setPhase("done");
  }

  return (
    <>
      <div onClick={phase === "pick" ? onClose : undefined} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }} />
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70, background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)", maxHeight: "90dvh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Import Sales</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-secondary)", padding: 4 }}>✕</button>
        </div>

        {phase === "pick" && (
          <>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
              Upload the daily Utak Product Mix CSV. Sales quantities will be deducted from today's inventory.
            </div>
            {error && <div style={{ background: "#FEF2F2", borderRadius: 10, padding: "10px 14px", color: "#DC2626", fontSize: 13, marginBottom: 16 }}>{error}</div>}
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <button
              onClick={() => fileRef.current?.click()}
              style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: "#1A1A1A", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}
            >
              Choose CSV file
            </button>
          </>
        )}

        {phase === "preview" && (
          <>
            <div style={{ background: "#F0FDF4", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#15803D", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Will deduct — {matched.length} items</div>
              {matched.map(({ item, qty }) => (
                <div key={item} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                  <span>{item}</span>
                  <span style={{ fontWeight: 700, color: "#DC2626" }}>−{qty}</span>
                </div>
              ))}
              {matched.length === 0 && <div style={{ fontSize: 13, color: "#15803D" }}>No commissary items matched.</div>}
            </div>

            {unmatched.length > 0 && (
              <div style={{ background: "#FEF3C7", borderRadius: 10, padding: "10px 14px", marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#D97706", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Not tracked — {unmatched.length} items</div>
                {unmatched.map(item => (
                  <div key={item} style={{ fontSize: 12, color: "#92400E", marginBottom: 2 }}>· {item}</div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setPhase("pick")} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1.5px solid var(--border)", background: "#fff", color: "var(--text)", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>Back</button>
              <button
                onClick={confirm}
                disabled={matched.length === 0}
                style={{ flex: 2, padding: "14px 0", borderRadius: 12, border: "none", background: matched.length > 0 ? "#1A1A1A" : "#E8E8E4", color: matched.length > 0 ? "#fff" : "var(--text-secondary)", fontWeight: 700, fontSize: 15, cursor: matched.length > 0 ? "pointer" : "not-allowed" }}
              >
                Confirm import
              </button>
            </div>
          </>
        )}

        {phase === "saving" && (
          <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-secondary)", fontSize: 15 }}>Saving…</div>
        )}

        {phase === "done" && (
          <>
            <div style={{ textAlign: "center", padding: "12px 0 20px", fontSize: 32 }}>✓</div>
            <div style={{ textAlign: "center", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Import complete</div>
            <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13, marginBottom: 24 }}>
              {matched.length} item{matched.length !== 1 ? "s" : ""} deducted from today's inventory.
            </div>
            <button onClick={onClose} style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: "#1A1A1A", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Done</button>
          </>
        )}
      </div>
    </>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function MetricCell({ label, value, color, prefix, showSign, border }: {
  label: string; value: number | null; color: string;
  prefix?: string; showSign?: boolean; border?: boolean;
}) {
  let display: string;
  if (value === null) display = "—";
  else if (showSign) display = value > 0 ? `+${value}` : value < 0 ? `${value}` : "✓";
  else if (prefix && value > 0) display = `${prefix}${value}`;
  else display = value.toLocaleString();

  return (
    <div style={{ padding: "8px 4px 10px", textAlign: "center", borderLeft: border ? "1px solid var(--border)" : undefined }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: value === null ? "var(--text-secondary)" : color }}>{display}</div>
    </div>
  );
}

// ── Adjust Modal ──────────────────────────────────────────────────────────────

type ModalMode = "beginning" | "adjust" | "count";

function AdjustModal({ item, branch, department, stock, beginningQty, today, onClose }: {
  item: string; branch: Branch; department: Department; stock: BranchStock | null;
  beginningQty: number | null; today: string; onClose: () => void;
}) {
  const catalogItem = CATALOG_MAP.get(item)!;
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
      const beginId = beginningDocId(branch, department, item, today);
      const begDoc: DailyBeginning = { id: beginId, branch, department, item, date: today, qty: qtyNum, setBy: loggedBy, updatedAt: today };
      await saveDocById(COLS.dailyBeginning, beginId, begDoc as unknown as Record<string, unknown>);
    } else {
      const type: StockAdjustment["type"] = mode === "count" ? "count" : qtyNum >= 0 ? "in" : "out";
      const adj: StockAdjustment = { id: now, branch, department, date: today, item, type, qty: Math.abs(qtyNum), loggedBy };
      if (note) adj.note = note;
      const newQty = mode === "count" ? qtyNum : Math.max(0, currentQty + qtyNum);
      const stockId = stockDocId(branch, department, item);
      const stockDoc: BranchStock = {
        id: stockId, branch, department, item, category: catalogItem.category, unit: catalogItem.unit,
        qty: newQty, reorderAt: catalogItem.reorderAt, lastUpdated: today, lastUpdatedBy: loggedBy,
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
  const canSave = qty !== "" && !isNaN(qtyNum) && (mode === "adjust" ? qtyNum !== 0 : qtyNum >= 0);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60 }} />
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70, background: "#fff", borderRadius: "20px 20px 0 0", padding: "20px 20px 40px", boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{item}</div>
            <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 2 }}>
              {catalogItem.packSize} · Stock: <strong>{currentQty}</strong>
              {beginningQty !== null && <span> · BEG: <strong>{beginningQty}</strong></span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: 20, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 6, margin: "16px 0" }}>
          {([{ id: "beginning", label: "Beginning" }, { id: "adjust", label: "Adjust" }, { id: "count", label: "End Count" }] as { id: ModalMode; label: string }[]).map(m => (
            <button key={m.id} onClick={() => { setMode(m.id); setQty(""); }} style={{
              flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 13,
              background: mode === m.id ? "#1A1A1A" : "var(--bg)",
              color: mode === m.id ? "#fff" : "var(--text-secondary)",
            }}>{m.label}</button>
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
            <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" style={inputStyle} />
            <button onClick={() => setQty(q => String((Number(q) || 0) + 1))} style={quickBtnStyle}>+</button>
          </div>
        ) : (
          <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder={`Count in ${catalogItem.unit}`} style={{ ...inputStyle, width: "100%" }} />
        )}

        {mode === "adjust" && qty && !isNaN(Number(qty)) && (
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)" }}>
            New balance: <strong>{Math.max(0, currentQty + Number(qty))} {catalogItem.unit}</strong>
          </div>
        )}

        {mode !== "beginning" && (
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" style={{ ...inputStyle, width: "100%", marginTop: 10 }} />
        )}

        <button onClick={save} disabled={!canSave || loading} style={{
          marginTop: 16, width: "100%", padding: "15px 0", borderRadius: 14, border: "none",
          cursor: canSave ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 16,
          background: canSave ? "#1A1A1A" : "#E8E8E4", color: canSave ? "#fff" : "var(--text-secondary)",
        }}>
          {loading ? "Saving…" : mode === "beginning" ? "Set Beginning" : mode === "count" ? "Save End Count" : "Save Adjustment"}
        </button>
      </div>
    </>
  );
}

// ── Reset Modal ───────────────────────────────────────────────────────────────

function ResetModal({ branch, onClose }: { branch: Branch; onClose: () => void }) {
  const [scope, setScope] = useState<"branch" | "all">("branch");
  const [phase, setPhase] = useState<"confirm" | "running" | "done">("confirm");
  const [log, setLog] = useState<string[]>([]);

  async function runReset() {
    setPhase("running");
    const lines: string[] = [];
    const branchCols = [COLS.branchStock, COLS.adjustments, COLS.dailyBeginning, COLS.pullOuts, COLS.deliveryNotes];
    for (const col of branchCols) {
      const q = scope === "branch" ? query(collection(db, col), where("branch", "==", branch)) : query(collection(db, col));
      const snap = await getDocs(q);
      if (snap.empty) { lines.push(`${col}: nothing to delete`); setLog([...lines]); continue; }
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
      <div onClick={phase === "confirm" ? onClose : undefined} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }} />
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70, background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)" }}>
        {phase === "confirm" && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Reset Demo Data</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>Only clears branch app data. Cannot be undone.</div>
            <div style={{ background: "#FEF2F2", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Will be cleared</div>
              {["branch_stock", "branch_adjustments", "daily_beginning", "pull_outs", "delivery_notes"].map(c => (
                <div key={c} style={{ fontSize: 12, color: "#7F1D1D", marginBottom: 2 }}>· {c}</div>
              ))}
            </div>
            <div style={{ background: "#F0FDF4", borderRadius: 10, padding: "10px 12px", marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#15803D", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Commissary data — untouched</div>
              {["invEntries", "pullout_requests", "all other commissary collections"].map(c => (
                <div key={c} style={{ fontSize: 12, color: "#14532D", marginBottom: 2 }}>· {c}</div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {(["branch", "all"] as const).map(s => (
                <button key={s} onClick={() => setScope(s)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: scope === s ? "#1A1A1A" : "var(--bg)", color: scope === s ? "#fff" : "var(--text-secondary)" }}>
                  {s === "branch" ? "This branch only" : "All branches"}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1.5px solid var(--border)", background: "#fff", color: "var(--text-secondary)", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>Cancel</button>
              <button onClick={runReset} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "none", background: "#DC2626", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Wipe Data</button>
            </div>
          </>
        )}
        {phase === "running" && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Resetting…</div>
            {log.map((l, i) => <div key={i} style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>{l}</div>)}
          </>
        )}
        {phase === "done" && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Done ✓</div>
            {log.map((l, i) => <div key={i} style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>{l}</div>)}
            <button onClick={onClose} style={{ marginTop: 20, width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: "#1A1A1A", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Close</button>
          </>
        )}
      </div>
    </>
  );
}

// ── End Count Completed (locked) ──────────────────────────────────────────────

function EndCountCompleted({ dayClose }: { dayClose: DailyClose }) {
  const rows = Object.entries(dayClose.items).sort(([a], [b]) => a.localeCompare(b));
  const closedTime = new Date(dayClose.closedAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true });

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ margin: "12px 16px", background: "#F0FDF4", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#15803D" }}>End Count Confirmed ✓</div>
        <div style={{ fontSize: 12, color: "#16A34A", marginTop: 2 }}>
          {dayClose.countType === "manual" ? `${dayClose.closedBy} · ${closedTime}` : "Auto-closed by system"}
        </div>
      </div>

      <div>
        {rows.map(([item, data]) => {
          const varColor = data.variance === 0 ? "#16A34A" : data.variance > 0 ? "#D97706" : "#DC2626";
          return (
            <div key={item} style={{ background: "#fff", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Expected: {data.expected} · BEG: {data.beginning}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{data.endCount}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: varColor }}>
                  {data.variance > 0 ? `+${data.variance}` : data.variance === 0 ? "✓" : String(data.variance)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
