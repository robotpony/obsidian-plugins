import { createFingerprint } from "./utils";
import { extractTags } from "./utils";

/**
 * Parses a repo's structured files (BUGS.md, TODO.md, etc.) into project items.
 * Standalone from TodoScanner's vault-scanning machinery — these items have no
 * backing Obsidian TFile (the source lives outside the vault), only a `sourceFile`
 * absolute path. See DESIGN.md's Projects Extension for the full spec this
 * implements.
 */

export type ProjectItemType = "todo" | "idea" | "bug";

/**
 * Which of the four line/block shapes an item was parsed from — determines how
 * (and whether) it can be completed. See ProjectItemMutator.ts for how each
 * shape maps to a mutation:
 *  - `checkbox`: a `- [ ]`/`- [x]` flat-list line — toggle the checkbox.
 *  - `plainBullet`: a flat-list line with no checkbox — completing adds one;
 *    un-completing an already-complete plain bullet (completion inferred from
 *    its enclosing section, not its own line) isn't a single-line edit and
 *    isn't supported.
 *  - `headerStandalone`: a `##` item heading with no enclosing status section
 *    (e.g. peep/ISSUES.md's "## Issue: ...") — toggle a "✅ RESOLVED" marker
 *    on the heading line itself.
 *  - `headerNested`: a `###` heading under a `##` status section — completing
 *    means moving the whole block to a different section. Not a single-line
 *    edit; see HeaderBlockMover.ts for the block-move that implements it.
 */
export type ItemShape = "checkbox" | "plainBullet" | "headerStandalone" | "headerNested";

export interface ParsedProjectItem {
  /** Absolute path to the structured file this item came from. */
  sourceFile: string;
  /** 0-indexed line number of the item (bullet line, or heading line for header-report items). */
  lineNumber: number;
  /** Stable fingerprint for stale-line recovery — same algorithm as vault items. */
  fingerprint: string;
  /** Human-readable summary of the item. */
  text: string;
  /** True for `- [ ]`/`- [x]` flat-list items; false for header-report items. */
  hasCheckbox: boolean;
  itemType: ProjectItemType;
  completed: boolean;
  /** All `#tag`s found on the item's line (flat list) or block (header report). */
  tags: string[];
  shape: ItemShape;
}

/** Filename → default item type when a line/block has no explicit #todo/#idea/#bug tag. */
const FILENAME_DEFAULT_TYPE: Record<string, ProjectItemType> = {
  "BUGS.md": "bug",
  "ISSUES.md": "bug",
  "TODO.md": "todo",
  "TODOS.md": "todo",
  "IDEAS.md": "idea",
};

// Section-heading vocabulary used to infer completion status for items that have
// no checkbox and no explicit marker of their own (see classifySectionHeading).
const CLOSED_SECTION_WORDS = ["fixed", "resolved", "completed", "done", "closed"];
const OPEN_SECTION_WORDS = ["open", "todo", "active", "future", "enhancement"];

/**
 * Parses one structured file's content into items. Returns `[]` for filenames
 * outside the recognized set (BUGS.md/ISSUES.md/TODO.md/TODOS.md/IDEAS.md) —
 * callers are expected to only invoke this for those filenames, but an
 * unrecognized name contributing nothing (rather than guessing) is the same
 * "don't guess" rule the two shapes below follow.
 */
export function parseStructuredFile(
  filename: string,
  content: string,
  sourceFile: string
): ParsedProjectItem[] {
  const defaultType = FILENAME_DEFAULT_TYPE[filename];
  if (!defaultType) return [];

  const lines = content.split("\n");

  // `###` headings are the reliable signal for the header-report shape — more
  // reliable than "no top-level bullets exist", since a prose write-up (this
  // repo's own BUGS.md) can easily contain an incidental `-` list (e.g. a
  // root-cause breakdown) inside one item's body without being a flat-list file.
  // A false positive there would silently misparse the whole file as two random
  // bullet fragments instead of the real ### items, so ### presence decides first.
  return hasHeaderReportShape(lines)
    ? parseHeaderReport(lines, defaultType, sourceFile)
    : parseFlatList(lines, defaultType, sourceFile);
}

function hasHeaderReportShape(lines: string[]): boolean {
  let inCodeBlock = false;
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    if (/^###\s+/.test(line)) return true;
  }
  return false;
}

/**
 * Tier 1: top-level `- ...` / `- [ ] ...` bullet lines, one item each. Indented
 * sub-bullets aren't top-level and are skipped (they belong to the item above,
 * not treated as items of their own).
 */
function parseFlatList(
  lines: string[],
  defaultType: ProjectItemType,
  sourceFile: string
): ParsedProjectItem[] {
  const items: ParsedProjectItem[] = [];
  let nearestSectionCompleted: boolean | null = null;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^```/.test(line.trim())) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const headingMatch = line.match(/^#{1,6}\s+(.*)$/);
    if (headingMatch) {
      nearestSectionCompleted = classifySectionHeading(headingMatch[1]);
      continue;
    }

    const bulletMatch = line.match(/^-\s+(.*)$/);
    if (!bulletMatch) continue;

    const rest = bulletMatch[1];
    const checkboxMatch = rest.match(/^\[([ xX])\]\s*/);
    const hasCheckbox = !!checkboxMatch;

    let completed: boolean;
    if (hasCheckbox) {
      completed = checkboxMatch![1].toLowerCase() === "x";
    } else if (/^✓\s+/.test(rest)) {
      completed = true; // ad hoc completion marker some repos use in place of a checkbox
    } else {
      completed = nearestSectionCompleted ?? false;
    }

    items.push(buildItem(line, i, hasCheckbox, completed, defaultType, sourceFile));
  }

  return items;
}

/**
 * Tier 2: one item per `###` heading nested under a `##` status section, for
 * files with no top-level list items (prose bug write-ups rather than a flat
 * list — see this repo's own BUGS.md).
 */
function parseHeaderReport(
  lines: string[],
  defaultType: ProjectItemType,
  sourceFile: string
): ParsedProjectItem[] {
  const items: ParsedProjectItem[] = [];
  let inCodeBlock = false;

  // `##` headings split into two roles, decided per-heading by whether its text
  // matches the open/closed vocabulary:
  //  - status section (e.g. "## Open"): tracks completion for ### items beneath it
  //  - item heading (e.g. "## Issue: widget crashes"): the heading itself is one
  //    item, and any ### beneath it (e.g. "### Root Cause") is body substructure,
  //    NOT a further item boundary — this is what peep/ISSUES.md actually does,
  //    and treating every ### as an item there exploded one issue into 8+ fakes.
  let inStatusSection = false;
  let sectionCompleted: boolean | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^```/.test(line.trim())) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const h2Match = line.match(/^##\s+(.*)$/);
    if (h2Match) {
      const headingText = h2Match[1].trim();
      const status = isStatusSectionHeading(headingText);

      if (status !== null) {
        inStatusSection = true;
        sectionCompleted = status;
        continue; // a status section heading is never itself an item
      }

      inStatusSection = false;
      items.push(buildHeaderItem(lines, i, headingText, /^##\s+/, defaultType, sourceFile, "headerStandalone"));
      continue;
    }

    const h3Match = line.match(/^###\s+(.*)$/);
    if (!h3Match || !inStatusSection) continue; // ### only bounds items inside a status section

    const headingText = h3Match[1].trim();
    items.push({
      ...buildHeaderItem(lines, i, headingText, /^#{2,3}\s+/, defaultType, sourceFile, "headerNested"),
      completed: sectionCompleted ?? false,
    });
  }

  return items;
}

/** Body block runs from the line after `headingLine` until the next heading matching `boundaryPattern` (or EOF). */
function buildHeaderItem(
  lines: string[],
  headingLine: number,
  headingText: string,
  boundaryPattern: RegExp,
  defaultType: ProjectItemType,
  sourceFile: string,
  shape: "headerStandalone" | "headerNested"
): ParsedProjectItem {
  let bodyEnd = headingLine + 1;
  while (bodyEnd < lines.length && !boundaryPattern.test(lines[bodyEnd])) {
    bodyEnd++;
  }
  const bodyText = stripFencedCode(lines.slice(headingLine, bodyEnd).join("\n"));
  const explicitType = extractExplicitType(bodyText);

  return {
    sourceFile,
    lineNumber: headingLine,
    fingerprint: createFingerprint(headingText),
    text: headingText,
    hasCheckbox: false,
    itemType: explicitType ?? defaultType,
    completed: classifySectionHeading(headingText) === true, // e.g. a heading ending "✅ RESOLVED"
    tags: extractTags(bodyText),
    shape,
  };
}

function buildItem(
  line: string,
  lineNumber: number,
  hasCheckbox: boolean,
  completed: boolean,
  defaultType: ProjectItemType,
  sourceFile: string
): ParsedProjectItem {
  const explicitType = extractExplicitType(line);
  return {
    sourceFile,
    lineNumber,
    fingerprint: createFingerprint(line),
    text: line.trim(),
    hasCheckbox,
    itemType: explicitType ?? defaultType,
    completed,
    tags: extractTags(line),
    shape: hasCheckbox ? "checkbox" : "plainBullet",
  };
}

/** First `#todo`/`#idea`/`#bug` tag found, in document order — an explicit tag always wins over the filename default. */
function extractExplicitType(text: string): ProjectItemType | null {
  for (const tag of extractTags(text)) {
    const lower = tag.toLowerCase();
    if (lower === "#todo" || lower === "#todos") return "todo";
    if (lower === "#idea" || lower === "#ideas") return "idea";
    if (lower === "#bug" || lower === "#bugs") return "bug";
  }
  return null;
}

/** null = heading text doesn't indicate status either way (don't assume). */
function classifySectionHeading(headingText: string): boolean | null {
  const lower = headingText.toLowerCase();
  if (CLOSED_SECTION_WORDS.some((w) => lower.includes(w))) return true;
  if (OPEN_SECTION_WORDS.some((w) => lower.includes(w))) return false;
  return null;
}

const SECTION_VOCAB_PATTERN = new RegExp(
  [...CLOSED_SECTION_WORDS, ...OPEN_SECTION_WORDS].join("|"),
  "gi"
);

/**
 * Stricter than classifySectionHeading: a pure status *section* marker (`## Open`,
 * `## Completed ✓`) is little more than the status word itself. An item
 * heading that happens to mention its own status (`## Issue: widget crashes
 * ✅ RESOLVED`) is not a section — it has a real title. Distinguishes the two
 * by stripping the matched vocabulary word and common decoration; if a real
 * title remains, this isn't a section heading.
 *
 * Found via the dry run against peep/ISSUES.md's real "## Issue: ... RESOLVED"
 * headings, which classifySectionHeading alone misread as pure sections,
 * swallowing each issue's own ### subsections as fake top-level items.
 */
export function isStatusSectionHeading(headingText: string): boolean | null {
  const status = classifySectionHeading(headingText);
  if (status === null) return null;

  const stripped = headingText
    .replace(SECTION_VOCAB_PATTERN, "")
    .replace(/[✓✅*:.\s]/g, "");
  return stripped.length === 0 ? status : null;
}

function stripFencedCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "");
}
