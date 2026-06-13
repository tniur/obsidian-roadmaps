import { describe, expect, it } from "vitest";
import { sourceFile } from "../src/domain/source";
import type { RoadmapNode, RoadmapState } from "../src/domain/types";
import { stateToFlowNodes } from "../src/view/flow";

describe("sourceFile", () => {
  it("returns the vault path for file-backed sources", () => {
    expect(sourceFile({ type: "note", file: "notes/a.md" })).toBe("notes/a.md");
    expect(sourceFile({ type: "heading", file: "notes/a.md", heading: "H" })).toBe("notes/a.md");
    expect(sourceFile({ type: "block", file: "notes/a.md", blockId: "b1" })).toBe("notes/a.md");
    expect(sourceFile({ type: "image", file: "img/a.png" })).toBe("img/a.png");
    expect(sourceFile({ type: "attachment", file: "files/a.pdf" })).toBe("files/a.pdf");
  });

  it("returns null for sources without a vault file", () => {
    expect(sourceFile({ type: "text", markdownNodeId: "m1" })).toBeNull();
    expect(sourceFile({ type: "url", url: "https://example.com" })).toBeNull();
  });
});

function sampleState(): RoadmapState {
  const node = (id: string, file: string): RoadmapNode => ({
    id,
    kind: "note",
    source: { type: "note", file },
    layout: { x: 0, y: 0, width: 1, height: 1 },
  });

  return {
    schemaVersion: 1,
    id: "r",
    nodes: { a: node("a", "notes/a.md"), b: node("b", "notes/b.md") },
    clusters: {},
    edges: {},
  };
}

describe("stateToFlowNodes missing flag", () => {
  it("marks a node missing when the predicate reports its source as absent", () => {
    const nodes = stateToFlowNodes(
      sampleState(),
      (node) => sourceFile(node.source) === "notes/b.md",
    );
    const byId = new Map(nodes.map((n) => [n.id, n]));

    expect(byId.get("a")?.data.missing).toBe(false);
    expect(byId.get("b")?.data.missing).toBe(true);
  });

  it("defaults missing to false without a predicate", () => {
    expect(stateToFlowNodes(sampleState())[0].data.missing).toBe(false);
  });
});
