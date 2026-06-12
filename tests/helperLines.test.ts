import type { Node, NodePositionChange } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { getHelperLines } from "../src/view/alignment";

function node(id: string, x: number, y: number, width: number, height: number): Node {
  return {
    id,
    position: { x, y },
    data: {},
    measured: { width, height },
  } as Node;
}

function drag(id: string, x: number, y: number): NodePositionChange {
  return { id, type: "position", position: { x, y }, dragging: true };
}

describe("getHelperLines", () => {
  it("snaps a left edge to a nearby node left edge", () => {
    const nodes = [node("a", 0, 0, 100, 50), node("b", 4, 300, 100, 50)];
    const result = getHelperLines(drag("a", 0, 0), nodes);

    expect(result.vertical).toBe(4);
    expect(result.snapX).toBe(4);
    expect(result.horizontal).toBeUndefined();
  });

  it("snaps centers when that is the closest alignment", () => {
    const nodes = [node("a", 100, 0, 100, 50), node("b", 120, 300, 60, 50)];
    const result = getHelperLines(drag("a", 100, 0), nodes);

    expect(result.vertical).toBe(150);
    expect(result.snapX).toBe(100);
  });

  it("returns nothing when no node is within range", () => {
    const nodes = [node("a", 0, 0, 100, 50), node("b", 500, 500, 100, 50)];
    const result = getHelperLines(drag("a", 0, 0), nodes);

    expect(result).toEqual({});
  });
});
