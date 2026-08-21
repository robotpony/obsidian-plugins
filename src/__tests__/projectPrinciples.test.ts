import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import { getProjectPrinciples, buildProjectPrincipleBlocks, stripPrincipleTag } from "../ProjectsSidebarView";
import { TodoItem } from "../types";

const file = new TFile();

function fixture(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    file,
    filePath: "projects/peep.md",
    folder: "projects",
    lineNumber: 0,
    fingerprint: "",
    text: "",
    hasCheckbox: false,
    tags: [],
    dateCreated: 0,
    mentions: [],
    itemType: "principle",
    ...overrides,
  };
}

describe("getProjectPrinciples: explicit tag / inferredFileTag matches", () => {
  it("includes an item explicitly tagged with the project's tag", () => {
    const item = fixture({ lineNumber: 1, text: "Ship small #principle #peep", tags: ["#principle", "#peep"] });
    expect(getProjectPrinciples("#peep", [item])).toEqual([item]);
  });

  it("includes an item whose inferredFileTag matches, with no explicit project tag", () => {
    const item = fixture({ lineNumber: 1, text: "Ship small #principle", tags: ["#principle"], inferredFileTag: "#peep" });
    expect(getProjectPrinciples("#peep", [item])).toEqual([item]);
  });

  it("excludes an item belonging to a different project", () => {
    const item = fixture({ lineNumber: 1, text: "Ship small #principle #other", tags: ["#principle", "#other"] });
    expect(getProjectPrinciples("#peep", [item])).toEqual([]);
  });
});

describe("getProjectPrinciples: #principles header block", () => {
  const header = fixture({
    lineNumber: 5,
    text: "## Guiding Principles #principles",
    isHeader: true,
    childLineNumbers: [6, 7],
    tags: ["#principles"],
    inferredFileTag: "#peep",
  });
  const children = [6, 7].map((lineNumber) =>
    fixture({ lineNumber, parentLineNumber: 5, text: `- Principle ${lineNumber}`, inferredFileTag: "#peep" })
  );

  it("includes a matched header's children even though the children carry no tag of their own", () => {
    const untaggedChildren = [
      fixture({ lineNumber: 6, parentLineNumber: 5, text: "- Principle 6" }),
      fixture({ lineNumber: 7, parentLineNumber: 5, text: "- Principle 7" }),
    ];
    const taggedHeader = fixture({
      lineNumber: 5,
      text: "## Guiding Principles #principles #peep",
      isHeader: true,
      childLineNumbers: [6, 7],
      tags: ["#principles", "#peep"],
    });
    const result = getProjectPrinciples("#peep", [taggedHeader, ...untaggedChildren]);
    expect(result).toHaveLength(3);
  });

  it("excludes children of a header that belongs to a different project", () => {
    const otherHeader = fixture({
      lineNumber: 5,
      text: "## Guiding Principles #principles",
      isHeader: true,
      childLineNumbers: [6],
      tags: ["#principles"],
      inferredFileTag: "#other-project",
    });
    const child = fixture({ lineNumber: 6, parentLineNumber: 5, text: "- Not ours" });
    expect(getProjectPrinciples("#peep", [otherHeader, child])).toEqual([]);
  });

  it("matches via inferredFileTag (the primary flow: principles declared in the project's own note)", () => {
    expect(getProjectPrinciples("#peep", [header, ...children])).toHaveLength(3);
  });
});

describe("stripPrincipleTag", () => {
  it("removes the marker tag and trailing whitespace it leaves behind", () => {
    expect(stripPrincipleTag("## Guiding principles #principles")).toBe("## Guiding principles");
  });

  it("removes #principle (singular) too", () => {
    expect(stripPrincipleTag("Ship small #principle")).toBe("Ship small");
  });

  it("leaves other tags, list markers, and numbering untouched", () => {
    expect(stripPrincipleTag("1. Users own their data #principle #peep")).toBe("1. Users own their data #peep");
  });
});

describe("buildProjectPrincipleBlocks: #principles header with children", () => {
  it("joins the header's own line with its children into one verbatim block, preserving the original list markup", () => {
    const header = fixture({
      lineNumber: 5,
      text: "## Guiding principles #principles",
      isHeader: true,
      childLineNumbers: [6, 7],
    });
    const children = [
      fixture({ lineNumber: 6, parentLineNumber: 5, text: "1. Users own their data and it lives in plain old text" }),
      fixture({ lineNumber: 7, parentLineNumber: 5, text: "2. Getting things done is a balance of priorities and focus" }),
    ];
    const blocks = buildProjectPrincipleBlocks([header, ...children]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].markdown).toBe(
      [
        "## Guiding principles",
        "1. Users own their data and it lives in plain old text",
        "2. Getting things done is a balance of priorities and focus",
      ].join("\n")
    );
  });

  it("omits a header from the blocks entirely when it has no matched children", () => {
    const header = fixture({
      lineNumber: 5,
      text: "## Guiding Principles #principles",
      isHeader: true,
      childLineNumbers: [],
    });
    expect(buildProjectPrincipleBlocks([header])).toEqual([]);
  });
});

describe("buildProjectPrincipleBlocks: standalone items", () => {
  it("gives each standalone item its own one-line block, tag stripped", () => {
    const items = [
      fixture({ lineNumber: 1, text: "Ship small #principle" }),
      fixture({ lineNumber: 2, text: "- Write it down #principle" }),
    ];
    const blocks = buildProjectPrincipleBlocks(items);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.markdown)).toEqual(["Ship small", "- Write it down"]);
  });

  it("keeps a header's block and a standalone item as separate blocks", () => {
    const header = fixture({
      lineNumber: 5,
      text: "## Guiding Principles #principles",
      isHeader: true,
      childLineNumbers: [6],
    });
    const child = fixture({ lineNumber: 6, parentLineNumber: 5, text: "- Ship small" });
    const standalone = fixture({ lineNumber: 20, text: "Write it down #principle" });
    const blocks = buildProjectPrincipleBlocks([header, child, standalone]);
    expect(blocks).toHaveLength(2);
  });

  it("returns no blocks for an empty item list", () => {
    expect(buildProjectPrincipleBlocks([])).toEqual([]);
  });
});
