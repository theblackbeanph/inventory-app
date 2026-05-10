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
