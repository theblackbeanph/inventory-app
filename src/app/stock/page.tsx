"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSession, logout, BRANCH_LABELS, DEPARTMENT_LABELS, BRANCH_POS_TYPE } from "@/lib/auth";
import { auth, db, COLS, saveDocById } from "@/lib/firebase";
import { CATALOG, stockDocId, beginningDocId } from "@/lib/items";
import { collection, onSnapshot, query, where, getDocs, writeBatch, doc, deleteDoc } from "@/lib/firebase";
import type { Branch, Department, BranchStock, StockAdjustment, DailyBeginning, DailyClose, StocktakeDraft, DeliveryDraft, DeliveryClose } from "@/lib/types";
import BottomNav from "@/components/BottomNav";

import {
  todayPHT, businessDatePHT, syncDatePHT, addDays, computeMetrics, matchesFilter,
  type SubTab, type FilterTab,
} from "./_lib/helpers";
import { DailyContent } from "./_components/DailyContent";
import { StocktakeContent } from "./_components/StocktakeContent";
import { StocktakeCompleted } from "./_components/StocktakeCompleted";
import { StocktakeReviewSheet } from "./_components/StocktakeReviewSheet";
import { DeliveryContent } from "./_components/DeliveryContent";
import { DeliveryCompleted } from "./_components/DeliveryCompleted";
import { DeliveryReviewSheet } from "./_components/DeliveryReviewSheet";
import { StoreHubSyncModal } from "./_components/StoreHubSyncModal";
import { CSVImportModal } from "./_components/CSVImportModal";
import { WasteEntrySheet, type WasteReason } from "./_components/WasteEntrySheet";

export default function StockPage() {
  const router = useRouter();
  const [today] = useState(businessDatePHT);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [department, setDept] = useState<Department | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [stocks, setStocks] = useState<Record<string, BranchStock>>({});
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [beginnings, setBeginnings] = useState<Record<string, number>>({});
  const [dayClose, setDayClose] = useState<DailyClose | null>(null);

  const [subTab, setSubTab] = useState<SubTab>("daily");
  const [categoryFilter] = useState<FilterTab>("all");

  // Daily tab
  const [summaryDate, setSummaryDate] = useState(businessDatePHT);
  const [summaryAdj, setSummaryAdj] = useState<StockAdjustment[]>([]);
  const [summaryBeg, setSummaryBeg] = useState<Record<string, number>>({});
  const [activeFilter, setActiveFilter] = useState<"variance" | "low" | "oos" | null>(null);

  // Stocktake tab
  const [stocktakeDate, setStocktakeDate] = useState(businessDatePHT);
  const [stocktakeAdjustments, setStocktakeAdjustments] = useState<StockAdjustment[]>([]);
  const [stocktakeBeginnings, setStocktakeBeginnings] = useState<Record<string, number>>({});
  const [stocktakeDayClose, setStocktakeDayClose] = useState<DailyClose | null>(null);
  const [endCounts, setEndCounts] = useState<Record<string, string>>({});
  // not rendered — used only in handleSubmitAll to delete persisted draft docs after submit
  const [drafts, setDrafts] = useState<Record<string, StocktakeDraft>>({});
  const [showSubmitAll, setShowSubmitAll] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const draftsInitRef = useRef(false);

  // Delivery tab
  const [deliveryDate, setDeliveryDate] = useState(businessDatePHT);
  const [deliveryCounts, setDeliveryCounts] = useState<Record<string, string>>({});
  const [showDeliveryReview, setShowDeliveryReview] = useState(false);
  const [deliverySubmitLoading, setDeliverySubmitLoading] = useState(false);
  const deliverySubmittingRef = useRef(false);
  const deliveryDraftsInitRef = useRef(false);
  const [deliveryClose, setDeliveryClose] = useState<DeliveryClose | null>(null);
  const [deliveryAdjClose, setDeliveryAdjClose] = useState<DeliveryClose | null>(null);
  // Firestore doc IDs of delivery-related adjustments, keyed by item name
  const [deliveryAdjDocIds, setDeliveryAdjDocIds] = useState<Record<string, string[]>>({});

  // Waste
  const [wasteItem, setWasteItem] = useState<string | null>(null);
  const [wasteLoading, setWasteLoading] = useState(false);
  const wasteSubmittingRef = useRef(false);

  // Modals
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [showStoreHubSync, setShowStoreHubSync] = useState(false);


  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    setBranch(session.branch);
    setDept(session.department);
    setRole(session.role);
    const b = session.branch;
    const dept = session.department;

    const stockQ = query(collection(db, COLS.branchStock), where("branch", "==", b), where("department", "==", dept));
    const unsubStock = onSnapshot(stockQ, snap => {
      const map: Record<string, BranchStock> = {};
      snap.docs.forEach(d => { const s = d.data() as BranchStock; map[s.item] = s; });
      setStocks(map);
    });

    const adjQ = query(collection(db, COLS.adjustments), where("branch", "==", b), where("department", "==", dept), where("date", "==", businessDatePHT()));
    const unsubAdj = onSnapshot(adjQ, snap => setAdjustments(snap.docs.map(d => d.data() as StockAdjustment)));

    const begQ = query(collection(db, COLS.dailyBeginning), where("branch", "==", b), where("department", "==", dept), where("date", "==", businessDatePHT()));
    const unsubBeg = onSnapshot(begQ, snap => {
      const map: Record<string, number> = {};
      snap.docs.forEach(d => { const beg = d.data() as DailyBeginning; map[beg.item] = beg.qty; });
      setBeginnings(map);
    });

    const closeQ = query(collection(db, COLS.dailyClose), where("branch", "==", b), where("department", "==", dept), where("date", "==", businessDatePHT()));
    const unsubClose = onSnapshot(closeQ, snap => {
      setDayClose(snap.empty ? null : snap.docs[0].data() as DailyClose);
    });

    return () => { unsubStock(); unsubAdj(); unsubBeg(); unsubClose(); };
  }, [router]);

  useEffect(() => {
    if (!branch || !department) return;
    draftsInitRef.current = false;

    const adjQ = query(collection(db, COLS.adjustments), where("branch", "==", branch), where("department", "==", department), where("date", "==", stocktakeDate));
    const unsubAdj = onSnapshot(adjQ, snap => setStocktakeAdjustments(snap.docs.map(d => d.data() as StockAdjustment)));

    const begQ = query(collection(db, COLS.dailyBeginning), where("branch", "==", branch), where("department", "==", department), where("date", "==", stocktakeDate));
    const unsubBeg = onSnapshot(begQ, snap => {
      const map: Record<string, number> = {};
      snap.docs.forEach(d => { const beg = d.data() as DailyBeginning; map[beg.item] = beg.qty; });
      setStocktakeBeginnings(map);
    });

    const closeQ = query(collection(db, COLS.dailyClose), where("branch", "==", branch), where("department", "==", department), where("date", "==", stocktakeDate));
    const unsubClose = onSnapshot(closeQ, snap => {
      setStocktakeDayClose(snap.empty ? null : snap.docs[0].data() as DailyClose);
    });

    const draftQ = query(collection(db, COLS.stocktakeDrafts), where("branch", "==", branch), where("department", "==", department), where("date", "==", stocktakeDate));
    const unsubDrafts = onSnapshot(draftQ, snap => {
      const map: Record<string, StocktakeDraft> = {};
      snap.docs.forEach(d => { const dr = d.data() as StocktakeDraft; map[dr.location] = dr; });
      if (!draftsInitRef.current) {
        draftsInitRef.current = true;
        const counts: Record<string, string> = {};
        for (const dr of Object.values(map)) {
          for (const [item, qty] of Object.entries(dr.counts)) {
            counts[item] = String(qty);
          }
        }
        if (Object.keys(counts).length > 0) setEndCounts(counts);
      }
      setDrafts(map);
    });

    return () => { unsubAdj(); unsubBeg(); unsubClose(); unsubDrafts(); };
  }, [branch, department, stocktakeDate]);

  useEffect(() => {
    if (!branch || !department) return;
    deliveryDraftsInitRef.current = false;
    setDeliveryClose(null);
    setDeliveryAdjClose(null);
    setDeliveryAdjDocIds({});

    const closeId = `${branch}__${department}__${deliveryDate}`;
    const unsubClose = onSnapshot(doc(db, COLS.deliveryClose, closeId), snap => {
      setDeliveryClose(snap.exists() ? (snap.data() as DeliveryClose) : null);
    });

    const adjQ = query(
      collection(db, COLS.adjustments),
      where("branch", "==", branch),
      where("department", "==", department),
      where("date", "==", deliveryDate),
    );
    const unsubAdj = onSnapshot(adjQ, snap => {
      const docIdsByItem: Record<string, string[]> = {};
      const items: Record<string, number> = {};
      let loggedBy = "";
      let closedAtMs = 0;

      for (const snapDoc of snap.docs) {
        const adj = snapDoc.data() as StockAdjustment;
        const isOriginal = adj.type === "in" && adj.note === "manual delivery";
        const isCorrection = adj.note === "delivery correction";
        if (isOriginal || isCorrection) {
          if (!docIdsByItem[adj.item]) docIdsByItem[adj.item] = [];
          docIdsByItem[adj.item].push(snapDoc.id);
        }
        if (isOriginal) {
          items[adj.item] = (items[adj.item] ?? 0) + adj.qty;
          if (!loggedBy) loggedBy = adj.loggedBy;
          const ts = Math.floor(adj.id);
          if (ts > closedAtMs) closedAtMs = ts;
        }
      }

      setDeliveryAdjDocIds(docIdsByItem);
      if (Object.keys(items).length === 0) { setDeliveryAdjClose(null); return; }
      setDeliveryAdjClose({
        id: closeId, branch, department, date: deliveryDate,
        items, closedAt: new Date(closedAtMs).toISOString(), closedBy: loggedBy,
      });
    });

    const draftRef = doc(db, COLS.deliveryDrafts, closeId);
    const unsubDraft = onSnapshot(draftRef, snap => {
      if (!deliveryDraftsInitRef.current) {
        deliveryDraftsInitRef.current = true;
        if (snap.exists()) {
          const draft = snap.data() as DeliveryDraft;
          const counts: Record<string, string> = {};
          for (const [item, qty] of Object.entries(draft.counts)) {
            counts[item] = String(qty);
          }
          if (Object.keys(counts).length > 0) setDeliveryCounts(counts);
        }
      }
    });
    return () => { unsubClose(); unsubAdj(); unsubDraft(); };
  }, [branch, department, deliveryDate]);


  // Fetch Daily tab data when summaryDate changes
  useEffect(() => {
    if (!branch || !department) return;
    if (summaryDate === today) {
      setSummaryAdj(adjustments);
      setSummaryBeg(beginnings);
      return;
    }
    const adjQ = query(collection(db, COLS.adjustments), where("branch", "==", branch), where("department", "==", department), where("date", "==", summaryDate));
    const begQ = query(collection(db, COLS.dailyBeginning), where("branch", "==", branch), where("department", "==", department), where("date", "==", summaryDate));
    const unsubAdj = onSnapshot(adjQ, snap => setSummaryAdj(snap.docs.map(d => d.data() as StockAdjustment)));
    const unsubBeg = onSnapshot(begQ, snap => {
      const map: Record<string, number> = {};
      snap.docs.forEach(d => { const b = d.data() as DailyBeginning; map[b.item] = b.qty; });
      setSummaryBeg(map);
    });
    return () => { unsubAdj(); unsubBeg(); };
  }, [branch, department, summaryDate, today, adjustments, beginnings]);

  const deptCatalog = useMemo(() =>
    (department && branch)
      ? CATALOG.filter(i => i.department === department && (!i.branches || i.branches.includes(branch)))
      : [],
  [department, branch]);

  const dailyMetrics = useMemo(() => computeMetrics(deptCatalog, adjustments, beginnings), [deptCatalog, adjustments, beginnings]);
  const summaryMetrics = useMemo(() => computeMetrics(deptCatalog, summaryAdj, summaryBeg), [deptCatalog, summaryAdj, summaryBeg]);
  const stocktakeMetrics = useMemo(() => computeMetrics(deptCatalog, stocktakeAdjustments, stocktakeBeginnings), [deptCatalog, stocktakeAdjustments, stocktakeBeginnings]);
  const filtered = useMemo(() => deptCatalog.filter(item => matchesFilter(item, categoryFilter)), [deptCatalog, categoryFilter]);
  const deliveryItems = useMemo(() => filtered.filter(i => !i.commissary), [filtered]);

  const lowCount  = deptCatalog.filter(i => { const m = dailyMetrics[i.name]; if (!m || m.beginning === null) return false; const avail = m.endCount !== null ? m.endCount : (m.beginning + m.inQty - m.outQty); return avail > 0 && avail <= i.reorderAt; }).length;
  const critCount = deptCatalog.filter(i => { const m = dailyMetrics[i.name]; if (!m || m.beginning === null) return false; const avail = m.endCount !== null ? m.endCount : (m.beginning + m.inQty - m.outQty); return avail <= 0; }).length;
  const lowItems  = new Set(deptCatalog.filter(i => { const m = dailyMetrics[i.name]; if (!m || m.beginning === null) return false; const avail = m.endCount !== null ? m.endCount : (m.beginning + m.inQty - m.outQty); return avail > 0 && avail <= i.reorderAt; }).map(i => i.name));
  const oosItems  = new Set(deptCatalog.filter(i => { const m = dailyMetrics[i.name]; if (!m || m.beginning === null) return false; const avail = m.endCount !== null ? m.endCount : (m.beginning + m.inQty - m.outQty); return avail <= 0; }).map(i => i.name));
  const posType = branch ? BRANCH_POS_TYPE[branch] : null;


  function handleStocktakeDateChange(newDate: string) {
    setEndCounts({});
    setStocktakeDate(newDate);
  }

  function handleDeliveryDateChange(newDate: string) {
    setDeliveryCounts({});
    setDeliveryDate(newDate);
  }

  async function handleLogWaste(item: string, qty: number, reason: WasteReason) {
    if (!branch || !department || wasteSubmittingRef.current) return;
    wasteSubmittingRef.current = true;
    setWasteLoading(true);
    try {
      await auth.authStateReady();
      const loggedBy = getSession()?.displayName ?? BRANCH_LABELS[branch];
      const currentQty = stocks[item]?.qty ?? 0;
      const batch = writeBatch(db);

      const adjRef = doc(collection(db, COLS.adjustments));
      batch.set(adjRef, {
        id: adjRef.id, branch, department, date: today,
        item, type: "waste", qty, loggedBy, note: reason,
      });

      batch.set(doc(db, COLS.branchStock, stockDocId(branch, department, item)), {
        qty: Math.max(0, currentQty - qty), lastUpdated: today, lastUpdatedBy: loggedBy,
      }, { merge: true });

      await batch.commit();
      setWasteItem(null);
    } finally {
      wasteSubmittingRef.current = false;
      setWasteLoading(false);
    }
  }

  async function handleDeliverySave() {
    if (!branch || !department) return;
    const session = getSession();
    const counts: Record<string, number> = {};
    for (const [item, val] of Object.entries(deliveryCounts)) {
      if (val !== "") {
        const n = Number(val);
        if (!isNaN(n) && n >= 0) counts[item] = n;
      }
    }
    await auth.authStateReady();
    const draftId = `${branch}__${department}__${deliveryDate}`;
    await saveDocById(COLS.deliveryDrafts, draftId, {
      id: draftId, branch, department, date: deliveryDate,
      counts, savedAt: new Date().toISOString(),
      savedBy: session?.displayName ?? BRANCH_LABELS[branch],
    });
  }

  async function handleDeliverySubmit() {
    if (!branch || !department) return;
    if (deliverySubmittingRef.current) return;
    deliverySubmittingRef.current = true;
    setDeliverySubmitLoading(true);
    try {
      await auth.authStateReady();
      const loggedBy = getSession()?.displayName ?? BRANCH_LABELS[branch];
      const batch = writeBatch(db);
      const now = Date.now();
      for (const item of deptCatalog) {
        const val = deliveryCounts[item.name];
        if (val === undefined || val === "") continue;
        const qty = Number(val);
        if (isNaN(qty) || qty <= 0) continue;
        const adjRef = doc(collection(db, COLS.adjustments));
        batch.set(adjRef, {
          id: now + Math.random(), branch, department, date: deliveryDate,
          item: item.name, type: "in", qty, loggedBy, note: "manual delivery",
        });
      }
      await batch.commit();

      const closeId = `${branch}__${department}__${deliveryDate}`;
      await deleteDoc(doc(db, COLS.deliveryDrafts, closeId));

      const closeItems: Record<string, number> = {};
      for (const item of deptCatalog) {
        const val = deliveryCounts[item.name];
        if (val === undefined || val === "") continue;
        const qty = Number(val);
        if (!isNaN(qty) && qty > 0) closeItems[item.name] = qty;
      }
      await saveDocById(COLS.deliveryClose, closeId, {
        id: closeId, branch, department, date: deliveryDate,
        items: closeItems, closedAt: new Date().toISOString(), closedBy: loggedBy,
      });

      setDeliveryCounts({});
      setShowDeliveryReview(false);
    } finally {
      deliverySubmittingRef.current = false;
      setDeliverySubmitLoading(false);
    }
  }

  async function handleSaveLocation(location: string) {
    if (!branch || !department) return;
    const session = getSession();
    const locItems = deptCatalog.filter(i => i.location === location);
    const counts: Record<string, number> = {};
    for (const item of locItems) {
      const val = endCounts[item.name];
      if (val !== undefined && val !== "") {
        const n = Number(val);
        if (!isNaN(n) && n >= 0) counts[item.name] = n;
      }
    }
    await auth.authStateReady();
    const draftId = `${branch}__${department}__${stocktakeDate}__${location}`;
    await saveDocById(COLS.stocktakeDrafts, draftId, {
      id: draftId, branch, department, date: stocktakeDate, location,
      counts, savedAt: new Date().toISOString(),
      savedBy: session?.displayName ?? BRANCH_LABELS[branch],
    });
  }

  async function handleSubmitAll() {
    if (!branch || !department) return;
    setSubmitLoading(true);
    try {
      await auth.authStateReady();
      const batch = writeBatch(db);
      const now = Date.now();
      const closeItems: DailyClose["items"] = {};
      const submittedToday = stocktakeDate;
      const loggedBy = getSession()?.displayName ?? BRANCH_LABELS[branch];

      for (const item of deptCatalog) {
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
        const m = stocktakeMetrics[item.name];
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

      // Delete all draft docs for today
      if (Object.keys(drafts).length > 0) {
        const draftBatch = writeBatch(db);
        for (const draft of Object.values(drafts)) {
          draftBatch.delete(doc(db, COLS.stocktakeDrafts, draft.id));
        }
        await draftBatch.commit();
      }

      setEndCounts({});
      setShowSubmitAll(false);
    } finally {
      setSubmitLoading(false);
    }
  }

  async function handleCorrectCount(item: string, newQty: number) {
    if (!branch || !department || !stocktakeDayClose) return;
    await auth.authStateReady();
    const loggedBy = getSession()?.displayName ?? BRANCH_LABELS[branch];
    const closeId = `${branch}__${department}__${stocktakeDate}`;
    const currentItem = stocktakeDayClose.items[item];
    const batch = writeBatch(db);

    batch.set(doc(db, COLS.branchStock, stockDocId(branch, department, item)), {
      qty: newQty, lastUpdated: stocktakeDate, lastUpdatedBy: loggedBy,
    }, { merge: true });

    const updatedItems = {
      ...stocktakeDayClose.items,
      [item]: { ...currentItem, endCount: newQty, variance: newQty - currentItem.expected },
    };
    batch.set(doc(db, COLS.dailyClose, closeId), { items: updatedItems }, { merge: true });

    const tomorrow = addDays(stocktakeDate, 1);
    batch.set(doc(db, COLS.dailyBeginning, beginningDocId(branch, department, item, tomorrow)), {
      qty: newQty, setBy: loggedBy, updatedAt: stocktakeDate,
    }, { merge: true });

    const adjRef = doc(collection(db, COLS.adjustments));
    batch.set(adjRef, {
      id: adjRef.id, branch, department, date: stocktakeDate,
      item, type: "correction", qty: newQty, loggedBy,
    });

    await batch.commit();
  }

  async function handleAddMissingStocktakeItem(item: string, qty: number) {
    if (!branch || !department || !stocktakeDayClose) return;
    await auth.authStateReady();
    const loggedBy = getSession()?.displayName ?? BRANCH_LABELS[branch];
    const closeId = `${branch}__${department}__${stocktakeDate}`;

    const beginning = stocktakeBeginnings[item] ?? 0;
    const inQty = stocktakeAdjustments
      .filter(a => a.item === item && a.type === "in")
      .reduce((sum, a) => sum + a.qty, 0);
    const outQty = stocktakeAdjustments
      .filter(a => a.item === item && (a.type === "out" || a.type === "waste"))
      .reduce((sum, a) => sum + a.qty, 0);
    const expected = beginning + inQty - outQty;
    const variance = qty - expected;

    const batch = writeBatch(db);

    const adjRef = doc(collection(db, COLS.adjustments));
    batch.set(adjRef, {
      id: adjRef.id, branch, department, date: stocktakeDate,
      item, type: "count", qty, loggedBy,
    });

    batch.set(doc(db, COLS.branchStock, stockDocId(branch, department, item)), {
      qty, lastUpdated: stocktakeDate, lastUpdatedBy: loggedBy,
    }, { merge: true });

    const updatedItems = {
      ...stocktakeDayClose.items,
      [item]: { beginning, inQty, outQty, expected, endCount: qty, variance },
    };
    batch.set(doc(db, COLS.dailyClose, closeId), { items: updatedItems }, { merge: true });

    const tomorrow = addDays(stocktakeDate, 1);
    batch.set(doc(db, COLS.dailyBeginning, beginningDocId(branch, department, item, tomorrow)), {
      qty, setBy: loggedBy, updatedAt: stocktakeDate,
    }, { merge: true });

    await batch.commit();
  }

  async function handleDeliveryCorrect(item: string, newQty: number) {
    if (!branch || !department) return;
    const effective = deliveryClose ?? deliveryAdjClose;
    if (!effective) return;
    // No newQty === currentQty early return here — handler is idempotent (delete all docs,
    // write one clean one), so re-running on an unchanged qty is safe and necessary to clean
    // up duplicate adjustment docs from a double-submit. Don't add it back as an optimization.
    await auth.authStateReady();
    if (!auth.currentUser) throw new Error("Session expired — please log out and log back in.");
    const loggedBy = getSession()?.displayName ?? BRANCH_LABELS[branch];
    const batch = writeBatch(db);

    // Delete all existing delivery-related adjustments for this item
    // (covers both original "manual delivery" IN and any old "delivery correction" delta docs)
    for (const docId of (deliveryAdjDocIds[item] ?? [])) {
      batch.delete(doc(db, COLS.adjustments, docId));
    }

    // Recreate a clean "in" adjustment at the corrected qty (omit entirely if qty = 0)
    if (newQty > 0) {
      const adjRef = doc(collection(db, COLS.adjustments));
      batch.set(adjRef, {
        id: adjRef.id, branch, department, date: deliveryDate,
        item, type: "in", qty: newQty, loggedBy, note: "manual delivery",
      });
    }

    // Write/update the deliveryClose doc so the confirmed view reflects the correction
    const closeId = `${branch}__${department}__${deliveryDate}`;
    const updatedItems = { ...effective.items };
    if (newQty > 0) {
      updatedItems[item] = newQty;
    } else {
      delete updatedItems[item];
    }
    batch.set(doc(db, COLS.deliveryClose, closeId), {
      id: closeId, branch, department, date: effective.date,
      items: updatedItems, closedAt: effective.closedAt, closedBy: effective.closedBy,
    });

    await batch.commit();
  }

  async function handleAddMissingDeliveryItem(item: string, qty: number) {
    if (!branch || !department) return;
    const effective = deliveryClose ?? deliveryAdjClose;
    if (!effective) return;
    await auth.authStateReady();
    const loggedBy = getSession()?.displayName ?? BRANCH_LABELS[branch];
    const closeId = `${branch}__${department}__${deliveryDate}`;

    const currentQty = stocks[item]?.qty ?? 0;
    const batch = writeBatch(db);

    const adjRef = doc(collection(db, COLS.adjustments));
    batch.set(adjRef, {
      id: adjRef.id, branch, department, date: deliveryDate,
      item, type: "in", qty, loggedBy, note: "manual delivery",
    });

    batch.set(doc(db, COLS.branchStock, stockDocId(branch, department, item)), {
      qty: currentQty + qty, lastUpdated: deliveryDate, lastUpdatedBy: loggedBy,
    }, { merge: true });

    const updatedItems = { ...effective.items, [item]: qty };
    batch.set(doc(db, COLS.deliveryClose, closeId), {
      id: closeId, branch, department, date: effective.date,
      items: updatedItems, closedAt: effective.closedAt, closedBy: effective.closedBy,
    });

    await batch.commit();
  }

  const missingStocktakeItems = stocktakeDayClose
    ? deptCatalog.filter(i => !(i.name in stocktakeDayClose.items)).map(i => i.name).sort()
    : [];

  const effectiveDelivery = deliveryClose ?? deliveryAdjClose;
  const missingDeliveryItems = effectiveDelivery
    ? deptCatalog.filter(i => !i.commissary && !(i.name in effectiveDelivery.items)).map(i => i.name).sort()
    : [];

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
            <button onClick={async () => { await logout(); router.replace("/login"); }} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, padding: "4px 8px" }}>Log out</button>
          </div>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: "flex", gap: 2, marginBottom: 0 }}>
          {([
            { id: "daily",       label: "Daily" },
            { id: "delivery",    label: "Delivery" },
            { id: "manualcount", label: "Stocktake" },
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


      {/* ── Content ── */}
      {subTab === "daily" && (
        <DailyContent
          items={filtered}
          metrics={summaryMetrics}
          summaryDate={summaryDate}
          today={today}
          activeFilter={activeFilter}
          onDateChange={setSummaryDate}
          onFilterChange={setActiveFilter}
          lowItems={lowItems}
          oosItems={oosItems}
          branch={branch}
          onWaste={setWasteItem}
        />
      )}
      {subTab === "delivery" && (
        (deliveryClose ?? deliveryAdjClose)
          ? <DeliveryCompleted
              deliveryClose={deliveryClose ?? deliveryAdjClose!}
              role={role}
              onCorrect={handleDeliveryCorrect}
              missingItems={missingDeliveryItems}
              onAddMissing={handleAddMissingDeliveryItem}
            />
          : <DeliveryContent
              items={deliveryItems}
              stocks={stocks}
              deliveryCounts={deliveryCounts}
              deliveryDate={deliveryDate}
              currentFilter={categoryFilter}
              onDateChange={handleDeliveryDateChange}
              onCountChange={(item, val) => setDeliveryCounts(prev => ({ ...prev, [item]: val }))}
              onSaveDelivery={handleDeliverySave}
              onOpenReview={() => setShowDeliveryReview(true)}
            />
      )}
      {subTab === "manualcount" && (
        stocktakeDayClose?.isLocked
          ? <StocktakeCompleted
              dayClose={stocktakeDayClose}
              role={role}
              onCorrect={handleCorrectCount}
              missingItems={missingStocktakeItems}
              onAddMissing={handleAddMissingStocktakeItem}
            />
          : <StocktakeContent
              items={filtered}
              metrics={stocktakeMetrics}
              endCounts={endCounts}
              currentFilter={categoryFilter}
              stocktakeDate={stocktakeDate}
              onDateChange={handleStocktakeDateChange}
              onCountChange={(item, val) => setEndCounts(prev => ({ ...prev, [item]: val }))}
              onSaveLocation={handleSaveLocation}
              onOpenReview={() => setShowSubmitAll(true)}
            />
      )}

      {/* ── Modals ── */}
      {showSubmitAll && (
        <StocktakeReviewSheet
          items={deptCatalog}
          metrics={stocktakeMetrics}
          endCounts={endCounts}
          stocktakeDate={stocktakeDate}
          onConfirm={handleSubmitAll}
          onRecount={item => {
            setEndCounts(prev => { const n = { ...prev }; delete n[item]; return n; });
          }}
          onClose={() => setShowSubmitAll(false)}
          loading={submitLoading}
        />
      )}

      {showDeliveryReview && (
        <DeliveryReviewSheet
          items={deptCatalog}
          stocks={stocks}
          deliveryCounts={deliveryCounts}
          deliveryDate={deliveryDate}
          onConfirm={handleDeliverySubmit}
          onRecount={item => {
            setDeliveryCounts(prev => { const n = { ...prev }; delete n[item]; return n; });
          }}
          onClose={() => setShowDeliveryReview(false)}
          loading={deliverySubmitLoading}
        />
      )}

      {showStoreHubSync && (
        <StoreHubSyncModal
          branch={branch}
          department={department}
          today={syncDatePHT()}
          onClose={() => setShowStoreHubSync(false)}
          onComplete={() => {}}
        />
      )}

      {showCSVImport && (
        <CSVImportModal
          branch={branch}
          department={department}
          today={today}
          onClose={() => setShowCSVImport(false)}
          onComplete={() => {}}
        />
      )}

      {wasteItem && (
        <WasteEntrySheet
          itemName={wasteItem}
          packSize={deptCatalog.find(i => i.name === wasteItem)?.packSize ?? ""}
          alreadyLoggedToday={adjustments.filter(a => a.item === wasteItem && a.type === "waste").reduce((sum, a) => sum + a.qty, 0)}
          onLog={(qty, reason) => handleLogWaste(wasteItem, qty, reason)}
          onClose={() => !wasteLoading && setWasteItem(null)}
        />
      )}

      <BottomNav />
    </div>
  );
}
