import { UrlMetadata, UrlMetadataResult, UrlMetadataProvider } from "../types";

/**
 * Google Search provider
 * Extracts search query from Google search URLs without making network requests
 */
export class GoogleSearchProvider implements UrlMetadataProvider {
  name = "google-search";
  priority = 5;  // Between AuthDomain (1) and Reddit (10)

  canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;

      // Match google.com, google.ca, google.co.uk, etc.
      const isGoogle = hostname === "google.com" ||
                       hostname === "www.google.com" ||
                       hostname.match(/^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/i) !== null;

      if (!isGoogle) return false;

      // Only handle search URLs with a query
      const isSearchPath = parsed.pathname === "/search" || parsed.pathname.startsWith("/search");
      const hasQuery = parsed.searchParams.has("q");

      return isSearchPath && hasQuery;
    } catch {
      return false;
    }
  }

  async fetch(url: string, _timeout: number): Promise<UrlMetadataResult> {
    try {
      const parsed = new URL(url);
      const query = parsed.searchParams.get("q");

      if (!query) {
        return {
          success: false,
          error: "parse_error",
          errorMessage: "No search query found in URL",
        };
      }

      // Decode the query (handles + and %20 for spaces, etc.)
      const decodedQuery = decodeURIComponent(query.replace(/\+/g, " "));

      const metadata: UrlMetadata = {
        url,
        title: decodedQuery,
        description: `Google search for "${decodedQuery}"`,
        image: null,
        favicon: "https://www.google.com/favicon.ico",
        siteName: "Google",
        type: "search",
        publishedDate: null,
        fetchedAt: Date.now(),
        searchQuery: decodedQuery,
      };

      return {
        success: true,
        metadata,
      };
    } catch (error) {
      return {
        success: false,
        error: "parse_error",
        errorMessage: error instanceof Error ? error.message : "Failed to parse Google search URL",
      };
    }
  }
}
