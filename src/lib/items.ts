import type { CatalogItem } from "./types";

// To rename a location: update the label here — it propagates everywhere automatically.
// To add a new location: add an entry here, then tag items below with the new id.
export const LOCATIONS = [
  { id: "front_kitchen", label: "Front Kitchen" },
  { id: "back_kitchen",  label: "Back Kitchen"  },
  { id: "storage",       label: "Storage"       },
] as const;

export type LocationId = typeof LOCATIONS[number]["id"];

export const CATALOG: CatalogItem[] = [
  // ── PORTIONS (pc) ────────────────────────────────────────────────────
  { name: "Aburi Salmon",            category: "portion", unit: "pc", reorderAt: 25, parLevel: 80,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Adobo Flakes",            category: "portion", unit: "pc", reorderAt: 10, parLevel: 30,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Arroz ala Cubana",        category: "portion", unit: "pc", reorderAt: 5,  parLevel: 15,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Bacon Cubes",             category: "portion", unit: "pc", reorderAt: 10, parLevel: 40,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Beef Pares",              category: "portion", unit: "pc", reorderAt: 10, parLevel: 30,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Beef Tapa",               category: "portion", unit: "pc", reorderAt: 10, parLevel: 30,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Burger Patty",            category: "portion", unit: "pc", reorderAt: 15, parLevel: 50,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Buttermilk Chicken 150g", category: "portion", unit: "pc", reorderAt: 10, parLevel: 30,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Buttermilk Chicken 300g", category: "portion", unit: "pc", reorderAt: 15, parLevel: 40,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Chicken BBQ",             category: "portion", unit: "pc", reorderAt: 10, parLevel: 30,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Cobbler",                 category: "portion", unit: "pc", reorderAt: 25, parLevel: 80,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Mozzarella Sticks",       category: "portion", unit: "pc", reorderAt: 5,  parLevel: 20,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Prosciutto",              category: "portion", unit: "pc", reorderAt: 10, parLevel: 30,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Roast Beef",              category: "portion", unit: "pc", reorderAt: 5,  parLevel: 20,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Salmon Fillet",           category: "portion", unit: "pc", reorderAt: 3,  parLevel: 10,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Scallops",                category: "portion", unit: "pc", reorderAt: 10, parLevel: 30,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Smoked Salmon",           category: "portion", unit: "pc", reorderAt: 10, parLevel: 40,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Tomahawk Porkchop",       category: "packed",  unit: "pc", reorderAt: 3,  parLevel: 15,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", branches: ["MKT"], commissary: true },
  // ── PACKED (pc) ──────────────────────────────────────────────────────
  { name: "Au Jus",                  category: "packed",  unit: "pc", reorderAt: 5,  parLevel: 20,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Bacon Jam",               category: "packed",  unit: "pc", reorderAt: 5,  parLevel: 20,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Caramelized Onion",       category: "packed",  unit: "pc", reorderAt: 15, parLevel: 40,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Flatbread",               category: "packed",  unit: "pc", reorderAt: 2,  parLevel: 5,   packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Loco Moco Gravy",         category: "packed",  unit: "pc", reorderAt: 10, parLevel: 30,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", branches: ["MKT"], commissary: true },
  { name: "Miso Butter Paste",       category: "packed",  unit: "pc", reorderAt: 25, parLevel: 80,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", branches: ["MKT"], commissary: true },
  { name: "Salted Egg Custard",      category: "packed",  unit: "pc", reorderAt: 5,  parLevel: 15,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Salted Egg Sauce",        category: "packed",  unit: "pc", reorderAt: 5,  parLevel: 20,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Squash Soup",             category: "packed",  unit: "pc", reorderAt: 5,  parLevel: 15,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Squid Ink Sauce",         category: "packed",  unit: "pc", reorderAt: 10, parLevel: 30,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Tomato Soup",             category: "packed",  unit: "pc", reorderAt: 15, parLevel: 40,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", branches: ["MKT"], commissary: true },
  { name: "Truffle Mushroom Paste",  category: "packed",  unit: "pc", reorderAt: 5,  parLevel: 15,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Truffle Pasta Sauce",     category: "packed",  unit: "pc", reorderAt: 10, parLevel: 30,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", branches: ["MKT"], commissary: true },
  { name: "Tuna Spread",             category: "packed",  unit: "pc", reorderAt: 3,  parLevel: 10,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen", commissary: true },
  { name: "Burrata",                 category: "packed",  unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Clam Chowder",            category: "packed",  unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen", location: "back_kitchen"  },
  // ── LOOSE (sealed pack — count packs only, never weigh) ───────────────
  // ordersPerPack = SPP from Portion Guide (April 2026). branches omitted = all branches.
  { name: "Adobo Flakes Sauce",      category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 16, commissary: true },
  { name: "Aioli",                   category: "loose",   unit: "pack", reorderAt: 2, packSize: "1,000g",  department: "kitchen", location: "back_kitchen", ordersPerPack: 33, commissary: true },
  { name: "Beef Pares Sauce",        category: "loose",   unit: "pack", reorderAt: 2, packSize: "1,000g",  department: "kitchen", location: "back_kitchen", ordersPerPack: 16, commissary: true },
  { name: "Burger Dressing",         category: "loose",   unit: "pack", reorderAt: 1, packSize: "500g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 16, commissary: true },
  { name: "Caesar Dressing",         category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 16, commissary: true },
  { name: "Candied Walnut",          category: "loose",   unit: "pack", reorderAt: 1, packSize: "200g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 5,  commissary: true },
  { name: "Gyudon Sauce",            category: "loose",   unit: "pack", reorderAt: 1, packSize: "1,300g",  department: "kitchen", location: "back_kitchen", ordersPerPack: 18, commissary: true },
  { name: "House Vinaigrette",       category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 25, branches: ["MKT"], commissary: true },
  { name: "Kimchi",                  category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 16, branches: ["MKT", "BF"], commissary: true },
  { name: "Maple Syrup",             category: "loose",   unit: "pack", reorderAt: 1, packSize: "300g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 10, branches: ["MKT"], commissary: true },
  { name: "Marinara Sauce",          category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 10, branches: ["MKT"], commissary: true },
  { name: "Nigiri",                  category: "loose",   unit: "pack", reorderAt: 1, packSize: "500g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 25, commissary: true },
  { name: "Pesto",                   category: "loose",   unit: "pack", reorderAt: 1, packSize: "300g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 10, commissary: true },
  { name: "Raspberry Dressing",      category: "loose",   unit: "pack", reorderAt: 1, packSize: "500g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 10, commissary: true },
  { name: "Tartar",                  category: "loose",   unit: "pack", reorderAt: 2, packSize: "1,000g",  department: "kitchen", location: "back_kitchen", ordersPerPack: 33, commissary: true },
  { name: "Vodka Sauce",             category: "loose",   unit: "pack", reorderAt: 3, packSize: "1,100g",  department: "kitchen", location: "back_kitchen", ordersPerPack: 6,  branches: ["MKT"], commissary: true },
  { name: "Ube Halaya",              category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 7,  commissary: true },
  // ── BREADS (count only — no sales deduction) ─────────────────────────
  { name: "Sourdough",               category: "packed",  unit: "pc", reorderAt: 6,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Focaccia",                category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Pandesal",                category: "packed",  unit: "pc", reorderAt: 12, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Potato Buns",             category: "packed",  unit: "pc", reorderAt: 12, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Brioche Loaf",            category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  // ── SUPPLIER — BF only (reorderAt: update via Settings) ──────────────────
  { name: "Pork Chop",              category: "packed",  unit: "pc", reorderAt: 5,  packSize: "1 pc",    department: "kitchen", location: "back_kitchen",  branches: ["BF"] },
  { name: "Longganisa Duo",         category: "packed",  unit: "pc", reorderAt: 5,  packSize: "1 pc",    department: "kitchen", location: "back_kitchen",  branches: ["BF"] },
  { name: "Wagyu Cubes",            category: "packed",  unit: "pc", reorderAt: 5,  packSize: "1 pc",    department: "kitchen", location: "back_kitchen",  branches: ["BF"] },
  { name: "Farmer's Ham",           category: "packed",  unit: "pc", reorderAt: 5,  packSize: "1 pc",    department: "kitchen", location: "back_kitchen",  branches: ["BF"] },
  { name: "Bacon Strip",            category: "packed",  unit: "pc", reorderAt: 5,  packSize: "1 pc",    department: "kitchen", location: "back_kitchen",  branches: ["BF"] },
];

export const CATALOG_MAP = new Map(CATALOG.map(i => [i.name, i]));

const _CATALOG_ORDER = new Map(CATALOG.map((item, idx) => [item.name, idx]));
export function catalogSort(a: string, b: string): number {
  return (_CATALOG_ORDER.get(a) ?? 9999) - (_CATALOG_ORDER.get(b) ?? 9999);
}

export function itemSlug(item: string): string {
  return item.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
}

export function stockDocId(branch: string, department: string, item: string): string {
  return `${branch}__${department}__${itemSlug(item)}`;
}

export function beginningDocId(branch: string, department: string, item: string, date: string): string {
  return `${branch}__${department}__${item}__${date}`;
}
