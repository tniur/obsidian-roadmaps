import { describe, expect, it } from "vitest";
import { copiedEdges } from "../src/domain/create";
import type { RoadmapEdge } from "../src/domain/types";

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
});
