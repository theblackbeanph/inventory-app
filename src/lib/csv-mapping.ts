// BF Homes CSV import — POS dish → commissary item mapping
// Ported from AutoPullOut.gs (Apps Script). Easy to remove when BF migrates to StoreHub.

const TRAY_KEYWORDS = ["TRAY", "PARTY"];
const TRAY_MULTIPLIER = 3;

type LinkedPos = string | { name: string; qty: number };

interface CsvMappingEntry {
  item: string;        // commissary item name — must match CATALOG exactly
  linkedPos: LinkedPos[];
}

const CSV_MAPPING: CsvMappingEntry[] = [
  { item: "Cobbler",                 linkedPos: ["FISH AND CHIPS", "FISH AND CHIPS PARTY BOX"] },
  { item: "Salmon Slab",             linkedPos: ["HERB CRUSTED SALMON"] },
  { item: "Smoked Salmon",           linkedPos: ["AVO TOAST + SMOKED SALMON", "SMOKED SALMON BENNY", "SMOKED SALMON"] },
  { item: "Aburi Salmon",            linkedPos: ["ABURI SALMON-DON", "ABURI SALMON DON TRAY"] },
  { item: "Beef Tapa",               linkedPos: ["BEEF TAPA", "BEEF TAPA KIMCHI TRAY"] },
  { item: "Beef Pares",              linkedPos: ["BEEF PARES", "PARES CREAM PASTA TRAY", "PARES CREAM PASTA"] },
  { item: "Buttermilk Chicken 300g", linkedPos: ["CHICKEN & WAFFLE"] },
  { item: "Buttermilk Chicken 150g", linkedPos: ["CHICKEN PARMIGIANA", "BUTTERMILK FRIED CHICKEN", "WICKED CHICKEN"] },
  { item: "Chicken BBQ",             linkedPos: ["CHICKEN PESTO SANDWICH", "CHICKEN PESTO PASTA"] },
  { item: "Burger Patty",            linkedPos: ["PATTY MELT", "LOCO MOCO"] },
  { item: "Adobo Flakes",            linkedPos: ["KESONG PUTI & ADOBO FLAKES TOAST", "ADOBO FLAKES"] },
  { item: "Arroz ala Cubana",        linkedPos: ["ARROZ ALA CUBANA"] },
  { item: "Roast Beef",              linkedPos: ["ROAST BEEF SANDWICH"] },
  { item: "Mozzarella Sticks",       linkedPos: ["MOZZARELLA STICKS"] },
  { item: "Scallops",                linkedPos: ["SCALLOPS & SQUID INK NOODLES", "SCALLOPS AND SQUID INK TRAY"] },
  { item: "Bacon Cubes",             linkedPos: ["GARLIC CARBONARA", "CARBONARA TRAY"] },
  { item: "Prosciutto",              linkedPos: ["VODKA CON PROSCIUTTO", "VODKA CON PROSCIUTTO + BURRATA"] },
  { item: "Tomahawk Porkchops",      linkedPos: ["TOMAHAWK PORK CHOP"] },
  { item: "Miso Butter Paste",       linkedPos: ["ABURI SALMON-DON", "ABURI SALMON DON TRAY"] },
  { item: "Au Jus",                  linkedPos: ["ROAST BEEF SANDWICH"] },
  { item: "Bacon Jam",               linkedPos: ["ROAST BEEF SANDWICH", "PATTY MELT"] },
  { item: "Caramelized Onion",       linkedPos: ["ROAST BEEF SANDWICH", "PATTY MELT"] },
  { item: "Vodka Sauce",             linkedPos: ["VODKA CON PROSCIUTTO", "VODKA CON PROSCIUTTO + BURRATA"] },
  { item: "Squid Ink Sauce",         linkedPos: ["SCALLOPS & SQUID INK NOODLES", "SCALLOPS AND SQUID INK TRAY"] },
  { item: "Truffle Pasta Sauce",     linkedPos: ["TRUFFLE & MUSHROOM PASTA", "TRUFFLE PASTA TRAY"] },
  { item: "Truffle Mushroom Paste",  linkedPos: ["TRUFFLE MUSHROOM SOUP"] },
  { item: "Loco Moco Gravy",         linkedPos: ["LOCO MOCO"] },
  { item: "Squash Soup",             linkedPos: ["SQUASH SOUP"] },
  { item: "Tomato Soup",             linkedPos: [{ name: "GRILLED CHEESE", qty: 1 }, { name: "TOMATO SOUP", qty: 2 }] },
  { item: "Tuna Spread",             linkedPos: ["TUNA MELT"] },
  { item: "Flatbread",               linkedPos: ["DEATH BY CHEESE"] },
];

function norm(s: string): string {
  return s.trim().toUpperCase();
}

function isTray(posName: string): boolean {
  const up = norm(posName);
  return TRAY_KEYWORDS.some(kw => up.includes(kw));
}

// Parse Utak CSV text → { "POS ITEM NAME": count }
export function parseSalesCSV(csvText: string): Record<string, number> {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return {};

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const itemIdx = headers.indexOf("item");
  const countIdx = headers.indexOf("count");
  if (itemIdx === -1 || countIdx === -1) {
    throw new Error('CSV is missing "Item" or "Count" column headers.');
  }

  const totals: Record<string, number> = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const name = cols[itemIdx]?.trim();
    const count = parseInt(cols[countIdx] ?? "0", 10) || 0;
    if (!name) continue;
    totals[name] = (totals[name] ?? 0) + count;
  }
  return totals;
}

// Apply mapping: returns { item (commissary name), qty } for each matched entry
export function applyCsvMapping(
  salesMap: Record<string, number>
): { item: string; qty: number }[] {
  const normSales: Record<string, number> = {};
  for (const [k, v] of Object.entries(salesMap)) {
    normSales[norm(k)] = v;
  }

  const results: { item: string; qty: number }[] = [];
  for (const entry of CSV_MAPPING) {
    let qty = 0;
    for (const link of entry.linkedPos) {
      const posName = typeof link === "string" ? link : link.name;
      const perQty  = typeof link === "string" ? 1 : (link.qty ?? 1);
      const count   = normSales[norm(posName)] ?? 0;
      if (!count) continue;
      qty += count * perQty * (isTray(posName) ? TRAY_MULTIPLIER : 1);
    }
    if (qty > 0) results.push({ item: entry.item, qty });
  }
  return results;
}

// All POS dish names referenced in the mapping (for showing unmatched items)
export function allMappedPosNames(): Set<string> {
  const names = new Set<string>();
  for (const entry of CSV_MAPPING) {
    for (const link of entry.linkedPos) {
      names.add(norm(typeof link === "string" ? link : link.name));
    }
  }
  return names;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
