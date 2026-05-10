/**
 * Shared utilities for Obsidian plugins in this monorepo.
 *
 * @example
 * ```ts
 * import { createNoticeFactory, SidebarManager } from "../shared";
 * ```
 */

// UI utilities
export { showNotice, createNoticeFactory } from "./ui/Notice";

// Plugin utilities
export { SidebarManager, type RefreshableView } from "./plugin/SidebarManager";
