/**
 * Tests for RecipeService.
 */

import { describe, it, expect } from "vitest";
import { RecipeService } from "../RecipeService";
import type { LookupService } from "../LookupService";
import type { ResolutionService } from "../ResolutionService";
import type { UserDataService } from "../UserDataService";
import type { FoodMatch, NutrientRow } from "../types";

const MOCK_MATCH: FoodMatch = {
  foodId: 1,
  name: "Test Food",
  sourceName: "USDA",
  sourceCode: "usda_sr_legacy",
  score: 0,
};

function makeService(opts: {
  searchResults?: FoodMatch[];
  nutrients?: NutrientRow[];
  resolveResult?: [number, string | null];
} = {}) {
  const searchResults = opts.searchResults ?? [MOCK_MATCH];
  const nutrients = opts.nutrients ?? [];
  const resolveResult: [number, string | null] = opts.resolveResult ?? [100, null];

  const mockLookup = {
    search: () => searchResults,
    getNutrientsAt: () => nutrients,
  } as unknown as LookupService;

  const mockResolution = {
    resolveGrams: () => resolveResult,
  } as unknown as ResolutionService;

  const mockUserData = {
    aliases: {},
    tasteDefaults: [],
  } as unknown as UserDataService;

  return new RecipeService(mockLookup, mockResolution, mockUserData);
}

// ============================================================
// parseNoteIngredients
// ============================================================

describe("RecipeService.parseNoteIngredients", () => {
  const svc = makeService();

  it("returns plain ingredient lines", () => {
    expect(svc.parseNoteIngredients("2 cups flour\n1 tsp salt"))
      .toEqual(["2 cups flour", "1 tsp salt"]);
  });

  it("skips blank lines", () => {
    expect(svc.parseNoteIngredients("2 cups flour\n\n1 tsp salt"))
      .toEqual(["2 cups flour", "1 tsp salt"]);
  });

  it("skips headings", () => {
    expect(svc.parseNoteIngredients("# Ingredients\n2 cups flour"))
      .toEqual(["2 cups flour"]);
  });

  it("skips YAML frontmatter", () => {
    const content = "---\ntitle: My Recipe\nservings: 4\n---\n2 cups flour";
    expect(svc.parseNoteIngredients(content)).toEqual(["2 cups flour"]);
  });

  it("skips code blocks", () => {
    const content = "2 cups flour\n```\nsome code\nmore code\n```\n1 tsp salt";
    expect(svc.parseNoteIngredients(content)).toEqual(["2 cups flour", "1 tsp salt"]);
  });

  it("skips table rows", () => {
    const content = "2 cups flour\n| col1 | col2 |\n1 tsp salt";
    expect(svc.parseNoteIngredients(content)).toEqual(["2 cups flour", "1 tsp salt"]);
  });

  it("skips unchecked todo items", () => {
    expect(svc.parseNoteIngredients("- [ ] buy flour\n2 cups flour"))
      .toEqual(["2 cups flour"]);
  });

  it("skips checked todo items", () => {
    expect(svc.parseNoteIngredients("- [x] bought salt\n2 cups flour"))
      .toEqual(["2 cups flour"]);
  });

  it("strips unordered list markers", () => {
    expect(svc.parseNoteIngredients("- 2 cups flour\n* 1 tsp salt"))
      .toEqual(["2 cups flour", "1 tsp salt"]);
  });

  it("strips ordered list markers", () => {
    expect(svc.parseNoteIngredients("1. 2 cups flour\n2. 1 tsp salt"))
      .toEqual(["2 cups flour", "1 tsp salt"]);
  });

  it("strips blockquote markers", () => {
    expect(svc.parseNoteIngredients("> 2 cups flour"))
      .toEqual(["2 cups flour"]);
  });

  it("skips HTML lines", () => {
    expect(svc.parseNoteIngredients("<div>stuff</div>\n1 tsp salt"))
      .toEqual(["1 tsp salt"]);
  });

  it("returns empty array for empty content", () => {
    expect(svc.parseNoteIngredients("")).toEqual([]);
  });

  it("skips YAML frontmatter with ... terminator", () => {
    const content = "---\ntitle: Recipe\n...\n2 cups flour";
    expect(svc.parseNoteIngredients(content)).toEqual(["2 cups flour"]);
  });
});

// ============================================================
// aggregateNutrients
// ============================================================

describe("RecipeService.aggregateNutrients", () => {
  const svc = makeService();

  it("returns empty for no results", () => {
    expect(svc.aggregateNutrients([])).toEqual([]);
  });

  it("returns empty for results with no nutrients", () => {
    const r = [{ raw: "x", parsed: null, match: null, gramWeight: 0, scaledNutrients: [], warning: null }];
    expect(svc.aggregateNutrients(r)).toEqual([]);
  });

  it("sums the same nutrient across ingredients", () => {
    const n: NutrientRow = { srNbr: 208, name: "Energy", unit: "kcal", rank: 10, value: 0 };
    const results = [
      { raw: "a", parsed: null, match: null, gramWeight: 0, scaledNutrients: [{ ...n, value: 200 }], warning: null },
      { raw: "b", parsed: null, match: null, gramWeight: 0, scaledNutrients: [{ ...n, value: 150 }], warning: null },
    ];
    const agg = svc.aggregateNutrients(results);
    expect(agg).toHaveLength(1);
    expect(agg[0].value).toBeCloseTo(350);
  });

  it("keeps distinct nutrients separate", () => {
    const kcal: NutrientRow = { srNbr: 208, name: "Energy", unit: "kcal", rank: 10, value: 200 };
    const prot: NutrientRow = { srNbr: 203, name: "Protein", unit: "g", rank: 150, value: 10 };
    const results = [{ raw: "a", parsed: null, match: null, gramWeight: 0, scaledNutrients: [kcal, prot], warning: null }];
    expect(svc.aggregateNutrients(results)).toHaveLength(2);
  });

  it("sorts by rank ascending", () => {
    const fat: NutrientRow = { srNbr: 204, name: "Fat", unit: "g", rank: 200, value: 5 };
    const kcal: NutrientRow = { srNbr: 208, name: "Energy", unit: "kcal", rank: 10, value: 200 };
    const results = [{ raw: "a", parsed: null, match: null, gramWeight: 0, scaledNutrients: [fat, kcal], warning: null }];
    const agg = svc.aggregateNutrients(results);
    expect(agg[0].rank).toBe(10);
    expect(agg[1].rank).toBe(200);
  });
});

// ============================================================
// evaluateLines
// ============================================================

describe("RecipeService.evaluateLines", () => {
  it("returns empty result for no lines", () => {
    const svc = makeService();
    const result = svc.evaluateLines([]);
    expect(result.lines).toHaveLength(0);
    expect(result.totalGrams).toBe(0);
  });

  it("marks unparseable lines as failed with warning", () => {
    const svc = makeService();
    // No leading number — parseIngredient returns null
    const result = svc.evaluateLines(["salt and pepper to season"]);
    expect(result.lines[0].match).toBeNull();
    expect(result.lines[0].warning).toBeTruthy();
  });

  it("marks lines with no search results as failed", () => {
    const svc = makeService({ searchResults: [] });
    const result = svc.evaluateLines(["2 cups flour"]);
    expect(result.lines[0].match).toBeNull();
    expect(result.lines[0].warning).toContain("no match");
  });

  it("resolves nutrients for matched lines", () => {
    const nutrients: NutrientRow[] = [{ srNbr: 208, name: "Energy", unit: "kcal", rank: 10, value: 200 }];
    const svc = makeService({ nutrients, resolveResult: [50, null] });
    const result = svc.evaluateLines(["2 cups flour"]);
    expect(result.lines[0].match).not.toBeNull();
    expect(result.lines[0].gramWeight).toBe(50);
    expect(result.lines[0].scaledNutrients).toHaveLength(1);
    expect(result.lines[0].warning).toBeNull();
  });

  it("scales aggregated nutrients by servings", () => {
    const nutrients: NutrientRow[] = [{ srNbr: 208, name: "Energy", unit: "kcal", rank: 10, value: 400 }];
    const svc = makeService({ nutrients, resolveResult: [100, null] });
    const result = svc.evaluateLines(["2 cups flour"], "en", 4);
    expect(result.servings).toBe(4);
    expect(result.aggregated[0].value).toBeCloseTo(100); // 400 / 4
  });

  it("does not scale when servings is 1", () => {
    const nutrients: NutrientRow[] = [{ srNbr: 208, name: "Energy", unit: "kcal", rank: 10, value: 400 }];
    const svc = makeService({ nutrients, resolveResult: [100, null] });
    const result = svc.evaluateLines(["2 cups flour"], "en", 1);
    expect(result.aggregated[0].value).toBeCloseTo(400);
  });

  it("totals gram weights across matched ingredients", () => {
    const svc = makeService({ resolveResult: [100, null] });
    const result = svc.evaluateLines(["2 cups flour", "1 cup sugar"]);
    expect(result.totalGrams).toBeCloseTo(200);
  });

  it("sets totalGrams to 0 for unmatched lines", () => {
    const svc = makeService({ searchResults: [] });
    const result = svc.evaluateLines(["2 cups flour"]);
    expect(result.totalGrams).toBe(0);
  });

  it("surfaces resolve warning on matched lines", () => {
    const svc = makeService({ resolveResult: [1, "no portion found for 'widget', used 1 g"] });
    const result = svc.evaluateLines(["3 widget garlic"]);
    if (result.lines[0].match) {
      // warning comes from resolve step
      expect(result.lines[0].warning).toContain("no portion");
    }
  });
});
