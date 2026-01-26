import { UrlMetadata, CacheData } from "./types";

const CACHE_VERSION = 1;

/**
 * Two-tier cache for URL metadata
 * - In-memory cache for fast access during session
 * - Persistent cache via plugin data for offline access
 */
export class UrlMetadataCache {
  private memoryCache: Map<string, UrlMetadata> = new Map();
  private persistentData: CacheData | null = null;
  private ttlMs: number;
  private maxMemorySize: number;
  private onSave: (data: CacheData) => Promise<void>;

  constructor(
    ttlHours: number,
    maxMemorySize: number,
    onSave: (data: CacheData) => Promise<void>
  ) {
    this.ttlMs = ttlHours * 60 * 60 * 1000;
    this.maxMemorySize = maxMemorySize;
    this.onSave = onSave;
  }

  /**
   * Load persistent cache from plugin data
   */
  async loadFromStorage(data: CacheData | null): Promise<void> {
    if (!data || data.version !== CACHE_VERSION) {
      this.persistentData = { version: CACHE_VERSION, entries: {} };
      return;
    }

    this.persistentData = data;

    // Prune expired entries on load
    const now = Date.now();
    let changed = false;
    for (const [url, metadata] of Object.entries(this.persistentData.entries)) {
      if (this.isExpired(metadata, now)) {
        delete this.persistentData.entries[url];
        changed = true;
      }
    }

    if (changed) {
      await this.savePersistent();
    }
  }

  /**
   * Get metadata from cache (memory first, then persistent)
   */
  get(url: string): UrlMetadata | null {
    const now = Date.now();

    // Check memory cache first
    const memoryEntry = this.memoryCache.get(url);
    if (memoryEntry && !this.isExpired(memoryEntry, now)) {
      return memoryEntry;
    }

    // Check persistent cache
    if (this.persistentData?.entries[url]) {
      const persistentEntry = this.persistentData.entries[url];
      if (!this.isExpired(persistentEntry, now)) {
        // Promote to memory cache
        this.setMemory(url, persistentEntry);
        return persistentEntry;
      }
    }

    return null;
  }

  /**
   * Store metadata in both memory and persistent cache
   */
  async set(url: string, metadata: UrlMetadata, sourcePage?: string): Promise<void> {
    // Track source page if provided
    if (sourcePage) {
      const existing = this.get(url);
      const existingPages = existing?.sourcePages || [];
      if (!existingPages.includes(sourcePage)) {
        metadata.sourcePages = [...existingPages, sourcePage];
      } else {
        metadata.sourcePages = existingPages;
      }
    }

    this.setMemory(url, metadata);

    if (this.persistentData) {
      this.persistentData.entries[url] = metadata;
      await this.savePersistent();
    }
  }

  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    if (this.persistentData) {
      this.persistentData.entries = {};
      await this.savePersistent();
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { memorySize: number; persistentSize: number } {
    return {
      memorySize: this.memoryCache.size,
      persistentSize: this.persistentData ? Object.keys(this.persistentData.entries).length : 0,
    };
  }

  /**
   * Update TTL setting
   */
  setTTL(hours: number): void {
    this.ttlMs = hours * 60 * 60 * 1000;
  }

  /**
   * Get all cached entries sorted by fetchedAt (most recent first)
   */
  getRecentEntries(limit: number): UrlMetadata[] {
    const entries: UrlMetadata[] = [];
    const now = Date.now();

    // Get all entries from persistent cache
    if (this.persistentData) {
      for (const metadata of Object.values(this.persistentData.entries)) {
        if (!this.isExpired(metadata, now)) {
          entries.push(metadata);
        }
      }
    }

    // Sort by fetchedAt descending
    entries.sort((a, b) => b.fetchedAt - a.fetchedAt);

    return entries.slice(0, limit);
  }

  /**
   * Check if a URL is in the cache (without full get)
   */
  has(url: string): boolean {
    return this.get(url) !== null;
  }

  private setMemory(url: string, metadata: UrlMetadata): void {
    // Evict oldest entries if at capacity (simple LRU approximation)
    if (this.memoryCache.size >= this.maxMemorySize) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) {
        this.memoryCache.delete(firstKey);
      }
    }
    this.memoryCache.set(url, metadata);
  }

  private isExpired(metadata: UrlMetadata, now: number): boolean {
    return now - metadata.fetchedAt > this.ttlMs;
  }

  private async savePersistent(): Promise<void> {
    if (this.persistentData) {
      await this.onSave(this.persistentData);
    }
  }
}
