import type { DeliveryNote } from "@/lib/types";

export function isIncomplete(dn: DeliveryNote): boolean {
  return dn.items.some(i => i.dispatchedQty < i.requestedQty);
}

export function fulfillmentPct(dn: DeliveryNote): number {
  const total = dn.items.reduce((s, i) => s + i.requestedQty, 0);
  const sent  = dn.items.reduce((s, i) => s + i.dispatchedQty, 0);
  return total > 0 ? Math.round((sent / total) * 100) : 100;
}
