import type { Branch } from "./types";

// Delivery slots — each slot is a specific branch+weekday combination
export type DeliverySlot = "BF_MON" | "BF_THU" | "MKT_MON" | "MKT_WED" | "MKT_FRI";

export interface PullOutConfigItem {
  name: string;
  category: "loose" | "packed" | "portioned";
  itemClass: "A" | "B" | "C";
  // qty per delivery slot; omitted slots = 0 (discontinued or not applicable)
  slots: Partial<Record<DeliverySlot, number>>;
}

// Baseline quantities — April 2026 validated data from Knowledge Database - Validation.xlsx
// Source: Recipe & Packaging Detail sheet, BF Mon/Thu + MKT Mon/Wed/Fri columns
// All quantities are in sealed packs (pc), per Section 2.1 of the spec.
export const PULLOUT_ITEMS: PullOutConfigItem[] = [
  // ── LOOSE ITEMS (vacuum-sealed bags) ──────────────────────────────────────
  { name: "Gyudon Sauce",       category: "loose",     itemClass: "A", slots: { BF_MON: 3, BF_THU: 4, MKT_MON: 4, MKT_WED: 4, MKT_FRI: 7 } },
  { name: "Tartar w/ Dill",     category: "loose",     itemClass: "A", slots: { BF_MON: 2, BF_THU: 2, MKT_MON: 2, MKT_WED: 2, MKT_FRI: 3 } },
  { name: "Aioli",              category: "loose",     itemClass: "A", slots: { BF_MON: 2, BF_THU: 3, MKT_MON: 2, MKT_WED: 2, MKT_FRI: 3 } },
  { name: "Nigiri",             category: "loose",     itemClass: "A", slots: { BF_MON: 2, BF_THU: 2, MKT_MON: 2, MKT_WED: 2, MKT_FRI: 3 } },
  { name: "Burger Dressing",    category: "loose",     itemClass: "B", slots: { BF_MON: 3, BF_THU: 4, MKT_MON: 3, MKT_WED: 3, MKT_FRI: 5 } },
  { name: "Maple Syrup",        category: "loose",     itemClass: "B", slots: {                        MKT_MON: 1, MKT_WED: 1, MKT_FRI: 2 } },
  { name: "Caesar Dressing",    category: "loose",     itemClass: "B", slots: { BF_MON: 1, BF_THU: 2, MKT_MON: 1, MKT_WED: 1, MKT_FRI: 2 } },
  { name: "Raspberry Dressing", category: "loose",     itemClass: "C", slots: { BF_MON: 1, BF_THU: 2, MKT_MON: 1, MKT_WED: 1, MKT_FRI: 2 } },

  // ── PACKED / RECIPE-BASED ─────────────────────────────────────────────────
  { name: "Miso Butter Paste",       category: "packed", itemClass: "A", slots: { BF_MON: 30, BF_THU: 47, MKT_MON: 49, MKT_WED: 49, MKT_FRI: 88 } },
  { name: "Squid Ink Sauce",         category: "packed", itemClass: "B", slots: { BF_MON: 13, BF_THU: 22, MKT_MON: 15, MKT_WED: 15, MKT_FRI: 26 } },
  { name: "Truffle Pasta Sauce",     category: "packed", itemClass: "B", slots: {                          MKT_MON: 13, MKT_WED: 13, MKT_FRI: 24 } },
  { name: "Bacon Jam",               category: "packed", itemClass: "B", slots: { BF_MON: 13, BF_THU: 22, MKT_MON: 12, MKT_WED: 12, MKT_FRI: 20 } },
  { name: "Loco Moco Gravy",         category: "packed", itemClass: "A", slots: {                          MKT_MON: 18, MKT_WED: 18, MKT_FRI: 42 } },
  { name: "Vodka Sauce",             category: "packed", itemClass: "A", slots: {                          MKT_MON: 21, MKT_WED: 21, MKT_FRI: 39 } },
  { name: "Au Jus",                  category: "packed", itemClass: "B", slots: { BF_MON:  8, BF_THU: 15, MKT_MON: 12, MKT_WED: 12, MKT_FRI: 20 } },
  { name: "Truffle Mushroom Paste",  category: "packed", itemClass: "C", slots: { BF_MON:  8, BF_THU: 14, MKT_MON:  6, MKT_WED:  6, MKT_FRI: 12 } },
  { name: "Caramelized Onion Burger",category: "packed", itemClass: "B", slots: { BF_MON: 13, BF_THU: 22, MKT_MON: 13, MKT_WED: 13, MKT_FRI: 23 } },
  { name: "Squash Soup",             category: "packed", itemClass: "B", slots: { BF_MON: 14, BF_THU: 19, MKT_MON: 12, MKT_WED: 12, MKT_FRI: 19 } },
  { name: "Tomato Soup",             category: "packed", itemClass: "B", slots: {                          MKT_MON: 25, MKT_WED: 25, MKT_FRI: 35 } },

  // ── PORTIONED PROTEINS & PREP ─────────────────────────────────────────────
  { name: "Cobbler",                 category: "portioned", itemClass: "A", slots: { BF_MON: 55, BF_THU: 77, MKT_MON: 52, MKT_WED: 52, MKT_FRI: 93 } },
  { name: "Aburi Salmon",            category: "portioned", itemClass: "A", slots: { BF_MON: 30, BF_THU: 47, MKT_MON: 49, MKT_WED: 49, MKT_FRI: 88 } },
  { name: "Burger Patty",            category: "portioned", itemClass: "A", slots: { BF_MON: 21, BF_THU: 29, MKT_MON: 31, MKT_WED: 31, MKT_FRI: 65 } },
  { name: "Buttermilk Chicken 300g", category: "portioned", itemClass: "A", slots: { BF_MON: 16, BF_THU: 26, MKT_MON: 22, MKT_WED: 22, MKT_FRI: 50 } },
  { name: "Buttermilk Chicken 150g", category: "portioned", itemClass: "A", slots: { BF_MON: 34, BF_THU: 52, MKT_MON: 29, MKT_WED: 29, MKT_FRI: 43 } },
  { name: "Adobo Flakes",            category: "portioned", itemClass: "A", slots: { BF_MON: 17, BF_THU: 23, MKT_MON: 20, MKT_WED: 20, MKT_FRI: 32 } },
  { name: "Beef Pares",              category: "portioned", itemClass: "A", slots: { BF_MON: 13, BF_THU: 21, MKT_MON: 20, MKT_WED: 20, MKT_FRI: 41 } },
  { name: "Beef Tapa",               category: "portioned", itemClass: "A", slots: { BF_MON: 25, BF_THU: 40, MKT_MON: 14, MKT_WED: 14, MKT_FRI: 25 } },
  { name: "Grilled Cheese",          category: "portioned", itemClass: "A", slots: {                          MKT_MON: 18, MKT_WED: 18, MKT_FRI: 29 } },
  { name: "Smoked Salmon",           category: "portioned", itemClass: "A", slots: { BF_MON:  5, BF_THU:  9, MKT_MON: 16, MKT_WED: 16, MKT_FRI: 31 } },
  { name: "Scallops",                category: "portioned", itemClass: "A", slots: { BF_MON: 13, BF_THU: 22, MKT_MON: 15, MKT_WED: 15, MKT_FRI: 26 } },
  { name: "Chicken BBQ",             category: "portioned", itemClass: "B", slots: { BF_MON: 14, BF_THU: 23, MKT_MON:  9, MKT_WED:  9, MKT_FRI: 15 } },
  { name: "Mozzarella Sticks",       category: "portioned", itemClass: "B", slots: { BF_MON: 11, BF_THU: 15, MKT_MON: 12, MKT_WED: 12, MKT_FRI: 22 } },
  { name: "Roast Beef",              category: "portioned", itemClass: "B", slots: { BF_MON:  8, BF_THU: 15, MKT_MON: 12, MKT_WED: 12, MKT_FRI: 20 } },
  { name: "Arroz ala Cubana",        category: "portioned", itemClass: "B", slots: { BF_MON:  7, BF_THU: 11, MKT_MON: 12, MKT_WED: 12, MKT_FRI: 15 } },
  { name: "Prosciutto",              category: "portioned", itemClass: "B", slots: { BF_MON: 12, BF_THU: 14, MKT_MON: 21, MKT_WED: 21, MKT_FRI: 39 } },
  { name: "Bacon Cubes",             category: "portioned", itemClass: "B", slots: { BF_MON: 16, BF_THU: 19, MKT_MON: 18, MKT_WED: 18, MKT_FRI: 36 } },
  { name: "Tuna Spread",             category: "portioned", itemClass: "B", slots: { BF_MON: 12, BF_THU: 15 } },
  { name: "Flatbread",               category: "portioned", itemClass: "C", slots: { BF_MON:  5, BF_THU:  6, MKT_MON:  3, MKT_WED:  3, MKT_FRI:  6 } },
  { name: "Salmon Fillet",           category: "portioned", itemClass: "C", slots: { BF_MON:  4, BF_THU:  7, MKT_MON:  2, MKT_WED:  2, MKT_FRI:  5 } },
  { name: "Tomahawk Porkchop",       category: "portioned", itemClass: "C", slots: {                          MKT_MON:  4, MKT_WED:  4, MKT_FRI:  7 } },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

// Map branch + JS day-of-week (0=Sun…6=Sat) → DeliverySlot
export function getDeliverySlot(branch: Branch, dayOfWeek: number): DeliverySlot | null {
  if (branch === "BF") {
    if (dayOfWeek === 1) return "BF_MON";
    if (dayOfWeek === 4) return "BF_THU";
  } else {
    if (dayOfWeek === 1) return "MKT_MON";
    if (dayOfWeek === 3) return "MKT_WED";
    if (dayOfWeek === 5) return "MKT_FRI";
  }
  return null;
}

// Given the Saturday the cron runs, return all 5 delivery dates for next week
export function getNextWeekDeliveries(saturday: Date): {
  branch: Branch;
  date: string;
  slot: DeliverySlot;
}[] {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const add = (days: number) => {
    const d = new Date(saturday);
    d.setDate(d.getDate() + days);
    return d;
  };
  return [
    { branch: "BF",  date: fmt(add(2)), slot: "BF_MON"  },  // Monday
    { branch: "BF",  date: fmt(add(5)), slot: "BF_THU"  },  // Thursday
    { branch: "MKT", date: fmt(add(2)), slot: "MKT_MON" },  // Monday
    { branch: "MKT", date: fmt(add(4)), slot: "MKT_WED" },  // Wednesday
    { branch: "MKT", date: fmt(add(6)), slot: "MKT_FRI" },  // Friday
  ];
}

// Build items list for a given slot — omits items with no qty for that slot
export function getItemsForSlot(slot: DeliverySlot) {
  return PULLOUT_ITEMS
    .filter(item => (item.slots[slot] ?? 0) > 0)
    .map(item => ({
      item_name:      item.name,
      item_class:     item.itemClass,
      calculated_qty: item.slots[slot]!,
      confirmed_qty:  item.slots[slot]!,
      unit:           "pc" as const,
    }));
}

// PO / DN number formatters: PO-26-0428-BF001
export function generatePoNumber(branch: Branch, date: string, seq: number): string {
  const yy   = date.slice(2, 4);
  const mmdd = date.slice(5, 7) + date.slice(8, 10);
  const code = branch === "BF" ? "BF" : "MKT";
  return `PO-${yy}-${mmdd}-${code}${String(seq).padStart(3, "0")}`;
}

export function generateDnNumber(branch: Branch, date: string, seq: number): string {
  const yy   = date.slice(2, 4);
  const mmdd = date.slice(5, 7) + date.slice(8, 10);
  const code = branch === "BF" ? "BF" : "MKT";
  return `DN-${yy}-${mmdd}-${code}${String(seq).padStart(3, "0")}`;
}

// Human-readable delivery slot label
export function slotLabel(slot: DeliverySlot): string {
  const map: Record<DeliverySlot, string> = {
    BF_MON:  "BF — Monday",
    BF_THU:  "BF — Thursday",
    MKT_MON: "MKT — Monday",
    MKT_WED: "MKT — Wednesday",
    MKT_FRI: "MKT — Friday",
  };
  return map[slot];
}
