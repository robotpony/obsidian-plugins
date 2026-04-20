/**
 * SQLite database loader using sql.js (WASM).
 *
 * Loads ew.db from the plugin directory into memory at startup.
 * All query methods return plain objects — no sql.js types leak into callers.
 *
 * Emits:
 *   "db-ready"  — DB loaded and verified successfully
 *   "db-error"  — DB missing or failed to load (error stored in this.error)
 */

import { Events } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { FoodMatch, NutrientRow, PortionRow, PortionCacheEntry } from "./types";

// sql.js is imported as a CJS default
// eslint-disable-next-line @typescript-eslint/no-var-requires
const initSqlJs = require("sql.js");

// Rank boundaries for label sections (mirrors Python SECTIONS)
export const SECTIONS = [
  { name: "Energy",   lo: 0,   hi: 99   },
  { name: "Macros",   lo: 100, hi: 399  },
  { name: "Minerals", lo: 400, hi: 499  },
  { name: "Vitamins", lo: 500, hi: 9999 },
];

type SqlJsDb = {
  exec: (sql: string, params?: unknown[]) => Array<{ columns: string[]; values: unknown[][] }>;
  run: (sql: string, params?: unknown[]) => void;
  close: () => void;
};

export class DatabaseService extends Events {
  private db: SqlJsDb | null = null;
  error: string | null = null;

  async init(pluginDir: string, dbPathOverride?: string): Promise<void> {
    const dbPath = dbPathOverride && fs.existsSync(dbPathOverride)
      ? dbPathOverride
      : path.join(pluginDir, "ew.db");

    if (!fs.existsSync(dbPath)) {
      this.error = `ew.db not found at ${dbPath}. Download it from the GitHub releases page and place it in the plugin directory.`;
      this.trigger("db-error", this.error);
      return;
    }

    try {
      const SQL = await initSqlJs({
        locateFile: (f: string) => path.join(pluginDir, f),
      });
      const buf = fs.readFileSync(dbPath);
      this.db = new SQL.Database(new Uint8Array(buf)) as SqlJsDb;

      // Quick sanity check
      const result = this.db.exec("SELECT COUNT(*) FROM food");
      if (!result.length) throw new Error("food table is empty or missing");

      this.trigger("db-ready");
    } catch (e) {
      this.error = String(e);
      this.trigger("db-error", this.error);
    }
  }

  get isReady(): boolean { return this.db !== null; }

  // ============================================================
  // Food search
  // ============================================================

  searchFoods(query: string, lang: "en" | "fr" = "en", limit = 5): FoodMatch[] {
    if (!this.db) return [];
    const col = lang === "fr" ? "name_fr" : "name_en";
    const ftsQuery = buildFtsQuery(query, col);
    const fetchLimit = Math.max(limit * 4, 20);

    try {
      const res = this.db.exec(
        `SELECT f.id,
                COALESCE(f.${col}, f.name_en) AS name,
                s.name                         AS source_name,
                s.code                         AS source_code
         FROM food_fts
         JOIN food   f ON food_fts.rowid = f.id
         JOIN source s ON f.source_id    = s.id
         WHERE food_fts MATCH ?
         ORDER BY bm25(food_fts)
         LIMIT ?`,
        [ftsQuery, fetchLimit],
      );
      const matches: FoodMatch[] = rowsToObjects(res).map((r, i) => ({
        foodId: r.id as number,
        name: (r.name as string) || "",
        sourceName: r.source_name as string,
        sourceCode: r.source_code as string,
        score: i,
      }));
      return rerank(matches, query).slice(0, limit);
    } catch {
      return [];
    }
  }

  // ============================================================
  // Nutrient / portion queries
  // ============================================================

  getNutrients(foodId: number, grams = 100): NutrientRow[] {
    if (!this.db) return [];
    const res = this.db.exec(
      `SELECT n.sr_nbr,
              n.name_en,
              n.unit,
              COALESCE(n.rank, 99999) AS rank,
              fn.amount * ? / 100.0   AS value
       FROM food_nutrient fn
       JOIN nutrient n ON fn.nutrient_id = n.id
       WHERE fn.food_id = ?
         AND fn.amount  > 0
       ORDER BY COALESCE(n.rank, 99999)`,
      [grams, foodId],
    );
    return rowsToObjects(res).map(r => ({
      srNbr: r.sr_nbr as number,
      name: r.name_en as string,
      unit: r.unit as string,
      rank: r.rank as number,
      value: r.value as number,
    }));
  }

  getPortions(foodId: number): PortionRow[] {
    if (!this.db) return [];
    const res = this.db.exec(
      `SELECT measure_en, measure_fr, gram_weight
       FROM food_portion
       WHERE food_id = ?
       ORDER BY seq_num`,
      [foodId],
    );
    return rowsToObjects(res).map(r => ({
      measureEn: r.measure_en as string,
      measureFr: (r.measure_fr as string | null) ?? null,
      gramWeight: r.gram_weight as number,
    }));
  }

  // ============================================================
  // Alias management (user_food_alias table)
  // ============================================================

  loadAliasesFromDb(): Record<string, string> {
    if (!this.db) return {};
    try {
      const res = this.db.exec("SELECT input_key, replacement FROM user_food_alias");
      const out: Record<string, string> = {};
      for (const row of rowsToObjects(res)) {
        out[row.input_key as string] = row.replacement as string;
      }
      return out;
    } catch {
      return {};
    }
  }

  upsertAlias(inputKey: string, replacement: string, source = "user"): void {
    if (!this.db) return;
    try {
      this.db.run(
        `INSERT INTO user_food_alias (input_key, replacement, source, created_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(input_key) DO UPDATE SET replacement = excluded.replacement, source = excluded.source`,
        [inputKey.toLowerCase(), replacement, source],
      );
    } catch {
      // Table may not exist if DB is from a fresh import that hasn't run P9 schema yet
    }
  }

  // ============================================================
  // Portion cache (user_portion_cache table)
  // ============================================================

  loadPortionCache(): Map<string, number> {
    const cache = new Map<string, number>();
    if (!this.db) return cache;
    try {
      const res = this.db.exec("SELECT food_query, unit, gram_weight FROM user_portion_cache");
      for (const row of rowsToObjects(res)) {
        const key = `${row.food_query}||${row.unit ?? "null"}`;
        cache.set(key, row.gram_weight as number);
      }
    } catch { /* table may not exist */ }
    return cache;
  }

  upsertPortionCache(entry: PortionCacheEntry): void {
    if (!this.db) return;
    try {
      this.db.run(
        `INSERT INTO user_portion_cache (food_query, unit, gram_weight, created_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(food_query, unit) DO UPDATE SET gram_weight = excluded.gram_weight`,
        [entry.foodQuery, entry.unit ?? null, entry.gramWeight],
      );
    } catch { /* table may not exist */ }
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}

// ============================================================
// Private helpers
// ============================================================

function rowsToObjects(res: Array<{ columns: string[]; values: unknown[][] }>): Record<string, unknown>[] {
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map(row => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

function buildFtsQuery(query: string, col: string): string {
  const clean = query.replace(/["()*^+:,./]/g, " ");
  const words = clean.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return query;
  const quoted = words.map(w => w.length > 3 ? `"${w}"*` : `"${w}"`).join(" ");
  return `${col} : ${quoted}`;
}

function rerank(matches: FoodMatch[], query: string): FoodMatch[] {
  const queryWords = new Set(query.toLowerCase().match(/\w+/g) ?? []);

  return [...matches].sort((a, b) => {
    const keyA = rankKey(a.name, queryWords);
    const keyB = rankKey(b.name, queryWords);
    if (keyA !== keyB) return keyA - keyB;
    return a.score - b.score;
  });
}

function rankKey(name: string, queryWords: Set<string>): number {
  const first = (name.toLowerCase().match(/\w+/) ?? [""])[0];
  const firstStem = first.length > 3 && first.endsWith("s") ? first.slice(0, -1) : first;
  return queryWords.has(first) || queryWords.has(firstStem) ? 0 : 1;
}
