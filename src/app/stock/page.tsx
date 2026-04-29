"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getSession, logout, BRANCH_LABELS, DEPARTMENT_LABELS, BRANCH_POS_TYPE, STAFF_NAMES } from "@/lib/auth";
import { db, COLS, saveDocById } from "@/lib/firebase";
import { CATALOG, stockDocId, beginningDocId } from "@/lib/items";
import { collection, onSnapshot, query, where, getDocs, writeBatch, doc } from "@/lib/firebase";
import type { Branch, Department, BranchStock, StockAdjustment, DailyBeginning, DailyClose } from "@/lib/types";
import BottomNav from "@/components/BottomNav";

import {
  todayPHT, syncDatePHT, addDays, weekMonday, computeMetrics, matchesFilter,
  CATEGORY_FILTERS,
  type SubTab, type FilterTab,
} from "./_lib/helpers";
import { DailyContent, type ImportWarning } from "./_components/DailyContent";
import { ManualCountContent } from "./_components/ManualCountContent";
import { ManualCountCompleted } from "./_components/ManualCountCompleted";
import { ReviewModal } from "./_components/ReviewModal";
import { StoreHubSyncModal } from "./_components/StoreHubSyncModal";
import { CSVImportModal } from "./_components/CSVImportModal";
import { ResetModal } from "./_components/ResetModal";

export default function StockPage() {
  const router = useRouter();
  const [today] = useState(todayPHT);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [department, setDept] = useState<Department | null>(null);
  const [stocks, setStocks] = useState<Record<string, BranchStock>>({});
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [beginnings, setBeginnings] = useState<Record<string, number>>({});
  const [dayClose, setDayClose] = useState<DailyClose | null>(null);

  const [subTab, setSubTab] = useState<SubTab>("daily");
  const [categoryFilter, setCategoryFilter] = useState<FilterTab>("all");

  // Daily tab
  const [summaryDate, setSummaryDate] = useState(todayPHT);
  const [summaryAdj, setSummaryAdj] = useState<StockAdjustment[]>([]);
  const [summaryBeg, setSummaryBeg] = useState<Record<string, number>>({});
  const [varOnly, setVarOnly] = useState(false);

  // Manual count tab
  const [endCounts, setEndCounts] = useState<Record<string, string>>({});
  const [countedBy, setCountedBy] = useState(() => getSession()?.staffName ?? "");
  const [showReview, setShowReview] = useState(false);
  const [recountItems, setRecountItems] = useState<Set<string>>(new Set());

  // Modals
  const [showReset, setShowReset] = useState(false);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [showStoreHubSync, setShowStoreHubSync] = useState(false);

  // Import warning (persisted to localStorage)
  const [importWarning, setImportWarning] = useState<ImportWarning | null>(null);

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

    const adjQ = query(collection(db, COLS.adjustments), where("branch", "==", b), where("department", "==", dept), where("date", "==", todayPHT()));
    const unsubAdj = onSnapshot(adjQ, snap => setAdjustments(snap.docs.map(d => d.data() as StockAdjustment)));

    const begQ = query(collection(db, COLS.dailyBeginning), where("branch", "==", b), where("department", "==", dept), where("date", "==", todayPHT()));
    const unsubBeg = onSnapshot(begQ, snap => {
      const map: Record<string, number> = {};
      snap.docs.forEach(d => { const beg = d.data() as DailyBeginning; map[beg.item] = beg.qty; });
      setBeginnings(map);
    });

    const closeQ = query(collection(db, COLS.dailyClose), where("branch", "==", b), where("department", "==", dept), where("date", "==", todayPHT()));
    const unsubClose = onSnapshot(closeQ, snap => {
      setDayClose(snap.empty ? null : snap.docs[0].data() as DailyClose);
    });

    return () => { unsubStock(); unsubAdj(); unsubBeg(); unsubClose(); };
  }, [router]);

  // Load localStorage once when branch/dept resolved
  useEffect(() => {
    if (!branch || !department) return;
    const savedCounts = localStorage.getItem(`counts_${branch}_${department}_${today}`);
    if (savedCounts) {
      try { setEndCounts(JSON.parse(savedCounts)); } catch {}
    }
    const savedWarn = localStorage.getItem(`salesWarn_${branch}_${department}_${today}`);
    if (savedWarn) {
      try { setImportWarning(JSON.parse(savedWarn)); } catch {}
    }
  }, [branch, department, today]);

  // Persist endCounts to localStorage on change
  useEffect(() => {
    if (!branch || !department) return;
    localStorage.setItem(`counts_${branch}_${department}_${today}`, JSON.stringify(endCounts));
  }, [endCounts, branch, department, today]);

  // Fetch Daily tab data when summaryDate changes
  useEffect(() => {
    if (!branch || !department) return;
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

  const deptCatalog = useMemo(() =>
    (department && branch)
      ? CATALOG.filter(i => i.department === department && (!i.branches || i.branches.includes(branch)))
      : [],
  [department, branch]);

  const dailyMetrics = useMemo(() => computeMetrics(deptCatalog, adjustments, beginnings), [deptCatalog, adjustments, beginnings]);
  const summaryMetrics = useMemo(() => computeMetrics(deptCatalog, summaryAdj, summaryBeg), [deptCatalog, summaryAdj, summaryBeg]);
  const filtered = useMemo(() => deptCatalog.filter(item => matchesFilter(item, categoryFilter)), [deptCatalog, categoryFilter]);

  const lowCount  = deptCatalog.filter(i => { const s = stocks[i.name]; return s && s.qty <= i.reorderAt && s.qty > 0; }).length;
  const critCount = deptCatalog.filter(i => { const s = stocks[i.name]; return !s || s.qty <= 0; }).length;
  const posType = branch ? BRANCH_POS_TYPE[branch] : null;

  function handleImportComplete(matchedCount: number, unmatchedCount: number, source: "csv" | "storehub") {
    if (!branch || !department) return;
    const warn: import("./_components/DailyContent").ImportWarning = { source, matchedCount, unmatchedCount };
    setImportWarning(warn);
    const key = `salesWarn_${branch}_${department}_${today}`;
    localStorage.setItem(key, JSON.stringify(warn));
  }

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
            {posType === "storehub" && (
              <button onClick={() => setShowStoreHubSync(true)} style={{ background: "#EFF6FF", border: "none", color: "#2563EB", cursor: "pointer", fontSize: 12, padding: "4px 10px", fontWeight: 600, borderRadius: 8 }}>
                Sync sales
              </button>
            )}
            <button onClick={() => setShowReset(true)} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 12, padding: "4px 8px", fontWeight: 500 }}>Reset</button>
            <button onClick={() => { logout(); router.replace("/login"); }} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, padding: "4px 8px" }}>Log out</button>
          </div>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: "flex", gap: 2, marginBottom: 0 }}>
          {([
            { id: "daily",       label: "Daily" },
            { id: "manualcount", label: "Manual count" },
          ] as { id: SubTab; label: string }[]).map(tab => (
            <button key={tab.id} onClick={() => setSubTab(tab.id)} style={{
              flex: 1, padding: "9px 4px", border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 13, background: "transparent",
              color: subTab === tab.id ? "#1A1A1A" : "var(--text-secondary)",
              borderBottom: subTab === tab.id ? "2px solid #1A1A1A" : "2px solid transparent",
            }}>{tab.label}</button>
          ))}
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
      {subTab === "daily" && (
        <DailyContent
          items={filtered}
          metrics={summaryMetrics}
          summaryDate={summaryDate}
          today={today}
          varOnly={varOnly}
          onDateChange={setSummaryDate}
          onVarOnlyChange={setVarOnly}
          branch={branch}
          importWarning={importWarning}
        />
      )}
      {subTab === "manualcount" && (
        dayClose?.isLocked
          ? <ManualCountCompleted dayClose={dayClose} />
          : <ManualCountContent
              items={filtered}
              metrics={dailyMetrics}
              endCounts={endCounts}
              countedBy={countedBy}
              staffNames={STAFF_NAMES[department]}
              onCountedByChange={setCountedBy}
              onCountChange={(item, val) => setEndCounts(prev => ({ ...prev, [item]: val }))}
              onReview={() => setShowReview(true)}
            />
      )}
      {/* ── Modals ── */}
      {showReview && (
        <ReviewModal
          items={filtered}
          metrics={dailyMetrics}
          endCounts={endCounts}
          countedBy={countedBy}
          recountItems={recountItems}
          onRecount={item => setRecountItems(prev => new Set([...prev, item]))}
          onConfirm={async () => {
            const batch = writeBatch(db);
            const now = Date.now();
            const closeItems: DailyClose["items"] = {};
            const submittedToday = todayPHT();
            const loggedBy = countedBy || BRANCH_LABELS[branch];
            for (const item of filtered) {
              if (recountItems.has(item.name)) continue;
              const val = endCounts[item.name];
              if (val === undefined || val === "") continue;
              const qty = Number(val);
              if (isNaN(qty) || qty < 0) continue;
              const adjRef = doc(collection(db, COLS.adjustments));
              batch.set(adjRef, { id: now + Math.random(), branch, department, date: submittedToday, item: item.name, type: "count", qty, loggedBy });
              const stockId = stockDocId(branch, department, item.name);
              batch.set(doc(db, COLS.branchStock, stockId), {
                id: stockId, branch, department, item: item.name, category: item.category,
                unit: item.unit, qty, reorderAt: item.reorderAt,
                lastUpdated: submittedToday, lastUpdatedBy: loggedBy,
              });
              const m = dailyMetrics[item.name];
              const expected = m.beginning !== null ? m.beginning + m.inQty - m.outQty : qty;
              closeItems[item.name] = {
                beginning: m.beginning ?? 0, inQty: m.inQty, outQty: m.outQty,
                expected, endCount: qty, variance: qty - expected,
              };
            }
            await batch.commit();

            const closeId = `${branch}__${department}__${submittedToday}`;
            await saveDocById(COLS.dailyClose, closeId, {
              id: closeId, branch, department, date: submittedToday,
              countType: "manual", closedAt: new Date().toISOString(),
              closedBy: loggedBy, isLocked: true, items: closeItems,
            });

            const tomorrow = addDays(submittedToday, 1);
            const begBatch = writeBatch(db);
            let begCount = 0;
            for (const [itemName, data] of Object.entries(closeItems)) {
              const begId = beginningDocId(branch, department, itemName, tomorrow);
              begBatch.set(doc(db, COLS.dailyBeginning, begId), {
                id: begId, branch, department, item: itemName, date: tomorrow,
                qty: data.endCount, setBy: loggedBy, updatedAt: submittedToday,
              });
              begCount++;
            }
            if (begCount > 0) await begBatch.commit();

            localStorage.removeItem(`counts_${branch}_${department}_${submittedToday}`);
            setEndCounts({});
            setRecountItems(new Set());
            setShowReview(false);
          }}
          onClose={() => { setRecountItems(new Set()); setShowReview(false); }}
        />
      )}

      {showReset && <ResetModal branch={branch} onClose={() => setShowReset(false)} />}

      {showStoreHubSync && (
        <StoreHubSyncModal
          branch={branch}
          department={department}
          today={syncDatePHT()}
          onClose={() => setShowStoreHubSync(false)}
          onComplete={(matched, unmatched) => handleImportComplete(matched, unmatched, "storehub")}
        />
      )}

      {showCSVImport && (
        <CSVImportModal
          branch={branch}
          department={department}
          today={today}
          onClose={() => setShowCSVImport(false)}
          onComplete={(matched, unmatched) => handleImportComplete(matched, unmatched, "csv")}
        />
      )}

      <BottomNav />
    </div>
  );
}
