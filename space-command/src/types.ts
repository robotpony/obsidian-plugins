import { TFile } from "obsidian";
import { LLMProvider } from "../../shared";

export interface TodoItem {
  file: TFile;
  filePath: string;
  folder: string;
  lineNumber: number;
  text: string;
  hasCheckbox: boolean;
  tags: string[];
  dateCreated: number;
  // Header hierarchy fields
  isHeader?: boolean;           // True if this is a header line (##)
  headerLevel?: number;         // 1-6 for header level
  parentLineNumber?: number;    // Line number of parent header (if child)
  childLineNumbers?: number[];  // Line numbers of child items
  // Item type discriminator
  itemType?: 'todo' | 'todone' | 'idea' | 'principle';
  // Inferred file-level tag derived from filename (e.g., "api-tasks.md" → "#api-tasks")
  inferredFileTag?: string;
}

export interface TodoFilters {
  path?: string;
  tags?: string[];
  limit?: number;
  todone?: 'show' | 'hide';
}

export interface ProjectInfo {
  tag: string;
  count: number;
  lastActivity: number;
  highestPriority: number;
  /** Whether this project has any items with #focus tag */
  hasFocusItems: boolean;
  /** Colour index 0-6 based on weighted average priority of project's tasks */
  colourIndex: number;
}

// Configuration for unified list item rendering in SidebarView
export interface ItemRenderConfig {
  type: 'todo' | 'idea' | 'principle';
  classPrefix: string;
  tagToStrip: RegExp;
  showCheckbox: boolean;
  onComplete?: (item: TodoItem) => Promise<boolean>;
  onContextMenu?: (e: MouseEvent, item: TodoItem) => void;
}

export interface SpaceCommandSettings {
  defaultTodoneFile: string;
  showSidebarByDefault: boolean;
  dateFormat: string;
  excludeTodoneFilesFromRecent: boolean;
  defaultProjectsFolder: string;
  focusListLimit: number;
  activeTodosLimit: number;
  priorityTags: string[];
  recentTodonesLimit: number;
  excludeFoldersFromProjects: string[];
  // Focus mode settings
  focusModeIncludeProjects: boolean;
  // Tab lock settings
  showTabLockButton: boolean;
  // Link rendering settings
  makeLinksClickable: boolean;
  // LLM/Define settings
  llmEnabled: boolean;
  llmProvider: LLMProvider;
  // Ollama settings
  llmUrl: string;
  llmModel: string;
  // OpenAI settings
  llmOpenaiApiKey: string;
  llmOpenaiModel: string;
  // Gemini settings
  llmGeminiApiKey: string;
  llmGeminiModel: string;
  // Anthropic settings
  llmAnthropicApiKey: string;
  llmAnthropicModel: string;
  // Prompts
  llmPrompt: string;
  llmRewritePrompt: string;
  llmReviewPrompt: string;
  llmTimeout: number;
  // Triage settings
  triageSnoozedThreshold: number;
  triageActiveThreshold: number;
}

export const DEFAULT_SETTINGS: SpaceCommandSettings = {
  defaultTodoneFile: "todos/done.md",
  showSidebarByDefault: true,
  dateFormat: "YYYY-MM-DD",
  excludeTodoneFilesFromRecent: true,
  defaultProjectsFolder: "projects/",
  focusListLimit: 5,
  activeTodosLimit: 0,
  priorityTags: ["#p0", "#p1", "#p2", "#p3", "#p4"],
  recentTodonesLimit: 5,
  excludeFoldersFromProjects: ["log"],
  // Focus mode settings
  focusModeIncludeProjects: false,
  // Tab lock settings
  showTabLockButton: false,
  // Link rendering settings
  makeLinksClickable: true,
  // LLM/Define settings
  llmEnabled: true,
  llmProvider: "ollama",
  // Ollama settings
  llmUrl: "http://localhost:11434",
  llmModel: "llama3.2",
  // OpenAI settings
  llmOpenaiApiKey: "",
  llmOpenaiModel: "gpt-4o-mini",
  // Gemini settings
  llmGeminiApiKey: "",
  llmGeminiModel: "gemini-1.5-flash",
  // Anthropic settings
  llmAnthropicApiKey: "",
  llmAnthropicModel: "claude-3-haiku-20240307",
  // Prompts
  llmPrompt: "Explain what this means in plain language, providing context if it's a technical term:",
  llmRewritePrompt: "Rewrite the following text to improve clarity, accuracy, and brevity. Keep the same tone and intent. Avoid clichés and filler words. Output only the rewritten text, nothing else:",
  llmReviewPrompt: "Review the following text and provide specific suggestions for improvement. Focus on clarity, accuracy, structure, and style. Be concise and actionable:",
  llmTimeout: 30000,
  // Triage settings
  triageSnoozedThreshold: 10,
  triageActiveThreshold: 20,
};
