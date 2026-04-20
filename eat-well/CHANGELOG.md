# Changelog

## 0.3.0 — 2026-04-06

P3: Recipe evaluation.

- `ResolutionService`: wraps gram-resolution logic from `IngredientParser` with DB portions + user cache; single `resolveGrams(parsed, foodId)` call for callers
- `RecipeService`: `parseNoteIngredients()` extracts ingredient lines from Markdown (skips headers, code blocks, YAML frontmatter, todos, tables, HTML); `evaluateLines()` parses + matches + resolves + scales per servings; `aggregateNutrients()` sums across all ingredients by sr_nbr
- `RecipeView`: sub-component (not ItemView) rendered inside LookupView; servings input + "Evaluate active note" button; ingredient list with ✓/~/✗/≈ status icons; click-to-expand compact per-ingredient label; aggregate totals section
- `LookupView`: tab bar (Lookup | Recipe) switching between panels; both panels co-exist as hidden/visible flex columns; language change propagated to RecipeView
- `LookupService`: added `getNutrientsAt(foodId, grams)` for RecipeService use
- `main.ts`: ResolutionService and RecipeService instantiated and wired; RecipeView created per leaf
- `styles.css`: tab bar, recipe panel controls, ingredient rows + status icons, expanded label, aggregate section
- `tsconfig.json`: added `resolveJsonModule`, `ES2021` lib target (enables `replaceAll`); fixes pre-existing build errors
- 141 tests (38 new: 10 in `resolution.test.ts`, 28 in `recipe.test.ts`)

## 0.2.0 — 2026-04-05

P2: Lookup sidebar.

- `LookupService`: thin wrapper over DatabaseService; `search()`, `scaleNutrients()`, `groupBySections()`; `formatValue()` for nutrient display
- `NutritionLabel`: DOM renderer grouping nutrients into Energy / Macros / Minerals / Vitamins sections; compact mode for P4 hover tooltip
- `LookupView`: full sidebar panel with search input, per-grams control, results list with status dots, food header, and nutrition label; EN/FR toggle in kebab menu
- `main.ts`: registers LookupView, activates sidebar on layout ready, adds `open-lookup` command and ribbon icon
- `styles.css`: search row, per-grams input, results list, status dots, food header, label wrap
- 103 tests (20 new in `lookup.test.ts`)

## 0.1.0 — 2026-04-03

Initial release (P1).

- Plugin scaffold with manifest, esbuild, vitest, TypeScript config
- `DatabaseService`: loads `ew.db` via sql.js WASM; emits `db-ready` / `db-error`
- `IngredientParser`: full port of `ew/parser.py` — parses ingredient lines into amount, unit, food query; handles Unicode fractions, compact units, parenthetical amounts, to-taste defaults, food aliases, preparation adjective stripping
- `UserDataService`: loads bundled JSON defaults merged with user overrides from plugin directory
- Bundled reference data: `aliases.json`, `food_weights.json`, `taste_defaults.json`
- Settings tab: DB path, language, hover tooltip toggle, hover delay
- `Mod+Shift+E` command registered (sidebar toggle, view registered in P2)
- 66 unit tests covering parser and user data merge logic
