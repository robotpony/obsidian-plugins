import { describe, it, expect } from "vitest";
import { convertToNotionMarkdown } from "../NotionConverter";

describe("convertToNotionMarkdown", () => {
  // ------- Wiki links -------

  it("converts wiki links to plain text", () => {
    expect(convertToNotionMarkdown("See [[My Page]] for details")).toBe(
      "See My Page for details"
    );
  });

  it("converts aliased wiki links to alias text", () => {
    expect(convertToNotionMarkdown("See [[My Page|the page]] here")).toBe(
      "See the page here"
    );
  });

  it("handles multiple wiki links on one line", () => {
    expect(convertToNotionMarkdown("[[A]] and [[B|beta]]")).toBe(
      "A and beta"
    );
  });

  // ------- Embeds -------

  it("strips embed syntax", () => {
    expect(convertToNotionMarkdown("![[screenshot.png]]")).toBe("");
  });

  it("strips embed with size parameter", () => {
    expect(convertToNotionMarkdown("![[image.png|400]]")).toBe("");
  });

  it("strips embed inline with text", () => {
    expect(convertToNotionMarkdown("Here: ![[diagram.svg]] above")).toBe(
      "Here:  above"
    );
  });

  // ------- Callouts -------

  it("converts callouts with title", () => {
    expect(convertToNotionMarkdown("> [!note] Important thing")).toBe(
      "> **Note:** Important thing"
    );
  });

  it("converts callouts without title", () => {
    expect(convertToNotionMarkdown("> [!warning]")).toBe("> **Warning**");
  });

  it("preserves callout body lines", () => {
    const input = "> [!tip] My tip\n> More details here";
    const expected = "> **Tip:** My tip\n> More details here";
    expect(convertToNotionMarkdown(input)).toBe(expected);
  });

  it("handles different callout types", () => {
    expect(convertToNotionMarkdown("> [!danger] Watch out")).toBe(
      "> **Danger:** Watch out"
    );
  });

  // ------- Plugin tags -------

  it("strips #todo tag", () => {
    expect(convertToNotionMarkdown("- [ ] Fix the bug #todo")).toBe(
      "- [ ] Fix the bug"
    );
  });

  it("strips multiple plugin tags", () => {
    expect(
      convertToNotionMarkdown("- [ ] Fix the bug #todo #p1 #focus")
    ).toBe("- [ ] Fix the bug");
  });

  it("strips #todone tag", () => {
    expect(convertToNotionMarkdown("- [x] Done task #todone")).toBe(
      "- [x] Done task"
    );
  });

  it("strips #idea and #principle tags", () => {
    expect(convertToNotionMarkdown("Think about this #idea")).toBe(
      "Think about this"
    );
    expect(convertToNotionMarkdown("Always test #principle")).toBe(
      "Always test"
    );
  });

  it("strips #moved and #future tags", () => {
    expect(convertToNotionMarkdown("Later thing #todo #future")).toBe(
      "Later thing"
    );
    expect(convertToNotionMarkdown("Was here #moved")).toBe("Was here");
  });

  it("preserves non-plugin tags", () => {
    expect(convertToNotionMarkdown("Fix API #todo #backend")).toBe(
      "Fix API #backend"
    );
  });

  // ------- Standard markdown passthrough -------

  it("preserves headings", () => {
    expect(convertToNotionMarkdown("## My Section")).toBe("## My Section");
  });

  it("preserves bold and italic", () => {
    expect(convertToNotionMarkdown("**bold** and *italic*")).toBe(
      "**bold** and *italic*"
    );
  });

  it("preserves standard links", () => {
    expect(convertToNotionMarkdown("[text](https://example.com)")).toBe(
      "[text](https://example.com)"
    );
  });

  it("preserves checkboxes", () => {
    expect(convertToNotionMarkdown("- [ ] unchecked\n- [x] checked")).toBe(
      "- [ ] unchecked\n- [x] checked"
    );
  });

  it("preserves blockquotes", () => {
    expect(convertToNotionMarkdown("> a quote")).toBe("> a quote");
  });

  // ------- Code blocks -------

  it("preserves code block content unchanged", () => {
    const input = "```js\nconst x = [[y]];\n#todo\n```";
    expect(convertToNotionMarkdown(input)).toBe(input);
  });

  it("does not convert wiki links inside code blocks", () => {
    const input = "before\n```\n[[link]]\n```\nafter [[real]]";
    const expected = "before\n```\n[[link]]\n```\nafter real";
    expect(convertToNotionMarkdown(input)).toBe(expected);
  });

  // ------- Combined -------

  it("handles a realistic TODO block", () => {
    const input = [
      "## Tasks #todo #focus",
      "- [ ] Fix [[Auth Module|auth]] bug #todo #p0",
      "- [ ] Update docs #todo #p2",
      "- [x] Deploy staging #todone",
      "> [!note] Blocked on API team",
    ].join("\n");

    const expected = [
      "## Tasks",
      "- [ ] Fix auth bug",
      "- [ ] Update docs",
      "- [x] Deploy staging",
      "> **Note:** Blocked on API team",
    ].join("\n");

    expect(convertToNotionMarkdown(input)).toBe(expected);
  });
});
