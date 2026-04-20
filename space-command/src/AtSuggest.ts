import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile,
} from "obsidian";
import { SpaceCommandSettings, TeamMember } from "./types";
import { TeamManager } from "./TeamManager";
import { formatDate } from "./utils";

interface AtSuggestion {
  kind: "date" | "user";
  id: string;
  label: string;
  description: string;
  icon: string;
  getDate?: () => Date;
  handle?: string;
}

export class AtSuggest extends EditorSuggest<AtSuggestion> {
  private settings: SpaceCommandSettings;
  private teamManager: TeamManager;

  constructor(app: App, settings: SpaceCommandSettings, teamManager: TeamManager) {
    super(app);
    this.settings = settings;
    this.teamManager = teamManager;
  }

  private getDateOptions(): AtSuggestion[] {
    return [
      {
        kind: "date", id: "date", label: "@date",
        description: "Today's date", icon: "📅",
        getDate: () => new Date(),
      },
      {
        kind: "date", id: "today", label: "@today",
        description: "Today's date", icon: "📅",
        getDate: () => new Date(),
      },
      {
        kind: "date", id: "tomorrow", label: "@tomorrow",
        description: "Tomorrow's date", icon: "📆",
        getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); return d; },
      },
      {
        kind: "date", id: "yesterday", label: "@yesterday",
        description: "Yesterday's date", icon: "📆",
        getDate: () => { const d = new Date(); d.setDate(d.getDate() - 1); return d; },
      },
    ];
  }

  private getUserOptions(): AtSuggestion[] {
    const team = this.teamManager.getTeam();
    const options: AtSuggestion[] = [];

    const meHandle = this.teamManager.resolveMe();
    if (meHandle) {
      const meMember = team.find(m => m.isMe);
      options.push({
        kind: "user", id: "me", label: "@me",
        description: meMember?.name ?? meHandle,
        icon: "👤", handle: "me",
      });
    }

    for (const member of team) {
      options.push({
        kind: "user", id: member.handle, label: `@${member.handle}`,
        description: member.name,
        icon: "👤", handle: member.handle,
      });
    }

    return options;
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    file: TFile | null
  ): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);
    const beforeCursor = line.substring(0, cursor.ch);

    const match = beforeCursor.match(/@([\w.]*)$/);
    if (!match) return null;

    const atIndex = beforeCursor.lastIndexOf("@");
    if (atIndex > 0) {
      const charBefore = beforeCursor[atIndex - 1];
      if (/[a-zA-Z0-9]/.test(charBefore)) return null;
    }

    return {
      start: { line: cursor.line, ch: atIndex },
      end: cursor,
      query: match[1].toLowerCase(),
    };
  }

  getSuggestions(context: EditorSuggestContext): AtSuggestion[] {
    const query = context.query.toLowerCase();
    const dateOptions = this.getDateOptions();
    const userOptions = this.getUserOptions();
    const all = [...dateOptions, ...userOptions];

    if (!query) return all;

    return all.filter((opt) => {
      const id = opt.id.toLowerCase();
      return id.startsWith(query) || id.includes(query);
    });
  }

  renderSuggestion(item: AtSuggestion, el: HTMLElement): void {
    el.addClass("space-command-suggestion");

    const iconSpan = el.createEl("span", { cls: "suggestion-icon" });
    iconSpan.textContent = item.icon;

    const textContainer = el.createEl("div", { cls: "suggestion-content" });
    textContainer.createEl("span", { cls: "suggestion-name", text: item.label });

    if (item.kind === "date" && item.getDate) {
      const date = formatDate(item.getDate(), this.settings.dateFormat);
      textContainer.createEl("span", { cls: "suggestion-description", text: date });
    } else {
      textContainer.createEl("span", { cls: "suggestion-description", text: item.description });
    }
  }

  selectSuggestion(item: AtSuggestion, evt: MouseEvent | KeyboardEvent): void {
    const editor = this.context?.editor;
    if (!editor || !this.context) return;

    const start = this.context.start;
    const end = this.context.end;

    if (item.kind === "date" && item.getDate) {
      const date = formatDate(item.getDate(), this.settings.dateFormat);
      editor.replaceRange(date, start, end);
      editor.setCursor({ line: start.line, ch: start.ch + date.length });
    } else if (item.handle) {
      const text = `@${item.handle} `;
      editor.replaceRange(text, start, end);
      editor.setCursor({ line: start.line, ch: start.ch + text.length });
    }
  }
}
