import { TFile } from "obsidian";
import { ProjectInfo, TodoItem } from "./types";
import { ProjectItemType } from "./StructuredFileParser";

/**
 * Pure helpers and types shared by the Projects tab (TodoSidebarView's
 * 'projects' mode — see SidebarView.ts). This used to be a second, standalone
 * ItemView/leaf (ProjectsSidebarView); it was folded into TodoSidebarView as
 * a third tab (screenshot review: Projects behaved structurally unlike every
 * other tab — its own leaf, its own icon in the sidebar dock's tab strip,
 * a back button where clicking the tab again would do). What's left here is
 * the rendering-independent logic: display formatting and hand-typed-item
 * grouping, plus the shared type/constant the two files both need. No
 * ItemView, no `app`/`leaf` dependency — safe to unit-test directly, which
 * `groupHandTypedItems.test.ts` and `projectsSidebarDisplay.test.ts` do.
 */

export interface ProjectsSidebarOptions {
  baseFolder: string;
  projectsFolder: string;
  excludeDirs: string[];
  scanDepth: number;
  /** When true, opening a repo-matched project note jumps the sidebar to its detail view even from Todos/Ideas. */
  autoOpenOnLinkedNote: boolean;
  /** App name for the detail view's "Open in Terminal" action (macOS `open -a`). */
  terminalApp: string;
  /** App name for the detail view's "Open in Editor" action (macOS `open -a`). */
  editorApp: string;
}

// All three types get a checkbox, matching the main TODOs tab's ideaConfig
// (showCheckbox: true) — checking an idea there doesn't mean literally
// "done" so much as "dismiss/convert", but it's still the row's only
// interactive control.
export const GROUP_ORDER: { heading: string; type: ProjectItemType; checkbox: boolean }[] = [
  { heading: "TODOs", type: "todo", checkbox: true },
  { heading: "Ideas", type: "idea", checkbox: true },
  { heading: "Bugs", type: "bug", checkbox: true },
];

export interface GroupFileHint {
  displayName: string;
  path: string;
  onOpen: () => void;
}

export interface HandTypedGroup {
  label: string;
  file: TFile;
  lineNumber: number;
  items: TodoItem[];
}

export function calculateFocusPriority(currentPriority: string | null): string {
  if (!currentPriority || currentPriority === "#future") return "#p0";
  const match = currentPriority.match(/^#p([0-4])$/);
  if (match) {
    const num = parseInt(match[1]);
    return num > 0 ? `#p${num - 1}` : "#p0";
  }
  return "#p0";
}

export function calculateLaterPriority(currentPriority: string | null): string {
  if (!currentPriority || currentPriority === "#future") return "#p4";
  const match = currentPriority.match(/^#p([0-4])$/);
  if (match) {
    const num = parseInt(match[1]);
    return num < 4 ? `#p${num + 1}` : "#p4";
  }
  return "#p4";
}

export function cleanDisplayText(text: string): string {
  return text
    .replace(/^#{1,6}\s+/, "")
    .replace(/^-\s*/, "")
    .replace(/^\[[ xX]?\]\s*/, "")
    .replace(/#[\w-]+/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function browsableUrl(remote: string): string {
  // git@github.com:owner/repo.git -> https://github.com/owner/repo
  const sshMatch = remote.match(/^git@([^:]+):(.+?)(\.git)?$/);
  if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2]}`;
  return remote.replace(/\.git$/, "");
}

/** /Users/mx/projects/peep -> ~/projects/peep — shorter, and immediately recognizable as a local path rather than plain text. Full path stays available via the element's title tooltip. */
export function homeRelativePath(path: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const home: string = require("os").homedir();
  return path === home || path.startsWith(home + "/") ? "~" + path.slice(home.length) : path;
}

/**
 * Best-guess starting point for the "Choose a folder" picker beside the
 * Projects base folder setting: ~/projects if it exists — the same path
 * homedir()'s own /Users/<you> resolves to, so trying "~/projects" and
 * "/Users/<you>/projects" is one check, not two — falling back to the home
 * directory itself so the dialog opens somewhere sensible instead of
 * Electron's own default (usually Documents). `homedir`/`pathExists` are
 * injectable so this stays unit-testable without touching the real
 * filesystem, same reasoning as everything else in this file.
 */
export function guessProjectsFolder(
  homedir: () => string = () => require("os").homedir(),
  pathExists: (path: string) => boolean = (path) => require("fs").existsSync(path)
): string {
  const home = homedir();
  const candidate = `${home}/projects`;
  return pathExists(candidate) ? candidate : home;
}

/** A header TODO with children can't be completed directly (TodoProcessor refuses it) — same rule the TODOs tab uses to decide whether a header row gets its own checkbox. */
function isHeaderWithChildren(item: TodoItem): boolean {
  return item.isHeader === true && !!item.childLineNumbers && item.childLineNumbers.length > 0;
}

/**
 * Groups a flat hand-typed item list the way the TODOs tab itself does: a
 * header TODO's children belong under it (labelled with the header's own
 * cleaned text; the header itself isn't a row — see isHeaderWithChildren),
 * true orphans (no parent header) group by sectionLabel. Extracted as a
 * standalone function (not a method) specifically so it's unit-testable
 * without constructing a whole ItemView — this grouping logic is the actual
 * bug that was fixed here (every scanned item rendered as an independent
 * checkbox row, showing a header's raw markdown text as its own row).
 */
export function groupHandTypedItems(items: TodoItem[]): HandTypedGroup[] {
  const headerGroups = new Map<number, HandTypedGroup>();
  for (const item of items) {
    if (isHeaderWithChildren(item)) {
      headerGroups.set(item.lineNumber, {
        label: cleanDisplayText(item.text),
        file: item.file,
        lineNumber: item.lineNumber,
        items: [],
      });
    }
  }

  const orphanGroups = new Map<string, HandTypedGroup>();
  for (const item of items) {
    if (isHeaderWithChildren(item)) continue; // the header itself isn't a row — see above
    if (item.parentLineNumber !== undefined && headerGroups.has(item.parentLineNumber)) {
      headerGroups.get(item.parentLineNumber)!.items.push(item);
      continue;
    }
    const label = item.sectionLabel || "Notes";
    if (!orphanGroups.has(label)) {
      orphanGroups.set(label, {
        label,
        file: item.file,
        lineNumber: item.sectionLineNumber ?? item.lineNumber,
        items: [],
      });
    }
    orphanGroups.get(label)!.items.push(item);
  }

  return [...headerGroups.values(), ...orphanGroups.values()].filter((g) => g.items.length > 0);
}

/**
 * A project's #principle/#principles items — the vault-wide guiding
 * principles that belong to it, whether tagged directly (`#principle
 * #myproject`), living in the project's own note (matched via
 * `inferredFileTag`, derived from the filename), or listed as children of a
 * `#principles`-tagged header that itself matches the project (the header's
 * tag/inferredFileTag covers the whole block; individual bullets under it
 * don't need to repeat the tag). Shared by the project-info popup and the
 * project detail view's Guiding Principles section (both in SidebarView.ts)
 * so the two surfaces agree on the same set of items.
 */
export function getProjectPrinciples(projectTag: string, allPrinciples: TodoItem[]): TodoItem[] {
  const matchesTag = (item: TodoItem) =>
    item.tags.includes(projectTag) || item.inferredFileTag === projectTag;

  const matchedHeaderLines = new Set(
    allPrinciples.filter((p) => p.isHeader && matchesTag(p)).map((p) => p.lineNumber)
  );

  return allPrinciples.filter(
    (p) => matchesTag(p) || (p.parentLineNumber !== undefined && matchedHeaderLines.has(p.parentLineNumber))
  );
}

/** Strips only the plugin's own `#principle`/`#principles` marker tag from a line — everything else (heading markers, list markers, other tags, formatting) is left exactly as written, so the caller can render it verbatim. */
export function stripPrincipleTag(text: string): string {
  // Consumes one trailing space along with the tag so removing it mid-line
  // ("data #principle #peep") doesn't leave a double space behind.
  return text.replace(/#principles?\b\s?/gi, "").replace(/[ \t]+$/, "").replace(/^[ \t]+/, "");
}

export interface ProjectPrincipleBlock {
  filePath: string;
  /**
   * Raw source markdown for this block — a `#principles`-tagged header
   * joined with its own children's lines, or a single standalone item —
   * with only the marker tag stripped. Rendered as one MarkdownRenderer
   * pass so the original list type (bulleted, numbered, or a plain line)
   * comes through exactly as written, instead of being reconstructed into
   * a synthetic list (which double-nested a source `1.`/`2.` ordered list
   * inside an outer `<ul>` — reported via screenshot).
   */
  markdown: string;
}

/**
 * Builds verbatim, renderable blocks from a project's principle items (see
 * getProjectPrinciples): each `#principles`-tagged header's own line plus
 * its children's lines join into one block — the header's text becomes the
 * block's heading exactly as the author wrote it, no synthesised label —
 * and every remaining item (no header, or a header with no matched children
 * of its own) becomes its own one-line block.
 */
export function buildProjectPrincipleBlocks(items: TodoItem[]): ProjectPrincipleBlock[] {
  const headers = items.filter((i) => i.isHeader);
  const blocks: ProjectPrincipleBlock[] = [];
  const placed = new Set<number>();

  for (const header of headers) {
    const children = items
      .filter((i) => i.parentLineNumber === header.lineNumber)
      .sort((a, b) => a.lineNumber - b.lineNumber);
    if (children.length === 0) continue;
    children.forEach((c) => placed.add(c.lineNumber));
    const markdown = [header, ...children].map((i) => stripPrincipleTag(i.text)).join("\n");
    blocks.push({ filePath: header.filePath, markdown });
  }

  const headerLines = new Set(headers.map((h) => h.lineNumber));
  for (const item of items) {
    if (headerLines.has(item.lineNumber) || placed.has(item.lineNumber)) continue;
    blocks.push({ filePath: item.filePath, markdown: stripPrincipleTag(item.text) });
  }

  return blocks;
}

// ===== Projects list sort =====
// List view only — added alongside the row-layout rework (screenshot
// review: the old two-line row wrapped badly for long repo names).

export type ProjectSortKey = "activeFirst" | "name" | "mostItems" | "needsAttention" | "recentlyUpdated";

/**
 * In menu-display order. "activeFirst" is the list's original implicit
 * sort (active-with-items first, then name) — kept as an explicit,
 * reselectable option rather than dropped once named alternatives exist.
 * Named "activeFirst" rather than "default" since the plugin settings
 * tab's own "Default projects sort" now owns that word — a settings
 * value literally named "default" would read confusingly next to a
 * setting called Default.
 */
export const PROJECT_SORT_OPTIONS: { key: ProjectSortKey; label: string }[] = [
  { key: "activeFirst", label: "Active items first" },
  { key: "name", label: "Name (A–Z)" },
  { key: "mostItems", label: "Most items" },
  { key: "needsAttention", label: "Needs attention" },
  { key: "recentlyUpdated", label: "Recently updated" },
];

/**
 * One row's sort-relevant facts, precomputed by the caller rather than
 * derived here — `itemCount`/`needsAttention` depend on live synced-item
 * state (ProjectSyncManager.getCachedItems(), via SidebarView's own
 * projectItemCounts()) that this file deliberately has no access to (see
 * this file's own module comment: no ItemView/app dependency, so the sort
 * itself stays unit-testable without constructing one).
 */
export interface ProjectSortRow {
  project: ProjectInfo;
  /** Total non-completed tracked items (todo + idea + bug), vault and synced combined. */
  itemCount: number;
  /** Dirty git status (uncommitted changes) or at least one open bug. */
  needsAttention: boolean;
}

/**
 * Sorts Projects-list rows by the chosen key, always falling back to name
 * (project.tag) to break ties — so re-sorting after an item count changes
 * doesn't shuffle otherwise-equal rows around.
 */
export function sortProjectRows<T extends ProjectSortRow>(rows: readonly T[], sort: ProjectSortKey): T[] {
  const byName = (a: T, b: T) => a.project.tag.localeCompare(b.project.tag);
  const sorted = [...rows];

  switch (sort) {
    case "name":
      sorted.sort(byName);
      break;
    case "mostItems":
      sorted.sort((a, b) => b.itemCount - a.itemCount || byName(a, b));
      break;
    case "needsAttention":
      sorted.sort((a, b) => Number(b.needsAttention) - Number(a.needsAttention) || byName(a, b));
      break;
    case "recentlyUpdated":
      sorted.sort((a, b) => (b.project.lastUpdated ?? 0) - (a.project.lastUpdated ?? 0) || byName(a, b));
      break;
    case "activeFirst":
    default:
      sorted.sort((a, b) => {
        const aActive = a.itemCount > 0 ? 1 : 0;
        const bActive = b.itemCount > 0 ? 1 : 0;
        return aActive !== bActive ? bActive - aActive : byName(a, b);
      });
  }

  return sorted;
}
