import { App, MarkdownView, TFile, Vault, WorkspaceLeaf, moment } from "obsidian";
import { createNoticeFactory } from "../../shared";

/** Logo prefix for Notice messages */
export const LOGO_PREFIX = "␣⌘";

/**
 * Show a notice with the styled Space Command logo badge.
 * Uses the shared notice factory pattern.
 */
export const showNotice = createNoticeFactory(LOGO_PREFIX, "space-command-logo");

/**
 * Plugin tags - system tags that get base logo colour styling.
 * These are the core tags that Space Command uses.
 */
export const PLUGIN_TAGS = new Set([
  '#todo', '#todos', '#todone', '#todones',
  '#moved',
  '#idea', '#ideas', '#ideation',
  '#principle', '#principles'
]);

/**
 * Priority tag to colour index mapping.
 * Lower index = darker colour (higher priority).
 * Maps to CSS --sc-tag-priority-N variables.
 */
export const PRIORITY_TAG_MAP: Record<string, number> = {
  '#focus': 0,
  '#today': 1,
  '#p0': 2,
  '#p1': 3,
  '#p2': 4,
  '#p3': 5,
  '#p4': 6,
  '#future': 7
};

/**
 * Check if a tags array includes a specific tag (case-insensitive).
 * This normalizes the check to handle #Focus, #FOCUS, #focus etc.
 */
export function hasTag(tags: string[], tag: string): boolean {
  const lowerTag = tag.toLowerCase();
  return tags.some(t => t.toLowerCase() === lowerTag);
}

/**
 * Tag colour info for semantic colouring.
 */
export interface TagColourInfo {
  type: 'plugin' | 'priority' | 'project';
  priority: number;
}

/**
 * Get colour classification for a tag.
 * Returns type and priority index for CSS styling.
 */
export function getTagColourInfo(
  tag: string,
  projectColourMap?: Map<string, number>
): TagColourInfo {
  const normalizedTag = tag.toLowerCase();

  // Check if it's a plugin system tag
  if (PLUGIN_TAGS.has(normalizedTag)) {
    return { type: 'plugin', priority: 3 }; // mid-range colour for plugin tags
  }

  // Check if it's a priority tag
  if (PRIORITY_TAG_MAP[normalizedTag] !== undefined) {
    return { type: 'priority', priority: PRIORITY_TAG_MAP[normalizedTag] };
  }

  // It's a project tag - look up its colour index or use default
  const colourIndex = projectColourMap?.get(normalizedTag) ?? 4; // default mid-priority
  return { type: 'project', priority: colourIndex };
}

/**
 * Return true if the given metadataCache tag list contains at least one tag
 * that Space Command tracks (`PLUGIN_TAGS`). Used by TodoScanner to skip files
 * before reading them, avoiding unnecessary vault I/O.
 *
 * Accepts the `tags` field from `CachedMetadata` directly (or undefined when
 * the file has no tags or hasn't been indexed yet).
 */
export function hasCachedRelevantTags(tags: { tag: string }[] | undefined): boolean {
  if (!tags || tags.length === 0) return false;
  return tags.some(t => PLUGIN_TAGS.has(t.tag.toLowerCase()));
}

export function formatDate(date: Date, format: string): string {
  return (moment as any)(date).format(format);
}

/**
 * Get the priority value for sorting TODOs.
 * Lower values = higher priority.
 *
 * | Tag              | Value | Meaning                              |
 * |------------------|-------|--------------------------------------|
 * | #today           | 1     | Time-sensitive, due today            |
 * | #p0              | 2     | Highest priority                     |
 * | #p1              | 3     | High priority                        |
 * | #p2              | 4     | Medium-high priority                 |
 * | #p3              | 5     | Medium-low priority                  |
 * | #p4              | 6     | Low priority                         |
 * | No priority      | 7     | Unmarked items                       |
 * | #future/#snooze  | 8     | Snoozed/deferred items               |
 *
 * #focus is handled separately as a sort tier (see compareWithEffectivePriority).
 * Focused items always sort above non-focused items regardless of priority.
 */
export function getPriorityValue(tags: string[]): number {
  if (hasTag(tags, "#today")) return 1;
  if (hasTag(tags, "#p0")) return 2;
  if (hasTag(tags, "#p1")) return 3;
  if (hasTag(tags, "#p2")) return 4;
  if (hasTag(tags, "#p3")) return 5;
  if (hasTag(tags, "#p4")) return 6;
  if (hasTag(tags, "#future") || hasTag(tags, "#snooze") || hasTag(tags, "#snoozed")) return 8;
  return 7;
}

/**
 * Count meaningful tags (excludes system tags like #todo, #todone, #idea, etc.).
 * Used as a tertiary sort criterion after focus and priority.
 */
export function getTagCount(tags: string[]): number {
  const systemTags = new Set([
    "#todo", "#todos", "#todone", "#todones",
    "#moved",
    "#idea", "#ideas", "#ideation",
    "#principle", "#principles",
    "#focus", "#today", "#future", "#snooze", "#snoozed",
    "#p0", "#p1", "#p2", "#p3", "#p4"
  ]);
  // Case-insensitive check against system tags
  return tags.filter(tag => !systemTags.has(tag.toLowerCase())).length;
}

/**
 * Compare two items for sorting.
 * Sort order: 1) #focus tier (focused first), 2) priority, 3) tag count.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareTodoItems(
  a: { tags: string[] },
  b: { tags: string[] }
): number {
  // 1. Focus tier: focused items always sort above non-focused
  const aFocused = hasTag(a.tags, "#focus");
  const bFocused = hasTag(b.tags, "#focus");
  if (aFocused && !bFocused) return -1;
  if (!aFocused && bFocused) return 1;

  // 2. Priority (lower value = higher priority)
  const priorityDiff = getPriorityValue(a.tags) - getPriorityValue(b.tags);
  if (priorityDiff !== 0) return priorityDiff;

  // 3. Tag count (more tags = higher ranking, so sort descending)
  return getTagCount(b.tags) - getTagCount(a.tags);
}

/**
 * Item interface for effective priority calculation.
 * Matches the subset of TodoItem fields needed for sorting.
 */
interface PrioritySortableItem {
  tags: string[];
  filePath: string;
  lineNumber: number;
  isHeader?: boolean;
  childLineNumbers?: number[];
}

/**
 * Check if an item is snoozed (has #future, #snooze, or #snoozed tag).
 */
function isSnoozed(tags: string[]): boolean {
  return hasTag(tags, "#future") || hasTag(tags, "#snooze") || hasTag(tags, "#snoozed");
}

/**
 * Check if an item is effectively focused, considering children for headers.
 * A header is focused if it has #focus or any active child has #focus.
 */
function isEffectivelyFocused(
  item: PrioritySortableItem,
  allItems: PrioritySortableItem[]
): boolean {
  if (hasTag(item.tags, "#focus")) return true;
  if (!item.isHeader || !item.childLineNumbers || item.childLineNumbers.length === 0) {
    return false;
  }
  for (const childLine of item.childLineNumbers) {
    const child = allItems.find(
      t => t.filePath === item.filePath && t.lineNumber === childLine
    );
    if (child && !isSnoozed(child.tags) && hasTag(child.tags, "#focus")) {
      return true;
    }
  }
  return false;
}

/**
 * Get effective priority for an item, considering children for header items.
 *
 * - Standalone items: returns their own priority value
 * - Header items with children: returns the better of header priority or child average
 * - Header items without active children: returns their own priority value
 *
 * Snoozed children are excluded from the average so they don't drag down
 * the priority of headers with active work.
 */
export function getEffectivePriority(
  item: PrioritySortableItem,
  allItems: PrioritySortableItem[]
): number {
  const headerPriority = getPriorityValue(item.tags);

  // Non-header items use their own priority
  if (!item.isHeader || !item.childLineNumbers || item.childLineNumbers.length === 0) {
    return headerPriority;
  }

  // Header items: compute average priority of active (non-snoozed) children
  const childPriorities: number[] = [];
  for (const childLine of item.childLineNumbers) {
    const child = allItems.find(
      t => t.filePath === item.filePath && t.lineNumber === childLine
    );
    if (child && !isSnoozed(child.tags)) {
      childPriorities.push(getPriorityValue(child.tags));
    }
  }

  if (childPriorities.length === 0) {
    return headerPriority;
  }

  // Return the better (lower) of header priority or child average
  const sum = childPriorities.reduce((a, b) => a + b, 0);
  const childAverage = sum / childPriorities.length;
  return Math.min(headerPriority, childAverage);
}

/**
 * Compare two items for sorting, considering effective priority for headers.
 * Sort order: 1) #focus tier (focused first), 2) effective priority, 3) tag count.
 * Use this instead of compareTodoItems when you have access to all items.
 */
export function compareWithEffectivePriority(
  a: PrioritySortableItem,
  b: PrioritySortableItem,
  allItems: PrioritySortableItem[]
): number {
  // 1. Focus tier: focused items always sort above non-focused
  const aFocused = isEffectivelyFocused(a, allItems);
  const bFocused = isEffectivelyFocused(b, allItems);
  if (aFocused && !bFocused) return -1;
  if (!aFocused && bFocused) return 1;

  // 2. Effective priority (considers children for headers)
  const priorityDiff = getEffectivePriority(a, allItems) - getEffectivePriority(b, allItems);
  if (priorityDiff !== 0) return priorityDiff;

  // 3. Tag count (more tags = higher ranking, so sort descending)
  return getTagCount(b.tags) - getTagCount(a.tags);
}

export function extractTags(text: string): string[] {
  // Remove inline code spans before extracting tags
  // This prevents matching tags inside backticks like `#ideation` (documentation examples)
  const textWithoutCode = text.replace(/`[^`]*`/g, "");
  const tagRegex = /#[\w-]+/g;
  return textWithoutCode.match(tagRegex) || [];
}

import { TodoItem } from "./types";

const DATE_KEYWORDS = new Set(["date", "today", "tomorrow", "yesterday"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function resolveMentions(item: TodoItem, meHandle: string | null): string[] {
  return item.mentions.map(m => m === "me" && meHandle ? meHandle : m);
}

export function extractMentions(text: string): string[] {
  const textWithoutCode = text.replace(/`[^`]*`/g, "");
  const mentionRegex = /@([\w][\w.-]*)/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionRegex.exec(textWithoutCode)) !== null) {
    const token = match[1];
    if (DATE_KEYWORDS.has(token.toLowerCase()) || DATE_PATTERN.test(token)) continue;
    mentions.push(token);
  }
  return mentions;
}

/**
 * Convert a filename (without extension) to a tag format.
 * "API Tasks" → "#api-tasks"
 * "my-project" → "#my-project"
 * "Week of January 12th, 2026" → "#week-of-january-12th-2026"
 *
 * Only keeps characters valid in Obsidian tags: letters, numbers, hyphens, underscores.
 */
export function filenameToTag(basename: string): string {
  return "#" + basename
    .toLowerCase()
    .replace(/\s+/g, "-")           // spaces → hyphens
    .replace(/[^\w-]/g, "")         // remove invalid characters
    .replace(/-+/g, "-")            // collapse multiple hyphens
    .replace(/^-|-$/g, "");         // trim leading/trailing hyphens
}

export function hasCheckboxFormat(text: string): boolean {
  return /^-\s*\[[ x]\]/i.test(text.trim());
}

export function isCheckboxChecked(text: string): boolean {
  return /^-\s*\[x\]/i.test(text.trim());
}

export function markCheckboxComplete(text: string): string {
  return text.replace(/^(-\s*\[)[ ](\])/, "$1x$2");
}

export function replaceTodoWithTodone(text: string, date: string): string {
  // Handle both singular #todo and plural #todos
  // #todos -> #todones, #todo -> #todone
  if (text.includes('#todos')) {
    return text.replace(/#todos\b/, `#todones @${date}`);
  }
  return text.replace(/#todo\b/, `#todone @${date}`);
}

export function replaceTodoWithMoved(text: string, date: string): string {
  // Handle both singular #todo and plural #todos
  if (text.includes('#todos')) {
    return text.replace(/#todos\b/, `#moved @${date}`);
  }
  return text.replace(/#todo\b/, `#moved @${date}`);
}

/**
 * Extract a YYYY-MM-DD date from a filename.
 * Matches filenames like "2026-03-30.md" or "2026-03-30 daily notes.md".
 * Returns null if no date pattern is found.
 */
export function extractDateFromFilename(basename: string): string | null {
  const match = basename.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function replaceTodoneWithTodo(text: string): string {
  // Handle both singular #todone and plural #todones
  // #todones -> #todos, #todone -> #todo
  if (text.includes('#todones')) {
    let result = text.replace(/#todones\s+@\d{4}-\d{2}-\d{2}/, "#todos");
    result = result.replace(/#todones\b/, "#todos");
    return result;
  }
  // Replace #todone @YYYY-MM-DD with #todo
  let result = text.replace(/#todone\s+@\d{4}-\d{2}-\d{2}/, "#todo");
  // Also handle #todone without date
  result = result.replace(/#todone\b/, "#todo");
  return result;
}

export function markCheckboxIncomplete(text: string): string {
  return text.replace(/^(-\s*\[)x(\])/i, "$1 $2");
}

export function removeIdeaTag(text: string): string {
  // Remove #idea, #ideas, or #ideation tag and any trailing whitespace it leaves
  return text.replace(/#idea(?:s|tion)?\b\s*/, "").trim();
}

export function replaceIdeaWithTodo(text: string): string {
  return text.replace(/#idea(?:s|tion)?\b/, "#todo");
}

/**
 * Render text with tags safely using DOM methods (avoids XSS).
 * Tags matching mutedTags get muted-pill styling; others get standard tag styling.
 * Adds data attributes for semantic tag colouring.
 *
 * @param text - The text containing tags to render
 * @param container - The DOM element to append to
 * @param mutedTags - Tags that should get muted-pill styling
 * @param projectColourMap - Optional map of project tag to colour index (0-6)
 */
export function renderTextWithTags(
  text: string,
  container: HTMLElement,
  mutedTags: string[] = [],
  projectColourMap?: Map<string, number>
): void {
  const tagRegex = /(#[\w-]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = tagRegex.exec(text)) !== null) {
    // Add text before the tag
    if (match.index > lastIndex) {
      container.appendText(text.substring(lastIndex, match.index));
    }

    const tag = match[1];
    const colourInfo = getTagColourInfo(tag, projectColourMap);

    let tagEl: HTMLElement;
    if (mutedTags.length > 0 && mutedTags.includes(tag)) {
      // Priority tag: use muted-pill styling
      tagEl = container.createEl("span", {
        cls: "tag muted-pill",
        text: tag,
      });
    } else {
      // Regular tag: standard tag styling
      tagEl = container.createEl("span", {
        cls: "tag",
        text: tag,
      });
    }

    // Add semantic colour data attributes
    tagEl.dataset.scTagType = colourInfo.type;
    tagEl.dataset.scPriority = colourInfo.priority.toString();

    lastIndex = tagRegex.lastIndex;
  }

  // Add remaining text after last tag
  if (lastIndex < text.length) {
    container.appendText(text.substring(lastIndex));
  }
}

/**
 * Highlight a line in the editor by selecting it temporarily.
 */
export function highlightLine(
  editor: MarkdownView["editor"],
  line: number
): void {
  const lineText = editor.getLine(line);
  const lineLength = lineText.length;

  // Select the entire line
  editor.setSelection({ line, ch: 0 }, { line, ch: lineLength });

  // Clear the selection after a delay to create a highlight effect
  setTimeout(() => {
    editor.setCursor({ line, ch: 0 });
  }, 1500);
}

/**
 * Extract completion date from TODONE text.
 * Returns date string (YYYY-MM-DD) or null if not found.
 */
export function extractCompletionDate(text: string): string | null {
  const match = text.match(/@(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * Compare items for sorting by status (open first) then completion date (newest first).
 * Sort order: Open TODOs first, then TODONEs by date (newest first), then dateless TODONEs.
 */
export function compareByStatusAndDate(
  a: { text: string; itemType?: string },
  b: { text: string; itemType?: string }
): number {
  const aIsComplete = a.itemType === 'todone';
  const bIsComplete = b.itemType === 'todone';

  // Open items first
  if (!aIsComplete && bIsComplete) return -1;
  if (aIsComplete && !bIsComplete) return 1;

  // Both open - maintain original order
  if (!aIsComplete && !bIsComplete) return 0;

  // Both complete - sort by date (newest first)
  const aDate = extractCompletionDate(a.text);
  const bDate = extractCompletionDate(b.text);

  // Dated items before undated
  if (aDate && !bDate) return -1;
  if (!aDate && bDate) return 1;

  // Both dated - newest first
  if (aDate && bDate) {
    return bDate.localeCompare(aDate);
  }

  // Both undated - maintain original order
  return 0;
}

/**
 * Produce a stable fingerprint for a markdown line by stripping all variable content:
 * tags, dates, block references, and markdown structure markers. What remains is the
 * human-readable text of the item, which should be stable across tag changes and completion.
 *
 * An empty string is returned when the line has no human content (e.g., "- [ ] #todo").
 */
export function createFingerprint(text: string): string {
  let content = text.trim();
  content = content.replace(/`[^`]*`/g, "");            // strip inline code spans
  content = content.replace(/^#{1,6}\s+/,"");             // strip header markers (require space — avoids matching #tags)
  content = content.replace(/^[-*+]\s*/,"");             // strip list markers (-, *, +)
  content = content.replace(/^\d+\.\s*/,"");             // strip numbered list markers
  content = content.replace(/^\[[ xX]?\]\s*/,"");        // strip checkboxes
  content = content.replace(/#[\w-]+/g, "");             // strip all tags
  content = content.replace(/@\d{4}-\d{2}-\d{2}/g, ""); // strip @date annotations
  content = content.replace(/\^[\w-]+/g, "");            // strip block reference IDs
  return content.trim();
}

/**
 * Resolve the actual line number to modify, using the stored line number as a fast-path
 * hint and falling back to nearby-line and full-file search when the file has shifted.
 *
 * Returns -1 if no matching line is found.
 * An empty fingerprint skips content matching and always returns the hint unchanged.
 */
export function resolveLineNumber(lines: string[], hint: number, fingerprint: string): number {
  // Empty fingerprint means the item had no human text — use hint as-is
  if (!fingerprint) return hint;

  // Fast path: hint line still matches
  if (hint >= 0 && hint < lines.length && createFingerprint(lines[hint]) === fingerprint) {
    return hint;
  }

  // Nearby search: check up to 15 lines in each direction
  const NEARBY = 15;
  for (let delta = 1; delta <= NEARBY; delta++) {
    const before = hint - delta;
    const after  = hint + delta;
    if (before >= 0 && before < lines.length && createFingerprint(lines[before]) === fingerprint) return before;
    if (after < lines.length && createFingerprint(lines[after]) === fingerprint) return after;
  }

  // Full-file scan as last resort
  return lines.findIndex(l => createFingerprint(l) === fingerprint);
}

/**
 * Read a file, apply a transform to a single line, and write back in one vault.modify() call.
 *
 * When `fingerprint` is supplied and non-empty, the actual line to modify is resolved via
 * `resolveLineNumber()` first, recovering gracefully when external edits have shifted lines.
 * `lineNumber` is used as a fast-path hint; the search expands to ±15 lines then the full file.
 *
 * Throws if the resolved line is out of bounds or if `validate` returns a non-null error string.
 * `validate` receives the current line text before the transform.
 */
export async function modifyFileLine(
  vault: Vault,
  file: TFile,
  lineNumber: number,
  transform: (line: string) => string,
  validate?: (line: string) => string | null,
  fingerprint?: string
): Promise<void> {
  const content = await vault.read(file);
  const lines = content.split("\n");

  const resolved = (fingerprint)
    ? resolveLineNumber(lines, lineNumber, fingerprint)
    : lineNumber;

  if (resolved < 0 || resolved >= lines.length) {
    throw new Error(
      `Cannot locate line ${lineNumber} in ${file.path}` +
      (fingerprint ? ` (fingerprint: "${fingerprint}")` : "")
    );
  }

  const currentLine = lines[resolved];

  if (validate) {
    const error = validate(currentLine);
    if (error) throw new Error(error);
  }

  lines[resolved] = transform(currentLine);
  await vault.modify(file, lines.join("\n"));
}

export function openFileAtLine(
  app: App,
  file: TFile,
  line: number,
  blockEndLine?: number
): void {
  const leaf = app.workspace.getLeaf(false);
  leaf.openFile(file, { active: true }).then(() => {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.editor) {
      const editor = view.editor;
      const totalLines = editor.lineCount();

      // Determine the end of the block to scroll into view.
      // If blockEndLine provided, use it; otherwise scan forward to find
      // the next header or use a small buffer.
      let endLine = line;
      if (blockEndLine !== undefined && blockEndLine > line) {
        endLine = Math.min(blockEndLine, totalLines - 1);
      } else {
        // Scan forward from the target line to find the block extent
        const maxScan = Math.min(line + 20, totalLines - 1);
        for (let i = line + 1; i <= maxScan; i++) {
          const text = editor.getLine(i);
          // Stop at the next header (any level)
          if (/^#{1,6}\s/.test(text)) break;
          endLine = i;
        }
      }

      // Set cursor to the target line
      editor.setCursor({ line, ch: 0 });

      // Scroll the block range into view, then nudge so the target line
      // sits in the top third of the viewport rather than centered or at bottom
      editor.scrollIntoView(
        { from: { line, ch: 0 }, to: { line: endLine, ch: 0 } },
        true
      );

      // Nudge: scroll up so the target line is near the top third
      const scrollInfo = (editor as any).cm?.scrollDOM;
      if (scrollInfo) {
        const coords = (editor as any).cm.coordsAtPos(
          editor.posToOffset({ line, ch: 0 })
        );
        if (coords) {
          const viewportHeight = scrollInfo.clientHeight;
          const targetOffset = viewportHeight / 4;
          const currentTop = coords.top - scrollInfo.getBoundingClientRect().top;
          const adjustment = currentTop - targetOffset;
          if (Math.abs(adjustment) > 10) {
            scrollInfo.scrollTop += adjustment;
          }
        }
      }

      // Highlight the target line (not the full block)
      highlightLine(editor, line);
    }
  });
}
