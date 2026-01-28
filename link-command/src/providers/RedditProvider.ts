import { requestUrl } from "obsidian";
import { UrlMetadata, UrlMetadataResult, UrlMetadataProvider } from "../types";

/**
 * Reddit-specific metadata provider
 * Uses Reddit's JSON API to extract post title and subreddit
 */
export class RedditProvider implements UrlMetadataProvider {
  name = "reddit";
  priority = 10;  // Higher priority than generic HTML provider

  canHandle(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return hostname === "reddit.com" ||
             hostname === "www.reddit.com" ||
             hostname === "old.reddit.com" ||
             hostname === "new.reddit.com" ||
             hostname.endsWith(".reddit.com");
    } catch {
      return false;
    }
  }

  async fetch(url: string, timeout: number): Promise<UrlMetadataResult> {
    try {
      // Normalize URL to www.reddit.com and append .json
      const jsonUrl = this.getJsonUrl(url);

      const response = await requestUrl({
        url: jsonUrl,
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; LinkCommand/1.0)",
        },
        throw: false,
      });

      if (response.status >= 400) {
        return {
          success: false,
          error: "network_error",
          errorMessage: `HTTP ${response.status}`,
        };
      }

      const parsed = this.parseJsonResponse(response.json, url);

      const metadata: UrlMetadata = {
        url,
        title: parsed.title,
        description: parsed.description,
        image: parsed.image,
        favicon: "https://www.reddit.com/favicon.ico",
        siteName: "Reddit",
        type: parsed.type,
        publishedDate: null,
        fetchedAt: Date.now(),
        subreddit: parsed.subreddit || undefined,
      };

      return {
        success: true,
        metadata,
      };
    } catch (error) {
      console.error(`[Link Command] Reddit fetch error for ${url}:`, error);
      return {
        success: false,
        error: "network_error",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Convert a Reddit URL to its JSON API equivalent
   */
  private getJsonUrl(url: string): string {
    const parsed = new URL(url);
    // Normalize to www.reddit.com
    parsed.hostname = "www.reddit.com";
    // Remove trailing slash and add .json
    let path = parsed.pathname.replace(/\/$/, "");
    // Don't double-add .json
    if (!path.endsWith(".json")) {
      path += ".json";
    }
    parsed.pathname = path;
    return parsed.toString();
  }

  /**
   * Extract subreddit from URL path
   */
  private extractSubredditFromUrl(url: string): string | null {
    try {
      const path = new URL(url).pathname;
      const match = path.match(/^\/r\/([^\/]+)/i);
      if (match) {
        return `r/${match[1]}`;
      }
    } catch {
      // Invalid URL
    }
    return null;
  }

  /**
   * Parse Reddit JSON API response
   */
  private parseJsonResponse(
    json: unknown,
    originalUrl: string
  ): {
    title: string | null;
    description: string | null;
    image: string | null;
    type: string | null;
    subreddit: string | null;
  } {
    // Default values
    let title: string | null = null;
    let description: string | null = null;
    let image: string | null = null;
    let subreddit = this.extractSubredditFromUrl(originalUrl);
    const isPost = originalUrl.includes("/comments/");
    const type = isPost ? "reddit:post" : "reddit:subreddit";

    try {
      // Reddit JSON response is an array for posts, object for subreddits
      // Posts: [{ kind: "Listing", data: { children: [{ data: postData }] } }, ...]
      // Subreddits: { kind: "Listing", data: { children: [...] } }

      let postData: Record<string, unknown> | null = null;

      if (Array.isArray(json) && json.length > 0) {
        // Post URL - first element contains the post data
        const listing = json[0] as { data?: { children?: Array<{ data?: Record<string, unknown> }> } };
        if (listing?.data?.children?.[0]?.data) {
          postData = listing.data.children[0].data;
        }
      } else if (json && typeof json === "object" && "data" in json) {
        // Subreddit listing - get first post for subreddit info
        const listing = json as { data?: { children?: Array<{ data?: Record<string, unknown> }> } };
        if (listing?.data?.children?.[0]?.data) {
          postData = listing.data.children[0].data;
        }
      }

      if (postData) {
        // Extract title
        if (typeof postData.title === "string") {
          title = postData.title;
        }

        // Extract subreddit
        if (typeof postData.subreddit === "string") {
          subreddit = `r/${postData.subreddit}`;
        } else if (typeof postData.subreddit_name_prefixed === "string") {
          subreddit = postData.subreddit_name_prefixed;
        }

        // Extract description (selftext for text posts)
        if (typeof postData.selftext === "string" && postData.selftext.trim()) {
          // Truncate to reasonable length
          description = postData.selftext.slice(0, 300);
          if (postData.selftext.length > 300) {
            description += "...";
          }
        }

        // Extract thumbnail/image
        if (typeof postData.thumbnail === "string" &&
            postData.thumbnail.startsWith("http") &&
            !postData.thumbnail.includes("thumbs.redditmedia.com")) {
          image = postData.thumbnail;
        }
        // Check for preview images (higher quality)
        if (postData.preview && typeof postData.preview === "object") {
          const preview = postData.preview as { images?: Array<{ source?: { url?: string } }> };
          if (preview.images?.[0]?.source?.url) {
            // Reddit escapes HTML entities in URLs
            image = preview.images[0].source.url.replace(/&amp;/g, "&");
          }
        }
      }
    } catch (e) {
      console.error("[Link Command] Failed to parse Reddit JSON:", e);
    }

    return {
      title,
      description,
      image,
      type,
      subreddit,
    };
  }
}
