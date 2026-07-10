import { describe, expect, it } from "vitest";
import { filterIsActive, nodeMatchesFilter, type NodeFilter } from "../src/domain/filter";

function filter(statuses: string[], priorities: string[] = []): NodeFilter {
  return { statuses: new Set(statuses), priorities: new Set(priorities) };
}

describe("nodeMatchesFilter", () => {
  it("matches everything when no category is selected", () => {
    const empty = filter([]);

    expect(filterIsActive(empty)).toBe(false);
    expect(nodeMatchesFilter({ status: "done", priority: "high" }, empty)).toBe(true);
    expect(nodeMatchesFilter({}, empty)).toBe(true);
  });

  it("matches any selected value within a category (OR)", () => {
    const f = filter(["done", "in-progress"]);

    expect(nodeMatchesFilter({ status: "done" }, f)).toBe(true);
    expect(nodeMatchesFilter({ status: "in-progress" }, f)).toBe(true);
    expect(nodeMatchesFilter({ status: "draft" }, f)).toBe(false);
  });

  it("requires both categories when both are selected (AND)", () => {
    const f = filter(["done"], ["high"]);

    expect(nodeMatchesFilter({ status: "done", priority: "high" }, f)).toBe(true);
    expect(nodeMatchesFilter({ status: "done", priority: "low" }, f)).toBe(false);
    expect(nodeMatchesFilter({ status: "draft", priority: "high" }, f)).toBe(false);
  });

  it("treats the `none` chip as matching a missing value", () => {
    const f = filter(["none", "done"]);

    expect(nodeMatchesFilter({}, f)).toBe(true);
    expect(nodeMatchesFilter({ status: "done" }, f)).toBe(true);
    expect(nodeMatchesFilter({ status: "draft" }, f)).toBe(false);
  });
});
