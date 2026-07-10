import { describe, expect, it } from "vitest";
import { centerNodesShift, copiedEdges, copyCluster, createNoteNode } from "../src/domain/create";
import type { RoadmapCluster, RoadmapEdge } from "../src/domain/types";

function edge(id: string, from: string, to: string, extra: Partial<RoadmapEdge> = {}): RoadmapEdge {
  return { id, from: { type: "node", id: from }, to: { type: "node", id: to }, direction: "forward", ...extra };
}

describe("copiedEdges", () => {
  it("copies only edges whose both endpoints were cloned, rewiring them onto the clones", () => {
    const edges = [edge("e1", "a", "b"), edge("e2", "b", "c")];
    const cloneIds = new Map([
      ["a", "a2"],
      ["b", "b2"],
    ]);

    const copies = copiedEdges(edges, cloneIds);

    expect(copies).toHaveLength(1);
    expect(copies[0].id).not.toBe("e1");
    expect(copies[0].from).toEqual({ type: "node", id: "a2" });
    expect(copies[0].to).toEqual({ type: "node", id: "b2" });
  });

  it("carries edge appearance onto the copy with an independent style object", () => {
    const source = edge("e1", "a", "b", { label: "depends", style: { line: "dashed" }, fromSide: "right" });
    const cloneIds = new Map([
      ["a", "a2"],
      ["b", "b2"],
    ]);

    const [copy] = copiedEdges([source], cloneIds);

    expect(copy.label).toBe("depends");
    expect(copy.fromSide).toBe("right");
    expect(copy.style).toEqual({ line: "dashed" });
    expect(copy.style).not.toBe(source.style);
  });

  it("preserves cluster endpoint types when rewiring", () => {
    const source: RoadmapEdge = {
      id: "e1",
      from: { type: "node", id: "a" },
      to: { type: "cluster", id: "c" },
      direction: "forward",
    };
    const cloneIds = new Map([
      ["a", "a2"],
      ["c", "c2"],
    ]);

    const [copy] = copiedEdges([source], cloneIds);

    expect(copy.from).toEqual({ type: "node", id: "a2" });
    expect(copy.to).toEqual({ type: "cluster", id: "c2" });
  });
});

describe("copyCluster", () => {
  it("clones with a new identity, moved frame and an independent style object", () => {
    const source: RoadmapCluster = {
      id: "c1",
      title: "Group",
      layout: { x: 10, y: 20, width: 400, height: 300 },
      collapsed: true,
      style: { color: "var(--color-blue)" },
    };

    const copy = copyCluster(source, 110, 120);

    expect(copy.id).not.toBe("c1");
    expect(copy.layout).toEqual({ x: 110, y: 120, width: 400, height: 300 });
    expect(copy.title).toBe("Group");
    expect(copy.collapsed).toBe(true);
    expect(copy.style).toEqual({ color: "var(--color-blue)" });
    expect(copy.style).not.toBe(source.style);
  });
});

describe("centerNodesShift", () => {
  it("recenters the bounding box of the nodes on the given point", () => {
    const a = createNoteNode("notes/a.md", { x: 100, y: 100 });
    const b = createNoteNode("notes/b.md", { x: 300, y: 200 });
    const box = {
      width: 300 - 100 + b.layout.width,
      height: 200 - 100 + b.layout.height,
    };

    const shift = centerNodesShift([a, b], { x: 1000, y: 500 });

    expect(shift.x).toBe(1000 - (100 + box.width / 2));
    expect(shift.y).toBe(500 - (100 + box.height / 2));
  });

  it("returns a zero shift for an empty selection", () => {
    expect(centerNodesShift([], { x: 10, y: 20 })).toEqual({ x: 0, y: 0 });
  });
});
