import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { App, TFile } from "obsidian";
import { TodoProcessor } from "../TodoProcessor";
import type { TodoItem } from "../types";

// Proves TodoProcessor routes a TodoItem.sourceFile
// mutation to the external file instead of the Obsidian vault, end to end through
// the public completeTodo/uncompleteTodo API rather than the private helpers.

describe("TodoProcessor with TodoItem.sourceFile set", () => {
  let dir: string;
  let filePath: string;
  let processor: TodoProcessor;

  const baseTodo: Omit<TodoItem, "text" | "fingerprint"> = {
    file: new TFile(),
    filePath: "", // unused when sourceFile is set; source of truth is sourceFile
    folder: "",
    lineNumber: 0,
    hasCheckbox: true,
    tags: ["#todo", "#bug"],
    dateCreated: Date.now(),
    mentions: [],
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "warped-todo-processor-spike-"));
    filePath = join(dir, "BUGS.md");
    await writeFile(filePath, "- [ ] Fix the widget #todo #bug\n", "utf-8");
    processor = new TodoProcessor(new App());
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("completeTodo writes #todone to the external file, not the vault", async () => {
    const scanner = { scanFile: vi.fn() };
    processor.setScanner(scanner as any);

    const todo: TodoItem = {
      ...baseTodo,
      text: "- [ ] Fix the widget #todo #bug",
      fingerprint: "Fix the widget",
      sourceFile: filePath,
    };

    const result = await processor.completeTodo(todo);

    expect(result).toBe(true);
    const content = await readFile(filePath, "utf-8");
    expect(content).toContain("#todone");
    expect(content).toContain("[x]");
    // No vault-side rescan — TodoScanner doesn't read external files yet (Phase 3).
    expect(scanner.scanFile).not.toHaveBeenCalled();
  });

  it("uncompleteTodo reverts the external file back to #todo", async () => {
    await writeFile(filePath, "- [x] Fix the widget #todone @2026-08-14\n", "utf-8");

    const todo: TodoItem = {
      ...baseTodo,
      text: "- [x] Fix the widget #todone @2026-08-14",
      fingerprint: "Fix the widget",
      sourceFile: filePath,
    };

    const result = await processor.uncompleteTodo(todo);

    expect(result).toBe(true);
    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("- [ ] Fix the widget #todo\n");
  });

  it("recovers via fingerprint when the external file shifted since the item was scanned", async () => {
    await writeFile(
      filePath,
      "# Bugs\n\n## A section someone added\n\n- [ ] Fix the widget #todo #bug\n",
      "utf-8"
    );

    const todo: TodoItem = {
      ...baseTodo,
      text: "- [ ] Fix the widget #todo #bug",
      fingerprint: "Fix the widget",
      lineNumber: 0, // stale — the real line is now further down
      sourceFile: filePath,
    };

    const result = await processor.completeTodo(todo);

    expect(result).toBe(true);
    const content = await readFile(filePath, "utf-8");
    expect(content).toContain("- [x] Fix the widget #todone");
    expect(content).toContain("## A section someone added");
  });

  it("fails cleanly (no throw) when the line no longer matches", async () => {
    await writeFile(filePath, "- [x] Fix the widget #todone @2026-08-14\n", "utf-8");

    const todo: TodoItem = {
      ...baseTodo,
      text: "- [ ] Fix the widget #todo #bug",
      fingerprint: "Fix the widget",
      sourceFile: filePath,
    };

    // Already #todone on disk — completeTodo's validate should reject the mutation.
    const result = await processor.completeTodo(todo);
    expect(result).toBe(false);
  });
});
