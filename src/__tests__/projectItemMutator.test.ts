import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  setProjectItemCompletion,
  setProjectItemPriority,
  addProjectItemTag,
  removeProjectItemTag,
} from "../ProjectItemMutator";
import { ParsedProjectItem, ItemShape } from "../StructuredFileParser";

// Completion routing by item shape. "checkbox" and "plainBullet" are
// single-line edits, no special risk. "headerStandalone" is also
// single-line, reusing the same write path unchanged. "headerNested" is
// the real block-move (delegates to moveHeaderBlock, see below) — the
// riskiest case, since it rewrites multiple lines of an external file.

function fixture(overrides: Partial<ParsedProjectItem> = {}): ParsedProjectItem {
  return {
    sourceFile: "",
    lineNumber: 0,
    fingerprint: "",
    text: "",
    hasCheckbox: false,
    itemType: "bug",
    completed: false,
    tags: [],
    shape: "checkbox" as ItemShape,
    ...overrides,
  };
}

describe("setProjectItemCompletion: checkbox shape", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "warped-todo-mutator-"));
    filePath = join(dir, "TODO.md");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("checks an unchecked item", async () => {
    await writeFile(filePath, "- [ ] Ship it\n", "utf-8");
    const item = fixture({ sourceFile: filePath, fingerprint: "Ship it", shape: "checkbox" });

    const result = await setProjectItemCompletion(item, true);

    expect(result).toBe(true);
    expect(await readFile(filePath, "utf-8")).toBe("- [x] Ship it\n");
  });

  it("unchecks a checked item", async () => {
    await writeFile(filePath, "- [x] Ship it\n", "utf-8");
    const item = fixture({ sourceFile: filePath, fingerprint: "Ship it", shape: "checkbox" });

    const result = await setProjectItemCompletion(item, false);

    expect(result).toBe(true);
    expect(await readFile(filePath, "utf-8")).toBe("- [ ] Ship it\n");
  });
});

describe("setProjectItemCompletion: plainBullet shape", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "warped-todo-mutator-"));
    filePath = join(dir, "TODO.md");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("adds a checked checkbox when completing", async () => {
    await writeFile(filePath, "- Add caching mechanism\n", "utf-8");
    const item = fixture({
      sourceFile: filePath,
      fingerprint: "Add caching mechanism",
      shape: "plainBullet",
    });

    const result = await setProjectItemCompletion(item, true);

    expect(result).toBe(true);
    expect(await readFile(filePath, "utf-8")).toBe("- [x] Add caching mechanism\n");
  });

  it("refuses to un-complete (no single-line edit exists) and leaves the file untouched", async () => {
    const original = "- Add caching mechanism\n";
    await writeFile(filePath, original, "utf-8");
    const item = fixture({
      sourceFile: filePath,
      fingerprint: "Add caching mechanism",
      shape: "plainBullet",
      completed: true,
    });

    const result = await setProjectItemCompletion(item, false);

    expect(result).toBe(false);
    expect(await readFile(filePath, "utf-8")).toBe(original);
  });
});

describe("setProjectItemCompletion: headerStandalone shape", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "warped-todo-mutator-"));
    filePath = join(dir, "ISSUES.md");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("appends a resolved marker on complete", async () => {
    await writeFile(filePath, "## Issue: widget crashes\n", "utf-8");
    const item = fixture({
      sourceFile: filePath,
      fingerprint: "Issue: widget crashes",
      shape: "headerStandalone",
    });

    const result = await setProjectItemCompletion(item, true);

    expect(result).toBe(true);
    expect(await readFile(filePath, "utf-8")).toBe("## Issue: widget crashes ✅ RESOLVED\n");
  });

  it("is idempotent — completing an already-resolved heading doesn't duplicate the marker", async () => {
    await writeFile(filePath, "## Issue: widget crashes ✅ RESOLVED\n", "utf-8");
    const item = fixture({
      sourceFile: filePath,
      fingerprint: "Issue: widget crashes",
      shape: "headerStandalone",
    });

    await setProjectItemCompletion(item, true);

    expect(await readFile(filePath, "utf-8")).toBe("## Issue: widget crashes ✅ RESOLVED\n");
  });

  it("removes the marker on un-complete", async () => {
    await writeFile(filePath, "## Issue: widget crashes ✅ **RESOLVED**\n", "utf-8");
    const item = fixture({
      sourceFile: filePath,
      // createFingerprint only strips header/list/checkbox markers and #tags —
      // it doesn't know about the resolved-marker convention, so the correct
      // fingerprint for an already-resolved line includes the marker text.
      fingerprint: "Issue: widget crashes ✅ **RESOLVED**",
      shape: "headerStandalone",
    });

    const result = await setProjectItemCompletion(item, false);

    expect(result).toBe(true);
    expect(await readFile(filePath, "utf-8")).toBe("## Issue: widget crashes\n");
  });
});

describe("setProjectItemCompletion: headerNested shape", () => {
  it("refuses immediately without a completion context, no file write attempted", async () => {
    const dir = await mkdtemp(join(tmpdir(), "warped-todo-mutator-"));
    try {
      const filePath = join(dir, "BUGS.md");
      const original = "### A real bug\n";
      await writeFile(filePath, original, "utf-8");
      const item = fixture({ sourceFile: filePath, fingerprint: "A real bug", shape: "headerNested" });

      const result = await setProjectItemCompletion(item, true);

      expect(result).toBe(false);
      expect(await readFile(filePath, "utf-8")).toBe(original);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("delegates to moveHeaderBlock (Phase 6 Case 1) when a completion context is given", async () => {
    const dir = await mkdtemp(join(tmpdir(), "warped-todo-mutator-"));
    try {
      const filePath = join(dir, "BUGS.md");
      const original = ["## Open", "", "### A real bug", "", "Notes.", ""].join("\n");
      await writeFile(filePath, original, "utf-8");
      const item = fixture({ sourceFile: filePath, fingerprint: "A real bug", shape: "headerNested" });
      const fakeScanner = { isFileClean: async () => true } as any;

      const result = await setProjectItemCompletion(item, true, { repoPath: dir, scanner: fakeScanner });

      expect(result).toBe(true);
      const content = await readFile(filePath, "utf-8");
      expect(content).toContain("## Fixed");
      expect(content.split("## Fixed")[1]).toContain("A real bug");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("surfaces moveHeaderBlock's refusal reason via a notice and returns false", async () => {
    const dir = await mkdtemp(join(tmpdir(), "warped-todo-mutator-"));
    try {
      const filePath = join(dir, "BUGS.md");
      const original = ["## Open", "", "### A real bug", "", "Notes.", ""].join("\n");
      await writeFile(filePath, original, "utf-8");
      const item = fixture({ sourceFile: filePath, fingerprint: "A real bug", shape: "headerNested" });
      const dirtyScanner = { isFileClean: async () => false } as any;

      const result = await setProjectItemCompletion(item, true, { repoPath: dir, scanner: dirtyScanner });

      expect(result).toBe(false);
      expect(await readFile(filePath, "utf-8")).toBe(original); // refused before writing
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("tag operations (context-menu parity for synced items)", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "warped-todo-mutator-"));
    filePath = join(dir, "BUGS.md");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("setProjectItemPriority replaces an existing priority tag", async () => {
    await writeFile(filePath, "- [ ] Fix it #bug #p2\n", "utf-8");
    const item = fixture({ sourceFile: filePath, fingerprint: "Fix it", shape: "checkbox" });

    const result = await setProjectItemPriority(item, "#p0");

    expect(result).toBe(true);
    expect(await readFile(filePath, "utf-8")).toBe("- [ ] Fix it #bug #p0\n");
  });

  it("setProjectItemPriority can add #focus alongside the priority tag", async () => {
    await writeFile(filePath, "- [ ] Fix it #bug\n", "utf-8");
    const item = fixture({ sourceFile: filePath, fingerprint: "Fix it", shape: "checkbox" });

    await setProjectItemPriority(item, "#p0", true);

    expect(await readFile(filePath, "utf-8")).toBe("- [ ] Fix it #bug #p0 #focus\n");
  });

  it("addProjectItemTag appends a tag", async () => {
    await writeFile(filePath, "- [ ] Fix it #bug\n", "utf-8");
    const item = fixture({ sourceFile: filePath, fingerprint: "Fix it", shape: "checkbox" });

    const result = await addProjectItemTag(item, "#focus");

    expect(result).toBe(true);
    expect(await readFile(filePath, "utf-8")).toBe("- [ ] Fix it #bug #focus\n");
  });

  it("addProjectItemTag is a no-op (not a failure) if the tag is already present", async () => {
    const original = "- [ ] Fix it #bug #focus\n";
    await writeFile(filePath, original, "utf-8");
    const item = fixture({ sourceFile: filePath, fingerprint: "Fix it", shape: "checkbox" });

    const result = await addProjectItemTag(item, "#focus");

    expect(result).toBe(true);
    expect(await readFile(filePath, "utf-8")).toBe(original);
  });

  it("removeProjectItemTag removes a tag", async () => {
    await writeFile(filePath, "- [ ] Fix it #bug #focus\n", "utf-8");
    const item = fixture({ sourceFile: filePath, fingerprint: "Fix it", shape: "checkbox" });

    const result = await removeProjectItemTag(item, "#focus");

    expect(result).toBe(true);
    expect(await readFile(filePath, "utf-8")).toBe("- [ ] Fix it #bug\n");
  });
});
