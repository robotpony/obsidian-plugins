import { UrlMetadataProvider, UrlMetadataResult, LinkCommandSettings } from "./types";
import { UrlMetadataCache } from "./UrlMetadataCache";
import { HtmlMetadataProvider, AuthDomainProvider } from "./UrlMetadataProvider";
import { CacheData } from "./types";

/**
 * URL validation regex
 */
const URL_REGEX = /^https?:\/\/[^\s]+$/i;

/**
 * Service that coordinates URL unfurling
 * Routes URLs to appropriate providers and manages caching
 */
export class UrlUnfurlService {
  private providers: UrlMetadataProvider[] = [];
  private cache: UrlMetadataCache;
  private settings: LinkCommandSettings;
  private authDomainProvider: AuthDomainProvider;

  constructor(
    settings: LinkCommandSettings,
    onSaveCache: (data: CacheData) => Promise<void>
  ) {
    this.settings = settings;
    this.cache = new UrlMetadataCache(
      settings.cacheTTL,
      100,  // max memory entries
      onSaveCache
    );

    // Initialize default providers
    this.authDomainProvider = new AuthDomainProvider(settings.authDomains);
    this.providers.push(this.authDomainProvider);
    this.providers.push(new HtmlMetadataProvider());

    // Sort by priority
    this.sortProviders();
  }

  /**
   * Load cached data from storage
   */
  async loadCache(data: CacheData | null): Promise<void> {
    await this.cache.loadFromStorage(data);
  }

  /**
   * Update settings
   */
  updateSettings(settings: LinkCommandSettings): void {
    this.settings = settings;
    this.cache.setTTL(settings.cacheTTL);
    this.authDomainProvider.updateDomains(settings.authDomains);
  }

  /**
   * Register a custom provider (e.g., API-based provider for specific services)
   */
  registerProvider(provider: UrlMetadataProvider): void {
    this.providers.push(provider);
    this.sortProviders();
  }

  /**
   * Unfurl a URL - get its metadata
   * @param sourcePage - Optional file path where this URL was unfurled (for tracking)
   */
  async unfurl(url: string, forceRefresh = false, sourcePage?: string): Promise<UrlMetadataResult> {
    // Validate URL
    if (!this.isValidUrl(url)) {
      return {
        success: false,
        error: 'invalid_url',
        errorMessage: 'Invalid URL format',
      };
    }

    // Check cache first (unless forcing refresh)
    if (!forceRefresh && this.settings.cacheEnabled) {
      const cached = this.cache.get(url);
      if (cached) {
        // Update source page tracking even for cached results
        if (sourcePage && this.settings.cacheEnabled) {
          await this.cache.set(url, cached, sourcePage);
        }
        return { success: true, metadata: cached };
      }
    }

    // Find a provider that can handle this URL
    const provider = this.providers.find(p => p.canHandle(url));
    if (!provider) {
      // This shouldn't happen since HtmlMetadataProvider handles everything
      return {
        success: false,
        error: 'network_error',
        errorMessage: 'No provider available for this URL',
      };
    }

    // Fetch metadata
    const result = await provider.fetch(url, this.settings.unfurlTimeout);

    // Cache successful results
    if (result.success && result.metadata && this.settings.cacheEnabled) {
      await this.cache.set(url, result.metadata, sourcePage);
    }

    return result;
  }

  /**
   * Unfurl multiple URLs in parallel
   */
  async unfurlBatch(urls: string[]): Promise<Map<string, UrlMetadataResult>> {
    const results = new Map<string, UrlMetadataResult>();
    const promises = urls.map(async (url) => {
      const result = await this.unfurl(url);
      results.set(url, result);
    });
    await Promise.all(promises);
    return results;
  }

  /**
   * Check if a string is a valid URL
   */
  isValidUrl(url: string): boolean {
    if (!URL_REGEX.test(url)) return false;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract URLs from text
   */
  extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s\]\)]+/g;
    return text.match(urlRegex) || [];
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { memorySize: number; persistentSize: number } {
    return this.cache.getStats();
  }

  /**
   * Clear cache
   */
  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  /**
   * Get recent entries from cache
   */
  getRecentEntries(limit: number): import("./types").UrlMetadata[] {
    return this.cache.getRecentEntries(limit);
  }

  /**
   * Check if URL is in cache
   */
  isCached(url: string): boolean {
    return this.cache.has(url);
  }

  /**
   * Get cached metadata for a URL (without fetching)
   */
  getCached(url: string): import("./types").UrlMetadata | null {
    return this.cache.get(url);
  }

  private sortProviders(): void {
    this.providers.sort((a, b) => a.priority - b.priority);
  }
}
