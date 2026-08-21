#!/usr/bin/env node
// prebuild check: fails `npm run build` (the "before declaring done" build,
// per CLAUDE.md's release checklist) when plugin source has changed since
// HEAD but package.json/manifest.json's "version" hasn't moved.
//
// Deliberately scoped to `build`, not `dev` — there's no "predev" script, so
// the esbuild watch loop used for iterative work is untouched; this only
// blocks the production build that precedes a commit.
//
// Companion to .claude/hooks/check-version-bump.sh, which advises (doesn't
// block) at `git commit` time by checking the *staged* diff. This script
// checks the working tree against HEAD instead, so it catches an unbumped
// version earlier, before anything is even staged. Fails open: any
// unexpected condition (not a git repo, no HEAD yet, parse trouble) exits 0
// rather than blocking a build for reasons unrelated to the version check.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SUBSTANTIVE_RE = /^(src\/.*\.tsx?|main\.ts|main\.js|styles\.css)$/;
const TEST_RE = /\/__tests__\//;

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function versionAt(ref, file) {
  const raw = ref === null ? readFileSync(file, "utf8") : git(["show", `${ref}:${file}`]);
  if (raw === null) return null;
  try {
    return JSON.parse(raw).version ?? null;
  } catch {
    return null;
  }
}

function main() {
  if (git(["rev-parse", "--git-dir"]) === null) return; // not a repo — nothing to compare against
  if (git(["rev-parse", "HEAD"]) === null) return; // no commits yet

  const diff = git(["diff", "--name-only", "HEAD"]);
  if (diff === null) return;

  // `git diff --name-only HEAD` only covers tracked files (staged or not) —
  // it silently skips a brand-new source file until it's `git add`ed, which
  // let real substantive changes through the check unnoticed. Union in
  // untracked files (respecting .gitignore) so a freshly-created src/*.ts
  // counts too.
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  if (untracked === null) return;

  const changed = new Set([
    ...diff.split("\n"),
    ...untracked.split("\n"),
  ]);

  const substantive = [...changed]
    .filter((f) => f && SUBSTANTIVE_RE.test(f) && !TEST_RE.test(f));
  if (substantive.length === 0) return;

  const headPkg = versionAt("HEAD", "package.json");
  const workingPkg = versionAt(null, "package.json");
  const headManifest = versionAt("HEAD", "manifest.json");
  const workingManifest = versionAt(null, "manifest.json");

  if (headPkg === null || workingPkg === null) return; // can't read a version — don't guess

  if (workingPkg !== headPkg || workingManifest !== headManifest) return; // already bumped

  console.error(
    `\nVersion wasn't bumped (still ${workingPkg}) but the working tree changes plugin source vs HEAD:\n` +
      substantive.map((f) => `  ${f}`).join("\n") +
      `\n\nCLAUDE.md's release checklist: bump package.json + manifest.json, and add a CHANGELOG.md entry.\n`,
  );
  process.exitCode = 1;
}

main();
