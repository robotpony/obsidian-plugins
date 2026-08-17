// Minimal stub of the Obsidian API used in imports by files under test.
// Only exports what's needed to satisfy TypeScript imports — no implementation.
// Individual test files still `vi.mock("obsidian", ...)` to supply real mock
// behaviour; this stub exists so Vite can resolve the "obsidian" specifier at
// all (the real npm package ships only .d.ts files, no runtime module).
export class App {}
export class ItemView {}
export class Menu {}
export class TFile {}
export class WorkspaceLeaf {}
