import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { mkdtemp, readFile, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { moveHeaderBlock } from "../HeaderBlockMover";
import { parseStructuredFile, ParsedProjectItem } from "../StructuredFileParser";
import { ProjectScanner } from "../ProjectScanner";

// Phase 6 Case 1 (see PLAN.md): the header-block move, the riskiest mutation
// in this whole feature — multi-line surgery on a file that might not even be
// open in Obsidian. Most tests here use a fake "always clean" scanner to
// isolate section-placement logic from git; a separate describe block tests
// the git-clean safety net itself against real repos.

const fakeCleanScanner = { isFileClean: async () => true } as unknown as ProjectScanner;

function findItem(content: string, text: string, sourceFile: string): ParsedProjectItem {
  const items = parseStructuredFile("BUGS.md", content, sourceFile);
  const item = items.find((i) => i.text.includes(text));
  if (!item) throw new Error(`Fixture item not found: ${text}`);
  return item;
}

describe("moveHeaderBlock: section placement", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "warped-todo-mover-"));
    filePath = join(dir, "BUGS.md");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("moves a block from Open to an existing Fixed section, appended at the end", async () => {
    const original = [
      "# Bugs",
      "",
      "## Open",
      "",
      "### Widget crashes",
      "",
      "Steps to reproduce.",
      "",
      "## Fixed",
      "",
      "### Already fixed thing",
      "",
      "Resolved by X.",
      "",
    ].join("\n");
    await writeFile(filePath, original, "utf-8");
    const item = findItem(original, "Widget crashes", filePath);

    const result = await moveHeaderBlock(item, true, dir, fakeCleanScanner);

    expect(result.ok).toBe(true);
    const content = await readFile(filePath, "utf-8");
    // Removed from Open
    const openSection = content.split("## Fixed")[0];
    expect(openSection).not.toContain("Widget crashes");
    // Present in Fixed, after the existing item there
    const fixedSection = content.split("## Fixed")[1];
    expect(fixedSection).toContain("Already fixed thing");
    expect(fixedSection).toContain("Widget crashes");
    expect(fixedSection.indexOf("Already fixed thing")).toBeLessThan(fixedSection.indexOf("Widget crashes"));
  });

  it("creates a new ## Fixed section at the end of the file when none exists", async () => {
    const original = ["# Bugs", "", "## Open", "", "### Widget crashes", "", "Steps.", ""].join("\n");
    await writeFile(filePath, original, "utf-8");
    const item = findItem(original, "Widget crashes", filePath);

    const result = await moveHeaderBlock(item, true, dir, fakeCleanScanner);

    expect(result.ok).toBe(true);
    const content = await readFile(filePath, "utf-8");
    expect(content).toContain("## Fixed");
    const fixedIdx = content.indexOf("## Fixed");
    const openIdx = content.indexOf("## Open");
    expect(fixedIdx).toBeGreaterThan(openIdx); // appended after, not before
    expect(content.slice(fixedIdx)).toContain("Widget crashes");
  });

  it("uses whichever closed-vocabulary section appears first when more than one exists", async () => {
    const original = [
      "# Bugs",
      "",
      "## Open",
      "",
      "### Widget crashes",
      "",
      "Steps.",
      "",
      "## Resolved",
      "",
      "### Older resolved thing",
      "",
      "## Fixed",
      "",
      "### Even older fixed thing",
      "",
    ].join("\n");
    await writeFile(filePath, original, "utf-8");
    const item = findItem(original, "Widget crashes", filePath);

    await moveHeaderBlock(item, true, dir, fakeCleanScanner);

    const content = await readFile(filePath, "utf-8");
    const resolvedSection = content.split("## Resolved")[1].split("## Fixed")[0];
    expect(resolvedSection).toContain("Widget crashes"); // landed in Resolved, not Fixed — appears first
  });

  it("moves a block back to Open on un-complete, and creates ## Open at the top if none exists", async () => {
    const original = ["# Bugs", "", "## Fixed", "", "### Already-fixed thing", "", "Notes.", ""].join("\n");
    await writeFile(filePath, original, "utf-8");
    const item = findItem(original, "Already-fixed thing", filePath);

    const result = await moveHeaderBlock(item, false, dir, fakeCleanScanner);

    expect(result.ok).toBe(true);
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");
    expect(lines[0]).toBe("# Bugs"); // title stays first
    expect(content.indexOf("## Open")).toBeLessThan(content.indexOf("## Fixed"));
    expect(content.split("## Fixed")[0]).toContain("Already-fixed thing");
  });

  it("re-parses correctly after a move — the moved item shows up under its new section with the right completion state", async () => {
    const original = ["## Open", "", "### Widget crashes", "", "Steps.", ""].join("\n");
    await writeFile(filePath, original, "utf-8");
    const item = findItem(original, "Widget crashes", filePath);

    await moveHeaderBlock(item, true, dir, fakeCleanScanner);

    const content = await readFile(filePath, "utf-8");
    const items = parseStructuredFile("BUGS.md", content, filePath);
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe("Widget crashes");
    expect(items[0].completed).toBe(true);
  });

  it("does not leave double-blank-lines after removing a block from the middle of a section", async () => {
    const original = [
      "## Open",
      "",
      "### First bug",
      "",
      "Notes.",
      "",
      "### Second bug",
      "",
      "More notes.",
      "",
      "## Fixed",
      "",
    ].join("\n");
    await writeFile(filePath, original, "utf-8");
    const item = findItem(original, "First bug", filePath);

    await moveHeaderBlock(item, true, dir, fakeCleanScanner);

    const content = await readFile(filePath, "utf-8");
    expect(content).not.toMatch(/\n\n\n/);
  });

  it("refuses immediately for a non-headerNested item, no file write attempted", async () => {
    const original = "- [ ] Not a header item\n";
    await writeFile(filePath, original, "utf-8");
    const flatItem = parseStructuredFile("TODO.md", original, filePath)[0];

    const result = await moveHeaderBlock(flatItem, true, dir, fakeCleanScanner);

    expect(result.ok).toBe(false);
    expect(await readFile(filePath, "utf-8")).toBe(original);
  });

  it("refuses cleanly when the item can no longer be found (fingerprint mismatch)", async () => {
    const original = ["## Open", "", "### Widget crashes", "", "Steps.", ""].join("\n");
    await writeFile(filePath, original, "utf-8");
    const item = findItem(original, "Widget crashes", filePath);
    const staleItem = { ...item, sourceFile: filePath, fingerprint: "Something that no longer exists" };

    const result = await moveHeaderBlock(staleItem, true, dir, fakeCleanScanner);

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/couldn't find/i);
  });
});

describe("moveHeaderBlock: git-clean safety net (real repos)", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "warped-todo-mover-git-"));
    execFileSync("git", ["init", "-q", "-b", "main", dir]);
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
    filePath = join(dir, "BUGS.md");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function commitAll(message: string) {
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", message], { cwd: dir });
  }

  it("proceeds when the target file is committed and clean", async () => {
    const original = ["## Open", "", "### Widget crashes", "", "Steps.", ""].join("\n");
    await writeFile(filePath, original, "utf-8");
    commitAll("add BUGS.md");
    const item = findItem(original, "Widget crashes", filePath);

    const result = await moveHeaderBlock(item, true, dir, new ProjectScanner());

    expect(result.ok).toBe(true);
  });

  it("refuses when the target file itself has uncommitted changes", async () => {
    const original = ["## Open", "", "### Widget crashes", "", "Steps.", ""].join("\n");
    await writeFile(filePath, original, "utf-8");
    commitAll("add BUGS.md");
    // Dirty it after commit, without re-committing.
    await writeFile(filePath, original + "\nan uncommitted edit\n", "utf-8");
    const item = findItem(original, "Widget crashes", filePath);

    const result = await moveHeaderBlock(item, true, dir, new ProjectScanner());

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/commit or stash/i);
    // File genuinely untouched by the refused move (still has the manual edit, nothing more).
    expect(await readFile(filePath, "utf-8")).toBe(original + "\nan uncommitted edit\n");
  });

  it("proceeds when a different file in the repo is dirty but the target file is clean", async () => {
    const original = ["## Open", "", "### Widget crashes", "", "Steps.", ""].join("\n");
    await writeFile(filePath, original, "utf-8");
    await writeFile(join(dir, "README.md"), "# hi\n", "utf-8");
    commitAll("add both files");
    // Dirty README only.
    await writeFile(join(dir, "README.md"), "# hi, edited\n", "utf-8");
    const item = findItem(original, "Widget crashes", filePath);

    const result = await moveHeaderBlock(item, true, dir, new ProjectScanner());

    expect(result.ok).toBe(true);
  });
});
