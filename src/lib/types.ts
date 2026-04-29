import type { Role } from "./roles";

export type Branch = "MKT" | "BF";
export type Department = "kitchen" | "bar" | "cafe";
export type ItemCategory = "portion" | "packed" | "loose" | "supplier";
export type AdjustmentType = "in" | "out" | "waste" | "count" | "sales_import";
export type PosType = "csv" | "storehub";
export type RequestStatus = "pending" | "approved" | "in_transit" | "received";

export interface CatalogItem {
  name: string;
  category: ItemCategory;
  unit: "pc" | "g" | "pack";
  reorderAt: number;
  packSize: string;
  department: Department;
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
  qty: number;
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

export type PullOutStatus =
  | "PENDING_REVIEW"
  | "CONFIRMED"
  | "PREPARING"
  | "DISPATCHED"
  | "COMPLETED"
  | "CANCELLED";

export type PullOutType = "AUTO" | "MANUAL";

export interface PullOutItem {
  item_name: string;
  item_class: "A" | "B" | "C";
  calculated_qty: number;   // system forecast (packs)
  confirmed_qty: number;    // supervisor-adjusted (packs)
  unit: "pc" | "g" | "pack";
}

export interface PullOut {
  id: string;
  po_number: string;         // PO-26-0428-BF001
  type: PullOutType;
  branch: Branch;
  delivery_day: string;      // YYYY-MM-DD — the branch receives on this day
  status: PullOutStatus;
  created_at: string;
  confirmed_at?: string;
  confirmed_by?: string;
  notes?: string;
  items: PullOutItem[];
  delivery_note_id?: string;
}

// ── Delivery module ───────────────────────────────────────────────────────────

export type DeliveryStatus =
  | "PENDING"
  | "IN_TRANSIT"
  | "RECEIVED"
  | "DISCREPANCY"
  | "CANCELLED";

export interface DeliveryNoteItem {
  item_name: string;
  unit: "pc" | "g" | "pack";
  dispatched_qty: number;
  received_qty?: number;
  discrepancy?: number;      // received_qty − dispatched_qty
}

export interface DeliveryNote {
  id: string;
  dn_number: string;         // DN-26-0428-BF001
  pull_out_id: string;
  po_number: string;
  branch: Branch;
  status: DeliveryStatus;
  dispatched_at?: string;
  received_at?: string;
  received_by?: string;
  items: DeliveryNoteItem[];
  has_discrepancy: boolean;
  discrepancy_notes?: string;
  commissary_notified: boolean;
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
