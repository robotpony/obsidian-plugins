import { describe, it, expect } from "vitest";
import {
  replaceTodoWithMoved,
  extractDateFromFilename,
  hasCachedRelevantTags,
  extractTags,
} from "../utils";

describe("replaceTodoWithMoved", () => {
  it("replaces #todo with #moved @date", () => {
    expect(replaceTodoWithMoved("- [ ] Fix bug #todo #p0", "2026-03-30"))
      .toBe("- [ ] Fix bug #moved @2026-03-30 #p0");
  });

  it("replaces #todos with #moved @date", () => {
    expect(replaceTodoWithMoved("## Tasks #todos", "2026-03-30"))
      .toBe("## Tasks #moved @2026-03-30");
  });

  it("does not replace #todone", () => {
    const input = "- [x] Done #todone @2026-03-28";
    expect(replaceTodoWithMoved(input, "2026-03-30")).toBe(input);
  });

  it("only replaces first occurrence of #todo", () => {
    expect(replaceTodoWithMoved("- [ ] #todo see #todo", "2026-03-30"))
      .toBe("- [ ] #moved @2026-03-30 see #todo");
  });
});

describe("extractDateFromFilename", () => {
  it("extracts date from simple date filename", () => {
    expect(extractDateFromFilename("2026-03-30")).toBe("2026-03-30");
  });

  it("extracts date from filename with suffix", () => {
    expect(extractDateFromFilename("2026-03-30 daily notes")).toBe("2026-03-30");
  });

  it("returns null for non-date filename", () => {
    expect(extractDateFromFilename("my-project-tasks")).toBeNull();
  });

  it("returns null for partial date", () => {
    expect(extractDateFromFilename("2026-03")).toBeNull();
  });

  it("extracts first date when multiple are present", () => {
    expect(extractDateFromFilename("2026-03-30 to 2026-04-05")).toBe("2026-03-30");
  });
});

describe("#moved in hasCachedRelevantTags", () => {
  it("returns true when #moved is present", () => {
    expect(hasCachedRelevantTags([{ tag: "#moved" }])).toBe(true);
  });

  it("is case-insensitive (#Moved matches)", () => {
    expect(hasCachedRelevantTags([{ tag: "#Moved" }])).toBe(true);
  });
});

describe("#moved tag extraction", () => {
  it("extractTags finds #moved", () => {
    expect(extractTags("- [ ] Task #moved @2026-03-30")).toContain("#moved");
  });

  it("extractTags ignores #moved inside backticks", () => {
    expect(extractTags("Use `#moved` to mark items")).not.toContain("#moved");
  });
});
