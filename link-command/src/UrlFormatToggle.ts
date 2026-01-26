import {
  EditorView,
  WidgetType,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { StateField, EditorState, Transaction, RangeSetBuilder } from "@codemirror/state";
import { UrlUnfurlService } from "./UrlUnfurlService";
import { UrlMetadata } from "./types";

/**
 * Three inline formats:
 * - url: Plain URL (https://example.com)
 * - link: Markdown link [Title](url)
 * - rich: Rich markdown link [Title · **domain.com**](url)
 */
export type LinkFormat = "url" | "link" | "rich";

interface UrlMatch {
  url: string;
  from: number;
  to: number;
  format: LinkFormat;
}

/**
 * Command symbol (⌘) icon for the toggle button
 */
const COMMAND_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"></path></svg>`;

/**
 * Widget that renders the format toggle button
 */
class FormatToggleWidget extends WidgetType {
  constructor(
    private url: string,
    private currentFormat: LinkFormat,
    private from: number,
    private to: number
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const btn = document.createElement("span");
    btn.className = "link-format-toggle";
    btn.innerHTML = COMMAND_ICON;
    btn.setAttribute("aria-label", `Toggle link format (currently ${this.currentFormat})`);
    btn.setAttribute("data-url", this.url);
    btn.setAttribute("data-from", String(this.from));
    btn.setAttribute("data-to", String(this.to));
    btn.setAttribute("data-format", this.currentFormat);
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

  const urlEscaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Check for rich format: [Title · **domain**](url) or [Title **r/subreddit**](url)
  // Pattern: [...**...**...](url)
  const richPattern = new RegExp(`\\[[^\\]]*\\*\\*[^*]+\\*\\*[^\\]]*\\]\\(${urlEscaped}\\)`);
  if (richPattern.test(lineText)) {
    return "rich";
  }

  // Check for basic markdown link: [title](url)
  const linkPattern = new RegExp(`\\]\\(${urlEscaped}\\)`);
  if (linkPattern.test(lineText)) {
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
): { from: number; to: number } {
  const doc = state.doc;
  const line = doc.lineAt(pos);
  const urlEscaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (format === "url") {
    // Just the URL itself
    const urlStart = line.text.indexOf(url);
    if (urlStart >= 0) {
      return {
        from: line.from + urlStart,
        to: line.from + urlStart + url.length,
      };
    }
  }

  if (format === "link" || format === "rich") {
    // Find [anything](url) pattern
    const mdLinkPattern = new RegExp(`\\[([^\\]]*)\\]\\(${urlEscaped}\\)`);
    const match = mdLinkPattern.exec(line.text);
    if (match) {
      return {
        from: line.from + match.index,
        to: line.from + match.index + match[0].length,
      };
    }
  }

  // Fallback
  return {
    from: pos,
    to: pos + url.length,
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

    // Skip code block lines
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

      // Position the widget at the end of the link
      const widgetPos = format === "url" ? cleanUrlEnd : range.to;

      const widget = new FormatToggleWidget(
        cleanUrl,
        format,
        range.from,
        range.to
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

          if (!url) return false;

          const currentConfig = view.state.field(configField);
          cycleFormat(view, url, from, to, format, currentConfig);

          return true;
        },
      },
    }
  );

  return [configField, decorationField, clickHandler];
}

/**
 * Cycle through formats: url -> link -> rich -> url
 */
async function cycleFormat(
  view: EditorView,
  url: string,
  from: number,
  to: number,
  currentFormat: LinkFormat,
  config: FormatToggleConfig
): Promise<void> {
  const nextFormat = getNextFormat(currentFormat);

  let replacement: string;

  switch (nextFormat) {
    case "link":
      replacement = await createMarkdownLink(url, config);
      break;

    case "rich":
      replacement = await createRichLink(url, config);
      break;

    case "url":
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
      return "rich";
    case "rich":
      return "url";
  }
}

/**
 * Create basic markdown link: [Title](url)
 */
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

/**
 * Create rich markdown link: [Title · **domain.com**](url)
 * For Reddit: [Title **r/subreddit**](url)
 */
async function createRichLink(url: string, config: FormatToggleConfig): Promise<string> {
  const sourcePage = config.getSourcePage();
  const result = await config.unfurlService.unfurl(url, false, sourcePage);

  let title = url;
  let extra = "";

  if (result.success && result.metadata) {
    const metadata = result.metadata;
    title = metadata.title || url;

    // For Reddit, use subreddit
    if (metadata.subreddit) {
      extra = metadata.subreddit;
    } else {
      // For other sites, use domain
      try {
        const hostname = new URL(url).hostname.replace(/^www\./, "");
        extra = hostname;
      } catch {
        // Skip if URL parsing fails
      }
    }
  } else {
    // Fallback: extract domain from URL
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "");
      extra = hostname;
    } catch {
      // Skip if URL parsing fails
    }
  }

  if (extra) {
    return `[${title} · **${extra}**](${url})`;
  }

  return `[${title}](${url})`;
}

/**
 * Extract URL from the current format
 */
export function extractUrlFromFormat(text: string, format: LinkFormat): string | null {
  if (format === "url") {
    const urlMatch = text.match(/https?:\/\/[^\s\]\)"`'<>]+/);
    return urlMatch ? urlMatch[0] : null;
  }

  if (format === "link" || format === "rich") {
    const linkMatch = text.match(/\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/);
    return linkMatch ? linkMatch[2] : null;
  }

  return null;
}
