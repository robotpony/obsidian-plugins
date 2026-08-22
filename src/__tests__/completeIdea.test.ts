import { describe, it, expect } from "vitest";
import { TodoProcessor } from "../TodoProcessor";
import type { TodoItem } from "../types";
import { createFakeApp, FakeTFile } from "./stubs/fakeVault";

const NOTE_PATH = "log/older/2026-05-08.md";

// Bug: an idea nested under a `## Something #idea` header (a "child" idea —
// TodoScanner tracks it via parentLineNumber, not its own #idea/#ideas/
// #ideation tag) could never be completed. completeIdea's validate closure
// required that exact tag on the item's own line, which a child idea never
// carries — it inherits "idea-ness" from its parent header. The checkbox
// click would flip to checked in the sidebar (native browser behaviour, not
// this plugin's doing), the write would then throw and fail validation, and
// nothing reset the checkbox back — so it looked completed in the sidebar
// while the file underneath stayed untouched.

function ideaFixture(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    file: new FakeTFile(NOTE_PATH) as unknown as TodoItem["file"],
    filePath: NOTE_PATH,
    folder: "log/older",
    lineNumber: 0,
    fingerprint: "",
    text: "",
    hasCheckbox: true,
    tags: [],
    dateCreated: 1000,
    mentions: [],
    ...overrides,
  };
}

describe("TodoProcessor.completeIdea", () => {
  it("completes a top-level idea (has its own #idea tag)", async () => {
    const { app, vault } = createFakeApp();
    vault.setRawContent(NOTE_PATH, "- [ ] Ship the thing #idea\n");
    const processor = new TodoProcessor(app as any);

    const idea = ideaFixture({ text: "- [ ] Ship the thing #idea", tags: ["#idea"] });
    const result = await processor.completeIdea(idea);

    expect(result).toBe(true);
    const content = vault.getRawContent(NOTE_PATH);
    expect(content).toContain("[x]");
    expect(content).not.toContain("#idea");
  });

  it("completes a child idea nested under a header idea (no #idea tag of its own)", async () => {
    const { app, vault } = createFakeApp();
    vault.setRawContent(
      NOTE_PATH,
      "## Ideas #ideas\n\n- [ ] HUGO food site (cooking.warpedvisions.org)\n\t- [ ] work on EAT WELL to help with writing\n"
    );
    const processor = new TodoProcessor(app as any);

    const child = ideaFixture({
      lineNumber: 2,
      text: "- [ ] HUGO food site (cooking.warpedvisions.org)",
      tags: [],
      parentLineNumber: 0,
    });
    const result = await processor.completeIdea(child);

    expect(result).toBe(true);
    const content = vault.getRawContent(NOTE_PATH);
    expect(content).toContain("- [x] HUGO food site (cooking.warpedvisions.org)");
    // Untouched: no tag was there to strip, and the sibling line stays as-is.
    expect(content).toContain("work on EAT WELL");
  });

  it("still refuses a non-child idea whose #idea tag is genuinely gone", async () => {
    const { app, vault } = createFakeApp();
    vault.setRawContent(NOTE_PATH, "- [ ] Ship the thing\n");
    const processor = new TodoProcessor(app as any);

    const idea = ideaFixture({ text: "- [ ] Ship the thing #idea", tags: ["#idea"] });
    const result = await processor.completeIdea(idea);

    expect(result).toBe(false);
  });
});
