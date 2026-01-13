import { slackifyMarkdown } from "slackify-markdown";

/**
 * Converts standard Markdown to Slack's mrkdwn format.
 *
 * Conversions handled by slackify-markdown:
 * - **bold** → *bold*
 * - *italic* / _italic_ → _italic_
 * - # Heading → *Heading* (bold line)
 * - [text](url) → <url|text>
 * - Lists, blockquotes, code blocks
 */
export function convertToSlackMarkdown(markdown: string): string {
  let result = slackifyMarkdown(markdown);

  // Remove zero-width spaces (U+200B) that slackify-markdown inserts around
  // formatting markers - these prevent Slack from recognizing bold/italic
  result = result.replace(/\u200B/g, "");

  return result;
}
