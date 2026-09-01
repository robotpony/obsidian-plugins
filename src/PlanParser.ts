/**
 * Parses a repo's `PLAN.md` into a lightweight progress summary for the
 * Projects detail view. PLAN.md is a reference document, not an item source:
 * nothing here feeds the TODOs/Ideas tabs, the project note, or the sync
 * pipeline. The detail view renders the full file collapsibly and, when the
 * file is a phased checklist, shows the summary this produces above it.
 *
 * Pure and string-in — no `fs`, no `ItemView` — so `planParser.test.ts` can
 * exercise it directly. The file-reading wrapper lives in ProjectMetadata
 * (`extractPlanSummary`), matching `extractProjectSummary` for README.
 *
 * PLAN.md shapes seen across ~/projects: phased checklist (`## Phase N` with
 * `- [ ]`/`- [x]` items, sometimes `### N.M` sub-steps), narrative roadmap
 * (`## Status`/`## Next` prose, no checkboxes), and a bare idea dump. Only the
 * first gets a progress summary; the other two render as the collapsible doc
 * alone.
 */

export interface PlanSummary {
  /** True when the file has any `- [ ]` / `- [x]` line. Gates the progress strip. */
  hasCheckboxes: boolean;
  /** Number of `##` sections carrying at least one checkbox (directly or under a `###` child). */
  phaseCount: number;
  /**
   * 1-based position, among the `phaseCount` sections, of the first one with
   * an unchecked box. 0 when every checkbox is checked (or there are none).
   */
  currentPhaseIndex: number;
  /** Heading text of the current phase (leading `#`s stripped); "" when there is no current phase. */
  currentPhaseHeading: string;
  /** Verbatim source lines of the current phase's unchecked items, capped at MAX_OPEN_LINES. */
  currentPhaseOpenLines: string[];
  /** Total unchecked items in the current phase, before the MAX_OPEN_LINES cap. */
  currentPhaseOpenCount: number;
  /** Checked boxes across the whole file. */
  doneCount: number;
  /** All boxes across the whole file. */
  totalCount: number;
}

const CHECKBOX_RE = /^\s*[-*+]\s+\[([ xX])\]\s+/;
const HEADING_RE = /^(#{2,3})\s+(.+?)\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;

/** Above this many open lines in the current phase, the detail view shows a "+N more" note instead of the full list. */
export const MAX_OPEN_LINES = 15;

interface Section {
  heading: string;
  level: number;
  done: number;
  total: number;
  openLines: string[];
}

export function parsePlan(content: string): PlanSummary | null {
  if (!content.trim()) return null;

  const sections: Section[] = [];
  let current: Section | null = null;
  let inFence = false;
  let doneCount = 0;
  let totalCount = 0;

  for (const raw of content.split("\n")) {
    if (FENCE_RE.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const heading = raw.match(HEADING_RE);
    if (heading) {
      const level = heading[1].length;
      // A `##` always opens a fresh phase. A `###` opens one only when we
      // aren't already inside a `##` — so a file that uses `###` as its top
      // structural level still gets per-section phases, but `### N.M`
      // sub-steps under a `## Phase N` fold into that phase.
      if (level === 2 || !current || current.level === 3) {
        current = { heading: heading[2].trim(), level, done: 0, total: 0, openLines: [] };
        sections.push(current);
      }
      continue;
    }

    const checkbox = raw.match(CHECKBOX_RE);
    if (checkbox) {
      const checked = checkbox[1] !== " ";
      totalCount++;
      if (checked) doneCount++;
      if (current) {
        current.total++;
        if (checked) current.done++;
        else current.openLines.push(raw.replace(/\s+$/, ""));
      }
    }
  }

  const phases = sections.filter((s) => s.total > 0);
  const currentIndex = phases.findIndex((s) => s.done < s.total);
  const phase = currentIndex === -1 ? null : phases[currentIndex];

  return {
    hasCheckboxes: totalCount > 0,
    phaseCount: phases.length,
    currentPhaseIndex: currentIndex === -1 ? 0 : currentIndex + 1,
    currentPhaseHeading: phase ? phase.heading : "",
    currentPhaseOpenLines: phase ? phase.openLines.slice(0, MAX_OPEN_LINES) : [],
    currentPhaseOpenCount: phase ? phase.openLines.length : 0,
    doneCount,
    totalCount,
  };
}
