import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { hasHeaderReportShape } from "./StructuredFileParser";

const QUEUE_FILENAME = "TODO.md";

/**
 * Appends a selection from a project's vault note as a new open #todo item
 * in that project's TODO.md — the "send selection to project" command's
 * write path. Creates TODO.md if the project doesn't have one yet.
 *
 * The tricky part: parseStructuredFile picks a shape for the *whole file*
 * up front (parseHeaderReport if any `###` heading exists anywhere, else
 * parseFlatList — see StructuredFileParser's hasHeaderReportShape), and
 * only recognizes items in that one shape. A plain `- [ ]` bullet is
 * invisible to parseHeaderReport (it never looks at bullet lines), and a
 * bare `##` heading is invisible to parseFlatList (headings there only set
 * "nearestSectionCompleted" for bullets that follow, they don't become
 * items). So the block this appends has to match whatever shape the
 * target file is already in, checked fresh against its current content
 * every time, not assumed from the filename or a fixed format.
 */
export async function appendQueuedTodo(
  localPath: string,
  title: string,
  body: string
): Promise<string> {
  const filePath = join(localPath, QUEUE_FILENAME);
  const existing = existsSync(filePath) ? await readFile(filePath, "utf-8") : "";
  const useHeaderReport = existing.length > 0 && hasHeaderReportShape(existing.split("\n"));

  const block = useHeaderReport
    ? buildHeaderReportBlock(title, body)
    : buildFlatListBlock(title, body);

  const separator = existing.length === 0 ? "" : existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  await writeFile(filePath, existing + separator + block, "utf-8");
  return filePath;
}

/**
 * flat-list shape: a `- [ ]` bullet (checkbox presence means completion is
 * read straight off it, not inferred from the nearest section heading — see
 * parseFlatList) carries the title and #todo tag; the body goes underneath,
 * indented so it reads as the bullet's own sub-content rather than being
 * parsed as separate top-level bullets or section headings of its own. The
 * indent means the body isn't part of the item's parsed `.text` — it's
 * there for a human or agent reading the file directly, not for the
 * sidebar's summary line.
 */
function buildFlatListBlock(title: string, body: string): string {
  const indented = indentLines(body.trim(), "  ");
  return `- [ ] ${title} #todo\n${indented}\n`;
}

/**
 * header-report shape: a bare `##` heading with no enclosing status section
 * is a headerStandalone item (see StructuredFileParser's ItemShape) — the
 * body runs verbatim until the next `##`/`###` heading, so an embedded
 * heading inside the pasted selection would prematurely end the block and
 * get misparsed as a new item. Acceptable for a pasted prose/spec chunk;
 * not handled here.
 */
function buildHeaderReportBlock(title: string, body: string): string {
  return `## ${title} #todo\n\n${body.trim()}\n`;
}

function indentLines(text: string, indent: string): string {
  return text
    .split("\n")
    .map((line) => (line.length === 0 ? line : indent + line))
    .join("\n");
}
