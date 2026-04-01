import { describe, it, expect, vi } from "vitest";
import type { DriveFile } from "./types";

// Mock obsidian module (not available in Node test environment)
vi.mock("obsidian", () => ({
  App: class {},
  TFile: class {},
}));
import {
  getFormatMapping,
  stripVirtualExt,
  sanitizeFilename,
  toVaultPath,
  buildFrontmatter,
  convertContent,
} from "./SyncManager";

// --- Test data ---------------------------------------------------------------

const googleDoc: DriveFile = {
  Path: "Work/Brief.gdoc",
  Name: "Brief.gdoc",
  Size: -1,
  MimeType: "application/vnd.google-apps.document",
  ModTime: "2026-01-15T10:00:00.000Z",
  IsDir: false,
  ID: "doc1",
};

const googleSheet: DriveFile = {
  Path: "Work/Budget.gsheet",
  Name: "Budget.gsheet",
  Size: -1,
  MimeType: "application/vnd.google-apps.spreadsheet",
  ModTime: "2026-02-01T08:00:00.000Z",
  IsDir: false,
  ID: "sheet1",
};

const googleSlides: DriveFile = {
  Path: "Deck.gslides",
  Name: "Deck.gslides",
  Size: -1,
  MimeType: "application/vnd.google-apps.presentation",
  ModTime: "2026-03-01T12:00:00.000Z",
  IsDir: false,
  ID: "slides1",
};

const plainText: DriveFile = {
  Path: "notes.txt",
  Name: "notes.txt",
  Size: 512,
  MimeType: "text/plain",
  ModTime: "2026-01-20T09:00:00.000Z",
  IsDir: false,
  ID: "txt1",
};

const pdfFile: DriveFile = {
  Path: "Archive/report.pdf",
  Name: "report.pdf",
  Size: 10240,
  MimeType: "application/pdf",
  ModTime: "2026-01-25T14:00:00.000Z",
  IsDir: false,
  ID: "pdf1",
};

// --- Tests -------------------------------------------------------------------

describe("getFormatMapping", () => {
  it("maps Google Docs to HTML export → .md with turndown", () => {
    const m = getFormatMapping(googleDoc);
    expect(m.exportFormat).toBe("html");
    expect(m.extension).toBe(".md");
    expect(m.convert).toBe("turndown");
    expect(m.addFrontmatter).toBe(true);
  });

  it("maps Google Sheets to CSV export → .csv passthrough", () => {
    const m = getFormatMapping(googleSheet);
    expect(m.exportFormat).toBe("csv");
    expect(m.extension).toBe(".csv");
    expect(m.convert).toBe("passthrough");
    expect(m.addFrontmatter).toBe(false);
  });

  it("maps Google Slides to txt export → .md passthrough", () => {
    const m = getFormatMapping(googleSlides);
    expect(m.exportFormat).toBe("txt");
    expect(m.extension).toBe(".md");
    expect(m.convert).toBe("passthrough");
    expect(m.addFrontmatter).toBe(true);
  });

  it("keeps original extension for native files", () => {
    const m = getFormatMapping(plainText);
    expect(m.exportFormat).toBeUndefined();
    expect(m.extension).toBe(".txt");
    expect(m.convert).toBe("passthrough");
    expect(m.addFrontmatter).toBe(false);
  });

  it("keeps .pdf extension for PDFs", () => {
    const m = getFormatMapping(pdfFile);
    expect(m.extension).toBe(".pdf");
    expect(m.exportFormat).toBeUndefined();
  });

  it("maps Office MIME .docx with Size -1 as Google Doc", () => {
    const officeDoc: DriveFile = {
      Path: "About the Alderson Family book of recipes.docx",
      Name: "About the Alderson Family book of recipes.docx",
      Size: -1,
      MimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ModTime: "2025-07-09T18:36:42.687Z",
      IsDir: false,
      ID: "doc-office1",
    };
    const m = getFormatMapping(officeDoc);
    expect(m.exportFormat).toBe("html");
    expect(m.extension).toBe(".md");
    expect(m.convert).toBe("turndown");
    expect(m.addFrontmatter).toBe(true);
  });

  it("maps Office MIME .xlsx with Size -1 as Google Sheet", () => {
    const officeSheet: DriveFile = {
      Path: "Budget.xlsx",
      Name: "Budget.xlsx",
      Size: -1,
      MimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ModTime: "2026-01-01T00:00:00.000Z",
      IsDir: false,
      ID: "sheet-office1",
    };
    const m = getFormatMapping(officeSheet);
    expect(m.exportFormat).toBe("csv");
    expect(m.extension).toBe(".csv");
  });

  it("treats real .docx (Size > 0) as native file", () => {
    const realDocx: DriveFile = {
      Path: "uploaded.docx",
      Name: "uploaded.docx",
      Size: 8192,
      MimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ModTime: "2026-01-01T00:00:00.000Z",
      IsDir: false,
      ID: "real-docx1",
    };
    const m = getFormatMapping(realDocx);
    expect(m.exportFormat).toBeUndefined();
    expect(m.extension).toBe(".docx");
  });
});

describe("stripVirtualExt", () => {
  it("strips .gdoc", () => {
    expect(stripVirtualExt("Brief.gdoc")).toBe("Brief");
  });

  it("strips .gsheet", () => {
    expect(stripVirtualExt("Budget.gsheet")).toBe("Budget");
  });

  it("strips .gslides", () => {
    expect(stripVirtualExt("Deck.gslides")).toBe("Deck");
  });

  it("strips .gform", () => {
    expect(stripVirtualExt("Survey.gform")).toBe("Survey");
  });

  it("leaves non-virtual extensions alone", () => {
    expect(stripVirtualExt("notes.txt")).toBe("notes.txt");
    expect(stripVirtualExt("report.pdf")).toBe("report.pdf");
  });

  it("handles filenames without extensions", () => {
    expect(stripVirtualExt("README")).toBe("README");
  });
});

describe("toVaultPath", () => {
  it("maps Google Doc to .md in vault root", () => {
    expect(toVaultPath(googleDoc, "gdrive")).toBe("gdrive/Work/Brief.md");
  });

  it("maps Google Sheet to .csv in vault root", () => {
    expect(toVaultPath(googleSheet, "gdrive")).toBe("gdrive/Work/Budget.csv");
  });

  it("maps root-level file correctly", () => {
    const rootDoc: DriveFile = {
      ...googleDoc,
      Path: "Brief.gdoc",
    };
    expect(toVaultPath(rootDoc, "gdrive")).toBe("gdrive/Brief.md");
  });

  it("preserves nested folder structure", () => {
    const nested: DriveFile = {
      ...googleDoc,
      Path: "Work/Projects/Subdir/Brief.gdoc",
    };
    expect(toVaultPath(nested, "gdrive")).toBe("gdrive/Work/Projects/Subdir/Brief.md");
  });

  it("keeps native file extension", () => {
    expect(toVaultPath(plainText, "gdrive")).toBe("gdrive/notes.txt");
  });

  it("respects custom vault root", () => {
    expect(toVaultPath(googleDoc, "drive-sync")).toBe("drive-sync/Work/Brief.md");
  });
});

describe("buildFrontmatter", () => {
  it("includes gdrive_id, gdrive_path, and synced timestamp", () => {
    const fm = buildFrontmatter(googleDoc);
    expect(fm).toContain("---");
    expect(fm).toContain('gdrive_id: "doc1"');
    expect(fm).toContain('gdrive_path: "Work/Brief.gdoc"');
    expect(fm).toMatch(/synced: "\d{4}-\d{2}-\d{2}T/);
  });

  it("starts and ends with --- delimiters", () => {
    const fm = buildFrontmatter(googleDoc);
    expect(fm.startsWith("---\n")).toBe(true);
    expect(fm).toContain("\n---\n");
  });
});

describe("convertContent", () => {
  it("converts HTML to markdown for Google Docs", () => {
    const mapping = getFormatMapping(googleDoc);
    const result = convertContent("<h1>Hello</h1><p>World</p>", mapping, googleDoc);
    expect(result).toContain("# Hello");
    expect(result).toContain("World");
    expect(result).toContain("gdrive_id"); // frontmatter
  });

  it("passes through CSV for Google Sheets", () => {
    const mapping = getFormatMapping(googleSheet);
    const csv = "a,b,c\n1,2,3";
    const result = convertContent(csv, mapping, googleSheet);
    expect(result).toBe(csv); // no frontmatter, no conversion
  });

  it("adds frontmatter to Slides plain text", () => {
    const mapping = getFormatMapping(googleSlides);
    const result = convertContent("Slide 1 content", mapping, googleSlides);
    expect(result).toContain("gdrive_id");
    expect(result).toContain("Slide 1 content");
  });

  it("passes through native files without frontmatter", () => {
    const mapping = getFormatMapping(plainText);
    const result = convertContent("hello world", mapping, plainText);
    expect(result).toBe("hello world");
  });
});

describe("sanitizeFilename", () => {
  it("replaces forbidden characters with underscores", () => {
    expect(sanitizeFilename('My: Special | File.md')).toBe("My_ Special _ File.md");
  });

  it("replaces question marks and asterisks", () => {
    expect(sanitizeFilename("What? Why*.txt")).toBe("What_ Why_.txt");
  });

  it("replaces backslashes and angle brackets", () => {
    expect(sanitizeFilename('a\\b<c>d.md')).toBe("a_b_c_d.md");
  });

  it("replaces double quotes", () => {
    expect(sanitizeFilename('"quoted".md')).toBe("_quoted_.md");
  });

  it("replaces leading dot", () => {
    expect(sanitizeFilename(".hidden")).toBe("_hidden");
  });

  it("trims whitespace", () => {
    expect(sanitizeFilename("  hello  ")).toBe("hello");
  });

  it("returns underscore for empty string", () => {
    expect(sanitizeFilename("")).toBe("_");
  });

  it("leaves clean filenames untouched", () => {
    expect(sanitizeFilename("My Document.md")).toBe("My Document.md");
  });
});

describe("toVaultPath with special characters", () => {
  it("sanitizes forbidden characters in filename", () => {
    const file: DriveFile = {
      ...googleDoc,
      Path: 'Work/My: Report.gdoc',
      Name: 'My: Report.gdoc',
    };
    expect(toVaultPath(file, "gdrive")).toBe("gdrive/Work/My_ Report.md");
  });

  it("sanitizes forbidden characters in folder names", () => {
    const file: DriveFile = {
      ...plainText,
      Path: 'Shared: Files/Q&A?/notes.txt',
      Name: 'notes.txt',
    };
    expect(toVaultPath(file, "gdrive")).toBe("gdrive/Shared_ Files/Q&A_/notes.txt");
  });
});
