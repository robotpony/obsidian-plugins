import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { execFileSync } from "child_process";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { ProjectSyncManager, isUnderExcludedDir, touchesGitDir } from "../ProjectSyncManager";
import { ProjectScanner, ScannedProject } from "../ProjectScanner";
import { ParsedProjectItem } from "../StructuredFileParser";
import { createFakeApp, FakeVault } from "./stubs/fakeVault";

// Reworked per "remove the in-doc listing of TODOs":
// the vault note now carries frontmatter (git facts) only — synced items live
// in ProjectSyncManager's in-memory cache, read by the Projects sidebar, and
// are never written into the note body. See ProjectSyncManager's class doc
// comment for why (a genuine content-flicker loop against TodoScanner's own
// checkbox<->tag correction, plus every sync being a disruptive write to a
// note that might be open for editing). Uses the in-memory FakeVault (not a
// real Obsidian vault) plus real git fixtures on disk for the syncAll
// integration tests, same split as prior phases.

const PROJECTS_FOLDER = "projects/";

function scannedFixture(overrides: Partial<ScannedProject> = {}): ScannedProject {
  return {
    name: "peep",
    localPath: "/repos/peep",
    branch: "main",
    gitStatus: "",
    remote: "https://github.com/robotpony/peep.git",
    title: "peep",
    stack: [],
    readmeSummary: null,
    lastUpdated: null,
    ...overrides,
  };
}

function item(overrides: Partial<ParsedProjectItem> = {}): ParsedProjectItem {
  return {
    sourceFile: "/repos/peep/BUGS.md",
    lineNumber: 0,
    fingerprint: "Fix the widget",
    text: "- [ ] Fix the widget #bug",
    hasCheckbox: true,
    itemType: "bug",
    completed: false,
    tags: ["#bug"],
    shape: "checkbox",
    ...overrides,
  };
}

describe("ProjectSyncManager.syncProject: creating a new note", () => {
  it("creates the note with frontmatter and a plain template body — no item content", async () => {
    const { app, vault } = createFakeApp();
    const manager = new ProjectSyncManager(app as any);

    await manager.syncProject(scannedFixture(), [item()], PROJECTS_FOLDER);

    const content = vault.getRawContent("projects/peep.md");
    expect(content).toBeDefined();
    expect(content).toContain('project: "peep"');
    expect(content).toContain('repo: "/repos/peep"');
    expect(content).toContain('remote: "https://github.com/robotpony/peep.git"');
    expect(content).toContain('branch: "main"');
    expect(content).toContain("#peep");
    expect(content).toContain("## Guiding Principles #principles");
    expect(content).toContain("## Overview");
    // Guiding Principles sits before Overview — "at the top" of the note.
    expect(content!.indexOf("## Guiding Principles")).toBeLessThan(content!.indexOf("## Overview"));
    expect(content).toContain('cssclasses: "warped-todo-project-note"');
    // No leading "# name" heading — Obsidian's own file-title display already
    // shows the note's name; a duplicate heading here just repeated it
    // (found via live testing/screenshot review: "peep" appeared 3 times).
    expect(content).not.toMatch(/^# peep$/m);
    // No item content — items live in the sidebar's cache only.
    expect(content).not.toContain("Fix the widget");
  });

  it("creates the projects folder first", async () => {
    const { app, vault } = createFakeApp();
    const manager = new ProjectSyncManager(app as any);

    await manager.syncProject(scannedFixture(), [], PROJECTS_FOLDER);

    // getAbstractFileByPath on the folder path should now resolve to something (a folder marker).
    expect(vault.getAbstractFileByPath("projects")).not.toBeNull();
  });
});

describe("ProjectSyncManager.syncProject: updating an existing note", () => {
  it("preserves a hand-added frontmatter key and the entire body verbatim", async () => {
    const { app, vault } = createFakeApp();
    const manager = new ProjectSyncManager(app as any);

    vault.setRawContent(
      "projects/peep.md",
      [
        "---",
        'project: "peep"',
        'repo: "/repos/peep"',
        'remote: "https://github.com/robotpony/peep.git"',
        'branch: "main"',
        'gitStatus: ""',
        'lastSynced: "2026-01-01T00:00:00.000Z"',
        "status: favourite",
        "---",
        "",
        "# peep",
        "",
        "#peep",
        "",
        "## Overview",
        "",
        "Notes I wrote by hand. Do not touch.",
        "",
      ].join("\n")
    );

    await manager.syncProject(scannedFixture({ gitStatus: "M" }), [item()], PROJECTS_FOLDER);

    const content = vault.getRawContent("projects/peep.md")!;
    expect(content).toContain("status: favourite"); // preserved, not sync-owned
    expect(content).toContain("Notes I wrote by hand. Do not touch."); // body untouched
    expect(content).toContain('gitStatus: "M"'); // sync-owned key updated
    expect(content).toContain('cssclasses: "warped-todo-project-note"'); // added, wasn't set before
  });

  it("appends the hide-properties class to an existing bare cssclasses value instead of skipping it", async () => {
    const { app, vault } = createFakeApp();
    const manager = new ProjectSyncManager(app as any);

    vault.setRawContent(
      "projects/peep.md",
      [
        "---",
        'project: "peep"',
        'repo: "/repos/peep"',
        'remote: "https://github.com/robotpony/peep.git"',
        'branch: "main"',
        'gitStatus: ""',
        'lastSynced: "2026-01-01T00:00:00.000Z"',
        "cssclasses: my-custom-style",
        "---",
        "",
      ].join("\n")
    );

    await manager.syncProject(scannedFixture(), [item()], PROJECTS_FOLDER);

    const content = vault.getRawContent("projects/peep.md")!;
    // Both classes present, re-emitted as an inline array — not skipped
    // entirely the way an earlier version of this merge did, which left
    // notes with any pre-existing cssclasses never getting the hide class
    // (their Properties panel just stayed visible forever).
    expect(content).toContain('cssclasses: ["my-custom-style", "warped-todo-project-note"]');
  });

  it("doesn't duplicate the hide-properties class if a resync finds it already appended", async () => {
    const { app, vault } = createFakeApp();
    const manager = new ProjectSyncManager(app as any);

    vault.setRawContent(
      "projects/peep.md",
      [
        "---",
        'project: "peep"',
        'repo: "/repos/peep"',
        'remote: "https://github.com/robotpony/peep.git"',
        'branch: "main"',
        'gitStatus: ""',
        'lastSynced: "2026-01-01T00:00:00.000Z"',
        'cssclasses: ["my-custom-style", "warped-todo-project-note"]',
        "---",
        "",
      ].join("\n")
    );

    await manager.syncProject(scannedFixture({ gitStatus: "M" }), [item()], PROJECTS_FOLDER);

    const content = vault.getRawContent("projects/peep.md")!;
    const occurrences = content.match(/warped-todo-project-note/g) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(content).toContain('cssclasses: ["my-custom-style", "warped-todo-project-note"]');
  });

  it("is idempotent: two syncs with no underlying change produce identical frontmatter and body (aside from lastSynced)", async () => {
    const { app, vault } = createFakeApp();
    const manager = new ProjectSyncManager(app as any);

    await manager.syncProject(scannedFixture(), [item()], PROJECTS_FOLDER);
    const first = vault.getRawContent("projects/peep.md")!;

    await manager.syncProject(scannedFixture(), [item()], PROJECTS_FOLDER);
    const second = vault.getRawContent("projects/peep.md")!;

    const stripLastSynced = (s: string) => s.replace(/lastSynced: "[^"]*"/, "lastSynced: STRIPPED");
    expect(stripLastSynced(first)).toBe(stripLastSynced(second));
  });

  // Bug found via live testing: bumping lastSynced on every sync made every
  // sync a write, which floods Obsidian's own "modified externally" notice on
  // a note open for editing (each vault.modify() on an open file triggers it)
  // — and, since items no longer touch the note either, there is now *never*
  // a reason to write on an unchanged project.
  it("does not write to the note at all when nothing but lastSynced would change", async () => {
    const { app, vault } = createFakeApp();
    const manager = new ProjectSyncManager(app as any);

    await manager.syncProject(scannedFixture(), [item()], PROJECTS_FOLDER);
    const modifySpy = vi.spyOn(vault, "modify");

    await manager.syncProject(scannedFixture(), [item()], PROJECTS_FOLDER);

    expect(modifySpy).not.toHaveBeenCalled();
  });

  it("does not write to the note when only the item list changes (items aren't part of the note)", async () => {
    const { app, vault } = createFakeApp();
    const manager = new ProjectSyncManager(app as any);

    await manager.syncProject(scannedFixture(), [item()], PROJECTS_FOLDER);
    const modifySpy = vi.spyOn(vault, "modify");

    await manager.syncProject(scannedFixture(), [item({ text: "- [ ] A completely different item" })], PROJECTS_FOLDER);

    expect(modifySpy).not.toHaveBeenCalled();
  });

  it("does write when something real (a git fact) changes, even though lastSynced also changes", async () => {
    const { app, vault } = createFakeApp();
    const manager = new ProjectSyncManager(app as any);

    await manager.syncProject(scannedFixture(), [item()], PROJECTS_FOLDER);
    const modifySpy = vi.spyOn(vault, "modify");

    await manager.syncProject(scannedFixture({ gitStatus: "M?" }), [item()], PROJECTS_FOLDER);

    expect(modifySpy).toHaveBeenCalledTimes(1);
    expect(vault.getRawContent("projects/peep.md")).toContain('gitStatus: "M?"');
  });
});

describe("ProjectSyncManager: item cache", () => {
  it("getCachedItems returns [] for a project that has never been synced", () => {
    const { app } = createFakeApp();
    const manager = new ProjectSyncManager(app as any);
    expect(manager.getCachedItems("/repos/never-synced")).toEqual([]);
  });

  it("syncProject populates the cache, readable via getCachedItems", async () => {
    const { app } = createFakeApp();
    const manager = new ProjectSyncManager(app as any);

    const items = [item(), item({ text: "Second item", itemType: "todo" })];
    await manager.syncProject(scannedFixture(), items, PROJECTS_FOLDER);

    expect(manager.getCachedItems("/repos/peep")).toEqual(items);
  });

  it("updateCachedItems sets the cache directly, with no vault I/O", async () => {
    const { app, vault } = createFakeApp();
    const manager = new ProjectSyncManager(app as any);
    const modifySpy = vi.spyOn(vault, "modify");
    const createSpy = vi.spyOn(vault, "create");

    const items = [item({ completed: true })];
    manager.updateCachedItems("/repos/peep", items);

    expect(manager.getCachedItems("/repos/peep")).toEqual(items);
    expect(modifySpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });
});

// ---------- syncAll: full integration against real git fixtures ----------

function initRepo(dir: string) {
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
}

describe("ProjectSyncManager.syncAll", () => {
  let base: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "warped-todo-syncall-"));
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it("discovers a repo, parses its BUGS.md into the cache, and writes a frontmatter-only note", async () => {
    const repoDir = join(base, "widget-tool");
    await mkdir(repoDir);
    initRepo(repoDir);
    await writeFile(
      join(repoDir, "BUGS.md"),
      "# Bugs\n\n## Open\n\n### Crashes on empty input\n\nSteps to reproduce...\n",
      "utf-8"
    );

    const { app, vault } = createFakeApp();
    const manager = new ProjectSyncManager(app as any, new ProjectScanner());

    const scanned = await manager.syncAll({ baseFolder: base, projectsFolder: PROJECTS_FOLDER });

    expect(scanned.map((p) => p.name)).toEqual(["widget-tool"]);
    const content = vault.getRawContent("projects/widget-tool.md");
    expect(content).toBeDefined();
    expect(content).not.toContain("Crashes on empty input");

    const cached = manager.getCachedItems(scanned[0].localPath);
    expect(cached.map((i) => i.text)).toEqual(
      expect.arrayContaining([expect.stringContaining("Crashes on empty input")])
    );
  });

  it("calls onSynced once per syncAll batch, with the scanned projects", async () => {
    const repoDir = join(base, "quiet-repo");
    await mkdir(repoDir);
    initRepo(repoDir);

    const { app } = createFakeApp();
    const received: ScannedProject[][] = [];
    const manager = new ProjectSyncManager(app as any, new ProjectScanner(), (scanned) =>
      received.push(scanned)
    );

    await manager.syncAll({ baseFolder: base, projectsFolder: PROJECTS_FOLDER });
    expect(received).toHaveLength(1);
    expect(received[0].map((p) => p.name)).toEqual(["quiet-repo"]);
  });

  // Found via a dry run against ~/projects: an archived/deployed copy of a repo
  // alongside the original is real and common (this machine has several). Without
  // dedup, two repos named the same thing silently overwrite each other's note.
  it("dedupes two repos with the same folder name, keeping the shallower path", async () => {
    const shallow = join(base, "widget-tool");
    await mkdir(shallow);
    initRepo(shallow);
    await writeFile(join(shallow, "TODO.md"), "- [ ] Real repo's todo\n", "utf-8");

    const nested = join(base, "old-backup", "nested", "widget-tool");
    await mkdir(nested, { recursive: true });
    initRepo(nested);
    await writeFile(join(nested, "TODO.md"), "- [ ] Archived copy's todo\n", "utf-8");

    const { app } = createFakeApp();
    const manager = new ProjectSyncManager(app as any, new ProjectScanner());

    const scanned = await manager.syncAll({ baseFolder: base, projectsFolder: PROJECTS_FOLDER, maxDepth: 5 });

    expect(scanned).toHaveLength(1);
    expect(scanned[0].localPath).toBe(shallow);
    const cached = manager.getCachedItems(shallow);
    expect(cached.map((i) => i.text).join("\n")).toContain("Real repo's todo");
    expect(cached.map((i) => i.text).join("\n")).not.toContain("Archived copy's todo");
  });
});

describe("ProjectSyncManager: watch lifecycle", () => {
  it("starts and stops without throwing", async () => {
    const base = await mkdtemp(join(tmpdir(), "warped-todo-watch-"));
    try {
      const { app } = createFakeApp();
      const manager = new ProjectSyncManager(app as any);

      expect(() =>
        manager.startWatching({ baseFolder: base, projectsFolder: PROJECTS_FOLDER })
      ).not.toThrow();
      expect(() => manager.stopWatching()).not.toThrow();
      // Stopping twice (e.g. plugin unload after an already-stopped watcher) must be safe too.
      expect(() => manager.stopWatching()).not.toThrow();
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("does nothing (no throw) when the base folder doesn't exist", () => {
    const { app } = createFakeApp();
    const manager = new ProjectSyncManager(app as any);
    expect(() =>
      manager.startWatching({ baseFolder: "/nonexistent/path/xyz", projectsFolder: PROJECTS_FOLDER })
    ).not.toThrow();
  });
});

describe("isUnderExcludedDir", () => {
  const excludeDirs = new Set(["node_modules", "dist", "build", "archive"]);

  it("matches when an excluded name is any path segment", () => {
    expect(isUnderExcludedDir("node_modules/some-pkg/index.js", excludeDirs)).toBe(true);
    expect(isUnderExcludedDir("widget-tool/dist/main.js", excludeDirs)).toBe(true);
    expect(isUnderExcludedDir("archive/old-repo/BUGS.md", excludeDirs)).toBe(true);
  });

  it("does not match a real path with no excluded segment", () => {
    expect(isUnderExcludedDir("widget-tool/BUGS.md", excludeDirs)).toBe(false);
  });

  it("does not false-positive on a substring match (e.g. 'redistribute' contains 'dist')", () => {
    expect(isUnderExcludedDir("widget-tool/redistribute/notes.md", excludeDirs)).toBe(false);
  });
});

describe("ProjectSyncManager: watch cooldown after a completed sync", () => {
  // scheduleFlush/flush are only reachable via a real fs.watch callback in
  // production; accessed directly here (with fake timers) to test the
  // debounce+cooldown logic deterministically, without real fs events or
  // real waiting — same reasoning as "watch lifecycle" above for why this
  // suite doesn't assert on real-time event delivery. pendingFullResync is
  // set directly to exercise the full-resync branch of flush() specifically
  // — the scoped-resync branch has its own suite below.
  it("skips a watch-triggered sync that lands inside the cooldown of the previous one", async () => {
    vi.useFakeTimers();
    try {
      const { app } = createFakeApp();
      const manager = new ProjectSyncManager(app as any, new ProjectScanner());
      const syncAllSpy = vi.spyOn(manager, "syncAll").mockResolvedValue([]);
      const options = { baseFolder: "/fake", projectsFolder: PROJECTS_FOLDER };

      (manager as any).lastSyncCompletedAt = Date.now();
      (manager as any).pendingFullResync = true;
      (manager as any).scheduleFlush(options);
      await vi.advanceTimersByTimeAsync(500); // past the 300ms debounce, inside the 1500ms cooldown

      expect(syncAllSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs a watch-triggered sync once the cooldown has elapsed", async () => {
    vi.useFakeTimers();
    try {
      const { app } = createFakeApp();
      const manager = new ProjectSyncManager(app as any, new ProjectScanner());
      const syncAllSpy = vi.spyOn(manager, "syncAll").mockResolvedValue([]);
      const options = { baseFolder: "/fake", projectsFolder: PROJECTS_FOLDER };

      (manager as any).lastSyncCompletedAt = Date.now() - 2000; // well past the 1500ms cooldown
      (manager as any).pendingFullResync = true;
      (manager as any).scheduleFlush(options);
      await vi.advanceTimersByTimeAsync(500);

      expect(syncAllSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ProjectSyncManager: scoped watch-triggered resync", () => {
  // A structured-file edit (BUGS.md etc.) inside a known project shouldn't
  // re-walk the base folder or re-run git for every other project — only
  // that one project's items (and, if the change touched .git/, its git
  // facts) should refresh. See flush()/syncOneProject()'s doc comments.

  it("resyncs only the touched project, leaving others untouched, when the changed path matches a known project and isn't under .git/", async () => {
    vi.useFakeTimers();
    try {
      const { app, vault } = createFakeApp();
      const manager = new ProjectSyncManager(app as any, new ProjectScanner());
      const options = { baseFolder: "/fake", projectsFolder: PROJECTS_FOLDER };
      const scanOneSpy = vi.spyOn((manager as any).scanner, "scanOne");
      const syncAllSpy = vi.spyOn(manager, "syncAll");

      (manager as any).lastScannedProjects = [
        scannedFixture({ name: "peep", localPath: "/repos/peep" }),
        scannedFixture({ name: "warped", localPath: "/repos/warped" }),
      ];
      (manager as any).lastSyncCompletedAt = Date.now() - 2000;

      const project = (manager as any).findProjectForPath("/repos/peep/BUGS.md");
      expect(project.name).toBe("peep");

      (manager as any).pendingProjects.set("/repos/peep", false); // false = no .git/ touch seen
      (manager as any).scheduleFlush(options);
      await vi.advanceTimersByTimeAsync(500);

      expect(syncAllSpy).not.toHaveBeenCalled();
      // Reused the cached git facts — no reason to shell out to git for a
      // BUGS.md edit, which can't have changed branch/status/remote.
      expect(scanOneSpy).not.toHaveBeenCalled();
      expect(vault.getRawContent("projects/peep.md")).toBeDefined();
      expect(vault.getRawContent("projects/warped.md")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes git facts via scanOne when the changed path is under .git/", async () => {
    vi.useFakeTimers();
    try {
      const { app } = createFakeApp();
      const manager = new ProjectSyncManager(app as any, new ProjectScanner());
      const options = { baseFolder: "/fake", projectsFolder: PROJECTS_FOLDER };
      const scanOneSpy = vi
        .spyOn((manager as any).scanner, "scanOne")
        .mockResolvedValue(scannedFixture({ localPath: "/repos/peep", branch: "feature" }));

      (manager as any).lastScannedProjects = [scannedFixture({ localPath: "/repos/peep" })];
      (manager as any).lastSyncCompletedAt = Date.now() - 2000;
      (manager as any).pendingProjects.set("/repos/peep", true); // true = a .git/ path was touched

      (manager as any).scheduleFlush(options);
      await vi.advanceTimersByTimeAsync(500);

      expect(scanOneSpy).toHaveBeenCalledWith("/repos/peep", expect.any(Array));
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to a full syncAll when the changed path matches no known project", async () => {
    vi.useFakeTimers();
    try {
      const { app } = createFakeApp();
      const manager = new ProjectSyncManager(app as any, new ProjectScanner());
      const options = { baseFolder: "/fake", projectsFolder: PROJECTS_FOLDER };
      const syncAllSpy = vi.spyOn(manager, "syncAll").mockResolvedValue([]);

      (manager as any).lastScannedProjects = [scannedFixture({ localPath: "/repos/peep" })];
      (manager as any).lastSyncCompletedAt = Date.now() - 2000;

      expect((manager as any).findProjectForPath("/repos/brand-new-repo/BUGS.md")).toBeUndefined();

      (manager as any).pendingFullResync = true;
      (manager as any).scheduleFlush(options);
      await vi.advanceTimersByTimeAsync(500);

      expect(syncAllSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("touchesGitDir", () => {
  it("matches a path with .git as any segment", () => {
    expect(touchesGitDir("peep/.git/index")).toBe(true);
    expect(touchesGitDir("peep/.git/refs/heads/main")).toBe(true);
  });

  it("does not match a plain project file", () => {
    expect(touchesGitDir("peep/BUGS.md")).toBe(false);
  });
});
