import { describe, it, expect } from "vitest";
import { App, TFile } from "obsidian";
import { ProjectManager } from "../ProjectManager";
import { TodoScanner } from "../TodoScanner";
import { ScannedProject } from "../ProjectScanner";
import { TodoItem } from "../types";

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
    ...overrides,
  };
}

function makeManager(todos: TodoItem[]): ProjectManager {
  const fakeScanner = { getTodos: () => todos } as unknown as TodoScanner;
  return new ProjectManager(new App(), fakeScanner, "projects/", ["#p0", "#p1", "#p2", "#p3", "#p4"]);
}

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
