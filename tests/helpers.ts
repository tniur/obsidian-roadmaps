import { nanoid } from "nanoid";
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "../src/constants";
import type { RoadmapCluster, RoadmapEdge, RoadmapLayout, RoadmapNode, RoadmapState } from "../src/domain/types";
import { emptyState, readState, renderStateDocument } from "../src/state/document";
import { RoadmapSession } from "../src/state/session";

type NodeOverrides = Partial<Omit<RoadmapNode, "layout">> & { layout?: Partial<RoadmapLayout> };

/**
 * A valid note node with default geometry; override any field. A non-note `kind` needs a
 * matching `source`. `layout` is merged over the default box, so `{ x, y }` keeps the default size.
 */
export function makeNode(overrides: NodeOverrides = {}): RoadmapNode {
  const { layout, ...rest } = overrides;

  return {
    id: nanoid(),
    kind: "note",
    source: { type: "note", file: "notes/a.md" },
    ...rest,
    layout: { x: 0, y: 0, width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT, ...layout },
  };
}

/**
 * Bare `RoadmapState` from the given entities, without rendering a document. For pure-function
 * tests that read state directly (progress, search) rather than through a session.
 */
export function makeState(
  nodes: readonly RoadmapNode[] = [],
  edges: readonly RoadmapEdge[] = [],
  clusters: readonly RoadmapCluster[] = [],
): RoadmapState {
  const state = emptyState();

  for (const node of nodes) {
    state.nodes[node.id] = node;
  }

  for (const edge of edges) {
    state.edges[edge.id] = edge;
  }

  for (const cluster of clusters) {
    state.clusters[cluster.id] = cluster;
  }

  return state;
}

/**
 * Session pre-populated with the given entities. Content is rendered like a real document
 * (body blocks, `## Relations`, hidden state block) and the undo history starts empty, so the
 * given state is the baseline a first mutation undoes back to.
 */
export function sessionWith(
  nodes: readonly RoadmapNode[] = [],
  edges: readonly RoadmapEdge[] = [],
  clusters: readonly RoadmapCluster[] = [],
): RoadmapSession {
  const state = makeState(nodes, edges, clusters);
  const content = renderStateDocument(state, "Board");

  return new RoadmapSession(readState(content) ?? state, content);
}

/** Empty session backed by a fresh roadmap document. */
export function newSession(): RoadmapSession {
  return sessionWith();
}
