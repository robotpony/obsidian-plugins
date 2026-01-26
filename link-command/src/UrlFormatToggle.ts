import {
  EditorView,
  WidgetType,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { StateField, EditorState, Transaction, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { UrlUnfurlService } from "./UrlUnfurlService";
import { UrlMetadata } from "./types";

export type LinkFormat = "url" | "link" | "card";

interface UrlMatch {
  url: string;
  from: number;
  to: number;
  format: LinkFormat;
  lineStart: number;
  lineEnd: number;
}

/**
 * Icons for different link states
 */
const ICONS = {
  url: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
  link: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="0"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  card: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line></svg>`,
};

/**
 * Widget that renders the format toggle button
 */
class FormatToggleWidget extends WidgetType {
  constructor(
    private url: string,
    private currentFormat: LinkFormat,
    private from: number,
    private to: number,
    private lineStart: number,
    private lineEnd: number
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const btn = document.createElement("span");
    btn.className = `link-format-toggle link-format-toggle-${this.currentFormat}`;
    btn.innerHTML = ICONS[this.currentFormat];
    btn.setAttribute("aria-label", `Toggle link format (currently ${this.currentFormat})`);
    btn.setAttribute("data-url", this.url);
    btn.setAttribute("data-from", String(this.from));
    btn.setAttribute("data-to", String(this.to));
    btn.setAttribute("data-format", this.currentFormat);
    btn.setAttribute("data-line-start", String(this.lineStart));
    btn.setAttribute("data-line-end", String(this.lineEnd));
    return btn;
  }

  ignoreEvent(): boolean {
    return false; // Allow click events through
  }

  eq(other: FormatToggleWidget): boolean {
    return (
      this.url === other.url &&
      this.currentFormat === other.currentFormat &&
      this.from === other.from &&
      this.to === other.to
    );
  }
}

/**
 * Detect the format of a URL at a given position
 */
function detectFormat(state: EditorState, url: string, pos: number): LinkFormat {
  const doc = state.doc;
  const line = doc.lineAt(pos);
  const lineText = line.text;

  // Check if we're inside a link-card code block
  // Look backwards for ```link-card
  let lineNum = line.number;
  let inCodeBlock = false;
  let codeBlockStart = -1;

  while (lineNum > 0) {
    const checkLine = doc.line(lineNum);
    const text = checkLine.text.trim();
    if (text.startsWith("```link-card")) {
      inCodeBlock = true;
      codeBlockStart = lineNum;
      break;
    }
    if (text.startsWith("```") && !text.startsWith("```link-card")) {
      break; // Different code block or end of block
    }
    lineNum--;
  }

  if (inCodeBlock) {
    // Verify we're before the closing ```
    for (let i = line.number; i <= doc.lines; i++) {
      const checkLine = doc.line(i);
      if (checkLine.text.trim() === "```") {
        return "card";
      }
    }
  }

  // Check if URL is inside a markdown link [title](url)
  // Look for pattern like ](url) where url matches
  const urlEscaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mdLinkPattern = new RegExp(`\\]\\(${urlEscaped}\\)`);
  if (mdLinkPattern.test(lineText)) {
    return "link";
  }

  return "url";
}

/**
 * Find the full range of a link format (for replacement)
 */
function findFormatRange(
  state: EditorState,
  url: string,
  pos: number,
  format: LinkFormat
): { from: number; to: number; lineStart: number; lineEnd: number } {
  const doc = state.doc;
  const line = doc.lineAt(pos);

  if (format === "url") {
    // Just the URL itself
    const urlStart = line.text.indexOf(url);
    if (urlStart >= 0) {
      return {
        from: line.from + urlStart,
        to: line.from + urlStart + url.length,
        lineStart: line.number,
        lineEnd: line.number,
      };
    }
  }

  if (format === "link") {
    // Find [title](url) pattern
    const urlEscaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const mdLinkPattern = new RegExp(`\\[([^\\]]*)\\]\\(${urlEscaped}\\)`);
    const match = mdLinkPattern.exec(line.text);
    if (match) {
      return {
        from: line.from + match.index,
        to: line.from + match.index + match[0].length,
        lineStart: line.number,
        lineEnd: line.number,
      };
    }
  }

  if (format === "card") {
    // Find the entire code block
    let startLine = line.number;
    let endLine = line.number;

    // Find start
    while (startLine > 0) {
      const checkLine = doc.line(startLine);
      if (checkLine.text.trim().startsWith("```link-card")) {
        break;
      }
      startLine--;
    }

    // Find end
    for (let i = startLine + 1; i <= doc.lines; i++) {
      if (doc.line(i).text.trim() === "```") {
        endLine = i;
        break;
      }
    }

    return {
      from: doc.line(startLine).from,
      to: doc.line(endLine).to,
      lineStart: startLine,
      lineEnd: endLine,
    };
  }

  // Fallback
  return {
    from: pos,
    to: pos + url.length,
    lineStart: line.number,
    lineEnd: line.number,
  };
}

/**
 * Build decorations for all URLs in the document
 */
function buildDecorations(state: EditorState, enabled: boolean): DecorationSet {
  if (!enabled) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  const doc = state.doc;

  // URL regex - matches http/https URLs
  const urlRegex = /https?:\/\/[^\s\]\)"`'<>]+/g;

  // Track URLs we've already processed to avoid duplicates
  const processed = new Set<string>();

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const lineText = line.text;

    // Skip if we're in a code block header
    if (lineText.trim().startsWith("```")) continue;

    let match;
    urlRegex.lastIndex = 0;

    while ((match = urlRegex.exec(lineText)) !== null) {
      const url = match[0];
      const urlPos = line.from + match.index;
      const key = `${urlPos}:${url}`;

      if (processed.has(key)) continue;
      processed.add(key);

      // Clean up URL (remove trailing punctuation that's likely not part of URL)
      const cleanUrl = url.replace(/[.,;:!?)]+$/, "");
      const cleanUrlPos = urlPos;
      const cleanUrlEnd = cleanUrlPos + cleanUrl.length;

      const format = detectFormat(state, cleanUrl, cleanUrlPos);
      const range = findFormatRange(state, cleanUrl, cleanUrlPos, format);

      // Position the widget at the end of the URL/link/card
      const widgetPos = format === "card" ? range.to : cleanUrlEnd;

      const widget = new FormatToggleWidget(
        cleanUrl,
        format,
        range.from,
        range.to,
        range.lineStart,
        range.lineEnd
      );

      const decoration = Decoration.widget({
        widget,
        side: 1, // After the position
      });

      builder.add(widgetPos, widgetPos, decoration);
    }
  }

  return builder.finish();
}

/**
 * Configuration for the format toggle extension
 */
export interface FormatToggleConfig {
  enabled: boolean;
  unfurlService: UrlUnfurlService;
  getSourcePage: () => string | undefined;
  onFormatChange?: () => void;
}

/**
 * Create the StateField for toggle configuration
 */
function createConfigField(config: FormatToggleConfig) {
  return StateField.define<FormatToggleConfig>({
    create: () => config,
    update: (value) => value,
  });
}

/**
 * Create the format toggle editor extension
 */
export function createFormatToggleExtension(config: FormatToggleConfig) {
  const configField = createConfigField(config);

  const decorationField = StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state, config.enabled);
    },
    update(decorations, tr) {
      const currentConfig = tr.state.field(configField);
      if (tr.docChanged) {
        return buildDecorations(tr.state, currentConfig.enabled);
      }
      return decorations.map(tr.changes);
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  const clickHandler = ViewPlugin.fromClass(
    class {
      constructor(private view: EditorView) {}

      destroy() {}
    },
    {
      eventHandlers: {
        click: (event: MouseEvent, view: EditorView) => {
          const target = event.target as HTMLElement;
          const toggle = target.closest(".link-format-toggle") as HTMLElement;

          if (!toggle) return false;

          event.preventDefault();
          event.stopPropagation();

          const url = toggle.getAttribute("data-url");
          const from = parseInt(toggle.getAttribute("data-from") || "0", 10);
          const to = parseInt(toggle.getAttribute("data-to") || "0", 10);
          const format = toggle.getAttribute("data-format") as LinkFormat;
          const lineStart = parseInt(toggle.getAttribute("data-line-start") || "0", 10);
          const lineEnd = parseInt(toggle.getAttribute("data-line-end") || "0", 10);

          if (!url) return false;

          const currentConfig = view.state.field(configField);
          cycleFormat(view, url, from, to, format, lineStart, lineEnd, currentConfig);

          return true;
        },
      },
    }
  );

  return [configField, decorationField, clickHandler];
}

/**
 * Cycle through formats: url -> link -> card -> url
 */
async function cycleFormat(
  view: EditorView,
  url: string,
  from: number,
  to: number,
  currentFormat: LinkFormat,
  lineStart: number,
  lineEnd: number,
  config: FormatToggleConfig
): Promise<void> {
  const nextFormat = getNextFormat(currentFormat);

  let replacement: string;

  switch (nextFormat) {
    case "link":
      // Fetch metadata and create markdown link
      replacement = await createMarkdownLink(url, config);
      break;

    case "card":
      // Create link-card block
      replacement = await createLinkCard(url, config);
      break;

    case "url":
      // Just the plain URL
      replacement = url;
      break;
  }

  // Apply the replacement
  const transaction = view.state.update({
    changes: { from, to, insert: replacement },
  });

  view.dispatch(transaction);

  // Notify of format change
  if (config.onFormatChange) {
    config.onFormatChange();
  }
}

function getNextFormat(current: LinkFormat): LinkFormat {
  switch (current) {
    case "url":
      return "link";
    case "link":
      return "card";
    case "card":
      return "url";
  }
}

async function createMarkdownLink(url: string, config: FormatToggleConfig): Promise<string> {
  const sourcePage = config.getSourcePage();
  const result = await config.unfurlService.unfurl(url, false, sourcePage);

  if (result.success && result.metadata?.title) {
    const title = result.metadata.title;
    return `[${title}](${url})`;
  }

  // Fallback: use URL as title
  return `[${url}](${url})`;
}

async function createLinkCard(url: string, config: FormatToggleConfig): Promise<string> {
  const sourcePage = config.getSourcePage();
  const result = await config.unfurlService.unfurl(url, false, sourcePage);

  // Compact card format: only url and title (no description/image for inline display)
  const lines = ["```link-card", `url: ${url}`];

  if (result.success && result.metadata?.title) {
    lines.push(`title: ${result.metadata.title}`);
  }

  lines.push("```");
  return lines.join("\n");
}

/**
 * Extract URL from the current format
 */
export function extractUrlFromFormat(text: string, format: LinkFormat): string | null {
  if (format === "url") {
    const urlMatch = text.match(/https?:\/\/[^\s\]\)"`'<>]+/);
    return urlMatch ? urlMatch[0] : null;
  }

  if (format === "link") {
    const linkMatch = text.match(/\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/);
    return linkMatch ? linkMatch[2] : null;
  }

  if (format === "card") {
    const urlMatch = text.match(/url:\s*(https?:\/\/[^\s]+)/);
    return urlMatch ? urlMatch[1] : null;
  }

  return null;
}
