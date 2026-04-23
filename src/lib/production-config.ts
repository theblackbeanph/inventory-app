export interface RawMaterialDef {
  name: string;
  packLabel: string;     // e.g., "500g pack", "1kg bag"
  portionedItem?: string; // matching item name in CATALOG (for auto-IN when portioning)
  yieldsPerPack?: number; // expected portions per pack (reference only)
}

// Add raw materials here. portionedItem must match the exact name in items.ts CATALOG
// if you want portioning runs to auto-write stock INs.
export const RAW_MATERIALS: RawMaterialDef[] = [
  // Examples — update names and yields to match your actual items:
  // { name: "Wagyu Cubes", packLabel: "500g pack", portionedItem: "Wagyu 150g Portion", yieldsPerPack: 3 },
  // { name: "French Fries", packLabel: "1kg bag", portionedItem: "Fries", yieldsPerPack: 8 },
  // { name: "Potato Chips", packLabel: "1kg bag", portionedItem: "Potato Chips (portion)", yieldsPerPack: 10 },
  // { name: "Cheese Block", packLabel: "1kg block", portionedItem: "Cheese Slice", yieldsPerPack: 20 },
];

export const RAW_MATERIAL_MAP = new Map(RAW_MATERIALS.map(m => [m.name, m]));
