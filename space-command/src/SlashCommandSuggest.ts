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

interface SlashCommand {
  id: string;
  name: string;
  description: string;
  icon: string;
  action: (editor: Editor, start: EditorPosition, end: EditorPosition) => void;
}

interface CalloutType {
  id: string;
  name: string;
  icon: string;
}

const CALLOUT_TYPES: CalloutType[] = [
  { id: "info", name: "Info", icon: "ℹ️" },
  { id: "tip", name: "Tip", icon: "💡" },
  { id: "note", name: "Note", icon: "📝" },
  { id: "warning", name: "Warning", icon: "⚠️" },
  { id: "danger", name: "Danger", icon: "🔴" },
  { id: "bug", name: "Bug", icon: "🐛" },
  { id: "example", name: "Example", icon: "📋" },
  { id: "quote", name: "Quote", icon: "💬" },
  { id: "abstract", name: "Abstract", icon: "📄" },
  { id: "success", name: "Success", icon: "✅" },
  { id: "question", name: "Question", icon: "❓" },
  { id: "failure", name: "Failure", icon: "❌" },
];

type SuggestionItem = SlashCommand | CalloutType;

export class SlashCommandSuggest extends EditorSuggest<SuggestionItem> {
  private settings: SpaceCommandSettings;
  private inCalloutMenu: boolean = false;
  private triggerStart: EditorPosition | null = null;

  constructor(app: App, settings: SpaceCommandSettings) {
    super(app);
    this.settings = settings;
  }

  private getCommands(): SlashCommand[] {
    return [
      {
        id: "todo",
        name: "Todo",
        description: "Insert a TODO item",
        icon: "☐",
        action: (editor, start, end) => {
          editor.replaceRange("- [ ] #todo ", start, end);
          editor.setCursor({ line: start.line, ch: start.ch + 12 });
        },
      },
      {
        id: "today",
        name: "Today",
        description: "Insert today's date",
        icon: "📅",
        action: (editor, start, end) => {
          const date = formatDate(new Date(), this.settings.dateFormat);
          editor.replaceRange(date, start, end);
          editor.setCursor({ line: start.line, ch: start.ch + date.length });
        },
      },
      {
        id: "tomorrow",
        name: "Tomorrow",
        description: "Insert tomorrow's date",
        icon: "📆",
        action: (editor, start, end) => {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const date = formatDate(tomorrow, this.settings.dateFormat);
          editor.replaceRange(date, start, end);
          editor.setCursor({ line: start.line, ch: start.ch + date.length });
        },
      },
      {
        id: "callout",
        name: "Callout",
        description: "Insert a callout block",
        icon: "📢",
        action: () => {
          // This triggers the sub-menu, handled specially in selectSuggestion
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

    // Only trigger at column 0 (start of line, optionally with whitespace)
    const match = beforeCursor.match(/^(\s*)\/(\S*)$/);
    if (!match) {
      this.inCalloutMenu = false;
      return null;
    }

    const whitespace = match[1];
    const query = match[2];

    this.triggerStart = { line: cursor.line, ch: whitespace.length };

    return {
      start: this.triggerStart,
      end: cursor,
      query: query,
    };
  }

  getSuggestions(
    context: EditorSuggestContext
  ): SuggestionItem[] {
    const query = context.query.toLowerCase();

    if (this.inCalloutMenu) {
      // Show callout types
      return CALLOUT_TYPES.filter(
        (type) =>
          type.id.includes(query) || type.name.toLowerCase().includes(query)
      );
    }

    // Show main commands
    const commands = this.getCommands();
    if (!query) {
      return commands;
    }

    return commands.filter(
      (cmd) =>
        cmd.id.includes(query) || cmd.name.toLowerCase().includes(query)
    );
  }

  renderSuggestion(item: SuggestionItem, el: HTMLElement): void {
    el.addClass("space-command-suggestion");

    const iconSpan = el.createEl("span", { cls: "suggestion-icon" });
    iconSpan.textContent = item.icon;

    const textContainer = el.createEl("div", { cls: "suggestion-content" });
    textContainer.createEl("span", {
      cls: "suggestion-name",
      text: item.name,
    });

    if ("description" in item) {
      textContainer.createEl("span", {
        cls: "suggestion-description",
        text: item.description,
      });
    }
  }

  selectSuggestion(
    item: SuggestionItem,
    evt: MouseEvent | KeyboardEvent
  ): void {
    const editor = this.context?.editor;
    if (!editor || !this.context) return;

    const start = this.context.start;
    const end = this.context.end;

    if (this.inCalloutMenu) {
      // Insert callout with selected type
      const calloutType = item as CalloutType;
      const calloutText = `> [!${calloutType.id}]\n> `;
      editor.replaceRange(calloutText, start, end);
      // Position cursor after "> " on the second line
      editor.setCursor({ line: start.line + 1, ch: 2 });
      this.inCalloutMenu = false;
    } else if ("action" in item) {
      const command = item as SlashCommand;
      if (command.id === "callout") {
        // Enter callout sub-menu
        this.inCalloutMenu = true;
        // Clear the "/callout" text and show callout types
        editor.replaceRange("/", start, end);
        // Re-trigger suggestions
        editor.setCursor({ line: start.line, ch: start.ch + 1 });
      } else {
        command.action(editor, start, end);
      }
    }
  }
}
