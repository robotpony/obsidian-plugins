import { TFile } from "obsidian";

/**
 * Hugo frontmatter fields we parse and display
 */
export interface HugoFrontmatter {
  title?: string;
  date?: string;
  draft?: boolean;
  tags?: string[];
  categories?: string[];
  description?: string;
  [key: string]: unknown;
}

/**
 * Represents a Hugo content item with parsed metadata
 */
export interface HugoContentItem {
  file: TFile;
  filePath: string;
  folder: string;
  frontmatter: HugoFrontmatter;
  // Computed/normalized properties
  title: string;
  date: Date | null;
  isDraft: boolean;
  tags: string[];
  categories: string[];
  description: string;
  // Folder organization
  topLevelFolder: string;
  folderTags: string[];
}

/**
 * LLM provider options
 */
export type LLMProvider = "ollama" | "openai" | "gemini" | "anthropic";

/**
 * Review criterion result
 */
export interface ReviewCriterion {
  text: string;
  passed: boolean | null;
  note?: string;
}

/**
 * Review result for a file
 */
export interface ReviewResult {
  filePath: string;
  criteria: ReviewCriterion[];
  timestamp: number;
  error?: string;
}

/**
 * Review settings
 */
export interface ReviewSettings {
  enabled: boolean;
  provider: LLMProvider;
  // Ollama settings
  ollamaEndpoint: string;
  ollamaModel: string;
  // OpenAI settings
  openaiApiKey: string;
  openaiModel: string;
  // Gemini settings
  geminiApiKey: string;
  geminiModel: string;
  // Anthropic settings
  anthropicApiKey: string;
  anthropicModel: string;
  // Review criteria (one per line)
  criteria: string;
  // Style guide reference
  styleGuideFile: string;
  styleGuideInline: string;
}

export const DEFAULT_REVIEW_SETTINGS: ReviewSettings = {
  enabled: false,
  provider: "ollama",
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.2",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  geminiApiKey: "",
  geminiModel: "gemini-1.5-flash",
  anthropicApiKey: "",
  anthropicModel: "claude-3-haiku-20240307",
  criteria: "Has a clear, descriptive title\nIncludes an introduction\nHas a conclusion or summary\nUses proper headings structure\nIncludes relevant tags",
  styleGuideFile: "",
  styleGuideInline: "",
};

/**
 * Plugin settings
 */
export interface HugoCommandSettings {
  contentPaths: string[];
  trashFolder: string;
  showSidebarByDefault: boolean;
  showDrafts: boolean;
  defaultSortOrder: "date-desc" | "date-asc" | "title";
  defaultStatusFilter: StatusFilter;
  review: ReviewSettings;
}

export const DEFAULT_SETTINGS: HugoCommandSettings = {
  contentPaths: ["content"],
  trashFolder: "_trash",
  showSidebarByDefault: true,
  showDrafts: true,
  defaultSortOrder: "date-desc",
  defaultStatusFilter: "draft",
  review: DEFAULT_REVIEW_SETTINGS,
};

export type StatusFilter = "all" | "draft" | "published";

/**
 * Hugo site configuration (hugo.toml / config.toml)
 */
export interface HugoSiteConfig {
  // Basic settings
  title?: string;
  baseURL?: string;
  languageCode?: string;

  // Author/copyright
  author?: string;
  copyright?: string;

  // Theme
  theme?: string;

  // Custom params section
  params?: Record<string, unknown>;

  // Allow other top-level fields
  [key: string]: unknown;
}
