import { moment } from "obsidian";

/** Logo prefix for Notice messages */
export const LOGO_PREFIX = "⌥⌘";

export function formatDate(date: Date, format: string): string {
  return (moment as any)(date).format(format);
}

/**
 * Get the priority value for sorting TODOs.
 * Lower values = higher priority.
 * Priority order: #focus=0, #p0=1, #p1=2, #p2=3, no priority=4, #p3=5, #p4=6, #future=7
 */
export function getPriorityValue(tags: string[]): number {
  if (tags.includes("#focus")) return 0;
  if (tags.includes("#p0")) return 1;
  if (tags.includes("#p1")) return 2;
  if (tags.includes("#p2")) return 3;
  if (tags.includes("#p3")) return 5;
  if (tags.includes("#p4")) return 6;
  if (tags.includes("#future")) return 7;
  return 4; // No priority = medium (between #p2 and #p3)
}

export function extractTags(text: string): string[] {
  // Remove inline code spans before extracting tags
  // This prevents matching tags inside backticks like `#689fd6`
  const textWithoutCode = text.replace(/`[^`]*`/g, "");
  const tagRegex = /#[\w-]+/g;
  return textWithoutCode.match(tagRegex) || [];
}

export function hasCheckboxFormat(text: string): boolean {
  return /^-\s*\[[ x]\]/i.test(text.trim());
}

export function isCheckboxChecked(text: string): boolean {
  return /^-\s*\[x\]/i.test(text.trim());
}

export function markCheckboxComplete(text: string): string {
  return text.replace(/^(-\s*\[)[ ](\])/, "$1x$2");
}

export function replaceTodoWithTodone(text: string, date: string): string {
  return text.replace(/#todo\b/, `#todone @${date}`);
}

export function replaceTodoneWithTodo(text: string): string {
  // Replace #todone @YYYY-MM-DD with #todo
  let result = text.replace(/#todone\s+@\d{4}-\d{2}-\d{2}/, "#todo");
  // Also handle #todone without date
  result = result.replace(/#todone\b/, "#todo");
  return result;
}

export function markCheckboxIncomplete(text: string): string {
  return text.replace(/^(-\s*\[)x(\])/i, "$1 $2");
}

export function removeIdeaTag(text: string): string {
  // Remove #idea tag and any trailing whitespace it leaves
  return text.replace(/#idea\b\s*/, "").trim();
}

export function replaceIdeaWithTodo(text: string): string {
  return text.replace(/#idea\b/, "#todo");
}
