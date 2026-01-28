import { requestUrl } from "obsidian";
import { UrlMetadata, UrlMetadataResult, UrlMetadataProvider } from "./types";

/**
 * Parse HTML content to extract metadata using Open Graph, Twitter Cards, and standard meta tags
 */
function parseHtmlMetadata(html: string, baseUrl: string): Partial<UrlMetadata> {
  const doc = new DOMParser().parseFromString(html, "text/html");

  const getMeta = (selectors: string[]): string | null => {
    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      if (el) {
        const content = el.getAttribute("content") || el.textContent;
        if (content?.trim()) return content.trim();
      }
    }
    return null;
  };

  const resolveUrl = (relative: string | null): string | null => {
    if (!relative) return null;
    try {
      return new URL(relative, baseUrl).href;
    } catch {
      return relative;
    }
  };

  const getFavicon = (): string | null => {
    // Try explicit favicon links
    const iconSelectors = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
    ];
    for (const selector of iconSelectors) {
      const el = doc.querySelector(selector);
      if (el) {
        const href = el.getAttribute("href");
        if (href) return resolveUrl(href);
      }
    }
    // Fall back to /favicon.ico
    try {
      return new URL("/favicon.ico", baseUrl).href;
    } catch {
      return null;
    }
  };

  return {
    title: getMeta([
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'title',
    ]),
    description: getMeta([
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'meta[name="description"]',
    ]),
    image: resolveUrl(getMeta([
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]',
    ])),
    favicon: getFavicon(),
    siteName: getMeta(['meta[property="og:site_name"]']),
    type: getMeta(['meta[property="og:type"]']),
    publishedDate: getMeta([
      'meta[property="article:published_time"]',
      'meta[name="date"]',
      'meta[name="pubdate"]',
    ]),
  };
}

/**
 * Default HTML metadata provider
 * Fetches URL and parses Open Graph, Twitter Cards, and standard meta tags
 */
export class HtmlMetadataProvider implements UrlMetadataProvider {
  name = "html";
  priority = 100;  // Low priority - runs after any API-based providers

  canHandle(_url: string): boolean {
    // HTML provider is the catch-all, handles any URL
    return true;
  }

  async fetch(url: string, timeout: number): Promise<UrlMetadataResult> {
    try {
      const response = await requestUrl({
        url,
        method: "GET",
        headers: {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        throw: false,
      });

      if (response.status >= 400) {
        console.warn(`[Link Command] HTTP ${response.status} for ${url}`);
        return {
          success: false,
          error: response.status === 401 || response.status === 403 ? 'auth_required' : 'network_error',
          errorMessage: `HTTP ${response.status}`,
        };
      }

      const html = response.text;
      const parsed = parseHtmlMetadata(html, url);

      // Check if we got a login page (heuristic: no real title or generic auth title)
      const loginIndicators = [
        'sign in', 'log in', 'login', 'authenticate',
        'authorization required', 'access denied',
      ];
      const titleLower = (parsed.title || '').toLowerCase();
      if (loginIndicators.some(ind => titleLower.includes(ind))) {
        return {
          success: false,
          error: 'auth_required',
          errorMessage: 'Page requires authentication',
        };
      }

      const metadata: UrlMetadata = {
        url,
        title: parsed.title || null,
        description: parsed.description || null,
        image: parsed.image || null,
        favicon: parsed.favicon || null,
        siteName: parsed.siteName || null,
        type: parsed.type || null,
        publishedDate: parsed.publishedDate || null,
        fetchedAt: Date.now(),
      };

      return {
        success: true,
        metadata,
      };
    } catch (error) {
      console.error(`[Link Command] Fetch error for ${url}:`, error);
      return {
        success: false,
        error: 'network_error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Provider that recognizes known auth-required domains and fails fast
 */
export class AuthDomainProvider implements UrlMetadataProvider {
  name = "auth-domain";
  priority = 1;  // High priority - runs first to skip auth domains quickly
  private authDomains: string[];

  constructor(authDomains: string[]) {
    this.authDomains = authDomains;
  }

  updateDomains(domains: string[]): void {
    this.authDomains = domains;
  }

  canHandle(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return this.authDomains.some(domain =>
        hostname === domain || hostname.endsWith('.' + domain)
      );
    } catch {
      return false;
    }
  }

  async fetch(url: string, _timeout: number): Promise<UrlMetadataResult> {
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      hostname = 'unknown';
    }

    return {
      success: false,
      error: 'auth_required',
      errorMessage: `${hostname} requires authentication. Add an API provider or remove from auth domains list.`,
    };
  }
}
