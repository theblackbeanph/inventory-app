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
  { name: "Cobbler",                 category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Salmon Fillet",           category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Smoked Salmon",           category: "portion", unit: "pc", reorderAt: 20, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Aburi Salmon",            category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Beef Tapa",               category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Beef Pares",              category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Buttermilk Chicken 300g", category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Buttermilk Chicken 150g", category: "portion", unit: "pc", reorderAt: 15, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Chicken BBQ",             category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Burger Patty",            category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Adobo Flakes",            category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Arroz ala Cubana",        category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Roast Beef",              category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Mozzarella Sticks",       category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Scallops",                category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Bacon Cubes",             category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Prosciutto",              category: "portion", unit: "pc", reorderAt: 20, packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  // ── PACKED (pc) ──────────────────────────────────────────────────────
  { name: "Tomahawk Porkchop",       category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Miso Butter Paste",       category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Au Jus",                  category: "packed",  unit: "pc", reorderAt: 5,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Bacon Jam",               category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Caramelized Onion",       category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Vodka Sauce",             category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Squid Ink Sauce",         category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Truffle Pasta Sauce",     category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Truffle Mushroom Paste",  category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Loco Moco Gravy",         category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Squash Soup",             category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Tomato Soup",             category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Tuna Spread",             category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  { name: "Flatbread",               category: "packed",  unit: "pc", reorderAt: 5,  packSize: "1 pc",    department: "kitchen", location: "front_kitchen" },
  // ── LOOSE (sealed pack — count packs only, never weigh) ───────────────
  // ordersPerPack = SPP from Portion Guide (April 2026). branches omitted = all branches.
  { name: "Gyudon Sauce",            category: "loose",   unit: "pack", reorderAt: 1, packSize: "1,300g",  department: "kitchen", location: "back_kitchen", ordersPerPack: 18 },
  { name: "Tartar",                  category: "loose",   unit: "pack", reorderAt: 2, packSize: "1,000g",  department: "kitchen", location: "back_kitchen", ordersPerPack: 33 },
  { name: "Aioli",                   category: "loose",   unit: "pack", reorderAt: 2, packSize: "1,000g",  department: "kitchen", location: "back_kitchen", ordersPerPack: 33 },
  { name: "Nigiri",                  category: "loose",   unit: "pack", reorderAt: 1, packSize: "500g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 25 },
  { name: "Burger Dressing",         category: "loose",   unit: "pack", reorderAt: 1, packSize: "500g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 16 },
  { name: "Maple Syrup",             category: "loose",   unit: "pack", reorderAt: 1, packSize: "300g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 10, branches: ["MKT"] },
  { name: "Beef Pares Sauce",        category: "loose",   unit: "pack", reorderAt: 2, packSize: "1,000g",  department: "kitchen", location: "back_kitchen", ordersPerPack: 16 },
  { name: "Adobo Flakes Sauce",      category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 16 },
  { name: "Marinara Sauce",          category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 10, branches: ["MKT"] },
  { name: "Marinara Sauce (Blend)",  category: "loose",   unit: "pack", reorderAt: 2, packSize: "300g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 10, branches: ["MKT"] },
  { name: "Pesto",                   category: "loose",   unit: "pack", reorderAt: 1, packSize: "300g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 10 },
  { name: "Caesar Dressing",         category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 16 },
  { name: "House Vinaigrette",       category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 25, branches: ["MKT"] },
  { name: "Raspberry Dressing",      category: "loose",   unit: "pack", reorderAt: 1, packSize: "500g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 10 },
  { name: "Candied Walnut",          category: "loose",   unit: "pack", reorderAt: 1, packSize: "200g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 5  },
  { name: "Kimchi",                  category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g",    department: "kitchen", location: "back_kitchen", ordersPerPack: 16, branches: ["MKT"] },
];

export const CATALOG_MAP = new Map(CATALOG.map(i => [i.name, i]));

export function itemSlug(item: string): string {
  return item.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
}

export function stockDocId(branch: string, department: string, item: string): string {
  return `${branch}__${department}__${itemSlug(item)}`;
}

export function beginningDocId(branch: string, department: string, item: string, date: string): string {
  return `${branch}__${department}__${item}__${date}`;
}
