import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import { groupHandTypedItems } from "../ProjectsSidebarView";
import { TodoItem } from "../types";

// Bug found via live testing (see BUGS.md/PLAN.md): every scanned hand-typed
// item was rendered as an independent checkbox row, so a header TODO's own
// line ("### bugs #todo #obsidian-plugins") showed up as its own raw,
// uncleaned row on top of its children, which fell into an "Untitled
// section" bucket instead of grouping under the header. This fixture
// reproduces exactly that real note content.

const file = new TFile();

function fixture(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    file,
    filePath: "projects/obsidian-plugins.md",
    folder: "projects",
    lineNumber: 0,
    fingerprint: "",
    text: "",
    hasCheckbox: false,
    tags: [],
    dateCreated: 0,
    mentions: [],
    ...overrides,
  };
}

describe("groupHandTypedItems: header TODO with children", () => {
  const header = fixture({
    lineNumber: 10,
    text: "### bugs #todo #obsidian-plugins",
    isHeader: true,
    childLineNumbers: [11, 12, 13, 14],
    tags: ["#todo", "#obsidian-plugins"],
  });
  const children = [11, 12, 13, 14].map((lineNumber, i) =>
    fixture({
      lineNumber,
      parentLineNumber: 10,
      hasCheckbox: true,
      text: `- [ ] Bug number ${i + 1}`,
    })
  );

  it("does not render the header itself as a row", () => {
    const groups = groupHandTypedItems([header, ...children]);
    const allItemTexts = groups.flatMap((g) => g.items.map((i) => i.text));
    expect(allItemTexts).not.toContain(header.text);
  });

  it("groups all four children under one group labelled with the header's cleaned text", () => {
    const groups = groupHandTypedItems([header, ...children]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("bugs"); // cleaned of ### and both tags
    expect(groups[0].items).toHaveLength(4);
  });

  it("uses the header's own file/line for the group's source link, not 'Untitled section'", () => {
    const groups = groupHandTypedItems([header, ...children]);
    expect(groups[0].label).not.toMatch(/untitled/i);
    expect(groups[0].file).toBe(file);
    expect(groups[0].lineNumber).toBe(10);
  });
});

describe("groupHandTypedItems: true orphans (no parent header)", () => {
  it("groups orphan items by sectionLabel", () => {
    const items = [
      fixture({ lineNumber: 5, text: "Orphan A", sectionLabel: "Overview", sectionLineNumber: 3 }),
      fixture({ lineNumber: 6, text: "Orphan B", sectionLabel: "Overview", sectionLineNumber: 3 }),
    ];
    const groups = groupHandTypedItems(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Overview");
    expect(groups[0].lineNumber).toBe(3); // the section heading's line, not the item's own
    expect(groups[0].items).toHaveLength(2);
  });

  it("falls back to 'Notes' when an orphan has no sectionLabel at all", () => {
    const items = [fixture({ lineNumber: 5, text: "A bare item with no preceding heading" })];
    const groups = groupHandTypedItems(items);
    expect(groups[0].label).toBe("Notes");
  });
});

describe("groupHandTypedItems: mixed header + orphan items in the same note", () => {
  it("keeps header-children and orphan groups separate and correctly attributed", () => {
    const header = fixture({
      lineNumber: 1,
      text: "## Sprint tasks #todo",
      isHeader: true,
      childLineNumbers: [2],
    });
    const child = fixture({ lineNumber: 2, parentLineNumber: 1, text: "- [ ] Do the thing" });
    const orphan = fixture({ lineNumber: 8, text: "A note under Overview", sectionLabel: "Overview" });

    const groups = groupHandTypedItems([header, child, orphan]);

    expect(groups).toHaveLength(2);
    const sprintGroup = groups.find((g) => g.label === "Sprint tasks");
    const overviewGroup = groups.find((g) => g.label === "Overview");
    expect(sprintGroup?.items).toHaveLength(1);
    expect(overviewGroup?.items).toHaveLength(1);
  });
});

describe("groupHandTypedItems: empty input", () => {
  it("returns no groups for an empty item list", () => {
    expect(groupHandTypedItems([])).toEqual([]);
  });
});
