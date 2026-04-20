/**
 * Ingredient string parsing.
 *
 * Port of ew/parser.py — same logic, same test cases.
 * Pure TypeScript, no Obsidian or DB dependencies.
 */

import { ParsedIngredient, FoodWeightEntry, TasteDefault } from "./types";

// ============================================================
// Unit tables
// ============================================================

const DIRECT_G: Record<string, number> = {
  g: 1.0, gram: 1.0, grams: 1.0,
  kg: 1000.0, kilogram: 1000.0, kilograms: 1000.0,
  mg: 0.001,
  oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
  ml: 1.0, mL: 1.0,
  l: 1000.0, L: 1000.0, liter: 1000.0, litre: 1000.0, liters: 1000.0, litres: 1000.0,
};

const PORTION_UNITS = new Set([
  "cup", "cups", "c",
  "tbsp", "tablespoon", "tablespoons",
  "tsp", "teaspoon", "teaspoons",
  "piece", "pieces", "slice", "slices",
  "clove", "cloves", "can", "cans",
  "large", "medium", "small",
  "serving", "servings",
  "bar", "bars", "packet", "packets",
  "sprig", "sprigs", "head", "heads",
  "bunch", "bunches",
]);

const UNIT_ALIASES: Record<string, string[]> = {
  cup: ["cup"], cups: ["cup"], c: ["cup"],
  tbsp: ["tbsp", "tablespoon"], tablespoon: ["tbsp", "tablespoon"], tablespoons: ["tbsp", "tablespoon"],
  tsp: ["tsp", "teaspoon"], teaspoon: ["tsp", "teaspoon"], teaspoons: ["tsp", "teaspoon"],
  large: ["large"], medium: ["medium"], small: ["small"],
  slice: ["slice"], slices: ["slice"],
  piece: ["piece", "each"], pieces: ["piece", "each"],
  clove: ["clove"], cloves: ["clove"],
  serving: ["serving"], servings: ["serving"],
  bar: ["bar"], bars: ["bar"],
  can: ["can"], cans: ["can"],
};

export const PIECE_GRAM_ESTIMATES: Record<string, number> = {
  clove: 6.0, cloves: 6.0,
  head: 50.0, heads: 50.0,
  sprig: 2.0, sprigs: 2.0,
  bunch: 25.0, bunches: 25.0,
  stalk: 40.0, stalks: 40.0,
  ear: 150.0, ears: 150.0,
  strip: 15.0, strips: 15.0,
  leaf: 1.0, leaves: 1.0,
};

const PREP_ADJECTIVES = new Set([
  "sliced", "diced", "chopped", "minced", "grated", "shredded",
  "crushed", "peeled", "pitted", "trimmed", "halved", "quartered",
]);

const UNICODE_FRACTIONS: Record<string, string> = {
  "½": "1/2", "⅓": "1/3", "⅔": "2/3",
  "¼": "1/4", "¾": "3/4",
  "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
  "⅙": "1/6", "⅚": "5/6",
  "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5",
};

// ============================================================
// Regexes
// ============================================================

// Leading amount: mixed fraction | simple fraction | number
const AMOUNT_RE = /^(\d+)\s+(\d+)\/(\d+)|^(\d+)\/(\d+)|^(\d+(?:\.\d+)?)/;

// Compact unit glued to number: "100g", "250ml"
const COMPACT_RE = /^(\d+(?:\.\d+)?)(g|kg|mg|ml|mL|l|L)\b\s*(.*)/i;

// Parenthetical amount: "garlic powder (½ teaspoon)"
const PAREN_AMOUNT_RE = /^(.+?)\s*\((\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s+([a-zA-Z]+(?:\.[a-zA-Z]*)?))?[^)]*\)/i;

// Leading alt-amount from dual notation: "/3 lbs "
const LEADING_ALT_AMOUNT_RE = /^\/\d+(?:\.\d+)?\s*(?:pounds?|lbs?|kg|mg|ml|mL|cups?|tbsp|tsp|oz|g|l|L)?\s*/i;

// Note patterns to strip from food query
const NOTE_PATTERNS = /\s+\/\s+.*$|\/[^/\s][^/]*$|\s+or\s+.*$|\s*\([^)]*\)*/gi;

// ============================================================
// Public API
// ============================================================

export function parseIngredient(
  text: string,
  aliases: Record<string, string> = {},
  tasteDefaults: TasteDefault[] = [],
): ParsedIngredient | null {
  const raw = text;
  text = text.trim();

  if (!text || text.startsWith("#")) return null;

  // Normalise Unicode fractions
  for (const [uc, ascii] of Object.entries(UNICODE_FRACTIONS)) {
    text = text.replaceAll(uc, ascii);
  }

  // Compact unit ("100g almonds")
  const cm = COMPACT_RE.exec(text);
  if (cm) {
    const foodQuery = cleanFoodQuery(cm[3].trim(), aliases);
    if (!foodQuery) return null;
    return { amount: parseFloat(cm[1]), unit: cm[2].toLowerCase(), foodQuery, raw, note: null };
  }

  // Leading amount
  const am = AMOUNT_RE.exec(text);
  if (!am) {
    // Parenthetical amount fallback: "garlic powder (½ teaspoon)"
    const pm = PAREN_AMOUNT_RE.exec(text);
    if (pm) {
      const foodNameRaw = pm[1].trim();
      const innerAm = AMOUNT_RE.exec(pm[2]);
      if (innerAm) {
        const pAmount = parseMatchedAmount(innerAm);
        const unitRaw = (pm[3] || "").toLowerCase().replace(/\.$/, "");
        const pUnit = (unitRaw in DIRECT_G || PORTION_UNITS.has(unitRaw)) ? unitRaw : null;
        const foodQuery = cleanFoodQuery(foodNameRaw, aliases);
        if (foodQuery) {
          return { amount: pAmount, unit: pUnit, foodQuery, raw, note: null };
        }
      }
    }

    // To-taste defaults fallback
    if (tasteDefaults.length > 0) {
      const foodText = cleanFoodQuery(text, aliases);
      if (foodText) {
        const foodLower = foodText.toLowerCase();
        for (const td of tasteDefaults) {
          if (foodLower.includes(td.key)) {
            const grams = td.grams;
            return { amount: grams, unit: "g", foodQuery: foodText, raw, note: `~${grams} g (to taste)` };
          }
        }
      }
    }
    return null;
  }

  const amount = parseMatchedAmount(am);
  let rest = text.slice(am[0].length).trim();

  if (!rest) return null;

  const words = rest.split(/\s+/);
  const first = words[0].toLowerCase().replace(/\.$/, "");
  let unit: string | null = null;
  let foodQuery: string;

  if (first in DIRECT_G || PORTION_UNITS.has(first)) {
    unit = first;
    foodQuery = words.slice(1).join(" ");
  } else {
    foodQuery = rest;
  }

  foodQuery = cleanFoodQuery(foodQuery.trim(), aliases);
  if (!foodQuery) return null;

  return { amount, unit, foodQuery, raw, note: null };
}

export function resolveGrams(
  amount: number,
  unit: string | null,
  portions: Array<{ measureEn: string; gramWeight: number }>,
  foodQuery = "",
  foodWeights: FoodWeightEntry[] = [],
  userCache: Map<string, number> = new Map(),
): [number, string | null] {
  if (unit === null) {
    const piece = findPiecePortion(portions);
    if (piece) return [amount * piece.gramWeight, null];

    const cacheKey = `${foodQuery}||null`;
    if (userCache.has(cacheKey)) return [amount * userCache.get(cacheKey)!, null];

    const fw = lookupFoodWeight(foodQuery, null, foodWeights);
    if (fw !== null) return [amount * fw, null];

    return [amount * 1.0, "no unit given, used 1 g per item"];
  }

  const unitKey = unit.toLowerCase();

  // Direct conversion
  for (const key of [unitKey, unitKey.replace(/s$/, "")]) {
    if (key in DIRECT_G) return [amount * DIRECT_G[key], null];
  }

  // Portion table lookup
  const best = bestPortionMatch(unitKey, portions);
  if (best) return [amount * best.gramWeight, null];

  // User cache
  const cacheKey = `${foodQuery}||${unitKey}`;
  if (userCache.has(cacheKey)) return [amount * userCache.get(cacheKey)!, null];

  // Food weight reference
  const fw = lookupFoodWeight(foodQuery, unitKey, foodWeights);
  if (fw !== null) return [amount * fw, null];

  // Built-in piece estimates
  for (const key of [unitKey, unitKey.replace(/s$/, "")]) {
    if (key in PIECE_GRAM_ESTIMATES) {
      const est = PIECE_GRAM_ESTIMATES[key];
      return [amount * est, `no portion in DB for '${unit}', estimated ${est} g each`];
    }
  }

  return [amount * 1.0, `no portion found for '${unit}', used 1 g`];
}

// ============================================================
// Internal helpers (exported for tests)
// ============================================================

export function cleanFoodQuery(
  text: string,
  aliases: Record<string, string> = {},
): string {
  // 1. Strip leading alternative amount
  text = text.replace(LEADING_ALT_AMOUNT_RE, "");
  // 2. Strip leading "of "
  if (text.toLowerCase().startsWith("of ")) text = text.slice(3);
  // 3. Strip parentheticals and slash/or notes
  text = text.replace(NOTE_PATTERNS, "");
  // 3b. Re-strip "of " after parenthetical removal
  text = text.trim();
  if (text.toLowerCase().startsWith("of ")) text = text.slice(3);
  // 4. Strip preparation note after first comma
  const commaIdx = text.indexOf(",");
  if (commaIdx !== -1) text = text.slice(0, commaIdx);
  // 5. Strip leading preparation adjectives
  while (true) {
    const spaceIdx = text.indexOf(" ");
    if (spaceIdx === -1) break;
    const first = text.slice(0, spaceIdx).toLowerCase();
    const remainder = text.slice(spaceIdx + 1);
    if (PREP_ADJECTIVES.has(first) && remainder) {
      text = remainder;
    } else {
      break;
    }
  }
  text = text.trim();
  // 6. Alias substitution — exact match first, then word-level
  if (Object.keys(aliases).length > 0) {
    const lower = text.toLowerCase();
    if (lower in aliases) return aliases[lower];
    for (const word of lower.split(/\s+/)) {
      if (word in aliases) return aliases[word];
    }
  }
  return text;
}

function parseMatchedAmount(m: RegExpExecArray): number {
  if (m[1] !== undefined) return parseFloat(m[1]) + parseFloat(m[2]) / parseFloat(m[3]); // mixed
  if (m[4] !== undefined) return parseFloat(m[4]) / parseFloat(m[5]);                    // simple fraction
  return parseFloat(m[6]);                                                                // integer/decimal
}

function findPiecePortion(portions: Array<{ measureEn: string; gramWeight: number }>) {
  const keywords = ["piece", "each", "item", "unit", "medium", "large", "small"];
  return portions.find(p => keywords.some(kw => p.measureEn.toLowerCase().includes(kw))) ?? null;
}

function bestPortionMatch(unit: string, portions: Array<{ measureEn: string; gramWeight: number }>) {
  if (!portions.length) return null;
  const targets = UNIT_ALIASES[unit] ?? [unit];
  return portions.find(p => targets.some(t => p.measureEn.toLowerCase().includes(t))) ?? null;
}

export function lookupFoodWeight(
  foodQuery: string,
  unit: string | null,
  foodWeights: FoodWeightEntry[],
): number | null {
  const foodLower = foodQuery.toLowerCase().trim();
  const foodWords = foodLower.split(/\s+/);
  const unitNorm = unit === null ? null : unit.toLowerCase().replace(/s$/, "");

  for (const entry of foodWeights) {
    const entryKey = entry.key.toLowerCase().trim();
    const entryUnit = entry.unit.toLowerCase().replace(/s$/, "");

    const unitOk = unitNorm === null
      ? ["each", "piece", "item"].includes(entryUnit)
      : entryUnit === unitNorm;

    if (!unitOk) continue;

    const entryWords = entryKey.split(/\s+/);
    const foodOk = entryWords.length === 1
      ? foodWords.some(w => w.startsWith(entryKey))
      : foodLower.includes(entryKey);

    if (foodOk) return entry.grams;
  }
  return null;
}
