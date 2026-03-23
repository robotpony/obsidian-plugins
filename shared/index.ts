/**
 * Shared utilities for Obsidian plugins in this monorepo.
 *
 * @example
 * ```ts
 * import { createNoticeFactory, SidebarManager, ok, err } from "../shared";
 * ```
 */

// UI utilities
export { showNotice, createNoticeFactory } from "./ui/Notice";

// Plugin utilities
export { SidebarManager, type RefreshableView } from "./plugin/SidebarManager";

// Type utilities
export {
  type Result,
  type CommonErrorCode,
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
} from "./types/Result";

// LLM utilities
export { LLMClient } from "./llm/LLMClient";
export {
  type LLMProvider,
  type LLMProviderSettings,
  type LLMRequestOptions,
  type LLMResponse,
  type LLMMessage,
  DEFAULT_LLM_PROVIDER_SETTINGS,
} from "./llm/types";
