import { describe, it, expect } from "vitest";
import { parseStructuredFile } from "../StructuredFileParser";

// Phase 3 (see PLAN.md): filename → default type, explicit-tag override, and the
// two item shapes (flat list, header report). Fixtures below are modeled on real
// files rather than read live, so the suite stays hermetic — including the
// exit-criteria test at the bottom, which originally read this repo's actual
// BUGS.md live (that's what Phase 3's exit criteria asked for) but was frozen
// to a fixture once that entry was fixed and cleared; see that test's own
// comment for why.

describe("parseStructuredFile: filename defaults and unrecognized files", () => {
  it("returns [] for a filename outside the recognized set", () => {
    expect(parseStructuredFile("README.md", "- [ ] Not tracked\n", "/repo/README.md")).toEqual([]);
  });

  it("defaults BUGS.md and ISSUES.md items to type bug", () => {
    const bugs = parseStructuredFile("BUGS.md", "- [ ] Crash on save\n", "/repo/BUGS.md");
    const issues = parseStructuredFile("ISSUES.md", "- [ ] Crash on save\n", "/repo/ISSUES.md");
    expect(bugs[0].itemType).toBe("bug");
    expect(issues[0].itemType).toBe("bug");
  });

  it("defaults TODO.md and TODOS.md items to type todo", () => {
    const a = parseStructuredFile("TODO.md", "- [ ] Ship it\n", "/repo/TODO.md");
    const b = parseStructuredFile("TODOS.md", "- [ ] Ship it\n", "/repo/TODOS.md");
    expect(a[0].itemType).toBe("todo");
    expect(b[0].itemType).toBe("todo");
  });

  it("defaults IDEAS.md items to type idea", () => {
    const ideas = parseStructuredFile("IDEAS.md", "- Add YAML export\n", "/repo/IDEAS.md");
    expect(ideas[0].itemType).toBe("idea");
  });
});

describe("parseStructuredFile: flat list shape (modeled on peep/TODO.md)", () => {
  const content = [
    "# Project TODOs",
    "",
    "## Completed ✓",
    "- ✓ Add error handling for malformed files (comprehensive error handling implemented)",
    "- ✓ Implement recursive directory scanning",
    "",
    "## Future Enhancements",
    "- Add caching mechanism for git operations to improve performance",
    "- Implement plugin system for custom technology detectors",
    "",
  ].join("\n");

  it("finds one item per top-level bullet, ignoring headings", () => {
    const items = parseStructuredFile("TODO.md", content, "/repo/TODO.md");
    expect(items).toHaveLength(4);
  });

  it("marks items under a Completed section as done, via the ✓ marker or the section", () => {
    const items = parseStructuredFile("TODO.md", content, "/repo/TODO.md");
    const completedItems = items.filter((i) => i.text.includes("Add error handling") || i.text.includes("recursive directory"));
    expect(completedItems.every((i) => i.completed)).toBe(true);
  });

  it("marks items under an unrecognized section (Future Enhancements) as open", () => {
    const items = parseStructuredFile("TODO.md", content, "/repo/TODO.md");
    const openItems = items.filter((i) => i.text.includes("caching mechanism") || i.text.includes("plugin system"));
    expect(openItems.every((i) => !i.completed)).toBe(true);
  });

  it("all items default to type todo (from the TODO.md filename)", () => {
    const items = parseStructuredFile("TODO.md", content, "/repo/TODO.md");
    expect(items.every((i) => i.itemType === "todo")).toBe(true);
  });
});

describe("parseStructuredFile: flat list with real checkboxes", () => {
  it("reads [ ] as open and [x] as completed", () => {
    const content = "- [ ] Open item\n- [x] Done item\n- [X] Also done (capital X)\n";
    const items = parseStructuredFile("TODO.md", content, "/repo/TODO.md");
    expect(items[0].completed).toBe(false);
    expect(items[1].completed).toBe(true);
    expect(items[2].completed).toBe(true);
    expect(items.every((i) => i.hasCheckbox)).toBe(true);
  });

  it("does not treat an indented sub-bullet as its own top-level item", () => {
    const content = "- [ ] Parent item\n  - Sub-detail, not a separate item\n";
    const items = parseStructuredFile("TODO.md", content, "/repo/TODO.md");
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe("- [ ] Parent item");
  });
});

describe("parseStructuredFile: header-report shape (modeled on warped-todo/BUGS.md)", () => {
  const content = [
    "# Bugs",
    "",
    "## Open",
    "",
    "### Tag cloud shows pills with zero matching TODOs",
    "",
    "**Found**: manual testing session.",
    "",
    "**Repro**:",
    "1. Do a thing.",
    "2. See the bug.",
    "",
    "**Root cause**: two different definitions disagree.",
    "",
    "- `renderActiveTodos` correctly excludes non-tasks.",
    "- `renderProjects` uses a looser filter and doesn't check the same thing.",
    "",
    "## Fixed",
    "",
    "### Table width miscalculates on narrow terminals",
    "",
    "Resolved by clamping to the minimum column width.",
    "",
  ].join("\n");

  it("uses the header-report shape, not flat-list, because ### headings are present", () => {
    // Sanity check on the tier-selection rule: presence of ### headings selects
    // header-report parsing even though this fixture (and the real BUGS.md) also
    // contains an incidental `-` bullet or two inside a body paragraph.
    const items = parseStructuredFile("BUGS.md", content, "/repo/BUGS.md");
    expect(items.every((i) => !i.hasCheckbox)).toBe(true);
  });

  it("finds one item per ### heading under ## Open and ## Fixed", () => {
    const items = parseStructuredFile("BUGS.md", content, "/repo/BUGS.md");
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.text)).toEqual([
      "Tag cloud shows pills with zero matching TODOs",
      "Table width miscalculates on narrow terminals",
    ]);
  });

  it("marks items under ## Open as not completed and ## Fixed as completed", () => {
    const items = parseStructuredFile("BUGS.md", content, "/repo/BUGS.md");
    expect(items[0].completed).toBe(false);
    expect(items[1].completed).toBe(true);
  });

  it("defaults to type bug (from the BUGS.md filename)", () => {
    const items = parseStructuredFile("BUGS.md", content, "/repo/BUGS.md");
    expect(items.every((i) => i.itemType === "bug")).toBe(true);
  });
});

describe("parseStructuredFile: explicit tag overrides the filename default", () => {
  it("an #idea tag inline in BUGS.md stays an idea, not a bug", () => {
    const content = "- [ ] Consider a plugin system for detectors #idea\n";
    const items = parseStructuredFile("BUGS.md", content, "/repo/BUGS.md");
    expect(items[0].itemType).toBe("idea");
  });

  it("an explicit tag in a header-report body overrides the default", () => {
    const content = [
      "## Open",
      "",
      "### Should image files be scanned at all?",
      "",
      "Worth reconsidering the whole approach here. #idea",
      "",
    ].join("\n");
    const items = parseStructuredFile("BUGS.md", content, "/repo/BUGS.md");
    expect(items[0].itemType).toBe("idea");
  });

  it("ignores a tag-like string inside a fenced code block", () => {
    const content = [
      "## Open",
      "",
      "### Real bug",
      "",
      "```",
      "# this looks like #idea but it's example output, not a tag",
      "```",
      "",
    ].join("\n");
    const items = parseStructuredFile("BUGS.md", content, "/repo/BUGS.md");
    expect(items[0].itemType).toBe("bug"); // filename default, not fooled by the fenced text
  });
});

describe("parseStructuredFile: neither shape matches", () => {
  it("returns [] for a file with no top-level bullets and no ### headings", () => {
    const content = "# Bugs\n\nJust a paragraph of prose, no items here.\n\n## Open\n\nStill just prose.\n";
    expect(parseStructuredFile("BUGS.md", content, "/repo/BUGS.md")).toEqual([]);
  });

  it("returns [] for an empty file", () => {
    expect(parseStructuredFile("TODO.md", "", "/repo/TODO.md")).toEqual([]);
  });
});

describe("parseStructuredFile: exit criteria — real BUGS.md shape (frozen fixture)", () => {
  // Originally read this repo's actual BUGS.md live, per Phase 3's exit
  // criteria (see PLAN.md): a prose bug write-up under "## Open", no
  // explicit #bug tag, parses as type bug and open. Frozen to a fixture
  // once that entry was fixed and cleared from BUGS.md — as its own header
  // comment says, BUGS.md is a working log whose content is expected to
  // churn; this test's job is the parsing behaviour, not that file's
  // present-day contents. Content below is the real write-up as it stood
  // 2026-08-14 through 2026-08-17 (see CHANGELOG.md [0.35.0]).
  it("parses a real header-report bug write-up: bug type, open, no explicit tag", () => {
    const content = `# Bugs

Working log for issues found in manual testing. Not a substitute for
\`CHANGELOG.md\` — entries here get folded into a changelog entry once fixed,
then removed from this file.

## Open

### Tag cloud shows pills with zero matching TODOs

**Found**: 2026-08-14, manual testing session.

**Repro**:
1. Have a header TODO whose real children are all \`#todone\`, but which also
   has a bold subheading child.
2. Open the TODOs sidebar tab.
3. Tag cloud shows a project pill with nothing behind it.
4. Click the pill.
5. **Expected**: either the pill doesn't appear, or clicking it shows the
   header. **Actual**: "No TODOs matching" — the pill is live but empty.

**Root cause**: two different definitions of "does this header still have
active work" that disagree between the tag cloud and the active list.

**Fix**: share one "has a real active child" helper between both callers.

**Files**: \`src/SidebarView.ts\` (\`renderProjects\`, \`renderActiveTodos\`)
`;

    const items = parseStructuredFile("BUGS.md", content, "/repo/BUGS.md");

    const tagCloudBug = items.find((i) => i.text.includes("Tag cloud shows pills with zero matching TODOs"));
    expect(tagCloudBug).toBeDefined();
    expect(tagCloudBug!.itemType).toBe("bug");
    expect(tagCloudBug!.completed).toBe(false); // it's under "## Open"
  });
});

describe("parseStructuredFile: ## item headings that mention their own status", () => {
  // Found via a dry run against ~/projects/peep/ISSUES.md: "## Issue: ... ✅
  // RESOLVED" contains the word "resolved", so a loose vocabulary match alone
  // misreads it as a pure status *section* — swallowing its own ### subsections
  // (Problem Description, Root Cause, etc.) as fake top-level items instead of
  // treating the heading itself as one item. This is peep's real structure:
  // "## Issue: <title>" per issue, with "### <field>" subsections inside each.
  const content = [
    "## Issue: Bug/Issue tracking logic scans image files",
    "",
    "### Problem Description",
    "Some prose.",
    "",
    "### Root Cause",
    "More prose.",
    "",
    '## Issue: Current Directory Display Shows "." Instead of Directory Name ✅ **RESOLVED**',
    "",
    "### Problem Description",
    "Some prose.",
    "",
    "### Resolution",
    "Fixed it.",
    "",
  ].join("\n");

  it("treats each ## Issue heading as one item, ignoring its own ### subsections", () => {
    const items = parseStructuredFile("ISSUES.md", content, "/repo/ISSUES.md");
    expect(items.map((i) => i.text)).toEqual([
      "Issue: Bug/Issue tracking logic scans image files",
      'Issue: Current Directory Display Shows "." Instead of Directory Name ✅ **RESOLVED**',
    ]);
  });

  it("reads completion from the item heading's own text, not a status section", () => {
    const items = parseStructuredFile("ISSUES.md", content, "/repo/ISSUES.md");
    expect(items[0].completed).toBe(false);
    expect(items[1].completed).toBe(true); // mentions RESOLVED in its own title
  });

  it("still treats a bare status word as a pure section, not an item", () => {
    // Contrast case: "## Open" / "## Fixed" have no real title beyond the status
    // word itself, so they stay section markers — this is this repo's own
    // BUGS.md shape, covered above, not repeated here in full.
    const bare = "## Fixed\n\n### Table width miscalculates\n\nDone.\n";
    const items = parseStructuredFile("BUGS.md", bare, "/repo/BUGS.md");
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe("Table width miscalculates");
    expect(items[0].completed).toBe(true);
  });
});

describe("parseStructuredFile: item shape (Phase 6 completion routing)", () => {
  it("tags a checkbox flat-list line as 'checkbox'", () => {
    const items = parseStructuredFile("TODO.md", "- [ ] Ship it\n", "/repo/TODO.md");
    expect(items[0].shape).toBe("checkbox");
  });

  it("tags a plain flat-list bullet (no checkbox) as 'plainBullet'", () => {
    const items = parseStructuredFile("TODO.md", "- Ship it\n", "/repo/TODO.md");
    expect(items[0].shape).toBe("plainBullet");
  });

  it("tags a ### item nested under a ## status section as 'headerNested'", () => {
    const content = "## Open\n\n### A bug\n\nDetails.\n";
    const items = parseStructuredFile("BUGS.md", content, "/repo/BUGS.md");
    expect(items[0].shape).toBe("headerNested");
  });

  it("tags a standalone ## item heading as 'headerStandalone'", () => {
    const content = "## Issue: something broke\n\n### Root Cause\n\nDetails.\n";
    const items = parseStructuredFile("ISSUES.md", content, "/repo/ISSUES.md");
    expect(items[0].shape).toBe("headerStandalone");
  });
});
