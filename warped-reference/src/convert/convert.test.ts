import { describe, it, expect } from "vitest";
import { extractSections } from "./index";

describe("extractSections", () => {
  const doc = [
    "Some preamble text before any heading.",
    "",
    "# Overview",
    "This is the overview section.",
    "",
    "## Details",
    "Details are nested under overview.",
    "",
    "# Budget",
    "Line items go here.",
    "",
    "## Q1",
    "Q1 budget details.",
    "",
    "## Q2",
    "Q2 budget details.",
    "",
    "# Timeline",
    "Milestones and dates.",
  ].join("\n");

  it("extracts a single section by heading name", () => {
    const result = extractSections(doc, ["Budget"]);
    expect(result.sections_returned).toEqual(["Budget"]);
    expect(result.not_found).toEqual([]);
    expect(result.content).toContain("# Budget");
    expect(result.content).toContain("Line items go here.");
    expect(result.content).toContain("## Q1");
    expect(result.content).toContain("Q2 budget details.");
    // Should not include Timeline (same level as Budget)
    expect(result.content).not.toContain("# Timeline");
  });

  it("extracts multiple sections by heading name", () => {
    const result = extractSections(doc, ["Overview", "Timeline"]);
    expect(result.sections_returned).toEqual(["Overview", "Timeline"]);
    expect(result.content).toContain("# Overview");
    expect(result.content).toContain("Details are nested under overview.");
    expect(result.content).toContain("# Timeline");
    expect(result.content).toContain("Milestones and dates.");
    // Should not include Budget
    expect(result.content).not.toContain("Line items go here.");
  });

  it("extracts section by numeric index", () => {
    // Index 0 = preamble, 1 = Overview, 2 = Details, 3 = Budget, ...
    const result = extractSections(doc, [0]);
    expect(result.sections_returned).toEqual(["(preamble)"]);
    expect(result.content).toContain("Some preamble text");
    expect(result.content).not.toContain("# Overview");
  });

  it("extracts by mixed name and index selectors", () => {
    const result = extractSections(doc, [0, "Timeline"]);
    expect(result.sections_returned).toContain("(preamble)");
    expect(result.sections_returned).toContain("Timeline");
    expect(result.content).toContain("Some preamble text");
    expect(result.content).toContain("Milestones and dates.");
  });

  it("is case-insensitive for heading names", () => {
    const result = extractSections(doc, ["budget"]);
    expect(result.sections_returned).toEqual(["Budget"]);
    expect(result.content).toContain("# Budget");
  });

  it("reports not_found for unmatched selectors", () => {
    const result = extractSections(doc, ["Budgets", "Nonexistent"]);
    expect(result.not_found).toEqual(["Budgets", "Nonexistent"]);
    expect(result.sections_returned).toEqual([]);
    expect(result.content).toBe("");
  });

  it("reports not_found for out-of-range numeric index", () => {
    const result = extractSections(doc, [99]);
    expect(result.not_found).toEqual(["99"]);
    expect(result.content).toBe("");
  });

  it("always returns available_headings", () => {
    const result = extractSections(doc, []);
    expect(result.available_headings.length).toBeGreaterThan(0);
    const overview = result.available_headings.find(h => h.text === "Overview");
    expect(overview).toBeDefined();
    expect(overview!.level).toBe(1);
    const details = result.available_headings.find(h => h.text === "Details");
    expect(details).toBeDefined();
    expect(details!.level).toBe(2);
  });

  it("includes preamble in available_headings as index 0", () => {
    const result = extractSections(doc, []);
    expect(result.available_headings[0]).toEqual({ index: 0, level: 0, text: "(preamble)" });
  });

  it("handles document with no headings", () => {
    const plain = "Just some text.\nNo headings here.";
    const result = extractSections(plain, [0]);
    expect(result.sections_returned).toEqual(["(preamble)"]);
    expect(result.content).toContain("Just some text.");
    expect(result.available_headings).toHaveLength(1);
  });

  it("handles document with no preamble", () => {
    const noPreamble = "# First\nContent.\n\n# Second\nMore content.";
    const result = extractSections(noPreamble, ["First"]);
    expect(result.sections_returned).toEqual(["First"]);
    expect(result.content).toContain("# First");
    expect(result.content).toContain("Content.");
    expect(result.content).not.toContain("# Second");
  });

  it("includes sub-sections in extracted content", () => {
    const result = extractSections(doc, ["Overview"]);
    // Overview (h1) should include Details (h2) since it's deeper
    expect(result.content).toContain("## Details");
    expect(result.content).toContain("Details are nested under overview.");
  });

  it("stops at same-level heading", () => {
    const result = extractSections(doc, ["Overview"]);
    // Should stop before Budget (same h1 level)
    expect(result.content).not.toContain("# Budget");
  });

  it("extracts a sub-section directly", () => {
    const result = extractSections(doc, ["Q1"]);
    expect(result.sections_returned).toEqual(["Q1"]);
    expect(result.content).toContain("## Q1");
    expect(result.content).toContain("Q1 budget details.");
    // Should not include Q2 (same level)
    expect(result.content).not.toContain("Q2 budget details.");
  });
});
