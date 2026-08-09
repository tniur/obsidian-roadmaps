import type { Node, NodePositionChange } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { getHelperLines, offsetGuides, sameGuides } from "../src/view/alignment";

function node(id: string, x: number, y: number, width: number, height: number): Node {
  return {
    id,
    position: { x, y },
    data: {},
    measured: { width, height },
  };
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

describe("getHelperLines spacing", () => {
  it("repeats the gap of a pair when the node trails the row", () => {
    const nodes = [node("a", 402, 0, 100, 50), node("b", 0, 0, 100, 50), node("c", 200, 0, 100, 50)];
    const result = getHelperLines(drag("a", 402, 0), nodes);

    expect(result.snapX).toBe(400);
    expect(result.spacing).toEqual([
      { axis: "x", from: 100, to: 200, cross: 25 },
      { axis: "x", from: 300, to: 400, cross: 25 },
    ]);
  });

  it("repeats the gap when the node leads the row", () => {
    const nodes = [node("a", -197, 0, 100, 50), node("b", 0, 0, 100, 50), node("c", 200, 0, 100, 50)];
    const result = getHelperLines(drag("a", -197, 0), nodes);

    expect(result.snapX).toBe(-200);
  });

  it("centres the node between two neighbours with equal gaps", () => {
    const nodes = [node("a", 152, 0, 100, 50), node("b", 0, 0, 100, 50), node("c", 300, 0, 100, 50)];
    const result = getHelperLines(drag("a", 152, 0), nodes);

    expect(result.snapX).toBe(150);
    expect(result.spacing).toEqual([
      { axis: "x", from: 100, to: 150, cross: 25 },
      { axis: "x", from: 250, to: 300, cross: 25 },
    ]);
  });

  it("matches gaps down a column", () => {
    const nodes = [node("a", 0, 403, 100, 50), node("b", 0, 0, 100, 50), node("c", 0, 200, 100, 50)];
    const result = getHelperLines(drag("a", 0, 403), nodes);

    expect(result.snapY).toBe(400);
    expect(result.spacing).toEqual([
      { axis: "y", from: 50, to: 200, cross: 50 },
      { axis: "y", from: 250, to: 400, cross: 50 },
    ]);
  });

  it("ignores nodes that do not overlap across the axis", () => {
    const nodes = [node("a", 402, 0, 100, 50), node("b", 0, 400, 100, 50), node("c", 200, 400, 100, 50)];
    const result = getHelperLines(drag("a", 402, 0), nodes);

    expect(result.snapX).toBeUndefined();
    expect(result.spacing).toBeUndefined();
  });

  it("keeps a closer side alignment over a spacing match", () => {
    const row = [node("b", 0, 0, 100, 50), node("c", 200, 0, 100, 50)];
    const nodes = [node("a", 403, 0, 100, 50), ...row, node("d", 404, 400, 100, 50)];
    const result = getHelperLines(drag("a", 403, 0), nodes);

    expect(result.snapX).toBe(404);
    expect(result.vertical).toBe(404);
    expect(result.spacing).toBeUndefined();
  });

  it("drops the side guide the spacing match beats", () => {
    const row = [node("b", 0, 0, 100, 50), node("c", 200, 0, 100, 50)];
    const nodes = [node("a", 403, 0, 100, 50), ...row, node("d", 407, 400, 100, 50)];
    const result = getHelperLines(drag("a", 403, 0), nodes);

    expect(result.snapX).toBe(400);
    expect(result.vertical).toBeUndefined();
    expect(result.spacing).toHaveLength(2);
  });

  it("needs at least two neighbours to infer a gap", () => {
    const nodes = [node("a", 402, 0, 100, 50), node("b", 200, 0, 100, 50)];
    const result = getHelperLines(drag("a", 402, 0), nodes);

    expect(result.spacing).toBeUndefined();
  });
});

describe("offsetGuides", () => {
  it("shifts lines and spacing bars into flow coordinates", () => {
    const shifted = offsetGuides(
      { horizontal: 10, vertical: 20, spacing: [{ axis: "x", from: 0, to: 50, cross: 5 }] },
      1000,
      500,
    );

    expect(shifted.horizontal).toBe(510);
    expect(shifted.vertical).toBe(1020);
    expect(shifted.spacing).toEqual([{ axis: "x", from: 1000, to: 1050, cross: 505 }]);
  });

  it("shifts a column bar along y and across x", () => {
    const shifted = offsetGuides({ spacing: [{ axis: "y", from: 0, to: 50, cross: 5 }] }, 1000, 500);

    expect(shifted.spacing).toEqual([{ axis: "y", from: 500, to: 550, cross: 1005 }]);
  });
});

describe("sameGuides", () => {
  it("treats equal guide values as unchanged", () => {
    const bar = { axis: "x", from: 0, to: 50, cross: 5 } as const;

    expect(sameGuides({ vertical: 10, spacing: [bar] }, { vertical: 10, spacing: [{ ...bar }] })).toBe(true);
  });

  it("detects a moved spacing bar", () => {
    const bar = { axis: "x", from: 0, to: 50, cross: 5 } as const;

    expect(sameGuides({ spacing: [bar] }, { spacing: [{ ...bar, to: 60 }] })).toBe(false);
  });

  it("detects guides appearing and disappearing", () => {
    expect(sameGuides({}, { spacing: [{ axis: "x", from: 0, to: 50, cross: 5 }] })).toBe(false);
    expect(sameGuides({ horizontal: 4 }, {})).toBe(false);
  });
});
