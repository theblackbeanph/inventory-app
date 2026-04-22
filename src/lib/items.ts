import type { CatalogItem } from "./types";

export const CATALOG: CatalogItem[] = [
  // ── PORTIONS (pc) ────────────────────────────────────────────────────
  { name: "Cobbler",                 category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen" },
  { name: "Salmon Slab",             category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen" },
  { name: "Smoked Salmon",           category: "portion", unit: "pc", reorderAt: 20, packSize: "1 pc",    department: "kitchen" },
  { name: "Aburi Salmon",            category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen" },
  { name: "Beef Tapa",               category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen" },
  { name: "Beef Pares",              category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen" },
  { name: "Buttermilk Chicken 300g", category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen" },
  { name: "Buttermilk Chicken 150g", category: "portion", unit: "pc", reorderAt: 15, packSize: "1 pc",    department: "kitchen" },
  { name: "Chicken BBQ",             category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen" },
  { name: "Burger Patty",            category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen" },
  { name: "Adobo Flakes",            category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen" },
  { name: "Arroz ala Cubana",        category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen" },
  { name: "Roast Beef",              category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen" },
  { name: "Mozzarella Sticks",       category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen" },
  { name: "Scallops",                category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen" },
  { name: "Bacon Cubes",             category: "portion", unit: "pc", reorderAt: 10, packSize: "1 pc",    department: "kitchen" },
  { name: "Prosciutto",              category: "portion", unit: "pc", reorderAt: 20, packSize: "1 pc",    department: "kitchen" },
  // ── PACKED (pc) ──────────────────────────────────────────────────────
  { name: "Tomahawk Porkchops",      category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen" },
  { name: "Miso Butter Paste",       category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen" },
  { name: "Au Jus",                  category: "packed",  unit: "pc", reorderAt: 5,  packSize: "1 pc",    department: "kitchen" },
  { name: "Bacon Jam",               category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen" },
  { name: "Caramelized Onion",       category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen" },
  { name: "Vodka Sauce",             category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen" },
  { name: "Squid Ink Sauce",         category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen" },
  { name: "Truffle Pasta Sauce",     category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen" },
  { name: "Truffle Mushroom Paste",  category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen" },
  { name: "Loco Moco Gravy",         category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen" },
  { name: "Squash Soup",             category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen" },
  { name: "Tomato Soup",             category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen" },
  { name: "Grilled Cheese",          category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen" },
  { name: "Tuna Spread",             category: "packed",  unit: "pc", reorderAt: 3,  packSize: "1 pc",    department: "kitchen" },
  { name: "Flatbread",               category: "packed",  unit: "pc", reorderAt: 5,  packSize: "1 pc",    department: "kitchen" },
  { name: "Classic Tiramisu",        category: "packed",  unit: "pc", reorderAt: 5,  packSize: "1 pc",    department: "kitchen" },
  { name: "Hojicha Tiramisu",        category: "packed",  unit: "pc", reorderAt: 5,  packSize: "1 pc",    department: "kitchen" },
  { name: "Tres Leches",             category: "packed",  unit: "pc", reorderAt: 5,  packSize: "1 pc",    department: "kitchen" },
  // ── LOOSE (sealed pack — count packs only, never weigh) ───────────────
  { name: "Marinara Sauce",          category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g",    department: "kitchen" },
  { name: "Marinara Sauce (Blend)",  category: "loose",   unit: "pack", reorderAt: 2, packSize: "300g",    department: "kitchen" },
  { name: "Gyudon Sauce",            category: "loose",   unit: "pack", reorderAt: 1, packSize: "1,300g",  department: "kitchen" },
  { name: "Tartar",                  category: "loose",   unit: "pack", reorderAt: 2, packSize: "1,000g",  department: "kitchen" },
  { name: "Aioli",                   category: "loose",   unit: "pack", reorderAt: 2, packSize: "1,000g",  department: "kitchen" },
  { name: "Caesar Dressing",         category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g",    department: "kitchen" },
  { name: "Raspberry Dressing",      category: "loose",   unit: "pack", reorderAt: 1, packSize: "500g",    department: "kitchen" },
  { name: "Candied Walnut",          category: "loose",   unit: "pack", reorderAt: 1, packSize: "200g",    department: "kitchen" },
  { name: "House Vinaigrette",       category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g",    department: "kitchen" },
  { name: "Nigiri",                  category: "loose",   unit: "pack", reorderAt: 1, packSize: "500g",    department: "kitchen" },
  { name: "Burger Dressing",         category: "loose",   unit: "pack", reorderAt: 1, packSize: "500g",    department: "kitchen" },
  { name: "Maple Syrup",             category: "loose",   unit: "pack", reorderAt: 1, packSize: "300g",    department: "kitchen" },
  { name: "Pesto",                   category: "loose",   unit: "pack", reorderAt: 1, packSize: "300g",    department: "kitchen" },
  { name: "Beef Pares Sauce",        category: "loose",   unit: "pack", reorderAt: 2, packSize: "1,000g",  department: "kitchen" },
  { name: "Adobo Flakes Sauce",      category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g",    department: "kitchen" },
  { name: "Kimchi",                  category: "loose",   unit: "pack", reorderAt: 2, packSize: "500g",    department: "kitchen" },
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
