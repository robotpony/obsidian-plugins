/**
 * Metadata extracted from a URL
 */
export interface UrlMetadata {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  favicon: string | null;
  siteName: string | null;
  type: string | null;  // "article", "website", etc.
  publishedDate: string | null;
  fetchedAt: number;  // timestamp for cache expiry
  sourcePages?: string[];  // file paths where this URL was unfurled
  // Site-specific fields
  subreddit?: string;  // Reddit: r/subreddit
  searchQuery?: string;  // Google Search: the search query
}

/**
 * Result of a metadata fetch operation
 */
export interface UrlMetadataResult {
  success: boolean;
  metadata?: UrlMetadata;
  error?: 'network_error' | 'parse_error' | 'timeout' | 'invalid_url' | 'auth_required';
  errorMessage?: string;
}

/**
 * Provider interface for extensible URL handling
 * Different providers can handle different URL types (HTML scraping, API-based, etc.)
 */
export interface UrlMetadataProvider {
  /** Provider name for logging/debugging */
  name: string;
  /** Priority order - lower numbers run first (e.g., API providers before generic HTML) */
  priority: number;
  /** Check if this provider can handle the given URL */
  canHandle(url: string): boolean;
  /** Fetch metadata for the URL */
  fetch(url: string, timeout: number): Promise<UrlMetadataResult>;
}

/**
 * Plugin settings
 */
export interface LinkCommandSettings {
  unfurlEnabled: boolean;
  unfurlTimeout: number;  // ms
  autoExpandUrls: boolean;  // Auto-convert new URLs to markdown links
  cacheEnabled: boolean;
  cacheTTL: number;  // hours
  // Known domains that require authentication (skip unfurling)
  authDomains: string[];
  // Sidebar settings
  showSidebarByDefault: boolean;
  recentHistoryLimit: number;
  // Reddit-specific settings
  redditLinkFormat: 'title' | 'title_subreddit';
}

export const DEFAULT_SETTINGS: LinkCommandSettings = {
  unfurlEnabled: true,
  unfurlTimeout: 10000,
  autoExpandUrls: true,  // Auto-convert new URLs to markdown links
  cacheEnabled: true,
  cacheTTL: 168,  // 7 days
  authDomains: [
    'slack.com',
    'app.slack.com',
    'notion.so',
    'docs.google.com',
    'drive.google.com',
    'sheets.google.com',
    'mail.google.com',
    'calendar.google.com',
    'linear.app',
    'figma.com',
    'www.figma.com',
    'miro.com',
    'trello.com',
    'asana.com',
    'jira.atlassian.com',
    'confluence.atlassian.com',
  ],
  showSidebarByDefault: true,
  recentHistoryLimit: 10,
  redditLinkFormat: 'title_subreddit',
};

/**
 * Persistent cache data structure
 */
export interface CacheData {
  version: number;
  entries: Record<string, UrlMetadata>;
}
