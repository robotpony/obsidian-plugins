import { describe, it, expect } from "vitest";
import { buildFocusQueue, getItemDate, rotateQueue } from "../utils";
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
  inferredFileTag?: string;
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
    inferredFileTag: opts.inferredFileTag,
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

  it("makes the focused child a queue entry, not its parent header", () => {
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
    // The focused child stands in for the header — header is excluded entirely.
    expect(result.items).toHaveLength(1);
    expect(result.items[0].text).toBe("Child A");
    expect(result.items[0].parentLineNumber).toBe(0);
  });

  it("excludes header-with-children entries from the queue", () => {
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
    // Even though the header itself has #focus, header-with-children is not a queue entry.
    expect(result.items.map(i => i.text)).toEqual(["Child"]);
  });

  it("includes a leaf header (no children) as a queue entry", () => {
    const leafHeader = makeTodo({
      text: "Standalone header",
      tags: ["#todo", "#focus"],
      isHeader: true,
      lineNumber: 0,
    });
    const result = buildFocusQueue([leafHeader], 5);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].text).toBe("Standalone header");
  });

  it("excludes bold-subheading dividers from the queue", () => {
    const header = makeTodo({
      text: "Header",
      tags: ["#todo"],
      isHeader: true,
      lineNumber: 0,
      childLineNumbers: [1, 2],
    });
    const subheading = makeTodo({
      text: "**Section** #focus",
      tags: ["#focus"],
      lineNumber: 1,
      parentLineNumber: 0,
    });
    (subheading as TodoItem).isSubheading = true;
    const child = makeTodo({
      text: "Real task",
      tags: ["#todo", "#focus"],
      lineNumber: 2,
      parentLineNumber: 0,
    });
    const result = buildFocusQueue([header, subheading, child], 5);
    expect(result.items.map(i => i.text)).toEqual(["Real task"]);
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

  it("forceFallback: ignores #focus and returns top-priority with priority-fallback source", () => {
    const items = [
      makeTodo({ text: "Focused low", tags: ["#todo", "#focus", "#p4"], lineNumber: 0 }),
      makeTodo({ text: "Plain top", tags: ["#todo", "#today"], lineNumber: 1 }),
      makeTodo({ text: "Plain mid", tags: ["#todo", "#p1"], lineNumber: 2 }),
    ];
    const result = buildFocusQueue(items, 2, { forceFallback: true });
    expect(result.source).toBe("priority-fallback");
    expect(result.items.map(i => i.text)).toEqual(["Plain top", "Plain mid"]);
  });

  it("forceFallback on empty candidates returns empty source", () => {
    const result = buildFocusQueue([], 1, { forceFallback: true });
    expect(result).toEqual({ items: [], source: "empty" });
  });

  it("walks priority-fallback children in main-list order, grouped under their parents", () => {
    // Two header blocks. HeaderA (effective priority p1 from its child)
    // sorts above HeaderB (effective priority p2 from its child) in the main
    // list, so HeaderA's children should appear in the focus queue first —
    // even when one of HeaderB's children carries the absolute-highest #p0.
    const headerA = makeTodo({
      text: "HeaderA",
      tags: ["#todo"],
      isHeader: true,
      filePath: "a.md",
      lineNumber: 0,
      childLineNumbers: [1, 2],
    });
    const a1 = makeTodo({
      text: "A1 plain",
      tags: ["#todo"],
      filePath: "a.md",
      lineNumber: 1,
      parentLineNumber: 0,
    });
    const a2 = makeTodo({
      text: "A2 p1",
      tags: ["#todo", "#p1"],
      filePath: "a.md",
      lineNumber: 2,
      parentLineNumber: 0,
    });
    const headerB = makeTodo({
      text: "HeaderB",
      tags: ["#todo"],
      isHeader: true,
      filePath: "b.md",
      lineNumber: 0,
      childLineNumbers: [1, 2],
    });
    const b1 = makeTodo({
      text: "B1 p0",
      tags: ["#todo", "#p0"],
      filePath: "b.md",
      lineNumber: 1,
      parentLineNumber: 0,
    });
    const b2 = makeTodo({
      text: "B2 plain",
      tags: ["#todo"],
      filePath: "b.md",
      lineNumber: 2,
      parentLineNumber: 0,
    });
    // HeaderA average child priority = (7+3)/2 = 5
    // HeaderB average child priority = (2+7)/2 = 4.5
    // So HeaderB's effective priority is BETTER and HeaderB sorts first.
    const result = buildFocusQueue([headerA, a1, a2, headerB, b1, b2], 10);
    expect(result.source).toBe("priority-fallback");
    expect(result.items.map(i => i.text)).toEqual([
      "B1 p0",   // HeaderB's children in document order
      "B2 plain",
      "A1 plain", // HeaderA's children in document order
      "A2 p1",
    ]);
  });

  // -------------------------------------------------------------------------
  // tagFilter (focus mode respects the project scope)
  // -------------------------------------------------------------------------

  it("scopes the queue to items matching tagFilter", () => {
    const items = [
      makeTodo({ text: "In scope", tags: ["#todo", "#peep"], lineNumber: 0 }),
      makeTodo({ text: "Out of scope", tags: ["#todo", "#other"], lineNumber: 1 }),
    ];
    const result = buildFocusQueue(items, 10, { tagFilter: "#peep" });
    expect(result.items.map(i => i.text)).toEqual(["In scope"]);
  });

  it("matches tagFilter via inferredFileTag when there's no explicit tag", () => {
    const items = [
      makeTodo({ text: "Untagged in project note", tags: ["#todo"], inferredFileTag: "#peep", lineNumber: 0 }),
      makeTodo({ text: "Untagged elsewhere", tags: ["#todo"], lineNumber: 1 }),
    ];
    const result = buildFocusQueue(items, 10, { tagFilter: "#peep" });
    expect(result.items.map(i => i.text)).toEqual(["Untagged in project note"]);
  });

  it("explicit tag and inferredFileTag both matching doesn't double the item", () => {
    const items = [
      makeTodo({ text: "Both", tags: ["#todo", "#peep"], inferredFileTag: "#peep", lineNumber: 0 }),
    ];
    const result = buildFocusQueue(items, 10, { tagFilter: "#peep" });
    expect(result.items.map(i => i.text)).toEqual(["Both"]);
  });

  it("still excludes a focused item outside the scope from the focus-tagged queue", () => {
    const items = [
      makeTodo({ text: "Focused, wrong project", tags: ["#todo", "#focus", "#other"], lineNumber: 0 }),
      makeTodo({ text: "Plain, right project", tags: ["#todo", "#peep"], lineNumber: 1 }),
    ];
    const result = buildFocusQueue(items, 10, { tagFilter: "#peep" });
    expect(result.source).toBe("priority-fallback");
    expect(result.items.map(i => i.text)).toEqual(["Plain, right project"]);
  });

  it("returns empty when nothing matches the scope", () => {
    const items = [makeTodo({ text: "Wrong project", tags: ["#todo", "#other"] })];
    const result = buildFocusQueue(items, 10, { tagFilter: "#peep" });
    expect(result).toEqual({ items: [], source: "empty" });
  });

  it("a header-with-children outside the scope still doesn't leak its out-of-scope child in", () => {
    // Header itself untagged; one child in scope, one not. The out-of-scope
    // child must not appear even though its sibling and parent are examined
    // together during effective-priority resolution.
    const header = makeTodo({
      text: "Header",
      tags: ["#todo"],
      isHeader: true,
      childLineNumbers: [1, 2],
      lineNumber: 0,
    });
    const inScope = makeTodo({ text: "In scope child", tags: ["#todo", "#peep"], lineNumber: 1, parentLineNumber: 0 });
    const outOfScope = makeTodo({ text: "Out of scope child", tags: ["#todo", "#other"], lineNumber: 2, parentLineNumber: 0 });
    const result = buildFocusQueue([header, inScope, outOfScope], 10, { tagFilter: "#peep" });
    expect(result.items.map(i => i.text)).toEqual(["In scope child"]);
  });

  it("no tagFilter (undefined or null) behaves exactly as before", () => {
    const items = [
      makeTodo({ text: "A", tags: ["#todo", "#peep"], lineNumber: 0 }),
      makeTodo({ text: "B", tags: ["#todo", "#other"], lineNumber: 1 }),
    ];
    expect(buildFocusQueue(items, 10).items.map(i => i.text)).toEqual(["A", "B"]);
    expect(buildFocusQueue(items, 10, { tagFilter: null }).items.map(i => i.text)).toEqual(["A", "B"]);
  });
});

// ---------------------------------------------------------------------------
// rotateQueue
// ---------------------------------------------------------------------------

describe("rotateQueue", () => {
  it("rotates the head to the tail", () => {
    expect(rotateQueue(["a", "b", "c"])).toEqual(["b", "c", "a"]);
  });

  it("returns the same array for a single item", () => {
    expect(rotateQueue(["only"])).toEqual(["only"]);
  });

  it("returns the same array for an empty input", () => {
    expect(rotateQueue([])).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [1, 2, 3];
    rotateQueue(input);
    expect(input).toEqual([1, 2, 3]);
  });

  it("rotates twice to put the original head at index N-2", () => {
    const once = rotateQueue([1, 2, 3, 4]);
    const twice = rotateQueue(once);
    expect(twice).toEqual([3, 4, 1, 2]);
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
    const mtime = 1705276800000; // 2024-01-15T00:00:00Z
    const item = makeTodo({ text: "No date task #todo", mtime });
    const result = getItemDate(item);
    // Expected iso uses local time, not UTC, to match the fix.
    const d = new Date(mtime);
    const expectedIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(result.kind).toBe("modified");
    expect(result.iso).toBe(expectedIso);
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
