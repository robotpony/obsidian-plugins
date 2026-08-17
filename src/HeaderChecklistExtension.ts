import { EditorView, keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";

/**
 * Check if a line is a header with #todo(s) or #idea(s) tag.
 */
function isTaggedHeader(lineText: string): boolean {
  // Must be a markdown header (starts with #)
  if (!/^#{1,6}\s+/.test(lineText)) {
    return false;
  }
  // Must contain #todo, #todos, #idea, or #ideas tag
  return /#(?:todos?|ideas?)\b/.test(lineText);
}

/**
 * Check if the next line exists and is empty (or whitespace only).
 */
function isNextLineEmpty(view: EditorView, currentLineNumber: number): boolean {
  const doc = view.state.doc;
  // currentLineNumber is 1-indexed in CodeMirror
  if (currentLineNumber >= doc.lines) {
    // No next line exists
    return true;
  }
  const nextLine = doc.line(currentLineNumber + 1);
  return nextLine.text.trim() === "";
}

/**
 * Insert checklist on next line after tagged header when Enter is pressed.
 * Returns true if handled, false to let default behavior proceed.
 */
function handleEnterOnTaggedHeader(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;

  // Only handle single cursor (not multiple selections)
  if (!selection.main.empty || selection.ranges.length > 1) {
    return false;
  }

  const cursorPos = selection.main.head;
  const currentLine = state.doc.lineAt(cursorPos);
  const lineText = currentLine.text;

  // Check if we're on a tagged header line
  if (!isTaggedHeader(lineText)) {
    return false;
  }

  // Check if cursor is at end of line (or near end, allowing trailing whitespace)
  const textAfterCursor = lineText.slice(cursorPos - currentLine.from);
  if (textAfterCursor.trim() !== "") {
    return false;
  }

  // Check if next line is empty or doesn't exist
  if (!isNextLineEmpty(view, currentLine.number)) {
    return false;
  }

  // Insert newline + checklist
  const checklistText = "\n\n- [ ] ";
  const insertPos = currentLine.to;

  view.dispatch({
    changes: { from: insertPos, to: insertPos, insert: checklistText },
    selection: { anchor: insertPos + checklistText.length },
  });

  return true;
}

/**
 * Create the keymap extension for auto-inserting checklists after tagged headers.
 * Uses high precedence to run before default Enter handling.
 */
export function createHeaderChecklistExtension() {
  return Prec.high(
    keymap.of([
      {
        key: "Enter",
        run: handleEnterOnTaggedHeader,
      },
    ])
  );
}
