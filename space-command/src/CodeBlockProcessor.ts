import { Plugin } from "obsidian";
import { EmbedRenderer } from "./EmbedRenderer";

export class CodeBlockProcessor {
  constructor(
    private embedRenderer: EmbedRenderer,
    private defaultTodoneFile: string
  ) {}

  // Register both code block processors
  registerProcessors(plugin: Plugin): void {
    plugin.registerMarkdownCodeBlockProcessor(
      "focus-todos",
      this.processFocusTodos.bind(this)
    );
    plugin.registerMarkdownCodeBlockProcessor(
      "focus-list",
      this.processFocusList.bind(this)
    );
  }

  // Handle focus-todos code blocks
  processFocusTodos(source: string, el: HTMLElement): void {
    const { todoneFile, filterString } = this.parseContent(source);
    this.embedRenderer.renderTodos(el, filterString, todoneFile);
  }

  // Handle focus-list code blocks
  processFocusList(source: string, el: HTMLElement): void {
    this.embedRenderer.renderProjects(el);
  }

  // Parse code block content
  // Supports multiple formats:
  // 1. Empty block: uses defaults
  // 2. File only: first line is TODONE file
  // 3. Filters only: all lines are filters (uses default file)
  // 4. File + filters (single line): "file.md | filters"
  // 5. File + filters (multi-line): first line is file, rest are filters
  private parseContent(source: string): {
    todoneFile: string;
    filterString: string;
  } {
    const lines = source
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // Empty block = use defaults
    if (lines.length === 0) {
      return {
        todoneFile: this.defaultTodoneFile,
        filterString: "",
      };
    }

    const firstLine = lines[0];

    // Check if first line is a filter (not a file path)
    // A line is considered a filter if it contains filter keywords
    const isFilter =
      firstLine.includes("|") ||
      firstLine.startsWith("path:") ||
      firstLine.startsWith("tags:") ||
      firstLine.startsWith("limit:") ||
      firstLine.startsWith("todone:");

    if (isFilter) {
      // All content is filters, use default file
      // Join with | since FilterParser splits by pipe
      return {
        todoneFile: this.defaultTodoneFile,
        filterString: lines.join(" | "),
      };
    }

    // Check if first line contains pipe (single-line format: "file | filters")
    if (firstLine.includes("|")) {
      const [file, ...filterParts] = firstLine.split("|");
      return {
        todoneFile: file.trim(),
        filterString: filterParts.join("|").trim(),
      };
    }

    // Multi-line format: first line is file, remaining lines are filters
    // Join with | since FilterParser splits by pipe
    const todoneFile = firstLine;
    const filterString = lines.slice(1).join(" | ");

    return { todoneFile, filterString };
  }
}
