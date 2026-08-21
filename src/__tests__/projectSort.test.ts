import { describe, it, expect } from "vitest";
import { sortProjectRows, ProjectSortRow, PROJECT_SORT_OPTIONS } from "../ProjectsSidebarView";
import { ProjectInfo } from "../types";

function projectFixture(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    tag: "#peep",
    count: 0,
    lastActivity: 0,
    highestPriority: 8,
    hasFocusItems: false,
    colourIndex: 4,
    localPath: "/Users/mx/projects/peep",
    ...overrides,
  };
}

function row(overrides: Partial<ProjectSortRow> & { project: ProjectInfo }): ProjectSortRow {
  return { itemCount: 0, needsAttention: false, ...overrides };
}

describe("sortProjectRows: name", () => {
  it("sorts alphabetically by tag regardless of item count", () => {
    const rows = [
      row({ project: projectFixture({ tag: "#zebra" }), itemCount: 10 }),
      row({ project: projectFixture({ tag: "#apple" }), itemCount: 0 }),
    ];
    const sorted = sortProjectRows(rows, "name");
    expect(sorted.map((r) => r.project.tag)).toEqual(["#apple", "#zebra"]);
  });
});

describe("sortProjectRows: mostItems", () => {
  it("sorts by item count descending, ties broken by name", () => {
    const rows = [
      row({ project: projectFixture({ tag: "#b" }), itemCount: 2 }),
      row({ project: projectFixture({ tag: "#a" }), itemCount: 5 }),
      row({ project: projectFixture({ tag: "#c" }), itemCount: 2 }),
    ];
    const sorted = sortProjectRows(rows, "mostItems");
    expect(sorted.map((r) => r.project.tag)).toEqual(["#a", "#b", "#c"]);
  });
});

describe("sortProjectRows: needsAttention", () => {
  it("sorts rows needing attention first, ties broken by name", () => {
    const rows = [
      row({ project: projectFixture({ tag: "#clean" }), needsAttention: false }),
      row({ project: projectFixture({ tag: "#dirty" }), needsAttention: true }),
      row({ project: projectFixture({ tag: "#buggy" }), needsAttention: true }),
    ];
    const sorted = sortProjectRows(rows, "needsAttention");
    expect(sorted.map((r) => r.project.tag)).toEqual(["#buggy", "#dirty", "#clean"]);
  });
});

describe("sortProjectRows: recentlyUpdated", () => {
  it("sorts by lastUpdated descending, most recent first", () => {
    const rows = [
      row({ project: projectFixture({ tag: "#old", lastUpdated: 1000 }) }),
      row({ project: projectFixture({ tag: "#new", lastUpdated: 3000 }) }),
      row({ project: projectFixture({ tag: "#mid", lastUpdated: 2000 }) }),
    ];
    const sorted = sortProjectRows(rows, "recentlyUpdated");
    expect(sorted.map((r) => r.project.tag)).toEqual(["#new", "#mid", "#old"]);
  });

  it("treats a missing lastUpdated as oldest (sorts last), broken by name among ties", () => {
    const rows = [
      row({ project: projectFixture({ tag: "#has-date", lastUpdated: 1000 }) }),
      row({ project: projectFixture({ tag: "#no-date-b" }) }),
      row({ project: projectFixture({ tag: "#no-date-a" }) }),
    ];
    const sorted = sortProjectRows(rows, "recentlyUpdated");
    expect(sorted.map((r) => r.project.tag)).toEqual(["#has-date", "#no-date-a", "#no-date-b"]);
  });
});

describe("sortProjectRows: activeFirst", () => {
  it("sorts rows with tracked items before rows with none, ties broken by name", () => {
    const rows = [
      row({ project: projectFixture({ tag: "#empty-b" }), itemCount: 0 }),
      row({ project: projectFixture({ tag: "#busy" }), itemCount: 3 }),
      row({ project: projectFixture({ tag: "#empty-a" }), itemCount: 0 }),
    ];
    const sorted = sortProjectRows(rows, "activeFirst");
    expect(sorted.map((r) => r.project.tag)).toEqual(["#busy", "#empty-a", "#empty-b"]);
  });
});

describe("sortProjectRows: does not mutate the input array", () => {
  it("returns a new array, leaving the original order untouched", () => {
    const rows = [
      row({ project: projectFixture({ tag: "#zebra" }) }),
      row({ project: projectFixture({ tag: "#apple" }) }),
    ];
    const original = [...rows];
    sortProjectRows(rows, "name");
    expect(rows).toEqual(original);
  });
});

describe("PROJECT_SORT_OPTIONS", () => {
  it("has one entry per ProjectSortKey, activeFirst listed first", () => {
    expect(PROJECT_SORT_OPTIONS[0].key).toBe("activeFirst");
    expect(PROJECT_SORT_OPTIONS.map((o) => o.key)).toEqual([
      "activeFirst",
      "name",
      "mostItems",
      "needsAttention",
      "recentlyUpdated",
    ]);
  });
});
