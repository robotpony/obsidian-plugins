import { describe, it, expect } from "vitest";
import { App, TFile } from "obsidian";
import { ProjectManager } from "../ProjectManager";
import { TodoScanner } from "../TodoScanner";
import { ScannedProject } from "../ProjectScanner";
import { TodoItem } from "../types";
import { ParsedProjectItem } from "../StructuredFileParser";

// Phase 5 (see PLAN.md): ProjectManager.getProjects() merging tag-derived and
// repo-derived ProjectInfo. Uses a minimal fake TodoScanner (just getTodos()),
// same pattern as Phase 1's fake scanner for TodoProcessor.

function todoFixture(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    file: new TFile(),
    filePath: "projects/peep.md",
    folder: "projects",
    lineNumber: 0,
    fingerprint: "",
    text: "",
    hasCheckbox: true,
    tags: ["#todo", "#peep"],
    dateCreated: 1000,
    mentions: [],
    ...overrides,
  };
}

function scannedFixture(overrides: Partial<ScannedProject> = {}): ScannedProject {
  return {
    name: "peep",
    localPath: "/Users/mx/projects/peep",
    branch: "main",
    gitStatus: "",
    remote: "https://github.com/robotpony/peep.git",
    title: "peep",
    stack: [],
    readmeSummary: null,
    ...overrides,
  };
}

function makeManager(todos: TodoItem[], excludeFolders: string[] = []): ProjectManager {
  const fakeScanner = { getTodos: () => todos } as unknown as TodoScanner;
  return new ProjectManager(new App(), fakeScanner, "projects/", ["#p0", "#p1", "#p2", "#p3", "#p4"], excludeFolders);
}

describe("ProjectManager.resolveProjectTags", () => {
  // Extracted from getProjects()'s aggregation loop so render-path code
  // (SidebarView styling a vault TODO block to match its project) can
  // resolve one item's tag(s) without duplicating this precedence.

  it("returns explicit project tags when present, ignoring folder inference entirely", () => {
    const manager = makeManager([]);
    const todo = todoFixture({ folder: "inbox", tags: ["#todo", "#peep"], inferredFileTag: "#unrelated" });
    expect(manager.resolveProjectTags(todo)).toEqual(["#peep"]);
  });

  it("can return multiple explicit project tags on one TODO", () => {
    const manager = makeManager([]);
    const todo = todoFixture({ tags: ["#todo", "#peep", "#warped"] });
    expect(manager.resolveProjectTags(todo)).toEqual(["#peep", "#warped"]);
  });

  it("falls back to the inferred file tag for a file under the projects folder with no explicit tag", () => {
    const manager = makeManager([]);
    const todo = todoFixture({ folder: "projects", tags: ["#todo"], inferredFileTag: "#portfolio-review" });
    expect(manager.resolveProjectTags(todo)).toEqual(["#portfolio-review"]);
  });

  it("does not infer a project tag for a file outside the projects folder", () => {
    const manager = makeManager([]);
    const todo = todoFixture({ folder: "inbox", tags: ["#todo"], inferredFileTag: "#some-note" });
    expect(manager.resolveProjectTags(todo)).toEqual([]);
  });

  it("does not infer a project tag for a file under an excluded subfolder of the projects folder", () => {
    const manager = makeManager([], ["projects/archive"]);
    const todo = todoFixture({ folder: "projects/archive", tags: ["#todo"], inferredFileTag: "#old-project" });
    expect(manager.resolveProjectTags(todo)).toEqual([]);
  });

  it("returns nothing for a TODO with neither an explicit tag nor an inferred file tag", () => {
    const manager = makeManager([]);
    const todo = todoFixture({ folder: "projects", tags: ["#todo"] });
    expect(manager.resolveProjectTags(todo)).toEqual([]);
  });
});

describe("ProjectManager.isInProjectsFolder", () => {
  // Backs SidebarView's project-block styling, deliberately independent of
  // resolveProjectTags()'s explicit-tag-first precedence — a TODO tagged
  // #work sitting in a projects/ note is still a projects/ note; a TODO
  // tagged #work sitting in an unrelated folder is not. See
  // resolveProjectBlockMatch's own comment for the bug this fixed: styling
  // driven by resolveProjectTags() made any generic context tag (e.g.
  // #work) look like a project, regardless of the file it was in.

  it("is true for a file directly under the projects folder", () => {
    const manager = makeManager([]);
    expect(manager.isInProjectsFolder("projects")).toBe(true);
  });

  it("is true for a file in a subfolder of the projects folder", () => {
    const manager = makeManager([]);
    expect(manager.isInProjectsFolder("projects/archive")).toBe(true);
  });

  it("is false for a file outside the projects folder", () => {
    const manager = makeManager([]);
    expect(manager.isInProjectsFolder("logs")).toBe(false);
  });

  it("is false for a file under an excluded subfolder", () => {
    const manager = makeManager([], ["projects/archive"]);
    expect(manager.isInProjectsFolder("projects/archive")).toBe(false);
    expect(manager.isInProjectsFolder("projects")).toBe(true); // exclusion is scoped to the subfolder
  });
});

describe("ProjectManager.getProjects: tag-only (no scannedProjects passed)", () => {
  it("behaves exactly as before — unaffected by the merge when nothing is passed", () => {
    const manager = makeManager([todoFixture({ tags: ["#todo", "#personal"] })]);
    const projects = manager.getProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].tag).toBe("#personal");
    expect(projects[0].localPath).toBeUndefined();
  });
});

describe("ProjectManager.getProjects: merging with scannedProjects", () => {
  it("adds repo facts to a tag-derived project whose name matches a detected repo", () => {
    const manager = makeManager([todoFixture({ tags: ["#todo", "#peep"] })]);
    const projects = manager.getProjects([scannedFixture()]);

    expect(projects).toHaveLength(1);
    expect(projects[0].tag).toBe("#peep");
    expect(projects[0].count).toBe(1); // tag-derived data untouched
    expect(projects[0].localPath).toBe("/Users/mx/projects/peep");
    expect(projects[0].branch).toBe("main");
  });

  it("adds an entry for a detected repo with zero tracked items", () => {
    const manager = makeManager([todoFixture({ tags: ["#todo", "#unrelated-project"] })]);
    const projects = manager.getProjects([scannedFixture({ name: "quiet-repo" })]);

    expect(projects).toHaveLength(2);
    const quiet = projects.find((p) => p.tag === "#quiet-repo");
    expect(quiet).toBeDefined();
    expect(quiet!.count).toBe(0);
    expect(quiet!.localPath).toBe("/Users/mx/projects/peep");
  });

  it("leaves a tag-only project (no matching repo) exactly as tag-derived", () => {
    const manager = makeManager([todoFixture({ tags: ["#todo", "#personal"] })]);
    const projects = manager.getProjects([scannedFixture({ name: "peep" })]);

    const personal = projects.find((p) => p.tag === "#personal");
    expect(personal).toBeDefined();
    expect(personal!.localPath).toBeUndefined();
  });

  it("passing an empty scannedProjects array is a no-op", () => {
    const manager = makeManager([todoFixture({ tags: ["#todo", "#peep"] })]);
    const withEmpty = manager.getProjects([]);
    const withNone = manager.getProjects();
    expect(withEmpty).toEqual(withNone);
  });
});

function syncedItemFixture(overrides: Partial<ParsedProjectItem> = {}): ParsedProjectItem {
  return {
    sourceFile: "/Users/mx/projects/peep/TODO.md",
    lineNumber: 0,
    fingerprint: "",
    text: "- Add caching",
    hasCheckbox: false,
    itemType: "todo",
    completed: false,
    tags: [],
    shape: "plainBullet",
    ...overrides,
  };
}

// Folding synced items (ProjectSyncManager.getCachedItems()) into
// count/highestPriority/hasFocusItems — see DESIGN.md's "Project blocks in
// the TODOs/Ideas tabs".
describe("ProjectManager.getProjects: folding synced items via getCachedItems", () => {
  it("omitting getCachedItems leaves the merge untouched", () => {
    const manager = makeManager([todoFixture({ tags: ["#todo", "#peep"] })]);
    const withLookup = manager.getProjects([scannedFixture()], () => [syncedItemFixture({ tags: ["#focus"] })]);
    const without = manager.getProjects([scannedFixture()]);
    expect(without[0].hasFocusItems).toBe(false);
    expect(withLookup[0].hasFocusItems).toBe(true);
  });

  it("adds synced item count on top of the vault-derived count", () => {
    const manager = makeManager([todoFixture({ tags: ["#todo", "#peep"] })]);
    const projects = manager.getProjects([scannedFixture()], () => [
      syncedItemFixture(),
      syncedItemFixture({ lineNumber: 1 }),
    ]);
    expect(projects[0].count).toBe(3); // 1 vault + 2 synced
  });

  it("a synced #focus item sets hasFocusItems even with no vault #focus item", () => {
    const manager = makeManager([todoFixture({ tags: ["#todo", "#peep"] })]);
    const projects = manager.getProjects([scannedFixture()], () => [syncedItemFixture({ tags: ["#focus"] })]);
    expect(projects[0].hasFocusItems).toBe(true);
  });

  it("a synced #p0 item improves highestPriority over an unmarked vault item", () => {
    const manager = makeManager([todoFixture({ tags: ["#todo", "#peep"] })]); // no priority tag -> value 7
    const projects = manager.getProjects([scannedFixture()], () => [syncedItemFixture({ tags: ["#p0"] })]);
    expect(projects[0].highestPriority).toBe(2); // #p0
  });

  it("ignores completed synced items", () => {
    const manager = makeManager([todoFixture({ tags: ["#todo", "#peep"] })]);
    const projects = manager.getProjects([scannedFixture()], () => [
      syncedItemFixture({ completed: true, tags: ["#focus"] }),
    ]);
    expect(projects[0].count).toBe(1); // vault item only
    expect(projects[0].hasFocusItems).toBe(false);
  });

  it("leaves colourIndex untouched by synced items", () => {
    const manager = makeManager([todoFixture({ tags: ["#todo", "#peep"] })]);
    const without = manager.getProjects([scannedFixture()]);
    const withLookup = manager.getProjects([scannedFixture()], () => [syncedItemFixture({ tags: ["#p0"] })]);
    expect(withLookup[0].colourIndex).toBe(without[0].colourIndex);
  });

  it("gives a synced-only project (no localPath match issue) its own entry via zero-count repo merge", () => {
    const manager = makeManager([todoFixture({ tags: ["#todo", "#unrelated"] })]);
    const projects = manager.getProjects([scannedFixture({ name: "quiet-repo" })], (localPath) =>
      localPath === "/Users/mx/projects/peep" ? [syncedItemFixture({ tags: ["#focus"] })] : []
    );
    const quiet = projects.find((p) => p.tag === "#quiet-repo");
    expect(quiet).toBeDefined();
    expect(quiet!.count).toBe(1);
    expect(quiet!.hasFocusItems).toBe(true);
  });
});
