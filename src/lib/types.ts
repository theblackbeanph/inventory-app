import type { Role } from "./roles";

export type Branch = "MKT" | "BF";
export type Department = "kitchen" | "bar" | "cafe";
export type ItemCategory = "portion" | "packed" | "loose" | "supplier";
export type AdjustmentType = "in" | "out" | "waste" | "count" | "sales_import" | "correction";
export type PosType = "csv" | "storehub";
export type RequestStatus = "pending" | "approved" | "in_transit" | "received";

export interface CatalogItem {
  name: string;
  category: ItemCategory;
  unit: "pc" | "g" | "pack";
  reorderAt: number;
  packSize: string;
  department: Department;
  location: string;       // storage location — used for stocktake filters (e.g. "front_kitchen")
  ordersPerPack?: number; // loose items only — orders needed to consume 1 pack
  branches?: Branch[];    // if set, only these branches carry this item
}

export interface BranchStock {
  id: string;            // `${branch}__${department}__${itemSlug(item)}`
  branch: Branch;
  department: Department;
  item: string;
  category: ItemCategory;
  unit: "pc" | "g" | "pack";
  qty: number;
  reorderAt: number;
  lastUpdated: string;
  lastUpdatedBy: string;
}

export interface StockAdjustment {
  id: number;
  branch: Branch;
  department: Department;
  date: string;
  item: string;
  type: AdjustmentType;
  qty: number;           // pack count for loose items, unit count for portions/packed
  rawOrders?: number;    // loose sales_import only — raw POS order count, for display/validation
  note?: string;
  loggedBy: string;
  source?: "csv" | "storehub";
}

export interface PulloutRequest {
  id: number;
  poRef: string;         // MKT-260402-01
  branch: Branch;
  date: string;
  requestedBy: string;
  status: RequestStatus;
  items: PulloutItem[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  fulfilledAt?: string;
  receivedAt?: string;
  receivedBy?: string;
}

export interface PulloutItem {
  item: string;
  category: ItemCategory;
  qty: number;
  unit: "pc" | "g" | "pack";
  currentStock?: number;
}

export interface AuthState {
  branch: Branch;
  department: Department;
  displayName: string;
  role: Role;
  uid: string;
}

export interface UserDoc {
  role: Role;
  branch: Branch | "both";
  department: Department | "all";
  displayName: string;
}

// ── Pull-Out module ───────────────────────────────────────────────────────────

// CANCELLED = branch self-cancelled before commissary reviewed; REJECTED = commissary refused
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

// ── Delivery module ───────────────────────────────────────────────────────────

// Matches commissary's DeliveryNoteStatus exactly
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

// ── Production module ─────────────────────────────────────────────────────────

export interface SupplierDelivery {
  id: string;
  branch: Branch;
  date: string;
  loggedBy: string;
  supplier?: string;
  items: SupplierDeliveryItem[];
  notes?: string;
}

export interface SupplierDeliveryItem {
  rawItem: string;
  packsReceived: number;
}

export interface PortioningRun {
  id: string;
  branch: Branch;
  date: string;
  loggedBy: string;
  rawItem: string;
  packsUsed: number;
  portionedItem: string;
  portionsProduced: number;
  notes?: string;
}

export interface StocktakeDraft {
  id: string;         // `${branch}__${department}__${date}__${location}`
  branch: Branch;
  department: Department;
  date: string;       // YYYY-MM-DD
  location: string;   // LocationId
  counts: Record<string, number>;
  savedAt: string;    // ISO timestamp
  savedBy: string;
}

export interface DeliveryDraft {
  id: string;         // `${branch}__${department}__${date}`
  branch: Branch;
  department: Department;
  date: string;       // YYYY-MM-DD
  counts: Record<string, number>;
  savedAt: string;    // ISO timestamp
  savedBy: string;
}

export interface DeliveryClose {
  id: string;         // `${branch}__${department}__${date}`
  branch: Branch;
  department: Department;
  date: string;       // YYYY-MM-DD
  items: Record<string, number>;  // item → submitted qty
  closedAt: string;               // ISO timestamp
  closedBy: string;
}

export interface DailyBeginning {
  id: string;        // `${branch}__${department}__${item}__${date}`
  branch: Branch;
  department: Department;
  item: string;
  date: string;      // YYYY-MM-DD
  qty: number;
  setBy: string;
  updatedAt: string;
}

export interface DailyCloseItem {
  beginning: number;
  inQty: number;
  outQty: number;
  expected: number;
  endCount: number;
  variance: number;
}

export interface DailyClose {
  id: string;                         // `${branch}__${department}__${date}`
  branch: Branch;
  department: Department;
  date: string;                       // YYYY-MM-DD
  countType: "manual" | "system";
  closedAt: string;                   // ISO timestamp
  closedBy: string;                   // branch label or "system"
  isLocked: boolean;
  items: Record<string, DailyCloseItem>;
}

export type ExplanationReason = "Counting error" | "Waste" | "Data entry error" | "Unknown";

export interface VarianceExplanation {
  id: string;          // `${branch}__${department}__${itemSlug(item)}__${date}`
  branch: Branch;
  department: Department;
  item: string;
  date: string;        // YYYY-MM-DD
  explanation: ExplanationReason;
  notes: string;       // Phase 2 free-text — always "" for now
  savedBy: string;     // Firebase Auth uid
  savedAt: string;     // ISO timestamp
}
