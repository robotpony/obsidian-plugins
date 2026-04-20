/**
 * Tests for ResolutionService.
 */

import { describe, it, expect } from "vitest";
import { ResolutionService } from "../ResolutionService";
import type { DatabaseService } from "../DatabaseService";
import type { UserDataService } from "../UserDataService";
import type { ParsedIngredient, PortionRow, FoodWeightEntry } from "../types";

function makeService(
  portions: PortionRow[] = [],
  cache: Map<string, number> = new Map(),
  foodWeights: FoodWeightEntry[] = [],
) {
  const mockDb = {
    getPortions: () => portions,
    loadPortionCache: () => cache,
  } as unknown as DatabaseService;
  const mockUserData = {
    foodWeights,
  } as unknown as UserDataService;
  return new ResolutionService(mockDb, mockUserData);
}

function parsed(amount: number, unit: string | null, foodQuery = "test food"): ParsedIngredient {
  return { amount, unit, foodQuery, raw: `${amount} ${unit ?? ""} ${foodQuery}`.trim(), note: null };
}

describe("ResolutionService.resolveGrams", () => {
  it("converts grams directly", () => {
    const svc = makeService();
    const [g, w] = svc.resolveGrams(parsed(200, "g"), 1);
    expect(g).toBeCloseTo(200);
    expect(w).toBeNull();
  });

  it("converts kilograms", () => {
    const svc = makeService();
    const [g] = svc.resolveGrams(parsed(0.5, "kg"), 1);
    expect(g).toBeCloseTo(500);
  });

  it("converts ounces", () => {
    const svc = makeService();
    const [g] = svc.resolveGrams(parsed(2, "oz"), 1);
    expect(g).toBeCloseTo(56.699);
  });

  it("converts ml directly", () => {
    const svc = makeService();
    const [g, w] = svc.resolveGrams(parsed(250, "ml"), 1);
    expect(g).toBeCloseTo(250);
    expect(w).toBeNull();
  });

  it("uses portion table for cup", () => {
    const portions: PortionRow[] = [{ measureEn: "1 cup", measureFr: null, gramWeight: 125 }];
    const svc = makeService(portions);
    const [g, w] = svc.resolveGrams(parsed(2, "cup"), 1);
    expect(g).toBeCloseTo(250);
    expect(w).toBeNull();
  });

  it("uses food weight reference when no portion in DB", () => {
    const foodWeights: FoodWeightEntry[] = [{ key: "flour", unit: "cup", grams: 130 }];
    const svc = makeService([], new Map(), foodWeights);
    const [g] = svc.resolveGrams(parsed(1, "cup", "flour"), 1);
    expect(g).toBeCloseTo(130);
  });

  it("uses user cache over food weight reference", () => {
    const foodWeights: FoodWeightEntry[] = [{ key: "flour", unit: "cup", grams: 130 }];
    const cache = new Map([["flour||cup", 140]]);
    const svc = makeService([], cache, foodWeights);
    const [g] = svc.resolveGrams(parsed(1, "cup", "flour"), 1);
    expect(g).toBeCloseTo(140);
  });

  it("falls back to 1 g per item when unitless and no portion data", () => {
    const svc = makeService();
    const [g, w] = svc.resolveGrams(parsed(3, null, "widget"), 1);
    expect(g).toBeCloseTo(3);
    expect(w).not.toBeNull();
  });

  it("uses piece estimate for clove", () => {
    const svc = makeService();
    const [g, w] = svc.resolveGrams(parsed(4, "clove", "garlic"), 1);
    expect(g).toBeCloseTo(24); // 4 * 6 g
    expect(w).not.toBeNull();  // estimated, should warn
  });

  it("uses piece estimate for head", () => {
    const svc = makeService();
    const [g] = svc.resolveGrams(parsed(1, "head", "garlic"), 1);
    expect(g).toBeCloseTo(50);
  });
});
