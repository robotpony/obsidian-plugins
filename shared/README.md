# Shared Utilities

Shared utilities for the Obsidian plugins monorepo. These modules provide common patterns used across all three plugins.

## Modules

### Notice (`ui/Notice.ts`)

Styled notice display with plugin branding.

```ts
import { createNoticeFactory } from "../shared";

// Create a factory for your plugin
const showNotice = createNoticeFactory("␣⌘", "space-command-logo");

// Use it throughout your plugin
showNotice("Task completed");
showNotice("Error occurred", 5000); // with timeout
```

### SidebarManager (`plugin/SidebarManager.ts`)

Manages sidebar lifecycle: activate, toggle, and refresh.

```ts
import { SidebarManager } from "../shared";

// In your plugin class
private sidebarManager: SidebarManager;

async onload() {
  this.sidebarManager = new SidebarManager(this.app, VIEW_TYPE_SIDEBAR);

  // Auto-show on startup
  if (this.settings.showSidebarByDefault) {
    this.app.workspace.onLayoutReady(() => this.sidebarManager.activate());
  }

  // Command to toggle
  this.addCommand({
    id: "toggle-sidebar",
    name: "Toggle Sidebar",
    callback: () => this.sidebarManager.toggle(),
  });
}

// Refresh views after data changes
this.sidebarManager.refresh();

// Update settings on all views
this.sidebarManager.forEach<MySidebarView>((view) => {
  view.updateSettings(this.settings);
});
```

### Result Type (`types/Result.ts`)

Standard result type for operations that can succeed or fail.

```ts
import { Result, ok, err, isOk, isErr } from "../shared";

type FetchError = "network_error" | "timeout" | "parse_error";

async function fetchData(): Promise<Result<Data, FetchError>> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return err("network_error", `HTTP ${response.status}`);
    }
    return ok(await response.json());
  } catch (e) {
    return err("timeout", "Request timed out");
  }
}

// Usage
const result = await fetchData();
if (isOk(result)) {
  console.log(result.data);
} else {
  console.error(result.error, result.errorMessage);
}
```

### LLMClient (`llm/LLMClient.ts`)

Multi-provider LLM client supporting Ollama, OpenAI, Gemini, and Anthropic.

```ts
import { LLMClient, DEFAULT_LLM_PROVIDER_SETTINGS } from "../shared";

// Create client with settings
const llm = new LLMClient({
  ...DEFAULT_LLM_PROVIDER_SETTINGS,
  provider: "openai",
  openaiApiKey: "sk-...",
});

// Make a request
const response = await llm.request({
  system: "You are a helpful assistant.",
  prompt: "Explain this code: ...",
  jsonResponse: false,
});

if (response.success) {
  console.log(response.content);
} else {
  console.error(response.error);
}
```

Provider-specific settings:
- **Ollama**: `ollamaEndpoint`, `ollamaModel`
- **OpenAI**: `openaiApiKey`, `openaiModel`
- **Gemini**: `geminiApiKey`, `geminiModel`
- **Anthropic**: `anthropicApiKey`, `anthropicModel`

## Development

The shared module has its own `package.json` to provide TypeScript types for `obsidian`. When building a plugin, TypeScript resolves types from the shared module's `node_modules`.

```bash
cd shared
npm install  # Only needed once for type checking
```

Plugins import from the shared module using relative paths:

```ts
import { SidebarManager, createNoticeFactory, LLMClient } from "../shared";
```
