import { App, MarkdownView, TFile, WorkspaceLeaf, moment, Notice } from "obsidian";

/** Logo prefix for Notice messages */
export const LOGO_PREFIX = "␣⌘";

/**
 * Plugin tags - system tags that get base logo colour styling.
 * These are the core tags that Space Command uses.
 */
export const PLUGIN_TAGS = new Set([
  '#todo', '#todos', '#todone', '#todones',
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
 * Show a notice with the styled Space Command logo badge.
 * Uses a DocumentFragment to render the logo with CSS styling.
 */
export function showNotice(message: string, timeout?: number): Notice {
  const fragment = document.createDocumentFragment();

  const logo = document.createElement("span");
  logo.className = "space-command-logo";
  logo.textContent = LOGO_PREFIX;
  fragment.appendChild(logo);

  fragment.appendChild(document.createTextNode(" " + message));

  return new Notice(fragment, timeout);
}

export function formatDate(date: Date, format: string): string {
  return (moment as any)(date).format(format);
}

/**
 * Get the priority value for sorting TODOs.
 * Lower values = higher priority.
 *
 * Priority order (explicit priority tags take precedence over #focus):
 * | Tag              | Value | Meaning                              |
 * |------------------|-------|--------------------------------------|
 * | #today           | 1     | Time-sensitive, due today            |
 * | #p0              | 2     | Highest priority                     |
 * | #p1              | 3     | High priority                        |
 * | #p2              | 4     | Medium-high priority                 |
 * | #p3              | 5     | Medium-low priority                  |
 * | #p4              | 6     | Low priority                         |
 * | #focus (alone)   | 7     | Focused but no explicit priority     |
 * | No priority      | 8     | Unmarked items                       |
 * | #future/#snooze  | 9     | Snoozed/deferred items               |
 *
 * Note: #focus is a visibility filter, not a priority. If an item has both
 * #focus and a priority tag (e.g., #p0), the priority tag determines sort order.
 */
export function getPriorityValue(tags: string[]): number {
  // Check explicit priority tags first (these take precedence over #focus)
  if (hasTag(tags, "#today")) return 1;
  if (hasTag(tags, "#p0")) return 2;
  if (hasTag(tags, "#p1")) return 3;
  if (hasTag(tags, "#p2")) return 4;
  if (hasTag(tags, "#p3")) return 5;
  if (hasTag(tags, "#p4")) return 6;
  // Snoozed items get lowest priority
  if (hasTag(tags, "#future") || hasTag(tags, "#snooze") || hasTag(tags, "#snoozed")) return 9;
  // #focus without explicit priority sorts between #p4 and unmarked
  if (hasTag(tags, "#focus")) return 7;
  return 8; // No priority = low (after all prioritized items)
}

/**
 * Count meaningful tags (excludes system tags like #todo, #todone, #idea, etc.).
 * Used as a tertiary sort criterion after focus and priority.
 */
export function getTagCount(tags: string[]): number {
  const systemTags = new Set([
    "#todo", "#todos", "#todone", "#todones",
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
 * Sort order: 1) priority (today, p0-p4, focus, unmarked, snoozed), 2) more tags = higher ranking
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareTodoItems(
  a: { tags: string[] },
  b: { tags: string[] }
): number {
  // 1. Priority (lower value = higher priority)
  const priorityDiff = getPriorityValue(a.tags) - getPriorityValue(b.tags);
  if (priorityDiff !== 0) return priorityDiff;

  // 2. Tag count (more tags = higher ranking, so sort descending)
  const tagCountDiff = getTagCount(b.tags) - getTagCount(a.tags);
  return tagCountDiff;
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
 * Get effective priority for an item, considering children for header items.
 *
 * - Standalone items: returns their own priority value
 * - Header items with children: returns the better of header priority or child average
 * - Header items without active children: returns their own priority value
 *
 * This ensures header TODOs sort based on the work they contain, while still
 * respecting priority tags on the header itself. If a header has #focus but
 * children are unmarked, the header's #focus takes precedence.
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
  // This ensures a #focus header sorts at least as high as #focus items,
  // but can sort higher if children have better priority (e.g., #p0)
  const sum = childPriorities.reduce((a, b) => a + b, 0);
  const childAverage = sum / childPriorities.length;
  return Math.min(headerPriority, childAverage);
}

/**
 * Compare two items for sorting, considering effective priority for headers.
 * Use this instead of compareTodoItems when you have access to all items.
 */
export function compareWithEffectivePriority(
  a: PrioritySortableItem,
  b: PrioritySortableItem,
  allItems: PrioritySortableItem[]
): number {
  // 1. Effective priority (considers children for headers)
  const priorityDiff = getEffectivePriority(a, allItems) - getEffectivePriority(b, allItems);
  if (priorityDiff !== 0) return priorityDiff;

  // 2. Tag count (more tags = higher ranking, so sort descending)
  const tagCountDiff = getTagCount(b.tags) - getTagCount(a.tags);
  return tagCountDiff;
}

export function extractTags(text: string): string[] {
  // Remove inline code spans before extracting tags
  // This prevents matching tags inside backticks like `#ideation` (documentation examples)
  const textWithoutCode = text.replace(/`[^`]*`/g, "");
  const tagRegex = /#[\w-]+/g;
  return textWithoutCode.match(tagRegex) || [];
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

export function openFileAtLine(
  app: App,
  file: TFile,
  line: number
): void {
  const leaf = app.workspace.getLeaf(false);
  leaf.openFile(file, { active: true }).then(() => {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.editor) {
      const editor = view.editor;

      // Set cursor to the line
      editor.setCursor({ line, ch: 0 });

      // Scroll the line into view
      editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);

      // Highlight the line
      highlightLine(editor, line);
    }
  });
}
