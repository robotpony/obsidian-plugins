import { App, MarkdownPostProcessorContext } from "obsidian";
import { UrlUnfurlService } from "./UrlUnfurlService";

/**
 * Parses link-card code block content
 * Expects YAML-like format:
 * url: https://example.com
 * title: Page Title (optional, will be fetched)
 * description: Description (optional)
 * image: https://example.com/image.jpg (optional)
 */
function parseCardContent(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = source.trim().split("\n");

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();
      if (key && value) {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * Processes link-card code blocks and renders them as preview cards
 */
export class LinkCardProcessor {
  private app: App;
  private unfurlService: UrlUnfurlService;

  constructor(app: App, unfurlService: UrlUnfurlService) {
    this.app = app;
    this.unfurlService = unfurlService;
  }

  /**
   * Process a link-card code block
   */
  async process(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    const data = parseCardContent(source);

    if (!data.url) {
      this.renderError(el, "Missing URL in link-card");
      return;
    }

    // Create card container
    const card = el.createEl("div", { cls: "link-card" });

    // If we have all the data, render immediately
    if (data.title) {
      this.renderCard(card, {
        url: data.url,
        title: data.title,
        description: data.description || null,
        image: data.image || null,
        favicon: data.favicon || null,
        siteName: data.sitename || null,
      });
      return;
    }

    // Otherwise, fetch metadata
    card.createEl("div", { cls: "link-card-loading", text: "Loading preview..." });

    const result = await this.unfurlService.unfurl(data.url);

    card.empty();

    if (result.success && result.metadata) {
      this.renderCard(card, {
        url: data.url,
        title: data.title || result.metadata.title,
        description: data.description || result.metadata.description,
        image: data.image || result.metadata.image,
        favicon: data.favicon || result.metadata.favicon,
        siteName: data.sitename || result.metadata.siteName,
      });
    } else {
      // Fallback to basic link
      this.renderFallback(card, data.url, result.errorMessage);
    }
  }

  private renderCard(
    container: HTMLElement,
    data: {
      url: string;
      title: string | null;
      description: string | null;
      image: string | null;
      favicon: string | null;
      siteName: string | null;
    }
  ): void {
    const link = container.createEl("a", {
      cls: "link-card-link",
      attr: { href: data.url, target: "_blank", rel: "noopener noreferrer" },
    });

    // Image (if available)
    if (data.image) {
      const imageContainer = link.createEl("div", { cls: "link-card-image-container" });
      const img = imageContainer.createEl("img", {
        cls: "link-card-image",
        attr: { src: data.image, alt: data.title || "Preview" },
      });
      img.addEventListener("error", () => {
        imageContainer.remove();
      });
    }

    // Content section
    const content = link.createEl("div", { cls: "link-card-content" });

    // Title
    content.createEl("div", {
      cls: "link-card-title",
      text: data.title || data.url,
    });

    // Description
    if (data.description) {
      const desc = content.createEl("div", { cls: "link-card-description" });
      const maxLen = 150;
      desc.textContent = data.description.length > maxLen
        ? data.description.slice(0, maxLen) + "..."
        : data.description;
    }

    // Footer with favicon and domain
    const footer = content.createEl("div", { cls: "link-card-footer" });

    if (data.favicon) {
      const favicon = footer.createEl("img", {
        cls: "link-card-favicon",
        attr: { src: data.favicon, alt: "" },
      });
      favicon.addEventListener("error", () => {
        favicon.remove();
      });
    }

    try {
      const hostname = new URL(data.url).hostname;
      footer.createEl("span", { cls: "link-card-domain", text: data.siteName || hostname });
    } catch {
      // Skip domain if URL is invalid
    }
  }

  private renderFallback(container: HTMLElement, url: string, error?: string): void {
    const fallback = container.createEl("div", { cls: "link-card-fallback" });

    fallback.createEl("a", {
      cls: "link-card-fallback-link",
      text: url,
      attr: { href: url, target: "_blank", rel: "noopener noreferrer" },
    });

    if (error) {
      fallback.createEl("span", { cls: "link-card-fallback-error", text: ` (${error})` });
    }
  }

  private renderError(container: HTMLElement, message: string): void {
    container.createEl("div", { cls: "link-card-error", text: message });
  }
}
