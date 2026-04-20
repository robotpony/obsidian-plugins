// ============================================================
// Core data types
// ============================================================

export interface ParsedIngredient {
  amount: number;
  unit: string | null;
  foodQuery: string;
  raw: string;
  note: string | null;
}

export interface FoodMatch {
  foodId: number;
  name: string;
  sourceName: string;
  sourceCode: string;
  score: number;
}

export interface NutrientRow {
  srNbr: number;
  name: string;
  unit: string;
  rank: number;
  value: number;        // scaled to the requested gram weight
}

export interface PortionRow {
  measureEn: string;
  measureFr: string | null;
  gramWeight: number;
}

export interface RecipeResult {
  lines: IngredientResult[];
  aggregated: NutrientRow[];
  totalGrams: number;
  servings: number;
}

export interface IngredientResult {
  raw: string;
  parsed: ParsedIngredient | null;
  match: FoodMatch | null;
  gramWeight: number;
  scaledNutrients: NutrientRow[];
  warning: string | null;
}

// ============================================================
// User data override types
// ============================================================

export interface FoodWeightEntry {
  key: string;       // substring match against food query
  unit: string;
  grams: number;
  note?: string;
}

export interface TasteDefault {
  key: string;       // substring match against food query
  grams: number;
}

export interface PortionCacheEntry {
  foodQuery: string;
  unit: string | null;
  gramWeight: number;
}

// ============================================================
// Plugin settings
// ============================================================

export interface EatWellSettings {
  dbPath: string;                // empty = use plugin dir / ew.db
  defaultLang: "en" | "fr";
  showSidebarByDefault: boolean;
  enableHoverTooltip: boolean;
  hoverDelayMs: number;
}

export const DEFAULT_SETTINGS: EatWellSettings = {
  dbPath: "",
  defaultLang: "en",
  showSidebarByDefault: true,
  enableHoverTooltip: false,
  hoverDelayMs: 400,
};
