import { describe, expect, it } from "vitest";
import type { RoadmapEdge, RoadmapNode } from "../src/domain/types";
import {
  createRoadmapDocument,
  emptyState,
  insertNodeBlock,
  isRoadmapFile,
  readState,
  reconcileState,
  removeNodeBlock,
  writeRelations,
  writeState,
} from "../src/state/document";

const node: RoadmapNode = {
  id: "n1",
  kind: "note",
  source: { type: "note", file: "notes/a.md" },
  layout: { x: 5, y: 6, width: 200, height: 80 },
};

describe("roadmap document", () => {
  it("creates a recognizable, parseable empty roadmap", () => {
    const doc = createRoadmapDocument("My Roadmap");
    const state = readState(doc);

    expect(isRoadmapFile(doc)).toBe(true);
    expect(state).not.toBeNull();
    expect(Object.keys(state?.nodes ?? {})).toHaveLength(0);
  });

  it("inserts a node block into the body and keeps the heading", () => {
    const next = insertNodeBlock(createRoadmapDocument("My Roadmap"), node);

    expect(next).toContain("<!-- roadmap-node:id=n1 type=note -->");
    expect(next).toContain("[[notes/a|a]]");
    expect(next).toContain("# My Roadmap");
  });

  it("replaces only the state block, leaving the body intact", () => {
    const doc = createRoadmapDocument("My Roadmap");
    const state = readState(doc);

    if (state === null) {
      throw new Error("expected a state block");
    }

    const next = writeState(doc, { ...state, nodes: { [node.id]: node } });

    expect(next).toContain("# My Roadmap");
    expect(readState(next)?.nodes[node.id]?.layout.x).toBe(5);
  });

  it("removes a node block, keeping the heading and state block", () => {
    const doc = insertNodeBlock(createRoadmapDocument("My Roadmap"), node);
    const removed = removeNodeBlock(doc, node.id);

    expect(removed).not.toContain(`id=${node.id}`);
    expect(removed).not.toContain("[[notes/a|a]]");
    expect(removed).toContain("# My Roadmap");
    expect(removed).toContain("%% roadmap:state");
  });

  it("reconciles deletions: drops state nodes missing a body marker", () => {
    const doc = createRoadmapDocument("My Roadmap");
    const base = readState(doc);

    if (base === null) {
      throw new Error("expected a state block");
    }

    const withOrphan = writeState(doc, { ...base, nodes: { [node.id]: node } });
    const reconciled = reconcileState(readState(withOrphan) ?? emptyState(), withOrphan);

    expect(reconciled.nodes[node.id]).toBeUndefined();
  });

  it("reconciles inline text edited by hand in the body back into state", () => {
    const textNode: RoadmapNode = {
      id: "t1",
      kind: "text",
      source: { type: "text", markdownNodeId: "m1" },
      title: "AAA",
      layout: { x: 0, y: 0, width: 200, height: 80 },
    };
    const doc = insertNodeBlock(createRoadmapDocument("My Roadmap"), textNode);
    const base = readState(doc);

    if (base === null) {
      throw new Error("expected a state block");
    }

    const content = writeState(doc, { ...base, nodes: { t1: textNode } });
    const edited = content.replace("AAA", "BBB");
    const reconciled = reconcileState(readState(edited) ?? emptyState(), edited);

    expect(reconciled.nodes.t1?.title).toBe("BBB");
  });

  it("reconcile keeps nodes that still have a body marker", () => {
    const doc = insertNodeBlock(createRoadmapDocument("My Roadmap"), node);
    const base = readState(doc);

    if (base === null) {
      throw new Error("expected a state block");
    }

    const withBoth = writeState(doc, { ...base, nodes: { [node.id]: node } });
    const reconciled = reconcileState(readState(withBoth) ?? emptyState(), withBoth);

    expect(reconciled.nodes[node.id]).toBeDefined();
  });

  it("writes a readable ## Relations section before the state block", () => {
    const nodeB: RoadmapNode = {
      id: "n2",
      kind: "note",
      source: { type: "note", file: "notes/b.md" },
      layout: { x: 0, y: 0, width: 200, height: 80 },
    };
    const edge: RoadmapEdge = {
      id: "e1",
      from: { type: "node", id: node.id },
      to: { type: "node", id: nodeB.id },
      direction: "forward",
    };
    const doc = createRoadmapDocument("My Roadmap");
    const base = readState(doc);

    if (base === null) {
      throw new Error("expected a state block");
    }

    const state = { ...base, nodes: { [node.id]: node, [nodeB.id]: nodeB }, edges: { e1: edge } };
    const next = writeRelations(writeState(doc, state), state);

    expect(next).toContain("## Relations");
    expect(next).toContain("[[notes/a|a]] -> [[notes/b|b]]");
    expect(next.indexOf("## Relations")).toBeLessThan(next.indexOf("%% roadmap:state"));
  });

  it("reconcile drops edges whose endpoint node is gone", () => {
    const nodeB: RoadmapNode = {
      id: "n2",
      kind: "note",
      source: { type: "note", file: "notes/b.md" },
      layout: { x: 0, y: 0, width: 200, height: 80 },
    };
    const edge: RoadmapEdge = {
      id: "e1",
      from: { type: "node", id: node.id },
      to: { type: "node", id: nodeB.id },
      direction: "forward",
    };
    const docWithA = insertNodeBlock(createRoadmapDocument("My Roadmap"), node);
    const base = readState(docWithA);

    if (base === null) {
      throw new Error("expected a state block");
    }

    const content = writeState(docWithA, {
      ...base,
      nodes: { [node.id]: node, [nodeB.id]: nodeB },
      edges: { e1: edge },
    });
    const reconciled = reconcileState(readState(content) ?? emptyState(), content);

    expect(reconciled.nodes[node.id]).toBeDefined();
    expect(reconciled.nodes[nodeB.id]).toBeUndefined();
    expect(reconciled.edges.e1).toBeUndefined();
  });

  it("tags ## Relations lines with a hidden edge-id marker", () => {
    const nodeB: RoadmapNode = {
      id: "n2",
      kind: "note",
      source: { type: "note", file: "notes/b.md" },
      layout: { x: 0, y: 0, width: 200, height: 80 },
    };
    const edge: RoadmapEdge = {
      id: "e1",
      from: { type: "node", id: node.id },
      to: { type: "node", id: nodeB.id },
      direction: "forward",
    };
    const doc = createRoadmapDocument("My Roadmap");
    const base = readState(doc);

    if (base === null) {
      throw new Error("expected a state block");
    }

    const state = { ...base, nodes: { [node.id]: node, [nodeB.id]: nodeB }, edges: { e1: edge } };
    const next = writeRelations(writeState(doc, state), state);

    expect(next).toContain("<!-- roadmap-edge:id=e1 -->");
  });

  it("reconcile drops an edge whose relations marker was removed", () => {
    const nodeB: RoadmapNode = {
      id: "n2",
      kind: "note",
      source: { type: "note", file: "notes/b.md" },
      layout: { x: 0, y: 0, width: 200, height: 80 },
    };
    const e1: RoadmapEdge = {
      id: "e1",
      from: { type: "node", id: node.id },
      to: { type: "node", id: nodeB.id },
      direction: "forward",
    };
    const e2: RoadmapEdge = {
      id: "e2",
      from: { type: "node", id: nodeB.id },
      to: { type: "node", id: node.id },
      direction: "forward",
    };
    const doc = insertNodeBlock(insertNodeBlock(createRoadmapDocument("My Roadmap"), node), nodeB);
    const base = readState(doc);

    if (base === null) {
      throw new Error("expected a state block");
    }

    const state = {
      ...base,
      nodes: { [node.id]: node, [nodeB.id]: nodeB },
      edges: { e1, e2 },
    };
    const content = writeRelations(writeState(doc, state), state);
    const edited = content.replace(/^-.*roadmap-edge:id=e1[^\n]*\n?/m, "");
    const reconciled = reconcileState(readState(edited) ?? emptyState(), edited);

    expect(reconciled.edges.e1).toBeUndefined();
    expect(reconciled.edges.e2).toBeDefined();
  });

  it("reconcile keeps edges when the body has no edge markers (legacy)", () => {
    const nodeB: RoadmapNode = {
      id: "n2",
      kind: "note",
      source: { type: "note", file: "notes/b.md" },
      layout: { x: 0, y: 0, width: 200, height: 80 },
    };
    const e1: RoadmapEdge = {
      id: "e1",
      from: { type: "node", id: node.id },
      to: { type: "node", id: nodeB.id },
      direction: "forward",
    };
    const doc = insertNodeBlock(insertNodeBlock(createRoadmapDocument("My Roadmap"), node), nodeB);
    const base = readState(doc);

    if (base === null) {
      throw new Error("expected a state block");
    }

    const content = writeState(doc, {
      ...base,
      nodes: { [node.id]: node, [nodeB.id]: nodeB },
      edges: { e1 },
    });
    const reconciled = reconcileState(readState(content) ?? emptyState(), content);

    expect(reconciled.edges.e1).toBeDefined();
  });
});
