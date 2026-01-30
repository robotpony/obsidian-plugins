/**
 * Converts standard Markdown to Slack's mrkdwn format.
 *
 * Slack mrkdwn differences from Markdown:
 * - Bold: *text* (not **text**)
 * - Italic: _text_ (same)
 * - Strikethrough: ~text~ (same)
 * - Code: `code` (same)
 * - Links: <url|text> or plain URL (Slack auto-links)
 * - Lists: Plain text with - or numbers (no special syntax)
 * - Blockquotes: > (same)
 * - Headings: Not supported natively (converted to bold)
 *
 * This is a custom implementation for better control over output.
 */
export function convertToSlackMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const result: string[] = [];

  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

  for (const line of lines) {
    // Handle code blocks
    if (line.trim().startsWith("```")) {
      if (!inCodeBlock) {
        // Starting a code block
        inCodeBlock = true;
        codeBlockContent = [];
        result.push("```");
      } else {
        // Ending a code block
        inCodeBlock = false;
        result.push(...codeBlockContent);
        result.push("```");
      }
      continue;
    }

    if (inCodeBlock) {
      // Preserve code block content as-is
      codeBlockContent.push(line);
      continue;
    }

    // Process normal lines
    let processed = line;

    // Convert headings to bold (# Header → *Header*)
    const headingMatch = processed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      processed = `*${headingMatch[2].trim()}*`;
    } else {
      // Convert inline formatting (not in headings, they're already bold)
      processed = convertInlineFormatting(processed);
    }

    // Blockquotes are the same in both formats
    // Lists are kept as-is (- item or 1. item work in Slack)

    result.push(processed);
  }

  return result.join("\n");
}

/**
 * Convert inline Markdown formatting to Slack mrkdwn.
 */
function convertInlineFormatting(text: string): string {
  let result = text;

  // Protect inline code from other transformations
  const codeSpans: string[] = [];
  result = result.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(code);
    return `\x00CODE${codeSpans.length - 1}\x00`;
  });

  // Convert bold+italic (***text*** or ___text___) → _*text*_
  // Use placeholders to protect from later italic conversion
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, "\x00BI_START\x00$1\x00BI_END\x00");
  result = result.replace(/___(.+?)___/g, "\x00BI_START\x00$1\x00BI_END\x00");

  // Convert bold (**text**) → *text*
  // Use placeholder to protect from italic conversion
  result = result.replace(/\*\*(.+?)\*\*/g, "\x00B_START\x00$1\x00B_END\x00");

  // Convert single-asterisk italic (*text*) → _text_
  // This only matches asterisks that weren't part of bold (already replaced)
  result = result.replace(/\*([^*\x00]+?)\*/g, "_$1_");

  // Restore bold markers
  result = result.replace(/\x00B_START\x00/g, "*");
  result = result.replace(/\x00B_END\x00/g, "*");
  result = result.replace(/\x00BI_START\x00/g, "_*");
  result = result.replace(/\x00BI_END\x00/g, "*_");

  // Convert strikethrough (~~text~~) → ~text~
  result = result.replace(/~~(.+?)~~/g, "~$1~");

  // Convert links [text](url) → text (url)
  // We output as plain text with URL in parens - Slack auto-links URLs
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");

  // Convert images ![alt](url) → alt (url)
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1 ($2)");

  // Restore inline code
  result = result.replace(/\x00CODE(\d+)\x00/g, (_, idx) => {
    return `\`${codeSpans[parseInt(idx)]}\``;
  });

  return result;
}
