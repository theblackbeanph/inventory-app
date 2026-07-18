// StoreHub SKU → commissary item mapping
// Each LinkedSku maps one StoreHub SKU to a deduction quantity.
// Multiple commissary items can reference the same SKU (e.g. Fish & Chips → Cobbler + Tartar).
// For loose items, ordersPerPack converts raw order count → packs consumed (floor division).

type LinkedSku = string | { sku: string; qty: number };

interface StoreHubMappingEntry {
  item: string; // must match CATALOG exactly
  linkedSkus: LinkedSku[];
  ordersPerPack?: number; // loose items only — from Portion Guide (April 2026)
}

const MKT_MAPPING: StoreHubMappingEntry[] = [
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
  { item: "Squid Ink Sauce",         linkedSkus: ["P2", { sku: "166", qty: 3 }] },
  { item: "Truffle Pasta Sauce",     linkedSkus: ["73", { sku: "170", qty: 3 }] },
  { item: "Truffle Mushroom Paste",  linkedSkus: ["48"] },
  { item: "Loco Moco Gravy",         linkedSkus: ["M2"] },
  { item: "Squash Soup",             linkedSkus: ["46"] },
  { item: "Tomato Soup",             linkedSkus: [{ sku: "47", qty: 2 }, { sku: "83", qty: 1 }, { sku: "S3", qty: 1 }, { sku: "B8", qty: 1 }] },
  { item: "Tuna Spread",             linkedSkus: ["86", "B6"] },
  { item: "Salted Egg Sauce",        linkedSkus: ["75", { sku: "163", qty: 3 }] },
  { item: "Salted Egg Custard",      linkedSkus: ["C09"] },
  { item: "Flatbread",               linkedSkus: ["79", "B12", "P4"] },
  { item: "Burrata",                 linkedSkus: ["P5", "P4"] },
  { item: "Clam Chowder",            linkedSkus: ["49"] },
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
  { item: "Marinara Sauce",          linkedSkus: ["79", "69", "45", "B2"],                            ordersPerPack: 10 },
  { item: "House Vinaigrette",       linkedSkus: ["62", "63", "64", "C24"],                           ordersPerPack: 25 },
  { item: "Vodka Sauce",             linkedSkus: ["P1", "P5"],                                        ordersPerPack: 6  },
  { item: "Ube Halaya",              linkedSkus: ["S3", "70"],                                        ordersPerPack: 7  },
];

// BF uses unified SKU IDs (MAIN05, BREAK01, etc.) — MKT will migrate to these eventually.
// Party trays deduct qty:3 per order; Breakfast Sampler (PARTY03) deducts qty:2.
const BF_MAPPING: StoreHubMappingEntry[] = [
  // ── PORTIONS ─────────────────────────────────────────────────────────────
  { item: "Cobbler",                 linkedSkus: ["MAIN05", { sku: "PARTY05", qty: 3 }] },
  { item: "Salmon Fillet",           linkedSkus: ["MAIN04"] },
  { item: "Smoked Salmon",           linkedSkus: ["BREAK09", "EXT15", "BREAK16"] },
  { item: "Aburi Salmon",            linkedSkus: ["BREAK01", { sku: "PARTY01", qty: 3 }] },
  { item: "Miso Butter Paste",       linkedSkus: ["BREAK01", { sku: "PARTY01", qty: 3 }] },
  { item: "Beef Tapa",               linkedSkus: ["BREAK05", { sku: "PARTY02", qty: 3 }, { sku: "PARTY03", qty: 2 }] },
  { item: "Beef Pares",              linkedSkus: ["BREAK04", "PSTA04", { sku: "PARTY06", qty: 3 }] },
  { item: "Buttermilk Chicken 300g", linkedSkus: ["MAIN01"] },
  { item: "Buttermilk Chicken 150g", linkedSkus: ["MAIN02", "SW06", "MAIN03"] },
  { item: "Chicken BBQ",             linkedSkus: ["SW01", "PSTA03"] },
  { item: "Burger Patty",            linkedSkus: ["MAIN07", "MAIN06"] },
  { item: "Adobo Flakes",            linkedSkus: ["BREAK02", "BREAK17"] },
  { item: "Arroz ala Cubana",        linkedSkus: ["BREAK03"] },
  { item: "Roast Beef",              linkedSkus: ["SW03"] },
  { item: "Mozzarella Sticks",       linkedSkus: ["APP02"] },
  { item: "Clam Chowder",            linkedSkus: ["APP01"] },
  { item: "Scallops",                linkedSkus: ["PSTA06", { sku: "PARTY09", qty: 3 }] },
  { item: "Bacon Cubes",             linkedSkus: ["PSTA07", { sku: "PARTY10", qty: 3 }] },
  { item: "Prosciutto",              linkedSkus: ["PSTA09", "PSTA10"] },
  // ── PACKED ───────────────────────────────────────────────────────────────
  { item: "Au Jus",                  linkedSkus: ["SW03"] },
  { item: "Bacon Jam",               linkedSkus: ["SW03"] },
  { item: "Caramelized Onion",       linkedSkus: ["MAIN07", "SW03"] },
  { item: "Squid Ink Sauce",         linkedSkus: ["PSTA06", { sku: "PARTY09", qty: 3 }] },
  { item: "Truffle Mushroom Paste",  linkedSkus: ["APP08"] },
  { item: "Squash Soup",             linkedSkus: ["APP04"] },
  { item: "Tuna Spread",             linkedSkus: ["SW04"] },
  { item: "Burrata",                 linkedSkus: ["FLATB02", "PSTA09"] },
  { item: "Flatbread",               linkedSkus: ["FLATB01", "FLATB02"] },
  { item: "Tomahawk Porkchop",       linkedSkus: ["MAIN09"] },
  { item: "Salted Egg Sauce",        linkedSkus: ["PSTA05", { sku: "PARTY08", qty: 3 }] },
  { item: "Salted Egg Custard",      linkedSkus: ["BREAK12"] },
  // ── LOOSE — ordersPerPack from Portion Guide (April 2026) ────────────────
  { item: "Gyudon Sauce",            linkedSkus: ["BREAK07", { sku: "PARTY12", qty: 3 }],                      ordersPerPack: 18 },
  { item: "Tartar",                  linkedSkus: ["MAIN05", { sku: "PARTY05", qty: 3 }, "BREAK09"],            ordersPerPack: 33 },
  { item: "Aioli",                   linkedSkus: ["MAIN05", { sku: "PARTY05", qty: 3 }],                      ordersPerPack: 33 },
  { item: "Caesar Dressing",         linkedSkus: ["APP05", { sku: "PARTY04", qty: 3 }],                       ordersPerPack: 16 },
  { item: "Raspberry Dressing",      linkedSkus: ["APP03", { sku: "PARTY07", qty: 3 }],                       ordersPerPack: 10 },
  { item: "Candied Walnut",          linkedSkus: ["APP03", { sku: "PARTY07", qty: 3 }],                       ordersPerPack: 5  },
  { item: "Nigiri",                  linkedSkus: ["BREAK01", { sku: "PARTY01", qty: 3 }],                     ordersPerPack: 25 },
  { item: "Burger Dressing",         linkedSkus: ["MAIN07", "SW06"],                                          ordersPerPack: 16 },
  { item: "Pesto",                   linkedSkus: ["SW01", "PSTA03"],                                          ordersPerPack: 10 },
  { item: "Beef Pares Sauce",        linkedSkus: ["BREAK04", "PSTA04", { sku: "PARTY06", qty: 3 }],           ordersPerPack: 16 },
  { item: "Adobo Flakes Sauce",      linkedSkus: ["BREAK02", "BREAK17"],                                      ordersPerPack: 16 },
  { item: "Ube Halaya",              linkedSkus: ["SW05", "MAIN09"],                                          ordersPerPack: 7  },
  // ── SUPPLIER — BF only ────────────────────────────────────────────────────
  { item: "Pandesal",               linkedSkus: ["BREAK08", "BREAK09"] },
  { item: "Potato Buns",            linkedSkus: ["MAIN07", "SW06"] },
  { item: "Longganisa Duo",         linkedSkus: ["BREAK06", { sku: "PARTY03", qty: 2 }] },
  { item: "Wagyu Cubes",            linkedSkus: ["BREAK07", { sku: "PARTY12", qty: 3 }] },
  { item: "Farmer's Ham",           linkedSkus: ["BREAK08", "BREAK10"] },
  { item: "Bacon Strip",            linkedSkus: ["APP05", { sku: "PARTY04", qty: 3 }, "BREAK10", { sku: "EXT14", qty: 2 }] },
];

const BRANCH_MAPPINGS: Record<string, StoreHubMappingEntry[]> = { MKT: MKT_MAPPING, BF: BF_MAPPING };

function getMappingForBranch(branch: string): StoreHubMappingEntry[] {
  return BRANCH_MAPPINGS[branch] ?? [];
}

// All SKUs referenced in the mapping for a given branch (for identifying unmatched sold items)
export function allMappedSkus(branch: string): Set<string> {
  const skus = new Set<string>();
  for (const entry of getMappingForBranch(branch)) {
    for (const link of entry.linkedSkus) {
      skus.add(typeof link === "string" ? link : link.sku);
    }
  }
  return skus;
}

// Apply mapping: soldBySkuMap is { sku → qty sold }
export function applyStoreHubMapping(
  soldBySkuMap: Record<string, number>,
  branch: string
): { item: string; qty: number; rawOrders?: number }[] {
  const results: { item: string; qty: number; rawOrders?: number }[] = [];
  for (const entry of getMappingForBranch(branch)) {
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
      const qty = Math.ceil(orders / entry.ordersPerPack);
      results.push({ item: entry.item, qty, rawOrders: orders });
    } else {
      results.push({ item: entry.item, qty: orders });
    }
  }
  return results;
}
