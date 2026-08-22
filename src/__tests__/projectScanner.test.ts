import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { ProjectScanner } from "../ProjectScanner";

// Repo discovery + git fact-gathering. Uses real `git init`
// fixtures rather than fabricated `.git` directories — readProject() shells to the
// real `git` binary, so the fixtures need to actually be repos for those calls to
// succeed, same as the walk-boundary cases need a real `.git` directory vs. file.

function initRepo(dir: string, opts: { remote?: string } = {}) {
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  if (opts.remote) {
    execFileSync("git", ["remote", "add", "origin", opts.remote], { cwd: dir });
  }
}

function commitFile(dir: string, name: string, content: string) {
  execFileSync("git", ["add", name], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", `add ${name}`], { cwd: dir });
  void content;
}

describe("ProjectScanner", () => {
  let base: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "warped-todo-scanner-"));
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it("finds a git repo at the base folder's immediate children", async () => {
    const repoDir = join(base, "peep");
    await mkdir(repoDir);
    initRepo(repoDir);

    const scanner = new ProjectScanner();
    const projects = await scanner.scan({ baseFolder: base });

    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("peep");
    expect(projects[0].localPath).toBe(repoDir);
    expect(projects[0].branch).toBe("main");
    expect(projects[0].gitStatus).toBe(""); // no commits yet, nothing tracked or untracked
  });

  it("does not recurse into a found repo's own working tree", async () => {
    const outer = join(base, "outer");
    await mkdir(outer);
    initRepo(outer);
    // A clone-like nested .git inside the outer repo's tree should never surface
    // as its own project — walk() stops recursing once outer itself is found.
    const nestedInsideRepo = join(outer, "vendor", "some-tool");
    await mkdir(nestedInsideRepo, { recursive: true });
    initRepo(nestedInsideRepo);

    const scanner = new ProjectScanner();
    const projects = await scanner.scan({ baseFolder: base });

    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("outer");
  });

  it("respects the depth cap", async () => {
    // base/level1/level2/level3repo — 3 levels below base, i.e. depth 3.
    const shallow = join(base, "shallow");
    await mkdir(shallow);
    initRepo(shallow);

    const deepPath = join(base, "level1", "level2", "level3repo");
    await mkdir(deepPath, { recursive: true });
    initRepo(deepPath);

    const shallowScan = await new ProjectScanner().scan({ baseFolder: base, maxDepth: 1 });
    expect(shallowScan.map((p) => p.name)).toEqual(["shallow"]);

    const deepScan = await new ProjectScanner().scan({ baseFolder: base, maxDepth: 3 });
    expect(deepScan.map((p) => p.name).sort()).toEqual(["level3repo", "shallow"]);
  });

  it("skips excluded directories entirely, even if they contain a repo", async () => {
    const excludedRepo = join(base, "node_modules", "some-pkg");
    await mkdir(excludedRepo, { recursive: true });
    initRepo(excludedRepo);

    const scanner = new ProjectScanner();
    const projects = await scanner.scan({ baseFolder: base });

    expect(projects).toHaveLength(0);
  });

  it("skips a .git FILE (submodule/worktree) as a project but recurses past it", async () => {
    const submoduleLike = join(base, "submodule-ish");
    await mkdir(submoduleLike, { recursive: true });
    // Fabricate the submodule marker: a `.git` *file*, not a directory.
    await writeFile(join(submoduleLike, ".git"), "gitdir: ../.git/modules/submodule-ish\n");

    const nestedReal = join(submoduleLike, "actually-a-repo");
    await mkdir(nestedReal);
    initRepo(nestedReal);

    const scanner = new ProjectScanner();
    const projects = await scanner.scan({ baseFolder: base });

    expect(projects.map((p) => p.name)).toEqual(["actually-a-repo"]);
  });

  it("reports gitStatus for modified, untracked, and clean trees", async () => {
    const modified = join(base, "modified-repo");
    await mkdir(modified);
    initRepo(modified);
    await writeFile(join(modified, "a.txt"), "one");
    commitFile(modified, "a.txt", "one");
    await writeFile(join(modified, "a.txt"), "two"); // tracked change, uncommitted

    const untracked = join(base, "untracked-repo");
    await mkdir(untracked);
    initRepo(untracked);
    await writeFile(join(untracked, "b.txt"), "new file, never added");

    const clean = join(base, "clean-repo");
    await mkdir(clean);
    initRepo(clean);
    await writeFile(join(clean, "c.txt"), "committed");
    commitFile(clean, "c.txt", "committed");

    const scanner = new ProjectScanner();
    const projects = await scanner.scan({ baseFolder: base });
    const byName = Object.fromEntries(projects.map((p) => [p.name, p]));

    expect(byName["modified-repo"].gitStatus).toBe("M");
    expect(byName["untracked-repo"].gitStatus).toBe("?");
    expect(byName["clean-repo"].gitStatus).toBe("");
  });

  it("reads the origin remote when configured, and blanks it when not", async () => {
    const withRemote = join(base, "with-remote");
    await mkdir(withRemote);
    initRepo(withRemote, { remote: "https://github.com/robotpony/peep.git" });

    const withoutRemote = join(base, "without-remote");
    await mkdir(withoutRemote);
    initRepo(withoutRemote);

    const scanner = new ProjectScanner();
    const projects = await scanner.scan({ baseFolder: base });
    const byName = Object.fromEntries(projects.map((p) => [p.name, p]));

    expect(byName["with-remote"].remote).toBe("https://github.com/robotpony/peep.git");
    expect(byName["without-remote"].remote).toBe("");
  });

  it("returns an empty list when no base folder is configured", async () => {
    const scanner = new ProjectScanner();
    expect(await scanner.scan({ baseFolder: "" })).toEqual([]);
  });

  describe("scanOne", () => {
    it("reads a single known repo's facts without walking the base folder", async () => {
      const repoDir = join(base, "peep");
      await mkdir(repoDir);
      initRepo(repoDir, { remote: "https://github.com/robotpony/peep.git" });

      const scanner = new ProjectScanner();
      const project = await scanner.scanOne(repoDir);

      expect(project.name).toBe("peep");
      expect(project.localPath).toBe(repoDir);
      expect(project.branch).toBe("main");
      expect(project.remote).toBe("https://github.com/robotpony/peep.git");
    });

    it("reflects a git-fact change (new branch) immediately, unlike a cached ScannedProject would", async () => {
      const repoDir = join(base, "peep");
      await mkdir(repoDir);
      initRepo(repoDir);
      await writeFile(join(repoDir, "a.txt"), "one");
      commitFile(repoDir, "a.txt", "one");
      execFileSync("git", ["checkout", "-q", "-b", "feature"], { cwd: repoDir });

      const scanner = new ProjectScanner();
      const project = await scanner.scanOne(repoDir);

      expect(project.branch).toBe("feature");
    });
  });
});
