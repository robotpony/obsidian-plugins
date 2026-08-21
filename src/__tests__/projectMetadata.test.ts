import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, chmod, utimes } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { detectStack, extractProjectTitle, getRepoLastUpdated } from "../ProjectMetadata";

// See PLAN-focus-canvas.md's sibling context and ~/projects/peep/p's
// extract_project_name()/detect_technologies() — this module ports those
// two functions as native TypeScript, so these tests mirror the fixtures
// that spec's own behaviour depends on (marker files, package.json deps,
// monorepo subdirs, Python fallbacks).

describe("extractProjectTitle", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "warped-todo-title-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("strips non-ASCII glyphs and collapses whitespace from the README's first heading", async () => {
    await writeFile(join(dir, "README.md"), "# ␣⌘ Warped Command for Obsidian\n\nFocus on the right next task.\n");
    expect(extractProjectTitle(dir)).toBe("Warped Command for Obsidian");
  });

  it("accepts a lowercase readme.md", async () => {
    await writeFile(join(dir, "readme.md"), "# lowercase readme\n");
    expect(extractProjectTitle(dir)).toBe("lowercase readme");
  });

  it("returns null when the README has no top-level heading", async () => {
    await writeFile(join(dir, "README.md"), "## Only a subheading\n\nSome text.\n");
    expect(extractProjectTitle(dir)).toBeNull();
  });

  it("returns null when there's no README at all", async () => {
    expect(extractProjectTitle(dir)).toBeNull();
  });
});

describe("detectStack", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "warped-todo-stack-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("detects JS/node.js from a bare package.json", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "x" }));
    expect(detectStack(dir)).toEqual(["JS", "node.js"]);
  });

  it("adds typescript from package.json devDependencies", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "x", devDependencies: { typescript: "^5.0.0" } })
    );
    expect(detectStack(dir)).toEqual(["JS", "node.js", "typescript"]);
  });

  it("detects Python from requirements.txt", async () => {
    await writeFile(join(dir, "requirements.txt"), "requests\n");
    expect(detectStack(dir)).toEqual(["Python"]);
  });

  it("falls back to scanning for .py files when there's no marker file", async () => {
    await writeFile(join(dir, "main.py"), "print('hi')\n");
    expect(detectStack(dir)).toEqual(["Python"]);
  });

  it("detects an executable Python script by its shebang", async () => {
    const scriptPath = join(dir, "run");
    await writeFile(scriptPath, "#!/usr/bin/env python3\nprint('hi')\n");
    await chmod(scriptPath, 0o755);
    expect(detectStack(dir)).toEqual(["Python"]);
  });

  it("finds a monorepo subpackage's marker file one level deep", async () => {
    await mkdir(join(dir, "plugin-a"));
    await writeFile(join(dir, "plugin-a", "package.json"), JSON.stringify({ name: "a" }));
    expect(detectStack(dir)).toEqual(["JS", "node.js"]);
  });

  it("skips excluded subdirectories during the monorepo scan", async () => {
    await writeFile(join(dir, "README.md"), "# Real Project\n");
    await mkdir(join(dir, "node_modules"));
    await writeFile(join(dir, "node_modules", "package.json"), JSON.stringify({ name: "dep" }));
    expect(detectStack(dir, ["node_modules"])).toEqual(["n/a"]);
  });

  it("falls back to static website when only index.html is present", async () => {
    await writeFile(join(dir, "index.html"), "<html></html>\n");
    expect(detectStack(dir)).toEqual(["static website"]);
  });

  it("falls back to n/a for a planning-only project with no code", async () => {
    await writeFile(join(dir, "TODO.md"), "- [ ] plan this out\n");
    expect(detectStack(dir)).toEqual(["n/a"]);
  });

  it("returns an empty list for a directory with no signals at all", async () => {
    expect(detectStack(dir)).toEqual([]);
  });
});

describe("getRepoLastUpdated", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "warped-todo-lastupdated-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null for a repo with neither CHANGELOG.md nor README.md", () => {
    expect(getRepoLastUpdated(dir)).toBeNull();
  });

  it("returns README.md's mtime when there's no CHANGELOG", async () => {
    await writeFile(join(dir, "README.md"), "# A project\n");
    const mtime = new Date("2026-01-15T00:00:00Z");
    await utimes(join(dir, "README.md"), mtime, mtime);
    expect(getRepoLastUpdated(dir)).toBe(mtime.getTime());
  });

  it("prefers CHANGELOG.md's mtime over README.md's, even when README is more recently modified", async () => {
    await writeFile(join(dir, "CHANGELOG.md"), "## [1.0.0] - 2026-01-01\n");
    await writeFile(join(dir, "README.md"), "# A project\n");
    const changelogMtime = new Date("2026-01-01T00:00:00Z");
    const readmeMtime = new Date("2026-06-01T00:00:00Z"); // later than the changelog
    await utimes(join(dir, "CHANGELOG.md"), changelogMtime, changelogMtime);
    await utimes(join(dir, "README.md"), readmeMtime, readmeMtime);
    expect(getRepoLastUpdated(dir)).toBe(changelogMtime.getTime());
  });

  it("accepts a lowercase changelog.md", async () => {
    await writeFile(join(dir, "changelog.md"), "## [1.0.0]\n");
    const mtime = new Date("2026-03-01T00:00:00Z");
    await utimes(join(dir, "changelog.md"), mtime, mtime);
    expect(getRepoLastUpdated(dir)).toBe(mtime.getTime());
  });
});
