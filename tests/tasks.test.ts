import { describe, expect, it } from "vitest";
import { setTaskMark } from "../src/markdown/tasks";

const note = ["# Plan", "", "- [ ] first", "- [x] second", "text between", "- [ ] third"].join("\n");

describe("setTaskMark", () => {
  it("checks the nth task counting in document order", () => {
    expect(setTaskMark(note, 0, true)).toContain("- [x] first");
    expect(setTaskMark(note, 2, true)).toContain("- [x] third");
  });

  it("unchecks a checked task, including custom marks", () => {
    expect(setTaskMark(note, 1, false)).toContain("- [ ] second");
    expect(setTaskMark("- [/] doing", 0, false)).toBe("- [ ] doing");
  });

  it("changes only the target line", () => {
    const next = setTaskMark(note, 0, true);

    expect(next).toBe(note.replace("- [ ] first", "- [x] first"));
  });

  it("refuses when the current mark does not match the pre-click state", () => {
    expect(setTaskMark(note, 1, true)).toBeNull();
    expect(setTaskMark(note, 0, false)).toBeNull();
  });

  it("refuses when the index is out of range", () => {
    expect(setTaskMark(note, 3, true)).toBeNull();
    expect(setTaskMark("no tasks here", 0, true)).toBeNull();
  });

  it("counts indented, numbered and blockquote tasks", () => {
    expect(setTaskMark("  - [ ] nested", 0, true)).toBe("  - [x] nested");
    expect(setTaskMark("1. [ ] ordered", 0, true)).toBe("1. [x] ordered");
    expect(setTaskMark("> - [ ] quoted", 0, true)).toBe("> - [x] quoted");
    expect(setTaskMark("> > - [ ] callout", 0, true)).toBe("> > - [x] callout");
  });

  it("treats a bare task line without trailing text as a task", () => {
    expect(setTaskMark("- [ ]", 0, true)).toBe("- [x]");
  });

  it("ignores lines that only resemble tasks", () => {
    expect(setTaskMark("- [x]done", 0, false)).toBeNull();
    expect(setTaskMark("[ ] not a list item", 0, true)).toBeNull();
  });

  it("skips task-looking lines inside fenced code", () => {
    const fenced = ["```", "- [ ] sample", "```", "- [ ] real"].join("\n");

    expect(setTaskMark(fenced, 0, true)).toBe(["```", "- [ ] sample", "```", "- [x] real"].join("\n"));
  });

  it("skips frontmatter", () => {
    const withFrontmatter = ["---", "list:", "- [ ] yaml", "---", "- [ ] real"].join("\n");

    expect(setTaskMark(withFrontmatter, 0, true)).toBe(["---", "list:", "- [ ] yaml", "---", "- [x] real"].join("\n"));
  });
});
