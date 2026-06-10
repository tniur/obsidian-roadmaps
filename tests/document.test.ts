import { describe, expect, it } from "vitest";
import type { RoadmapNode } from "../src/domain/types";
import {
  createRoadmapDocument,
  emptyState,
  insertNodeBlock,
  isRoadmapFile,
  readState,
  reconcileState,
  removeNodeBlock,
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
});
