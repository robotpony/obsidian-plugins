/**
 * ResolutionService — resolves gram weights for parsed ingredients.
 *
 * Wraps the resolveGrams function from IngredientParser with DB portions
 * and user data, so callers (RecipeService) don't have to assemble the
 * resolution context themselves.
 */

import { DatabaseService } from "./DatabaseService";
import { UserDataService } from "./UserDataService";
import { ParsedIngredient } from "./types";
import { resolveGrams as resolveFromParser } from "./IngredientParser";

export class ResolutionService {
  constructor(
    private db: DatabaseService,
    private userData: UserDataService,
  ) {}

  /**
   * Resolve gram weight for a parsed ingredient + food ID.
   * Returns [grams, warningOrNull].
   * Lookup chain: direct metric → food_portion DB → user cache → food weight
   * reference → piece estimates → 1 g fallback.
   */
  resolveGrams(parsed: ParsedIngredient, foodId: number): [number, string | null] {
    const portions = this.db.getPortions(foodId);
    const userCache = this.db.loadPortionCache();
    return resolveFromParser(
      parsed.amount,
      parsed.unit,
      portions,
      parsed.foodQuery,
      this.userData.foodWeights,
      userCache,
    );
  }
}
