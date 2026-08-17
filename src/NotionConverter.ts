/**
 * Converts Obsidian-flavored Markdown to Notion-compatible Markdown.
 *
 * Notion natively supports standard Markdown (bold, italic, code, links,
 * lists, headings, checkboxes, blockquotes). This converter handles
 * Obsidian-specific syntax that Notion doesn't understand:
 *
 * - Wiki links: [[page]] → page, [[page|alias]] → alias
 * - Embeds: ![[file]] → stripped
 * - Callouts: > [!type] title → > **Type:** title
 * - Plugin tags: #todo, #todone, #p0–#p4, #focus, #future, #moved → stripped
 */

/** Tags that are plugin-specific and should be stripped */
const PLUGIN_TAGS =
  /\s*#(?:todo|todone|idea|ideas|ideation|principle|p[0-4]|focus|future|moved)\b/g;

/** Obsidian callout syntax: > [!type] optional title */
const CALLOUT_RE = /^(>\s*)\[!(\w+)\]\s*(.*)/;

/** Wiki link with alias: [[target|alias]] */
const WIKI_LINK_ALIAS_RE = /\[\[([^\]|]+)\|([^\]]+)\]\]/g;

/** Wiki link without alias: [[target]] */
const WIKI_LINK_RE = /\[\[([^\]|]+)\]\]/g;

/** Embed syntax: ![[file]] or ![[file|size]] */
const EMBED_RE = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

export function convertToNotionMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const result: string[] = [];

  let inCodeBlock = false;

  for (const line of lines) {
    // Toggle code block state
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }

    // Preserve code block content as-is
    if (inCodeBlock) {
      result.push(line);
      continue;
    }

    let processed = line;

    // Convert callouts: > [!note] Title → > **Note:** Title
    const calloutMatch = processed.match(CALLOUT_RE);
    if (calloutMatch) {
      const [, prefix, type, title] = calloutMatch;
      const label = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
      processed = title
        ? `${prefix}**${label}:** ${title}`
        : `${prefix}**${label}**`;
    }

    // Strip embeds (![[file]])
    processed = processed.replace(EMBED_RE, "");

    // Convert wiki links with alias: [[page|alias]] → alias
    processed = processed.replace(WIKI_LINK_ALIAS_RE, "$2");

    // Convert wiki links without alias: [[page]] → page
    processed = processed.replace(WIKI_LINK_RE, "$1");

    // Strip plugin-specific tags
    processed = processed.replace(PLUGIN_TAGS, "");

    // Clean up trailing whitespace left by stripping
    processed = processed.replace(/\s+$/, "");

    result.push(processed);
  }

  return result.join("\n");
}
