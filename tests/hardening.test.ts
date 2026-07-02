import { describe, expect, it } from "vitest";
import { copyNode, createNoteNode, createTextNode } from "../src/domain/create";
import { createRoadmapDocument, readState, reconcileState } from "../src/state/document";
import { RoadmapSession } from "../src/state/session";

function freshSession(): RoadmapSession {
  const content = createRoadmapDocument("Board");
  const state = readState(content);

  if (state === null) {
    throw new Error("expected a state block");
  }

  return new RoadmapSession(state, content);
}

describe("write-path safety", () => {
  it("writes a safe wikilink alias for a title with link syntax", () => {
    const session = freshSession();
    const node = createNoteNode("notes/a.md", { x: 0, y: 0 });

    session.addNode(node);
    session.updateNodeMeta(node.id, { title: "Evil ]] title" });

    expect(session.content).toContain("[[notes/a|Evil )) title]]");
    expect(session.content).not.toContain("[[notes/a|Evil ]]");
  });

  it("strips marker sequences from edge labels", () => {
    const session = freshSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 300, y: 0 });

    session.addNodes([a, b]);
    session.addEdge(a.id, b.id);
    const edgeId = Object.keys(session.state.edges)[0];

    session.updateEdge(edgeId, { label: "x <!-- roadmap-edge:id=fake -->" });

    expect(session.state.edges[edgeId].label).not.toContain("<!--");
    expect(session.content).not.toContain("<!-- roadmap-edge:id=fake");
  });

  it("round-trips text node content that looks like a heading", () => {
    const session = freshSession();
    const text = createTextNode("## Fake heading", { x: 0, y: 0 });

    session.addNode(text);

    const reloaded = reconcileState(session.state, session.content);

    expect(reloaded.nodes[text.id].title).toBe("## Fake heading");
  });

  it("rejects reserved cluster names on rename and create", () => {
    const session = freshSession();
    const node = createNoteNode("notes/a.md", { x: 0, y: 0 });

    session.addNode(node);
    session.createClusterFromNodes([node.id], "Relations");
    expect(Object.keys(session.state.clusters)).toHaveLength(0);

    session.createClusterFromNodes([node.id], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];

    session.renameCluster(clusterId, "Archive");
    expect(session.state.clusters[clusterId].title).toBe("Group");
  });
});

describe("cluster membership consistency", () => {
  it("pastes a copy of a cluster member as unclustered and reload-stable", () => {
    const session = freshSession();
    const node = createNoteNode("notes/a.md", { x: 100, y: 100 });

    session.addNode(node);
    session.createClusterFromNodes([node.id], "Group");
    const member = session.state.nodes[node.id];
    const clone = copyNode(member, 500, 500);

    session.addNodes([clone]);

    expect(session.state.nodes[clone.id].clusterId).toBeUndefined();
    const reloaded = reconcileState(session.state, session.content);

    expect(reloaded.nodes[clone.id].clusterId ?? null).toBeNull();
    expect(reloaded.nodes[clone.id].layout.x).toBe(500);
  });

  it("drops an edge that becomes internal when grouping connected nodes", () => {
    const session = freshSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 300, y: 0 });

    session.addNodes([a, b]);
    session.addEdge(a.id, b.id);
    session.createClusterFromNodes([a.id, b.id], "Group");

    expect(Object.keys(session.state.edges)).toHaveLength(0);
    expect(session.content).not.toContain("## Relations");
  });

  it("drops an edge that becomes internal when a node is dragged into the cluster", () => {
    const session = freshSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 600, y: 0 });

    session.addNodes([a, b]);
    session.createClusterFromNodes([a.id], "Group");
    session.addEdge(a.id, b.id);
    const cluster = Object.values(session.state.clusters)[0];

    session.setNodesCluster([{ id: b.id, clusterId: cluster.id, x: cluster.layout.x + 40, y: cluster.layout.y + 60 }]);

    expect(session.state.nodes[b.id].clusterId).toBe(cluster.id);
    expect(Object.keys(session.state.edges)).toHaveLength(0);
  });
});

describe("viewport persistence", () => {
  it("stores the viewport without creating an undo step", () => {
    const session = freshSession();

    session.setViewport({ x: 10, y: 20, zoom: 1.5 });

    expect(session.state.viewport).toEqual({ x: 10, y: 20, zoom: 1.5 });
    expect(session.canUndo).toBe(false);
    expect(readState(session.content)?.viewport).toEqual({ x: 10, y: 20, zoom: 1.5 });
  });
});

describe("no-op mutations", () => {
  it("does not record history for a meta patch that changes nothing", () => {
    const session = freshSession();
    const node = createNoteNode("notes/a.md", { x: 0, y: 0 });

    session.addNode(node);
    session.updateNodeMeta(node.id, { status: "done" });
    session.undo();
    session.redo();
    session.updateNodeMeta(node.id, { status: "done" });
    session.undo();

    expect(session.state.nodes[node.id].status).toBeUndefined();
  });
});
