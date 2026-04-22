export type Branch = "MKT" | "BF";
export type ItemCategory = "portion" | "packed" | "loose";
export type AdjustmentType = "in" | "out" | "waste" | "count";
export type RequestStatus = "pending" | "approved" | "in_transit" | "received";

export interface CatalogItem {
  name: string;
  category: ItemCategory;
  unit: "pc" | "g";
  reorderAt: number;
}

export interface BranchStock {
  id: string;            // `${branch}__${item}`
  branch: Branch;
  item: string;
  category: ItemCategory;
  unit: "pc" | "g";
  qty: number;
  reorderAt: number;
  lastUpdated: string;
  lastUpdatedBy: string;
}

export interface StockAdjustment {
  id: number;
  branch: Branch;
  date: string;
  item: string;
  type: AdjustmentType;
  qty: number;
  note?: string;
  loggedBy: string;
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
  unit: "pc" | "g";
  currentStock?: number;
}

export interface AuthState {
  branch: Branch;
  authedAt: number;
}

export interface DailyBeginning {
  id: string;        // `${branch}__${item}__${date}`
  branch: Branch;
  item: string;
  date: string;      // YYYY-MM-DD
  qty: number;
  setBy: string;
  updatedAt: string;
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
  unit: "pc" | "g";
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
  unit: "pc" | "g";
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

export interface DailyBeginning {
  id: string;        // `${branch}__${item}__${date}`
  branch: Branch;
  item: string;
  date: string;      // YYYY-MM-DD
  qty: number;
  setBy: string;
  updatedAt: string;
}
