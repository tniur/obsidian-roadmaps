import { describe, expect, it } from "vitest";
import { createNoteNode } from "../src/domain/create";
import { computeAutoLayout } from "../src/domain/autoLayout";
import { newSession } from "./helpers";

describe("computeAutoLayout", () => {
  it("lays a directed chain out left to right, one layer per hop", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 0, y: 0 });
    const c = createNoteNode("notes/c.md", { x: 0, y: 0 });

    session.addNodes([a, b, c]);
    session.addEdge(a.id, b.id);
    session.addEdge(b.id, c.id);

    const layout = computeAutoLayout(session.state);

    expect(layout.nodePositions[a.id].x).toBeLessThan(layout.nodePositions[b.id].x);
    expect(layout.nodePositions[b.id].x).toBeLessThan(layout.nodePositions[c.id].x);
    expect(layout.nodePositions[a.id].x).toBe(0);
  });

  it("keeps undirected links in the same layer, stacked vertically", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 300, y: 0 });

    session.addNodes([a, b]);
    session.addEdge(a.id, b.id);
    session.updateEdge(Object.keys(session.state.edges)[0], { direction: "none" });

    const layout = computeAutoLayout(session.state);

    expect(layout.nodePositions[a.id].x).toBe(layout.nodePositions[b.id].x);
    expect(layout.nodePositions[a.id].y).not.toBe(layout.nodePositions[b.id].y);
  });

  it("treats a cluster as one block, ordering it after a node that points into it", () => {
    const session = newSession();
    const free = createNoteNode("notes/free.md", { x: 0, y: 0 });
    const member = createNoteNode("notes/member.md", { x: 400, y: 0 });

    session.addNodes([free, member]);
    session.createClusterFromNodes([member.id], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];

    session.addEdge(free.id, member.id);

    const layout = computeAutoLayout(session.state);

    expect(layout.clusters[clusterId]).toBeDefined();
    expect(layout.clusters[clusterId].x).toBeGreaterThan(layout.nodePositions[free.id].x);
    expect(layout.nodePositions[member.id]).toBeDefined();
  });

  it("returns an empty layout for a board with nothing on it", () => {
    const layout = computeAutoLayout(newSession().state);

    expect(Object.keys(layout.nodePositions)).toHaveLength(0);
    expect(Object.keys(layout.clusters)).toHaveLength(0);
  });

  it("leaves a collapsed cluster's members and stored size untouched", () => {
    const session = newSession();
    const m1 = createNoteNode("notes/m1.md", { x: 0, y: 0 });
    const m2 = createNoteNode("notes/m2.md", { x: 0, y: 100 });

    session.addNodes([m1, m2]);
    session.createClusterFromNodes([m1.id, m2.id], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];

    session.toggleClusterCollapsed(clusterId);
    const storedSize = { ...session.state.clusters[clusterId].layout };
    const layout = computeAutoLayout(session.state);

    expect(layout.nodePositions[m1.id]).toBeUndefined();
    expect(layout.nodePositions[m2.id]).toBeUndefined();
    expect(layout.clusters[clusterId].width).toBe(storedSize.width);
    expect(layout.clusters[clusterId].height).toBe(storedSize.height);
  });
});

describe("RoadmapSession.autoLayout", () => {
  it("moves nodes and is a single undo step", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 500, y: 500 });
    const b = createNoteNode("notes/b.md", { x: 500, y: 500 });

    session.addNodes([a, b]);
    session.addEdge(a.id, b.id);
    const before = { ...session.state.nodes[b.id].layout };

    session.autoLayout();

    expect(session.state.nodes[b.id].layout.x).not.toBe(before.x);

    session.undo();

    expect(session.state.nodes[b.id].layout.x).toBe(before.x);
  });

  it("is idempotent: a second run is a no-op", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 500, y: 500 });
    const b = createNoteNode("notes/b.md", { x: 500, y: 500 });

    session.addNodes([a, b]);
    session.addEdge(a.id, b.id);
    session.autoLayout();
    const settled = session.content;

    session.autoLayout();

    expect(session.content).toBe(settled);
  });
});
