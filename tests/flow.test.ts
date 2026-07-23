import { describe, expect, it } from "vitest";
import { createAttachmentNode, createImageNode, createNoteNode, createUrlNode } from "../src/domain/create";
import type { RoadmapNode } from "../src/domain/types";
import { RoadmapSession } from "../src/state/session";
import { newSession } from "./helpers";
import {
  absoluteNodePosition,
  isCardNode,
  normalizeClusterSelection,
  pointOverVisibleNode,
  reconcileFlowEdges,
  reconcileFlowNodes,
  stateToFlowEdges,
  stateToFlowNodes,
} from "../src/view/flow";

function sessionWithNodes(): { session: RoadmapSession; ids: string[] } {
  const session = newSession();
  const a = createNoteNode("notes/a.md", { x: 0, y: 0 });
  const b = createNoteNode("notes/b.md", { x: 300, y: 0 });

  session.addNodes([a, b]);

  return { session, ids: [a.id, b.id] };
}

describe("cluster selection normalization", () => {
  it("deselects members when their cluster is selected, leaving others alone", () => {
    const { session, ids } = sessionWithNodes();

    session.createClusterFromNodes([ids[0]], "Group");
    const flow = stateToFlowNodes(session.state).map((node) => ({ ...node, selected: true }));
    const normalized = normalizeClusterSelection(flow);
    const member = normalized.find((node) => node.id === ids[0]);
    const outside = normalized.find((node) => node.id === ids[1]);
    const cluster = normalized.find((node) => !isCardNode(node));

    expect(cluster?.selected).toBe(true);
    expect(member?.selected).toBe(false);
    expect(outside?.selected).toBe(true);
  });

  it("returns the same array when no cluster is selected", () => {
    const { session } = sessionWithNodes();
    const flow = stateToFlowNodes(session.state).map((node) => ({ ...node, selected: true }));

    expect(normalizeClusterSelection(flow)).toBe(flow);
  });
});

describe("visible-node hit test", () => {
  it("ignores hidden collapsed members, still detecting visible nodes", () => {
    const { session, ids } = sessionWithNodes();
    const flow = stateToFlowNodes(session.state).map((node) => (node.id === ids[0] ? { ...node, hidden: true } : node));

    expect(pointOverVisibleNode(flow, { x: 10, y: 10 })).toBe(false);
    expect(pointOverVisibleNode(flow, { x: 310, y: 10 })).toBe(true);
  });

  it("tests cluster members at their absolute position, not the cluster-relative one", () => {
    const { session, ids } = sessionWithNodes();

    session.createClusterFromNodes([ids[0]], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];

    session.moveClusters([{ id: clusterId, x: 500, y: 500 }]);
    const flow = stateToFlowNodes(session.state);
    const member = flow.find((node) => node.id === ids[0]);

    if (member === undefined) {
      throw new Error("expected the clustered member in the flow list");
    }

    const absolute = absoluteNodePosition(member, flow);

    expect(pointOverVisibleNode(flow, { x: absolute.x + 5, y: absolute.y + 5 })).toBe(true);
    expect(pointOverVisibleNode(flow, { x: member.position.x + 5, y: member.position.y + 5 })).toBe(false);
  });
});

describe("card secondary line", () => {
  it("shows the schemeless address or file name, hiding a repeat of the title", () => {
    const { session } = sessionWithNodes();
    const url = createUrlNode("https://figma.com/file/1", { x: 0, y: 200 });
    const bareUrl = createUrlNode("https://figma.com", { x: 0, y: 300 });
    const attachment = createAttachmentNode("files/spec-v2.pdf", { x: 0, y: 400 });

    session.addNodes([url, bareUrl, attachment]);
    session.updateNodeMeta(attachment.id, { title: "Product spec" });
    const flow = stateToFlowNodes(session.state).filter(isCardNode);

    expect(flow.find((node) => node.id === url.id)?.data.secondary).toBe("figma.com/file/1");
    expect(flow.find((node) => node.id === bareUrl.id)?.data.secondary).toBeUndefined();
    expect(flow.find((node) => node.id === attachment.id)?.data.secondary).toBe("spec-v2.pdf");

    session.updateNodeMeta(attachment.id, { title: null });
    const untitled = stateToFlowNodes(session.state).filter(isCardNode);

    expect(untitled.find((node) => node.id === attachment.id)?.data.secondary).toBeUndefined();
  });

  it("stays undefined for note nodes regardless of title", () => {
    const { session, ids } = sessionWithNodes();

    session.updateNodeMeta(ids[0], { title: "Renamed" });
    const flow = stateToFlowNodes(session.state).filter(isCardNode);

    expect(flow.find((node) => node.id === ids[0])?.data.secondary).toBeUndefined();
  });
});

describe("cluster member count", () => {
  it("counts members and reports 0 for an emptied cluster", () => {
    const { session, ids } = sessionWithNodes();

    session.createClusterFromNodes([ids[0], ids[1]], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];
    const grouped = stateToFlowNodes(session.state).find((node) => node.id === clusterId);

    expect(grouped !== undefined && !isCardNode(grouped) && grouped.data.count).toBe(2);

    session.setNodesCluster([
      { id: ids[0], clusterId: null, x: 0, y: 0 },
      { id: ids[1], clusterId: null, x: 300, y: 0 },
    ]);
    const emptied = stateToFlowNodes(session.state).find((node) => node.id === clusterId);

    expect(emptied !== undefined && !isCardNode(emptied) && emptied.data.count).toBe(0);
  });
});

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
    const changed = after.filter(isCardNode).find((node) => node.id === ids[0]);

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

describe("image card render stability", () => {
  function twoImages(): { session: RoadmapSession; a: string; b: string } {
    const session = newSession();
    const a = createImageNode("assets/a.png", { x: 0, y: 0 });
    const b = createImageNode("assets/b.png", { x: 300, y: 0 });

    session.addNodes([a, b]);

    return { session, a: a.id, b: b.id };
  }

  it("keeps an untouched image card by reference when another node moves, given a stable src", () => {
    const { session, a, b } = twoImages();
    const srcByFile: Record<string, string> = { "assets/a.png": "app://x/a?1", "assets/b.png": "app://x/b?1" };
    const stableSrc = (node: RoadmapNode): string | null =>
      node.source.type === "image" ? srcByFile[node.source.file] : null;
    const before = stateToFlowNodes(session.state, undefined, stableSrc);

    session.moveNode(b, 50, 60);
    const after = reconcileFlowNodes(before, stateToFlowNodes(session.state, undefined, stableSrc));

    expect(after.find((node) => node.id === a)).toBe(before.find((node) => node.id === a));
  });

  it("re-creates the untouched card when the resolver hands back a fresh src each call", () => {
    const { session, a, b } = twoImages();
    let tick = 0;
    const volatileSrc = (node: RoadmapNode): string | null =>
      node.source.type === "image" ? `app://x/${node.source.file}?${tick++}` : null;
    const before = stateToFlowNodes(session.state, undefined, volatileSrc);

    session.moveNode(b, 50, 60);
    const after = reconcileFlowNodes(before, stateToFlowNodes(session.state, undefined, volatileSrc));

    expect(after.find((node) => node.id === a)).not.toBe(before.find((node) => node.id === a));
  });
});
