/**
 * NutritionLabel — DOM renderer for nutrition data.
 *
 * Used by LookupView (full label) and in P4 by the hover tooltip (compact).
 * No Obsidian dependencies; renders into any HTMLElement.
 */

import { NutrientRow } from "./types";
import { LookupService, LabelSection, formatValue } from "./LookupService";

export interface LabelOptions {
  compact?: boolean;   // true = top-5 nutrients only, no section headers
  perGrams?: number;   // gram amount for header display (e.g. "per 100 g")
}

export class NutritionLabel {
  private svc: LookupService;

  constructor(svc: LookupService) {
    this.svc = svc;
  }

  /** Render a full grouped nutrition label into container. */
  render(
    container: HTMLElement,
    nutrients: NutrientRow[],
    options: LabelOptions = {},
  ): void {
    container.empty();

    if (!nutrients.length) {
      container.createEl("p", { cls: "eat-well-empty", text: "No nutrition data." });
      return;
    }

    const wrap = container.createEl("div", { cls: "eat-well-label" });

    if (options.compact) {
      this.renderCompact(wrap, nutrients);
      return;
    }

    const sections = this.svc.groupBySections(nutrients);
    for (const section of sections) {
      this.renderSection(wrap, section);
    }
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private renderSection(wrap: HTMLElement, section: LabelSection): void {
    wrap.createEl("div", { cls: "eat-well-label-section", text: section.name });
    for (const row of section.rows) {
      this.renderRow(wrap, row);
    }
  }

  private renderRow(wrap: HTMLElement, row: NutrientRow): void {
    // Indent rows that look like sub-nutrients (saturated fat, fibre, sugars, etc.)
    const indentKeywords = [
      "saturated", "monounsaturated", "polyunsaturated", "trans",
      "fiber", "fibre", "sugars", "sugar",
    ];
    const isIndented = indentKeywords.some(kw =>
      row.name.toLowerCase().includes(kw)
    );

    const rowEl = wrap.createEl("div", {
      cls: `eat-well-label-row${isIndented ? " indented" : ""}`,
    });
    rowEl.createEl("span", { cls: "eat-well-label-name", text: row.name });
    rowEl.createEl("span", {
      cls: "eat-well-label-value",
      text: formatValue(row.value, row.unit),
    });
  }

  private renderCompact(wrap: HTMLElement, nutrients: NutrientRow[]): void {
    // Key nutrients by sr_nbr: energy kcal (208), protein (203), fat (204), carbs (205/205.1), fibre (291)
    const KEY_SNBRS = [208, 203, 204, 205, 291];
    const keyRows = KEY_SNBRS
      .map(nbr => nutrients.find(n => n.srNbr === nbr))
      .filter((n): n is NutrientRow => n !== undefined);

    // Fallback: just take the first 5
    const rows = keyRows.length >= 3 ? keyRows : nutrients.slice(0, 5);

    for (const row of rows) {
      this.renderRow(wrap, row);
    }
  }
}
