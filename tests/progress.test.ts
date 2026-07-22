import { describe, expect, it } from "vitest";
import { createNoteNode } from "../src/domain/create";
import { boardProgress } from "../src/domain/progress";
import type { RoadmapNode, RoadmapState } from "../src/domain/types";

function stateWith(nodes: RoadmapNode[]): RoadmapState {
  return {
    schemaVersion: 1,
    id: "r",
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
    clusters: {},
    edges: {},
  };
}

function node(status?: RoadmapNode["status"]): RoadmapNode {
  return { ...createNoteNode("notes/x.md", { x: 0, y: 0 }), id: Math.random().toString(36).slice(2), status };
}

describe("boardProgress", () => {
  it("tallies nodes per status and counts missing status as none", () => {
    const progress = boardProgress(stateWith([node("done"), node("done"), node("in-progress"), node()]));

    expect(progress.total).toBe(4);
    expect(progress.counts).toEqual({ draft: 0, "in-progress": 1, done: 2, archived: 0, none: 1 });
  });

  it("reports the done share as a rounded percent", () => {
    const progress = boardProgress(stateWith([node("done"), node("draft"), node("draft")]));

    expect(progress.done).toBe(1);
    expect(progress.donePercent).toBe(33);
  });

  it("returns zero progress for an empty board", () => {
    const progress = boardProgress(stateWith([]));

    expect(progress.total).toBe(0);
    expect(progress.donePercent).toBe(0);
    expect(progress.counts.none).toBe(0);
  });
});
