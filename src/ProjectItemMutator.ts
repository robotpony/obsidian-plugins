import { modifyExternalFileLine, showNotice } from "./utils";
import { ParsedProjectItem } from "./StructuredFileParser";
import { moveHeaderBlock } from "./HeaderBlockMover";
import { ProjectScanner } from "./ProjectScanner";

const TAG = "[Warped Todo]";

// Matches a trailing "✅ RESOLVED" / "✅ **RESOLVED**" / "RESOLVED" marker, the
// convention real files already use (see peep/ISSUES.md) — permissive enough to
// strip variants on un-complete, canonical enough that complete always appends
// the same form.
const RESOLVED_MARKER_PATTERN = /\s*✅?\s*\*{0,2}RESOLVED\*{0,2}\s*$/i;

/** Needed only for `headerNested` items (the block-move) — the git-clean safety check needs a repo to check. */
export interface ProjectItemCompletionContext {
  repoPath: string;
  scanner: ProjectScanner;
}

/**
 * Sets a project item's completion state by editing its source line (or, for
 * `headerNested`, moving its whole block) in the external repo file directly.
 * Which edit applies — or whether one is possible at all — depends on
 * `item.shape`. See StructuredFileParser.ts's `ItemShape` doc comment for
 * the reasoning behind each case.
 *
 * `context` is required for `headerNested` (the git-clean check needs a repo
 * to check); omitting it there refuses cleanly rather than moving a block
 * with no safety net.
 */
export async function setProjectItemCompletion(
  item: ParsedProjectItem,
  completed: boolean,
  context?: ProjectItemCompletionContext
): Promise<boolean> {
  switch (item.shape) {
    case "checkbox":
      return applyCheckboxToggle(item, completed);
    case "plainBullet":
      return applyPlainBulletCompletion(item, completed);
    case "headerStandalone":
      return applyResolvedMarkerToggle(item, completed);
    case "headerNested":
      return applyHeaderBlockMove(item, completed, context);
  }
}

async function applyCheckboxToggle(item: ParsedProjectItem, completed: boolean): Promise<boolean> {
  try {
    await modifyExternalFileLine(
      item.sourceFile,
      item.lineNumber,
      (line) => line.replace(/\[[ xX]\]/, completed ? "[x]" : "[ ]"),
      undefined,
      item.fingerprint
    );
    return true;
  } catch (error) {
    console.error(TAG, "Failed to toggle checkbox:", error);
    showNotice("Failed to update item. See console for details.");
    return false;
  }
}

async function applyPlainBulletCompletion(item: ParsedProjectItem, completed: boolean): Promise<boolean> {
  if (!completed) {
    showNotice(
      "Can't un-complete this item — its completion comes from the section it's under, not its own line. Edit the file directly."
    );
    return false;
  }
  try {
    await modifyExternalFileLine(
      item.sourceFile,
      item.lineNumber,
      (line) => line.replace(/^-\s+/, "- [x] "),
      (line) => (/^-\s+\[[ xX]\]/.test(line) ? "Item already has a checkbox." : null),
      item.fingerprint
    );
    return true;
  } catch (error) {
    console.error(TAG, "Failed to complete item:", error);
    showNotice("Failed to update item. See console for details.");
    return false;
  }
}

async function applyResolvedMarkerToggle(item: ParsedProjectItem, completed: boolean): Promise<boolean> {
  try {
    await modifyExternalFileLine(
      item.sourceFile,
      item.lineNumber,
      (line) => {
        const stripped = line.replace(RESOLVED_MARKER_PATTERN, "");
        return completed ? `${stripped} ✅ RESOLVED` : stripped;
      },
      undefined,
      item.fingerprint
    );
    return true;
  } catch (error) {
    console.error(TAG, "Failed to update item status:", error);
    showNotice("Failed to update item. See console for details.");
    return false;
  }
}

async function applyHeaderBlockMove(
  item: ParsedProjectItem,
  completed: boolean,
  context?: ProjectItemCompletionContext
): Promise<boolean> {
  if (!context) {
    showNotice(
      "Can't complete this from the sidebar yet — it needs moving to a different section. Edit the file directly for now."
    );
    return false;
  }

  const result = await moveHeaderBlock(item, completed, context.repoPath, context.scanner);
  if (!result.ok) {
    showNotice(result.reason ?? "Failed to move item. See console for details.");
    return false;
  }
  return true;
}

// ========== Tag operations (context-menu parity for synced items) ==========
//
// Mirror TodoProcessor's setPriorityTag/addTag/removeTag exactly, targeting
// item.sourceFile via modifyExternalFileLine instead of the vault. Tags added
// here survive the next resync for free — they're written straight into the
// repo file, so the next parse of that file picks them up as part of the
// item's own tags. No separate rendered copy to keep in sync (see
// ProjectSyncManager's class doc comment).

/** Sets a priority tag (#p0-4/#future/#today), replacing any existing one; optionally adds #focus too. */
export async function setProjectItemPriority(
  item: ParsedProjectItem,
  newTag: string,
  addFocus: boolean = false
): Promise<boolean> {
  try {
    await modifyExternalFileLine(
      item.sourceFile,
      item.lineNumber,
      (line) => {
        line = line.replace(/#p[0-4]\b/g, "").replace(/#future\b/g, "").replace(/#today\b/g, "");
        line = line.replace(/\s+/g, " ").trim() + ` ${newTag}`;
        if (addFocus && !line.includes("#focus")) line = line + " #focus";
        return line;
      },
      undefined,
      item.fingerprint
    );
    return true;
  } catch (error) {
    console.error(TAG, "Failed to set priority:", error);
    showNotice("Failed to set priority. See console for details.");
    return false;
  }
}

/** Appends a tag if not already present (word-boundary checked, same as TodoProcessor.addTag). */
export async function addProjectItemTag(item: ParsedProjectItem, tag: string): Promise<boolean> {
  try {
    await modifyExternalFileLine(
      item.sourceFile,
      item.lineNumber,
      (line) => line.trimEnd() + ` ${tag}`,
      (line) => {
        const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const tagPattern = new RegExp(`${escapedTag}\\b`);
        return tagPattern.test(line) ? "already present" : null;
      },
      item.fingerprint
    );
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("already present")) return true; // not a failure worth surfacing
    console.error(TAG, "Failed to add tag:", error);
    showNotice("Failed to add tag. See console for details.");
    return false;
  }
}

/** Removes a tag if present; a no-op (not a failure) if it isn't there. */
export async function removeProjectItemTag(item: ParsedProjectItem, tag: string): Promise<boolean> {
  try {
    await modifyExternalFileLine(
      item.sourceFile,
      item.lineNumber,
      (line) => {
        const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const tagPattern = new RegExp(`${escapedTag}\\b\\s*`, "g");
        return line.replace(tagPattern, "").replace(/\s+/g, " ").trim();
      },
      undefined,
      item.fingerprint
    );
    return true;
  } catch (error) {
    console.error(TAG, "Failed to remove tag:", error);
    showNotice("Failed to remove tag. See console for details.");
    return false;
  }
}
