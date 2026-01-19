import { slackifyMarkdown } from "slackify-markdown";

/**
 * Converts standard Markdown to Slack's mrkdwn format.
 *
 * Conversions:
 * - **bold** → *bold*
 * - *italic* / _italic_ → _italic_
 * - # Heading → *Heading* (bold line)
 * - [text](url) → text (url) - plain text, Slack auto-links URLs
 * - Lists, blockquotes, code blocks preserved
 */
export function convertToSlackMarkdown(markdown: string): string {
  let result = slackifyMarkdown(markdown);

  // Remove zero-width spaces (U+200B) that slackify-markdown inserts around
  // formatting markers - these prevent Slack from recognizing bold/italic
  result = result.replace(/\u200B/g, "");

  // Remove Slack link formatting - leave URLs as plain text (Slack auto-links them)
  // Convert <url|text> → text (url)
  result = result.replace(/<([^|>]+)\|([^>]+)>/g, "$2 ($1)");
  // Convert <url> → url (bare URLs wrapped in angle brackets)
  result = result.replace(/<(https?:\/\/[^>]+)>/g, "$1");

  return result;
}
