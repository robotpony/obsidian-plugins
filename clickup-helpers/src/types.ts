// Settings persisted in data.json
export interface ClickUpSettings {
  apiToken: string;
  defaultWorkspaceId: string;
  defaultListId: string;           // for new tasks created via [[cu:...]]
  releaseNotesListId: string;      // source list for release notes
  releaseNotesStatusFilter: string; // e.g., "Release Notes"
  releaseNotesFolder: string;      // vault folder for output notes
  digestListId: string;            // source list for ticket digests
  digestFolder: string;            // vault folder for review digests
  lastReviewTimestamp: number;     // unix ms; updated after each digest run
  llmEnabled: boolean;
  llmUrl: string;
  llmModel: string;
  releaseNotesPrompt: string;
  ticketReviewPrompt: string;
}

export const DEFAULT_SETTINGS: ClickUpSettings = {
  apiToken: "",
  defaultWorkspaceId: "",
  defaultListId: "",
  releaseNotesListId: "",
  releaseNotesStatusFilter: "Release Notes",
  releaseNotesFolder: "release-notes",
  digestListId: "",
  digestFolder: "ticket-digests",
  lastReviewTimestamp: 0,
  llmEnabled: false,
  llmUrl: "http://localhost:11434",
  llmModel: "llama3",
  releaseNotesPrompt:
    "You are a technical writer. Given a list of ClickUp tasks with descriptions, comments, and attachment info, produce structured release notes in this exact format:\n\n## v[version] — [date]\n\n### Features\n- ...\n\n### Bug Fixes\n- ...\n\n### Improvements\n- ...\n\nGroup tasks by type. Be concise. Use plain language.",
  ticketReviewPrompt:
    "You are a product manager assistant. Given a list of ClickUp tickets, group them by theme and produce a concise digest in this format:\n\n## Ticket Review — [date]\n### Since: [last review date]\n\n### [Theme]\n- **[Task name]** (status) — brief summary\n\nFocus on patterns and what matters most.",
};

// ClickUp API response shapes

export interface CUWorkspace {
  id: string;
  name: string;
}

export interface CUSpace {
  id: string;
  name: string;
}

export interface CUList {
  id: string;
  name: string;
}

export interface CUAttachment {
  id: string;
  title: string;
  url: string;
}

export interface CUComment {
  id: string;
  comment_text: string;
  date: string;
  user: { username: string };
}

export interface CUTask {
  id: string;
  name: string;
  description: string;
  status: { status: string };
  url: string;
  date_created: string;
  date_updated: string;
  assignees: { username: string }[];
  comments?: CUComment[];
  attachments?: CUAttachment[];
}
