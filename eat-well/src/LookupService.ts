/**
 * LookupService — thin service layer over DatabaseService for food search.
 *
 * Handles search, per-gram scaling, and section-grouped label assembly.
 * The FTS search and rerank logic lives in DatabaseService; this layer
 * provides a clean interface for views to call.
 */

import { DatabaseService, SECTIONS } from "./DatabaseService";
import { FoodMatch, NutrientRow, PortionRow } from "./types";

export interface LabelSection {
  name: string;
  rows: NutrientRow[];
}

export interface LookupResult {
  match: FoodMatch;
  nutrients: NutrientRow[];   // per 100 g
  portions: PortionRow[];
}

export class LookupService {
  constructor(private db: DatabaseService) {}

  search(query: string, lang: "en" | "fr" = "en", limit = 8): FoodMatch[] {
    return this.db.searchFoods(query.trim(), lang, limit);
  }

  getResult(match: FoodMatch): LookupResult {
    return {
      match,
      nutrients: this.db.getNutrients(match.foodId, 100),
      portions: this.db.getPortions(match.foodId),
    };
  }

  /** Nutrients scaled to a specific gram weight — used by RecipeService. */
  getNutrientsAt(foodId: number, grams: number): NutrientRow[] {
    return this.db.getNutrients(foodId, grams);
  }

  /** Scale per-100g nutrients to perGrams. */
  scaleNutrients(nutrients: NutrientRow[], perGrams: number): NutrientRow[] {
    if (perGrams === 100) return nutrients;
    return nutrients.map(n => ({ ...n, value: (n.value * perGrams) / 100 }));
  }

  /** Group nutrients into display sections. */
  groupBySections(nutrients: NutrientRow[]): LabelSection[] {
    const buckets: Record<string, NutrientRow[]> = {};
    for (const { name } of SECTIONS) buckets[name] = [];
    buckets["Other"] = [];

    for (const row of nutrients) {
      let placed = false;
      for (const { name, lo, hi } of SECTIONS) {
        if (row.rank >= lo && row.rank <= hi) {
          buckets[name].push(row);
          placed = true;
          break;
        }
      }
      if (!placed) buckets["Other"].push(row);
    }

    const order = [...SECTIONS.map(s => s.name), "Other"];
    return order
      .filter(name => buckets[name].length > 0)
      .map(name => ({ name, rows: buckets[name] }));
  }
}

// ============================================================
// Nutrient value formatting (mirrors Python fmt_value)
// ============================================================

export function formatValue(value: number, unit: string): string {
  if (value < 0.0001) return `trace ${unit}`;
  if (value >= 1000) return `${value.toLocaleString("en", { maximumFractionDigits: 0 })} ${unit}`;
  if (value >= 100)  return `${value.toFixed(0)} ${unit}`;
  if (value >= 10)   return `${value.toFixed(1)} ${unit}`;
  if (value >= 1)    return `${value.toFixed(2)} ${unit}`;
  if (value >= 0.01) return `${value.toFixed(3)} ${unit}`;
  return `${value.toFixed(4)} ${unit}`;
}
