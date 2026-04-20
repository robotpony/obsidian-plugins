# CLAUDE.md — Eat Well Obsidian Plugin

## Project Overview

Standalone Obsidian desktop plugin for nutrition lookup and recipe evaluation. Ports the eat-well CLI logic (Python) to TypeScript, using sql.js to read the same `ew.db` SQLite database in-process.

Plugin conventions reference: `/Users/mx/writing/obsidian-plugins/plugin-conventions.md`
Architecture and design: `/Users/mx/projects/eat-well/obsidian-plugin/`
Python source: `/Users/mx/projects/eat-well/ew/`

## Identity

| Setting | Value |
| --- | --- |
| Plugin ID | `eat-well` |
| Display name | Eat Well |
| Logo text | `E⌘` |
| Brand colour | `#c0392b` |
| Hotkey | `Mod+Shift+E` |
| `isDesktopOnly` | `true` |

## Build

```bash
npm install
npm run build        # outputs main.js
npm test             # vitest unit tests
./install.sh         # build + copy to vault(s)
./install.sh -p      # use previously-selected vaults
```

## ew.db

`ew.db` is not in git (77 MB). Place it in the plugin directory before running `install.sh`. Download from GitHub releases or copy from `~/projects/eat-well/work/ew.db`.

## Key Decisions

- **sql.js over better-sqlite3**: pure WASM, no native binary compilation against Electron
- **ew.db loaded into RAM**: ~150 MB working set; fine for desktop, defers mobile to post-v1
- **User data as JSON in plugin dir**: travels with vault sync
- **No Python dependency**: all logic ported to TypeScript

## Phase Status

- [x] P1 — Scaffold, DatabaseService, IngredientParser, UserDataService, types, tests
- [ ] P2 — LookupView sidebar
- [ ] P3 — RecipeView + RecipeService
- [ ] P4 — Hover tooltip
- [ ] P5 — User data management UI + LLM fallback

## File Layout

```
eat-well/
├── main.ts              # Plugin class + inline SettingTab
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── vitest.config.mjs
├── styles.css
├── install.sh
├── CLAUDE.md
└── src/
    ├── types.ts
    ├── DatabaseService.ts
    ├── IngredientParser.ts
    ├── UserDataService.ts
    ├── data/
    │   ├── aliases.json
    │   ├── food_weights.json
    │   └── taste_defaults.json
    └── __tests__/
        ├── stubs/
        │   ├── obsidian.ts
        │   └── shared.ts
        ├── parser.test.ts
        └── userData.test.ts
```

## Porting Python → TypeScript

| Python | TypeScript | Status |
| --- | --- | --- |
| `ew/parser.py` | `src/IngredientParser.ts` | Done (P1) |
| `ew/resolution.py` (gram resolution) | `src/IngredientParser.ts` (resolveGrams) | Done (P1) |
| `ew/lookup.py` | `src/DatabaseService.ts` (searchFoods) | Done (P1) |
| `ew/recipe.py` | `src/RecipeService.ts` | P3 |
