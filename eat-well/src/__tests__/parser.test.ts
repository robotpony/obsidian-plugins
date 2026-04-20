/**
 * Tests for IngredientParser.ts
 * Ported from tests/test_parser.py — same cases, same assertions.
 */

import { describe, it, expect } from "vitest";
import {
  parseIngredient,
  resolveGrams,
  cleanFoodQuery,
  lookupFoodWeight,
} from "../IngredientParser";
import type { FoodWeightEntry } from "../types";

// ============================================================
// parseIngredient — basic cases
// ============================================================

describe("parseIngredient — basic", () => {
  it("integer with unit", () => {
    const r = parseIngredient("1 cup whole milk");
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1.0);
    expect(r!.unit).toBe("cup");
    expect(r!.foodQuery).toBe("whole milk");
  });

  it("decimal with unit", () => {
    const r = parseIngredient("1.5 tbsp olive oil");
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1.5);
    expect(r!.unit).toBe("tbsp");
    expect(r!.foodQuery).toBe("olive oil");
  });

  it("simple fraction", () => {
    const r = parseIngredient("1/2 cup olive oil");
    expect(r).not.toBeNull();
    expect(r!.amount).toBeCloseTo(0.5);
    expect(r!.unit).toBe("cup");
    expect(r!.foodQuery).toBe("olive oil");
  });

  it("mixed fraction", () => {
    const r = parseIngredient("1 1/2 cups flour");
    expect(r).not.toBeNull();
    expect(r!.amount).toBeCloseTo(1.5);
    expect(r!.unit).toBe("cups");
    expect(r!.foodQuery).toBe("flour");
  });

  it("compact unit no space", () => {
    const r = parseIngredient("100g almonds");
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(100.0);
    expect(r!.unit).toBe("g");
    expect(r!.foodQuery).toBe("almonds");
  });

  it("compact unit decimal", () => {
    const r = parseIngredient("1.5kg potatoes");
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1.5);
    expect(r!.unit).toBe("kg");
    expect(r!.foodQuery).toBe("potatoes");
  });

  it("no unit returns null for unit field", () => {
    const r = parseIngredient("2 eggs");
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2.0);
    expect(r!.unit).toBeNull();
    expect(r!.foodQuery).toBe("eggs");
  });

  it("piece unit", () => {
    const r = parseIngredient("2 large eggs");
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2.0);
    expect(r!.unit).toBe("large");
    expect(r!.foodQuery).toBe("eggs");
  });

  it("cloves", () => {
    const r = parseIngredient("3 cloves garlic");
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(3.0);
    expect(r!.unit).toBe("cloves");
    expect(r!.foodQuery).toBe("garlic");
  });
});

// ============================================================
// parseIngredient — note and annotation stripping
// ============================================================

describe("parseIngredient — stripping", () => {
  it("slash annotation stripped", () => {
    const r = parseIngredient("50g avocado / half an avocado");
    expect(r!.foodQuery).toBe("avocado");
  });

  it("parenthetical note stripped", () => {
    const r = parseIngredient("10g ginger (grated/jarred)");
    expect(r!.foodQuery).toBe("ginger");
  });

  it("or alternative stripped", () => {
    const r = parseIngredient("1 tbsp chicken stock or drippings");
    expect(r!.foodQuery).toBe("chicken stock");
  });

  it("parenthetical and note combined", () => {
    const r = parseIngredient("50g lemon juice (used 75g, was too much)");
    expect(r!.foodQuery).toBe("lemon juice");
  });

  it("comma descriptor stripped", () => {
    const r = parseIngredient("1 onion, diced");
    expect(r!.foodQuery).toBe("onion");
  });

  it("comma descriptor shallot", () => {
    const r = parseIngredient("1 shallot, diced");
    expect(r!.foodQuery).toBe("shallot");
  });

  it("comma descriptor garlic", () => {
    const r = parseIngredient("4 cloves of garlic, diced");
    expect(r!.foodQuery).toBe("garlic");
  });

  it("of preposition stripped", () => {
    const r = parseIngredient("4 cups of sliced mushrooms");
    expect(r!.unit).toBe("cups");
    expect(r!.foodQuery).toBe("mushrooms");
  });

  it("dual metric/imperial amount", () => {
    const r = parseIngredient("1.36kg/3 lbs of ground beef (or a mix of beef/veal/pork)");
    expect(r).not.toBeNull();
    expect(r!.amount).toBeCloseTo(1.36);
    expect(r!.unit).toBe("kg");
    expect(r!.foodQuery).toBe("ground beef");
  });

  it("salt/pepper no number returns null", () => {
    expect(parseIngredient("Salt/pepper")).toBeNull();
  });

  it("optional parenthetical", () => {
    const r = parseIngredient("2 tsp Accent (optional)");
    expect(r!.foodQuery).toBe("Accent");
  });
});

// ============================================================
// parseIngredient — preparation adjective stripping
// ============================================================

describe("parseIngredient — prep adjectives", () => {
  it("single prep adjective stripped", () => {
    expect(parseIngredient("4 cups sliced mushrooms")!.foodQuery).toBe("mushrooms");
  });

  it("prep adjective after of stripped", () => {
    expect(parseIngredient("4 cups of sliced mushrooms")!.foodQuery).toBe("mushrooms");
  });

  it("multiple prep adjectives, stops at non-prep", () => {
    expect(parseIngredient("200g chopped fresh parsley")!.foodQuery).toBe("fresh parsley");
  });

  it("non-prep word not stripped", () => {
    expect(parseIngredient("2 cups almond milk")!.foodQuery).toBe("almond milk");
  });

  it("prep adjective alone not stripped", () => {
    expect(parseIngredient("1 cup sliced")!.foodQuery).toBe("sliced");
  });
});

// ============================================================
// parseIngredient — inline slash alternative
// ============================================================

describe("parseIngredient — slash alternative", () => {
  it("inline slash alternative stripped", () => {
    expect(parseIngredient("50g lemon/lime juice")!.foodQuery).toBe("lemon");
  });

  it("inline slash alternative with more words", () => {
    expect(parseIngredient("1 tbsp soy/tamari sauce")!.foodQuery).toBe("soy");
  });

  it("spaced slash annotation stripped", () => {
    expect(parseIngredient("50g avocado / half an avocado")!.foodQuery).toBe("avocado");
  });
});

// ============================================================
// parseIngredient — Unicode fractions
// ============================================================

describe("parseIngredient — Unicode fractions", () => {
  it("½ fraction", () => {
    const r = parseIngredient("½ tsp salt");
    expect(r!.amount).toBeCloseTo(0.5);
    expect(r!.unit).toBe("tsp");
    expect(r!.foodQuery).toBe("salt");
  });

  it("¼ fraction", () => {
    expect(parseIngredient("¼ cup sugar")!.amount).toBeCloseTo(0.25);
  });

  it("¾ fraction", () => {
    expect(parseIngredient("¾ cup flour")!.amount).toBeCloseTo(0.75);
  });
});

// ============================================================
// parseIngredient — returns null cases
// ============================================================

describe("parseIngredient — null cases", () => {
  it("blank line", () => {
    expect(parseIngredient("")).toBeNull();
    expect(parseIngredient("   ")).toBeNull();
  });

  it("comment line", () => {
    expect(parseIngredient("# comment")).toBeNull();
    expect(parseIngredient("#salt")).toBeNull();
  });

  it("no leading number", () => {
    expect(parseIngredient("salt to taste")).toBeNull();
    expect(parseIngredient("a pinch of salt")).toBeNull();
  });

  it("number only no food", () => {
    expect(parseIngredient("1")).toBeNull();
    expect(parseIngredient("1 cup")).toBeNull();
  });
});

// ============================================================
// resolveGrams — direct conversions
// ============================================================

describe("resolveGrams — direct", () => {
  it("grams direct", () => {
    const [g, w] = resolveGrams(100.0, "g", []);
    expect(g).toBe(100.0);
    expect(w).toBeNull();
  });

  it("kg conversion", () => {
    const [g, w] = resolveGrams(0.5, "kg", []);
    expect(g).toBe(500.0);
    expect(w).toBeNull();
  });

  it("oz conversion", () => {
    const [g] = resolveGrams(1.0, "oz", []);
    expect(g).toBeCloseTo(28.3495, 3);
  });

  it("lb conversion", () => {
    const [g] = resolveGrams(1.0, "lb", []);
    expect(g).toBeCloseTo(453.592, 3);
  });
});

// ============================================================
// resolveGrams — portion lookup
// ============================================================

const fakePortion = (measureEn: string, gramWeight: number) => ({ measureEn, gramWeight });

describe("resolveGrams — portions", () => {
  it("cup portion match", () => {
    const [g, w] = resolveGrams(2.0, "cup", [fakePortion("1 cup", 240.0)]);
    expect(g).toBe(480.0);
    expect(w).toBeNull();
  });

  it("tbsp portion match", () => {
    const [g] = resolveGrams(3.0, "tbsp", [fakePortion("1 tbsp", 15.0)]);
    expect(g).toBe(45.0);
  });

  it("no portion fallback", () => {
    const [g, w] = resolveGrams(2.0, "cup", []);
    expect(g).toBe(2.0);
    expect(w).not.toBeNull();
    expect(w).toContain("cup");
  });

  it("no unit with piece portion", () => {
    const [g, w] = resolveGrams(2.0, null, [fakePortion("1 medium", 120.0)]);
    expect(g).toBe(240.0);
    expect(w).toBeNull();
  });

  it("no unit no portions fallback", () => {
    const [g, w] = resolveGrams(3.0, null, []);
    expect(g).toBe(3.0);
    expect(w).not.toBeNull();
  });
});

// ============================================================
// resolveGrams — piece-unit estimates
// ============================================================

describe("resolveGrams — piece estimates", () => {
  it("cloves estimate", () => {
    const [g, w] = resolveGrams(4.0, "cloves", []);
    expect(g).toBe(24.0);
    expect(w).toContain("estimated");
  });

  it("clove singular", () => {
    const [g] = resolveGrams(1.0, "clove", []);
    expect(g).toBe(6.0);
  });

  it("sprigs estimate", () => {
    const [g] = resolveGrams(3.0, "sprigs", []);
    expect(g).toBe(6.0);
  });

  it("stalks estimate", () => {
    const [g] = resolveGrams(2.0, "stalks", []);
    expect(g).toBe(80.0);
  });

  it("falls through when DB portion doesn't match unit", () => {
    const [g] = resolveGrams(3.0, "cloves", [fakePortion("1 cup", 240.0)]);
    expect(g).toBe(18.0);
  });

  it("unknown unit falls back to 1g", () => {
    const [g, w] = resolveGrams(2.0, "pinch", []);
    expect(g).toBe(2.0);
    expect(w).toContain("1 g");
  });
});

// ============================================================
// parseIngredient — parenthetical amount fallback
// ============================================================

describe("parseIngredient — paren amount", () => {
  it("basic paren amount", () => {
    const r = parseIngredient("garlic powder (1 teaspoon)");
    expect(r!.amount).toBe(1.0);
    expect(r!.unit).toBe("teaspoon");
    expect(r!.foodQuery).toBe("garlic powder");
  });

  it("unicode fraction in paren", () => {
    const r = parseIngredient("garlic powder (½ teaspoon)");
    expect(r!.amount).toBeCloseTo(0.5);
    expect(r!.unit).toBe("teaspoon");
    expect(r!.foodQuery).toBe("garlic powder");
  });

  it("paren amount no unit", () => {
    const r = parseIngredient("cumin (2)");
    expect(r!.amount).toBe(2.0);
    expect(r!.unit).toBeNull();
    expect(r!.foodQuery).toBe("cumin");
  });

  it("mixed fraction in paren", () => {
    const r = parseIngredient("cinnamon (1 1/2 tsp)");
    expect(r!.amount).toBeCloseTo(1.5);
    expect(r!.unit).toBe("tsp");
  });

  it("metric unit in paren", () => {
    const r = parseIngredient("salt (5 g)");
    expect(r!.amount).toBe(5.0);
    expect(r!.unit).toBe("g");
    expect(r!.foodQuery).toBe("salt");
  });

  it("non-numeric paren returns null", () => {
    expect(parseIngredient("thyme (big pinch)")).toBeNull();
  });

  it("to taste paren returns null", () => {
    expect(parseIngredient("salt, pepper (to taste)")).toBeNull();
  });

  it("unknown unit in paren yields null unit", () => {
    const r = parseIngredient("paprika (1 pinch)");
    expect(r).not.toBeNull();
    expect(r!.unit).toBeNull();
  });
});

// ============================================================
// alias substitution
// ============================================================

describe("parseIngredient — aliases", () => {
  it("word-level alias: Accent MSG", () => {
    const r = parseIngredient("2 tsp Accent MSG (optional)", { msg: "monosodium glutamate" });
    expect(r!.foodQuery).toBe("monosodium glutamate");
  });

  it("word-level alias: EVOO", () => {
    const r = parseIngredient("1 tbsp good EVOO", { evoo: "olive oil" });
    expect(r!.foodQuery).toBe("olive oil");
  });

  it("exact match takes priority over word-level", () => {
    const r = parseIngredient("2 tsp Accent MSG", {
      msg: "monosodian glutamate",
      "accent msg": "accent seasoning",
    });
    expect(r!.foodQuery).toBe("accent seasoning");
  });

  it("of preposition after paren", () => {
    const r = parseIngredient("1.36kg/3 lbs of ground beef (or a mix of beef/veal/pork)");
    expect(r!.foodQuery).toBe("ground beef");
  });
});

// ============================================================
// to-taste defaults
// ============================================================

describe("parseIngredient — taste defaults", () => {
  it("salt default applied", () => {
    const r = parseIngredient("salt to taste", {}, [{ key: "salt", grams: 2 }]);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2);
    expect(r!.unit).toBe("g");
    expect(r!.note).toContain("to taste");
  });

  it("unrecognised line still null", () => {
    expect(parseIngredient("love and good vibes", {}, [{ key: "salt", grams: 2 }])).toBeNull();
  });
});

// ============================================================
// cleanFoodQuery
// ============================================================

describe("cleanFoodQuery", () => {
  it("strips prep adjective", () => {
    expect(cleanFoodQuery("sliced mushrooms")).toBe("mushrooms");
  });

  it("stops at non-prep word", () => {
    expect(cleanFoodQuery("fresh parsley")).toBe("fresh parsley");
  });

  it("alias substitution exact", () => {
    expect(cleanFoodQuery("msg", { msg: "monosodium glutamate" })).toBe("monosodium glutamate");
  });
});

// ============================================================
// lookupFoodWeight
// ============================================================

describe("lookupFoodWeight", () => {
  const weights: FoodWeightEntry[] = [
    { key: "shallot", unit: "each", grams: 30 },
    { key: "mushroom", unit: "cup", grams: 70 },
    { key: "onion", unit: "each", grams: 110 },
  ];

  it("exact match", () => {
    expect(lookupFoodWeight("shallot", null, weights)).toBe(30);
  });

  it("substring match: sliced mushrooms → mushroom", () => {
    expect(lookupFoodWeight("sliced mushrooms", "cup", weights)).toBe(70);
  });

  it("unit mismatch returns null", () => {
    expect(lookupFoodWeight("shallot", "cup", weights)).toBeNull();
  });

  it("unitless matches each/piece/item", () => {
    expect(lookupFoodWeight("onion", null, weights)).toBe(110);
  });

  it("no match returns null", () => {
    expect(lookupFoodWeight("truffle", "cup", weights)).toBeNull();
  });
});
