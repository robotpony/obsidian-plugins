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
 * Priority order: #focus=0, #today=1, #p0=2, #p1=3, #p2=4, no priority=5, #p3=6, #p4=7, snoozed=8
 */
export function getPriorityValue(tags: string[]): number {
  if (tags.includes("#focus")) return 0;
  if (tags.includes("#today")) return 1;
  if (tags.includes("#p0")) return 2;
  if (tags.includes("#p1")) return 3;
  if (tags.includes("#p2")) return 4;
  if (tags.includes("#p3")) return 6;
  if (tags.includes("#p4")) return 7;
  // Snoozed items (any of the snooze tag variants) get lowest priority
  if (tags.includes("#future") || tags.includes("#snooze") || tags.includes("#snoozed")) return 8;
  return 5; // No priority = medium (between #p2 and #p3)
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
  return tags.filter(tag => !systemTags.has(tag)).length;
}

/**
 * Compare two items for sorting.
 * Sort order: 1) #focus first, 2) priority (p0-p4), 3) more tags = higher ranking
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareTodoItems(
  a: { tags: string[] },
  b: { tags: string[] }
): number {
  // 1. Focus tag first
  const aHasFocus = a.tags.includes("#focus");
  const bHasFocus = b.tags.includes("#focus");
  if (aHasFocus && !bHasFocus) return -1;
  if (!aHasFocus && bHasFocus) return 1;

  // 2. Priority (lower value = higher priority)
  const priorityDiff = getPriorityValue(a.tags) - getPriorityValue(b.tags);
  if (priorityDiff !== 0) return priorityDiff;

  // 3. Tag count (more tags = higher ranking, so sort descending)
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
