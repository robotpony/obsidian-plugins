import { describe, it, expect } from "vitest";
import { compareSortableEntries } from "../utils";
import type { ProjectInfo, SortableEntry, TodoItem } from "../types";

// compareSortableEntries interleaves vault TodoItems with repo project
// blocks (SortableEntry) into one sorted list for the TODOs/Ideas tabs —
// see DESIGN.md's "Project blocks in the TODOs/Ideas tabs". Same
// tier-then-priority rule compareWithEffectivePriority already gives two
// TodoItems; a project entry's tier/priority come straight from its
// (synced-item-inclusive) hasFocusItems/highestPriority.

function makeTodo(opts: { tags?: string[]; lineNumber?: number } = {}): TodoItem {
  return {
    file: {} as TodoItem["file"],
    filePath: "notes/test.md",
    folder: "notes",
    lineNumber: opts.lineNumber ?? 0,
    fingerprint: "x",
    text: "Sample",
    hasCheckbox: true,
    tags: opts.tags ?? ["#todo"],
    dateCreated: 0,
    itemType: "todo",
    mentions: [],
  };
}

function makeProject(opts: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    tag: "#peep",
    count: 1,
    lastActivity: 0,
    highestPriority: 7,
    hasFocusItems: false,
    colourIndex: 4,
    localPath: "/Users/mx/projects/peep",
    ...opts,
  };
}

const todoEntry = (opts: Parameters<typeof makeTodo>[0] = {}): SortableEntry => ({
  kind: 'todo',
  item: makeTodo(opts),
});
const projectEntry = (opts: Partial<ProjectInfo> = {}): SortableEntry => ({
  kind: 'project',
  project: makeProject(opts),
});

describe("compareSortableEntries", () => {
  it("sorts a #focus project block above a non-focused todo", () => {
    const a = projectEntry({ hasFocusItems: true, highestPriority: 7 });
    const b = todoEntry({ tags: ["#todo"] }); // no focus, no priority tag
    expect(compareSortableEntries(a, b, [])).toBeLessThan(0);
    expect(compareSortableEntries(b, a, [])).toBeGreaterThan(0);
  });

  it("sorts a #focus todo above a non-focused project block", () => {
    const a = todoEntry({ tags: ["#todo", "#focus"] });
    const b = projectEntry({ hasFocusItems: false, highestPriority: 2 }); // even at #p0
    expect(compareSortableEntries(a, b, [])).toBeLessThan(0);
  });

  it("within the same focus tier, lower highestPriority sorts a project block first", () => {
    const a = projectEntry({ highestPriority: 2 }); // #p0
    const b = todoEntry({ tags: ["#todo", "#p3"] });
    expect(compareSortableEntries(a, b, [])).toBeLessThan(0);
  });

  it("within the same focus tier, a higher-priority todo sorts before a lower-priority project block", () => {
    const a = todoEntry({ tags: ["#todo", "#p0"] });
    const b = projectEntry({ highestPriority: 6 }); // #p4
    expect(compareSortableEntries(a, b, [])).toBeLessThan(0);
  });

  it("on an exact tier+priority tie, a todo entry sorts before a project entry", () => {
    const a = projectEntry({ highestPriority: 7, hasFocusItems: false });
    const b = todoEntry({ tags: ["#todo"] }); // also priority value 7, unfocused
    expect(compareSortableEntries(a, b, [])).toBeGreaterThan(0);
    expect(compareSortableEntries(b, a, [])).toBeLessThan(0);
  });

  it("two project entries with equal tier/priority are left in place (stable)", () => {
    const a = projectEntry({ tag: "#a", highestPriority: 5 });
    const b = projectEntry({ tag: "#b", highestPriority: 5 });
    expect(compareSortableEntries(a, b, [])).toBe(0);
  });
});
