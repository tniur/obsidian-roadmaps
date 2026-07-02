import { describe, expect, it } from "vitest";
import { createCluster } from "../src/domain/create";
import type { RoadmapCluster, RoadmapNode } from "../src/domain/types";
import { parseClusterHeading } from "../src/markdown/cluster";
import {
  createRoadmapDocument,
  emptyState,
  insertNodeBlock,
  readState,
  writeClusterSection,
  writeState,
} from "../src/state/document";
import { reconcileState } from "../src/state/reconcile";
import { RoadmapSession } from "../src/state/session";
import { stateToFlowEdges } from "../src/view/flow";

function sessionWithTwoNodes(): RoadmapSession {
  const doc = createRoadmapDocument("R");
  const base = readState(doc);

  if (base === null) {
    throw new Error("expected a state block");
  }

  const n1: RoadmapNode = {
    id: "n1",
    kind: "note",
    source: { type: "note", file: "notes/a.md" },
    layout: { x: 100, y: 100, width: 200, height: 80 },
  };
  const n2: RoadmapNode = {
    id: "n2",
    kind: "note",
    source: { type: "note", file: "notes/b.md" },
    layout: { x: 400, y: 300, width: 200, height: 80 },
  };
  const content = writeState(insertNodeBlock(insertNodeBlock(doc, n1), n2), {
    ...base,
    nodes: { n1, n2 },
  });

  return new RoadmapSession(readState(content) ?? emptyState(), content);
}

const nodeA: RoadmapNode = {
  id: "a",
  kind: "note",
  source: { type: "note", file: "notes/a.md" },
  layout: { x: 0, y: 0, width: 200, height: 80 },
};

const nodeB: RoadmapNode = {
  id: "b",
  kind: "note",
  source: { type: "note", file: "notes/b.md" },
  layout: { x: 0, y: 0, width: 200, height: 80 },
};

function docWithNodes(): string {
  const doc = insertNodeBlock(insertNodeBlock(createRoadmapDocument("R"), nodeA), nodeB);
  const base = readState(doc);

  if (base === null) {
    throw new Error("expected a state block");
  }

  return writeState(doc, { ...base, nodes: { a: nodeA, b: nodeB } });
}

describe("clusters storage", () => {
  it("parses a `## ` heading into a cluster id and title", () => {
    const parsed = parseClusterHeading("## Basics <!-- roadmap-cluster:id=c2 -->");

    expect(parsed).toEqual({ id: "c2", title: "Basics" });
  });

  it("groups a node under a cluster heading and reconciles membership", () => {
    const cluster = createCluster("Group A", { x: 0, y: 0, width: 400, height: 300 });
    const content = writeClusterSection(docWithNodes(), cluster, ["a"]);

    expect(content).toContain(`roadmap-cluster:id=${cluster.id}`);
    expect(content).toContain("## Group A");

    const reconciled = reconcileState(readState(content) ?? emptyState(), content);

    expect(reconciled.clusters[cluster.id]).toBeDefined();
    expect(reconciled.nodes.a?.clusterId).toBe(cluster.id);
    expect(reconciled.nodes.b?.clusterId ?? null).toBeNull();
  });

  it("excludes reserved sections even when a cluster marker is present", () => {
    const cluster = createCluster("Temp", { x: 0, y: 0, width: 400, height: 300 });
    const content = writeClusterSection(docWithNodes(), cluster, ["a"]).replace("## Temp", "## Archive");
    const reconciled = reconcileState(readState(content) ?? emptyState(), content);

    expect(reconciled.clusters[cluster.id]).toBeUndefined();
    expect(reconciled.nodes.a?.clusterId ?? null).toBeNull();
  });

  it("drops a state cluster whose heading is gone from the body", () => {
    const orphan: RoadmapCluster = {
      id: "c1",
      title: "Gone",
      layout: { x: 0, y: 0, width: 400, height: 300 },
    };
    const doc = docWithNodes();
    const base = readState(doc);

    if (base === null) {
      throw new Error("expected a state block");
    }

    const content = writeState(doc, { ...base, clusters: { c1: orphan } });
    const reconciled = reconcileState(readState(content) ?? emptyState(), content);

    expect(reconciled.clusters.c1).toBeUndefined();
  });

  it("groups nodes into a cluster with bounding box and relative member layouts", () => {
    const doc = createRoadmapDocument("R");
    const base = readState(doc);

    if (base === null) {
      throw new Error("expected a state block");
    }

    const n1: RoadmapNode = {
      id: "n1",
      kind: "note",
      source: { type: "note", file: "notes/a.md" },
      layout: { x: 100, y: 100, width: 200, height: 80 },
    };
    const n2: RoadmapNode = {
      id: "n2",
      kind: "note",
      source: { type: "note", file: "notes/b.md" },
      layout: { x: 400, y: 300, width: 200, height: 80 },
    };
    let content = insertNodeBlock(insertNodeBlock(doc, n1), n2);

    content = writeState(content, { ...base, nodes: { n1, n2 } });
    const session = new RoadmapSession(readState(content) ?? emptyState(), content);

    session.createClusterFromNodes(["n1", "n2"], "Group");

    const clusterId = Object.keys(session.state.clusters)[0];

    expect(session.state.clusters[clusterId]?.layout).toEqual({
      x: 68,
      y: 68,
      width: 564,
      height: 344,
    });
    expect(session.state.nodes.n1?.clusterId).toBe(clusterId);
    expect(session.state.nodes.n1?.layout.x).toBe(32);
    expect(session.state.nodes.n2?.layout.x).toBe(332);
    expect(session.content).toContain("## Group");

    const reconciled = reconcileState(readState(session.content) ?? emptyState(), session.content);

    expect(reconciled.nodes.n1?.clusterId).toBe(clusterId);
    expect(reconciled.nodes.n2?.clusterId).toBe(clusterId);
  });

  it("moves and resizes a cluster, persisting only its layout", () => {
    const doc = createRoadmapDocument("R");
    const base = readState(doc);

    if (base === null) {
      throw new Error("expected a state block");
    }

    const n1: RoadmapNode = {
      id: "n1",
      kind: "note",
      source: { type: "note", file: "notes/a.md" },
      layout: { x: 100, y: 100, width: 200, height: 80 },
    };
    let content = insertNodeBlock(doc, n1);

    content = writeState(content, { ...base, nodes: { n1 } });
    const session = new RoadmapSession(readState(content) ?? emptyState(), content);

    session.createClusterFromNodes(["n1"], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];
    const relX = session.state.nodes.n1?.layout.x;

    session.moveClusters([{ id: clusterId, x: 500, y: 400 }]);
    expect(session.state.clusters[clusterId]?.layout.x).toBe(500);
    expect(session.state.clusters[clusterId]?.layout.y).toBe(400);
    expect(session.state.nodes.n1?.layout.x).toBe(relX);

    session.resizeCluster(clusterId, 700, 500, 500, 400);
    expect(session.state.clusters[clusterId]?.layout).toEqual({
      x: 500,
      y: 400,
      width: 700,
      height: 500,
    });
    expect(session.state.nodes.n1?.layout.x).toBe(relX);
  });

  it("toggles cluster collapsed in state and round-trips through the codec", () => {
    const doc = createRoadmapDocument("R");
    const base = readState(doc);

    if (base === null) {
      throw new Error("expected a state block");
    }

    const n1: RoadmapNode = {
      id: "n1",
      kind: "note",
      source: { type: "note", file: "notes/a.md" },
      layout: { x: 0, y: 0, width: 200, height: 80 },
    };
    let content = insertNodeBlock(doc, n1);

    content = writeState(content, { ...base, nodes: { n1 } });
    const session = new RoadmapSession(readState(content) ?? emptyState(), content);

    session.createClusterFromNodes(["n1"], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];

    session.toggleClusterCollapsed(clusterId);
    expect(session.state.clusters[clusterId]?.collapsed).toBe(true);
    expect(readState(session.content)?.clusters[clusterId]?.collapsed).toBe(true);

    session.toggleClusterCollapsed(clusterId);
    expect(session.state.clusters[clusterId]?.collapsed).toBeUndefined();
    expect(readState(session.content)?.clusters[clusterId]?.collapsed).toBeUndefined();
  });

  it("creates a cluster↔node edge with a heading link in Relations", () => {
    const session = sessionWithTwoNodes();

    session.createClusterFromNodes(["n1"], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];

    session.addEdge(clusterId, "n2");

    const edge = Object.values(session.state.edges)[0];

    expect(edge?.from).toEqual({ type: "cluster", id: clusterId });
    expect(edge?.to).toEqual({ type: "node", id: "n2" });
    expect(session.content).toContain("[[#Group]]");

    const flowEdges = stateToFlowEdges(session.state);

    expect(flowEdges).toHaveLength(1);
    expect(flowEdges[0]?.source).toBe(clusterId);
    expect(flowEdges[0]?.target).toBe("n2");
  });

  it("forbids direct edges inside one cluster (node↔node and node↔own cluster)", () => {
    const session = sessionWithTwoNodes();

    session.createClusterFromNodes(["n1", "n2"], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];

    session.addEdge("n1", "n2");
    expect(Object.keys(session.state.edges)).toHaveLength(0);

    session.addEdge("n1", clusterId);
    expect(Object.keys(session.state.edges)).toHaveLength(0);
  });

  it("ignores a reconnect that would land inside one cluster", () => {
    const session = sessionWithTwoNodes();

    session.addEdge("n1", "n2");
    session.createClusterFromNodes(["n2"], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];
    const edgeId = Object.keys(session.state.edges)[0];

    session.reconnectEdge(edgeId, { source: "n2", target: clusterId, sourceHandle: null, targetHandle: null });

    expect(session.state.edges[edgeId]?.from.id).toBe("n1");
    expect(session.state.edges[edgeId]?.to.id).toBe("n2");
  });

  it("dissolves a cluster, keeping nodes as unclustered with absolute layout", () => {
    const session = sessionWithTwoNodes();

    session.createClusterFromNodes(["n1"], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];

    session.addEdge(clusterId, "n2");
    expect(Object.keys(session.state.edges)).toHaveLength(1);

    session.dissolveCluster(clusterId);

    expect(session.state.clusters[clusterId]).toBeUndefined();
    expect(session.state.nodes.n1?.clusterId ?? null).toBeNull();
    expect(session.state.nodes.n1?.layout).toEqual({ x: 100, y: 100, width: 200, height: 80 });
    expect(Object.keys(session.state.edges)).toHaveLength(0);
    expect(session.content).not.toContain("## Group");
    expect(session.content).toContain("[[notes/a|a]]");

    const reconciled = reconcileState(readState(session.content) ?? emptyState(), session.content);

    expect(reconciled.nodes.n1?.clusterId ?? null).toBeNull();
    expect(reconciled.clusters[clusterId]).toBeUndefined();
  });

  it("deletes a cluster and its member nodes, keeping outside nodes", () => {
    const session = sessionWithTwoNodes();

    session.createClusterFromNodes(["n1"], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];

    session.addEdge("n1", "n2");
    expect(Object.keys(session.state.edges)).toHaveLength(1);

    session.deleteClusterAndNodes(clusterId);

    expect(session.state.clusters[clusterId]).toBeUndefined();
    expect(session.state.nodes.n1).toBeUndefined();
    expect(session.state.nodes.n2).toBeDefined();
    expect(Object.keys(session.state.edges)).toHaveLength(0);
    expect(session.content).not.toContain("## Group");
    expect(session.content).not.toContain("[[notes/a|a]]");
    expect(session.content).toContain("[[notes/b|b]]");
  });

  it("arranges member nodes into a grid inside the cluster", () => {
    const session = sessionWithTwoNodes();

    session.createClusterFromNodes(["n1", "n2"], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];

    const before = session.state.clusters[clusterId]?.layout.width ?? 0;

    session.arrangeCluster(clusterId);

    expect(session.state.nodes.n1?.layout).toMatchObject({ x: 32, y: 40 });
    expect(session.state.nodes.n2?.layout).toMatchObject({ x: 256, y: 40 });
    expect(session.state.nodes.n1?.clusterId).toBe(clusterId);
    expect(session.state.nodes.n2?.clusterId).toBe(clusterId);
    // exact fit: 2 columns of 200 + gap 24 + 2*pad 32, shrinks from the bbox width
    expect(session.state.clusters[clusterId]?.layout).toMatchObject({ width: 488, height: 152 });
    expect(session.state.clusters[clusterId]?.layout.width).toBeLessThan(before);
  });

  it("centers an incomplete last row when arranging", () => {
    const doc = createRoadmapDocument("R");
    const base = readState(doc);

    if (base === null) {
      throw new Error("expected a state block");
    }

    const mk = (id: string, x: number, y: number): RoadmapNode => ({
      id,
      kind: "note",
      source: { type: "note", file: `notes/${id}.md` },
      layout: { x, y, width: 200, height: 80 },
    });
    const n1 = mk("n1", 100, 100);
    const n2 = mk("n2", 400, 100);
    const n3 = mk("n3", 100, 300);
    const content = writeState(insertNodeBlock(insertNodeBlock(insertNodeBlock(doc, n1), n2), n3), {
      ...base,
      nodes: { n1, n2, n3 },
    });
    const session = new RoadmapSession(readState(content) ?? emptyState(), content);

    session.createClusterFromNodes(["n1", "n2", "n3"], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];

    session.arrangeCluster(clusterId);

    expect(session.state.nodes.n1?.layout).toMatchObject({ x: 32, y: 40 });
    expect(session.state.nodes.n2?.layout).toMatchObject({ x: 256, y: 40 });
    expect(session.state.nodes.n3?.layout).toMatchObject({ x: 144, y: 144 });
  });

  it("centers a smaller node within its grid cell when arranging", () => {
    const doc = createRoadmapDocument("R");
    const base = readState(doc);

    if (base === null) {
      throw new Error("expected a state block");
    }

    const big: RoadmapNode = {
      id: "big",
      kind: "note",
      source: { type: "note", file: "notes/big.md" },
      layout: { x: 0, y: 0, width: 200, height: 80 },
    };
    const small: RoadmapNode = {
      id: "small",
      kind: "note",
      source: { type: "note", file: "notes/small.md" },
      layout: { x: 0, y: 200, width: 100, height: 40 },
    };
    const content = writeState(insertNodeBlock(insertNodeBlock(doc, big), small), {
      ...base,
      nodes: { big, small },
    });
    const session = new RoadmapSession(readState(content) ?? emptyState(), content);

    session.createClusterFromNodes(["big", "small"], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];

    session.arrangeCluster(clusterId);

    // single column (cell 200x80); the smaller node is centered in its cell
    expect(session.state.nodes.big?.layout).toMatchObject({ x: 32, y: 40, width: 200, height: 80 });
    expect(session.state.nodes.small?.layout).toMatchObject({
      x: 82,
      y: 164,
      width: 100,
      height: 40,
    });
  });

  it("moves a node into a cluster by coordinates (relative layout, body under heading)", () => {
    const session = sessionWithTwoNodes();

    session.createClusterFromNodes(["n1"], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];
    const cluster = session.state.clusters[clusterId];
    const absX = (cluster?.layout.x ?? 0) + 40;
    const absY = (cluster?.layout.y ?? 0) + 50;

    session.setNodesCluster([{ id: "n2", clusterId, x: absX, y: absY }]);

    expect(session.state.nodes.n2?.clusterId).toBe(clusterId);
    expect(session.state.nodes.n2?.layout).toMatchObject({ x: 40, y: 50 });

    const reconciled = reconcileState(readState(session.content) ?? emptyState(), session.content);

    expect(reconciled.nodes.n2?.clusterId).toBe(clusterId);
  });

  it("moves a node out of a cluster by coordinates (absolute layout, unclustered)", () => {
    const session = sessionWithTwoNodes();

    session.createClusterFromNodes(["n1", "n2"], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];

    session.setNodesCluster([{ id: "n1", clusterId: null, x: 800, y: 800 }]);

    expect(session.state.nodes.n1?.clusterId ?? null).toBeNull();
    expect(session.state.nodes.n1?.layout).toMatchObject({ x: 800, y: 800 });

    const reconciled = reconcileState(readState(session.content) ?? emptyState(), session.content);

    expect(reconciled.nodes.n1?.clusterId ?? null).toBeNull();
    expect(reconciled.nodes.n2?.clusterId).toBe(clusterId);
  });

  it("renames a cluster in the heading, relations and state", () => {
    const session = sessionWithTwoNodes();

    session.createClusterFromNodes(["n1"], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];

    session.addEdge(clusterId, "n2");

    session.renameCluster(clusterId, "Renamed");

    expect(session.state.clusters[clusterId]?.title).toBe("Renamed");
    expect(session.content).toContain("## Renamed");
    expect(session.content).not.toContain("## Group");
    expect(session.content).toContain("[[#Renamed]]");

    const reconciled = reconcileState(readState(session.content) ?? emptyState(), session.content);

    expect(reconciled.clusters[clusterId]?.title).toBe("Renamed");
  });

  it("sets and clears a cluster color, round-tripping through the codec", () => {
    const session = sessionWithTwoNodes();

    session.createClusterFromNodes(["n1"], "Group");
    const clusterId = Object.keys(session.state.clusters)[0];

    session.setClusterColor(clusterId, "var(--color-blue)");
    expect(session.state.clusters[clusterId]?.style?.color).toBe("var(--color-blue)");
    expect(readState(session.content)?.clusters[clusterId]?.style?.color).toBe("var(--color-blue)");

    session.setClusterColor(clusterId, null);
    expect(session.state.clusters[clusterId]?.style?.color).toBeUndefined();
  });

  it("keeps the state cluster layout but takes its title from the body", () => {
    const cluster = createCluster("Old title", { x: 10, y: 20, width: 500, height: 400 });
    let content = writeClusterSection(docWithNodes(), cluster, ["a"]);
    const base = readState(content);

    if (base === null) {
      throw new Error("expected a state block");
    }

    content = writeState(content, { ...base, clusters: { [cluster.id]: cluster } });
    content = content.replace("## Old title", "## New title");
    const reconciled = reconcileState(readState(content) ?? emptyState(), content);

    expect(reconciled.clusters[cluster.id]?.layout.width).toBe(500);
    expect(reconciled.clusters[cluster.id]?.title).toBe("New title");
  });
});
