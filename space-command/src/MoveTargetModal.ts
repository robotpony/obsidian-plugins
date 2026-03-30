import { App, SuggestModal, TFile } from "obsidian";

interface MoveTargetSuggestion {
  file: TFile;
  source: "pinned" | "recent" | "open" | "all";
}

export class MoveTargetModal extends SuggestModal<MoveTargetSuggestion> {
  private moveHistory: string[];
  private excludePath: string;
  private onChoose: (file: TFile) => void;

  constructor(
    app: App,
    moveHistory: string[],
    excludePath: string,
    onChoose: (file: TFile) => void
  ) {
    super(app);
    this.moveHistory = moveHistory;
    this.excludePath = excludePath;
    this.onChoose = onChoose;
    this.setPlaceholder("Move to file...");
  }

  getSuggestions(query: string): MoveTargetSuggestion[] {
    const lowerQuery = query.toLowerCase();
    const seen = new Set<string>();
    const suggestions: MoveTargetSuggestion[] = [];

    const addIfMatch = (file: TFile, source: MoveTargetSuggestion["source"]) => {
      if (seen.has(file.path)) return;
      if (file.path === this.excludePath) return;
      if (lowerQuery && !file.path.toLowerCase().includes(lowerQuery)) return;
      seen.add(file.path);
      suggestions.push({ file, source });
    };

    // 1. Pinned/bookmarked files
    const bookmarks = this.getBookmarkedFiles();
    for (const file of bookmarks) {
      addIfMatch(file, "pinned");
    }

    // 2. Open files in workspace
    const openFiles = this.getOpenFiles();
    for (const file of openFiles) {
      addIfMatch(file, "open");
    }

    // 3. Recent move targets
    for (const path of this.moveHistory) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        addIfMatch(file, "recent");
      }
    }

    // 4. All markdown files (filtered by query)
    if (lowerQuery) {
      const allFiles = this.app.vault.getMarkdownFiles();
      for (const file of allFiles) {
        addIfMatch(file, "all");
      }
    }

    return suggestions;
  }

  renderSuggestion(suggestion: MoveTargetSuggestion, el: HTMLElement): void {
    const icon = suggestion.source === "pinned" ? "📌 "
      : suggestion.source === "open" ? "📄 "
      : suggestion.source === "recent" ? "🕐 "
      : "";
    el.createEl("div", { text: icon + suggestion.file.path, cls: "suggestion-title" });
  }

  onChooseSuggestion(suggestion: MoveTargetSuggestion): void {
    this.onChoose(suggestion.file);
  }

  private getBookmarkedFiles(): TFile[] {
    const files: TFile[] = [];
    try {
      const bookmarksPlugin = (this.app as any).internalPlugins?.getPluginById?.("bookmarks");
      if (!bookmarksPlugin?.enabled) return files;

      const items = bookmarksPlugin.instance?.items;
      if (!Array.isArray(items)) return files;

      for (const item of items) {
        if (item.type === "file" && item.path) {
          const file = this.app.vault.getAbstractFileByPath(item.path);
          if (file instanceof TFile && file.extension === "md") {
            files.push(file);
          }
        }
      }
    } catch {
      // Bookmarks plugin may not be available
    }
    return files;
  }

  private getOpenFiles(): TFile[] {
    const files: TFile[] = [];
    const seen = new Set<string>();
    this.app.workspace.iterateAllLeaves((leaf) => {
      const file = (leaf.view as any)?.file;
      if (file instanceof TFile && file.extension === "md" && !seen.has(file.path)) {
        seen.add(file.path);
        files.push(file);
      }
    });
    return files;
  }
}
