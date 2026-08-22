import { readFile, writeFile } from "fs/promises";
import { basename } from "path";
import { resolveLineNumber } from "./utils";
import { ParsedProjectItem, isStatusSectionHeading } from "./StructuredFileParser";
import { ProjectScanner } from "./ProjectScanner";

const TAG = "[Warped Todo]";
const DEFAULT_CLOSED_SECTION = "## Fixed";
const DEFAULT_OPEN_SECTION = "## Open";

export interface MoveResult {
  ok: boolean;
  /** User-facing reason, set when ok is false. */
  reason?: string;
}

/**
 * Moves a `headerNested` item's block (### heading through the line before
 * the next ##/### heading, or EOF — same span StructuredFileParser uses to
 * build the item) from its current section to one matching the target
 * completion state. Multi-line file surgery on an external repo file: picks
 * the target section, checks the file's git status is clean first (see
 * below), and the move is reversible (toggle again to move it back).
 */
export async function moveHeaderBlock(
  item: ParsedProjectItem,
  targetCompleted: boolean,
  repoPath: string,
  scanner: ProjectScanner
): Promise<MoveResult> {
  if (item.shape !== "headerNested") {
    return { ok: false, reason: "This item isn't a header-report entry." };
  }

  // Safety net: refuse on a dirty working tree for this file, so a bad move
  // is always recoverable via `git checkout -- <file>`.
  const clean = await scanner.isFileClean(repoPath, item.sourceFile);
  if (!clean) {
    return {
      ok: false,
      reason: `Commit or stash changes to ${basename(item.sourceFile)} before completing this item.`,
    };
  }

  let content: string;
  try {
    content = await readFile(item.sourceFile, "utf-8");
  } catch (error) {
    console.error(TAG, `Failed to read ${item.sourceFile}:`, error);
    return { ok: false, reason: "Couldn't read the file. See console for details." };
  }

  const lines = content.split("\n");
  const headingLine = resolveLineNumber(lines, item.lineNumber, item.fingerprint);
  if (headingLine < 0 || headingLine >= lines.length || !/^###\s+/.test(lines[headingLine])) {
    return { ok: false, reason: "Couldn't find that item — the file may have changed. Try syncing again." };
  }

  let blockEnd = headingLine + 1;
  while (blockEnd < lines.length && !/^#{2,3}\s+/.test(lines[blockEnd])) blockEnd++;
  const block = lines.slice(headingLine, blockEnd);

  const withoutBlock = [...lines.slice(0, headingLine), ...lines.slice(blockEnd)];
  const relocated = targetCompleted
    ? insertIntoClosedSection(withoutBlock, block)
    : insertIntoOpenSection(withoutBlock, block);
  const final = collapseBlankRuns(relocated);

  try {
    await writeFile(item.sourceFile, final.join("\n"), "utf-8");
  } catch (error) {
    console.error(TAG, `Failed to write ${item.sourceFile}:`, error);
    return { ok: false, reason: "Failed to write the file. See console for details." };
  }

  return { ok: true };
}

/** First `##` heading (never `###`) classifying as closed/open, or -1. */
function findSectionHeadingIndex(lines: string[], wantClosed: boolean): number {
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^##\s+(.*)$/);
    if (!match) continue;
    if (isStatusSectionHeading(match[1].trim()) === wantClosed) return i;
  }
  return -1;
}

/** Index of the line just past the end of the section starting at `sectionHeadingIndex` (next `##`, or EOF). */
function sectionEndIndex(lines: string[], sectionHeadingIndex: number): number {
  let end = sectionHeadingIndex + 1;
  while (end < lines.length && !/^##\s+/.test(lines[end])) end++;
  return end;
}

function insertIntoClosedSection(lines: string[], block: string[]): string[] {
  const sectionIdx = findSectionHeadingIndex(lines, true);
  if (sectionIdx === -1) return appendNewSection(lines, DEFAULT_CLOSED_SECTION, block);
  return insertAt(lines, sectionEndIndex(lines, sectionIdx), block);
}

function insertIntoOpenSection(lines: string[], block: string[]): string[] {
  const sectionIdx = findSectionHeadingIndex(lines, false);
  if (sectionIdx === -1) return prependNewSection(lines, DEFAULT_OPEN_SECTION, block);
  return insertAt(lines, sectionEndIndex(lines, sectionIdx), block);
}

/** Inserts `block` at `index`, normalizing to exactly one blank line on each side. */
function insertAt(lines: string[], index: number, block: string[]): string[] {
  const before = lines.slice(0, index);
  while (before.length > 0 && before[before.length - 1] === "") before.pop();
  const after = lines.slice(index);
  while (after.length > 0 && after[0] === "") after.shift();
  return [...before, "", ...block, "", ...after];
}

/** No existing target-vocabulary section — creates one at the end of the file (used for the closed/"Fixed" case). */
function appendNewSection(lines: string[], heading: string, block: string[]): string[] {
  const trimmed = [...lines];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") trimmed.pop();
  return [...trimmed, "", heading, "", ...block, ""];
}

/**
 * No existing target-vocabulary section — creates one at the top of the file
 * (used for the open/"Open" case, matching where an Open section conventionally
 * sits), after a leading `# Title` line if present.
 */
function prependNewSection(lines: string[], heading: string, block: string[]): string[] {
  let insertPoint = 0;
  if (/^#\s+/.test(lines[0] ?? "")) {
    insertPoint = 1;
    while (insertPoint < lines.length && lines[insertPoint] === "") insertPoint++;
  }
  const before = lines.slice(0, insertPoint);
  const after = lines.slice(insertPoint);
  while (after.length > 0 && after[0] === "") after.shift();
  return [...before, heading, "", ...block, "", ...after];
}

function collapseBlankRuns(lines: string[]): string[] {
  const result: string[] = [];
  for (const line of lines) {
    if (line === "" && result[result.length - 1] === "") continue;
    result.push(line);
  }
  return result;
}
