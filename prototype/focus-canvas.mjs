#!/usr/bin/env node
// Focus Canvas prototype
// ------------------------------------------------------------------------
// Generates a JSON Canvas (.canvas) file that lays out a "Focus Mode" as a
// spatial 3x3 grid: the focused project's curated item list sits in the
// centre, and up to 8 other projects (ranked by priority) surround it —
// 3 across the top, 1 on each side, 3 across the bottom — filled in reading
// order (top row left-to-right, then the two side slots, then bottom row
// left-to-right) by descending priority.
//
// This is a standalone Node script, not part of the plugin build. It
// deliberately re-implements small pieces of the real ranking/curation
// logic (see src/utils.ts's getPriorityValue/buildFocusQueue and
// src/ProjectManager.ts's getProjects/getFocusProjects) so it can run
// outside Obsidian against a real vault on disk. It does NOT replicate the
// full header/child hierarchy TodoScanner tracks — items are scanned flat,
// one per tagged line. Good enough to tune the spatial layout and content
// density before wiring this into the actual plugin (a command that uses
// the live ProjectManager/TodoScanner instances and opens the result via
// the Obsidian API).
//
// Usage:
//   node prototype/focus-canvas.mjs --vault=/path/to/vault [options]
//
// Options:
//   --vault=<path>          Required. Path to the vault root.
//   --tag=<#project-tag>    Focus project. Defaults to the top-ranked project.
//   --out=<path>            Output .canvas path. Default: prototype/focus-mode.canvas
//   --projects-folder=<p>   Default: projects/ (matches DEFAULT_SETTINGS.defaultProjectsFolder)
//   --center-limit=<n>      Max items in the centre node. Default: 8
//   --satellite-limit=<n>   Max items per satellite node. Default: 3
//   --list                  Print ranked projects and exit (no file written).

import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join, relative, dirname, basename, extname } from "path";
import { homedir } from "os";

// ---------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------

// zsh only expands a leading `~` when it starts the whole word, so
// `--vault=~/foo` reaches us as a literal tilde (it's not at word-start).
// Expand it ourselves so the flag works the way people expect.
function expandTilde(path) {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function parseArgs(argv) {
  const args = { centerLimit: 8, satelliteLimit: 3, projectsFolder: "projects/", out: "prototype/focus-mode.canvas" };
  for (const raw of argv) {
    if (raw === "--list") { args.list = true; continue; }
    const match = raw.match(/^--([\w-]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    switch (key) {
      case "vault": args.vault = expandTilde(value); break;
      case "tag": args.tag = value.startsWith("#") ? value : `#${value}`; break;
      case "out": args.out = expandTilde(value); break;
      case "projects-folder": args.projectsFolder = value.endsWith("/") ? value : `${value}/`; break;
      case "center-limit": args.centerLimit = parseInt(value, 10); break;
      case "satellite-limit": args.satelliteLimit = parseInt(value, 10); break;
    }
  }
  return args;
}

// ---------------------------------------------------------------------
// Ported constants (mirrors src/utils.ts)
// ---------------------------------------------------------------------

const PLUGIN_TAGS = new Set([
  "#todo", "#todos", "#todone", "#todones",
  "#idea", "#ideas", "#ideation",
  "#principle", "#principles",
]);

const PRIORITY_TAGS = ["#p0", "#p1", "#p2", "#p3", "#p4"];
const EXCLUDE_FOLDERS = ["log"];
const EXCLUDE_DIRS = new Set([".obsidian", ".git", "node_modules"]);

function hasTag(tags, tag) {
  const lower = tag.toLowerCase();
  return tags.some((t) => t.toLowerCase() === lower);
}

function getPriorityValue(tags) {
  if (hasTag(tags, "#today")) return 1;
  if (hasTag(tags, "#p0")) return 2;
  if (hasTag(tags, "#p1")) return 3;
  if (hasTag(tags, "#p2")) return 4;
  if (hasTag(tags, "#p3")) return 5;
  if (hasTag(tags, "#p4")) return 6;
  if (hasTag(tags, "#future") || hasTag(tags, "#snooze") || hasTag(tags, "#snoozed")) return 8;
  return 7;
}

function isSnoozed(tags) {
  return hasTag(tags, "#future") || hasTag(tags, "#snooze") || hasTag(tags, "#snoozed");
}

function extractTags(text) {
  const withoutCode = text.replace(/`[^`]*`/g, "");
  return withoutCode.match(/#[\w-]+/g) || [];
}

function filenameToTag(name) {
  return "#" + name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------
// Vault scan (flat — no header/child hierarchy)
// ---------------------------------------------------------------------

function walkMarkdownFiles(root, dir = root, out = []) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const abs = join(dir, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      walkMarkdownFiles(root, abs, out);
    } else if (extname(entry) === ".md") {
      out.push(abs);
    }
  }
  return out;
}

function itemTypeFor(tags) {
  if (tags.some((t) => /^#todones?$/i.test(t))) return "todone";
  if (tags.some((t) => /^#todos?$/i.test(t))) return "todo";
  if (tags.some((t) => /^#ideas?$/i.test(t) || /^#ideation$/i.test(t))) return "idea";
  if (tags.some((t) => /^#principles?$/i.test(t))) return "principle";
  return undefined;
}

function scanVault(vaultRoot, projectsFolder) {
  const items = [];
  for (const abs of walkMarkdownFiles(vaultRoot)) {
    const relPath = relative(vaultRoot, abs);
    const folder = dirname(relPath) === "." ? "" : dirname(relPath).replace(/\\/g, "/") + "/";
    const fileBasename = basename(relPath, ".md");
    const inferredFileTag = filenameToTag(fileBasename);
    const content = readFileSync(abs, "utf-8");
    const lines = content.split("\n");

    let inCodeBlock = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("```")) { inCodeBlock = !inCodeBlock; continue; }
      if (inCodeBlock) continue;

      const tags = extractTags(line);
      if (tags.length === 0) continue;
      if (!tags.some((t) => PLUGIN_TAGS.has(t.toLowerCase()))) continue;

      const itemType = itemTypeFor(tags);
      if (!itemType || itemType === "todone") continue; // prototype: active items only

      // Strip the line's own list marker/checkbox — itemsToMarkdown() adds
      // its own "- " when rendering, so keeping this would double it up.
      const text = trimmed.replace(/^[-*+]\s*(\[[ xX]?\]\s*)?/, "");

      items.push({
        filePath: relPath,
        folder,
        text,
        tags,
        itemType,
        inferredFileTag,
      });
    }
  }
  return items;
}

// ---------------------------------------------------------------------
// Project aggregation + ranking (mirrors ProjectManager.getProjects/getFocusProjects)
// ---------------------------------------------------------------------

function aggregateProjects(items, projectsFolder) {
  const excluded = new Set([
    "#todo", "#todos", "#todone", "#todones",
    "#idea", "#ideas", "#ideation", "#principle", "#principles",
    "#future", "#snooze", "#snoozed", "#focus", "#today",
    ...PRIORITY_TAGS,
  ]);

  const projects = new Map(); // tag -> { tag, count, prioritySum, highestPriority, hasFocusItems, items: [] }

  for (const item of items) {
    const explicitTags = item.tags.filter((t) => !excluded.has(t.toLowerCase()));
    let projectTags = explicitTags;

    if (projectTags.length === 0 && item.inferredFileTag) {
      const inProjectsFolder = item.folder.startsWith(projectsFolder);
      const inExcludedFolder = EXCLUDE_FOLDERS.some((f) => item.folder === `${f}/` || item.folder.startsWith(`${f}/`));
      if (inProjectsFolder && !inExcludedFolder) projectTags = [item.inferredFileTag];
    }

    const priority = getPriorityValue(item.tags);
    const focused = hasTag(item.tags, "#focus");

    for (const tag of projectTags) {
      if (!projects.has(tag)) {
        projects.set(tag, { tag, count: 0, prioritySum: 0, highestPriority: 8, hasFocusItems: false, items: [] });
      }
      const p = projects.get(tag);
      p.count++;
      p.prioritySum += priority;
      p.highestPriority = Math.min(p.highestPriority, priority);
      if (focused) p.hasFocusItems = true;
      p.items.push(item);
    }
  }

  return projects;
}

function rankProjects(projectMap) {
  return [...projectMap.values()].sort((a, b) => {
    if (a.hasFocusItems && !b.hasFocusItems) return -1;
    if (!a.hasFocusItems && b.hasFocusItems) return 1;
    const priorityDiff = a.highestPriority - b.highestPriority;
    if (priorityDiff !== 0) return priorityDiff;
    return b.count - a.count;
  });
}

// ---------------------------------------------------------------------
// Curated list per project (mirrors buildFocusQueue in src/utils.ts)
// ---------------------------------------------------------------------

// Returns both the shown slice and the total eligible count, so callers can
// signal "+N more" instead of letting a long list overflow a fixed-height box.
function buildCuratedList(project, limit) {
  const candidates = project.items.filter((i) => !isSnoozed(i.tags));
  if (candidates.length === 0) return { items: [], total: 0 };

  const focused = candidates.filter((i) => hasTag(i.tags, "#focus"));
  const pool = focused.length > 0 ? focused : candidates;

  const sorted = [...pool].sort((a, b) => getPriorityValue(a.tags) - getPriorityValue(b.tags));
  return { items: sorted.slice(0, limit), total: sorted.length };
}

// ---------------------------------------------------------------------
// Layout: uniform 3x3 grid, every cell (centre and all 8 satellites) the
// same size, spaced evenly in every direction. Filled in reading order (top
// row L→R, sides L→R, bottom row L→R).
// ---------------------------------------------------------------------

const CELL_W = 620, CELL_H = 460;
const GAP = 80;

// Column/row centres for an evenly-spaced 3-cell grid: cell i's centre is
// i cells and i gaps in from the edge, plus half a cell.
const COL_X = [0, 1, 2].map((i) => i * (CELL_W + GAP) + CELL_W / 2);
const ROW_Y = [0, 1, 2].map((i) => i * (CELL_H + GAP) + CELL_H / 2);

// [row, col] for each satellite slot, in fill order.
const SLOT_ORDER = [
  [0, 0], [0, 1], [0, 2], // top: left, centre, right
  [1, 0],         [1, 2], // sides: left, right
  [2, 0], [2, 1], [2, 2], // bottom: left, centre, right
];

// `color` is optional — omit it (satellites) to fall back to Obsidian's
// default node styling, so only the centre carries the highlight colour and
// every satellite reads as visually equal.
function gridNode(id, row, col, text, color) {
  const node = {
    id,
    type: "text",
    x: Math.round(COL_X[col] - CELL_W / 2),
    y: Math.round(ROW_Y[row] - CELL_H / 2),
    width: CELL_W,
    height: CELL_H,
    text,
  };
  if (color) node.color = color;
  return node;
}

function truncate(text, max = 100) {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

// `curated` is a { items, total } pair from buildCuratedList. When total
// exceeds what's shown, appends a "+N more" line rather than letting the
// fixed-height box overflow — see the screenshot review that motivated this.
function itemsToMarkdown(curated, maxChars, emptyMessage) {
  if (curated.items.length === 0) return `_${emptyMessage}_`;
  const lines = curated.items.map((i) => `- ${truncate(i.text, maxChars)}`);
  const remaining = curated.total - curated.items.length;
  if (remaining > 0) lines.push(`_+${remaining} more_`);
  return lines.join("\n");
}

// A raw "#tag" in the heading gets rendered as its own tag pill by Obsidian,
// duplicating the pill each item already shows for that same tag below it.
// De-hash and title-case instead so the heading reads as a label, not a tag.
function humanizeTag(tag) {
  return tag
    .replace(/^#/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function buildCanvas(focus, satellites, centerLimit, satelliteLimit) {
  const nodes = [];

  const centerCurated = buildCuratedList(focus, centerLimit);
  nodes.push(
    gridNode(
      "focus",
      1, 1,
      `# 🎯 ${humanizeTag(focus.tag)}\n\n${itemsToMarkdown(centerCurated, 90, "Nothing active")}`,
      "1"
    )
  );

  satellites.slice(0, 8).forEach((project, i) => {
    const [row, col] = SLOT_ORDER[i];
    const id = `sat-${project.tag.replace(/^#/, "")}`;
    const curated = buildCuratedList(project, satelliteLimit);
    nodes.push(
      gridNode(
        id,
        row, col,
        `## ${humanizeTag(project.tag)}\n\n${itemsToMarkdown(curated, 65, "No active items")}`
      )
    );
  });

  return { nodes };
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.vault) {
    console.error("Usage: node prototype/focus-canvas.mjs --vault=/path/to/vault [--tag=#project] [--out=path] [--list]");
    process.exit(1);
  }

  const items = scanVault(args.vault, args.projectsFolder);
  const projectMap = aggregateProjects(items, args.projectsFolder);
  const ranked = rankProjects(projectMap);

  if (ranked.length === 0) {
    console.error("No projects found — check --vault and --projects-folder.");
    process.exit(1);
  }

  if (args.list) {
    ranked.forEach((p, i) => {
      console.log(`${i + 1}. ${p.tag}  (count=${p.count}, highestPriority=${p.highestPriority}, focus=${p.hasFocusItems})`);
    });
    return;
  }

  const focus = args.tag
    ? ranked.find((p) => p.tag.toLowerCase() === args.tag.toLowerCase())
    : ranked[0];

  if (!focus) {
    console.error(`Tag ${args.tag} not found. Known projects:\n` + ranked.map((p) => `  ${p.tag}`).join("\n"));
    process.exit(1);
  }

  const satellites = ranked.filter((p) => p.tag !== focus.tag);
  const canvas = buildCanvas(focus, satellites, args.centerLimit, args.satelliteLimit);

  writeFileSync(args.out, JSON.stringify(canvas, null, 2));
  console.log(`Wrote ${args.out}`);
  console.log(`Focus: ${focus.tag} (${canvas.nodes[0].text.split("\n").length - 2} items shown)`);
  console.log(`Satellites (${satellites.length > 8 ? "8 of " + satellites.length : satellites.length}):`);
  satellites.slice(0, 8).forEach((p, i) => console.log(`  ${i + 1}. ${p.tag}`));
}

main();
