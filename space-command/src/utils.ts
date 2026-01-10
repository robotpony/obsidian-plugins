import { moment } from "obsidian";

export function formatDate(date: Date, format: string): string {
  return (moment as any)(date).format(format);
}

export function extractTags(text: string): string[] {
  const tagRegex = /#[\w-]+/g;
  return text.match(tagRegex) || [];
}

export function removeTodoTag(text: string): string {
  return text.replace(/#todo\b/g, "").trim();
}

export function hasCheckboxFormat(text: string): boolean {
  return /^-\s*\[[ x]\]/.test(text.trim());
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
