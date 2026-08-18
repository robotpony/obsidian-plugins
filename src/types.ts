import { TFile } from "obsidian";

export interface TeamMember {
  handle: string;
  name: string;
  isMe: boolean;
}

export interface TodoItem {
  file: TFile;
  filePath: string;
  folder: string;
  lineNumber: number;
  fingerprint: string;  // human text stripped of tags, dates, and markdown markers — used for stale line-number recovery
  text: string;
  hasCheckbox: boolean;
  tags: string[];
  dateCreated: number;
  // Header hierarchy fields
  isHeader?: boolean;           // True if this is a header line (##)
  isSubheading?: boolean;       // True if this is a bold subheading label within a header block
  headerLevel?: number;         // 1-6 for header level
  parentLineNumber?: number;    // Line number of parent header (if child)
  childLineNumbers?: number[];  // Line numbers of child items
  // Section context for orphan items (not children of a #todo header). Set to
  // the nearest preceding markdown heading or bold-subheading line. Used in
  // the sidebar to anchor every row under a heading rather than a bare arrow.
  sectionLabel?: string;
  sectionLineNumber?: number;
  // Item type discriminator
  itemType?: 'todo' | 'todone' | 'idea' | 'principle';
  // Inferred file-level tag derived from filename (e.g., "api-tasks.md" → "#api-tasks")
  inferredFileTag?: string;
  mentions: string[];
  // Absolute filesystem path outside the vault (e.g. a repo's BUGS.md). When set,
  // mutations write to this path via Node fs instead of the Obsidian vault API.
  // See OUTLINE.md and DESIGN.md's Projects Extension.
  sourceFile?: string;
}

export interface TodoFilters {
  path?: string;
  tags?: string[];
  limit?: number;
  todone?: 'show' | 'hide';
  assignee?: string;
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
  // Repo-derived fields, present only when this project's tag matches a
  // detected git repo (see ProjectManager.getProjects()'s merge with
  // ProjectScanner output). Absent for tag-only projects.
  localPath?: string;
  remote?: string;
  branch?: string;
  gitStatus?: string;
  /** README-derived display title, or the repo folder name if there's no README/heading. See ProjectMetadata.ts. */
  title?: string;
  /** Detected technologies (marker files, package.json deps). See ProjectMetadata.ts. */
  stack?: string[];
}

/**
 * Source classification for a focus queue.
 * - 'focus-tagged': queue items came from explicit #focus tags
 * - 'priority-fallback': queue items came from highest-priority TODOs (no #focus items existed)
 * - 'empty': no items available at all
 */
export type FocusQueueSource = 'focus-tagged' | 'priority-fallback' | 'empty';

/**
 * Result of building a focus queue: ordered queue items plus their source classification.
 * Source is used to differentiate `#focus`-tagged queues from priority-fallback queues for downstream logic.
 */
export interface FocusQueueResult {
  items: TodoItem[];
  source: FocusQueueSource;
}

/**
 * Runtime state of the focus card view. Survives Skip-only mutations and is rebuilt
 * on any underlying data change (todos-updated, mode toggle, continue-mode flip).
 *
 * - `items`: the current queue. Head is the active card; rest are upcoming.
 * - `source`: classification used to decide whether to show the priority-fallback hint.
 * - `inContinueMode`: true after the user presses "Continue with next priority task" at
 *   the end of the curated #focus queue. While true, the queue is built from
 *   top-priority items regardless of #focus tags, and the hint is shown.
 */
export interface FocusQueueState {
  items: TodoItem[];
  source: FocusQueueSource;
  inContinueMode: boolean;
}

/**
 * Resolved date for a focus card.
 * - 'tag': came from an explicit @YYYY-MM-DD on the TODO line
 * - 'modified': came from the source file's last modified time (mtime fallback)
 * - 'none': no date available (file missing or empty)
 */
export type ItemDateKind = 'tag' | 'modified' | 'none';

export interface ItemDate {
  kind: ItemDateKind;
  iso: string | null;
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

export interface WarpedTodoSettings {
  defaultTodoneFile: string;
  showSidebarByDefault: boolean;
  dateFormat: string;
  excludeTodoneFilesFromRecent: boolean;
  defaultProjectsFolder: string;
  focusListLimit: number;
  activeTodosLimit: number;
  priorityTags: string[];
  excludeFoldersFromProjects: string[];
  // Focus mode settings
  /** Max items shown in the immersive focus queue at once (1–5). */
  focusQueueLimit: number;
  /** When true, focus mode on/off survives session restart. */
  focusModePersist: boolean;
  /** Persisted on/off state for immersive focus mode. */
  focusModeActive: boolean;
  // Tab lock settings
  showTabLockButton: boolean;
  // Link rendering settings
  makeLinksClickable: boolean;
  // Move history (recent move-to targets)
  moveHistory: string[];
  // Team file path
  teamFilePath: string;
  // Default assignee for unattributed tasks ("" = none, "me" = @me, or a handle)
  defaultAssignee: string;
  // Projects extension: base folder scanned for git repos (ProjectScanner).
  // Data model only for now — settings tab UI lands with ProjectsSidebarView.
  projectsBaseFolder: string;
  projectsExcludeDirs: string[];
  projectsScanDepth: number;
}

export const DEFAULT_SETTINGS: WarpedTodoSettings = {
  defaultTodoneFile: "todos/done.md",
  showSidebarByDefault: true,
  dateFormat: "YYYY-MM-DD",
  excludeTodoneFilesFromRecent: true,
  defaultProjectsFolder: "projects/",
  focusListLimit: 5,
  activeTodosLimit: 0,
  priorityTags: ["#p0", "#p1", "#p2", "#p3", "#p4"],
  excludeFoldersFromProjects: ["log"],
  // Focus mode settings
  focusQueueLimit: 1,
  focusModePersist: true,
  focusModeActive: false,
  // Tab lock settings
  showTabLockButton: false,
  // Link rendering settings
  makeLinksClickable: true,
  // Move history
  moveHistory: [],
  // Team file
  teamFilePath: "team.md",
  // Default assignee
  defaultAssignee: "",
  // Projects extension
  projectsBaseFolder: "",
  projectsExcludeDirs: ["node_modules", "dist", "build", "archive"],
  projectsScanDepth: 3,
};
