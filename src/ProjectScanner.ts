import { execFile } from "child_process";
import { existsSync } from "fs";
import { readdir } from "fs/promises";
import { basename, join } from "path";
import { detectStack, extractProjectTitle } from "./ProjectMetadata";

const MAX_BUFFER = 10 * 1024 * 1024; // 10 MB — git output here is small, generous headroom
const TAG = "[Warped Todo]";

// Electron/Obsidian doesn't inherit the user's shell PATH, so Homebrew binaries
// aren't visible via bare name (same issue DriveProvider.ts works around for rclone).
const GIT_SEARCH_PATHS = [
  "/usr/bin/git",          // macOS Xcode Command Line Tools
  "/opt/homebrew/bin/git", // macOS ARM Homebrew
  "/usr/local/bin/git",    // macOS Intel Homebrew / manual install
  "git",                   // fallback: bare name (works if PATH is set)
];

// "archive" matches `p`'s own default filter_dirs — archived/backup copies of a
// project are common and shouldn't surface as a second project of the same name.
export const DEFAULT_EXCLUDE_DIRS = ["node_modules", "dist", "build", "archive"];
const DEFAULT_MAX_DEPTH = 3;

export interface ScannedProject {
  /** Repo folder name — becomes the project tag (see ProjectManager). */
  name: string;
  /** Absolute path to the repo root. */
  localPath: string;
  /** Current branch name; "" if detached HEAD or unborn. */
  branch: string;
  /** Short status summary: "" clean, "M" tracked changes, "?" untracked files, "M?" both. */
  gitStatus: string;
  /** origin remote URL; "" if no remote is configured. */
  remote: string;
  /** README's first `#` heading, ASCII-filtered; falls back to `name` if there's no README/heading. See ProjectMetadata.ts. */
  title: string;
  /** Detected technologies (marker files, package.json deps, monorepo subdirs). See ProjectMetadata.ts. */
  stack: string[];
}

export interface ProjectScannerOptions {
  baseFolder: string;
  maxDepth?: number;
  excludeDirs?: string[];
}

/**
 * Finds git repos under a base folder and reads branch/status/remote for each via
 * `git` directly (child_process, no external tool dependency — see IDEAS.md's
 * "Prior art: ~/projects/peep" decision for why this isn't shelling out to `p`).
 */
export class ProjectScanner {
  private gitPath: string | null = null;

  async scan(options: ProjectScannerOptions): Promise<ScannedProject[]> {
    if (!options.baseFolder) return [];
    if (!(await this.resolveGitPath())) {
      console.error(TAG, "git binary not found in any search path:", GIT_SEARCH_PATHS.join(", "));
      return [];
    }

    const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    const excludeDirs = new Set(options.excludeDirs ?? DEFAULT_EXCLUDE_DIRS);

    const repoPaths: string[] = [];
    await this.walk(options.baseFolder, 0, maxDepth, excludeDirs, repoPaths);

    const projects: ScannedProject[] = [];
    for (const repoPath of repoPaths) {
      try {
        projects.push(await this.readProject(repoPath, [...excludeDirs]));
      } catch (error) {
        console.error(TAG, `Failed to read git facts for ${repoPath}:`, error);
      }
    }
    return projects;
  }

  /**
   * Walks `dir` for git repos. A directory-`.git` entry marks a full repo and stops
   * recursion there — a repo's own working tree isn't scanned for further nested
   * projects, so an incidental clone vendored inside one repo doesn't surface as a
   * top-level project of its own. A `.git` *file* marks a submodule or worktree
   * checkout — not a project on its own, but the walk still recurses past it to
   * find real repos nested deeper (see OUTLINE.md's submodule-skip decision).
   */
  private async walk(
    dir: string,
    depth: number,
    maxDepth: number,
    excludeDirs: Set<string>,
    found: string[]
  ): Promise<void> {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable directory — permissions, broken symlink, etc.
    }

    const gitEntry = entries.find((e) => e.name === ".git");
    if (gitEntry) {
      if (gitEntry.isDirectory()) {
        found.push(dir);
        return;
      }
      // .git file (submodule/worktree marker) — not a project, keep recursing.
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".git" || excludeDirs.has(entry.name)) continue;
      await this.walk(join(dir, entry.name), depth + 1, maxDepth, excludeDirs, found);
    }
  }

  private async readProject(repoPath: string, excludeDirs: string[]): Promise<ScannedProject> {
    const [branch, statusLines, remote] = await Promise.all([
      this.run(["branch", "--show-current"], repoPath).then((out) => out.trim()),
      this.run(["status", "--porcelain"], repoPath).then((out) =>
        out.split("\n").filter((line) => line.length > 0)
      ),
      this.run(["remote", "get-url", "origin"], repoPath)
        .then((out) => out.trim())
        .catch(() => ""), // no remote configured — not an error
    ]);

    const hasModified = statusLines.some((line) => !line.startsWith("??"));
    const hasUntracked = statusLines.some((line) => line.startsWith("??"));
    const gitStatus = `${hasModified ? "M" : ""}${hasUntracked ? "?" : ""}`;
    const name = basename(repoPath);

    return {
      name,
      localPath: repoPath,
      branch,
      gitStatus,
      remote,
      title: extractProjectTitle(repoPath) ?? name,
      stack: detectStack(repoPath, excludeDirs),
    };
  }

  /**
   * True if `filePath` (absolute, inside the repo at `repoPath`) has no
   * uncommitted changes. Phase 6's safety net for the header-block move —
   * a bad move is always recoverable via `git checkout -- <file>` as long as
   * this was true beforehand. Returns false (refuse) if git can't be
   * resolved at all, rather than assuming clean.
   */
  async isFileClean(repoPath: string, filePath: string): Promise<boolean> {
    if (!(await this.resolveGitPath())) return false;
    try {
      const output = await this.run(["status", "--porcelain", "--", filePath], repoPath);
      return output.trim().length === 0;
    } catch {
      return false;
    }
  }

  private async resolveGitPath(): Promise<boolean> {
    if (this.gitPath) return true;

    for (const candidate of GIT_SEARCH_PATHS) {
      // Bare name ("git") can't be stat'd — try execFile directly and let it fail.
      if (candidate.includes("/") && !existsSync(candidate)) continue;
      try {
        await this.tryBinary(candidate);
        this.gitPath = candidate;
        return true;
      } catch {
        // not usable at this path — try the next candidate
      }
    }
    return false;
  }

  private tryBinary(bin: string): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(bin, ["--version"], { maxBuffer: MAX_BUFFER }, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  private run(args: string[], cwd: string): Promise<string> {
    if (!this.gitPath) {
      return Promise.reject(new Error("git path not resolved — call scan() first."));
    }
    return new Promise((resolve, reject) => {
      execFile(this.gitPath!, args, { cwd, maxBuffer: MAX_BUFFER }, (err, stdout, stderr) => {
        if (err) {
          const detail = stderr?.trim() || err.message;
          reject(new Error(`git ${args[0]} failed in ${cwd}: ${detail}`));
          return;
        }
        resolve(stdout);
      });
    });
  }
}
