import { App, MarkdownView, TFile, WorkspaceLeaf, moment, Notice } from "obsidian";

/** Logo prefix for Notice messages */
export const LOGO_PREFIX = "␣⌘";

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
 * Priority order: #focus=0, #p0=1, #p1=2, #p2=3, no priority=4, #p3=5, #p4=6, #future=7
 */
export function getPriorityValue(tags: string[]): number {
  if (tags.includes("#focus")) return 0;
  if (tags.includes("#p0")) return 1;
  if (tags.includes("#p1")) return 2;
  if (tags.includes("#p2")) return 3;
  if (tags.includes("#p3")) return 5;
  if (tags.includes("#p4")) return 6;
  if (tags.includes("#future")) return 7;
  return 4; // No priority = medium (between #p2 and #p3)
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
 */
export function filenameToTag(basename: string): string {
  return "#" + basename.toLowerCase().replace(/\s+/g, "-");
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
  // Remove #idea tag and any trailing whitespace it leaves
  return text.replace(/#idea\b\s*/, "").trim();
}

export function replaceIdeaWithTodo(text: string): string {
  return text.replace(/#idea\b/, "#todo");
}

/**
 * Render text with tags safely using DOM methods (avoids XSS).
 * Tags matching mutedTags get muted-pill styling; others get standard tag styling.
 */
export function renderTextWithTags(
  text: string,
  container: HTMLElement,
  mutedTags: string[] = []
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
    if (mutedTags.length > 0 && mutedTags.includes(tag)) {
      // Priority tag: use muted-pill styling
      container.createEl("span", {
        cls: "tag muted-pill",
        text: tag,
      });
    } else {
      // Regular tag: standard tag styling
      container.createEl("span", {
        cls: "tag",
        text: tag,
      });
    }

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
 * Open a file at a specific line and highlight it.
 */
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
