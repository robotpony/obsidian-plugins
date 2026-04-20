/**
 * RecipeService — note parsing and nutrition aggregation for recipe evaluation.
 *
 * Port of ew/recipe.py aggregate logic, extended with Markdown note parsing
 * and a full ingredient evaluation pipeline.
 */

import { parseIngredient } from "./IngredientParser";
import { LookupService } from "./LookupService";
import { ResolutionService } from "./ResolutionService";
import { UserDataService } from "./UserDataService";
import { IngredientResult, NutrientRow, RecipeResult } from "./types";

export class RecipeService {
  constructor(
    private lookup: LookupService,
    private resolution: ResolutionService,
    private userData: UserDataService,
  ) {}

  /**
   * Extract ingredient-like lines from Markdown content.
   * Skips: headers, code blocks, YAML frontmatter, blank lines,
   * HTML tags, todo items, and table rows.
   * Strips list/blockquote prefixes before returning bare text.
   */
  parseNoteIngredients(content: string): string[] {
    const lines = content.split("\n");
    const results: string[] = [];
    let inCode = false;
    let inFrontmatter = false;
    let lineNum = 0;

    for (const line of lines) {
      lineNum++;
      const trimmed = line.trim();

      // YAML frontmatter delimited by --- on line 1
      if (lineNum === 1 && trimmed === "---") { inFrontmatter = true; continue; }
      if (inFrontmatter) {
        if (trimmed === "---" || trimmed === "...") inFrontmatter = false;
        continue;
      }

      // Code fences
      if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
        inCode = !inCode;
        continue;
      }
      if (inCode) continue;

      if (!trimmed) continue;
      if (trimmed.startsWith("#")) continue;                  // headings
      if (trimmed.startsWith("|")) continue;                  // tables
      if (trimmed.startsWith("<")) continue;                  // HTML
      if (/^[-*+]\s+\[[ xX]\]/.test(trimmed)) continue;      // todo items

      // Strip list and blockquote markers to get bare ingredient text
      const bare = trimmed.replace(/^[-*+]\s+|^\d+\.\s+|^(>\s*)+/, "").trim();
      if (bare) results.push(bare);
    }

    return results;
  }

  /**
   * Evaluate a list of ingredient lines, returning resolved nutrients.
   * If servings > 1, aggregated values are divided by servings.
   */
  evaluateLines(lines: string[], lang: "en" | "fr" = "en", servings = 1): RecipeResult {
    const results: IngredientResult[] = [];

    for (const raw of lines) {
      const parsed = parseIngredient(raw, this.userData.aliases, this.userData.tasteDefaults);

      if (!parsed) {
        results.push({ raw, parsed: null, match: null, gramWeight: 0, scaledNutrients: [], warning: "could not parse" });
        continue;
      }

      const matches = this.lookup.search(parsed.foodQuery, lang, 1);
      if (!matches.length) {
        results.push({ raw, parsed, match: null, gramWeight: 0, scaledNutrients: [], warning: "no match found" });
        continue;
      }

      const match = matches[0];
      const [grams, resolveWarning] = this.resolution.resolveGrams(parsed, match.foodId);
      const scaledNutrients = this.lookup.getNutrientsAt(match.foodId, grams);

      results.push({
        raw,
        parsed,
        match,
        gramWeight: grams,
        scaledNutrients,
        warning: parsed.note ?? resolveWarning,
      });
    }

    const aggregated = this.aggregateNutrients(results);
    const perServing = servings > 1
      ? aggregated.map(n => ({ ...n, value: n.value / servings }))
      : aggregated;

    const totalGrams = results.reduce((s, r) => s + r.gramWeight, 0);
    return { lines: results, aggregated: perServing, totalGrams, servings };
  }

  /** Sum nutrients across all matched ingredients, sorted by rank. */
  aggregateNutrients(results: IngredientResult[]): NutrientRow[] {
    const totals = new Map<number, NutrientRow>();

    for (const result of results) {
      for (const n of result.scaledNutrients) {
        const existing = totals.get(n.srNbr);
        if (existing) {
          existing.value += n.value;
        } else {
          totals.set(n.srNbr, { ...n });
        }
      }
    }

    return [...totals.values()].sort((a, b) => a.rank - b.rank);
  }
}
