import { describe, it, expect } from "vitest";
import { tallyProjectTags } from "../utils";

const priorityTags = ["#p0", "#p1", "#p2", "#p3", "#p4"];

describe("tallyProjectTags", () => {
  it("counts each project tag once per item", () => {
    const items = [
      { tags: ["#api", "#focus"] },
      { tags: ["#api", "#docs"] },
      { tags: ["#docs"] },
    ];
    const counts = tallyProjectTags(items, priorityTags);
    expect(counts.get("#api")).toBe(2);
    expect(counts.get("#docs")).toBe(2);
  });

  it("excludes lifecycle and type tags", () => {
    const items = [
      { tags: ["#todo", "#api"] },
      { tags: ["#idea", "#docs"] },
      { tags: ["#todone", "#api"] },
      { tags: ["#future", "#snooze", "#docs"] },
      { tags: ["#principle", "#api"] },
      { tags: ["#moved", "#docs"] },
    ];
    const counts = tallyProjectTags(items, priorityTags);
    expect(counts.get("#api")).toBe(3);
    expect(counts.get("#docs")).toBe(3);
    expect(counts.get("#todo")).toBeUndefined();
    expect(counts.get("#idea")).toBeUndefined();
    expect(counts.get("#todone")).toBeUndefined();
    expect(counts.get("#future")).toBeUndefined();
    expect(counts.get("#principle")).toBeUndefined();
    expect(counts.get("#moved")).toBeUndefined();
  });

  it("excludes priority tags from the provided list", () => {
    const items = [
      { tags: ["#p0", "#p1", "#api"] },
      { tags: ["#p2", "#docs"] },
    ];
    const counts = tallyProjectTags(items, priorityTags);
    expect(counts.get("#api")).toBe(1);
    expect(counts.get("#docs")).toBe(1);
    expect(counts.get("#p0")).toBeUndefined();
    expect(counts.get("#p1")).toBeUndefined();
    expect(counts.get("#p2")).toBeUndefined();
  });

  it("excludes #focus and #today (always, regardless of priorityTags)", () => {
    const items = [
      { tags: ["#focus", "#api"] },
      { tags: ["#today", "#docs"] },
    ];
    const counts = tallyProjectTags(items, []);
    expect(counts.get("#api")).toBe(1);
    expect(counts.get("#docs")).toBe(1);
    expect(counts.get("#focus")).toBeUndefined();
    expect(counts.get("#today")).toBeUndefined();
  });

  it("dedupes the same tag appearing twice on one item", () => {
    const items = [
      { tags: ["#api", "#api", "#api"] },
      { tags: ["#api"] },
    ];
    const counts = tallyProjectTags(items, priorityTags);
    expect(counts.get("#api")).toBe(2);
  });

  it("returns an empty map when no project tags are present", () => {
    const items = [
      { tags: ["#todo", "#focus"] },
      { tags: ["#idea"] },
    ];
    const counts = tallyProjectTags(items, priorityTags);
    expect(counts.size).toBe(0);
  });

  it("handles an empty input list", () => {
    expect(tallyProjectTags([], priorityTags).size).toBe(0);
  });

  it("treats plural and singular type tags both as excluded", () => {
    const items = [
      { tags: ["#todos", "#api"] },
      { tags: ["#todones", "#api"] },
      { tags: ["#ideas", "#docs"] },
      { tags: ["#ideation", "#docs"] },
      { tags: ["#principles", "#docs"] },
      { tags: ["#snoozed", "#api"] },
    ];
    const counts = tallyProjectTags(items, priorityTags);
    expect(counts.get("#api")).toBe(3);
    expect(counts.get("#docs")).toBe(3);
  });
});
