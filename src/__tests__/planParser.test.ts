import { describe, it, expect } from "vitest";
import { parsePlan, MAX_OPEN_LINES } from "../PlanParser";

describe("parsePlan", () => {
  it("returns null for empty or whitespace-only content", () => {
    expect(parsePlan("")).toBeNull();
    expect(parsePlan("   \n\n\t")).toBeNull();
  });

  it("summarizes a phased checklist, phases = ## sections with checkboxes", () => {
    const content = [
      "# Plan",
      "",
      "## Phase 1: Setup",
      "- [x] Init repo",
      "- [x] Add deps",
      "",
      "## Phase 2: Parser",
      "- [x] Lexer",
      "- [ ] Builder",
      "- [ ] Tests",
      "",
      "## Phase 3: Export",
      "- [ ] Renderer",
      "",
      "## Open questions",
      "- Retention policy is undecided.",
    ].join("\n");

    const s = parsePlan(content)!;
    expect(s.hasCheckboxes).toBe(true);
    expect(s.phaseCount).toBe(3); // "Open questions" has no checkboxes, excluded
    expect(s.currentPhaseIndex).toBe(2);
    expect(s.currentPhaseHeading).toBe("Phase 2: Parser");
    expect(s.currentPhaseOpenLines).toEqual(["- [ ] Builder", "- [ ] Tests"]);
    expect(s.currentPhaseOpenCount).toBe(2);
    expect(s.doneCount).toBe(3);
    expect(s.totalCount).toBe(6);
  });

  it("folds ### sub-steps into their parent ## phase", () => {
    const content = [
      "# Plan",
      "## Phase 1: Foundation",
      "### 1.1 Project setup",
      "- [x] Cargo project",
      "### 1.2 Parser",
      "- [x] Splitter",
      "- [ ] Frontmatter",
      "## Phase 2: Rendering",
      "- [ ] Shape renderer",
    ].join("\n");

    const s = parsePlan(content)!;
    expect(s.phaseCount).toBe(2);
    expect(s.currentPhaseIndex).toBe(1);
    expect(s.currentPhaseHeading).toBe("Phase 1: Foundation");
    expect(s.currentPhaseOpenLines).toEqual(["- [ ] Frontmatter"]);
  });

  it("treats ### as the phase unit when there is no ## above it", () => {
    const content = [
      "# Plan",
      "### Alpha",
      "- [x] one",
      "### Beta",
      "- [ ] two",
    ].join("\n");

    const s = parsePlan(content)!;
    expect(s.phaseCount).toBe(2);
    expect(s.currentPhaseIndex).toBe(2);
    expect(s.currentPhaseHeading).toBe("Beta");
  });

  it("reports currentPhaseIndex 0 when every checkbox is checked", () => {
    const s = parsePlan("## Phase 1\n- [x] done\n## Phase 2\n- [x] also done\n")!;
    expect(s.currentPhaseIndex).toBe(0);
    expect(s.currentPhaseHeading).toBe("");
    expect(s.currentPhaseOpenLines).toEqual([]);
    expect(s.doneCount).toBe(2);
    expect(s.totalCount).toBe(2);
  });

  it("handles a narrative roadmap with no checkboxes", () => {
    const content = [
      "# Plan",
      "## Status",
      "First prototype built.",
      "## Next",
      "- Deploy target.",
      "- A second provider.",
      "## Open questions",
      "- Retention is unbounded.",
    ].join("\n");

    const s = parsePlan(content)!;
    expect(s.hasCheckboxes).toBe(false);
    expect(s.phaseCount).toBe(0);
    expect(s.currentPhaseIndex).toBe(0);
    expect(s.totalCount).toBe(0);
  });

  it("handles a bare idea dump", () => {
    const s = parsePlan("# Game ideas\n\n- A breakout variant\n- Scorched earth\n")!;
    expect(s).not.toBeNull();
    expect(s.hasCheckboxes).toBe(false);
    expect(s.phaseCount).toBe(0);
  });

  it("ignores checkboxes and headings inside fenced code blocks", () => {
    const content = [
      "# Plan",
      "## Phase 1",
      "- [ ] Real item",
      "",
      "```",
      "## Not a heading",
      "- [ ] Not an item",
      "```",
      "- [x] Another real item",
    ].join("\n");

    const s = parsePlan(content)!;
    expect(s.phaseCount).toBe(1);
    expect(s.totalCount).toBe(2);
    expect(s.doneCount).toBe(1);
    expect(s.currentPhaseOpenLines).toEqual(["- [ ] Real item"]);
  });

  it("accepts [X], * and + bullet markers", () => {
    const s = parsePlan("## Phase 1\n* [X] star done\n+ [ ] plus open\n")!;
    expect(s.doneCount).toBe(1);
    expect(s.totalCount).toBe(2);
    expect(s.currentPhaseOpenLines).toEqual(["+ [ ] plus open"]);
  });

  it("caps current-phase open lines at MAX_OPEN_LINES and reports the overflow", () => {
    const lines = ["## Phase 1"];
    for (let i = 0; i < MAX_OPEN_LINES + 5; i++) lines.push(`- [ ] item ${i}`);
    const s = parsePlan(lines.join("\n"))!;
    expect(s.currentPhaseOpenLines).toHaveLength(MAX_OPEN_LINES);
    expect(s.currentPhaseOpenCount).toBe(MAX_OPEN_LINES + 5);
  });

  it("counts checkboxes with no heading above them as file totals but no phase", () => {
    const s = parsePlan("- [x] loose one\n- [ ] loose two\n")!;
    expect(s.hasCheckboxes).toBe(true);
    expect(s.phaseCount).toBe(0);
    expect(s.currentPhaseIndex).toBe(0);
    expect(s.doneCount).toBe(1);
    expect(s.totalCount).toBe(2);
  });
});
