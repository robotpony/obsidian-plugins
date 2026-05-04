import { describe, it, expect } from "vitest";
import { buildFocusQueue, getItemDate } from "../utils";
import type { TodoItem } from "../types";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface MakeTodoOpts {
  filePath?: string;
  lineNumber?: number;
  text?: string;
  tags?: string[];
  isHeader?: boolean;
  parentLineNumber?: number;
  childLineNumbers?: number[];
  mtime?: number;
}

function makeTodo(opts: MakeTodoOpts = {}): TodoItem {
  const filePath = opts.filePath ?? "notes/test.md";
  const lineNumber = opts.lineNumber ?? 0;
  const text = opts.text ?? "Sample task";
  const tags = opts.tags ?? ["#todo"];

  const file = opts.mtime !== undefined
    ? ({ stat: { mtime: opts.mtime } } as unknown as TodoItem["file"])
    : ({} as TodoItem["file"]);

  return {
    file,
    filePath,
    folder: filePath.split("/").slice(0, -1).join("/"),
    lineNumber,
    fingerprint: text,
    text,
    hasCheckbox: false,
    tags,
    dateCreated: 0,
    isHeader: opts.isHeader,
    parentLineNumber: opts.parentLineNumber,
    childLineNumbers: opts.childLineNumbers,
    itemType: "todo",
    mentions: [],
  };
}

// ---------------------------------------------------------------------------
// buildFocusQueue
// ---------------------------------------------------------------------------

describe("buildFocusQueue", () => {
  it("returns empty for an empty input", () => {
    const result = buildFocusQueue([], 1);
    expect(result).toEqual({ items: [], source: "empty" });
  });

  it("returns empty when all items are snoozed", () => {
    const items = [
      makeTodo({ tags: ["#todo", "#future"] }),
      makeTodo({ tags: ["#todo", "#snooze"], lineNumber: 1 }),
    ];
    const result = buildFocusQueue(items, 1);
    expect(result.source).toBe("empty");
    expect(result.items).toHaveLength(0);
  });

  it("returns #focus items as the queue when present", () => {
    const focused = makeTodo({ text: "Focused task", tags: ["#todo", "#focus"] });
    const other = makeTodo({ text: "Other", tags: ["#todo", "#p1"], lineNumber: 1 });
    const result = buildFocusQueue([focused, other], 5);
    expect(result.source).toBe("focus-tagged");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].text).toBe("Focused task");
  });

  it("sorts focus items by priority (today > p0 > p1 > unmarked)", () => {
    const items = [
      makeTodo({ text: "C", tags: ["#todo", "#focus", "#p1"], lineNumber: 0 }),
      makeTodo({ text: "A", tags: ["#todo", "#focus", "#today"], lineNumber: 1 }),
      makeTodo({ text: "B", tags: ["#todo", "#focus", "#p0"], lineNumber: 2 }),
      makeTodo({ text: "D", tags: ["#todo", "#focus"], lineNumber: 3 }),
    ];
    const result = buildFocusQueue(items, 4);
    expect(result.items.map(i => i.text)).toEqual(["A", "B", "C", "D"]);
  });

  it("falls back to top-priority items when no #focus items exist", () => {
    const items = [
      makeTodo({ text: "Low", tags: ["#todo", "#p4"], lineNumber: 0 }),
      makeTodo({ text: "High", tags: ["#todo", "#today"], lineNumber: 1 }),
      makeTodo({ text: "Mid", tags: ["#todo", "#p2"], lineNumber: 2 }),
    ];
    const result = buildFocusQueue(items, 1);
    expect(result.source).toBe("priority-fallback");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].text).toBe("High");
  });

  it("respects the queue limit", () => {
    const items = [
      makeTodo({ text: "A", tags: ["#todo", "#focus", "#today"], lineNumber: 0 }),
      makeTodo({ text: "B", tags: ["#todo", "#focus", "#p0"], lineNumber: 1 }),
      makeTodo({ text: "C", tags: ["#todo", "#focus", "#p1"], lineNumber: 2 }),
    ];
    const result = buildFocusQueue(items, 2);
    expect(result.items).toHaveLength(2);
    expect(result.items.map(i => i.text)).toEqual(["A", "B"]);
  });

  it("normalises a non-positive limit to at least 1", () => {
    const items = [
      makeTodo({ text: "A", tags: ["#todo", "#focus", "#today"] }),
      makeTodo({ text: "B", tags: ["#todo", "#focus", "#p0"], lineNumber: 1 }),
    ];
    const result = buildFocusQueue(items, 0);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].text).toBe("A");
  });

  it("treats a header as a single queue entry when its child has #focus", () => {
    const header = makeTodo({
      text: "Project header",
      tags: ["#todo"],
      isHeader: true,
      lineNumber: 0,
      childLineNumbers: [1, 2],
    });
    const child1 = makeTodo({
      text: "Child A",
      tags: ["#todo", "#focus"],
      lineNumber: 1,
      parentLineNumber: 0,
    });
    const child2 = makeTodo({
      text: "Child B",
      tags: ["#todo"],
      lineNumber: 2,
      parentLineNumber: 0,
    });
    const result = buildFocusQueue([header, child1, child2], 5);
    expect(result.source).toBe("focus-tagged");
    // Only the header should be a queue entry — children are not independent queue items.
    expect(result.items).toHaveLength(1);
    expect(result.items[0].text).toBe("Project header");
    expect(result.items[0].isHeader).toBe(true);
  });

  it("excludes children of focused headers from the queue (no duplicates)", () => {
    const header = makeTodo({
      text: "Header",
      tags: ["#todo", "#focus"],
      isHeader: true,
      lineNumber: 0,
      childLineNumbers: [1],
    });
    const child = makeTodo({
      text: "Child",
      tags: ["#todo", "#focus"],
      lineNumber: 1,
      parentLineNumber: 0,
    });
    const result = buildFocusQueue([header, child], 5);
    expect(result.items.map(i => i.text)).toEqual(["Header"]);
  });

  it("filters out snoozed items from the focus queue", () => {
    const items = [
      makeTodo({ text: "Active focus", tags: ["#todo", "#focus"] }),
      makeTodo({ text: "Snoozed focus", tags: ["#todo", "#focus", "#future"], lineNumber: 1 }),
    ];
    const result = buildFocusQueue(items, 5);
    expect(result.items.map(i => i.text)).toEqual(["Active focus"]);
  });

  it("returns priority-fallback when only snoozed items have #focus", () => {
    const items = [
      makeTodo({ text: "Snoozed focus", tags: ["#todo", "#focus", "#future"] }),
      makeTodo({ text: "Active priority", tags: ["#todo", "#p0"], lineNumber: 1 }),
    ];
    const result = buildFocusQueue(items, 1);
    expect(result.source).toBe("priority-fallback");
    expect(result.items[0].text).toBe("Active priority");
  });
});

// ---------------------------------------------------------------------------
// getItemDate
// ---------------------------------------------------------------------------

describe("getItemDate", () => {
  it("returns the @YYYY-MM-DD tag when present", () => {
    const item = makeTodo({ text: "Do thing @2026-05-04 #todo", mtime: 1234567890000 });
    const result = getItemDate(item);
    expect(result).toEqual({ kind: "tag", iso: "2026-05-04" });
  });

  it("returns the first @YYYY-MM-DD when multiple are present", () => {
    const item = makeTodo({ text: "Range @2026-05-04 to @2026-05-10 #todo" });
    const result = getItemDate(item);
    expect(result.kind).toBe("tag");
    expect(result.iso).toBe("2026-05-04");
  });

  it("falls back to the file mtime when no @date is present", () => {
    // 2024-01-15T00:00:00Z = 1705276800000
    const item = makeTodo({ text: "No date task #todo", mtime: 1705276800000 });
    const result = getItemDate(item);
    expect(result.kind).toBe("modified");
    expect(result.iso).toBe("2024-01-15");
  });

  it("returns 'none' when neither @date nor mtime is available", () => {
    const item = makeTodo({ text: "No date task #todo" });
    // Override file to remove stat entirely.
    (item as unknown as { file: object }).file = {};
    const result = getItemDate(item);
    expect(result).toEqual({ kind: "none", iso: null });
  });

  it("ignores @datelike tokens that are not full dates", () => {
    const item = makeTodo({ text: "Mention @bruce and @date next week #todo", mtime: 1705276800000 });
    const result = getItemDate(item);
    // Falls through to mtime since neither @bruce nor @date is a YYYY-MM-DD match.
    expect(result.kind).toBe("modified");
  });
});
