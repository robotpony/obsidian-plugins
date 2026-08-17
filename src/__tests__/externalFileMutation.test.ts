import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { modifyExternalFileLine } from "../utils";

// Exercises the write-back path for TodoItem.sourceFile (Phase 1 spike, see
// warped-todo/PLAN.md). Uses real temp files rather than mocks — the whole
// point of this primitive is that it talks to the filesystem directly, not
// through the Obsidian Vault API.

describe("modifyExternalFileLine", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "warped-todo-spike-"));
    filePath = join(dir, "BUGS.md");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("transforms the target line and leaves the rest of the file untouched", async () => {
    await writeFile(filePath, "# Bugs\n\n- [ ] First bug #bug\n- [ ] Second bug #bug\n", "utf-8");

    await modifyExternalFileLine(filePath, 2, (line) => line.replace("[ ]", "[x]"));

    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");
    expect(lines[2]).toBe("- [x] First bug #bug");
    expect(lines[0]).toBe("# Bugs");
    expect(lines[3]).toBe("- [ ] Second bug #bug");
  });

  it("throws and leaves the file unchanged when validate rejects the line", async () => {
    const original = "# Bugs\n\n- [x] Already done #bug\n";
    await writeFile(filePath, original, "utf-8");

    await expect(
      modifyExternalFileLine(
        filePath,
        2,
        (line) => line.replace("[x]", "[ ]"),
        (line) => (line.includes("[x]") ? "already complete" : null)
      )
    ).rejects.toThrow("already complete");

    expect(await readFile(filePath, "utf-8")).toBe(original);
  });

  it("throws when the line number is out of bounds and no fingerprint is given", async () => {
    await writeFile(filePath, "one line only\n", "utf-8");

    await expect(
      modifyExternalFileLine(filePath, 5, (line) => line)
    ).rejects.toThrow(/Cannot locate line/);
  });

  it("recovers via fingerprint when an external edit has shifted the target line", async () => {
    // Item was captured at line 1 ("Fix the bug"), but a line got inserted above it
    // before the mutation runs — mirrors a commit landing between scan and mutation.
    await writeFile(
      filePath,
      "# Bugs\n\n## New section inserted by someone else\n\n- [ ] Fix the bug #bug\n",
      "utf-8"
    );

    await modifyExternalFileLine(
      filePath,
      1, // stale hint — no longer points at the right line
      (line) => line.replace("[ ]", "[x]"),
      undefined,
      "Fix the bug" // fingerprint matching createFingerprint("- [ ] Fix the bug #bug")
    );

    const content = await readFile(filePath, "utf-8");
    expect(content).toContain("- [x] Fix the bug #bug");
  });

  it("does not lose an update across two sequential mutations to the same file", async () => {
    await writeFile(filePath, "- [ ] Bug one #bug\n- [ ] Bug two #bug\n", "utf-8");

    await modifyExternalFileLine(filePath, 0, (line) => line.replace("[ ]", "[x]"));
    await modifyExternalFileLine(filePath, 1, (line) => line.replace("[ ]", "[x]"));

    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("- [x] Bug one #bug\n- [x] Bug two #bug\n");
  });
});
