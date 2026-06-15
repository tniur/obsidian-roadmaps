import { describe, expect, it } from "vitest";
import { copyNode, createNoteNode, createUrlNode } from "../src/domain/create";
import { createRoadmapDocument, readState } from "../src/state/document";
import { RoadmapSession } from "../src/state/session";

function newSession(): RoadmapSession {
  const content = createRoadmapDocument("R");
  const state = readState(content);
  if (state === null) {
    throw new Error("expected a state block");
  }

  return new RoadmapSession(state, content);
}

describe("roadmap session", () => {
  it("adds a node to state, body and state block without mutating the prior snapshot", () => {
    const session = newSession();
    const before = session.state;
    const node = createNoteNode("notes/a.md", { x: 1, y: 2 });
    session.addNode(node);

    expect(session.state.nodes[node.id]).toBeDefined();
    expect(before.nodes[node.id]).toBeUndefined();
    expect(session.content).toContain(`id=${node.id}`);
    expect(readState(session.content)?.nodes[node.id]?.source).toEqual({
      type: "note",
      file: "notes/a.md",
    });
  });

  it("adds a url node rendered as a markdown link in the body", () => {
    const session = newSession();
    const node = createUrlNode("https://example.com/docs", { x: 0, y: 0 });
    session.addNode(node);

    expect(session.state.nodes[node.id]?.source).toEqual({
      type: "url",
      url: "https://example.com/docs",
    });
    expect(session.content).toContain("[example.com](https://example.com/docs)");
    expect(readState(session.content)?.nodes[node.id]?.kind).toBe("url");
  });

  it("updates a url node's address in state and the body link", () => {
    const session = newSession();
    const node = createUrlNode("https://example.com", { x: 0, y: 0 });
    session.addNode(node);

    session.setNodeUrl(node.id, "https://docs.rs/page");

    expect(readState(session.content)?.nodes[node.id]?.source).toEqual({
      type: "url",
      url: "https://docs.rs/page",
    });
    expect(session.content).toContain("(https://docs.rs/page)");
    expect(session.content).not.toContain("https://example.com");
  });

  it("deletes a node from state, body and state block", () => {
    const session = newSession();
    const node = createNoteNode("notes/a.md", { x: 1, y: 2 });
    session.addNode(node);
    session.deleteNode(node.id);

    expect(session.state.nodes[node.id]).toBeUndefined();
    expect(session.content).not.toContain(`id=${node.id}`);
    expect(readState(session.content)?.nodes[node.id]).toBeUndefined();
  });

  it("moves a node without touching the readable body", () => {
    const session = newSession();
    const node = createNoteNode("notes/a.md", { x: 1, y: 2 });
    session.addNode(node);
    const bodyBefore = session.content.split("%% roadmap:state")[0];
    session.moveNode(node.id, 40, 50);

    expect(session.state.nodes[node.id]?.layout).toMatchObject({ x: 40, y: 50 });
    expect(session.content.split("%% roadmap:state")[0]).toBe(bodyBefore);
    expect(readState(session.content)?.nodes[node.id]?.layout.x).toBe(40);
  });

  it("sets text alignment per axis, merging with the default", () => {
    const session = newSession();
    const node = createNoteNode("notes/a.md", { x: 0, y: 0 });
    session.addNode(node);
    const bodyBefore = session.content.split("%% roadmap:state")[0];
    session.setNodeAlign(node.id, { h: "center" });

    expect(session.state.nodes[node.id]?.align).toEqual({ h: "center", v: "middle" });

    session.setNodeAlign(node.id, { v: "bottom" });

    expect(session.state.nodes[node.id]?.align).toEqual({ h: "center", v: "bottom" });
    expect(session.content.split("%% roadmap:state")[0]).toBe(bodyBefore);
    expect(readState(session.content)?.nodes[node.id]?.align).toEqual({ h: "center", v: "bottom" });
  });

  it("sets and clears node status in state and the body block", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    session.addNode(a);

    session.updateNodeMeta(a.id, { status: "done" });

    expect(session.state.nodes[a.id]?.status).toBe("done");
    expect(session.content).toContain("#done");
    expect(readState(session.content)?.nodes[a.id]?.status).toBe("done");

    session.updateNodeMeta(a.id, { status: null });

    expect(session.state.nodes[a.id]?.status).toBeUndefined();
    expect(session.content).not.toContain("#done");

    session.undo();

    expect(session.state.nodes[a.id]?.status).toBe("done");
  });

  it("sets node priority in state and the body block", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    session.addNode(a);

    session.updateNodeMeta(a.id, { priority: "high" });

    expect(session.state.nodes[a.id]?.priority).toBe("high");
    expect(session.content).toContain("#high");
    expect(readState(session.content)?.nodes[a.id]?.priority).toBe("high");
  });

  it("sets node color in state without touching the readable body", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    session.addNode(a);
    const bodyBefore = session.content.split("%% roadmap:state")[0];

    session.updateNodeMeta(a.id, { color: "var(--color-red)" });

    expect(session.state.nodes[a.id]?.style?.color).toBe("var(--color-red)");
    expect(session.content.split("%% roadmap:state")[0]).toBe(bodyBefore);

    session.updateNodeMeta(a.id, { color: null });

    expect(session.state.nodes[a.id]?.style?.color).toBeUndefined();
  });

  it("sets a node title and reflects it in the body link alias", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    session.addNode(a);

    session.updateNodeMeta(a.id, { title: "Custom" });

    expect(session.state.nodes[a.id]?.title).toBe("Custom");
    expect(session.content).toContain("|Custom]]");

    session.updateNodeMeta(a.id, { title: "" });

    expect(session.state.nodes[a.id]?.title).toBeUndefined();
    expect(session.content).not.toContain("Custom");
  });

  it("adds an edge to state and the ## Relations section", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 0, y: 0 });
    session.addNode(a);
    session.addNode(b);
    session.addEdge(a.id, b.id);
    const edgeId = Object.keys(session.state.edges)[0];

    expect(Object.keys(session.state.edges)).toHaveLength(1);
    expect(session.content).toContain("## Relations");
    expect(session.content).toContain(`roadmap-edge:id=${edgeId}`);
    expect(readState(session.content)?.edges[edgeId]?.from.id).toBe(a.id);
  });

  it("stores the connected handle sides on the edge", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 0, y: 0 });
    session.addNode(a);
    session.addNode(b);
    session.addEdge(a.id, b.id, "bottom", "left");
    const edge = readState(session.content)?.edges[Object.keys(session.state.edges)[0]];

    expect(edge?.fromSide).toBe("bottom");
    expect(edge?.toSide).toBe("left");
  });

  it("does not duplicate the same directed edge", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 0, y: 0 });
    session.addNode(a);
    session.addNode(b);
    session.addEdge(a.id, b.id);
    session.addEdge(a.id, b.id);

    expect(Object.keys(session.state.edges)).toHaveLength(1);
  });

  it("deletes an edge from state and the ## Relations section", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 0, y: 0 });
    session.addNode(a);
    session.addNode(b);
    session.addEdge(a.id, b.id);
    session.deleteEdge(Object.keys(session.state.edges)[0]);

    expect(Object.keys(session.state.edges)).toHaveLength(0);
    expect(session.content).not.toContain("## Relations");
  });

  it("removes connected edges when a node is deleted", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 0, y: 0 });
    session.addNode(a);
    session.addNode(b);
    session.addEdge(a.id, b.id);
    session.deleteNode(a.id);

    expect(Object.keys(session.state.edges)).toHaveLength(0);
  });

  it("updates edge direction and line style in state and ## Relations", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 0, y: 0 });
    session.addNode(a);
    session.addNode(b);
    session.addEdge(a.id, b.id);
    const edgeId = Object.keys(session.state.edges)[0];
    session.updateEdge(edgeId, { direction: "both", line: "dotted" });
    const edge = readState(session.content)?.edges[edgeId];

    expect(edge?.direction).toBe("both");
    expect(edge?.style?.line).toBe("dotted");
    expect(session.content).toContain("<->");
  });

  it("sets and clears an edge label in state and ## Relations", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 0, y: 0 });
    session.addNode(a);
    session.addNode(b);
    session.addEdge(a.id, b.id);
    const edgeId = Object.keys(session.state.edges)[0];

    session.updateEdge(edgeId, { label: "depends on" });

    expect(readState(session.content)?.edges[edgeId]?.label).toBe("depends on");
    expect(session.content).toContain(`: depends on <!-- roadmap-edge:id=${edgeId} -->`);

    session.updateEdge(edgeId, { label: "" });

    expect(session.state.edges[edgeId]?.label).toBeUndefined();
    expect(session.content).not.toContain("depends on");
  });

  it("adds a node and a connecting edge atomically, with a floating target by default", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    session.addNode(a);
    const b = createNoteNode("notes/b.md", { x: 50, y: 50 });
    session.addNodeWithEdge(b, a.id, "right", null);
    const edgeId = Object.keys(session.state.edges)[0];

    expect(session.state.nodes[b.id]).toBeDefined();
    expect(session.state.edges[edgeId]?.from.id).toBe(a.id);
    expect(session.state.edges[edgeId]?.to.id).toBe(b.id);
    expect(session.state.edges[edgeId]?.fromSide).toBe("right");
    expect(session.state.edges[edgeId]?.toSide).toBeUndefined();

    session.undo();

    expect(session.state.nodes[b.id]).toBeUndefined();
    expect(Object.keys(session.state.edges)).toHaveLength(0);
  });

  it("toggles an edge endpoint between a fixed side and floating", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 0, y: 0 });
    session.addNode(a);
    session.addNode(b);
    session.addEdge(a.id, b.id, "right", "left");
    const edgeId = Object.keys(session.state.edges)[0];

    session.setEdgeEndpointSide(edgeId, "to", undefined);

    expect(session.state.edges[edgeId]?.toSide).toBeUndefined();
    expect(session.state.edges[edgeId]?.fromSide).toBe("right");

    session.setEdgeEndpointSide(edgeId, "from", "bottom");

    expect(readState(session.content)?.edges[edgeId]?.fromSide).toBe("bottom");

    session.undo();

    expect(session.state.edges[edgeId]?.fromSide).toBe("right");
  });

  it("reverses an edge, swapping endpoints and sides in state and ## Relations", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 0, y: 0 });
    session.addNode(a);
    session.addNode(b);
    session.addEdge(a.id, b.id, "right", "left");
    const edgeId = Object.keys(session.state.edges)[0];
    session.reverseEdge(edgeId);
    const reversed = readState(session.content)?.edges[edgeId];

    expect(reversed?.from.id).toBe(b.id);
    expect(reversed?.to.id).toBe(a.id);
    expect(reversed?.fromSide).toBe("left");
    expect(reversed?.toSide).toBe("right");
    expect(reversed?.direction).toBe("forward");

    session.undo();
    const restored = session.state.edges[edgeId];

    expect(restored?.from.id).toBe(a.id);
    expect(restored?.fromSide).toBe("right");
    expect(restored?.toSide).toBe("left");
  });

  it("drops the source side when reversing a one-sided edge", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 0, y: 0 });
    session.addNode(a);
    session.addNode(b);
    session.addEdge(a.id, b.id, "right", null);
    const edgeId = Object.keys(session.state.edges)[0];
    session.reverseEdge(edgeId);
    const reversed = readState(session.content)?.edges[edgeId];

    expect(reversed?.fromSide).toBeUndefined();
    expect(reversed?.toSide).toBe("right");
  });

  it("undoes and redoes a mutation, restoring state and content", () => {
    const session = newSession();
    const emptyContent = session.content;
    const node = createNoteNode("notes/a.md", { x: 1, y: 2 });
    session.addNode(node);

    expect(session.canUndo).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.state.nodes[node.id]).toBeUndefined();
    expect(session.content).toBe(emptyContent);
    expect(session.canRedo).toBe(true);

    expect(session.redo()).toBe(true);
    expect(session.state.nodes[node.id]).toBeDefined();
  });

  it("undoes a batch delete atomically", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 0, y: 0 });
    session.addNode(a);
    session.addNode(b);
    session.deleteNodes([a.id, b.id]);

    expect(Object.keys(session.state.nodes)).toHaveLength(0);

    session.undo();

    expect(session.state.nodes[a.id]).toBeDefined();
    expect(session.state.nodes[b.id]).toBeDefined();
  });

  it("deletes a node with its edges and restores both in a single undo", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 0, y: 0 });
    session.addNode(a);
    session.addNode(b);
    session.addEdge(a.id, b.id);
    const edgeId = Object.keys(session.state.edges)[0];

    session.deleteElements([a.id], [edgeId]);

    expect(session.state.nodes[a.id]).toBeUndefined();
    expect(Object.keys(session.state.edges)).toHaveLength(0);

    session.undo();

    expect(session.state.nodes[a.id]).toBeDefined();
    expect(session.state.edges[edgeId]).toBeDefined();
    expect(session.canRedo).toBe(true);
  });

  it("adds copied nodes with new ids and offset positions", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 10, y: 20 });
    session.addNode(a);
    const clone = copyNode(a, a.layout.x + 24, a.layout.y + 24);
    session.addNodes([clone]);

    expect(clone.id).not.toBe(a.id);
    expect(session.state.nodes[clone.id]?.layout).toMatchObject({ x: 34, y: 44 });
    expect(session.state.nodes[clone.id]?.source).toEqual(a.source);
    expect(session.content).toContain(`id=${clone.id}`);
  });
});
