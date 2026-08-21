import { describe, it, expect } from "vitest";
import { homedir } from "os";
import { browsableUrl, homeRelativePath, guessProjectsFolder } from "../ProjectsSidebarView";

// UI-review round (see PLAN.md): remote should display as a bare, browsable
// URL with no protocol, and local path should display home-relativized —
// both so the sidebar shows something immediately recognizable rather than
// a raw string, with the full value still available via a title tooltip.

describe("browsableUrl", () => {
  it("converts an SSH remote to an https URL with .git stripped", () => {
    expect(browsableUrl("git@github.com:robotpony/peep.git")).toBe("https://github.com/robotpony/peep");
  });

  it("strips .git from an already-https remote", () => {
    expect(browsableUrl("https://github.com/robotpony/peep.git")).toBe("https://github.com/robotpony/peep");
  });
});

describe("display text derived from browsableUrl (protocol stripped for the sidebar label)", () => {
  it("drops the https:// prefix, leaving a bare host/path", () => {
    const display = browsableUrl("git@github.com:robotpony/peep.git").replace(/^https?:\/\//, "");
    expect(display).toBe("github.com/robotpony/peep");
  });
});

describe("homeRelativePath", () => {
  it("replaces the home directory prefix with ~", () => {
    expect(homeRelativePath(`${homedir()}/projects/peep`)).toBe("~/projects/peep");
  });

  it("returns just ~ for the home directory itself", () => {
    expect(homeRelativePath(homedir())).toBe("~");
  });

  it("leaves a path outside the home directory alone", () => {
    expect(homeRelativePath("/var/repos/peep")).toBe("/var/repos/peep");
  });

  it("does not false-positive on a sibling directory that merely shares the home dir as a prefix (e.g. /Users/mxavier vs /Users/mx)", () => {
    const home = homedir();
    const sibling = `${home}xavier/projects/peep`; // no path separator between home and the extra chars
    expect(homeRelativePath(sibling)).toBe(sibling);
  });
});

describe("guessProjectsFolder", () => {
  it("prefers ~/projects when it exists", () => {
    const home = "/Users/mx";
    const result = guessProjectsFolder(
      () => home,
      (path) => path === `${home}/projects`
    );
    expect(result).toBe("/Users/mx/projects");
  });

  it("falls back to the home directory when ~/projects doesn't exist", () => {
    const home = "/Users/mx";
    const result = guessProjectsFolder(() => home, () => false);
    expect(result).toBe(home);
  });
});
