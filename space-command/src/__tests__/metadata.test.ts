import { describe, it, expect } from "vitest";
import { hasCachedRelevantTags } from "../utils";

// Tags as returned by metadataCache.getFileCache(file)?.tags
// Each entry has at minimum a { tag: string } shape.
type CacheTag = { tag: string };

describe("hasCachedRelevantTags", () => {
  it("returns false for undefined (file not yet indexed)", () => {
    expect(hasCachedRelevantTags(undefined)).toBe(false);
  });

  it("returns false for an empty array (no tags in file)", () => {
    expect(hasCachedRelevantTags([])).toBe(false);
  });

  it("returns false when no tags are plugin-relevant", () => {
    const tags: CacheTag[] = [{ tag: "#project" }, { tag: "#work" }, { tag: "#2026" }];
    expect(hasCachedRelevantTags(tags)).toBe(false);
  });

  it("returns true when #todo is present", () => {
    expect(hasCachedRelevantTags([{ tag: "#todo" }])).toBe(true);
  });

  it("returns true when #todos is present", () => {
    expect(hasCachedRelevantTags([{ tag: "#todos" }])).toBe(true);
  });

  it("returns true when #todone is present", () => {
    expect(hasCachedRelevantTags([{ tag: "#todone" }])).toBe(true);
  });

  it("returns true when #todones is present", () => {
    expect(hasCachedRelevantTags([{ tag: "#todones" }])).toBe(true);
  });

  it("returns true when #idea is present", () => {
    expect(hasCachedRelevantTags([{ tag: "#idea" }])).toBe(true);
  });

  it("returns true when #ideas is present", () => {
    expect(hasCachedRelevantTags([{ tag: "#ideas" }])).toBe(true);
  });

  it("returns true when #ideation is present", () => {
    expect(hasCachedRelevantTags([{ tag: "#ideation" }])).toBe(true);
  });

  it("returns true when #principle is present", () => {
    expect(hasCachedRelevantTags([{ tag: "#principle" }])).toBe(true);
  });

  it("returns true when #principles is present", () => {
    expect(hasCachedRelevantTags([{ tag: "#principles" }])).toBe(true);
  });

  it("is case-insensitive (#TODO matches)", () => {
    expect(hasCachedRelevantTags([{ tag: "#TODO" }])).toBe(true);
  });

  it("is case-insensitive (#Idea matches)", () => {
    expect(hasCachedRelevantTags([{ tag: "#Idea" }])).toBe(true);
  });

  it("finds a match among multiple non-relevant tags", () => {
    const tags: CacheTag[] = [
      { tag: "#work" },
      { tag: "#project-alpha" },
      { tag: "#idea" },
      { tag: "#focus" },
    ];
    expect(hasCachedRelevantTags(tags)).toBe(true);
  });

  it("does not match priority tags (#focus, #p0, #future)", () => {
    const tags: CacheTag[] = [
      { tag: "#focus" },
      { tag: "#p0" },
      { tag: "#future" },
      { tag: "#today" },
    ];
    expect(hasCachedRelevantTags(tags)).toBe(false);
  });

  it("does not do substring matching (#todos does not match #todosnote)", () => {
    // The Set.has() check is exact match after toLowerCase(), not a contains check
    expect(hasCachedRelevantTags([{ tag: "#todosnote" }])).toBe(false);
  });
});
