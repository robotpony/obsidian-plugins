import { ConvertFile, FormatMapping, ExtractSectionsResult } from "./types";
import { createTurndownService } from "./turndown";
import { driveEditUrl } from "./format";

// Re-export everything consumers need
export { getFormatMapping, stripVirtualExt, sanitizeFilename, toVaultPath, driveEditUrl } from "./format";
export { createTurndownService } from "./turndown";
export type { ConvertFile, FormatMapping, ExportFormat, ExtractSectionsResult } from "./types";

const TAG = "[G Command]";

// Singleton turndown instance — stateless, safe to reuse
const turndown = createTurndownService();

/** Format a Date as "YYYY-MM-DD HH:mm" in local time. */
function formatSyncDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Build YAML frontmatter block for a synced .md file. */
export function buildFrontmatter(file: ConvertFile, includeGdriveFields = true): string {
  const now = formatSyncDate(new Date());
  const lines = ["---"];
  if (includeGdriveFields) {
    lines.push(`gdrive_id: "${file.ID}"`);
    lines.push(`gdrive_path: "${file.Path}"`);
    const url = driveEditUrl(file);
    if (url) {
      lines.push(`google_document: "${url}"`);
    }
  }
  lines.push(`synced: "${now}"`);
  lines.push("---", "");
  return lines.join("\n");
}

/** Convert downloaded content to vault-ready content. */
export function convertContent(
  raw: string,
  mapping: FormatMapping,
  file: ConvertFile,
  includeGdriveFields = true,
): string {
  let content: string;

  if (mapping.convert === "turndown") {
    const liSample = raw.match(/<li[^>]*>.*?<\/li>/gs)?.slice(0, 3) ?? [];
    const olSample = raw.match(/<ol[^>]*>/g)?.slice(0, 3) ?? [];
    const ulSample = raw.match(/<ul[^>]*>/g)?.slice(0, 3) ?? [];
    console.log(TAG, `List diagnostics: ${liSample.length > 0 ? "found <li>" : "no <li>"}`);
    for (const s of liSample) console.log(TAG, `  <li> sample: ${s.substring(0, 200)}`);
    for (const s of olSample) console.log(TAG, `  <ol> sample: ${s}`);
    for (const s of ulSample) console.log(TAG, `  <ul> sample: ${s}`);
    content = turndown.turndown(raw);
  } else {
    content = raw;
  }

  if (mapping.addFrontmatter) {
    content = buildFrontmatter(file, includeGdriveFields) + content;
  }

  return content;
}

/** Heading pattern: matches lines starting with 1-6 # characters */
const HEADING_RE = /^(#{1,6})\s+(.+)$/;

interface ParsedSection {
  heading: { level: number; text: string } | null; // null = preamble (content before first heading)
  body: string;
}

/** Parse markdown into sections delimited by headings. */
function parseSections(markdown: string): ParsedSection[] {
  const lines = markdown.split("\n");
  const sections: ParsedSection[] = [];
  let current: ParsedSection = { heading: null, body: "" };
  let bodyLines: string[] = [];

  for (const line of lines) {
    const match = line.match(HEADING_RE);
    if (match) {
      // Flush previous section
      current.body = bodyLines.join("\n");
      sections.push(current);
      current = { heading: { level: match[1].length, text: match[2].trim() }, body: "" };
      bodyLines = [line];
    } else {
      bodyLines.push(line);
    }
  }
  // Flush final section
  current.body = bodyLines.join("\n");
  sections.push(current);

  return sections;
}

/**
 * Extract specific sections from a markdown document by heading name or numeric index.
 *
 * Selectors:
 * - string: match heading text (case-insensitive)
 * - number: match section index (0 = preamble before first heading, 1 = first heading, etc.)
 *
 * Each selected section includes content from the heading through to the next heading
 * at the same or higher level.
 */
export function extractSections(
  markdown: string,
  selectors: (string | number)[],
): ExtractSectionsResult {
  const parsed = parseSections(markdown);

  // Build available_headings index (excludes preamble)
  const available_headings = parsed
    .map((s, i) => ({ index: i, level: s.heading?.level ?? 0, text: s.heading?.text ?? "" }))
    .filter((_, i) => i === 0 || parsed[i].heading !== null);

  // For preamble (index 0), set level to 0 and text to "" if no heading
  if (available_headings.length > 0 && parsed[0].heading === null) {
    available_headings[0] = { index: 0, level: 0, text: "(preamble)" };
  }

  const matched = new Set<number>();
  const sections_returned: string[] = [];
  const not_found: string[] = [];

  for (const sel of selectors) {
    if (typeof sel === "number") {
      if (sel >= 0 && sel < parsed.length) {
        matched.add(sel);
      } else {
        not_found.push(String(sel));
      }
    } else {
      const lower = sel.toLowerCase();
      let found = false;
      for (let i = 0; i < parsed.length; i++) {
        if (parsed[i].heading && parsed[i].heading!.text.toLowerCase() === lower) {
          matched.add(i);
          found = true;
        }
      }
      if (!found) {
        not_found.push(sel);
      }
    }
  }

  // Collect matched sections in document order, including content up to next same-or-higher heading
  const contentParts: string[] = [];
  for (let i = 0; i < parsed.length; i++) {
    if (!matched.has(i)) continue;

    const section = parsed[i];
    const sectionLevel = section.heading?.level ?? 0;
    const name = section.heading?.text ?? "(preamble)";
    if (!sections_returned.includes(name)) {
      sections_returned.push(name);
    }

    // Collect this section plus any deeper sub-sections.
    // Preamble (no heading) stops at the first heading.
    const parts = [section.body];
    if (section.heading !== null) {
      for (let j = i + 1; j < parsed.length; j++) {
        const nextLevel = parsed[j].heading?.level ?? 0;
        if (nextLevel > 0 && nextLevel <= sectionLevel) break;
        parts.push(parsed[j].body);
      }
    }
    contentParts.push(parts.join("\n").trim());
  }

  return {
    content: contentParts.join("\n\n"),
    sections_returned,
    not_found,
    available_headings,
  };
}
