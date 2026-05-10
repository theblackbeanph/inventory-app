# Branch Inventory — Phase 2 Transfer Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the branch-inventory app into the commissary's Phase 2 transfer flow so branches can submit pull-out requests, track order status, and confirm delivery receipt — and fix the commissary Review tab to show per-item discrepancy data once the branch writes it.

**Architecture:** Two apps share one Firebase project (`commissary-dashboard-ccd7c`). Commissary writes `delivery_notes` on dispatch and reads `pull_outs` for the order queue. Branch writes new `pull_outs` in commissary's `PullOutRequest` format and writes back `receivedItems` to `delivery_notes` on receipt. The key gap being closed: `delivery_notes` currently has no `receivedItems` field, so the commissary Review tab cannot show per-item diff. This plan adds that field and wires both sides.

**Tech Stack:** commissary-production (React + TypeScript + Vite), branch-inventory (Next.js 16 + React 19 + TypeScript), Firebase Firestore (shared project), Firebase Auth (email/password, both apps). No new dependencies required.

---

## Schema Reference

**Commissary writes to `pull_outs` (and branch must also write to it in this format):**
```typescript
// commissary-production/src/lib/pull-outs.ts
interface PullOutRequest {
  id: string;          // String(Date.now())
  poRef: string;       // PO-26-0509-BF001
  branch: string;      // "BF" | "MKT"
  status: PullOutStatus; // "PENDING_REVIEW" | "DISPATCHED" | "RECEIVED" | etc.
  requestedAt: string; // YYYY-MM-DD
  requestedBy: string; // displayName from branch session
  items: PullOutItem[]; // { item: string; qty: number; unit: string; }
  notes?: string;
}
```

**Commissary writes to `delivery_notes` (and branch must read in this format):**
```typescript
// commissary-production/src/lib/delivery-notes.ts
interface DeliveryNote {
  id: string;           // String(Date.now())
  dnRef: string;        // DN-26-0509-BF001
  poRef: string;
  pullOutId: string;
  branch: string;
  dispatchedAt: string; // YYYY-MM-DD
  dispatchedBy: string;
  items: DeliveryNoteItem[];
  status: DeliveryNoteStatus; // "IN_TRANSIT" | "RECEIVED" | "DISCREPANCY"
}
interface DeliveryNoteItem {
  item: string;
  requestedQty: number;
  dispatchedQty: number;
  unit: string;
}
```

**After this plan, `delivery_notes` will also have:**
```typescript
  receivedItems?: ReceivedItem[];
  receivedAt?: string;
  receivedBy?: string;
```

**Branch must generate `poRef` in the same format as commissary:**
```typescript
// PO-{YY}-{MMDD}-{branch}{seq 3-padded}
// e.g. PO-26-0509-BF001
function genPORef(date: string, branch: string, seq: number): string {
  const yy   = date.slice(2, 4);
  const mmdd = date.slice(5, 7) + date.slice(8, 10);
  return `PO-${yy}-${mmdd}-${branch}${String(seq).padStart(3, "0")}`;
}
```

**Sequence number query for branch pull-outs:**
```typescript
// Query pull_outs where requestedAt == today AND branch == branch
// seq = results.length + 1
```

---

## Pull-Out Inventory Catalog (branch items)

These are the items branches can order from commissary, used in `NewManualPullOut`:

```typescript
// Recipe Portioned — unit: "pc"
const RECIPE_ITEMS = [
  "Cobbler", "Salmon Fillet", "Smoked Salmon", "Aburi Salmon",
  "Beef Tapa", "Beef Pares", "Buttermilk Chicken 300g", "Buttermilk Chicken 150g",
  "Chicken BBQ", "Burger Patty", "Adobo Flakes", "Arroz ala Cubana",
  "Roast Beef", "Mozzarella Sticks", "Kimchi", "Scallops",
  "Bacon Cubes", "Prosciutto", "Tomahawk Porkchop",
];

// Packed — unit: "pc"
const PACKED_ITEMS = [
  "Miso Butter Paste", "Au Jus", "Bacon Jam", "Caramelized Onion",
  "Vodka Sauce", "Squid Ink Sauce", "Truffle Pasta Sauce", "Truffle Mushroom Paste",
  "Loco Moco Gravy", "Squash Soup", "Tomato Soup", "Tuna Spread",
  "Flatbread", "Classic Tiramisu", "Hojicha Tiramisu", "Tres Leches",
];

// Loose — unit: "pack"
const LOOSE_ITEMS = [
  "Marinara Sauce", "Marinara Sauce (Blend)", "Gyudon Sauce", "Tartar", "Aioli",
  "Caesar Dressing", "Raspberry Dressing", "Candied Walnut", "House Vinaigrette",
  "Nigiri", "Burger Dressing", "Maple Syrup", "Pesto",
  "Beef Pares Sauce", "Adobo Flakes Sauce",
  "Classic Tiramisu Mascarpone", "Hojicha Tiramisu Mascarpone",
];

interface OrderItem { name: string; unit: "pc" | "pack"; }
const COMMISSARY_ITEMS: OrderItem[] = [
  ...RECIPE_ITEMS.map(name => ({ name, unit: "pc" as const })),
  ...PACKED_ITEMS.map(name => ({ name, unit: "pc" as const })),
  ...LOOSE_ITEMS.map(name => ({ name, unit: "pack" as const })),
];
```

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `commissary-production/src/lib/delivery-notes.ts` | Modify | Add `ReceivedItem` type + optional receipt fields on `DeliveryNote` |
| `commissary-production/src/OrdersTab.tsx` | Modify | Show per-item diff in Review tab when `dn.receivedItems` exists |
| `commissary-production/firestore.rules` | Create | Allowlist branch writer emails |
| `branch-inventory/src/lib/types.ts` | Modify | Align `DeliveryNote` + `DeliveryNoteItem` to commissary's camelCase schema; add commissary status values to `PullOutStatus` |
| `branch-inventory/src/app/transfers/_components/DeliveriesContent.tsx` | Modify | Fix field names to match commissary; write `receivedItems` + update pull_out status on receipt |
| `branch-inventory/src/app/transfers/_components/PullOutsContent.tsx` | Modify | Fix field names in list/detail; replace `confirm()` with view-only; fix `NewManualPullOut` to write `PullOutRequest` format with item catalog |

---

## Task 1: Add `ReceivedItem` to commissary `delivery-notes.ts`

**Files:**
- Modify: `commissary-production/src/lib/delivery-notes.ts`

- [ ] **Step 1: Read the file**

```bash
cat commissary-production/src/lib/delivery-notes.ts
```

Expected: the 33-line file with `DeliveryNote`, `DeliveryNoteItem`, `genDNRef`.

- [ ] **Step 2: Add `ReceivedItem` type and optional fields**

Replace the contents of `commissary-production/src/lib/delivery-notes.ts` with:

```typescript
// src/lib/delivery-notes.ts

export type DeliveryNoteStatus = "IN_TRANSIT" | "RECEIVED" | "DISCREPANCY";

export interface DeliveryNoteItem {
  item: string;
  requestedQty: number;
  dispatchedQty: number;
  unit: string;
}

export interface ReceivedItem {
  item: string;
  dispatchedQty: number;
  receivedQty: number;
  unit: string;
}

export interface DeliveryNote {
  id: string;           // Date.now() as string
  dnRef: string;        // e.g. DN-26-0507-BF001
  poRef: string;
  pullOutId: string;
  branch: string;
  dispatchedAt: string; // YYYY-MM-DD
  dispatchedBy: string;
  items: DeliveryNoteItem[];
  status: DeliveryNoteStatus;
  receivedItems?: ReceivedItem[];
  receivedAt?: string;  // YYYY-MM-DD
  receivedBy?: string;
}

/** Generate DN ref: DN-YY-MMDD-{branch}{seq padded to 3} */
export function genDNRef(date: string, branch: string, existing: DeliveryNote[]): string {
  const yy   = date.slice(2, 4);
  const mmdd = date.slice(5, 7) + date.slice(8, 10);
  const prefix = `DN-${yy}-${mmdd}-${branch}`;
  const todayDNs = existing.filter(d => d.dnRef.startsWith(prefix));
  const seq = String(todayDNs.length + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}
```

- [ ] **Step 3: Verify build passes in commissary-production**

```bash
cd /Users/christiancasino/Documents/commissary-production && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/christiancasino/Documents/commissary-production
git add src/lib/delivery-notes.ts
git commit -m "feat: add ReceivedItem type and optional receipt fields to DeliveryNote"
```

---

## Task 2: Fix commissary Review tab to show per-item diff

**Files:**
- Modify: `commissary-production/src/OrdersTab.tsx` (lines 128–162, the review section card rendering)

Context: The Review tab renders cards for `DISCREPANCY` and `DISPUTED` pull-outs. Each card shows the PO ref, branch, and the `ReviewActions` buttons. We need to add a per-item diff table below the DN ref line, but only when `dn.receivedItems` exists. The diff shows each item: what was dispatched vs. what was received.

- [ ] **Step 1: Read the review section of OrdersTab**

```bash
sed -n '128,165p' /Users/christiancasino/Documents/commissary-production/src/OrdersTab.tsx
```

Expected: the review subtab render block with `dn && <div style={{ color... }}>DN: {dn.dnRef}</div>`.

- [ ] **Step 2: Replace the review card body to include per-item diff**

Locate this block inside the `subTab === "review"` section:

```tsx
{dn && (
  <div style={{ color: "var(--p2-sub)", fontSize: 11, marginBottom: 8 }}>
    DN: {dn.dnRef}
  </div>
)}
<ReviewActions
  pullOut={r}
  isSuperAdmin={isSuperAdmin}
  logger={logger}
/>
```

Replace with:

```tsx
{dn && (
  <div style={{ marginBottom: 8 }}>
    <div style={{ color: "var(--p2-sub)", fontSize: 11, marginBottom: 6 }}>
      DN: {dn.dnRef}
    </div>
    {dn.receivedItems && dn.receivedItems.length > 0 && (
      <div style={{ background: "var(--p2-bg)", borderRadius: 8, padding: "8px 10px" }}>
        <div style={{ color: "var(--p2-muted)", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
          Received vs Dispatched
        </div>
        {dn.receivedItems.map(ri => {
          const diff = ri.receivedQty - ri.dispatchedQty;
          return (
            <div key={ri.item} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ color: "var(--p2-text)", fontSize: 11 }}>{ri.item}</span>
              <span style={{ color: "var(--p2-muted)", fontSize: 10 }}>
                {ri.dispatchedQty} → {" "}
                <strong style={{ color: diff < 0 ? "#ef4444" : diff > 0 ? "var(--p2-success)" : "var(--p2-text)" }}>
                  {ri.receivedQty} {ri.unit}
                </strong>
                {diff !== 0 && (
                  <span style={{ color: diff < 0 ? "#ef4444" : "var(--p2-success)", marginLeft: 4 }}>
                    ({diff > 0 ? "+" : ""}{diff})
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    )}
  </div>
)}
<ReviewActions
  pullOut={r}
  isSuperAdmin={isSuperAdmin}
  logger={logger}
/>
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/christiancasino/Documents/commissary-production && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/christiancasino/Documents/commissary-production
git add src/OrdersTab.tsx
git commit -m "feat: show per-item dispatched vs received diff in Review tab"
```

---

## Task 3: Firestore security rules — add branch writers

**Files:**
- Create: `commissary-production/firestore.rules`

Context: The commissary CLAUDE.md shows the rules restrict writes to 4 known emails. Branch users need write access to `pull_outs` and `delivery_notes`. The branch app uses Firebase Auth — any authenticated user from the branch app (with a valid `users` Firestore doc) should be able to write. The safest approach: add the known branch user emails to the allowlist.

We don't know the branch user emails yet (they're stored in Firestore `users` docs). The safest rule: allow any authenticated user to write to `pull_outs` and `delivery_notes` (both apps already read/write these). Commissary-only write collections (`deliveries`, `productions`, `invEntries`) stay restricted.

- [ ] **Step 1: Read existing firestore.rules from firebase.json**

```bash
cat /Users/christiancasino/Documents/commissary-production/firebase.json
```

Expected: firebase config including `firestore.rules` file path.

- [ ] **Step 2: Write updated firestore.rules**

Create `commissary-production/firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isKnownCommissaryUser() {
      return request.auth != null && request.auth.token.email in [
        'chris@theblackbean.ph',
        'hello@theblackbean.ph',
        'kliendacasin1996@gmail.com',
        'tonixgil04@gmail.com'
      ];
    }

    function isAuthenticated() {
      return request.auth != null;
    }

    // Pull-out requests: branch creates, commissary updates — any authenticated user
    match /pull_outs/{doc} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated();
    }

    // Delivery notes: commissary creates, branch updates receipt — any authenticated user
    match /delivery_notes/{doc} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated();
    }

    // Commissary-internal collections — restricted to known commissary users
    match /deliveries/{doc} {
      allow read: if isAuthenticated();
      allow write: if isKnownCommissaryUser();
    }
    match /productions/{doc} {
      allow read: if isAuthenticated();
      allow write: if isKnownCommissaryUser();
    }
    match /settings/{doc} {
      allow read: if isAuthenticated();
      allow write: if isKnownCommissaryUser();
    }

    // Inventory entries: commissary writes, branch writes discrepancy entries
    match /invEntries/{doc} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated();
    }

    // Branch-only collections — any authenticated user (branch app users)
    // NOTE: No catch-all — list explicitly to avoid silently voiding commissary restrictions above
    match /branch_stock/{doc}          { allow read, write: if isAuthenticated(); }
    match /branch_adjustments/{doc}    { allow read, write: if isAuthenticated(); }
    match /supplier_deliveries/{doc}   { allow read, write: if isAuthenticated(); }
    match /portioning_runs/{doc}       { allow read, write: if isAuthenticated(); }
    match /storehub_unmatched/{doc}    { allow read, write: if isAuthenticated(); }
    match /stocktake_drafts/{doc}      { allow read, write: if isAuthenticated(); }
    match /delivery_drafts/{doc}       { allow read, write: if isAuthenticated(); }
    match /delivery_close/{doc}        { allow read, write: if isAuthenticated(); }
    match /variance_explanations/{doc} { allow read, write: if isAuthenticated(); }
    match /users/{doc}                 { allow read, write: if isAuthenticated(); }
    match /daily_beginning/{doc}       { allow read, write: if isAuthenticated(); }
    match /daily_close/{doc}           { allow read, write: if isAuthenticated(); }
    match /pullout_requests/{doc}      { allow read, write: if isAuthenticated(); }
  }
}
```

- [ ] **Step 3: Deploy the rules**

```bash
cd /Users/christiancasino/Documents/commissary-production && firebase deploy --only firestore:rules
```

Expected: `Deploy complete!`

- [ ] **Step 4: Commit**

```bash
cd /Users/christiancasino/Documents/commissary-production
git add firestore.rules
git commit -m "fix: open pull_outs and delivery_notes to any authenticated user for branch app writes"
```

---

## Task 4: Align branch `DeliveryNote` type to commissary's camelCase schema

**Files:**
- Modify: `branch-inventory/src/lib/types.ts` (the delivery module section)

Context: The branch `DeliveryNote` uses snake_case (`dn_number`, `pull_out_id`, `dispatched_at`, `has_discrepancy`, `commissary_notified`). But commissary writes `dnRef`, `pullOutId`, `dispatchedAt` etc. We need the branch to be able to read what commissary writes AND write back `receivedItems` in commissary format. This means aligning the branch type to camelCase.

Also, the branch `PullOutStatus` type only has branch-internal statuses. It must include commissary's statuses (`RECEIVED`, `REJECTED`, `DISCREPANCY`, `DISPUTED`, `DONE`) so the branch can display order status correctly.

- [ ] **Step 1: Read the types.ts delivery + pull-out sections**

```bash
grep -n "DeliveryNote\|PullOutStatus\|DeliveryStatus\|DeliveryNoteItem" /Users/christiancasino/Documents/branch-inventory/src/lib/types.ts
```

- [ ] **Step 2: Update the delivery module types**

Find and replace the `// ── Delivery module ───` section in `branch-inventory/src/lib/types.ts` with:

```typescript
// ── Delivery module ───────────────────────────────────────────────────────────

// Matches commissary's DeliveryNoteStatus exactly
export type DeliveryNoteStatus = "IN_TRANSIT" | "RECEIVED" | "DISCREPANCY";

export interface DeliveryNoteItem {
  item: string;
  requestedQty: number;
  dispatchedQty: number;
  unit: string;
  // Written by branch on receipt:
  receivedQty?: number;
}

export interface ReceivedItem {
  item: string;
  dispatchedQty: number;
  receivedQty: number;
  unit: string;
}

// Matches commissary's DeliveryNote exactly (commissary creates, branch reads + updates)
export interface DeliveryNote {
  id: string;
  dnRef: string;
  poRef: string;
  pullOutId: string;
  branch: string;
  dispatchedAt: string;
  dispatchedBy: string;
  items: DeliveryNoteItem[];
  status: DeliveryNoteStatus;
  receivedItems?: ReceivedItem[];
  receivedAt?: string;
  receivedBy?: string;
}
```

- [ ] **Step 3: Update `PullOutStatus` to include commissary statuses**

Find the `// ── Pull-Out module ───` section. Update `PullOutStatus`:

```typescript
// ── Pull-Out module ───────────────────────────────────────────────────────────

// Commissary statuses — branch creates PENDING_REVIEW; commissary drives the rest
// CANCELLED = branch self-cancelled (before commissary reviewed); REJECTED = commissary refused
export type PullOutStatus =
  | "PENDING_REVIEW"
  | "DISPATCHED"
  | "RECEIVED"
  | "REJECTED"
  | "CANCELLED"
  | "DISCREPANCY"
  | "DISPUTED"
  | "DONE";

export type PullOutType = "AUTO" | "MANUAL";

// Matches commissary's PullOutItem exactly
export interface PullOutItem {
  item: string;
  qty: number;
  unit: "pc" | "pack";
}

// Matches commissary's PullOutRequest exactly (both apps read/write this)
export interface PullOut {
  id: string;
  poRef: string;         // PO-26-0509-BF001
  branch: string;
  status: PullOutStatus;
  requestedAt: string;   // YYYY-MM-DD
  requestedBy: string;
  items: PullOutItem[];
  notes?: string;
}
```

Remove the old `PullOut`, `PullOutItem`, and `PullOutStatus` definitions that are now replaced. Also remove `DeliveryStatus` (replaced by `DeliveryNoteStatus`).

- [ ] **Step 4: Run the build to catch type errors**

```bash
cd /Users/christiancasino/Documents/branch-inventory && npx tsc --noEmit 2>&1 | head -40
```

Expected: type errors in `PullOutsContent.tsx` and `DeliveriesContent.tsx` — these are expected, will be fixed in Tasks 5 and 6.

- [ ] **Step 5: Commit**

```bash
cd /Users/christiancasino/Documents/branch-inventory
git add src/lib/types.ts
git commit -m "feat: align DeliveryNote and PullOut types to commissary camelCase schema"
```

---

## Task 5: Fix `DeliveriesContent` — field names + receipt write

**Files:**
- Modify: `branch-inventory/src/app/transfers/_components/DeliveriesContent.tsx`

Context: `DeliveriesContent` and `DeliveryDetail` use old snake_case field names (`dn_number`, `pull_out_id`, `item.item_name`, `item.dispatched_qty`, `item.received_qty`, `note.has_discrepancy`, `note.commissary_notified`). These must all be updated to camelCase to match what commissary writes. The receipt confirmation function (`confirmReceipt`) must also write back `receivedItems` (commissary's top-level array) and update the pull-out status to `RECEIVED` or `DISCREPANCY` using `writeBatch`.

- [ ] **Step 1: Read the full DeliveriesContent file**

```bash
cat /Users/christiancasino/Documents/branch-inventory/src/app/transfers/_components/DeliveriesContent.tsx
```

- [ ] **Step 2: Replace the full file**

The complete updated `DeliveriesContent.tsx`:

```tsx
"use client";
import { useEffect, useState, useMemo } from "react";
import { getSession, BRANCH_LABELS } from "@/lib/auth";
import { db, COLS, saveDocById } from "@/lib/firebase";
import { collection, onSnapshot, query, where, writeBatch, doc } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import type { Branch, DeliveryNote, DeliveryNoteItem, DeliveryNoteStatus, ReceivedItem } from "@/lib/types";

type FilterTab = "all" | "in_transit" | "done";

const STATUS_LABEL: Record<DeliveryNoteStatus, string> = {
  IN_TRANSIT:  "In Transit",
  RECEIVED:    "Received",
  DISCREPANCY: "Discrepancy",
};
const STATUS_COLOR: Record<DeliveryNoteStatus, { bg: string; text: string }> = {
  IN_TRANSIT:  { bg: "#DBEAFE", text: "#2563EB" },
  RECEIVED:    { bg: "#D1FAE5", text: "#059669" },
  DISCREPANCY: { bg: "#FEE2E2", text: "#DC2626" },
};

function todayPHT(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function DeliveriesContent({ branch }: { branch: Branch }) {
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [selected, setSelected] = useState<DeliveryNote | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");

  useEffect(() => {
    const q = query(collection(db, COLS.deliveryNotes), where("branch", "==", branch));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => d.data() as DeliveryNote);
      list.sort((a, b) => (b.id > a.id ? 1 : -1));
      setNotes(list);
    });
    return unsub;
  }, [branch]);

  const filtered = useMemo(() => notes.filter(n => {
    if (filter === "in_transit") return n.status === "IN_TRANSIT";
    if (filter === "done")       return ["RECEIVED", "DISCREPANCY"].includes(n.status);
    return true;
  }), [notes, filter]);

  const inTransitCount = notes.filter(n => n.status === "IN_TRANSIT").length;

  if (selected) {
    return (
      <DeliveryDetail
        note={selected} branch={branch}
        onBack={() => setSelected(null)}
        onUpdated={updated => setSelected(updated)}
      />
    );
  }

  return (
    <div>
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid var(--border)", padding: "10px 16px 0" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          {inTransitCount > 0 && (
            <div style={{ background: "#DBEAFE", color: "#2563EB", borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>
              {inTransitCount} in transit
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 4, overflowX: "auto" }}>
          {(["all", "in_transit", "done"] as FilterTab[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "8px 14px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", background: "transparent",
              color: filter === f ? "#1A1A1A" : "var(--text-secondary)",
              borderBottom: filter === f ? "2px solid #1A1A1A" : "2px solid transparent",
              textTransform: "capitalize",
            }}>{f.replace("_", " ")}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "60px 0", fontSize: 15 }}>
            No delivery notes{filter !== "all" ? ` in "${filter.replace("_", " ")}"` : ""}.
          </div>
        )}
        {filtered.map(note => {
          const sc = STATUS_COLOR[note.status];
          return (
            <div key={note.id} onClick={() => setSelected(note)} style={{
              background: "#FFF", borderRadius: 14, padding: "14px 16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)", cursor: "pointer",
              borderLeft: `4px solid ${note.status === "IN_TRANSIT" ? "#2563EB" : note.status === "RECEIVED" ? "#059669" : "#DC2626"}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{note.dnRef}</div>
                <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "3px 10px", background: sc.bg, color: sc.text }}>{STATUS_LABEL[note.status]}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>{note.poRef} · {note.items.length} items</div>
              {note.status === "IN_TRANSIT" && <div style={{ fontSize: 12, color: "#2563EB", fontWeight: 600 }}>Tap to confirm receipt →</div>}
              {note.status === "DISCREPANCY" && <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>Discrepancy reported — commissary notified</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeliveryDetail({ note, branch, onBack, onUpdated }: {
  note: DeliveryNote; branch: Branch;
  onBack: () => void;
  onUpdated: (n: DeliveryNote) => void;
}) {
  const session = getSession();
  const loggedBy = session?.displayName ?? BRANCH_LABELS[branch];

  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>(
    Object.fromEntries(note.items.map(i => [i.item, i.dispatchedQty]))
  );
  const [discrepancyNotes, setDiscrepancyNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const canConfirm = note.status === "IN_TRANSIT";
  const sc = STATUS_COLOR[note.status];

  const itemsWithDiscrepancy = useMemo(() =>
    note.items.filter(i => receivedQtys[i.item] !== i.dispatchedQty),
    [note.items, receivedQtys]
  );
  const hasDiscrepancy = itemsWithDiscrepancy.length > 0;

  async function confirmReceipt() {
    setLoading(true);
    const today = todayPHT();

    const receivedItems: ReceivedItem[] = note.items.map(i => ({
      item:         i.item,
      dispatchedQty: i.dispatchedQty,
      receivedQty:  receivedQtys[i.item] ?? i.dispatchedQty,
      unit:         i.unit,
    }));

    const newStatus: DeliveryNoteStatus = hasDiscrepancy ? "DISCREPANCY" : "RECEIVED";
    const pullOutStatus = hasDiscrepancy ? "DISCREPANCY" : "RECEIVED";

    await auth.authStateReady();

    const batch = writeBatch(db);

    // Update delivery note with receivedItems
    const dnRef = doc(db, COLS.deliveryNotes, note.id);
    const dnUpdate: Partial<DeliveryNote> & Record<string, unknown> = {
      status: newStatus,
      receivedAt: today,
      receivedBy: loggedBy,
      receivedItems,
    };
    if (hasDiscrepancy && discrepancyNotes) {
      dnUpdate.discrepancyNotes = discrepancyNotes;
    }
    batch.set(dnRef, { ...note, ...dnUpdate });

    // Update pull-out status
    const poRef = doc(db, COLS.pullOuts, note.pullOutId);
    batch.update(poRef, { status: pullOutStatus });

    await batch.commit();

    const updatedNote: DeliveryNote = { ...note, ...dnUpdate } as DeliveryNote;
    onUpdated(updatedNote);
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 100px)" }}>
      <div style={{ background: "#FFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-secondary)", fontSize: 20 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{note.dnRef}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{note.poRef} · {note.dispatchedAt}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "4px 10px", background: sc.bg, color: sc.text }}>{STATUS_LABEL[note.status]}</span>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {canConfirm && (
          <div style={{ background: "#EFF6FF", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#1D4ED8" }}>
            Verify each quantity received. Adjust if the actual count differs.
          </div>
        )}
        {note.status === "DISCREPANCY" && (
          <div style={{ background: "#FEF2F2", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#DC2626" }}>
            Discrepancy reported. Commissary has been notified.
          </div>
        )}

        {note.items.map(item => {
          const received = receivedQtys[item.item] ?? item.dispatchedQty;
          const diff = received - item.dispatchedQty;
          const isDiff = diff !== 0;
          return (
            <div key={item.item} style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", borderLeft: isDiff ? "4px solid #DC2626" : "4px solid transparent" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{item.item}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    Dispatched: <strong>{item.dispatchedQty}</strong> {item.unit}
                    {!canConfirm && note.receivedItems && (
                      () => {
                        const ri = note.receivedItems!.find(r => r.item === item.item);
                        if (!ri) return null;
                        const d = ri.receivedQty - ri.dispatchedQty;
                        return (
                          <span> · Received: <strong style={{ color: d < 0 ? "#DC2626" : "#059669" }}>{ri.receivedQty} {item.unit}</strong>
                            {d !== 0 && <span style={{ color: d < 0 ? "#DC2626" : "#059669" }}> ({d > 0 ? "+" : ""}{d})</span>}
                          </span>
                        );
                      }
                    )()}
                  </div>
                </div>
                {canConfirm ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={() => setReceivedQtys(p => ({ ...p, [item.item]: Math.max(0, (p[item.item] ?? item.dispatchedQty) - 1) }))} style={qtyBtnStyle}>−</button>
                    <input type="number" value={received}
                      onChange={e => setReceivedQtys(p => ({ ...p, [item.item]: Math.max(0, Number(e.target.value)) }))}
                      style={{ width: 56, textAlign: "center", border: `1.5px solid ${isDiff ? "#DC2626" : "var(--border)"}`, borderRadius: 8, padding: "6px 4px", fontSize: 16, fontWeight: 700, background: isDiff ? "#FEF2F2" : "var(--bg)", color: "var(--text)" }}
                    />
                    <button onClick={() => setReceivedQtys(p => ({ ...p, [item.item]: (p[item.item] ?? item.dispatchedQty) + 1 }))} style={qtyBtnStyle}>+</button>
                  </div>
                ) : (
                  <div style={{ textAlign: "right" }}>
                    {note.receivedItems?.find(r => r.item === item.item) ? (
                      <>
                        <div style={{ fontWeight: 700, fontSize: 18, color: (note.receivedItems.find(r => r.item === item.item)!.receivedQty - item.dispatchedQty) < 0 ? "#DC2626" : "var(--text)" }}>
                          {note.receivedItems.find(r => r.item === item.item)!.receivedQty}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{item.unit}</div>
                      </>
                    ) : (
                      <div style={{ fontWeight: 700, fontSize: 18 }}>{item.dispatchedQty}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {canConfirm && (
        <div style={{ position: "fixed", bottom: "var(--nav-h)", left: 0, right: 0, background: "#FFF", borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
          {hasDiscrepancy && (
            <>
              <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600, marginBottom: 6 }}>
                {itemsWithDiscrepancy.length} item{itemsWithDiscrepancy.length > 1 ? "s" : ""} with discrepancy — commissary will be notified.
              </div>
              <textarea value={discrepancyNotes} onChange={e => setDiscrepancyNotes(e.target.value)} placeholder="Discrepancy notes (optional)" rows={2}
                style={{ width: "100%", border: "1.5px solid #FCA5A5", borderRadius: 10, padding: "8px 12px", fontSize: 14, resize: "none", outline: "none", background: "#FEF2F2", color: "var(--text)", boxSizing: "border-box", marginBottom: 8 }}
              />
            </>
          )}
          <button onClick={confirmReceipt} disabled={loading} style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: hasDiscrepancy ? "#DC2626" : "#059669", color: "#FFF", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
            {loading ? "Saving…" : hasDiscrepancy ? "Confirm Receipt with Discrepancy" : "Confirm Receipt — All Good"}
          </button>
        </div>
      )}
    </div>
  );
}

const qtyBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", cursor: "pointer", fontSize: 18, fontWeight: 700,
  color: "#1A1A1A", display: "flex", alignItems: "center", justifyContent: "center",
};
```

**Note on the received qty display when not in confirm mode:** The JSX uses an IIFE `(() => { ... })()` which is not valid JSX. Use a helper function or extract it. The correct pattern for the `!canConfirm` received display is to use a named helper or `.find()` inline:

```tsx
// Replace the IIFE pattern with:
{!canConfirm && (() => {
  const ri = note.receivedItems?.find(r => r.item === item.item);
  if (!ri) return null;
  const d = ri.receivedQty - ri.dispatchedQty;
  return (
    <span> · Received: <strong style={{ color: d < 0 ? "#DC2626" : "#059669" }}>{ri.receivedQty} {item.unit}</strong>
      {d !== 0 && <span style={{ color: d < 0 ? "#DC2626" : "#059669" }}> ({d > 0 ? "+" : ""}{d})</span>}
    </span>
  );
})()}
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/christiancasino/Documents/branch-inventory && npx tsc --noEmit 2>&1 | grep -v "PullOutsContent"
```

Expected: no errors from DeliveriesContent. Remaining errors should only be from PullOutsContent (fixed in Task 6).

- [ ] **Step 4: Commit**

```bash
cd /Users/christiancasino/Documents/branch-inventory
git add src/app/transfers/_components/DeliveriesContent.tsx
git commit -m "feat: align delivery receipt flow to commissary schema, write receivedItems on confirm"
```

---

## Task 6: Fix `PullOutsContent` — field names, remove stale confirm(), fix status labels

**Files:**
- Modify: `branch-inventory/src/app/transfers/_components/PullOutsContent.tsx`

Context: `PullOutsContent` uses `po.po_number`, `po.delivery_day`, `item.item_name`, `item.confirmed_qty` etc. These must all be updated to camelCase. The `PullOutDetail.confirm()` function creates a delivery note — this is WRONG; commissary creates delivery notes, not branch. `confirm()` must be removed. Branch can only cancel a PENDING_REVIEW PO. The status labels/colors must include commissary statuses. The `PullOutDetail` also references `po.delivery_note_id` — not in commissary's schema, so remove that check. `po.type` ("AUTO"/"MANUAL") is also not in commissary's `PullOutRequest` — remove that UI badge.

- [ ] **Step 1: Read the full PullOutsContent file**

```bash
cat /Users/christiancasino/Documents/branch-inventory/src/app/transfers/_components/PullOutsContent.tsx
```

- [ ] **Step 2: Rewrite the file**

Full updated `PullOutsContent.tsx` (list + PullOutDetail only — `NewManualPullOut` is in Task 7 and must be appended at the end):

```tsx
"use client";
import { useEffect, useState, useMemo } from "react";
import { BRANCH_LABELS } from "@/lib/auth";
import { db, COLS, saveDocById } from "@/lib/firebase";
import { collection, onSnapshot, query, where, getDocs } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import type { Branch, PullOut, PullOutItem, PullOutStatus } from "@/lib/types";

type View = "list" | "detail" | "new";
type FilterTab = "all" | "pending" | "active" | "done";

const STATUS_LABEL: Record<PullOutStatus, string> = {
  PENDING_REVIEW: "Pending Review",
  DISPATCHED:     "Dispatched",
  RECEIVED:       "Received",
  REJECTED:       "Rejected",
  CANCELLED:      "Cancelled",
  DISCREPANCY:    "Discrepancy",
  DISPUTED:       "Disputed",
  DONE:           "Done",
};
const STATUS_COLOR: Record<PullOutStatus, { bg: string; text: string }> = {
  PENDING_REVIEW: { bg: "#FEF3C7", text: "#D97706" },
  DISPATCHED:     { bg: "#E0E7FF", text: "#4338CA" },
  RECEIVED:       { bg: "#D1FAE5", text: "#059669" },
  REJECTED:       { bg: "#FEE2E2", text: "#DC2626" },
  CANCELLED:      { bg: "#F3F4F6", text: "#6B7280" },
  DISCREPANCY:    { bg: "#FEE2E2", text: "#DC2626" },
  DISPUTED:       { bg: "#EDE9FE", text: "#7C3AED" },
  DONE:           { bg: "#F3F4F6", text: "#6B7280" },
};

function todayPHT(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function formatDay(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
}

export function PullOutsContent({ branch }: { branch: Branch }) {
  const [view, setView] = useState<View>("list");
  const [selected, setSelected] = useState<PullOut | null>(null);
  const [pullOuts, setPullOuts] = useState<PullOut[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");

  useEffect(() => {
    const q = query(collection(db, COLS.pullOuts), where("branch", "==", branch));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => d.data() as PullOut);
      list.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
      setPullOuts(list);
    });
    return unsub;
  }, [branch]);

  const filtered = useMemo(() => pullOuts.filter(po => {
    if (filter === "pending") return po.status === "PENDING_REVIEW";
    if (filter === "active")  return ["DISPATCHED"].includes(po.status);
    if (filter === "done")    return ["RECEIVED", "REJECTED", "DISCREPANCY", "DISPUTED", "DONE"].includes(po.status);
    return true;
  }), [pullOuts, filter]);

  if (view === "new") return <NewManualPullOut branch={branch} onBack={() => setView("list")} />;
  if (view === "detail" && selected) {
    return (
      <PullOutDetail
        po={selected} branch={branch}
        onBack={() => { setSelected(null); setView("list"); }}
        onUpdated={updated => setSelected(updated)}
      />
    );
  }

  const pendingCount = pullOuts.filter(p => p.status === "PENDING_REVIEW").length;

  return (
    <div>
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid var(--border)", padding: "10px 16px 0" }}>
        {pendingCount > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ background: "#FEF3C7", color: "#D97706", borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 600, display: "inline-block" }}>
              {pendingCount} pending review
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 4, overflowX: "auto" }}>
          {(["all", "pending", "active", "done"] as FilterTab[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "8px 16px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", background: "transparent",
              color: filter === f ? "#1A1A1A" : "var(--text-secondary)",
              borderBottom: filter === f ? "2px solid #1A1A1A" : "2px solid transparent",
            }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <button onClick={() => setView("new")} style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "1.5px solid #1A1A1A", background: "#1A1A1A", color: "#FFF", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          + New Pull-Out Request
        </button>

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "40px 0", fontSize: 15 }}>
            No pull-out requests.
          </div>
        )}
        {filtered.map(po => {
          const sc = STATUS_COLOR[po.status];
          return (
            <div key={po.id} onClick={() => { setSelected(po); setView("detail"); }} style={{
              background: "#FFF", borderRadius: 14, padding: "14px 16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)", cursor: "pointer",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{po.poRef}</div>
                <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "3px 10px", background: sc.bg, color: sc.text }}>{STATUS_LABEL[po.status]}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>
                {formatDay(po.requestedAt)} · {po.items.length} item{po.items.length !== 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {po.items.slice(0, 2).map(i => `${i.item} ×${i.qty}`).join(" · ")}
                {po.items.length > 2 && ` · +${po.items.length - 2} more`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PullOutDetail({ po, branch, onBack, onUpdated }: {
  po: PullOut; branch: Branch;
  onBack: () => void;
  onUpdated: (po: PullOut) => void;
}) {
  const [loading, setLoading] = useState(false);
  const isPending = po.status === "PENDING_REVIEW";
  const sc = STATUS_COLOR[po.status];

  async function cancelPO() {
    if (!confirm(`Cancel ${po.poRef}?`)) return;
    setLoading(true);
    await auth.authStateReady();
    await saveDocById(COLS.pullOuts, po.id, { ...po as unknown as Record<string, unknown>, status: "REJECTED" });
    const updated: PullOut = { ...po, status: "REJECTED" };
    onUpdated(updated);
    setLoading(false);
    onBack();
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 24px)" }}>
      <div style={{ background: "#FFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-secondary)", fontSize: 20, lineHeight: 1 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{po.poRef}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{formatDay(po.requestedAt)} · {po.requestedBy}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "4px 10px", background: sc.bg, color: sc.text }}>{STATUS_LABEL[po.status]}</span>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {po.status === "DISPATCHED" && (
          <div style={{ background: "#EFF6FF", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#1D4ED8" }}>
            Order dispatched — check the Deliveries tab to confirm receipt.
          </div>
        )}
        {po.status === "REJECTED" && (
          <div style={{ background: "#FEF2F2", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#DC2626" }}>
            This order was rejected by commissary.
          </div>
        )}

        {po.items.map(item => (
          <div key={item.item} style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{item.item}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{item.unit}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700, fontSize: 20 }}>{item.qty}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{item.unit}</div>
            </div>
          </div>
        ))}

        {po.notes && (
          <div style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "var(--text-secondary)" }}>
            Note: {po.notes}
          </div>
        )}

        {isPending && (
          <button onClick={cancelPO} disabled={loading} style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "1.5px solid #DC2626", background: "#FFF", color: "#DC2626", fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 8 }}>
            {loading ? "Cancelling…" : "Cancel This Request"}
          </button>
        )}
      </div>
    </div>
  );
}
```

Then append the `NewManualPullOut` function and `qtyBtnStyle` from Task 7 at the bottom of this file.

- [ ] **Step 3: Commit partial (list + detail only, without NewManualPullOut)**

Do not commit until Task 7 appends `NewManualPullOut`. Proceed to Task 7.

---

## Task 7: Fix `NewManualPullOut` — item catalog + commissary-compatible write

**Files:**
- Modify: `branch-inventory/src/app/transfers/_components/PullOutsContent.tsx` (append `NewManualPullOut`)

Context: The current `NewManualPullOut` creates documents in branch's snake_case `PullOut` format with `po_number`, `delivery_day`, `item_name`, `confirmed_qty` etc. Commissary reads `pull_outs` expecting `PullOutRequest` format: `poRef`, `requestedAt`, `requestedBy`, `items[].item`, `items[].qty`. The item catalog (`PULLOUT_ITEMS`) is empty — must be populated from commissary's inventory list.

The sequence number query must count docs with the same `requestedAt` (not `delivery_day`): `where("requestedAt", "==", today)` AND `where("branch", "==", branch)`.

- [ ] **Step 0: Create `commissary-production/firestore.indexes.json` for the sequence number query**

The `getDocs` query in `NewManualPullOut` uses two `where` clauses (`branch` + `requestedAt`) on `pull_outs`. Firestore requires a composite index for this.

Create `commissary-production/firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "pull_outs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "branch",      "order": "ASCENDING" },
        { "fieldPath": "requestedAt", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

Deploy the index:

```bash
cd /Users/christiancasino/Documents/commissary-production && firebase deploy --only firestore:indexes
```

Expected: `Deploy complete!`

Commit:

```bash
cd /Users/christiancasino/Documents/commissary-production
git add firestore.indexes.json
git commit -m "feat: add composite index for pull_outs branch+requestedAt sequence query"
```

- [ ] **Step 1: Append `NewManualPullOut` to the PullOutsContent file**

Add this after the `PullOutDetail` function and before the closing of the file:

```tsx
// ── Item catalog (commissary inventory items branches can order) ──────────────

interface OrderItem { name: string; unit: "pc" | "pack"; }

const RECIPE_ITEMS: OrderItem[] = [
  "Cobbler", "Salmon Fillet", "Smoked Salmon", "Aburi Salmon",
  "Beef Tapa", "Beef Pares", "Buttermilk Chicken 300g", "Buttermilk Chicken 150g",
  "Chicken BBQ", "Burger Patty", "Adobo Flakes", "Arroz ala Cubana",
  "Roast Beef", "Mozzarella Sticks", "Kimchi", "Scallops",
  "Bacon Cubes", "Prosciutto", "Tomahawk Porkchop",
].map(name => ({ name, unit: "pc" as const }));

const PACKED_ITEMS: OrderItem[] = [
  "Miso Butter Paste", "Au Jus", "Bacon Jam", "Caramelized Onion",
  "Vodka Sauce", "Squid Ink Sauce", "Truffle Pasta Sauce", "Truffle Mushroom Paste",
  "Loco Moco Gravy", "Squash Soup", "Tomato Soup", "Tuna Spread",
  "Flatbread", "Classic Tiramisu", "Hojicha Tiramisu", "Tres Leches",
].map(name => ({ name, unit: "pc" as const }));

const LOOSE_ITEMS: OrderItem[] = [
  "Marinara Sauce", "Marinara Sauce (Blend)", "Gyudon Sauce", "Tartar", "Aioli",
  "Caesar Dressing", "Raspberry Dressing", "Candied Walnut", "House Vinaigrette",
  "Nigiri", "Burger Dressing", "Maple Syrup", "Pesto",
  "Beef Pares Sauce", "Adobo Flakes Sauce",
  "Classic Tiramisu Mascarpone", "Hojicha Tiramisu Mascarpone",
].map(name => ({ name, unit: "pack" as const }));

const COMMISSARY_ITEMS: OrderItem[] = [...RECIPE_ITEMS, ...PACKED_ITEMS, ...LOOSE_ITEMS];

function genPORef(date: string, branch: string, seq: number): string {
  const yy   = date.slice(2, 4);
  const mmdd = date.slice(5, 7) + date.slice(8, 10);
  return `PO-${yy}-${mmdd}-${branch}${String(seq).padStart(3, "0")}`;
}

function NewManualPullOut({ branch, onBack }: { branch: Branch; onBack: () => void }) {
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map());
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [session] = useState(() => {
    if (typeof window === "undefined") return null;
    const match = document.cookie.match(/(?:^|;\s*)__identity=([^;]+)/);
    if (!match) return null;
    try { return JSON.parse(decodeURIComponent(match[1])) as { displayName: string }; } catch { return null; }
  });

  const available = useMemo(() =>
    COMMISSARY_ITEMS.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  function toggleItem(name: string, unit: "pc" | "pack") {
    setSelectedItems(prev => {
      const n = new Map(prev);
      if (n.has(name)) n.delete(name);
      else n.set(name, 1);
      return n;
    });
  }
  function setQty(name: string, qty: number) {
    if (qty <= 0) setSelectedItems(prev => { const n = new Map(prev); n.delete(name); return n; });
    else setSelectedItems(prev => new Map(prev).set(name, qty));
  }

  async function submit() {
    if (selectedItems.size === 0) return;
    setLoading(true);
    const today = todayPHT();
    await auth.authStateReady();

    // Count today's pull-outs for this branch to get sequence number
    const snap = await getDocs(query(
      collection(db, COLS.pullOuts),
      where("branch", "==", branch),
      where("requestedAt", "==", today),
    ));
    const seq = snap.size + 1;
    const poRef = genPORef(today, branch, seq);
    const now = Date.now();

    const items: PullOutItem[] = Array.from(selectedItems.entries()).map(([name, qty]) => {
      const cfg = COMMISSARY_ITEMS.find(i => i.name === name)!;
      return { item: name, qty, unit: cfg.unit };
    });

    const po: PullOut = {
      id: String(now),
      poRef,
      branch,
      status: "PENDING_REVIEW",
      requestedAt: today,
      requestedBy: session?.displayName ?? BRANCH_LABELS[branch],
      items,
    };
    if (notes) (po as Record<string, unknown>).notes = notes;

    await saveDocById(COLS.pullOuts, po.id, po as unknown as Record<string, unknown>);
    setLoading(false);
    onBack();
  }

  const hasSelection = selectedItems.size > 0;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 90px)" }}>
      <div style={{ background: "#FFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-secondary)", fontSize: 20 }}>←</button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>New Pull-Out Request</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{BRANCH_LABELS[branch]}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg)", borderRadius: 10, padding: "8px 12px" }}>
          <svg width={16} height={16} fill="none" stroke="var(--text-secondary)" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…"
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 15, width: "100%", color: "var(--text)" }} />
          {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 0 }}>✕</button>}
        </div>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {available.map(item => {
          const qty = selectedItems.get(item.name);
          const isSelected = qty !== undefined;
          return (
            <div key={item.name} style={{ background: "#FFF", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", borderLeft: isSelected ? "4px solid #1A1A1A" : "4px solid transparent", display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={() => toggleItem(item.name, item.unit)} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSelected ? "#1A1A1A" : "#D1D5DB"}`, background: isSelected ? "#1A1A1A" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {isSelected && <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth={3}><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{item.unit}</div>
              </div>
              {isSelected && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => setQty(item.name, (qty ?? 1) - 1)} style={qtyBtnStyle}>−</button>
                  <input type="number" value={qty} onChange={e => setQty(item.name, Math.max(0, Number(e.target.value)))}
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
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes for commissary (optional)" rows={1}
          style={{ width: "100%", border: "1.5px solid var(--border)", borderRadius: 10, padding: "8px 12px", fontSize: 14, resize: "none", outline: "none", background: "var(--bg)", color: "var(--text)", boxSizing: "border-box", marginBottom: 8 }}
        />
        <button onClick={submit} disabled={!hasSelection || loading} style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: hasSelection ? "#1A1A1A" : "#E8E8E4", color: hasSelection ? "#FFF" : "var(--text-secondary)", fontWeight: 700, fontSize: 16, cursor: hasSelection ? "pointer" : "not-allowed" }}>
          {loading ? "Submitting…" : `Submit Request${hasSelection ? ` · ${selectedItems.size} items` : ""}`}
        </button>
      </div>
    </div>
  );
}

const qtyBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", cursor: "pointer", fontSize: 18, fontWeight: 700,
  color: "#1A1A1A", display: "flex", alignItems: "center", justifyContent: "center",
};
```

- [ ] **Step 2: Run full build**

```bash
cd /Users/christiancasino/Documents/branch-inventory && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/christiancasino/Documents/branch-inventory
git add src/app/transfers/_components/PullOutsContent.tsx
git commit -m "feat: align pull-out list/detail to commissary schema, add item catalog, fix PO write format"
```

---

## End-to-End Test Checklist

After all tasks are complete, test in this order:

1. **Branch submits pull-out** — Open branch-inventory, log in as kitchen staff, go to Transfers → Pull Outs → New Pull-Out Request. Select 2-3 items, submit. Verify document appears in commissary → Orders → Pending with correct `poRef` format (PO-26-MMDD-BF001) and correct item names.

2. **Commissary dispatches** — Open commissary, go to Orders → Pending. Tap "Prepare Order", verify items match what branch submitted. Dispatch. Verify commissary creates a delivery note (`IN_TRANSIT`) and the pull-out status changes to `DISPATCHED`.

3. **Branch sees delivery** — Back in branch-inventory, go to Transfers → Deliveries. Verify delivery note appears with the commissary's `dnRef` format (DN-26-...) and IN_TRANSIT status.

4. **Branch confirms receipt with discrepancy** — In DeliveryDetail, reduce one item quantity. Tap "Confirm Receipt with Discrepancy". Verify:
   - `delivery_notes` doc gains `receivedItems` array with correct `dispatchedQty`/`receivedQty`
   - `delivery_notes` status becomes `DISCREPANCY`
   - `pull_outs` status becomes `DISCREPANCY`

5. **Commissary Review tab shows per-item diff** — Open commissary → Orders → Review. Tap the discrepancy card. Verify a "Received vs Dispatched" table appears showing item names, dispatched quantities, received quantities, and diff (e.g. "−2").

6. **Branch confirms clean receipt** — Create another PO, dispatch, confirm receipt with all quantities matching. Verify status becomes `RECEIVED` and commissary history tab shows RECEIVED.

---

## Self-Review

**Spec coverage:**
- Branch submits pull-out request → Task 7 (NewManualPullOut writes PullOutRequest format) ✓
- Branch views order status → Task 6 (PullOutsContent with commissary statuses) ✓
- Branch confirms delivery receipt → Task 5 (DeliveryDetail writes receivedItems) ✓
- Commissary Review tab shows per-item diff → Task 2 ✓
- receivedItems field added to DeliveryNote type (both codebases) → Task 1 (commissary) + Task 4 (branch) ✓
- Firestore rules allow branch writes → Task 3 ✓

**Placeholder scan:** No TBD/TODO in implementation code.

**Type consistency:**
- `ReceivedItem.item` used in commissary Task 1 — same field name `item` used in Task 5 `DeliveriesContent` when building `receivedItems` array ✓
- `PullOut.poRef` in branch Task 4 type matches `PullOutRequest.poRef` in commissary ✓
- `DeliveryNote.dnRef` in branch Task 4 type matches commissary `delivery-notes.ts` ✓
