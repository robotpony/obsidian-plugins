import {
  ViewPlugin,
  ViewUpdate,
  WidgetType,
  Decoration,
  DecorationSet,
  EditorView,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { App } from "obsidian";
import { TodoProcessor } from "./TodoProcessor";
import { TodoScanner } from "./TodoScanner";

// SVG icon for sort button
const SORT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5h10"/><path d="M11 9h7"/><path d="M11 13h4"/><path d="m3 17 3 3 3-3"/><path d="M6 18V4"/></svg>`;

/**
 * Widget that renders a sort button inline after header TODO text.
 */
class SortButtonWidget extends WidgetType {
  private app: App;
  private processor: TodoProcessor;
  private scanner: TodoScanner;
  private lineNumber: number;
  private filePath: string;

  constructor(
    app: App,
    processor: TodoProcessor,
    scanner: TodoScanner,
    lineNumber: number,
    filePath: string
  ) {
    super();
    this.app = app;
    this.processor = processor;
    this.scanner = scanner;
    this.lineNumber = lineNumber;
    this.filePath = filePath;
  }

  toDOM(): HTMLElement {
    const btn = document.createElement("button");
    btn.className = "todo-sort-btn-editor clickable-icon";
    btn.setAttribute("aria-label", "Sort children");
    btn.innerHTML = SORT_ICON;

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Find the header TODO item from the scanner
      const todos = this.scanner.getTodos();
      const headerTodo = todos.find(
        (t) =>
          t.filePath === this.filePath &&
          t.lineNumber === this.lineNumber &&
          t.isHeader === true
      );

      if (headerTodo) {
        btn.disabled = true;
        await this.processor.sortHeaderChildren(headerTodo);
        btn.disabled = false;
      }
    });

    return btn;
  }

  eq(other: SortButtonWidget): boolean {
    return (
      this.lineNumber === other.lineNumber && this.filePath === other.filePath
    );
  }

  ignoreEvent(): boolean {
    return false; // Allow click events
  }
}

/**
 * Check if a line is a header TODO with children.
 */
function isHeaderTodoWithChildren(
  line: string,
  lineNumber: number,
  scanner: TodoScanner,
  filePath: string
): boolean {
  // Quick check: must be a header with #todo or #todos tag
  if (!/^#{1,6}\s+.*#todos?\b/i.test(line)) {
    return false;
  }

  // Check if it has children in the scanner's cache
  const todos = scanner.getTodos();
  const headerTodo = todos.find(
    (t) =>
      t.filePath === filePath &&
      t.lineNumber === lineNumber &&
      t.isHeader === true
  );

  return !!(
    headerTodo &&
    headerTodo.childLineNumbers &&
    headerTodo.childLineNumbers.length > 0
  );
}

/**
 * Create the ViewPlugin for header sort buttons.
 */
export function createHeaderSortPlugin(
  app: App,
  processor: TodoProcessor,
  scanner: TodoScanner
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private app: App;
      private processor: TodoProcessor;
      private scanner: TodoScanner;

      constructor(view: EditorView) {
        this.app = app;
        this.processor = processor;
        this.scanner = scanner;
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const filePath = this.getFilePath(view);

        if (!filePath) {
          return builder.finish();
        }

        // Iterate through visible lines
        for (const { from, to } of view.visibleRanges) {
          let pos = from;
          while (pos < to) {
            const line = view.state.doc.lineAt(pos);
            const lineText = line.text;
            const lineNumber = line.number - 1; // 0-indexed

            if (
              isHeaderTodoWithChildren(
                lineText,
                lineNumber,
                this.scanner,
                filePath
              )
            ) {
              // Add widget at end of line
              const widget = new SortButtonWidget(
                this.app,
                this.processor,
                this.scanner,
                lineNumber,
                filePath
              );
              builder.add(
                line.to,
                line.to,
                Decoration.widget({ widget, side: 1 })
              );
            }

            pos = line.to + 1;
          }
        }

        return builder.finish();
      }

      getFilePath(view: EditorView): string | null {
        // Get the file path from the editor state
        const file = this.app.workspace.getActiveFile();
        return file?.path ?? null;
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}
