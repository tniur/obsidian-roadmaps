import { describe, expect, it } from "vitest";
import { createNoteNode } from "../src/domain/create";
import { createRoadmapDocument, readState } from "../src/state/document";
import { RoadmapSession } from "../src/state/session";
import { reconcileFlowEdges, reconcileFlowNodes, stateToFlowEdges, stateToFlowNodes } from "../src/view/flow";

function sessionWithNodes(): { session: RoadmapSession; ids: string[] } {
  const content = createRoadmapDocument("Board");
  const state = readState(content);

  if (state === null) {
    throw new Error("expected a state block");
  }

  const session = new RoadmapSession(state, content);
  const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
  const b = createNoteNode("notes/b.md", { x: 300, y: 0 });

  session.addNodes([a, b]);

  return { session, ids: [a.id, b.id] };
}

describe("identity-preserving flow reconcile", () => {
  it("keeps untouched node objects by reference when another node moves", () => {
    const { session, ids } = sessionWithNodes();
    const before = stateToFlowNodes(session.state);

    session.moveNode(ids[0], 50, 60);
    const after = reconcileFlowNodes(before, stateToFlowNodes(session.state));
    const movedBefore = before.find((node) => node.id === ids[0]);
    const movedAfter = after.find((node) => node.id === ids[0]);
    const otherBefore = before.find((node) => node.id === ids[1]);
    const otherAfter = after.find((node) => node.id === ids[1]);

    expect(movedAfter).not.toBe(movedBefore);
    expect(movedAfter?.position).toEqual({ x: 50, y: 60 });
    expect(otherAfter).toBe(otherBefore);
  });

  it("replaces a node object when its card content changes", () => {
    const { session, ids } = sessionWithNodes();
    const before = stateToFlowNodes(session.state);

    session.updateNodeMeta(ids[0], { status: "done" });
    const after = reconcileFlowNodes(before, stateToFlowNodes(session.state));
    const changed = after.find((node) => node.id === ids[0]);

    expect(changed).not.toBe(before.find((node) => node.id === ids[0]));
    expect(changed?.data.status).toBe("done");
  });

  it("keeps untouched edges by reference and preserves selection on changed ones", () => {
    const { session, ids } = sessionWithNodes();
    const c = createNoteNode("notes/c.md", { x: 600, y: 0 });

    session.addNode(c);
    session.addEdge(ids[0], ids[1]);
    session.addEdge(ids[1], c.id);
    const [first, second] = stateToFlowEdges(session.state);
    const current = [first, { ...second, selected: true }];

    session.updateEdge(second.id, { label: "dep" });
    const after = reconcileFlowEdges(current, stateToFlowEdges(session.state));
    const firstAfter = after.find((edge) => edge.id === first.id);
    const secondAfter = after.find((edge) => edge.id === second.id);

    expect(firstAfter).toBe(first);
    expect(secondAfter).not.toBe(second);
    expect(secondAfter?.data?.label).toBe("dep");
    expect(secondAfter?.selected).toBe(true);
  });

  it("keeps every element by reference when nothing changed", () => {
    const { session } = sessionWithNodes();
    const nodes = stateToFlowNodes(session.state);
    const edges = stateToFlowEdges(session.state);
    const nodesAfter = reconcileFlowNodes(nodes, stateToFlowNodes(session.state));
    const edgesAfter = reconcileFlowEdges(edges, stateToFlowEdges(session.state));

    nodesAfter.forEach((node, index) => expect(node).toBe(nodes[index]));
    edgesAfter.forEach((edge, index) => expect(edge).toBe(edges[index]));
  });
});
