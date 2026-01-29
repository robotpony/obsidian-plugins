import { ReviewResult } from "./types";

/**
 * Cache for review results.
 * Stores results in memory and persists to plugin data.
 */
export class ReviewCache {
  private cache: Map<string, ReviewResult> = new Map();
  private onSave: (data: Record<string, ReviewResult>) => void;

  constructor(onSave: (data: Record<string, ReviewResult>) => void) {
    this.onSave = onSave;
  }

  /**
   * Load cache from persisted data.
   */
  load(data: Record<string, ReviewResult> | undefined): void {
    this.cache.clear();
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        this.cache.set(key, value);
      }
    }
  }

  /**
   * Get cached review result for a file.
   */
  get(filePath: string): ReviewResult | undefined {
    return this.cache.get(filePath);
  }

  /**
   * Store review result for a file.
   */
  set(result: ReviewResult): void {
    this.cache.set(result.filePath, result);
    this.persist();
  }

  /**
   * Clear cached result for a file.
   */
  clear(filePath: string): void {
    this.cache.delete(filePath);
    this.persist();
  }

  /**
   * Clear all cached results.
   */
  clearAll(): void {
    this.cache.clear();
    this.persist();
  }

  /**
   * Get all cached results.
   */
  getAll(): ReviewResult[] {
    return Array.from(this.cache.values());
  }

  /**
   * Persist cache to plugin data.
   */
  private persist(): void {
    const data: Record<string, ReviewResult> = {};
    for (const [key, value] of this.cache.entries()) {
      data[key] = value;
    }
    this.onSave(data);
  }

  /**
   * Export cache data for saving.
   */
  export(): Record<string, ReviewResult> {
    const data: Record<string, ReviewResult> = {};
    for (const [key, value] of this.cache.entries()) {
      data[key] = value;
    }
    return data;
  }
}
