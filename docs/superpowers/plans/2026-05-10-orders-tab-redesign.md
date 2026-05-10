# Orders Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Transfers" tab (split Pull Outs / Deliveries sub-tabs) with a unified "Orders" tab (Pending / Active / History) that mirrors the commissary app's mental model.

**Architecture:** `TransfersPage` (page.tsx) lifts both Firestore `onSnapshot` listeners and owns the tab state, passing `pullOuts[]` and `deliveryNotes[]` as props to a new `OrdersContent` component. `OrdersContent` is a pure render component that handles all three sub-tab views and their detail/form states internally. The two old components (`PullOutsContent`, `DeliveriesContent`) are deleted.

**Tech Stack:** Next.js App Router, React, TypeScript, Firebase Firestore (via `@/lib/firebase`), custom CSS variables (no UI library).

**No test framework is present.** Each task uses `npx tsc --noEmit` as the compile check and explicit manual steps for functional verification.

---

## File Map

| Action | File |
|---|---|
| Modify | `src/app/transfers/page.tsx` |
| Modify | `src/components/BottomNav.tsx` |
| Create | `src/app/transfers/_components/OrdersContent.tsx` |
| Delete | `src/app/transfers/_components/PullOutsContent.tsx` |
| Delete | `src/app/transfers/_components/DeliveriesContent.tsx` |

---

## Task 1: Update BottomNav label

**Files:**
- Modify: `src/components/BottomNav.tsx`

- [ ] **Step 1: Open BottomNav and find the Transfers entry**

The nav item is on line 11 of `src/components/BottomNav.tsx`:
```typescript
{ href: "/transfers",  icon: TransfersIcon,  label: "Transfers",  minRole: "superadmin" },
```

- [ ] **Step 2: Change the label**

```typescript
{ href: "/transfers",  icon: TransfersIcon,  label: "Orders",  minRole: "superadmin" },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd ~/Documents/branch-inventory && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/BottomNav.tsx
git commit -m "feat: rename Transfers → Orders in bottom nav"
```

---

## Task 2: Rewrite page.tsx — lift listeners, new tab structure

**Files:**
- Modify: `src/app/transfers/page.tsx`

This task rewrites the page to lift both Firestore listeners here (matching the commissary's App.tsx pattern), update the header title and sub-tabs, and wire up the new `OrdersContent` component (which doesn't exist yet — we'll create a stub so TypeScript is happy).

- [ ] **Step 1: Create a stub OrdersContent so the import resolves**

Create `src/app/transfers/_components/OrdersContent.tsx` with just enough to compile:

```typescript
"use client";
import type { Branch, PullOut, DeliveryNote } from "@/lib/types";

interface Props {
  tab:           "pending" | "active" | "history";
  pullOuts:      PullOut[];
  deliveryNotes: DeliveryNote[];
  branch:        Branch;
}

export function OrdersContent(_props: Props) {
  return <div />;
}
```

- [ ] **Step 2: Rewrite page.tsx**

Replace the entire contents of `src/app/transfers/page.tsx` with:

```typescript
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, BRANCH_LABELS } from "@/lib/auth";
import type { Branch, PullOut, DeliveryNote } from "@/lib/types";
import { db, COLS, collection, onSnapshot, query, where } from "@/lib/firebase";
import BottomNav from "@/components/BottomNav";
import { OrdersContent } from "./_components/OrdersContent";

type Tab = "pending" | "active" | "history";

export default function TransfersPage() {
  const router = useRouter();
  const [branch,        setBranch]        = useState<Branch | null>(null);
  const [tab,           setTab]           = useState<Tab>("pending");
  const [pullOuts,      setPullOuts]      = useState<PullOut[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    if (session.department !== "kitchen") { router.replace("/stock"); return; }
    setBranch(session.branch);
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

      <OrdersContent tab={tab} pullOuts={pullOuts} deliveryNotes={deliveryNotes} branch={branch} />

      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd ~/Documents/branch-inventory && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Run `npm run dev`, open the app, tap the Orders nav item. You should see:
- Header shows branch name + "Orders"
- Three sub-tabs: Pending / Active / History
- Empty content area (stub renders `<div />`)
- BottomNav label reads "Orders"

- [ ] **Step 5: Commit**

```bash
git add src/app/transfers/page.tsx src/app/transfers/_components/OrdersContent.tsx
git commit -m "feat: lift Firestore listeners to page, stub OrdersContent"
```

---

## Task 3: Implement OrdersContent — list views

**Files:**
- Modify: `src/app/transfers/_components/OrdersContent.tsx`

Replace the stub with the full implementation. This task covers all three list views (Pending, Active, History cards) and the FAB. Detail views are stubs for now.

- [ ] **Step 1: Replace OrdersContent.tsx with the full list implementation**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/Documents/branch-inventory && npx tsc --noEmit
```
Expected: no errors. If you see "Property 'CATALOG' does not exist", check that both `CATALOG` and `CATALOG_MAP` are exported from `@/lib/items`.

- [ ] **Step 3: Manual test — list views**

Run `npm run dev` and open the Orders tab. Verify:
- Pending sub-tab shows existing PENDING_REVIEW orders as cards with amber left border
- Active sub-tab shows DISPATCHED orders; if a linked DN exists its ref appears; if not "Awaiting delivery note…" appears
- History sub-tab shows RECEIVED/DONE/CANCELLED/REJECTED/DISCREPANCY/DISPUTED orders
- Count badges appear on Pending and Active when there are records
- FAB (+) appears on Pending and Active, hidden on History
- Tapping a card shows the stub placeholder text (detail views come in Task 4)

- [ ] **Step 4: Commit**

```bash
git add src/app/transfers/_components/OrdersContent.tsx
git commit -m "feat: implement Orders list views (Pending/Active/History)"
```

---

## Task 4: Implement detail views

**Files:**
- Modify: `src/app/transfers/_components/OrdersContent.tsx`

Replace the four stub functions at the bottom of `OrdersContent.tsx` with full implementations. The `PendingDetail`, `ActiveDetail`, and `HistoryDetail` functions come after the `OrdersContent` export. The `NewOrderForm` stub stays (implemented in Task 5).

- [ ] **Step 1: Replace the four stubs with the real PendingDetail, ActiveDetail, and HistoryDetail**

Remove these four stub functions from the bottom of `OrdersContent.tsx`:
```typescript
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
```

Replace them with:

```typescript
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
      const updated: PullOut = { ...po, status: "CANCELLED" };
      await saveDocById(COLS.pullOuts, po.id, updated as unknown as Record<string, unknown>);
      onUpdated(updated);
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
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

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
            {dn.items.map(item => {
              const received = receivedQtys[item.item] ?? item.dispatchedQty;
              const isDiff   = received !== item.dispatchedQty;
              return (
                <div key={item.item} style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", borderLeft: isDiff ? "4px solid #DC2626" : "4px solid transparent" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{item.item}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                        {CATALOG_MAP.get(item.item)?.packSize ?? "1 pc"} · Dispatched: <strong>{item.dispatchedQty}</strong>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
            onClick={confirmReceipt}
            disabled={loading}
            style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: hasDiscrepancy ? "#DC2626" : "#059669", color: "#FFF", fontWeight: 700, fontSize: 16, cursor: "pointer" }}
          >
            {loading ? "Saving…" : hasDiscrepancy ? "Confirm Receipt with Discrepancy" : "Confirm Receipt — All Good"}
          </button>
        </div>
      )}
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
          const ri           = dn?.receivedItems?.find(r => r.item === item.item);
          const dispatchedQty = dn?.items.find(i => i.item === item.item)?.dispatchedQty;
          return (
            <div key={item.item} style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.item}</div>
                {dispatchedQty !== undefined && (
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                    Dispatched: {dispatchedQty}
                    {ri && ri.receivedQty !== dispatchedQty && (
                      <span style={{ color: "#DC2626", marginLeft: 4 }}>· Received: {ri.receivedQty}</span>
                    )}
                    {ri && ri.receivedQty === dispatchedQty && (
                      <span style={{ color: "#059669", marginLeft: 4 }}>· Received: {ri.receivedQty}</span>
                    )}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{item.qty}</div>
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
      </div>
    </div>
  );
}

// ── NewOrderForm stub — implemented in Task 5 ─────────────────────────────────

function NewOrderForm(_props: { branch: Branch; onBack: () => void }) {
  return <div style={{ padding: 16 }}>NewOrderForm — coming in Task 5</div>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/Documents/branch-inventory && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Manual test — detail views**

- Open a pending order → items list visible → tap "Cancel Request" → order moves to History ✓
- Open an active order with a linked DN → receipt confirmation form with qty inputs → adjust a qty → "Confirm Receipt with Discrepancy" appears red → confirm → order moves to History ✓
- Open an active order with no DN → "Delivery note not yet available" message shows ✓
- Open a history order → read-only items list, no actions ✓
- Open a DISCREPANCY/DISPUTED history order → amber banner shows "place a new order if needed" ✓

- [ ] **Step 4: Commit**

```bash
git add src/app/transfers/_components/OrdersContent.tsx
git commit -m "feat: implement PendingDetail, ActiveDetail, HistoryDetail"
```

---

## Task 5: Implement NewOrderForm

**Files:**
- Modify: `src/app/transfers/_components/OrdersContent.tsx`

Replace the `NewOrderForm` stub at the bottom with the real implementation.

- [ ] **Step 1: Replace the NewOrderForm stub**

Remove:
```typescript
// ── NewOrderForm stub — implemented in Task 5 ─────────────────────────────────

function NewOrderForm(_props: { branch: Branch; onBack: () => void }) {
  return <div style={{ padding: 16 }}>NewOrderForm — coming in Task 5</div>;
}
```

Replace with:

```typescript
// ── NewOrderForm ──────────────────────────────────────────────────────────────

function NewOrderForm({ branch, onBack }: { branch: Branch; onBack: () => void }) {
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map());
  const [search,  setSearch]  = useState("");
  const [notes,   setNotes]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const branchItems = useMemo(
    () => CATALOG.filter(i => !i.branches || i.branches.includes(branch)),
    [branch]
  );
  const availableItems = useMemo(
    () => branchItems.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase())),
    [branchItems, search]
  );

  function toggleItem(name: string) {
    setSelectedItems(prev => {
      const n = new Map(prev);
      if (n.has(name)) n.delete(name); else n.set(name, 1);
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
        ...(notes ? { notes } : {}),
      };
      await saveDocById(COLS.pullOuts, po.id, po as unknown as Record<string, unknown>);
      onBack();
    } catch {
      setError("Failed to submit. Try again.");
    }
    setLoading(false);
  }

  const hasSelection = selectedItems.size > 0;

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

      {error && (
        <div style={{ margin: "12px 16px 0", background: "#FEF2F2", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#DC2626" }}>{error}</div>
      )}

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {availableItems.map(item => {
          const qty        = selectedItems.get(item.name);
          const isSelected = qty !== undefined;
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
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  {item.packSize}
                  <span style={{
                    marginLeft: 6,
                    background:  item.category === "portion" ? "#EDE9FE" : item.category === "packed" ? "#DBEAFE" : "#D1FAE5",
                    color:       item.category === "portion" ? "#7C3AED" : item.category === "packed" ? "#2563EB" : "#059669",
                    borderRadius: 4, padding: "1px 5px", fontSize: 10, fontWeight: 600,
                  }}>{item.category}</span>
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

      <div style={{ position: "fixed", bottom: "var(--nav-h)", left: 0, right: 0, background: "#FFF", borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes for commissary (optional)"
          rows={1}
          style={{ width: "100%", border: "1.5px solid var(--border)", borderRadius: 10, padding: "8px 12px", fontSize: 14, resize: "none", outline: "none", background: "var(--bg)", color: "var(--text)", boxSizing: "border-box", marginBottom: 8 }}
        />
        <button
          onClick={submit}
          disabled={!hasSelection || loading}
          style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: hasSelection ? "#1A1A1A" : "#E8E8E4", color: hasSelection ? "#FFF" : "var(--text-secondary)", fontWeight: 700, fontSize: 16, cursor: hasSelection ? "pointer" : "not-allowed" }}
        >
          {loading ? "Saving…" : `Submit Request${hasSelection ? ` · ${selectedItems.size} item${selectedItems.size !== 1 ? "s" : ""}` : ""}`}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/Documents/branch-inventory && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Manual test — new order form**

- Tap the + FAB → "New Order Request" form opens ✓
- Search filters the item list ✓
- Tap an item → checkbox ticked, qty stepper appears ✓
- Adjust qty to 0 → item deselects ✓
- Submit with 2+ items → order appears in Pending list in real time ✓
- Commissary app shows the new order in its Pending sub-tab ✓

- [ ] **Step 4: Commit**

```bash
git add src/app/transfers/_components/OrdersContent.tsx
git commit -m "feat: implement NewOrderForm in OrdersContent"
```

---

## Task 6: Delete old files and verify

**Files:**
- Delete: `src/app/transfers/_components/PullOutsContent.tsx`
- Delete: `src/app/transfers/_components/DeliveriesContent.tsx`

- [ ] **Step 1: Delete old component files**

```bash
rm ~/Documents/branch-inventory/src/app/transfers/_components/PullOutsContent.tsx
rm ~/Documents/branch-inventory/src/app/transfers/_components/DeliveriesContent.tsx
```

- [ ] **Step 2: Verify no remaining imports**

```bash
cd ~/Documents/branch-inventory && grep -r "PullOutsContent\|DeliveriesContent" src/
```
Expected: no output.

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
cd ~/Documents/branch-inventory && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Full end-to-end manual test**

Run `npm run dev` and verify the golden path:
1. Open Orders tab → header shows branch + "Orders", three sub-tabs visible ✓
2. Pending sub-tab → existing PENDING_REVIEW orders listed with amber border ✓
3. Active sub-tab → DISPATCHED orders listed, DN ref or "Awaiting…" shown ✓
4. History sub-tab → completed/cancelled/rejected orders listed, no FAB ✓
5. Tap a pending order → detail view with items + Cancel button ✓
6. Cancel the order → returns to list, order disappears from Pending ✓
7. Tap the + FAB → new order form opens, submit an order → appears in Pending ✓
8. (When commissary dispatches) order moves to Active, tap it → receipt confirmation ✓
9. Confirm receipt → order moves to History with RECEIVED status ✓
10. Commissary app Orders tab reflects the same status changes in real time ✓

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: remove old PullOutsContent and DeliveriesContent"
```
