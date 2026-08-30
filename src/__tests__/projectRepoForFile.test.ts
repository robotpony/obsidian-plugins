import { describe, it, expect } from "vitest";
import type { TFile } from "obsidian";
import { getProjectRepoForFile } from "../utils";

// getProjectRepoForFile used to read a `repo` key from the note's own
// frontmatter. That key is gone (it churned the vault's git history), so the
// function now takes a resolver — backed in production by the live scan /
// projectSyncState via ProjectSyncManager.getRepoPathForProjectName.

function fakeFile(path: string): TFile {
  return {
    path,
    basename: path.split("/").pop()!.replace(/\.md$/, ""),
  } as unknown as TFile;
}

const resolve = (name: string) =>
  ({ peep: "/Users/x/projects/peep" } as Record<string, string>)[name];

describe("getProjectRepoForFile", () => {
  it("returns undefined for no file", () => {
    expect(getProjectRepoForFile(null, "projects/", resolve)).toBeUndefined();
  });

  it("resolves a project note by its basename", () => {
    expect(getProjectRepoForFile(fakeFile("projects/peep.md"), "projects/", resolve)).toBe(
      "/Users/x/projects/peep"
    );
  });

  it("returns undefined for a file outside the projects folder", () => {
    expect(
      getProjectRepoForFile(fakeFile("notes/peep.md"), "projects/", resolve)
    ).toBeUndefined();
  });

  it("returns undefined when the resolver has no path for that name", () => {
    expect(
      getProjectRepoForFile(fakeFile("projects/unknown.md"), "projects/", resolve)
    ).toBeUndefined();
  });

  it("skips the folder check when projectsFolder is empty", () => {
    expect(getProjectRepoForFile(fakeFile("peep.md"), "", resolve)).toBe("/Users/x/projects/peep");
  });
});
