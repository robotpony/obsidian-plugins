/**
 * Tests for LookupService and NutritionLabel.
 */

import { describe, it, expect } from "vitest";
import { LookupService, formatValue } from "../LookupService";
import { SECTIONS } from "../DatabaseService";
import type { NutrientRow, FoodMatch } from "../types";

// ============================================================
// formatValue
// ============================================================

describe("formatValue", () => {
  it("formats large values with comma separator", () => {
    expect(formatValue(2504, "kJ")).toBe("2,504 kJ");
  });

  it("formats 100-999 with no decimals", () => {
    expect(formatValue(598, "kcal")).toBe("598 kcal");
    expect(formatValue(100, "kcal")).toBe("100 kcal");
  });

  it("formats 10-99 to 1 decimal", () => {
    expect(formatValue(42.6, "g")).toBe("42.6 g");
    expect(formatValue(10.0, "g")).toBe("10.0 g");
  });

  it("formats 1-9.99 to 2 decimals", () => {
    expect(formatValue(7.79, "g")).toBe("7.79 g");
    expect(formatValue(1.0, "g")).toBe("1.00 g");
  });

  it("formats 0.01-0.99 to 3 decimals", () => {
    expect(formatValue(0.123, "mg")).toBe("0.123 mg");
  });

  it("formats sub-0.01 to 4 decimals", () => {
    expect(formatValue(0.0012, "mg")).toBe("0.0012 mg");
  });

  it("shows trace for near-zero", () => {
    expect(formatValue(0.000001, "mg")).toBe("trace mg");
  });
});

// ============================================================
// LookupService.groupBySections
// ============================================================

function makeNutrient(srNbr: number, rank: number, value = 1): NutrientRow {
  return { srNbr, name: `nutrient_${srNbr}`, unit: "g", rank, value };
}

describe("LookupService.groupBySections", () => {
  const mockDb = {
    searchFoods: () => [],
    getNutrients: () => [],
    getPortions: () => [],
    isReady: true,
    error: null,
  } as unknown as import("../DatabaseService").DatabaseService;

  const svc = new LookupService(mockDb);

  it("places energy in Energy section (rank 0-99)", () => {
    const nutrients = [makeNutrient(208, 10)]; // kcal rank=10
    const sections = svc.groupBySections(nutrients);
    expect(sections[0].name).toBe("Energy");
    expect(sections[0].rows.length).toBe(1);
  });

  it("places protein in Macros section (rank 100-399)", () => {
    const nutrients = [makeNutrient(203, 150)]; // protein rank=150
    const sections = svc.groupBySections(nutrients);
    expect(sections[0].name).toBe("Macros");
  });

  it("places calcium in Minerals section (rank 400-499)", () => {
    const nutrients = [makeNutrient(301, 410)]; // calcium rank=410
    const sections = svc.groupBySections(nutrients);
    expect(sections[0].name).toBe("Minerals");
  });

  it("places vitamin C in Vitamins section (rank 500+)", () => {
    const nutrients = [makeNutrient(401, 510)]; // vitamin E rank=510
    const sections = svc.groupBySections(nutrients);
    expect(sections[0].name).toBe("Vitamins");
  });

  it("places unknown rank in Other", () => {
    const nutrients = [makeNutrient(999, 99999)];
    const sections = svc.groupBySections(nutrients);
    expect(sections[0].name).toBe("Other");
  });

  it("groups mixed nutrients into correct sections", () => {
    const nutrients = [
      makeNutrient(208, 10),   // Energy
      makeNutrient(203, 150),  // Macros
      makeNutrient(301, 410),  // Minerals
      makeNutrient(401, 510),  // Vitamins
    ];
    const sections = svc.groupBySections(nutrients);
    expect(sections.map(s => s.name)).toEqual(["Energy", "Macros", "Minerals", "Vitamins"]);
  });

  it("omits empty sections", () => {
    const nutrients = [makeNutrient(208, 10)];
    const sections = svc.groupBySections(nutrients);
    expect(sections.length).toBe(1);
    expect(sections[0].name).toBe("Energy");
  });
});

// ============================================================
// LookupService.scaleNutrients
// ============================================================

describe("LookupService.scaleNutrients", () => {
  const mockDb = {
    searchFoods: () => [],
    getNutrients: () => [],
    getPortions: () => [],
  } as unknown as import("../DatabaseService").DatabaseService;

  const svc = new LookupService(mockDb);

  it("returns same array when perGrams is 100", () => {
    const nutrients = [makeNutrient(208, 10, 579)];
    const scaled = svc.scaleNutrients(nutrients, 100);
    expect(scaled).toBe(nutrients); // reference equality
  });

  it("scales to 50g correctly", () => {
    const nutrients = [makeNutrient(208, 10, 579)];
    const scaled = svc.scaleNutrients(nutrients, 50);
    expect(scaled[0].value).toBeCloseTo(289.5);
  });

  it("scales to 250g correctly", () => {
    const nutrients = [makeNutrient(203, 150, 21.2)]; // protein
    const scaled = svc.scaleNutrients(nutrients, 250);
    expect(scaled[0].value).toBeCloseTo(53.0);
  });

  it("does not mutate original array", () => {
    const nutrients = [makeNutrient(208, 10, 579)];
    svc.scaleNutrients(nutrients, 50);
    expect(nutrients[0].value).toBe(579);
  });
});

// ============================================================
// SECTIONS constant
// ============================================================

describe("SECTIONS", () => {
  it("covers 0-9999 without gaps between main sections", () => {
    const sorted = [...SECTIONS].sort((a, b) => a.lo - b.lo);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].lo).toBe(sorted[i - 1].hi + 1);
    }
  });

  it("has expected section names", () => {
    const names = SECTIONS.map(s => s.name);
    expect(names).toContain("Energy");
    expect(names).toContain("Macros");
    expect(names).toContain("Minerals");
    expect(names).toContain("Vitamins");
  });
});
