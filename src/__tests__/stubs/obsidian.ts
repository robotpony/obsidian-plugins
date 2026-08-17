// Minimal stub of the Obsidian API used in imports by files under test.
// Only exports what's needed to satisfy TypeScript imports — no implementation.
export class TFile {}
export class App {}
export class MarkdownView {}
export const moment = () => ({ format: () => "" });
export class Vault {}
export class WorkspaceLeaf {}
// ItemView needs to exist as a real constructor value for `class X extends
// ItemView` to evaluate (that happens at module load, not instantiation) —
// tested modules that extend it (e.g. ProjectsSidebarView.ts, for its
// standalone-function exports) only need the class to exist, not behave.
export class ItemView {}
export class Menu {}
export class Notice {}
export const setIcon = () => {};
