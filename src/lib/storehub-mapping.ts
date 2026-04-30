// MKT StoreHub SKU → commissary item mapping
// Each LinkedSku maps one StoreHub SKU to a deduction quantity.
// Multiple commissary items can reference the same SKU (e.g. Fish & Chips → Cobbler + Tartar).
// For loose items, ordersPerPack converts raw order count → packs consumed (floor division).

type LinkedSku = string | { sku: string; qty: number };

interface StoreHubMappingEntry {
  item: string; // must match CATALOG exactly
  linkedSkus: LinkedSku[];
  ordersPerPack?: number; // loose items only — from Portion Guide (April 2026)
}

const STOREHUB_MAPPING: StoreHubMappingEntry[] = [
  // ── PORTIONS ─────────────────────────────────────────────────────────────
  { item: "Cobbler",                 linkedSkus: ["66", { sku: "156", qty: 3 }, "B5"] },
  { item: "Smoked Salmon",           linkedSkus: ["63", "175", "160"] },
  { item: "Aburi Salmon",            linkedSkus: ["53", { sku: "150", qty: 3 }] },
  { item: "Beef Tapa",               linkedSkus: ["58", { sku: "151", qty: 3 }] },
  { item: "Beef Pares",              linkedSkus: ["54", "72", { sku: "172", qty: 3 }] },
  { item: "Buttermilk Chicken 300g", linkedSkus: ["68"] },
  { item: "Buttermilk Chicken 150g", linkedSkus: ["69", "81", "B10"] },
  { item: "Chicken BBQ",             linkedSkus: ["84", "B7"] },
  { item: "Burger Patty",            linkedSkus: ["67", "M2", "M3"] },
  { item: "Adobo Flakes",            linkedSkus: ["55"] },
  { item: "Arroz ala Cubana",        linkedSkus: ["56"] },
  { item: "Roast Beef",              linkedSkus: ["S1", "B11"] },
  { item: "Salmon Fillet",           linkedSkus: ["M1"] },
  { item: "Mozzarella Sticks",       linkedSkus: ["45", "B2"] },
  { item: "Scallops",                linkedSkus: ["P2", { sku: "166", qty: 3 }] },
  { item: "Bacon Cubes",             linkedSkus: ["P6", { sku: "167", qty: 3 }] },
  { item: "Prosciutto",              linkedSkus: ["P1", "P5"] },
  // ── PACKED ───────────────────────────────────────────────────────────────
  { item: "Tomahawk Porkchop",       linkedSkus: ["70"] },
  { item: "Miso Butter Paste",       linkedSkus: ["53", { sku: "150", qty: 3 }] },
  { item: "Au Jus",                  linkedSkus: ["S1", "B11"] },
  { item: "Bacon Jam",               linkedSkus: ["S1", "B11"] },
  { item: "Caramelized Onion",       linkedSkus: ["67", "M3", "S1", "B11"] },
  { item: "Vodka Sauce",             linkedSkus: ["P1", "P5"] },
  { item: "Squid Ink Sauce",         linkedSkus: ["P2", { sku: "166", qty: 3 }] },
  { item: "Truffle Pasta Sauce",     linkedSkus: ["73", { sku: "170", qty: 3 }] },
  { item: "Truffle Mushroom Paste",  linkedSkus: ["48"] },
  { item: "Loco Moco Gravy",         linkedSkus: ["M2"] },
  { item: "Squash Soup",             linkedSkus: ["46"] },
  { item: "Tomato Soup",             linkedSkus: [{ sku: "47", qty: 2 }, { sku: "83", qty: 1 }, { sku: "S3", qty: 1 }, { sku: "B8", qty: 1 }] },
  { item: "Tuna Spread",             linkedSkus: ["86", "B6"] },
  { item: "Flatbread",               linkedSkus: ["79", "B12", "P4"] },
  // ── LOOSE — ordersPerPack from Portion Guide (April 2026) ────────────────
  { item: "Gyudon Sauce",            linkedSkus: ["52", { sku: "171", qty: 3 }, "B4"],                ordersPerPack: 18 },
  { item: "Tartar",                  linkedSkus: ["66", { sku: "156", qty: 3 }, "B5", "63"],          ordersPerPack: 33 },
  { item: "Caesar Dressing",         linkedSkus: ["50", { sku: "154", qty: 3 }],                      ordersPerPack: 16 },
  { item: "Raspberry Dressing",      linkedSkus: ["161", { sku: "162", qty: 3 }],                     ordersPerPack: 10 },
  { item: "Candied Walnut",          linkedSkus: ["161", { sku: "162", qty: 3 }],                     ordersPerPack: 5  },
  { item: "Burger Dressing",         linkedSkus: ["67", "M3", "81", "B10"],                           ordersPerPack: 16 },
  { item: "Maple Syrup",             linkedSkus: ["61"],                                              ordersPerPack: 10 },
  { item: "Pesto",                   linkedSkus: ["84", "B7"],                                        ordersPerPack: 10 },
  { item: "Beef Pares Sauce",        linkedSkus: ["54", "72", { sku: "172", qty: 3 }],                ordersPerPack: 16 },
  { item: "Adobo Flakes Sauce",      linkedSkus: ["55"],                                              ordersPerPack: 16 },
  { item: "Aioli",                   linkedSkus: ["66", { sku: "156", qty: 3 }, "B5"],                ordersPerPack: 33 },
  { item: "Nigiri",                  linkedSkus: ["53"],                                              ordersPerPack: 25 },
  { item: "Marinara Sauce",          linkedSkus: ["79", "69"],                                        ordersPerPack: 10 },
  { item: "Marinara Sauce (Blend)",  linkedSkus: ["45", "B2"],                                        ordersPerPack: 10 },
  { item: "House Vinaigrette",       linkedSkus: ["62", "63", "64", "C24"],                           ordersPerPack: 25 },
];

// All SKUs referenced in the mapping (for identifying unmatched sold items)
export function allMappedSkus(): Set<string> {
  const skus = new Set<string>();
  for (const entry of STOREHUB_MAPPING) {
    for (const link of entry.linkedSkus) {
      skus.add(typeof link === "string" ? link : link.sku);
    }
  }
  return skus;
}

// Apply mapping: soldBySkuMap is { sku → qty sold }
export function applyStoreHubMapping(
  soldBySkuMap: Record<string, number>
): { item: string; qty: number; rawOrders?: number }[] {
  const results: { item: string; qty: number; rawOrders?: number }[] = [];
  for (const entry of STOREHUB_MAPPING) {
    let orders = 0;
    for (const link of entry.linkedSkus) {
      const sku    = typeof link === "string" ? link : link.sku;
      const perQty = typeof link === "string" ? 1 : link.qty;
      const count  = soldBySkuMap[sku] ?? 0;
      if (!count) continue;
      orders += count * perQty;
    }
    if (orders <= 0) continue;
    if (entry.ordersPerPack) {
      // Loose items: qty = packs consumed (for formula); rawOrders = order count (for display)
      const qty = Math.ceil(orders / entry.ordersPerPack);
      results.push({ item: entry.item, qty, rawOrders: orders });
    } else {
      // Portions/packed: 1 order = 1 unit, no rawOrders needed
      results.push({ item: entry.item, qty: orders });
    }
  }
  return results;
}
