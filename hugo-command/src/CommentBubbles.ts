import {
  ViewPlugin,
  DecorationSet,
  Decoration,
  EditorView,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

type CommentType = "question" | "style" | "suggestion";

/**
 * Widget that renders a comment bubble with delete button
 */
class CommentBubbleWidget extends WidgetType {
  constructor(
    readonly content: string,
    readonly commentType: CommentType,
    readonly from: number,
    readonly to: number,
    readonly isStandalone: boolean
  ) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const bubble = document.createElement("span");
    bubble.className = `hugo-comment-bubble ${this.commentType}`;

    // Add icon based on type
    const icon = document.createElement("span");
    icon.className = "hugo-comment-icon";
    switch (this.commentType) {
      case "question":
        icon.textContent = "?";
        break;
      case "style":
        icon.textContent = "📝";
        break;
      default:
        icon.textContent = "💡";
    }
    bubble.appendChild(icon);

    // Add text
    const text = document.createElement("span");
    text.className = "hugo-comment-text";
    text.textContent = this.content;
    bubble.appendChild(text);

    // Add delete button
    const deleteBtn = document.createElement("span");
    deleteBtn.className = "hugo-comment-delete";
    deleteBtn.textContent = "×";
    deleteBtn.title = "Remove suggestion";
    deleteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.deleteComment(view);
    });
    bubble.appendChild(deleteBtn);

    return bubble;
  }

  private deleteComment(view: EditorView): void {
    // For standalone comments, delete the whole line including the newline
    let from = this.from;
    let to = this.to;

    if (this.isStandalone) {
      const doc = view.state.doc;
      const line = doc.lineAt(from);
      from = line.from;
      // Include the newline if not the last line
      to = line.to < doc.length ? line.to + 1 : line.to;
    }

    view.dispatch({
      changes: { from, to, insert: "" },
    });
  }

  eq(other: CommentBubbleWidget): boolean {
    return (
      other.content === this.content &&
      other.commentType === this.commentType &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  ignoreEvent(event: Event): boolean {
    // Allow click events to pass through for the delete button
    return event.type !== "click";
  }
}

/**
 * Decoration that hides the original comment
 */
const hideDecoration = Decoration.replace({});

/**
 * Determine the comment type based on prefix
 */
function getCommentType(prefix: string | undefined, content: string): CommentType {
  if (prefix?.startsWith("Q:")) return "question";
  if (prefix?.startsWith("Style:") || content.toLowerCase().startsWith("style:")) return "style";
  return "suggestion";
}

/**
 * Creates decorations for HTML comments in the document
 */
function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const text = doc.toString();

  // Match HTML comments: <!-- content -->
  // Capture Q: or Style: prefix separately to identify type
  const commentRegex = /<!--\s*(Q:\s*|Style:\s*)?(.+?)\s*-->/gs;
  let match;

  while ((match = commentRegex.exec(text)) !== null) {
    const prefix = match[1];
    const content = match[2].trim();
    const commentType = getCommentType(prefix, content);
    const from = match.index;
    const to = match.index + match[0].length;

    // Find the line containing this comment
    const line = doc.lineAt(from);
    const lineText = line.text;
    const commentStartInLine = from - line.from;

    // Check if comment is the only non-whitespace on the line
    const beforeComment = lineText.substring(0, commentStartInLine).trim();
    const afterComment = lineText.substring(commentStartInLine + match[0].length).trim();
    const isStandalone = !beforeComment && !afterComment;

    if (isStandalone) {
      // Hide the entire line (including newline) for standalone comments
      // Replace comment with a line widget instead
      builder.add(from, to, Decoration.replace({
        widget: new CommentBubbleWidget(content, commentType, from, to, true),
      }));
    } else {
      // Inline comment - hide and add widget after
      builder.add(from, to, hideDecoration);
      builder.add(to, to, Decoration.widget({
        widget: new CommentBubbleWidget(content, commentType, from, to, false),
        side: 1, // After the position
      }));
    }
  }

  return builder.finish();
}

/**
 * ViewPlugin that manages comment bubble decorations
 */
export const commentBubblesPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

/**
 * Remove all HTML comments from content
 */
export function stripHtmlComments(content: string): string {
  // Remove standalone comment lines (entire line including newline)
  let result = content.replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*\r?\n/gm, "");
  // Remove inline comments
  result = result.replace(/<!--[\s\S]*?-->/g, "");
  return result;
}
