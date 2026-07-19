import { CLUSTER_NODE_GAP, CLUSTER_PADDING, COLLAPSED_CLUSTER_HEIGHT } from "../constants";
import { arrangeClusterGrid, type ClusterArrangement } from "./clusterLayout";
import type { RoadmapEndpoint, RoadmapNode, RoadmapState } from "./types";

const LAYER_GAP = 120;

const SIBLING_GAP = 48;

/**
 * Result of an auto-layout pass. `nodePositions` are in each node's own layout space — absolute
 * for free nodes, cluster-relative for members (as `layout` already stores them).
 */
export interface AutoLayout {
  nodePositions: Record<string, { x: number; y: number }>;
  clusters: Record<string, { x: number; y: number; width: number; height: number }>;
}

interface Size {
  width: number;
  height: number;
}

interface Block extends Size {
  id: string;
  originalY: number;
}

/**
 * Layer index for each entity, one past its deepest predecessor; cyclic nodes fall back to
 * layer 0. Edges are assumed deduplicated and self-loop-free.
 */
function layerize(entityIds: readonly string[], edges: readonly { from: string; to: string }[]): Map<string, number> {
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const id of entityIds) {
    adjacency.set(id, []);
    indegree.set(id, 0);
  }

  for (const edge of edges) {
    const out = adjacency.get(edge.from);

    if (out === undefined || !indegree.has(edge.to)) {
      continue;
    }

    out.push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const layer = new Map<string, number>();
  const queue: string[] = [];

  for (const id of entityIds) {
    if ((indegree.get(id) ?? 0) === 0) {
      layer.set(id, 0);
      queue.push(id);
    }
  }

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    const currentLayer = layer.get(current) ?? 0;

    for (const next of adjacency.get(current) ?? []) {
      layer.set(next, Math.max(layer.get(next) ?? 0, currentLayer + 1));
      const remaining = (indegree.get(next) ?? 0) - 1;

      indegree.set(next, remaining);

      if (remaining === 0) {
        queue.push(next);
      }
    }
  }

  for (const id of entityIds) {
    if (!layer.has(id)) {
      layer.set(id, 0);
    }
  }

  return layer;
}

/** Compact grid arrangement for a cluster's members targeting a roughly square shape. */
function arrangeCompact(members: readonly RoadmapNode[]): ClusterArrangement | null {
  const columns = Math.ceil(Math.sqrt(members.length));
  const cellWidth = Math.max(...members.map((member) => member.layout.width));
  const baseWidth = CLUSTER_PADDING * 2 + columns * (cellWidth + CLUSTER_NODE_GAP);

  return arrangeClusterGrid(members, baseWidth);
}

interface ClusterFootprints {
  sizes: Map<string, Size>;
  memberPositions: Record<string, { x: number; y: number }>;
}

/**
 * Footprint of every cluster and cluster-relative grid positions for the members of expanded
 * ones. A collapsed cluster keeps its members and stored size; only its positioning height
 * shrinks to the pill.
 */
function clusterFootprints(state: RoadmapState): ClusterFootprints {
  const sizes = new Map<string, Size>();
  const memberPositions: Record<string, { x: number; y: number }> = {};

  for (const cluster of Object.values(state.clusters)) {
    const members = Object.values(state.nodes).filter((node) => node.clusterId === cluster.id);
    const arrangement = cluster.collapsed === true || members.length === 0 ? null : arrangeCompact(members);

    if (arrangement === null) {
      const height = cluster.collapsed === true ? COLLAPSED_CLUSTER_HEIGHT : cluster.layout.height;

      sizes.set(cluster.id, { width: cluster.layout.width, height });
      continue;
    }

    for (const [memberId, position] of arrangement.positions) {
      memberPositions[memberId] = position;
    }

    sizes.set(cluster.id, { width: arrangement.width, height: arrangement.height });
  }

  return { sizes, memberPositions };
}

/** The blocks laid out at the top level: free nodes and clusters (sized by their footprint). */
function topLevelBlocks(state: RoadmapState, footprints: Map<string, Size>): Block[] {
  const blocks: Block[] = [];

  for (const node of Object.values(state.nodes)) {
    if (node.clusterId == null) {
      blocks.push({ id: node.id, width: node.layout.width, height: node.layout.height, originalY: node.layout.y });
    }
  }

  for (const cluster of Object.values(state.clusters)) {
    const size = footprints.get(cluster.id) ?? { width: cluster.layout.width, height: cluster.layout.height };

    blocks.push({ id: cluster.id, width: size.width, height: size.height, originalY: cluster.layout.y });
  }

  return blocks;
}

/**
 * Directed edges between top-level entities. Each endpoint maps to its top-level entity (a
 * clustered node to its cluster); only `forward` links order the hierarchy, and self-loops,
 * duplicates and dangling endpoints are dropped.
 */
function topLevelEdges(state: RoadmapState, entityIds: ReadonlySet<string>): { from: string; to: string }[] {
  const toEntity = (endpoint: RoadmapEndpoint): string | null => {
    if (endpoint.type === "cluster") {
      return state.clusters[endpoint.id] === undefined ? null : endpoint.id;
    }

    const node = state.nodes[endpoint.id];

    return node === undefined ? null : (node.clusterId ?? node.id);
  };

  const edges: { from: string; to: string }[] = [];
  const seen = new Set<string>();

  for (const edge of Object.values(state.edges)) {
    if (edge.direction !== "forward") {
      continue;
    }

    const from = toEntity(edge.from);
    const to = toEntity(edge.to);

    if (from === null || to === null || from === to || !entityIds.has(from) || !entityIds.has(to)) {
      continue;
    }

    const key = `${from} ${to}`;

    if (!seen.has(key)) {
      seen.add(key);
      edges.push({ from, to });
    }
  }

  return edges;
}

/** Places blocks into left-to-right columns by layer, stacked vertically within a column. */
function placeByLayer(
  state: RoadmapState,
  blocks: readonly Block[],
  layer: Map<string, number>,
  footprints: Map<string, Size>,
): Pick<AutoLayout, "nodePositions" | "clusters"> {
  const nodePositions: AutoLayout["nodePositions"] = {};
  const clusters: AutoLayout["clusters"] = {};
  const byLayer = new Map<number, Block[]>();

  for (const block of blocks) {
    const index = layer.get(block.id) ?? 0;
    const column = byLayer.get(index) ?? [];

    column.push(block);
    byLayer.set(index, column);
  }

  let columnX = 0;

  for (const index of [...byLayer.keys()].sort((a, b) => a - b)) {
    const column = (byLayer.get(index) ?? []).sort((a, b) => a.originalY - b.originalY || (a.id < b.id ? -1 : 1));
    const columnWidth = Math.max(...column.map((block) => block.width));
    let y = 0;

    for (const block of column) {
      const x = columnX + (columnWidth - block.width) / 2;
      const cluster = state.clusters[block.id];

      if (cluster === undefined) {
        nodePositions[block.id] = { x, y };
      } else {
        const stored =
          cluster.collapsed === true
            ? { width: cluster.layout.width, height: cluster.layout.height }
            : (footprints.get(block.id) ?? { width: cluster.layout.width, height: cluster.layout.height });

        clusters[block.id] = { x, y, width: stored.width, height: stored.height };
      }

      y += block.height + SIBLING_GAP;
    }

    columnX += columnWidth + LAYER_GAP;
  }

  return { nodePositions, clusters };
}

/**
 * Tidies the whole board with a left-to-right layered layout: only `forward` edges shape the
 * hierarchy (undirected and bidirectional links connect without ordering), and each cluster is
 * laid out as one block. Layout only; membership and content are untouched.
 */
export function computeAutoLayout(state: RoadmapState): AutoLayout {
  const { sizes, memberPositions } = clusterFootprints(state);
  const blocks = topLevelBlocks(state, sizes);

  if (blocks.length === 0) {
    return { nodePositions: {}, clusters: {} };
  }

  const entityIds = new Set(blocks.map((block) => block.id));
  const layer = layerize([...entityIds], topLevelEdges(state, entityIds));
  const placed = placeByLayer(state, blocks, layer, sizes);

  return { nodePositions: { ...memberPositions, ...placed.nodePositions }, clusters: placed.clusters };
}
