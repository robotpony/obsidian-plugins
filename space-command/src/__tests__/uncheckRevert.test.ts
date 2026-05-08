import { describe, it, expect } from "vitest";
import {
  replaceTodoneWithTodo,
  hasCheckboxFormat,
  isCheckboxChecked,
} from "../utils";

// Covers the line-level transform that runs when the scanner sees an unchecked
// `[ ]` checkbox on a line that still carries `#todone @date`. The scanner
// queues the line; this helper rewrites it back to `#todo`.

describe("replaceTodoneWithTodo (uncheck revert)", () => {
  it("reverts #todone @date to #todo on a list item", () => {
    expect(replaceTodoneWithTodo("- [ ] Review spec #todone @2026-05-08"))
      .toBe("- [ ] Review spec #todo");
  });

  it("reverts #todones @date to #todos", () => {
    expect(replaceTodoneWithTodo("## Tasks #todones @2026-05-08"))
      .toBe("## Tasks #todos");
  });

  it("reverts #todone without a date", () => {
    expect(replaceTodoneWithTodo("- [ ] Plain item #todone"))
      .toBe("- [ ] Plain item #todo");
  });

  it("preserves other tags on the line", () => {
    expect(replaceTodoneWithTodo("- [ ] Ship it #todone @2026-05-08 #p1 #api"))
      .toBe("- [ ] Ship it #todo #p1 #api");
  });

  it("is a no-op on a line without #todone", () => {
    const input = "- [ ] Already a todo #todo";
    expect(replaceTodoneWithTodo(input)).toBe(input);
  });
});

describe("checkbox state detection", () => {
  it("hasCheckboxFormat matches both checked and unchecked", () => {
    expect(hasCheckboxFormat("- [ ] item")).toBe(true);
    expect(hasCheckboxFormat("- [x] item")).toBe(true);
    expect(hasCheckboxFormat("- plain bullet")).toBe(false);
  });

  it("isCheckboxChecked distinguishes [x] from [ ]", () => {
    expect(isCheckboxChecked("- [x] item")).toBe(true);
    expect(isCheckboxChecked("- [X] item")).toBe(true);
    expect(isCheckboxChecked("- [ ] item")).toBe(false);
  });
});
