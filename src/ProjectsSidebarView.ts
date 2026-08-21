import { TFile } from "obsidian";
import { TodoItem } from "./types";
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
  /** Where completing a hand-typed vault item logs to — same setting TodoSidebarView's TODOs tab uses. */
  defaultTodoneFile: string;
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
