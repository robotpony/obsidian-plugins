import { describe, it, expect } from "vitest";
import { activeSyncedItems, TODO_TAB_SYNCED_ITEM_TYPES } from "../ProjectsSidebarView";
import { ParsedProjectItem, ProjectItemType } from "../StructuredFileParser";

function item(overrides: Partial<ParsedProjectItem> = {}): ParsedProjectItem {
  return {
    sourceFile: "/Users/mx/projects/peep/TODO.md",
    lineNumber: 0,
    fingerprint: "fp",
    text: "an item",
    hasCheckbox: true,
    itemType: "todo",
    completed: false,
    tags: [],
    shape: "checkbox",
    ...overrides,
  };
}

describe("activeSyncedItems", () => {
  it("keeps only non-completed items of the requested types", () => {
    const items = [
      item({ text: "open todo", itemType: "todo" }),
      item({ text: "done todo", itemType: "todo", completed: true }),
      item({ text: "open bug", itemType: "bug" }),
      item({ text: "open idea", itemType: "idea" }),
    ];

    const result = activeSyncedItems(items, ["todo", "bug"]);

    expect(result.map((i) => i.text)).toEqual(["open todo", "open bug"]);
  });

  it("excludes #idea items under the TODOs tab's type set", () => {
    // The [0.47.2] regression: the tag-cloud pill count once included idea
    // items the TODOs list would never render, so the pill filtered to
    // nothing on click. Both the pill count and buildProjectBlocks now route
    // through this function with TODO_TAB_SYNCED_ITEM_TYPES.
    const items = [
      item({ text: "idea only", itemType: "idea" }),
    ];

    expect(activeSyncedItems(items, TODO_TAB_SYNCED_ITEM_TYPES)).toEqual([]);
  });

  it("keeps #idea items when the Ideas tab asks for them", () => {
    const items = [
      item({ text: "an idea", itemType: "idea" }),
      item({ text: "a todo", itemType: "todo" }),
    ];

    const result = activeSyncedItems(items, ["idea"]);

    expect(result.map((i) => i.text)).toEqual(["an idea"]);
  });

  it("returns [] for an all-completed project", () => {
    const items = [
      item({ itemType: "todo", completed: true }),
      item({ itemType: "bug", completed: true }),
    ];

    expect(activeSyncedItems(items, TODO_TAB_SYNCED_ITEM_TYPES)).toEqual([]);
  });

  it("TODO_TAB_SYNCED_ITEM_TYPES is todo + bug", () => {
    const expected: ProjectItemType[] = ["todo", "bug"];
    expect([...TODO_TAB_SYNCED_ITEM_TYPES].sort()).toEqual([...expected].sort());
  });
});
