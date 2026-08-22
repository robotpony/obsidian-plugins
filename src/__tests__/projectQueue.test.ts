import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { appendQueuedTodo } from "../ProjectQueue";
import { parseStructuredFile } from "../StructuredFileParser";

// The core risk this covers: parseStructuredFile picks flat-list vs
// header-report shape for the *whole file*, and only recognizes items in
// that one shape (see ProjectQueue.ts's own comment). A block appended in
// the wrong shape would round-trip through appendQueuedTodo with no error,
// but silently produce zero parsed items — invisible in the sidebar. Every
// case here appends, then re-parses the result the same way ProjectSyncManager
// actually does, and asserts the new item shows up.

describe("appendQueuedTodo", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("creates TODO.md as a flat-list bullet when the project has no TODO.md yet", async () => {
    dir = await mkdtemp(join(tmpdir(), "warped-todo-queue-new-"));

    const filePath = await appendQueuedTodo(dir, "Add rate limiting", "First paragraph.\n\nSecond paragraph.");
    const content = await readFile(filePath, "utf-8");
    const items = parseStructuredFile("TODO.md", content, filePath);

    expect(items).toHaveLength(1);
    expect(items[0].text).toContain("Add rate limiting");
    expect(items[0].shape).toBe("checkbox");
    expect(items[0].completed).toBe(false);
    expect(items[0].itemType).toBe("todo");
    // Body is preserved in the file (indented under the bullet) even though
    // it's not part of the parsed .text — a human/agent reading the file
    // directly still sees it.
    expect(content).toContain("First paragraph.");
  });

  it("appends a flat-list bullet to an existing flat-list TODO.md without disturbing existing items", async () => {
    dir = await mkdtemp(join(tmpdir(), "warped-todo-queue-flat-"));
    await writeFile(join(dir, "TODO.md"), "- [ ] Existing task #p1\n", "utf-8");

    const filePath = await appendQueuedTodo(dir, "New chunk of work", "Some spec text.");
    const content = await readFile(filePath, "utf-8");
    const items = parseStructuredFile("TODO.md", content, filePath);

    expect(items).toHaveLength(2);
    expect(items.some((i) => i.text.includes("Existing task"))).toBe(true);
    expect(items.some((i) => i.text.includes("New chunk of work"))).toBe(true);
  });

  it("appends a headerStandalone block when the existing TODO.md is already header-report shaped", async () => {
    dir = await mkdtemp(join(tmpdir(), "warped-todo-queue-header-"));
    const existing = [
      "## Open",
      "",
      "### An existing item",
      "",
      "Some existing body text.",
      "",
    ].join("\n");
    await writeFile(join(dir, "TODO.md"), existing, "utf-8");

    const filePath = await appendQueuedTodo(dir, "Add rate limiting", "Spec paragraph one.\n\nSpec paragraph two.");
    const content = await readFile(filePath, "utf-8");
    const items = parseStructuredFile("TODO.md", content, filePath);

    const added = items.find((i) => i.text === "Add rate limiting #todo" || i.text.includes("Add rate limiting"));
    expect(added).toBeDefined();
    expect(added!.shape).toBe("headerStandalone");
    expect(added!.completed).toBe(false);
    expect(content).toContain("Spec paragraph one.");
  });
});
