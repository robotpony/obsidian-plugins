import { TFile } from "obsidian";

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
  priorityTags: string[];
  recentTodonesLimit: number;
  excludeFoldersFromProjects: string[];
  // LLM/Define settings
  llmEnabled: boolean;
  llmUrl: string;
  llmModel: string;
  llmPrompt: string;
  llmTimeout: number;
}

export const DEFAULT_SETTINGS: SpaceCommandSettings = {
  defaultTodoneFile: "todos/done.md",
  showSidebarByDefault: true,
  dateFormat: "YYYY-MM-DD",
  excludeTodoneFilesFromRecent: true,
  defaultProjectsFolder: "projects/",
  focusListLimit: 5,
  priorityTags: ["#p0", "#p1", "#p2", "#p3", "#p4"],
  recentTodonesLimit: 5,
  excludeFoldersFromProjects: ["log"],
  // LLM/Define settings
  llmEnabled: true,
  llmUrl: "http://localhost:11434",
  llmModel: "llama3.2",
  llmPrompt: "Explain what this means in plain language, providing context if it's a technical term:",
  llmTimeout: 30000,
};
