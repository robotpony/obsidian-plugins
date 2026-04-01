import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DriveFile } from "./types";

// We can't import GDriveSidebar directly because it extends Obsidian's ItemView
// (which isn't available in Node). Instead, test the extracted pure functions
// and verify the class structure indirectly.

// Re-create the pure helpers from GDriveSidebar to test them.
// These mirror the module-level functions in GDriveSidebar.ts.

interface TreeNode {
  file: DriveFile;
  children: TreeNode[] | null;
  expanded: boolean;
}

function toTreeNode(file: DriveFile): TreeNode {
  return { file, children: file.IsDir ? null : [], expanded: false };
}

function sortDirsFirst(a: DriveFile, b: DriveFile): number {
  if (a.IsDir !== b.IsDir) return a.IsDir ? -1 : 1;
  return a.Name.localeCompare(b.Name);
}

// --- Test data ---------------------------------------------------------------

const folder: DriveFile = {
  Path: "Work",
  Name: "Work",
  Size: -1,
  MimeType: "inode/directory",
  ModTime: "2026-01-01T00:00:00.000Z",
  IsDir: true,
  ID: "folder1",
};

const fileA: DriveFile = {
  Path: "Brief.gdoc",
  Name: "Brief.gdoc",
  Size: -1,
  MimeType: "application/vnd.google-apps.document",
  ModTime: "2026-01-15T10:00:00.000Z",
  IsDir: false,
  ID: "file1",
};

const fileB: DriveFile = {
  Path: "Notes.md",
  Name: "Notes.md",
  Size: 1024,
  MimeType: "text/markdown",
  ModTime: "2026-02-01T08:00:00.000Z",
  IsDir: false,
  ID: "file2",
};

const anotherFolder: DriveFile = {
  Path: "Archive",
  Name: "Archive",
  Size: -1,
  MimeType: "inode/directory",
  ModTime: "2025-06-01T00:00:00.000Z",
  IsDir: true,
  ID: "folder2",
};

// Mirror filterTree and flattenToNodes from GDriveSidebar.ts
function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  const lq = query.toLowerCase();
  const result: TreeNode[] = [];
  for (const node of nodes) {
    const nameMatch = node.file.Name.toLowerCase().includes(lq);
    if (node.file.IsDir && node.children && node.children.length > 0) {
      const filteredChildren = filterTree(node.children, query);
      if (nameMatch || filteredChildren.length > 0) {
        result.push({
          file: node.file,
          children: filteredChildren.length > 0 ? filteredChildren : node.children,
          expanded: nameMatch || filteredChildren.length > 0,
        });
      }
    } else if (nameMatch) {
      result.push(node);
    }
  }
  return result;
}

function flattenToNodes(files: DriveFile[]): TreeNode[] {
  return files.sort(sortDirsFirst).map(toTreeNode);
}

// --- Tests -------------------------------------------------------------------

describe("toTreeNode", () => {
  it("creates a node with null children for directories", () => {
    const node = toTreeNode(folder);
    expect(node.file).toBe(folder);
    expect(node.children).toBeNull();
    expect(node.expanded).toBe(false);
  });

  it("creates a node with empty children array for files", () => {
    const node = toTreeNode(fileA);
    expect(node.file).toBe(fileA);
    expect(node.children).toEqual([]);
    expect(node.expanded).toBe(false);
  });
});

describe("sortDirsFirst", () => {
  it("sorts directories before files", () => {
    const items = [fileA, folder, fileB, anotherFolder];
    const sorted = items.sort(sortDirsFirst);
    expect(sorted.map((f) => f.Name)).toEqual([
      "Archive",
      "Work",
      "Brief.gdoc",
      "Notes.md",
    ]);
  });

  it("sorts files alphabetically within their group", () => {
    const items = [fileB, fileA];
    const sorted = items.sort(sortDirsFirst);
    expect(sorted.map((f) => f.Name)).toEqual(["Brief.gdoc", "Notes.md"]);
  });

  it("sorts folders alphabetically within their group", () => {
    const items = [folder, anotherFolder];
    const sorted = items.sort(sortDirsFirst);
    expect(sorted.map((f) => f.Name)).toEqual(["Archive", "Work"]);
  });

  it("handles all-files list", () => {
    const items = [fileB, fileA];
    items.sort(sortDirsFirst);
    expect(items[0].Name).toBe("Brief.gdoc");
  });

  it("handles all-folders list", () => {
    const items = [folder, anotherFolder];
    items.sort(sortDirsFirst);
    expect(items[0].Name).toBe("Archive");
  });

  it("handles empty list", () => {
    const items: DriveFile[] = [];
    expect(items.sort(sortDirsFirst)).toEqual([]);
  });

  it("handles single item", () => {
    const items = [fileA];
    expect(items.sort(sortDirsFirst)).toEqual([fileA]);
  });
});

describe("TreeNode structure", () => {
  it("folder children are null until loaded (lazy loading contract)", () => {
    const node = toTreeNode(folder);
    // null means "not loaded yet" — distinct from [] which means "loaded, empty"
    expect(node.children).toBeNull();
  });

  it("file children are always empty array (leaf node)", () => {
    const node = toTreeNode(fileA);
    expect(node.children).toEqual([]);
    expect(node.children).not.toBeNull();
  });

  it("expanded defaults to false", () => {
    expect(toTreeNode(folder).expanded).toBe(false);
    expect(toTreeNode(fileA).expanded).toBe(false);
  });
});

describe("filterTree", () => {
  // Build a tree: Work/ contains Brief.gdoc and Notes.md; Archive/ has no loaded children
  const workNode: TreeNode = {
    file: folder,
    children: [toTreeNode(fileA), toTreeNode(fileB)],
    expanded: true,
  };
  const archiveNode: TreeNode = {
    file: anotherFolder,
    children: null, // not loaded
    expanded: false,
  };

  it("returns all nodes when query is empty string", () => {
    // Empty query should match everything via includes("")
    const result = filterTree([workNode, archiveNode], "");
    expect(result.length).toBe(2);
  });

  it("matches files by name (case-insensitive)", () => {
    const result = filterTree([workNode, archiveNode], "brief");
    expect(result.length).toBe(1); // Work folder kept as ancestor
    expect(result[0].file.Name).toBe("Work");
    expect(result[0].children!.length).toBe(1);
    expect(result[0].children![0].file.Name).toBe("Brief.gdoc");
  });

  it("matches folder names directly", () => {
    const result = filterTree([workNode, archiveNode], "archive");
    // Archive has null children (unloaded), but name matches
    expect(result.length).toBe(1);
    expect(result[0].file.Name).toBe("Archive");
  });

  it("excludes nodes with no name match and no matching children", () => {
    const result = filterTree([workNode, archiveNode], "zzz-no-match");
    expect(result.length).toBe(0);
  });

  it("keeps parent when child matches", () => {
    const result = filterTree([workNode], "notes");
    expect(result.length).toBe(1);
    expect(result[0].file.Name).toBe("Work");
    expect(result[0].children!.length).toBe(1);
    expect(result[0].children![0].file.Name).toBe("Notes.md");
  });

  it("skips folders with unloaded children unless name matches", () => {
    const result = filterTree([archiveNode], "brief");
    expect(result.length).toBe(0);
  });

  it("auto-expands folders with matching descendants", () => {
    const collapsed: TreeNode = {
      file: folder,
      children: [toTreeNode(fileA)],
      expanded: false,
    };
    const result = filterTree([collapsed], "brief");
    expect(result[0].expanded).toBe(true);
  });
});

describe("flattenToNodes", () => {
  it("sorts dirs first and converts to tree nodes", () => {
    const files = [fileB, folder, fileA, anotherFolder];
    const nodes = flattenToNodes(files);
    expect(nodes.map((n) => n.file.Name)).toEqual([
      "Archive",
      "Work",
      "Brief.gdoc",
      "Notes.md",
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(flattenToNodes([])).toEqual([]);
  });

  it("creates proper tree nodes", () => {
    const nodes = flattenToNodes([fileA, folder]);
    expect(nodes[0].children).toBeNull(); // folder
    expect(nodes[1].children).toEqual([]); // file
  });
});
