/**
 * LookupView — tabbed sidebar panel (Lookup | Recipe).
 *
 * Lookup tab: food search and nutrition label display.
 * Recipe tab: evaluate active note ingredients with aggregate nutrition.
 *
 * Layout (follows plugin-conventions.md):
 *   Header: logo + title + [refresh] [menu]
 *   Tab bar: Lookup | Recipe
 *   Panel (Lookup): search row + per row + results list + label
 *   Panel (Recipe): delegated to RecipeView sub-component
 */

import { ItemView, Menu, WorkspaceLeaf, setIcon } from "obsidian";
import { LookupService, LookupResult } from "./LookupService";
import { NutritionLabel } from "./NutritionLabel";
import { RecipeView } from "./RecipeView";
import { FoodMatch } from "./types";

export const VIEW_TYPE_LOOKUP = "eat-well-sidebar";

const LOGO_TEXT = "E⌘";

export class LookupView extends ItemView {
  private svc: LookupService;
  private label: NutritionLabel;
  private recipeView: RecipeView;
  private lang: "en" | "fr";
  private onLangChange: (lang: "en" | "fr") => void;

  // Tab state
  private activeTab: "lookup" | "recipe" = "lookup";
  private lookupPanelEl: HTMLElement | null = null;
  private recipePanelEl: HTMLElement | null = null;
  private tabEls: { lookup: HTMLElement; recipe: HTMLElement } | null = null;

  // Lookup state
  private query = "";
  private perGrams = 100;
  private results: FoodMatch[] = [];
  private selectedIdx = -1;
  private currentResult: LookupResult | null = null;

  // Lookup DOM refs
  private inputEl: HTMLInputElement | null = null;
  private perEl: HTMLInputElement | null = null;
  private resultsEl: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    svc: LookupService,
    label: NutritionLabel,
    recipeView: RecipeView,
    lang: "en" | "fr",
    onLangChange: (lang: "en" | "fr") => void,
  ) {
    super(leaf);
    this.svc = svc;
    this.label = label;
    this.recipeView = recipeView;
    this.lang = lang;
    this.onLangChange = onLangChange;
  }

  getViewType(): string { return VIEW_TYPE_LOOKUP; }
  getDisplayText(): string { return "Eat Well"; }
  getIcon(): string { return "salad"; }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {
    // nothing to clean up
  }

  render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("eat-well-sidebar");

    this.renderHeader(container);
    this.renderTabBar(container);

    this.lookupPanelEl = container.createEl("div", { cls: "eat-well-lookup-panel" });
    this.recipePanelEl = container.createEl("div", { cls: "eat-well-recipe-panel" });

    this.renderSearch(this.lookupPanelEl);
    this.renderResults(this.lookupPanelEl);
    this.renderLabel(this.lookupPanelEl);
    this.recipeView.render(this.recipePanelEl);

    this.activateTab(this.activeTab);

    // Restore prior lookup state
    if (this.query && this.inputEl) this.inputEl.value = this.query;
    if (this.perGrams !== 100 && this.perEl) this.perEl.value = String(this.perGrams);
  }

  // ============================================================
  // Header
  // ============================================================

  private renderHeader(container: HTMLElement): void {
    const header = container.createEl("div", { cls: "eat-well-header" });

    const titleEl = header.createEl("div", { cls: "eat-well-header-title" });
    const logo = titleEl.createEl("span", {
      cls: "eat-well-logo clickable-logo",
      text: LOGO_TEXT,
    });
    logo.addEventListener("click", () => this.showAbout());
    titleEl.createEl("h4", { text: "Eat Well" });

    const btnGroup = header.createEl("div", { cls: "eat-well-button-group" });

    const refreshBtn = btnGroup.createEl("button", {
      cls: "clickable-icon eat-well-btn",
      attr: { "aria-label": "Refresh" },
    });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.addEventListener("click", () => this.doSearch());

    const menuBtn = btnGroup.createEl("button", {
      cls: "clickable-icon eat-well-btn",
      attr: { "aria-label": "Menu" },
    });
    setIcon(menuBtn, "more-vertical");
    menuBtn.addEventListener("click", (e) => this.showMenu(e as MouseEvent));
  }

  // ============================================================
  // Tab bar
  // ============================================================

  private renderTabBar(container: HTMLElement): void {
    const bar = container.createEl("div", { cls: "eat-well-tab-bar" });
    const lookupTab = bar.createEl("button", { cls: "eat-well-tab", text: "Lookup" });
    const recipeTab = bar.createEl("button", { cls: "eat-well-tab", text: "Recipe" });
    this.tabEls = { lookup: lookupTab, recipe: recipeTab };
    lookupTab.addEventListener("click", () => this.activateTab("lookup"));
    recipeTab.addEventListener("click", () => this.activateTab("recipe"));
  }

  private activateTab(tab: "lookup" | "recipe"): void {
    this.activeTab = tab;
    if (this.lookupPanelEl) this.lookupPanelEl.style.display = tab === "lookup" ? "" : "none";
    if (this.recipePanelEl) this.recipePanelEl.style.display = tab === "recipe" ? "" : "none";
    if (this.tabEls) {
      this.tabEls.lookup.classList.toggle("active", tab === "lookup");
      this.tabEls.recipe.classList.toggle("active", tab === "recipe");
    }
  }

  // ============================================================
  // Lookup panel — search area
  // ============================================================

  private renderSearch(container: HTMLElement): void {
    const searchWrap = container.createEl("div", { cls: "eat-well-search-wrap" });

    const row = searchWrap.createEl("div", { cls: "eat-well-search-row" });

    this.inputEl = row.createEl("input", {
      cls: "eat-well-search-input",
      attr: { type: "text", placeholder: "Search foods…", value: this.query },
    }) as HTMLInputElement;

    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.doSearch();
    });

    const searchBtn = row.createEl("button", {
      cls: "eat-well-search-btn",
      text: "Search",
    });
    searchBtn.addEventListener("click", () => this.doSearch());

    // Per-grams row
    const perRow = searchWrap.createEl("div", { cls: "eat-well-per-row" });
    perRow.createEl("span", { cls: "eat-well-per-label", text: "Per" });
    this.perEl = perRow.createEl("input", {
      cls: "eat-well-per-input",
      attr: { type: "number", min: "1", value: String(this.perGrams) },
    }) as HTMLInputElement;
    perRow.createEl("span", { cls: "eat-well-per-unit", text: "g" });

    this.perEl.addEventListener("change", () => {
      const n = parseInt(this.perEl!.value);
      if (!isNaN(n) && n > 0) {
        this.perGrams = n;
        this.refreshLabel();
      }
    });
  }

  // ============================================================
  // Lookup panel — results list
  // ============================================================

  private renderResults(container: HTMLElement): void {
    this.resultsEl = container.createEl("div", { cls: "eat-well-results" });
    this.populateResults();
  }

  private populateResults(): void {
    if (!this.resultsEl) return;
    this.resultsEl.empty();

    if (!this.results.length) return;

    for (let i = 0; i < this.results.length; i++) {
      const match = this.results[i];
      const isSelected = i === this.selectedIdx;
      this.renderResultRow(this.resultsEl, match, i, isSelected);
    }
  }

  private renderResultRow(
    container: HTMLElement,
    match: FoodMatch,
    idx: number,
    isSelected: boolean,
  ): void {
    const row = container.createEl("div", {
      cls: `eat-well-result-row${isSelected ? " selected" : ""}`,
    });

    const dot = row.createEl("div", {
      cls: `eat-well-status-dot${isSelected ? " status-selected" : " status-neutral"}`,
    });
    void dot;

    const content = row.createEl("div", { cls: "eat-well-result-content" });
    content.createEl("span", { cls: "eat-well-result-name", text: match.name });
    content.createEl("span", {
      cls: "eat-well-result-source",
      text: shortSource(match.sourceCode),
    });

    row.addEventListener("click", () => this.selectResult(idx));
  }

  // ============================================================
  // Lookup panel — nutrition label area
  // ============================================================

  private renderLabel(container: HTMLElement): void {
    this.labelEl = container.createEl("div", { cls: "eat-well-label-wrap" });

    if (!this.currentResult) {
      if (this.results.length === 0 && this.query) {
        this.labelEl.createEl("p", { cls: "eat-well-empty", text: "No results." });
      }
      return;
    }

    const { match, nutrients, portions } = this.currentResult;
    const scaled = this.svc.scaleNutrients(nutrients, this.perGrams);

    const foodHeader = this.labelEl.createEl("div", { cls: "eat-well-food-header" });
    foodHeader.createEl("div", { cls: "eat-well-food-name", text: match.name });
    foodHeader.createEl("div", { cls: "eat-well-food-source", text: match.sourceName });

    const firstPortion = portions[0];
    const perLabel = this.perGrams === 100
      ? (firstPortion ? `${firstPortion.measureEn} (${firstPortion.gramWeight} g)` : "per 100 g")
      : `per ${this.perGrams} g`;
    foodHeader.createEl("div", { cls: "eat-well-food-per", text: perLabel });

    this.label.render(this.labelEl, scaled);
  }

  private refreshLabel(): void {
    if (!this.labelEl) return;
    this.labelEl.empty();

    if (!this.currentResult) return;

    const { match, nutrients, portions } = this.currentResult;
    const scaled = this.svc.scaleNutrients(nutrients, this.perGrams);

    const foodHeader = this.labelEl.createEl("div", { cls: "eat-well-food-header" });
    foodHeader.createEl("div", { cls: "eat-well-food-name", text: match.name });
    foodHeader.createEl("div", { cls: "eat-well-food-source", text: match.sourceName });

    const firstPortion = portions[0];
    const perLabel = this.perGrams === 100
      ? (firstPortion ? `${firstPortion.measureEn} (${firstPortion.gramWeight} g)` : "per 100 g")
      : `per ${this.perGrams} g`;
    foodHeader.createEl("div", { cls: "eat-well-food-per", text: perLabel });

    this.label.render(this.labelEl, scaled);
  }

  // ============================================================
  // Lookup actions
  // ============================================================

  private doSearch(): void {
    if (!this.inputEl) return;
    this.query = this.inputEl.value.trim();
    if (!this.query) return;

    this.results = this.svc.search(this.query, this.lang);
    this.selectedIdx = this.results.length > 0 ? 0 : -1;
    this.currentResult = this.selectedIdx >= 0
      ? this.svc.getResult(this.results[0])
      : null;

    this.populateResults();
    if (this.labelEl) {
      this.labelEl.empty();
      if (this.currentResult) this.refreshLabel();
      else if (!this.results.length) {
        this.labelEl.createEl("p", { cls: "eat-well-empty", text: "No results." });
      }
    }
  }

  private selectResult(idx: number): void {
    this.selectedIdx = idx;
    this.currentResult = this.svc.getResult(this.results[idx]);
    this.populateResults();
    if (this.labelEl) {
      this.labelEl.empty();
      this.refreshLabel();
    }
  }

  private showMenu(e: MouseEvent): void {
    const menu = new Menu();

    menu.addItem(item => item
      .setTitle(this.lang === "en" ? "Switch to French (FR)" : "Switch to English (EN)")
      .setIcon("languages")
      .onClick(() => {
        this.lang = this.lang === "en" ? "fr" : "en";
        this.onLangChange(this.lang);
        this.recipeView.setLang(this.lang);
        if (this.query) this.doSearch();
      })
    );

    menu.addSeparator();

    menu.addItem(item => item
      .setTitle("Refresh")
      .setIcon("refresh-cw")
      .onClick(() => this.doSearch())
    );

    menu.addItem(item => item
      .setTitle("About")
      .setIcon("info")
      .onClick(() => this.showAbout())
    );

    menu.showAtMouseEvent(e);
  }

  private showAbout(): void {
    // eslint-disable-next-line no-console
    console.log("Eat Well — nutrition lookup plugin");
  }

  // Allow external code (e.g. a command) to pre-fill the search
  setQuery(query: string): void {
    this.query = query;
    if (this.inputEl) this.inputEl.value = query;
    this.doSearch();
  }
}

// ============================================================
// Helpers
// ============================================================

function shortSource(code: string): string {
  switch (code) {
    case "usda_sr_legacy":   return "USDA SR";
    case "usda_foundation":  return "USDA";
    case "usda_survey":      return "USDA Survey";
    case "cnf":              return "CNF";
    default:                 return code.toUpperCase();
  }
}
