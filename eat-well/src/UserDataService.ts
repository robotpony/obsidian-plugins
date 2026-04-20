/**
 * Loads and merges bundled reference data with user overrides.
 *
 * Bundled defaults ship in src/data/ and are imported at build time.
 * User overrides live in the plugin directory as JSON files and are
 * read at runtime via Node fs. User entries win on conflict.
 *
 * P9a: aliases   → user_food_alias DB table (managed by DatabaseService)
 * P9b: food weights → work/food_weights.json (handled here)
 * P9d: taste defaults → work/taste_defaults.json (handled here)
 * P9c: portion cache → user_portion_cache DB table (managed by DatabaseService)
 */

import * as fs from "fs";
import * as path from "path";
import { FoodWeightEntry, TasteDefault, PortionCacheEntry } from "./types";

// Bundled data — imported at build time (esbuild resolves these)
import bundledAliases from "./data/aliases.json";
import bundledFoodWeights from "./data/food_weights.json";
import bundledTasteDefaults from "./data/taste_defaults.json";

export class UserDataService {
  private pluginDir: string;

  // Merged results (bundled + user overrides)
  aliases: Record<string, string> = {};
  foodWeights: FoodWeightEntry[] = [];
  tasteDefaults: TasteDefault[] = [];

  constructor(pluginDir: string) {
    this.pluginDir = pluginDir;
  }

  /** Load all user override files and merge with bundled defaults. */
  load(): void {
    this.aliases = this.mergeAliases();
    this.foodWeights = this.mergeFoodWeights();
    this.tasteDefaults = this.mergeTasteDefaults();
  }

  /** Add or update a user alias and persist to disk. */
  addAlias(inputKey: string, replacement: string): void {
    const key = inputKey.toLowerCase();
    const filePath = this.userDataPath("aliases.json");
    const current = this.loadJsonSafe<Record<string, string>>(filePath, {});
    current[key] = replacement;
    this.writeJson(filePath, current);
    this.aliases = this.mergeAliases();
  }

  /** Add or update a user food weight entry and persist to disk. */
  addFoodWeight(key: string, unit: string, grams: number, note?: string): void {
    const filePath = this.userDataPath("food_weights.json");
    const current = this.loadJsonSafe<FoodWeightEntry[]>(filePath, []);
    const idx = current.findIndex(
      e => e.key.toLowerCase() === key.toLowerCase() && e.unit.toLowerCase() === unit.toLowerCase()
    );
    const entry: FoodWeightEntry = { key, unit, grams, ...(note ? { note } : {}) };
    if (idx >= 0) current[idx] = entry;
    else current.push(entry);
    this.writeJson(filePath, current);
    this.foodWeights = this.mergeFoodWeights();
  }

  /** Add or update a taste default and persist to disk. */
  addTasteDefault(key: string, grams: number): void {
    const filePath = this.userDataPath("taste_defaults.json");
    const current = this.loadJsonSafe<TasteDefault[]>(filePath, []);
    const idx = current.findIndex(e => e.key.toLowerCase() === key.toLowerCase());
    const entry: TasteDefault = { key, grams };
    if (idx >= 0) current[idx] = entry;
    else current.push(entry);
    this.writeJson(filePath, current);
    this.tasteDefaults = this.mergeTasteDefaults();
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private mergeAliases(): Record<string, string> {
    const merged: Record<string, string> = { ...(bundledAliases as Record<string, string>) };
    const userPath = this.userDataPath("aliases.json");
    const user = this.loadJsonSafe<Record<string, string>>(userPath, {});
    for (const [k, v] of Object.entries(user)) merged[k.toLowerCase()] = v;
    return merged;
  }

  private mergeFoodWeights(): FoodWeightEntry[] {
    const bundled = bundledFoodWeights as FoodWeightEntry[];
    const userPath = this.userDataPath("food_weights.json");
    const user = this.loadJsonSafe<FoodWeightEntry[]>(userPath, []);
    // User entries prepended — lookupFoodWeight returns first match, so user wins
    return [...user, ...bundled];
  }

  private mergeTasteDefaults(): TasteDefault[] {
    const bundled = bundledTasteDefaults as TasteDefault[];
    const userPath = this.userDataPath("taste_defaults.json");
    const user = this.loadJsonSafe<TasteDefault[]>(userPath, []);
    return [...user, ...bundled];
  }

  private userDataPath(filename: string): string {
    return path.join(this.pluginDir, "user-data", filename);
  }

  private loadJsonSafe<T>(filePath: string, fallback: T): T {
    try {
      const text = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(text) as T;
    } catch {
      return fallback;
    }
  }

  private writeJson(filePath: string, data: unknown): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  }
}
