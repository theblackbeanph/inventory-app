import type { CatalogItem } from "./types";

// Master item catalog — matches commissary dashboard SKUs and inventory items
// reorderAt = threshold qty for low-stock warning
export const CATALOG: CatalogItem[] = [
  // ── RECIPE PORTIONED (pc) ────────────────────────────────────────────
  { name: "Cobbler",               category: "portion", unit: "pc", reorderAt: 10 },
  { name: "Salmon Slab",           category: "portion", unit: "pc", reorderAt: 10 },
  { name: "Smoked Salmon",         category: "portion", unit: "pc", reorderAt: 20 },
  { name: "Aburi Salmon",          category: "portion", unit: "pc", reorderAt: 10 },
  { name: "Beef Tapa",             category: "portion", unit: "pc", reorderAt: 10 },
  { name: "Beef Pares",            category: "portion", unit: "pc", reorderAt: 10 },
  { name: "Buttermilk Chicken 300g", category: "portion", unit: "pc", reorderAt: 10 },
  { name: "Buttermilk Chicken 150g", category: "portion", unit: "pc", reorderAt: 15 },
  { name: "Chicken BBQ",           category: "portion", unit: "pc", reorderAt: 10 },
  { name: "Burger Patty",          category: "portion", unit: "pc", reorderAt: 10 },
  { name: "Adobo Flakes",          category: "portion", unit: "pc", reorderAt: 10 },
  { name: "Arroz ala Cubana",      category: "portion", unit: "pc", reorderAt: 10 },
  { name: "Roast Beef",            category: "portion", unit: "pc", reorderAt: 10 },
  { name: "Mozzarella Sticks",     category: "portion", unit: "pc", reorderAt: 10 },
  { name: "Kimchi",                category: "portion", unit: "pc", reorderAt: 10 },
  { name: "Scallops",              category: "portion", unit: "pc", reorderAt: 10 },
  { name: "Bacon Cubes",           category: "portion", unit: "pc", reorderAt: 10 },
  { name: "Prosciutto",            category: "portion", unit: "pc", reorderAt: 20 },
  // ── PACKED (pc) ──────────────────────────────────────────────────────
  { name: "Tomahawk Porkchops",    category: "packed",  unit: "pc", reorderAt: 3 },
  { name: "Miso Butter Paste",     category: "packed",  unit: "pc", reorderAt: 3 },
  { name: "Gyudon Sauce",          category: "packed",  unit: "pc", reorderAt: 3 },
  { name: "Au Jus",                category: "packed",  unit: "pc", reorderAt: 5 },
  { name: "Bacon Jam",             category: "packed",  unit: "pc", reorderAt: 3 },
  { name: "Caramelized Onion",     category: "packed",  unit: "pc", reorderAt: 3 },
  { name: "Vodka Sauce",           category: "packed",  unit: "pc", reorderAt: 3 },
  { name: "Squid Ink",             category: "packed",  unit: "pc", reorderAt: 3 },
  { name: "Truffle Pasta Sauce",   category: "packed",  unit: "pc", reorderAt: 3 },
  { name: "Truffle Mushroom Paste",category: "packed",  unit: "pc", reorderAt: 3 },
  { name: "Loco Moco Gravy",       category: "packed",  unit: "pc", reorderAt: 3 },
  { name: "Squash Soup",           category: "packed",  unit: "pc", reorderAt: 3 },
  { name: "Tomato Soup",           category: "packed",  unit: "pc", reorderAt: 3 },
  { name: "Grilled Cheese",        category: "packed",  unit: "pc", reorderAt: 3 },
  { name: "Tuna Spread",           category: "packed",  unit: "pc", reorderAt: 3 },
  { name: "Flatbread",             category: "packed",  unit: "pc", reorderAt: 5 },
  { name: "Classic Tiramisu",      category: "packed",  unit: "pc", reorderAt: 5 },
  { name: "Hojicha Tiramisu",      category: "packed",  unit: "pc", reorderAt: 5 },
  { name: "Tres Leches",           category: "packed",  unit: "pc", reorderAt: 5 },
  // ── LOOSE (g) ────────────────────────────────────────────────────────
  { name: "Marinara Sauce",        category: "loose",   unit: "g",  reorderAt: 500 },
  { name: "Marinara - Mozzarella", category: "loose",   unit: "g",  reorderAt: 500 },
  { name: "Gyudon Sauce (Loose)",  category: "loose",   unit: "g",  reorderAt: 500 },
  { name: "Tartar",                category: "loose",   unit: "g",  reorderAt: 300 },
  { name: "Aioli",                 category: "loose",   unit: "g",  reorderAt: 300 },
  { name: "Caesar Dressing",       category: "loose",   unit: "g",  reorderAt: 300 },
  { name: "Raspberry Dressing",    category: "loose",   unit: "g",  reorderAt: 200 },
  { name: "Candied Walnut",        category: "loose",   unit: "g",  reorderAt: 200 },
  { name: "House Vinaigrette",     category: "loose",   unit: "g",  reorderAt: 300 },
  { name: "Nigiri",                category: "loose",   unit: "g",  reorderAt: 200 },
  { name: "Burger Dressing",       category: "loose",   unit: "g",  reorderAt: 300 },
  { name: "Maple Syrup",           category: "loose",   unit: "g",  reorderAt: 200 },
  { name: "Balsamic",              category: "loose",   unit: "g",  reorderAt: 200 },
  { name: "Gochu-Samjang",         category: "loose",   unit: "g",  reorderAt: 200 },
  { name: "Pesto",                 category: "loose",   unit: "g",  reorderAt: 200 },
  { name: "Beef Pares Sauce",      category: "loose",   unit: "g",  reorderAt: 300 },
  { name: "Adobo Flakes Sauce",    category: "loose",   unit: "g",  reorderAt: 300 },
  { name: "Kimchi (Loose)",        category: "loose",   unit: "g",  reorderAt: 500 },
  { name: "Classic Tiramisu Mascarpone", category: "loose", unit: "g", reorderAt: 300 },
  { name: "Hojicha Tiramisu Mascarpone", category: "loose", unit: "g", reorderAt: 300 },
  { name: "Dehydrated Orange",     category: "loose",   unit: "g",  reorderAt: 100 },
  { name: "Dehydrated Apple",      category: "loose",   unit: "g",  reorderAt: 100 },
  { name: "Dehydrated Lime",       category: "loose",   unit: "g",  reorderAt: 100 },
  { name: "Chlorophyl (Green Oil)", category: "loose",  unit: "g",  reorderAt: 100 },
];

export const CATALOG_MAP = new Map(CATALOG.map(i => [i.name, i]));

export function itemSlug(item: string): string {
  return item.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
}

export function stockDocId(branch: string, item: string): string {
  return `${branch}__${itemSlug(item)}`;
}
