import { describe, expect, it } from "vitest";
import {
  copyCluster,
  copyEdge,
  copyNode,
  createAttachmentNode,
  createImageNode,
  createNoteNode,
  createTextNode,
  createUrlNode,
} from "../src/domain/create";
import { DEFAULT_TEXT_ALIGN } from "../src/domain/types";
import { readState } from "../src/state/document";
import { newSession } from "./helpers";

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

  it("adds an image node embedded as a wikilink image in the body", () => {
    const session = newSession();
    const node = createImageNode("assets/diagram.png", { x: 0, y: 0 });

    session.addNode(node);

    expect(session.state.nodes[node.id]?.source).toEqual({
      type: "image",
      file: "assets/diagram.png",
    });
    expect(session.content).toContain("![[assets/diagram.png]]");
    expect(readState(session.content)?.nodes[node.id]?.kind).toBe("image");
  });

  it("writes a node description into the readable body for any kind", () => {
    const session = newSession();
    const node = createNoteNode("notes/a.md", { x: 0, y: 0 });

    session.addNode(node);
    session.updateNodeMeta(node.id, { description: "Why this matters" });

    expect(session.content).toContain("Why this matters");
    expect(session.content.indexOf("Why this matters")).toBeLessThan(session.content.indexOf("%% roadmap:state"));
  });

  it("adds an attachment node rendered as a wikilink in the body", () => {
    const session = newSession();
    const node = createAttachmentNode("files/report.pdf", { x: 0, y: 0 });

    session.addNode(node);

    expect(session.state.nodes[node.id]?.source).toEqual({
      type: "attachment",
      file: "files/report.pdf",
    });
    expect(session.content).toContain("[[files/report.pdf|report.pdf]]");
    expect(readState(session.content)?.nodes[node.id]?.kind).toBe("attachment");
  });

  it("adds an inline text node with its text in the readable body and state", () => {
    const session = newSession();
    const node = createTextNode("Free-form note", { x: 0, y: 0 });

    session.addNode(node);

    expect(session.content).toContain("Free-form note");
    expect(readState(session.content)?.nodes[node.id]?.kind).toBe("text");
    expect(readState(session.content)?.nodes[node.id]?.title).toBe("Free-form note");
    expect(session.content).not.toContain(`- [ ] Free-form note`);
  });

  it("writes image node title and description into the readable body", () => {
    const session = newSession();
    const node = createImageNode("assets/diagram.png", { x: 0, y: 0 });

    session.addNode(node);
    session.updateNodeMeta(node.id, { title: "My diagram", description: "A flow chart" });

    expect(session.content).toContain("**My diagram**");
    expect(session.content).toContain("A flow chart");
    expect(session.content).toContain("![[assets/diagram.png]]");
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

  it("sets text alignment per axis, merging with the default and mirroring marker attrs", () => {
    const session = newSession();
    const node = createNoteNode("notes/a.md", { x: 0, y: 0 });

    session.addNode(node);

    session.setNodeAlign(node.id, { h: "right" });

    expect(session.state.nodes[node.id]?.align).toEqual({ h: "right", v: DEFAULT_TEXT_ALIGN.v });

    session.setNodeAlign(node.id, { v: "bottom" });

    expect(session.state.nodes[node.id]?.align).toEqual({ h: "right", v: "bottom" });
    expect(session.content).toContain(`id=${node.id} type=note ah=right av=bottom -->`);
    expect(readState(session.content)?.nodes[node.id]?.align).toEqual({ h: "right", v: "bottom" });
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

  it("sets and clears node color in state and the marker attrs", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });

    session.addNode(a);

    session.updateNodeMeta(a.id, { color: "var(--color-red)" });

    expect(session.state.nodes[a.id]?.style?.color).toBe("var(--color-red)");
    expect(session.content).toContain(`id=${a.id} type=note color=var(--color-red) -->`);

    session.updateNodeMeta(a.id, { color: null });

    expect(session.state.nodes[a.id]?.style?.color).toBeUndefined();
    expect(session.content).toContain(`id=${a.id} type=note -->`);
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

  it("adds nodes together with copied edges in a single undo step", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 200, y: 0 });

    session.addNodes([a, b]);
    session.addEdge(a.id, b.id, "right", "left");
    const original = Object.values(session.state.edges)[0];

    session.updateEdge(original.id, { label: "depends", line: "dashed" });
    const source = session.state.edges[original.id];
    const aCopy = copyNode(a, 24, 24);
    const bCopy = copyNode(b, 224, 24);
    const edgeCopy = copyEdge(source, { type: "node", id: aCopy.id }, { type: "node", id: bCopy.id });

    session.addNodes([aCopy, bCopy], [edgeCopy]);

    const persisted = readState(session.content)?.edges[edgeCopy.id];

    expect(persisted?.from.id).toBe(aCopy.id);
    expect(persisted?.to.id).toBe(bCopy.id);
    expect(persisted?.label).toBe("depends");
    expect(persisted?.style?.line).toBe("dashed");
    expect(persisted?.fromSide).toBe("right");
    expect(session.content).toContain(`roadmap-edge:id=${edgeCopy.id}`);

    session.undo();

    expect(session.state.nodes[aCopy.id]).toBeUndefined();
    expect(session.state.edges[edgeCopy.id]).toBeUndefined();
    expect(session.state.edges[original.id]).toBeDefined();
  });

  it("adds a copied cluster with members, suffixing a taken title, in a single undo step", () => {
    const session = newSession();
    const original = createNoteNode("notes/a.md", { x: 100, y: 100 });

    session.addNode(original);
    session.createClusterFromNodes([original.id], "Group");

    const cluster = Object.values(session.state.clusters)[0];
    const member = session.state.nodes[original.id];
    const clusterClone = copyCluster(cluster, cluster.layout.x + 24, cluster.layout.y + 24);
    const memberClone = copyNode(member, member.layout.x, member.layout.y);

    memberClone.clusterId = clusterClone.id;
    session.addNodes([memberClone], [], [clusterClone]);

    expect(session.state.clusters[clusterClone.id]?.title).toBe("Group 2");
    expect(session.state.nodes[memberClone.id]?.clusterId).toBe(clusterClone.id);
    expect(session.state.nodes[memberClone.id]?.layout).toEqual(member.layout);
    expect(readState(session.content)?.clusters[clusterClone.id]?.title).toBe("Group 2");

    const headingAt = session.content.indexOf(`roadmap-cluster:id=${clusterClone.id}`);
    const memberAt = session.content.indexOf(`roadmap-node:id=${memberClone.id}`);

    expect(headingAt).toBeGreaterThan(-1);
    expect(memberAt).toBeGreaterThan(headingAt);

    session.undo();

    expect(session.state.clusters[clusterClone.id]).toBeUndefined();
    expect(session.state.nodes[memberClone.id]).toBeUndefined();
    expect(session.state.clusters[cluster.id]).toBeDefined();
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

  it("sets and clears an edge color in state and the relations marker", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 0, y: 0 });

    session.addNode(a);
    session.addNode(b);
    session.addEdge(a.id, b.id);
    const edgeId = Object.keys(session.state.edges)[0];

    session.updateEdge(edgeId, { color: "var(--color-green)" });

    expect(session.state.edges[edgeId]?.style?.color).toBe("var(--color-green)");
    expect(readState(session.content)?.edges[edgeId]?.style?.color).toBe("var(--color-green)");
    expect(session.content).toContain("color=var(--color-green)");

    session.updateEdge(edgeId, { color: null });

    expect(session.state.edges[edgeId]?.style?.color).toBeUndefined();
    expect(session.content).not.toContain("color=var(--color-green)");
  });

  it("sets and clears the edge shape in state and the relations marker", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 0, y: 0 });

    session.addNode(a);
    session.addNode(b);
    session.addEdge(a.id, b.id);
    const edgeId = Object.keys(session.state.edges)[0];

    session.updateEdge(edgeId, { shape: "step" });

    expect(session.state.edges[edgeId]?.style?.shape).toBe("step");
    expect(readState(session.content)?.edges[edgeId]?.style?.shape).toBe("step");
    expect(session.content).toContain("shape=step");

    session.updateEdge(edgeId, { shape: "curved" });

    expect(session.state.edges[edgeId]?.style?.shape).toBeUndefined();
    expect(session.content).not.toContain("shape=");
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

  it("reconnects an edge end to another node, updating state and ## Relations", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 0, y: 0 });
    const c = createNoteNode("notes/c.md", { x: 0, y: 0 });

    session.addNode(a);
    session.addNode(b);
    session.addNode(c);
    session.addEdge(a.id, b.id, "right", "left");
    const edgeId = Object.keys(session.state.edges)[0];

    session.reconnectEdge(edgeId, { source: a.id, target: c.id, sourceHandle: "right", targetHandle: "top" });
    const edge = readState(session.content)?.edges[edgeId];

    expect(edge?.to.id).toBe(c.id);
    expect(edge?.toSide).toBe("top");
    expect(session.content).toContain(`-> [[notes/c|c]] <!-- roadmap-edge:id=${edgeId}`);
    expect(session.content).not.toContain("-> [[notes/b|b]]");

    session.undo();

    expect(session.state.edges[edgeId]?.to.id).toBe(b.id);
    expect(session.state.edges[edgeId]?.toSide).toBe("left");
  });

  it("ignores moves that do not change coordinates", () => {
    const session = newSession();
    const node = createNoteNode("notes/a.md", { x: 10, y: 20 });

    session.addNode(node);
    const before = session.state;

    session.moveNodes([{ id: node.id, x: 10, y: 20 }]);

    expect(session.state).toBe(before);
    expect(session.canRedo).toBe(false);
    session.undo();
    expect(session.state.nodes[node.id]).toBeUndefined();
  });

  it("floats a reconnected end when the new handle is null", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 0, y: 0 });

    session.addNode(a);
    session.addNode(b);
    session.addEdge(a.id, b.id, "right", "left");
    const edgeId = Object.keys(session.state.edges)[0];

    session.reconnectEdge(edgeId, { source: a.id, target: b.id, sourceHandle: "bottom", targetHandle: null });

    expect(session.state.edges[edgeId]?.fromSide).toBe("bottom");
    expect(session.state.edges[edgeId]?.toSide).toBeUndefined();
  });

  it("ignores a reconnect that would duplicate another edge or form a self-loop", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 0, y: 0 });
    const c = createNoteNode("notes/c.md", { x: 0, y: 0 });

    session.addNode(a);
    session.addNode(b);
    session.addNode(c);
    session.addEdge(a.id, b.id);
    session.addEdge(a.id, c.id);
    const [firstId] = Object.keys(session.state.edges);
    const before = session.content;

    session.reconnectEdge(firstId, { source: a.id, target: c.id, sourceHandle: null, targetHandle: null });
    session.reconnectEdge(firstId, { source: a.id, target: a.id, sourceHandle: null, targetHandle: null });

    expect(session.state.edges[firstId]?.to.id).toBe(b.id);
    expect(session.content).toBe(before);
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

describe("bulk node mutations", () => {
  it("applies one meta patch to the whole set as a single undo step", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 300, y: 0 });

    session.addNode(a);
    session.addNode(b);
    session.updateNodesMeta([a.id, b.id], { status: "done", color: "var(--color-green)" });

    expect(session.state.nodes[a.id]?.status).toBe("done");
    expect(session.state.nodes[b.id]?.status).toBe("done");
    expect(session.state.nodes[b.id]?.style?.color).toBe("var(--color-green)");
    expect(session.content).toContain("#done");
    expect(readState(session.content)?.nodes[a.id]?.status).toBe("done");

    session.undo();

    expect(session.state.nodes[a.id]?.status).toBeUndefined();
    expect(session.state.nodes[b.id]?.status).toBeUndefined();
  });

  it("aligns the whole set and skips missing or unchanged nodes", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
    const b = createNoteNode("notes/b.md", { x: 300, y: 0 });

    session.addNode(a);
    session.addNode(b);
    session.setNodeAlign(a.id, { h: "right" });
    const before = session.state;

    session.setNodesAlign([a.id, b.id, "ghost"], { h: "right" });

    expect(session.state.nodes[a.id]?.align).toEqual({ h: "right", v: DEFAULT_TEXT_ALIGN.v });
    expect(session.state.nodes[b.id]?.align).toEqual({ h: "right", v: DEFAULT_TEXT_ALIGN.v });
    expect(session.state.nodes[a.id]).toBe(before.nodes[a.id]);
  });

  it("is a no-op commit when nothing effectively changes", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });

    session.addNode(a);
    session.updateNodeMeta(a.id, { status: "done" });
    const before = session.state;

    session.updateNodesMeta([a.id], { status: "done" });

    expect(session.state).toBe(before);
  });
});

describe("live color gesture", () => {
  it("collapses history-less preview ticks into a single undo step", () => {
    const session = newSession();
    const a = createNoteNode("notes/a.md", { x: 0, y: 0 });

    session.addNode(a);
    session.updateNodesMeta([a.id], { color: "#112233" }, { history: true });
    session.updateNodesMeta([a.id], { color: "#445566" }, { history: false });
    session.updateNodesMeta([a.id], { color: "#778899" }, { history: false });

    expect(session.state.nodes[a.id]?.style?.color).toBe("#778899");

    session.undo();

    expect(session.state.nodes[a.id]?.style?.color).toBeUndefined();
  });
});
