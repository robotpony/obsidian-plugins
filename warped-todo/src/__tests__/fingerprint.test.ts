import { describe, it, expect } from "vitest";
import { createFingerprint, resolveLineNumber } from "../utils";

// ---------------------------------------------------------------------------
// createFingerprint
// ---------------------------------------------------------------------------

describe("createFingerprint", () => {
  it("strips #tags", () => {
    expect(createFingerprint("Fix the bug #todo #p1")).toBe("Fix the bug");
  });

  it("strips header markers", () => {
    expect(createFingerprint("## My Project #todo #focus")).toBe("My Project");
  });

  it("strips list dash marker", () => {
    expect(createFingerprint("- Fix the bug #todo")).toBe("Fix the bug");
  });

  it("strips list asterisk marker", () => {
    expect(createFingerprint("* Fix the bug #todo")).toBe("Fix the bug");
  });

  it("strips list plus marker", () => {
    expect(createFingerprint("+ Fix the bug #todo")).toBe("Fix the bug");
  });

  it("strips numbered list marker", () => {
    expect(createFingerprint("1. Fix the bug #todo")).toBe("Fix the bug");
  });

  it("strips open checkbox", () => {
    expect(createFingerprint("- [ ] Fix the bug #todo")).toBe("Fix the bug");
  });

  it("strips checked checkbox", () => {
    expect(createFingerprint("- [x] Fix the bug #todone @2026-01-15")).toBe("Fix the bug");
  });

  it("strips @date annotations", () => {
    expect(createFingerprint("- Fix the bug #todone @2026-03-26")).toBe("Fix the bug");
  });

  it("strips block reference IDs", () => {
    expect(createFingerprint("Some idea #idea ^abc123")).toBe("Some idea");
  });

  it("strips inline code spans before tag extraction", () => {
    expect(createFingerprint("Use `#todo` in your file #todo")).toBe("Use  in your file");
  });

  it("returns empty string for tag-only lines", () => {
    expect(createFingerprint("#todo")).toBe("");
  });

  it("returns empty string for marker + tag lines", () => {
    expect(createFingerprint("- [ ] #todo")).toBe("");
  });

  it("preserves wikilinks", () => {
    expect(createFingerprint("- Fix [[linked page]] #todo")).toBe("Fix [[linked page]]");
  });

  it("preserves bold and italic", () => {
    expect(createFingerprint("- **Important** task #todo #p0")).toBe("**Important** task");
  });

  it("handles plain text with no tags", () => {
    expect(createFingerprint("Just plain text")).toBe("Just plain text");
  });

  it("handles empty string", () => {
    expect(createFingerprint("")).toBe("");
  });

  it("collapses to empty after stripping all known content", () => {
    expect(createFingerprint("- [ ] #todo #idea #p0 @2026-01-01")).toBe("");
  });

  it("is stable across priority tag changes", () => {
    const before = createFingerprint("- Fix the bug #todo #p1");
    const after  = createFingerprint("- Fix the bug #todo #p0 #focus");
    expect(before).toBe(after);
  });

  it("is stable across completion", () => {
    const before = createFingerprint("- [ ] Fix the bug #todo");
    const after  = createFingerprint("- [x] Fix the bug #todone @2026-03-26");
    expect(before).toBe(after);
  });
});

// ---------------------------------------------------------------------------
// resolveLineNumber
// ---------------------------------------------------------------------------

describe("resolveLineNumber", () => {
  const lines = [
    "## Header one #todo",              // 0
    "- [ ] Alpha task #todo",            // 1
    "- [ ] Beta task #todo #p1",         // 2
    "- [ ] Gamma task #todo",            // 3
    "## Header two #idea",               // 4
    "- Some idea #idea",                 // 5
  ];

  it("returns hint when fingerprint matches at that line (fast path)", () => {
    expect(resolveLineNumber(lines, 1, "Alpha task")).toBe(1);
  });

  it("finds the line nearby when hint is stale", () => {
    // Beta task is at line 2; hint says line 0
    expect(resolveLineNumber(lines, 0, "Beta task")).toBe(2);
  });

  it("finds the line via full scan when outside the nearby window", () => {
    // "Some idea" is at line 5; hint is 0 which is far, but within 15 lines either direction,
    // so it's still found by the nearby search
    expect(resolveLineNumber(lines, 0, "Some idea")).toBe(5);
  });

  it("returns -1 when fingerprint is not found anywhere", () => {
    expect(resolveLineNumber(lines, 0, "Nonexistent task")).toBe(-1);
  });

  it("returns hint unchanged for empty fingerprint", () => {
    expect(resolveLineNumber(lines, 3, "")).toBe(3);
  });

  it("handles hint at last line", () => {
    expect(resolveLineNumber(lines, 5, "Some idea")).toBe(5);
  });

  it("handles hint beyond end of file (stale after deletion)", () => {
    // Hint 99 doesn't exist; fallback finds "Alpha task" at line 1
    expect(resolveLineNumber(lines, 99, "Alpha task")).toBe(1);
  });

  it("returns correct line when multiple similar lines exist", () => {
    const dupeLines = [
      "- Task one #todo",
      "- Task two #todo",
      "- Task one #todo",  // duplicate of line 0
    ];
    // Hint 0 matches "Task one" at line 0 immediately
    expect(resolveLineNumber(dupeLines, 0, "Task one")).toBe(0);
    // Hint 2 matches "Task one" at line 2 immediately
    expect(resolveLineNumber(dupeLines, 2, "Task one")).toBe(2);
    // Hint 1 (wrong line) — nearby search finds line 0 before line 2
    expect(resolveLineNumber(dupeLines, 1, "Task one")).toBe(0);
  });

  it("searches both directions symmetrically", () => {
    // Line 3 is equidistant from lines 1 and 5 when hint is 3
    const sym = [
      "- Unrelated #todo",    // 0
      "- Target item #todo",  // 1  — delta 2 before hint
      "- Other #todo",        // 2
      "- Something #todo",    // 3  — hint (no match)
      "- More #todo",         // 4
      "- Target item #todo",  // 5  — delta 2 after hint
    ];
    // Should find line 1 first (before checks before after in the delta loop)
    expect(resolveLineNumber(sym, 3, "Target item")).toBe(1);
  });
});
