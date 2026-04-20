/**
 * RecipeView — recipe evaluation sub-component.
 *
 * Renders into a container element provided by LookupView (not a standalone
 * Obsidian ItemView). Reads the active note, parses ingredient lines, and
 * displays aggregate nutrition with per-ingredient detail on click.
 */

import { App, TFile } from "obsidian";
import { RecipeService } from "./RecipeService";
import { NutritionLabel } from "./NutritionLabel";
import { IngredientResult, RecipeResult } from "./types";

const STATUS_ICON: Record<string, string> = {
  ok:   "✓",
  warn: "~",
  fail: "✗",
  est:  "≈",
};

export class RecipeView {
  private lang: "en" | "fr";
  private servings = 1;
  private result: RecipeResult | null = null;
  private expandedIdx = -1;

  // DOM refs (set during render, valid as long as the panel is mounted)
  private servingsEl: HTMLInputElement | null = null;
  private evalBtn: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private aggSectionEl: HTMLElement | null = null;
  private aggHeaderEl: HTMLElement | null = null;
  private aggEl: HTMLElement | null = null;

  constructor(
    private app: App,
    private recipeSvc: RecipeService,
    private label: NutritionLabel,
    lang: "en" | "fr",
  ) {
    this.lang = lang;
  }

  /** (Re-)render the entire panel into container. */
  render(container: HTMLElement): void {
    container.empty();
    this.renderControls(container);

    this.statusEl = container.createEl("div", {
      cls: "eat-well-recipe-status",
      attr: { style: "display:none" },
    });

    const scrollEl = container.createEl("div", { cls: "eat-well-recipe-scroll" });

    this.listEl = scrollEl.createEl("div", { cls: "eat-well-ingredients" });

    this.aggSectionEl = scrollEl.createEl("div", {
      cls: "eat-well-agg-section",
      attr: { style: "display:none" },
    });
    this.aggHeaderEl = this.aggSectionEl.createEl("div", { cls: "eat-well-agg-header" });
    this.aggEl = this.aggSectionEl.createEl("div", { cls: "eat-well-agg-label" });

    this.populateIngredients();
  }

  setLang(lang: "en" | "fr"): void {
    this.lang = lang;
    // Previous results remain displayed; user must re-evaluate for new language
  }

  // ============================================================
  // Controls
  // ============================================================

  private renderControls(container: HTMLElement): void {
    const ctrl = container.createEl("div", { cls: "eat-well-recipe-controls" });

    ctrl.createEl("span", { cls: "eat-well-servings-label", text: "Servings" });

    this.servingsEl = ctrl.createEl("input", {
      cls: "eat-well-servings-input",
      attr: { type: "number", min: "1", value: String(this.servings) },
    }) as HTMLInputElement;

    this.servingsEl.addEventListener("change", () => {
      const n = parseInt(this.servingsEl!.value);
      if (!isNaN(n) && n >= 1) this.servings = n;
    });

    this.evalBtn = ctrl.createEl("button", {
      cls: "eat-well-eval-btn",
      text: "Evaluate active note",
    });

    this.evalBtn.addEventListener("click", () => void this.evaluate());
  }

  // ============================================================
  // Ingredient list
  // ============================================================

  private populateIngredients(): void {
    if (!this.listEl) return;
    this.listEl.empty();

    if (!this.result) {
      this.listEl.createEl("p", {
        cls: "eat-well-empty",
        text: "Click 'Evaluate active note' to analyse ingredients.",
      });
      return;
    }

    if (!this.result.lines.length) {
      this.listEl.createEl("p", { cls: "eat-well-empty", text: "No ingredient lines found." });
      return;
    }

    for (let i = 0; i < this.result.lines.length; i++) {
      this.renderIngRow(this.listEl, this.result.lines[i], i, i === this.expandedIdx);
    }
  }

  private renderIngRow(
    container: HTMLElement,
    r: IngredientResult,
    idx: number,
    expanded: boolean,
  ): void {
    const status = this.ingStatus(r);
    const row = container.createEl("div", {
      cls: `eat-well-ing-row${expanded ? " expanded" : ""}`,
    });

    row.createEl("span", {
      cls: `eat-well-ing-status status-${status}`,
      text: STATUS_ICON[status],
    });

    const content = row.createEl("div", { cls: "eat-well-ing-content" });
    content.createEl("div", { cls: "eat-well-ing-raw", text: r.raw });

    if (r.match) {
      const gStr = r.gramWeight ? ` · ${r.gramWeight.toFixed(0)} g` : "";
      content.createEl("div", { cls: "eat-well-ing-detail", text: r.match.name + gStr });
    } else if (r.warning) {
      content.createEl("div", {
        cls: "eat-well-ing-detail eat-well-ing-warn",
        text: r.warning,
      });
    }

    row.addEventListener("click", () => this.toggleRow(idx));

    // Inline expanded compact label
    if (expanded && r.scaledNutrients.length) {
      const labelEl = container.createEl("div", { cls: "eat-well-ing-label" });
      this.label.render(labelEl, r.scaledNutrients, { compact: true });
    }
  }

  // ============================================================
  // Aggregate label
  // ============================================================

  private refreshAgg(): void {
    if (!this.aggSectionEl) return;

    if (!this.result?.aggregated.length) {
      this.aggSectionEl.style.display = "none";
      return;
    }

    const matched = this.result.lines.filter(r => r.match !== null).length;
    const total = this.result.lines.length;
    const perServing = this.result.servings > 1 ? ", per serving" : "";
    const headerText = `Totals (${matched}/${total} matched${perServing})`;

    if (this.aggHeaderEl) this.aggHeaderEl.textContent = headerText;
    if (this.aggEl) this.label.render(this.aggEl, this.result.aggregated);

    this.aggSectionEl.style.display = "";
  }

  // ============================================================
  // Actions
  // ============================================================

  private async evaluate(): Promise<void> {
    const file = this.app.workspace.getActiveFile() as TFile | null;
    if (!file) {
      this.showStatus("No active note.");
      return;
    }

    if (this.evalBtn) (this.evalBtn as HTMLButtonElement).disabled = true;
    this.showStatus("Evaluating…");

    try {
      const content = await this.app.vault.read(file);
      const lines = this.recipeSvc.parseNoteIngredients(content);

      if (!lines.length) {
        this.showStatus("No ingredient lines found in this note.");
        return;
      }

      this.result = this.recipeSvc.evaluateLines(lines, this.lang, this.servings);
      this.expandedIdx = -1;
      this.hideStatus();
      this.populateIngredients();
      this.refreshAgg();
    } catch (e) {
      this.showStatus(`Error: ${String(e)}`);
    } finally {
      if (this.evalBtn) (this.evalBtn as HTMLButtonElement).disabled = false;
    }
  }

  private toggleRow(idx: number): void {
    this.expandedIdx = this.expandedIdx === idx ? -1 : idx;
    this.populateIngredients();
  }

  private showStatus(msg: string): void {
    if (this.statusEl) {
      this.statusEl.textContent = msg;
      this.statusEl.style.display = "";
    }
  }

  private hideStatus(): void {
    if (this.statusEl) {
      this.statusEl.style.display = "none";
      this.statusEl.textContent = "";
    }
  }

  private ingStatus(r: IngredientResult): "ok" | "warn" | "fail" | "est" {
    if (!r.match) return "fail";
    if (!r.warning) return "ok";
    if (r.warning.toLowerCase().includes("taste")) return "est";
    return "warn";
  }
}
