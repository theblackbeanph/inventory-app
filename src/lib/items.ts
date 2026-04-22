import type { CatalogItem } from "./types";

export const CATALOG: CatalogItem[] = [
  // ── PORTIONS (pc) ────────────────────────────────────────────────────
  { name: "Cobbler",                 category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc" },
  { name: "Salmon Slab",             category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc" },
  { name: "Smoked Salmon",           category: "portion", unit: "pc", reorderAt: 20, packSize: "1 pc" },
  { name: "Aburi Salmon",            category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc" },
  { name: "Beef Tapa",               category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc" },
  { name: "Beef Pares",              category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc" },
  { name: "Buttermilk Chicken 300g", category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc" },
  { name: "Buttermilk Chicken 150g", category: "portion", unit: "pc", reorderAt: 15, packSize: "1 pc" },
  { name: "Chicken BBQ",             category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc" },
  { name: "Burger Patty",            category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc" },
  { name: "Adobo Flakes",            category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc" },
  { name: "Arroz ala Cubana",        category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc" },
  { name: "Roast Beef",              category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc" },
  { name: "Mozzarella Sticks",       category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc" },
  { name: "Scallops",                category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc" },
  { name: "Bacon Cubes",             category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc" },
  { name: "Prosciutto",              category: "portion", unit: "pc", reorderAt: 20, packSize: "1 pc" },
  // ── PACKED (pc) ──────────────────────────────────────────────────────
  { name: "Tomahawk Porkchops",      category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc" },
  { name: "Miso Butter Paste",       category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc" },
  { name: "Au Jus",                  category: "packed",  unit: "pc", reorderAt: 5,  packSize: "1 pc" },
  { name: "Bacon Jam",               category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc" },
  { name: "Caramelized Onion",       category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc" },
  { name: "Vodka Sauce",             category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc" },
  { name: "Squid Ink Sauce",          category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc" },
  { name: "Truffle Pasta Sauce",     category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc" },
  { name: "Truffle Mushroom Paste",  category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc" },
  { name: "Loco Moco Gravy",         category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc" },
  { name: "Squash Soup",             category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc" },
  { name: "Tomato Soup",             category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc" },
  { name: "Grilled Cheese",          category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc" },
  { name: "Tuna Spread",             category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc" },
  { name: "Flatbread",               category: "packed",  unit: "pc", reorderAt: 5,  packSize: "1 pc" },
  { name: "Classic Tiramisu",        category: "packed",  unit: "pc", reorderAt: 5,  packSize: "1 pc" },
  { name: "Hojicha Tiramisu",        category: "packed",  unit: "pc", reorderAt: 5,  packSize: "1 pc" },
  { name: "Tres Leches",             category: "packed",  unit: "pc", reorderAt: 5,  packSize: "1 pc" },
  // ── LOOSE (sealed pack — count packs only, never weigh) ───────────────
  { name: "Marinara Sauce",          category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g"   },
  { name: "Marinara Sauce (Blend)",  category: "loose",   unit: "pack", reorderAt: 2, packSize: "300g"   },
  { name: "Gyudon Sauce",            category: "loose",   unit: "pack", reorderAt: 1, packSize: "1,300g" },
  { name: "Tartar",                  category: "loose",   unit: "pack", reorderAt: 2, packSize: "1,000g" },
  { name: "Aioli",                   category: "loose",   unit: "pack", reorderAt: 2, packSize: "1,000g" },
  { name: "Caesar Dressing",         category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g"   },
  { name: "Raspberry Dressing",      category: "loose",   unit: "pack", reorderAt: 1, packSize: "500g"   },
  { name: "Candied Walnut",          category: "loose",   unit: "pack", reorderAt: 1, packSize: "200g"   },
  { name: "House Vinaigrette",       category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g"   },
  { name: "Nigiri",                  category: "loose",   unit: "pack", reorderAt: 1, packSize: "500g"   },
  { name: "Burger Dressing",         category: "loose",   unit: "pack", reorderAt: 1, packSize: "500g"   },
  { name: "Maple Syrup",             category: "loose",   unit: "pack", reorderAt: 1, packSize: "300g"   },
  { name: "Pesto",                   category: "loose",   unit: "pack", reorderAt: 1, packSize: "300g"   },
  { name: "Beef Pares Sauce",        category: "loose",   unit: "pack", reorderAt: 2, packSize: "1,000g" },
  { name: "Adobo Flakes Sauce",      category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g"   },
  { name: "Kimchi",                  category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g"   },
];

export const CATALOG_MAP = new Map(CATALOG.map(i => [i.name, i]));

export function itemSlug(item: string): string {
  return item.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
}

export function stockDocId(branch: string, item: string): string {
  return `${branch}__${itemSlug(item)}`;
}
