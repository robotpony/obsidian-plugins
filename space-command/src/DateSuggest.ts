import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile,
} from "obsidian";
import { SpaceCommandSettings } from "./types";
import { formatDate } from "./utils";

interface DateOption {
  id: string;
  name: string;
  description: string;
  icon: string;
  getDate: () => Date;
}

export class DateSuggest extends EditorSuggest<DateOption> {
  private settings: SpaceCommandSettings;

  constructor(app: App, settings: SpaceCommandSettings) {
    super(app);
    this.settings = settings;
  }

  private getDateOptions(): DateOption[] {
    return [
      {
        id: "date",
        name: "@date",
        description: "Today's date",
        icon: "📅",
        getDate: () => new Date(),
      },
      {
        id: "today",
        name: "@today",
        description: "Today's date",
        icon: "📅",
        getDate: () => new Date(),
      },
      {
        id: "tomorrow",
        name: "@tomorrow",
        description: "Tomorrow's date",
        icon: "📆",
        getDate: () => {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          return d;
        },
      },
      {
        id: "yesterday",
        name: "@yesterday",
        description: "Yesterday's date",
        icon: "📆",
        getDate: () => {
          const d = new Date();
          d.setDate(d.getDate() - 1);
          return d;
        },
      },
    ];
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    file: TFile | null
  ): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);
    const beforeCursor = line.substring(0, cursor.ch);

    // Match @ followed by word characters at the end
    const match = beforeCursor.match(/@(\w*)$/);
    if (!match) {
      return null;
    }

    // Check that @ is not part of an email (preceded by alphanumeric)
    const atIndex = beforeCursor.lastIndexOf("@");
    if (atIndex > 0) {
      const charBefore = beforeCursor[atIndex - 1];
      if (/[a-zA-Z0-9]/.test(charBefore)) {
        return null;
      }
    }

    return {
      start: { line: cursor.line, ch: atIndex },
      end: cursor,
      query: match[1].toLowerCase(),
    };
  }

  getSuggestions(context: EditorSuggestContext): DateOption[] {
    const query = context.query.toLowerCase();
    const options = this.getDateOptions();

    if (!query) {
      return options;
    }

    // Filter by query and also match shortcuts like "d" for "date", "t" for "today"
    return options.filter((opt) => {
      const id = opt.id.toLowerCase();
      return id.startsWith(query) || id.includes(query);
    });
  }

  renderSuggestion(item: DateOption, el: HTMLElement): void {
    el.addClass("space-command-suggestion");

    const iconSpan = el.createEl("span", { cls: "suggestion-icon" });
    iconSpan.textContent = item.icon;

    const textContainer = el.createEl("div", { cls: "suggestion-content" });

    const nameSpan = textContainer.createEl("span", {
      cls: "suggestion-name",
      text: item.name,
    });

    // Show the actual date that will be inserted
    const date = formatDate(item.getDate(), this.settings.dateFormat);
    textContainer.createEl("span", {
      cls: "suggestion-description",
      text: date,
    });
  }

  selectSuggestion(
    item: DateOption,
    evt: MouseEvent | KeyboardEvent
  ): void {
    const editor = this.context?.editor;
    if (!editor || !this.context) return;

    const start = this.context.start;
    const end = this.context.end;

    const date = formatDate(item.getDate(), this.settings.dateFormat);
    editor.replaceRange(date, start, end);
    editor.setCursor({ line: start.line, ch: start.ch + date.length });
  }
}
